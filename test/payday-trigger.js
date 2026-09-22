/* 发薪日触发审计（零依赖，Node 直跑）
   回答四个问题：
     ① 「到达发薪日」与「只是经过发薪日」是否都触发结算？
     ② 结算会不会重复、会不会遗漏？
     ③ 年龄（一轮 = 一年）与发薪（落格触发）两个时钟是否对齐？
     ④ 边界：一回合经过多个发薪日、还清贷款、入不敷出、出圈、暂停回合。
     ⑤ 「经过但未停留」时是否给出即时提示，且与「停在结算格」「纯入不敷出」
        两种由弹层通知的情形互斥而不重复。

   运行：node test/payday-trigger.js      退出码 0 = 全部通过

   ⚠️ 本脚本第 ⑧ 节会把「两个时钟不同步」与「暂停回合不结算」两条已知偏差
      以 ⚠️ 单独列出（不计入通过/失败），它们是【待决策项】而非已修复项：
      改动 SOLO / UNEMPLOYMENT / skipTurns / diceCount / 棋盘格型分布后必须重跑本脚本。 */

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + '/';

global.window = {};
for (const f of ['data-careers.js', 'data-board.js', 'data-cards-101.js', 'data-cards-202.js', 'engine.js', 'engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];

const E = global.Engine, A = global.Act;
const OUT = [];
let pass = 0, fail = 0;
const ok  = (c, m) => { if (c) { pass++; OUT.push('   ✅ ' + m); } else { fail++; OUT.push('   ❌ ' + m); } };
const warn = (m) => OUT.push('   ⚠️ ' + m);
const sec = (t) => OUT.push('', '=== ' + t + ' ===');
const money = (n) => '¥' + Math.round(n).toLocaleString('en-US');
const fin = (v) => typeof v === 'number' && isFinite(v);

/* ---------------- 通用：一局 AI ---------------- */
let seed = 20260920;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

/* newGame 内部用 Math.random() 洗牌分职业 —— 只给 seed 并不能让【职业】可复现。
   涉及数值断言的地方必须显式指定职业，否则会出现「同一份代码有时通过、有时不通过」，
   而失败的那次其实只是分到了另一个职业。 */
function fixCareer(g, name){
  const p = g.players[0];
  const c = window.CAREERS.filter(x => x.name === name)[0];
  if(!c) return p;
  p.job = c; p.baseSalary = c.salary;
  p.liabs = Object.assign({ home:0, school:0, car:0, credit:0, bank:0, other:0, extraPay:0 }, c.liab);
  p.loans = null; E.ensureLoans(p); E.refreshLife(g, p);
  p.cash = E.finance(p).cashflow + c.savings;
  return p;
}

/* 统计：因为授信上限而借不到钱的次数（这是新规则的核心行为，值得单独计数） */
let seenLoanReject = 0;
/* 失业是一次收入突变，引擎会在切换状态前先把未结算周期结清（settleAtBreak）。
   这段年份不走 movePlayer，所以必须单独累加 —— 否则覆盖率会被低估。 */
let seenBreakYears = 0;
function handlePending(g, p) {
  let guard = 0;
  while (g.pending && guard++ < 60) {
    const P = g.pending;
    switch (P.type) {
      case 'deficit': {
        let r = A.payDeficit(g, P.amount);
        if (!r.ok) {
          /* 真实路径：按【可借额度】借满，而不是「想要一个整数」——
             信用贷有了上限之后，旧写法必然被拒，等于把 AI 一步逼到破产。 */
          const prof = E.creditProfile(g, p);
          const take = Math.min(Math.max(1000, Math.ceil((r.shortfall || 0) / 1000) * 1000),
                                prof ? prof.available : 0);
          if (take > 0) A.takeLoan(g, take);
          r = A.payDeficit(g, P.amount);
        }
        if (!r.ok) { seenLoanReject++; E.declareBankruptcy(g, p); E.clearPending(g); return; }
        const L = P.landed;
        E.clearPending(g);
        if (L) E.resolveSpace(g, p, Object.assign({}, L, { deficit: 0 }));
        break;
      }
      case 'opportunity': case 'opportunity202': {
        let d = P.deal;
        if (!d) {
          const dk = P.choices || (g.rule === '202' ? ['capgain', 'cashflow'] : ['small', 'big']);
          const r = A.chooseDeck(g, dk[Math.floor(rnd() * dk.length)]);
          if (r && r.ok) d = r.card;
        }
        if (d && p.cash > 8000 && p.energy > 40 && rnd() < 0.7) A.buyDeal(g, d, d.min || 1);
        E.clearPending(g);
        break;
      }
      case 'charity': A.doCharity(g, rnd() < 0.4); E.clearPending(g); break;
      case 'rest': if (p.energy < 40 && p.cash > 5000) A.vacation(g); E.clearPending(g); break;
      case 'downsized': {
        const r = A.doDownsized(g, P.amount);
        if (r && r.brk) seenBreakYears += r.brk.years;
        E.clearPending(g);
        break;
      }
      case 'doodad': {
        let r = A.payDoodad(g, P.card, P.cost);
        if (!r.ok) {
          const prof = E.creditProfile(g, p);
          const take = Math.min(Math.max(1000, Math.ceil((r.shortfall || 0) / 1000) * 1000),
                                prof ? prof.available : 0);
          if (take > 0) A.takeLoan(g, take);
          r = A.payDoodad(g, P.card, P.cost);
        }
        if (!r.ok) E.declareBankruptcy(g, p);
        E.clearPending(g);
        break;
      }
      case 'baby': A.addBaby(g); break;
      default: E.clearPending(g); break;
    }
  }
}

/* ---------------- ① 棋盘构成 ---------------- */
sec('① 棋盘构成：发薪日 / 分红日的密度（决定触发频率的上限）');
const payIn = window.RAT_RACE.map((s, i) => s.t === 'paycheck' ? i : -1).filter(i => i >= 0);
const payFt = window.FAST_TRACK.map((s, i) => s.t === 'cashflowday' ? i : -1).filter(i => i >= 0);
const RING = E.RING_LEN;
ok(payIn.length > 0 && payFt.length > 0, `内圈发薪日 ${payIn.length} 个（位置 ${payIn.join(',')}）· 外圈分红日 ${payFt.length} 个`);
ok(window.RAT_RACE.length === RING && window.FAST_TRACK.length === RING,
   `两条环长度都等于 RING_LEN = ${RING}（pathBetween 用的是同一个常量）`);

const g0 = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 1 });
const g1 = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 1 });
const innerDice = E.diceCount(g0, g0.players[0]);
g1.players[0].inFT = true;
const ftDice = E.diceCount(g1, g1.players[0]);
ok(innerDice === 1 && ftDice === 2, `骰子数：内圈 ${innerDice} 粒 → 期望 ${innerDice * 3.5} 格；外圈 ${ftDice} 粒 → 期望 ${ftDice * 3.5} 格`);
const perRoundIn = payIn.length / (RING / (innerDice * 3.5));
const perRoundFt = payFt.length / (RING / (ftDice * 3.5));
OUT.push(`   · 内圈：每轮经过发薪日 ${perRoundIn.toFixed(3)} 次 → 约 ${(RING / (innerDice * 3.5)).toFixed(1)} 轮走一圈`);
OUT.push(`   · 外圈：每轮经过分红日 ${perRoundFt.toFixed(3)} 次 → 约 ${(RING / (ftDice * 3.5)).toFixed(1)} 轮走一圈`);
  warn(`出圈后的结算频率是内圈的 ${(perRoundFt / perRoundIn).toFixed(2)} 倍 —— 外圈 4 个分红日 + 2 粒骰子，`);
  warn('   同一年里第 2 次踩到分红日会因「本年已结」而略过，不会多发钱。');

/* ---------------- ②③④ 到达 / 经过 / 重复 ---------------- */
sec('② 到达触发：落在发薪日上');
{
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 7 });
  const p = g.players[0];
  p.pos = payIn[0] - 1 >= 0 ? payIn[0] - 1 : RING - 1;          // 停在发薪日前一格
  const before = p.cash;
  const ld = E.movePlayer(g, p, 1);                              // 走 1 步 → 正好落在发薪日
  ok(ld.space.t === 'paycheck', `落格格型是发薪日（路径 ${JSON.stringify(ld.path)}）`);
  ok(!!ld.settled && ld.settled.count === 1, `触发结算 1 次（settled.count = ${ld.settled && ld.settled.count}）`);
  const exp = E.annual(E.finance(p).cashflow);
  ok(p.cash - before === ld.collected && ld.collected === ld.settled.amount,
     `现金变化 ${money(p.cash - before)} === 引擎 collected ${money(ld.collected)}（该年结余 ${money(exp)}）`);
  const P = E.resolveSpace(g, p, ld);
  const shown = String(P.msg).match(/¥[\d,]+/);
  ok(shown && shown[0] === money(ld.collected),
     `弹层金额与实扣同源：弹层「${shown && shown[0]}」vs 实发 ${money(ld.collected)}`);
}

sec('③ 经过触发：路径穿过发薪日但没停在那');
{
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 11 });
  const p = g.players[0];
  // 从 payIn[0]-2 走 3 步 → 穿过 payIn[0] 并停在其后一格
  const from = (payIn[0] - 2 + RING) % RING;
  p.pos = from;
  const before = p.cash;
  const ld = E.movePlayer(g, p, 3);
  const hit = ld.path.filter(ix => window.RAT_RACE[ix].t === 'paycheck').length;
  ok(hit === 1 && ld.space.t !== 'paycheck',
     `路径 ${JSON.stringify(ld.path)} 穿过 1 个发薪日、落点不是发薪日`);
  ok(ld.settled && ld.settled.count === 1, `经过也触发结算（count = ${ld.settled && ld.settled.count}）`);
  ok(p.cash - before === ld.collected, `现金变化 ${money(p.cash - before)} 与 collected 一致`);
}

sec('④ 重复结算检测：落格不会被结算两次');
{
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 13 });
  const p = g.players[0];
  p.pos = (payIn[0] - 1 + RING) % RING;
  const cash0 = p.cash;
  const debt0 = E.LOAN_KEYS.reduce((s, k) => s + E.loanInfo(p, k).balance, 0);
  const active = E.LOAN_KEYS.filter(k => E.loanInfo(p, k).balance > 0);
  const per0 = active.map(k => E.loanInfo(p, k).periods);
  const ld = E.movePlayer(g, p, 1);
  const debt1 = E.LOAN_KEYS.reduce((s, k) => s + E.loanInfo(p, k).balance, 0);
  const per1 = active.map(k => E.loanInfo(p, k).periods);
  const eachYear = per1.every((v, i) => v - per0[i] === 12);
  ok(p.cash - cash0 === ld.collected, `现金只增加一次（${money(p.cash - cash0)}）`);
  ok(eachYear && active.length > 0,
     `${active.length} 笔在贷负债【每笔】各摊还 12 期（合计 ${per1.reduce((a,b)=>a+b,0) - per0.reduce((a,b)=>a+b,0)} 期），没有一笔被重复摊还`);
  ok(debt1 < debt0, `负债同步下降 ${money(debt0)} → ${money(debt1)}`);
  const P = E.resolveSpace(g, p, ld);
  ok(P.type === 'info', `落格弹层是纯提示（type = ${P.type}，不再次入账）`);
}

sec('⑤ 不遗漏：路径命中的每一次都记账');
{
  seed = 20260920;
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['甲'], seed: 20260920 });
  const p = g.players[0];
  let turns = 0, moves = 0, pathHits = 0, settledHits = 0, mismatch = 0, negCash = 0, nanCash = 0;
  let arrive = 0, passOnly = 0, multi = 0;
  while (!g.over && turns < 400) {
    turns++;
    const cur = E.current(g);
    if (!cur || cur.out) { E.nextPlayer(g); continue; }
    handlePending(g, cur);
    if (!cur.pausedThisTurn) {
      const n = E.diceCount(g, cur);
      const d = E.rollDice(g, n);
      const ld = E.movePlayer(g, cur, d.reduce((a, b) => a + b, 0));
      const ring = cur.inFT ? window.FAST_TRACK : window.RAT_RACE;
      const kind = cur.inFT ? 'cashflowday' : 'paycheck';
      const hits = ld.path.filter(ix => ring[ix].t === kind).length;
      const onKind = ring[ld.to].t === kind;
      if (hits > 0) { if (onKind) arrive++; else passOnly++; if (hits > 1) multi++; }
      pathHits += hits;
      settledHits += (ld.settled ? ld.settled.count : 0);
      if (hits !== (ld.settled ? ld.settled.count : 0)) mismatch++;
      moves++;
      E.resolveSpace(g, cur, ld);
      handlePending(g, cur);
    }
    E.endTurn(g);
    if (cur.cash < 0) negCash++;
    if (!fin(cur.cash)) nanCash++;
  }
  OUT.push(`   · ${moves} 次移动，路径命中发薪日 ${pathHits} 次，结算记录 ${settledHits} 次，对局结束于第 ${g.round} 轮`);
  OUT.push(`   · 其中【到达】触发 ${arrive} 次、【仅经过】触发 ${passOnly} 次、一次经过多个 ${multi} 次`);
  ok(arrive > 0 && passOnly > 0, `两种情形都真实发生过（到达 ${arrive} 次 / 仅经过 ${passOnly} 次）`);
  ok(mismatch === 0, `每一次路径命中都有对应的结算记录（不一致 ${mismatch} 次）`);
  ok(pathHits === settledHits, `命中数 === 结算数（${pathHits} vs ${settledHits}）—— 不重复、不遗漏`);
  ok(negCash === 0, `全程现金非负（越界 ${negCash} 次）`);
  ok(nanCash === 0, `全程现金是有限数值（NaN ${nanCash} 次）`);
}

/* ---------------- ⑥⑦ 边界：一回合经过多个 ---------------- */
sec('⑥ 边界：一回合经过 ≥2 个发薪日');
{
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 17 });
  const p = g.players[0];
  p.pos = (payIn[1] - 1 + RING) % RING;      // 从 9 出发（payIn = 2/10/18，等距 8 格）
  const steps = payIn[2] - p.pos;            // 走到第二个发薪日
  const before = p.cash;
  const ld = E.movePlayer(g, p, steps);
  ok(ld.settled.count === 2, `路径命中了 ${ld.settled.count} 个发薪日（路径 ${JSON.stringify(ld.path)}）`);
  /* ★ 新局第 1 轮：积欠只有 1 年 → 第 1 个发薪日结掉今年，第 2 个因本年已结而略过。
     （积欠充足时跨 2 个就结 2 年 —— 那是 ⑪ 段的场景；本段验证的是「无积欠不多发」。） */
  ok(ld.settled.yearsPaid === 1 && ld.settled.skipped === 1,
     `积欠仅 1 年 → 结 1 年、略过 ${ld.settled.skipped} 个（不给还没活过的年份发薪）`);
  ok(p.cash - before === ld.settled.amount,
     `入账 ${money(ld.settled.amount)} 与现金变化一致`);
  const P = E.resolveSpace(g, p, ld);
  ok(P.msg.indexOf('因本年已结而略过') >= 0 && P.msg.indexOf('经过 2 个') >= 0,
     `弹层说清「踩到了但本年已结」，不会让玩家以为漏发：「${P.msg}」`);
}

sec('⑦ 边界：单回合最多能经过几个发薪日（枚举全部起止位置）');
{
  let maxIn = 0, maxFt = 0, worstIn = null, worstFt = null;
  for (let from = 0; from < RING; from++) {
    for (let steps = 1; steps <= (window.WINGS.dice * 6); steps++) {   // 银翅膀骰子的数学上界
      const to = (from + steps) % RING;
      const pth = [];
      { let i = from, guard = 0; do { i = (i + 1) % RING; pth.push(i); guard++; } while (i !== to && guard < 60); }
      const a = pth.filter(ix => window.RAT_RACE[ix].t === 'paycheck').length;
      /* 外圈只掷 2 粒骰子（≤12 步），外圈上界按 12 步算；
         枚举上界现在也是 12 步（银翅膀 = 2 粒），两者恰好一致。 */
      const b = steps <= 12 ? pth.filter(ix => window.FAST_TRACK[ix].t === 'cashflowday').length : 0;
      if (a > maxIn) { maxIn = a; worstIn = { from, steps, to }; }
      if (b > maxFt) { maxFt = b; worstFt = { from, steps, to }; }
    }
  }
  /* 独立核对：路径的最后一个元素必须就是落点（否则「到达」会被漏掉） */
  let pathOk = true;
  for (let from = 0; from < RING; from++) {
    for (let steps = 1; steps <= 18; steps++) {
      const to = (from + steps) % RING;
      let i = from, last = -1, guard = 0;
      do { i = (i + 1) % RING; last = i; guard++; } while (i !== to && guard < 60);
      if (last !== to) pathOk = false;
    }
  }
  ok(pathOk, '全部 24×18 = 432 种走法中，路径末元素都等于落点 —— 「到达」不会被漏掉');

  /* 1 粒骰子（常态）的上界单独算：最多走 6 步 */
  let max1 = 0;
  for (let from = 0; from < RING; from++) {
    for (let steps = 1; steps <= 6; steps++) {
      const to = (from + steps) % RING;
      let i = from; const pth = []; let guard = 0;
      do { i = (i + 1) % RING; pth.push(i); guard++; } while (i !== to && guard < 60);
      max1 = Math.max(max1, pth.filter(ix => window.RAT_RACE[ix].t === 'paycheck').length);
    }
  }
  /* ★ 等距棋盘（发薪日 2/10/18，间隔 8 格）的结构性保证：
     8 > 6 → 单粒骰子（常态）永远跨不过第 2 个发薪日。 */
  ok(max1 === 1, `常态（1 粒骰子，≤6 步）单回合最多经过 ${max1} 个发薪日 —— 间隔 8 格 > 骰子上限 6 步`);
  ok(maxIn === 2, `2 粒骰子（银翅膀，≤12 步）单回合最多经过 ${maxIn} 个发薪日（最坏：从 ${worstIn && worstIn.from} 出发走 ${worstIn && worstIn.steps} 步；跨 3 个需 ≥17 步，已超出骰程）`);
  ok(maxFt === 2, `外圈（2 粒骰子，≤12 步）最多经过 ${maxFt} 个分红日（从 ${worstFt && worstFt.from} 走 ${worstFt && worstFt.steps} 步）`);
  ok(12 < RING, `2 粒骰上限 12 步 < 环长 ${RING} → 一回合不可能绕满一圈，同一格不会被重复经过`);
  warn('但若将来加大骰子上限（如 4 粒 = 24 步），会绕满整圈、同一发薪日被结算两次；');
  warn('   pathBetween 的 guard 是 60、movePlayer 无重复保护，届时必须先改这两处。');
}

/* ---------------- ⑧ 年龄递增时机 ---------------- */
sec('⑧ 年龄递增时机 + 结算覆盖率（每格 1 年：积欠由突变点 / 终局兜底）');
{
  seed = 20260920;
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['甲'], seed: 20260920 });
  /* 固定职业：本段断言的是「覆盖率」这种数值口径，不能让职业成为变量
     （newGame 内部用 Math.random 分职业，只给 seed 并不能复现职业）。 */
  const p = fixCareer(g, '软件工程师');
  const ageAtSettle = [];
  let turns = 0, ageTicks = 0, settleCount = 0, skipped = 0, ageDuringMove = 0, settleTurns = 0;
  seenBreakYears = 0;   /* 从零开始累计（在 handlePending 的 downsized 分支里累加） */
  while (!g.over && turns < 400) {
    turns++;
    const cur = E.current(g);
    if (!cur || cur.out) { E.nextPlayer(g); continue; }
    handlePending(g, cur);
    /* 失业后必须求职 —— 漏掉这一步会让 AI 永久停在求职期（工资归零、支出照付），
       于是「第 4 轮就破产」，而那不是产品的问题，是测试脚本的缺陷。 */
    if (E.isJobless(cur) && cur.energy >= 12) A.huntJob(g);
    if (!cur.pausedThisTurn) {
      const n = E.diceCount(g, cur);
      const d = E.rollDice(g, n);
      const ageBefore = E.ageOf(g);
      const ld = E.movePlayer(g, cur, d.reduce((a, b) => a + b, 0));
      /* 关键断言素材：移动（含发薪结算）过程中年龄必须【完全不变】 */
      if (E.ageOf(g) !== ageBefore) ageDuringMove++;
      /* ⚠️ 累加的是【结算年数】yearsPaid，不是 count —— count 是「路径命中的格数」，
         含被略过的那些。每格 1 年下两者接近（积欠被略过消耗），但语义不同。 */
      if (ld.settled) { settleCount += ld.settled.yearsPaid; settleTurns++; ageAtSettle.push(E.ageOf(g)); }
      E.resolveSpace(g, cur, ld);
      handlePending(g, cur);
    } else { skipped++; }
    const roundBefore = g.round;
    E.endTurn(g);                              /* ← 年龄只可能在这里推进 */
    if (g.round > roundBefore) ageTicks++;
  }
  const years = E.maxRounds(g);
  OUT.push(`   · 一生 ${years} 年：年龄推进 ${ageTicks} 次、发薪结算 ${settleTurns} 次（合计 ${settleCount} 年）、暂停回合 ${skipped} 次`);
  ok(ageTicks === years, `年龄推进 ${ageTicks} 次 === 局长度 ${years} 年（一轮 = 一年，时机在 endTurn → nextPlayer）`);
  ok(ageDuringMove === 0, `移动与发薪结算过程中年龄从未变化（越界 ${ageDuringMove} 次）—— 发薪日不推进年龄`);
  ok(settleTurns === ageAtSettle.length,
     `结算记账完整：${settleTurns} 个结算回合共 ${settleCount} 年`);
  /* ★ 每格 1 年的核心验收：一生没有任何一年被漏结。
     发薪日只结约 20 年，其余积欠由失业 / 退休突变点与终局结清 ——
     走完全程时 settledAge 已被终局结清推到终龄，直接用它核算；
     中途出局（破产）不做终局结清，只核发薪 + 失业突变点那部分。 */
  const finished = !p.out;
  const settledAll = finished
    ? p.settledAge - (g.startAge - 1)
    : settleCount + seenBreakYears;
  const coverage = settledAll / years;
  const minCoverage = finished ? 0.95 : 0.5;
  ok(coverage >= minCoverage,
     `结算覆盖率 ${(coverage * 100).toFixed(1)}%（${finished ? '走完全程，终局结清后 settledAge=' + p.settledAge : '中途出局'}，`
     + `一生 ${years} 年共结算 ${settledAll} 年 = 发薪 ${settleCount} + 突变点 / 终局 ${settledAll - settleCount}）`
     + `—— 门槛 ${(minCoverage * 100).toFixed(0)}%`);
  warn(`发薪时刻的年龄：${ageAtSettle.join(', ')}`);
  warn('  · 没踩到发薪日的年份靠「积欠 → 突变点 / 终局结清」兜底，不丢年（⑯ 段逐区间核验）。');
  warn('  ⚠️ 别再让发薪日推进年龄：一生只有约 19 次发薪，45 轮下来只活到 39 岁，65 岁退休判定立刻失效。');
}

/* ---------------- ⑨ 入不敷出路径的金额也一致 ---------------- */
sec('⑨ 边界：入不敷出（负结余年份）的弹层');
{
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 7 });
  const p = g.players[0];
  p.cash = 0; p.liabs.bank = 999999; p.loans = null; E.ensureLoans(p);
  p.pos = (payIn[0] - 1 + RING) % RING;
  const ld = E.movePlayer(g, p, 1);
  ok(ld.deficit > 0 && ld.collected === 0, `年度结余为负 → 记缺口 ${money(ld.deficit)}，不写现金`);
  ok(p.cash >= 0, `现金没有被扣成负数（${money(p.cash)}）`);
  const P1 = E.resolveSpace(g, p, ld);
  ok(P1.type === 'deficit', `先弹「入不敷出」面板（type = ${P1.type}）`);
  const P2 = E.resolveSpace(g, p, Object.assign({}, ld, { deficit: 0 }));
  ok(P2.type === 'info' && P2.msg.indexOf(money(ld.deficit)) >= 0,
     `补完后回到发薪日提示，且金额与刚才的缺口同源：「${P2.msg}」`);
  ok(ld.settled && ld.settled.deficit === ld.deficit, 'settled 摘要穿过「入不敷出」流程后仍在（弹层不丢信息）');
}

/* ---------------- ⑩ 出圈后不触发内圈发薪 ---------------- */
sec('⑩ 边界：出圈后的年结算（分红日）同口径');
{
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 19 });
  /* 指定一个低支出职业：本段要验证「分红日按自由圈账本结算」，
     若随机到高支出职业，分红会被支出吃光而变成缺口，测的就不是原意了。 */
  const p = fixCareer(g, '小区保安');
  p.inFT = true; p.ftPos = 0;
  p.assets.ftBusiness.push({ nm: '测试企业', cost: 100000, cf: 5000 });
  const before = p.cash;
  const ld = E.movePlayer(g, p, 1);            // 外圈 index 1 = 分红日
  ok(ld.space.t === 'cashflowday', `落点是分红日（${ld.space.t}）`);
  ok(ld.settled && ld.settled.count === 1, `分红日同样触发结算 1 次`);
  /* ★ 口径已改：自由圈不再是「只发钱」—— 分红要减去自由圈生活支出与仍在还的贷款。
     旧断言写的是 annual(ftMonthly)，那是「毛分红」，没有支出侧。
     ⚠️ 结余为负时 collected 记 0、缺口走 deficit（与内圈同规则），
        所以期望值要分正负两种情形，不能无条件写 annual(cashflow)。 */
  const ft = E.ftFinance(p);
  const wantCollected = ft.cashflow >= 0 ? E.annual(ft.cashflow) : 0;
  ok(ld.collected === wantCollected,
     `入账 = 年度结余 ${money(ld.collected)}（= (月分红 ${money(ft.income)}`
     + ` − 自由圈支出 ${money(ft.expense)}) × 12${ft.cashflow < 0 ? '，为负故记 0 并转为缺口' : ''}）`);
  ok(ft.cashflow >= 0 || ld.deficit > 0,
     ft.cashflow >= 0 ? '分红足以覆盖自由圈支出（本年有结余入账）'
                      : `分红不足以覆盖支出 → 记为缺口 ${money(ld.deficit)}（走统一处理面板）`);
  ok(p.cash - before === ld.collected, `现金变化与 collected 一致`);
  ok(ld.path.every(ix => window.FAST_TRACK[ix].t !== 'paycheck'),
     '外圈路径不会误触发内圈的“发薪日”格型（两条环的格型不重叠）');
  const P = E.resolveSpace(g, p, ld);
  /* 有结余时是「分红日」提示；有缺口时先走「入不敷出」面板（这是刻意的：钱的问题优先） */
  const expectTitle = E.ftFinance(p).cashflow >= 0 ? '分红日' : '入不敷出';
  ok(P.title === expectTitle,
     `弹层标题与账本一致：「${P.title}」（自由圈不叫「发薪日」）`);
  if(expectTitle === '入不敷出'){
    warn('   · 本次分红不足以覆盖自由圈支出，先走「入不敷出」面板 —— 这正是「顺流层也会破产」的入口');
  }
}

/* ---------------- ⑪ 边界：同一回合两笔结算金额可能不同 ---------------- */
sec('⑪ 边界：积欠充足时跨 2 个发薪日 → 各结 1 年，且两笔金额可能不同');
{
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 23 });
  const p = g.players[0];
  p.liabs.home = 500; E.ensureLoans(p);         // 房贷只剩一点点 → 第 1 笔摊还就会还清
  E.refreshLife(g, p);
  g.round = 8; E.refreshLife(g, p);             // 推到 27 岁
  p.settledAge = g.startAge - 1;                // 但账还停在 19 岁 → 积欠 8 年（≥ 2）
  const before = p.cash;
  /* 从 1 走 10 步：路径 2..11，跨过发薪日 2 和 10，落在 11（非结算格，走提示路径） */
  p.pos = 1;
  const ld = E.movePlayer(g, p, 10);
  ok(ld.settled.count === 2 && ld.settled.yearsPaid === 2 && ld.settled.skipped === 0,
     `跨 2 个发薪日 → 结 2 年（每格各结 1 年，一个不略过；实际 count=${ld.settled.count} yearsPaid=${ld.settled.yearsPaid}）`);
  const paid = ld.settled.years.filter(y => y.years > 0);
  ok(paid.length === 2 && paid.every(y => y.years === 1),
     `两笔各恰好 1 年，结的是最旧的连续年份：第 ${paid.map(y => y.since + 1).join('、')} 岁`);
  ok(paid[0].monthly !== paid[1].monthly,
     `两笔的月结余不同：${money(paid[0].monthly)} → ${money(paid[1].monthly)}（第 1 笔摊还还清了房贷，月供从支出里消失）`);
  ok(ld.settled.amount === E.annual(paid[0].monthly) + E.annual(paid[1].monthly),
     `入账 = 两笔之和 ${money(E.annual(paid[0].monthly))} + ${money(E.annual(paid[1].monthly))} = ${money(ld.settled.amount)}（不是「单年 × 2」）`);
  ok(p.cash - before === ld.settled.amount, `现金变化与合计一致`);
  ok(E.loanInfo(p, 'home').balance === 0, `第 1 笔摊还后房贷已结清（剩余 ${E.loanInfo(p, 'home').balance}）`);
  ok(p.settledAge === g.startAge + 1 && ld.settled.arrears === 6,
     `settledAge 只推进 2 年（19 → ${p.settledAge}），剩 6 年积欠留给后续发薪日`);
  const n = E.paydayNoticeOf(g, ld, false);
  ok(n && n.count === 2 && n.years === 2 && n.skipped === 0,
     `提示数据如实汇报「经过 2 个、结了 2 年」`);
}

/* ---------------- ⑫ 长局：4 人局各玩家的结算次数 ---------------- */
sec('⑫ 边界：同局不同玩家的结算次数（同龄不同命）');
{
  seed = 20260920;
  const g = E.newGame({ rule: '101', count: 4, names: ['甲', '乙', '丙', '丁'], seed: 20260920 });
  const cnt = {}, movesOf = {};
  let turns = 0;
  while (!g.over && turns < 3000) {
    turns++;
    const p = E.current(g);
    if (!p || p.out) { E.nextPlayer(g); continue; }
    handlePending(g, p);
    if (E.isJobless(p) && p.energy >= 12) A.huntJob(g);
    if (!p.pausedThisTurn) {
      const n = E.diceCount(g, p);
      const d = E.rollDice(g, n);
      const ld = E.movePlayer(g, p, d.reduce((a, b) => a + b, 0));
      if (ld.settled) cnt[p.name] = (cnt[p.name] || 0) + ld.settled.count;
      movesOf[p.name] = (movesOf[p.name] || 0) + 1;
      E.resolveSpace(g, p, ld);
      handlePending(g, p);
    }
    E.endTurn(g);
  }
  const vals = g.players.map(p => cnt[p.name] || 0);
  OUT.push('   · ' + g.players.map(p => `${p.name}: 移动 ${movesOf[p.name] || 0} 次 / 结算 ${cnt[p.name] || 0} 年`).join(' | '));
  ok(vals.every(v => v > 0), '每位玩家都至少结算过若干年（没有人为零）');
  ok(Math.max(...vals) - Math.min(...vals) > 0,
     `各玩家结算年数并不相同（差 ${Math.max(...vals) - Math.min(...vals)} 年）—— 年龄同步、账目各走各的`);
  warn('这是「结算由落格抽签决定」的必然结果：同龄人因为掷骰运气不同，一生的收入结算次数不同。');
}

/* ---------------- ⑬ 暂停回合（已知偏差，不计入通过/失败） ---------------- */
sec('⑬ 已知偏差：暂停回合（失业休养 / 健康危机）的年度结算');
{
  const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 29 });
  const p = g.players[0];
  p.skipTurns = 2;
  p.pos = 1;
  const cash0 = p.cash;
  const per0 = E.LOAN_KEYS.reduce((s, k) => s + E.loanInfo(p, k).periods, 0);
  E.nextPlayer(g);                                    // 触发 markTurnPause（单人局 → 回到自己）
  const paused = p.pausedThisTurn;
  ok(paused === true, '暂停回合被正确标记（pausedThisTurn = true）');
  const per1 = E.LOAN_KEYS.reduce((s, k) => s + E.loanInfo(p, k).periods, 0);
  warn(`暂停回合既【不结算收入】也【不摊还负债】：期数 ${per0} → ${per1}，现金未变 ${money(p.cash - cash0)}`);
  warn('   但年龄照常 +1（年龄在 nextPlayer 里按整圈推进）—— 时间在走、账不走。');
  warn('   方向还不一致：结余为正时这是罚（白丢一年收入），结余为负时这是赏（白免一年支出）；');
  warn('   而「失业 → 休养 2 回合」恰好落在后者，等于把失业惩罚抵掉了一部分。');
  warn('   ⚠️ 待决策：暂停是否应该照常结算（若照常，需要为暂停回合补一条入不敷出的弹层路径）。');
}

/* ---------------- ⑭ 无限模式 ---------------- */
sec('⑭ 边界：无限模式的年龄');
{
  const g = E.newGame({ rule: '101', mode: 'endless', count: 2, names: ['甲', '乙'], seed: 3 });
  ok(E.isAgeMode(g) === false, '无限模式不被判定为年龄制（不会触发 65 岁退休结算）');
  g.round = 80;
  ok(E.ageOf(g) === 99, `round = 80 时 ageOf 仍会算出 ${E.ageOf(g)} 岁（表观年龄会一直涨下去）`);
  warn('界面已用 isAgeMode 屏蔽了年龄显示（只显示轮次），所以不会露出 99 岁；');
  warn('   但 refreshLife 仍按年龄取曲线 —— SALARY_CURVE / LIFE_STAGES 的最后一档是 to:200，');
  warn('   所以 66 岁之后收入与支出结构会永久停在「职场后期」这一档。属可接受的建模截断。');
}

/* ---------------- ⑮ 发薪提示（经过结算格但未停留） ---------------- */
sec('⑮ 发薪提示：经过结算格（未停留）时的即时通知');
{
  /* ★ 这条提示只覆盖【经过但未停留】这一种情形：
       停在结算格时 resolveSpace 会弹出完整的确认面板（结算年数 / 金额 / 略过次数），
       纯入不敷出时则会先弹入不敷出面板 —— 两者都比一条提示说得更清楚，
       再叠一条就是同一件事说两遍。下面把四种情形逐一钉住。 */

  /* ① 经过发薪日、落在别的格 → 应提示，且金额与实发同源 */
  {
    const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 20260920 });
    const p = fixCareer(g, '软件工程师');
    p.settledAge = g.startAge - 1;
    p.pos = (payIn[0] - 1 + RING) % RING;          /* 发薪日前一格 */
    const ld = E.movePlayer(g, p, 2);              /* 走 2 步：经过发薪日，落在它后一格 */
    ok(ld.path[0] === payIn[0] && ld.space.t !== 'paycheck',
       `构造正确：路径 ${JSON.stringify(ld.path)} 穿过发薪日（${payIn[0]}）但落在「${ld.space.t}」`);
    const n = E.paydayNoticeOf(g, ld, p.inFT);
    ok(!!n, '经过发薪日 → 产生了提示数据');
    ok(n && n.kind === 'paid', `kind = ${n && n.kind}（确实发了钱）`);
    /* 金额必须与实发同源：界面不再自己算，否则迟早出现「提示写 ¥674、到账 ¥8,088」 */
    ok(n && n.amount === ld.collected && n.amount > 0,
       `提示金额 ${money(n && n.amount)} 与实发入账 ${money(ld.collected)} 同源`);
    ok(n && n.since + n.years === n.age,
       `年龄自洽：自 ${n && n.since} 岁结到 ${n && n.age} 岁（覆盖 ${n && n.years} 年）`);
    ok(n && n.count === 1 && n.skipped === 0,
       `本回合经过 ${n && n.count} 个发薪日、无略过（提示不需要解释「略过」）`);
  }

  /* ② 停在发薪日格 → 不提示（交给确认面板） */
  {
    const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 20260920 });
    const p = fixCareer(g, '软件工程师');
    p.settledAge = g.startAge - 1;
    p.pos = (payIn[0] - 1 + RING) % RING;
    const ld = E.movePlayer(g, p, 1);              /* 走 1 步：停在发薪日 */
    ok(ld.space.t === 'paycheck', '构造正确：停在发薪日格');
    ok(E.paydayNoticeOf(g, ld, p.inFT) === null,
       '停在结算格时不产生提示（由确认面板负责，避免同一件事说两遍）');
  }

  /* ③ 同一年内再次经过 → 提示「本年已结」，而不是让玩家以为漏发 */
  {
    const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 20260920 });
    const p = fixCareer(g, '软件工程师');
    p.settledAge = g.startAge - 1;
    p.pos = (payIn[0] - 1 + RING) % RING;
    E.movePlayer(g, p, 2);                         /* 第一次：结清（settledAge 推到当前年龄） */
    const ageA = E.ageOf(g);
    p.pos = (payIn[0] - 1 + RING) % RING;
    const ld2 = E.movePlayer(g, p, 2);             /* 第二次：同一岁，本年已结 */
    ok(ld2.settled.yearsPaid === 0 && ld2.collected === 0,
       `${ageA} 岁这一年内再次经过：结算 0 年、入账 0（一年只结一次账）`);
    const n = E.paydayNoticeOf(g, ld2, p.inFT);
    ok(!!n && n.kind === 'already',
       `仍然产生提示（kind = ${n && n.kind}）—— 明说「本年已结」，不让玩家以为系统漏发`);
    ok(n && n.count === 1 && n.skipped === 1,
       `并说明踩到了 ${n && n.count} 个、其中 ${n && n.skipped} 个因本年已结而略过`);
  }

  /* ④ 纯入不敷出 → 不提示（由入不敷出面板接管） */
  {
    const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 7 });
    const p = fixCareer(g, '小区保安');
    p.cash = 0; p.liabs.bank = 999999; p.loans = null; E.ensureLoans(p);
    p.settledAge = g.startAge - 1;
    p.pos = (payIn[0] - 1 + RING) % RING;
    const ld = E.movePlayer(g, p, 2);
    ok(ld.deficit > 0 && ld.collected === 0, `构造正确：年度结余为负（缺口 ${money(ld.deficit)}）`);
    ok(E.paydayNoticeOf(g, ld, p.inFT) === null,
       '纯入不敷出时不产生发薪提示（由入不敷出面板负责，它会把缺口讲得更清楚）');
    ok(E.resolveSpace(g, p, ld).type === 'deficit', '确认此时弹出的确实是「入不敷出」面板');
  }

  /* ⑤ 财务自由圈的分红日同样适用（换用「分红日」的说法） */
  {
    const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 19 });
    const p = fixCareer(g, '小区保安');
    p.inFT = true; p.ftPos = 0;
    p.assets.ftBusiness.push({ nm: '测试企业', cost: 100000, cf: 5000 });
    const ld = E.movePlayer(g, p, 2);              /* 外圈 0 → 经过 1（分红日）→ 落在 2 */
    ok(ld.path[0] === payFt[0] && ld.space.t !== 'cashflowday',
       `构造正确：经过分红日（${payFt[0]}）但落在「${ld.space.t}」`);
    const n = E.paydayNoticeOf(g, ld, p.inFT);
    ok(!!n && n.kind === 'paid' && n.inFT === true,
       `自由圈同样提示，且标记为「分红」而非「发薪」（inFT = ${n && n.inFT}）`);
    ok(n && n.amount === ld.collected && n.amount > 0,
       `分红提示金额 ${money(n && n.amount)} 与实发同源`);
  }

  /* ⑥ 没有经过结算格 → 不提示（不能凭空多出一条提示） */
  {
    const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 20260920 });
    const p = fixCareer(g, '软件工程师');
    let quiet = 0;
    for (let i = 0; i < RING; i++) {
      if (window.RAT_RACE[i].t !== 'paycheck' && window.RAT_RACE[(i + 1) % RING].t !== 'paycheck') { quiet = i; break; }
    }
    p.pos = quiet;
    const ld = E.movePlayer(g, p, 1);
    ok(ld.settled === null, `路径 ${JSON.stringify(ld.path)} 未经过结算格（settled = null）`);
    ok(E.paydayNoticeOf(g, ld, p.inFT) === null, '未经过结算格时不产生任何提示');
  }

  /* ⑦ 长局：三种通知方式必须【互斥且穷尽】—— 同一件事不会被说两遍，也不会一次都不说 */
  {
    const g = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 20260920 });
    const p = fixCareer(g, '软件工程师');
    let turns = 0, settleTurns = 0, viaToast = 0, viaModal = 0, viaDeficit = 0, alreadyN = 0;
    while (!g.over && turns < 200 && !p.out) {
      turns++;
      const cur = E.current(g);
      if (!cur || cur.out) { E.nextPlayer(g); continue; }
      let gd = 0; while (g.pending && gd++ < 60) E.clearPending(g);
      if (E.isJobless(cur) && cur.energy >= 12) A.huntJob(g);
      if (!cur.pausedThisTurn) {
        const dn = E.diceCount(g, cur);
        const d = E.rollDice(g, dn);
        const ld = E.movePlayer(g, cur, d.reduce((a, b) => a + b, 0));
        const st = ld.settled;
        if (st && st.yearsPaid > 0) {
          settleTurns++;
          const onSettle = !!(ld.space && (cur.inFT ? ld.space.t === 'cashflowday' : ld.space.t === 'paycheck'));
          if (onSettle) viaModal++;                              /* 确认面板 */
          else if (st.deficit > 0 && st.amount <= 0) viaDeficit++; /* 入不敷出面板 */
          else viaToast++;                                        /* 本次新增的提示 */
        }
        const nt = E.paydayNoticeOf(g, ld, cur.inFT);
        if (nt && nt.kind === 'already') alreadyN++;
        E.resolveSpace(g, cur, ld);
        let g2 = 0; while (g.pending && g2++ < 60) E.clearPending(g);
      }
      E.endTurn(g);
    }
    ok(viaToast > 0,
       `一生中有 ${viaToast} 个回合「经过结算格但未停留且有金额进账」—— 这正是本提示覆盖的场景`);
    ok(settleTurns === viaToast + viaModal + viaDeficit,
       `结算回合 ${settleTurns} = 提示 ${viaToast} + 确认面板 ${viaModal} + 入不敷出面板 ${viaDeficit}`
       + '（三种通知方式互斥且穷尽）');
    ok(viaToast / Math.max(1, settleTurns) > 0.2,
       `其中 ${(viaToast / Math.max(1, settleTurns) * 100).toFixed(0)}% 靠本提示覆盖 —— 没有它，这些回合在界面上是「静默」的`);
    warn(`   · 本局另出现 ${alreadyN} 次「本年已结」提示（踩到了但不再发钱，明说以免像是漏发）。`);
  }
}

/* ---------------- ⑯ 结算是否重复：全生命周期区间核对 ---------------- */
/* 玩家侧的历史疑问：「为什么跨 2 个发薪日只结 1 笔 / 隔几轮踩 1 个发薪日一次结 3 年？」
   —— 那是已回滚两版的方案 A（结清积欠），玩家读不懂；
   现行口径是「一个结算格 = 恰好 1 年」，跨 N 个结 N 年、逐笔入账。
   本节把【一整局】的每一次 settledAge 写入都记下来，
   断言「没有任何一年被结两次、也没有任何一年被漏掉、没有任何一次静默跳年」。 */
sec('⑯ 结算是否重复：拦截 settledAge 的每一次写入，核对全生命周期区间');
{
  const g = E.newGame({ rule:'101', mode:'solo', count:1, names:['甲'], seed:20260920 });
  const p = fixCareer(g, '小区保安');
  p.cash = 200000;

  /* ★ 拦截属性写入，是唯一能覆盖【全部四个结算入口】的做法：
     ① movePlayer ② settleAtBreak（失业）③ retireBreakOf（退休）④ finalSettle（终局）
     —— 后三个调的都是模块内函数，赋值给 E.settleAtBreak 根本拦不到
     （审计第一版就栽在这里，误报「突变点 0 笔」，把缺口算成了亏损）。 */
  const writes = [];
  let val = p.settledAge;
  Object.defineProperty(p, 'settledAge', {
    get(){ return val; },
    set(v){ writes.push({ round:g.round, age:E.ageOf(g), from:val, to:v, delta:v - val }); val = v; },
    configurable:true, enumerable:true
  });

  let settleCells = 0, skippedCells = 0, fromMove = 0, badArith = 0;
  const origMove = E.movePlayer;
  E.movePlayer = function(gg, pp, steps){
    const r = origMove.apply(this, arguments);
    if(r.settled){
      settleCells += r.settled.count;
      skippedCells += r.settled.skipped;
      /* 每格 1 年：一次移动里可以有【多笔】真正结算（跨多格、积欠充足时） */
      r.settled.years.filter(y => y.years > 0).forEach(paid => {
        fromMove++;
        if(paid.amount !== E.annual(paid.monthly) * paid.years) badArith++;
      });
    }
    return r;
  };

  let turns = 0;
  while(!g.over && turns < 300){
    turns++;
    const cur = E.current(g);
    if(!cur || cur.out){ E.nextPlayer(g); continue; }
    handlePending(g, cur);
    if(E.isJobless(cur) && cur.energy >= 12) A.huntJob(g);
    if(!cur.pausedThisTurn){
      const dn = E.diceCount(g, cur);
      const d = E.rollDice(g, dn);
      const ld = E.movePlayer(g, cur, d.reduce((a, b) => a + b, 0));
      E.resolveSpace(g, cur, ld);
      handlePending(g, cur);
    }
    E.endTurn(g);
  }
  E.movePlayer = origMove;                     /* 还原，避免影响后续 */

  /* ① 区间互不重叠 —— 没有任何一年被结两次（这是本题的核心结论） */
  const segs = writes.filter(w => w.delta > 0).map(w => [w.from + 1, w.to]);
  let overlap = 0;
  for(let i = 0; i < segs.length; i++)
    for(let j = i + 1; j < segs.length; j++)
      if(segs[i][0] <= segs[j][1] && segs[j][0] <= segs[i][1]) overlap++;

  /* ② 覆盖完整 —— 没有任何一年被漏掉 */
  const cover = {};
  segs.forEach(([a, b]) => { for(let y = a; y <= b; y++) cover[y] = (cover[y] || 0) + 1; });
  const missed = [], twice = [];
  for(let y = g.startAge; y <= E.ageOf(g); y++){
    if(!cover[y]) missed.push(y);
    if(cover[y] > 1) twice.push(y);
  }
  const finished = !p.out;

  ok(overlap === 0,
     `一生 ${writes.length} 次结算，区间【零重叠】—— 没有任何一年被结两次`);
  ok(twice.length === 0,
     `也没有任何一年同时落在两个区间里（重复计数 ${twice.length} 年）`);
  ok(!finished || missed.length === 0,
     finished
       ? `20—${E.ageOf(g)} 岁共 ${E.ageOf(g) - g.startAge + 1} 年【全覆盖】（一次不漏）`
       : `中途出局（${E.ageOf(g)} 岁）：未覆盖 ${missed.length} 年属预期，不做终局结清`);
  ok(writes.every(w => w.delta >= 1 && w.to <= w.age),
     '每次写入都至少推进 1 年、且绝不越过当前年龄 —— 不给未活过的年份发薪，' 
     + '也不存在「推走 settledAge 却没结算」的静默跳年（每笔写入都对应一笔入账）');
  /* ★ 方案 A：命中的结算格 = 真正结算的 + 显式记「本年已结」的，一个都不能静默消失。
     「本年已结」的常见来源：失业 / 退休突变点已把账结到当前年龄，
     同一年里再踩到发薪日 → due = 0 → 记略过（见 movePlayer 的 due <= 0 分支）。 */
  ok(fromMove + skippedCells === settleCells,
     `命中发薪日格 ${settleCells} 格 = 真正结算 ${fromMove} + 因本年已结略过 ${skippedCells}`
     + '（每个命中的格子都有记账，没有静默消失的）');
  ok(badArith === 0, '每笔金额都满足「年结余 × 年数」—— 玩家可在日志里自行核对');

  /* ③ 文案自证：必须给出「一次结算覆盖 N 年」与算式，而不是只写「结算 N 年」 */
  /* 语义断言（不钉死措辞）：必须点明「结算 1 年（第 X 岁）」、
     并带上「年结余 × 1」的算式 —— 玩家能自己核账，也能一眼看出
     「经过几个发薪日 = 结几年」的对应关系。 */
  const anyLog = g.log.filter(l => /结算 1 年（第 \d+ 岁）/.test(l.text))[0];
  ok(!!anyLog, `日志点明「结算 1 年（第 X 岁）」：${anyLog ? anyLog.text.slice(0, 62) + '…' : '（未找到）'}`);
  ok(!!anyLog && /= 年结余 .+ × 1/.test(anyLog.text),
     '日志带上「年结余 × 1」的算式（玩家可自行核账，不必猜是不是重复结算）');
  ok(!g.log.some(l => /结算 \d+ 年：入账/.test(l.text)),
     '不再使用会被读成「N 次」的旧写法「结算 N 年：入账」');

  const ng = E.newGame({ rule:'101', mode:'solo', count:1, names:['乙'], seed:7 });
  const pg = fixCareer(ng, '小区保安');
  ng.round = 6; E.refreshLife(ng, pg);
  pg.settledAge = ng.startAge - 1;
  /* 站在发薪日的前一格、走 2 步：路径含该发薪日格，落点是它的下一格（非结算格）
     → 命中 paydayNoticeOf 的「经过但未停留」分支。 */
  pg.pos = (payIn[0] - 1 + RING) % RING;
  const ld2 = E.movePlayer(ng, pg, 2);
  const nn = E.paydayNoticeOf(ng, ld2, false);
  ok(!!nn, '经过结算格（未停留）时产生了提示数据');
  ok(!!nn && Math.abs(nn.perYear * nn.years - nn.amount) < 1,
     nn ? `提示带上算式「年结余 ${money(nn.perYear)} × ${nn.years} = ${money(nn.amount)}」`
        : '（无提示数据）');

  warn(`   · 一生结算 ${writes.length} 次写入，其中 ${writes.length - fromMove} 次来自失业 / 退休 / 终局的突变点结算（不在发薪日触发，日志文案是「收入变更前一次结清」「终局一次结清」）。`);
  warn('   · 结论：不存在重复结算、也不丢年。发薪日每格恰好 1 年，积欠由突变点 / 终局兜底。');
}

/* ---------------- 结论 ---------------- */
OUT.push('', '─'.repeat(72));
OUT.push(fail === 0
  ? `✅ 发薪日触发审计全部通过（到达 / 经过 / 不重复 / 不遗漏 / 年龄时机 / 发薪提示 / 边界），共 ${pass} 项`
  : `❌ 有 ${fail} 项未通过（通过 ${pass} 项）`);
OUT.push(`   已知偏差以 ⚠️ 标出（${OUT.filter(l => l.indexOf('⚠️') >= 0).length} 条），属待决策项，不计入通过/失败。`);
console.log(OUT.join('\n'));
process.exit(fail === 0 ? 0 : 1);
