/* ============================================================================
   发薪日结算用例 —— 一个结算格 = 一年（2026-09-22 定稿口径）

   被验证的规则（唯一一句话）：
     · 经过 / 停在发薪日（分红日）格 → 恰好结算 1 年（最旧的未结年份）
     · 每笔入账 = 年结余 × 1（按当前月结余折算，不逐年回溯）
     · 每笔摊还 1 × 12 期（领几年就还几年）
     · 跨 N 个结算格 → 结 N 年（每个格各结 1 年，逐年入账、逐年摊还）
     · settledAge ≥ 当前年龄（无积欠）时踩到结算格 → 记「本年已结」略过
     · 没踩到结算格的年份【积欠】下来：后续发薪日逐个结清，
       收入突变（失业 / 退休）与终局则一次结清全部积欠
     · 跨 0 个结算格 → 不结算、不推进、日志不出现发薪记录

   ⚠️ 棋盘前提：内圈 3 个发薪日（等距 2/10/18，间隔 8 格）→ 每轮平均经过 ≈0.44 个，
      积欠是常态（约 0.56 年/轮）；外圈 4 个分红日密度 > 1，略过反而是常态。
      改动 data-board.js 的格型分布后必须重跑本脚本。

   运行：node test/payday-settlement.js        （退出码 0 = 全通过）
   ============================================================================ */
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + '/';
global.window = {};
for (const f of ['data-careers.js','data-board.js','data-cards-101.js','data-cards-202.js','engine.js','engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];
const E = global.Engine, A = global.Act;

const OUT = [];
const ok  = (c, m) => OUT.push((c ? '   ✅ ' : '   ❌ ') + m);
const sec = t => OUT.push('', '=== ' + t + ' ===');
const note = m => OUT.push('   · ' + m);
const money = E.money;
const RING = E.RING_LEN;

/* ---------- 构型工具 ---------- */
const payIdxOf = list => list.map((s, i) => s.t === 'paycheck' ? i : -1).filter(i => i >= 0);
const divIdxOf = list => list.map((s, i) => s.t === 'cashflowday' ? i : -1).filter(i => i >= 0);
const PAY_IN = payIdxOf(window.RAT_RACE);
const DIV_FT = divIdxOf(window.FAST_TRACK);

/* 走一条路径（含落点），返回经过的下标序列 */
function walk(from, steps){
  const to = (from + steps) % RING, out = [];
  let i = from;
  do { i = (i + 1) % RING; out.push(i); } while (i !== to && out.length < 60);
  return out;
}
/* 找出「跨过恰好 n 个结算格」的构型；找不到返回 null */
function findConfig(list, type, n, maxSteps){
  for (let steps = 1; steps <= maxSteps; steps++)
    for (let from = 0; from < RING; from++){
      const pth = walk(from, steps);
      const hits = pth.filter(ix => list[ix].t === type);
      if (hits.length === n) return { from, steps, to: (from + steps) % RING, path: pth, hits };
    }
  return null;
}
/* 找「跨过恰好 n 个结算格、但落点不是结算格」的构型 ——
   落点在结算格时，即时提示按设计返回 null（由确认面板负责），
   要断言提示数据就得用「经过但未停留」的构型。 */
function findConfigNotLanding(list, type, n, maxSteps){
  for (let steps = 1; steps <= maxSteps; steps++)
    for (let from = 0; from < RING; from++){
      const to = (from + steps) % RING;
      if (list[to].t === type) continue;
      const pth = walk(from, steps);
      const hits = pth.filter(ix => list[ix].t === type);
      if (hits.length === n) return { from, steps, to, path: pth, hits };
    }
  return null;
}
function maxHits(list, type, maxSteps){
  let best = 0, arg = null;
  for (let steps = 1; steps <= maxSteps; steps++)
    for (let from = 0; from < RING; from++){
      const pth = walk(from, steps);
      const h = pth.filter(ix => list[ix].t === type).length;
      if (h > best) { best = h; arg = { from, steps }; }
    }
  return { best, arg };
}

/* ---------- 对局工厂 ---------- */
/* behind：让 settledAge 落后当前年龄 behind 年（默认落后到开局，积欠最深）。
   behind = 0 → 本年已结（无积欠），用于「略过」分支。 */
function mkGame(careerName, rule, behind){
  const g = E.newGame({ rule: rule || '101', mode:'solo', count:1, names:['测'], seed:20260920 });
  const p = g.players[0];
  const c = global.CAREERS.filter(x => x.name === (careerName || '软件工程师'))[0];
  p.job = c; p.baseSalary = c.salary;
  p.liabs = Object.assign({home:0,school:0,car:0,credit:0,bank:0,other:0,extraPay:0}, c.liab);
  p.loans = null; E.ensureLoans(p); E.refreshLife(g, p);
  p.cash = E.finance(p).cashflow + c.savings;
  g.round = 6; E.refreshLife(g, p);                  // 25 岁
  p.settledAge = behind == null ? g.startAge - 1     // 默认：账停在 19 岁 → 积欠 6 年
                                : E.ageOf(g) - behind;
  return { g, p };
}
const periodsOf = p => E.LOAN_KEYS.reduce((s, k) => s + E.loanInfo(p, k).periods, 0);
const activeLoans = p => E.LOAN_KEYS.filter(k => E.loanInfo(p, k).balance > 0);

/* 一次完整的「移动 → 结算」，返回快照 */
function step(g, p, from, steps, useFT){
  if (useFT) p.ftPos = from; else p.pos = from;
  const snap = {
    cash: p.cash, settledAge: p.settledAge, periods: periodsOf(p),
    active: activeLoans(p).length
  };
  const ld = E.movePlayer(g, p, steps);
  const st = ld.settled;
  return {
    ld, st, snap,
    cashDelta: p.cash - snap.cash,
    yearDelta: p.settledAge - snap.settledAge,
    periodDelta: periodsOf(p) - snap.periods,
    hits: ld.path.filter(ix => (useFT ? window.FAST_TRACK : window.RAT_RACE)[ix].t === (useFT ? 'cashflowday' : 'paycheck')).length
  };
}

/* ============================ ① 规则本身 ============================ */
sec('① 规则本身：一个结算格 = 恰好 1 年（与积欠深浅无关）');
{
  note(`内圈发薪日位置 ${PAY_IN.join(',')}（${PAY_IN.length}/${RING} 格，等距）· 外圈分红日位置 ${DIV_FT.join(',')}（${DIV_FT.length}/${RING} 格）`);
  note(`构型：25 岁、账停在 19 岁（积欠 6 年）→ 每个发薪日单格触发都只结 1 年，积欠保留 5 年`);

  /* 逐格扫一遍：每一个结算格单独触发时都恰好结 1 年 */
  let each = 0, bad = [];
  for (const ix of PAY_IN){
    const { g:g2, p:p2 } = mkGame();
    const r = step(g2, p2, (ix - 1 + RING) % RING, 1);
    if (r.hits !== 1) { bad.push('构型异常 ' + ix); continue; }
    each++;
    if (r.st.yearsPaid !== 1 || r.st.count !== 1 || r.st.years[0].years !== 1
        || r.st.through !== 20 || r.st.arrears !== 5)
      bad.push('格 ' + ix);
  }
  ok(bad.length === 0, `内圈 ${each} 个发薪日逐格验证：每个都恰好结 1 年（结到 20 岁、剩 5 年积欠）${bad.length ? '（异常：' + bad.join(',') + '）' : ''}`);

  /* 积欠的两种典型情形：落后 1 年 → 结 1 年；无积欠（落后 0 年）→ 略过 */
  {
    const { g, p } = mkGame(undefined, undefined, 1);
    const r = step(g, p, (PAY_IN[0] - 1 + RING) % RING, 1);
    ok(r.st.yearsPaid === 1 && r.st.arrears === 0,
       `积欠 1 年 → 结清这 1 年、积欠归零（实际结 ${r.st.yearsPaid} 年、剩 ${r.st.arrears} 年）`);
  }
  {
    const { g, p } = mkGame(undefined, undefined, 0);   // settledAge = 当前年龄 → 无积欠
    const r = step(g, p, (PAY_IN[0] - 1 + RING) % RING, 1);
    ok(r.st.yearsPaid === 0 && r.st.skipped === 1 && r.cashDelta === 0,
       `无积欠 → 记 1 笔略过、入账 0（yearsPaid=${r.st.yearsPaid} skipped=${r.st.skipped}）—— 不给还没活过的年份发薪`);
  }
}

/* ============================ ② 单个发薪日 ============================ */
sec('② 单个发薪日 → 恰好结 1 年（落格 / 经过同源），积欠保留');
{
  /* 构型 A：停在发薪日格上，积欠 3 年 → 只结最旧的 1 年 */
  const ix = PAY_IN[0];
  const { g, p } = mkGame(undefined, undefined, 3);
  const r = step(g, p, (ix - 1 + RING) % RING, 1);
  const perYear = E.annual(r.st.years[0].monthly);
  note(`构型 A：从 ${(ix-1+RING)%RING} 走 1 步 → 落在发薪日格 ${ix}（路径 ${JSON.stringify(r.ld.path)}），积欠 3 年`);
  ok(r.st.count === 1 && r.st.yearsPaid === 1, `结算笔数 1、年数 1（实际 ${r.st.count} 笔 / ${r.st.yearsPaid} 年）`);
  ok(r.st.years[0].since + 1 === r.snap.settledAge + 1,
    `结的是【最旧的未结年份】：第 ${r.st.years[0].since + 1} 岁（settledAge ${r.snap.settledAge} → ${p.settledAge}）`);
  ok(r.st.amount === perYear, `入账 = 年结余 ¥${perYear} × 1 = ¥${r.st.amount}`);
  ok(r.cashDelta === r.st.amount, `现金实增 ¥${r.cashDelta} 与入账同源`);
  ok(r.yearDelta === 1, `settledAge +1（${r.snap.settledAge} → ${p.settledAge}，积欠 ${r.st.arrears} 年保留给后续结算）`);
  ok(r.periodDelta > 0 && r.periodDelta <= r.snap.active * 12,
    `${r.snap.active} 笔在贷负债摊还 ${r.periodDelta} 期 ∈ (0, ${r.snap.active * 12}]（1 年 = 12 期；剩余期数不足 12 的贷款提前结清）`);
  ok(r.st.skipped === 0, '没有略过的格子');

  /* 构型 B：只经过、不落在发薪日格上（积欠 2 年 → 仍只结 1 年） */
  let passOnly = null;
  for (let steps = 1; steps <= 6 && !passOnly; steps++)
    for (let from = 0; from < RING && !passOnly; from++){
      const pth = walk(from, steps);
      const hits = pth.filter(i => window.RAT_RACE[i].t === 'paycheck').length;
      if (hits === 1 && window.RAT_RACE[(from + steps) % RING].t !== 'paycheck')
        passOnly = { from, steps, to: (from + steps) % RING, path: pth };
    }
  const b = mkGame(undefined, undefined, 2);
  const rb = step(b.g, b.p, passOnly.from, passOnly.steps);
  note(`构型 B：从 ${passOnly.from} 走 ${passOnly.steps} 步 → 落在「${window.RAT_RACE[passOnly.to].nm}」格，路径经过发薪日（${JSON.stringify(passOnly.path)}），积欠 2 年`);
  ok(rb.st.count === 1 && rb.st.yearsPaid === 1, `仅经过也照样结 1 年（${rb.st.yearsPaid} 年）`);
  ok(rb.cashDelta === rb.st.amount && rb.yearDelta === 1 && rb.st.arrears === 1, '入账、年份推进、积欠保留都正确');

  /* 提示与面板的分工：停在结算格 → 提示返回 null（交给确认面板） */
  const nA = E.paydayNoticeOf(g, r.ld, false);
  ok(nA === null, '停在发薪日格时，即时提示返回 null（由确认面板负责，避免同一件事说两遍）');
  const nb = E.paydayNoticeOf(b.g, rb.ld, false);
  ok(nb && nb.kind === 'paid' && nb.years === 1 && nb.count === 1 && nb.arrears === 1,
    `仅经过时给出提示数据：kind=${nb && nb.kind} years=${nb && nb.years} 待结=${nb && nb.arrears} 年`);
}

/* ============================ ③ 跨多个发薪日 ============================ */
sec('③ 跨 N 个发薪日 → 结 N 年（每格各结 1 年）');
for (const N of [2, 3]){
  /* 等距 8 格 → 跨 2 个至少 9 步（银翅膀 2 粒骰可达）；跨 3 个至少 17 步 ——
     已超出 2 粒骰骰程，N=3 是「引擎在超长步数下同样逐格结算」的构造性验证 */
  const cfg = findConfigNotLanding(window.RAT_RACE, 'paycheck', N, 18)
           || findConfig(window.RAT_RACE, 'paycheck', N, 18);
  if (!cfg){ ok(false, `找不到「跨 ${N} 个发薪日」的构型`); continue; }
  const { g, p } = mkGame(undefined, undefined, 4);   // 积欠 4 年 ≥ N
  const r = step(g, p, cfg.from, cfg.steps);
  note(`构型：从 ${cfg.from} 走 ${cfg.steps} 步 → 路径 ${JSON.stringify(cfg.path)} 跨过 ${N} 个发薪日（位置 ${cfg.hits.join(',')}），积欠 4 年`);
  ok(r.hits === N && r.st.count === N,
    `结算记录 = 跨过的格子数 = ${N}（每一个命中的格子都记了一笔）`);
  ok(r.st.yearsPaid === N && r.st.skipped === 0,
    `经过 ${N} 个就结 ${N} 年：每格各结 1 年，一个都不略过（积欠 4 ≥ ${N}）`);
  ok(r.st.years.every(y => y.years === 1),
    `每笔恰好 1 年，且结的是连续的最旧年份：${r.st.years.map(y => y.since + 1).join('、')} 岁`);
  ok(r.st.amount === r.st.years.reduce((s, y) => s + y.amount, 0),
    `合计入账 ¥${r.st.amount} = 各笔之和（算式可直接核账）`);
  ok(r.cashDelta === r.st.amount, `现金实增 ¥${r.cashDelta} 与入账一致`);
  ok(r.yearDelta === N && r.st.arrears === 4 - N,
    `settledAge +${r.yearDelta}，剩 ${r.st.arrears} 年积欠留给后续发薪日`);
  /* ⚠️ 期数不能断言「恰好 = 笔数 × 12」：摊还中若小额负债被还清，
     它后续就不再计期 —— 期数会【少于】理论上限。这是正确行为。 */
  ok(r.periodDelta > 0 && r.periodDelta <= r.snap.active * N * 12,
    `${r.snap.active} 笔在贷负债摊还 ${r.periodDelta} 期 ∈ (0, ${r.snap.active * N * 12}]（领几年就还几年；中途还清的不再计期）`);
  const n = E.paydayNoticeOf(g, r.ld, false);
  ok(n && n.years === N && n.count === N && n.skipped === 0 && n.arrears === 4 - N,
    `提示数据如实汇报「走了 ${N} 个结算格、结了 ${N} 年、还剩 ${4 - N} 年待结」`);
}

/* 积欠 < 经过数：跨 2 个但只积欠 1 年 → 结 1 年、略过 1 个 */
{
  const cfg = findConfigNotLanding(window.RAT_RACE, 'paycheck', 2, 18)
           || findConfig(window.RAT_RACE, 'paycheck', 2, 18);
  const { g, p } = mkGame(undefined, undefined, 1);   // 积欠 1 年 < 2 个格子
  const r = step(g, p, cfg.from, cfg.steps);
  ok(r.st.yearsPaid === 1 && r.st.skipped === 1,
    `积欠 1 年 + 跨 2 个发薪日 → 结 1 年、第 2 个因本年已结而略过（不给未活过的年份发薪）`);
  ok(r.yearDelta === 1 && r.st.arrears === 0, `settledAge 只推进到当前年龄，积欠归零`);
}

/* 上界：无银翅膀（1 粒骰 ≤6 步）与 2 粒骰（≤12 步）分别最多跨几个 */
{
  const m1 = maxHits(window.RAT_RACE, 'paycheck', 6);
  const m3 = maxHits(window.RAT_RACE, 'paycheck', window.WINGS.dice * 6);
  const mf = maxHits(window.FAST_TRACK, 'cashflowday', 12);
  note(`单回合上界：1 粒骰（≤6 步）最多 ${m1.best} 个、银翅膀 2 粒骰（≤12 步）最多 ${m3.best} 个、外圈 2 粒骰（≤12 步）最多 ${mf.best} 个`);
  ok(m1.best === 1, `等距间隔 8 格 > 骰子上限 6 步 → 常态单回合最多 ${m1.best} 个发薪日（跨多个只在银翅膀时发生）`);
  ok(m3.best === 2, `银翅膀 2 粒骰最多跨 ${m3.best} 个 → 最多结 2 年（跨 3 个需 ≥17 步，超出骰程）`);

  /* 按最多构型实测：积欠充足时每格各结 1 年 */
  const { g, p } = mkGame(undefined, undefined, 4);
  const r = step(g, p, m3.arg.from, m3.arg.steps);
  ok(r.st.yearsPaid === m3.best && r.yearDelta === m3.best && r.st.skipped === 0,
    `按最多构型实测：跨 ${m3.best} 个 → 结 ${m3.yearsPaid || m3.best} 年（每格 1 年）、settledAge +${r.yearDelta}`);
  ok(r.periodDelta > 0 && r.periodDelta <= r.snap.active * m3.best * 12,
    `摊还 ${r.periodDelta} 期 ∈ (0, ${r.snap.active * m3.best * 12}]（少数负债在摊还中被还清，期数本就该少）`);
}

/* ============================ ④ 边界 ============================ */
sec('④ 边界情形');
{
  /* 跨 0 个 */
  let zero = null;
  for (let steps = 1; steps <= 6 && !zero; steps++)
    for (let from = 0; from < RING && !zero; from++){
      const pth = walk(from, steps);
      if (pth.every(i => window.RAT_RACE[i].t !== 'paycheck')) zero = { from, steps, to:(from+steps)%RING, path: pth };
    }
  const z = mkGame(); const rz = step(z.g, z.p, zero.from, zero.steps);
  ok(rz.st === null, `跨 0 个结算格时 settled 为 null（路径 ${JSON.stringify(zero.path)}，落在「${window.RAT_RACE[zero.to].nm}」）`);
  ok(rz.cashDelta === 0 && rz.yearDelta === 0, '现金与 settledAge 都不动');
  ok(E.paydayNoticeOf(z.g, rz.ld, false) === null, '未经过结算格时不产生提示');

  /* 本年已结：先结清仅剩的 1 年积欠，再在同一岁里踩到下一个发薪日 */
  {
    const { g, p } = mkGame(undefined, undefined, 1);
    const first = step(g, p, (PAY_IN[0] - 1 + RING) % RING, 1);   // 结清今年
    ok(first.st.yearsPaid === 1, `第一次：结算 ${first.st.yearsPaid} 年（积欠归零）`);
    const second = step(g, p, (PAY_IN[1] - 1 + RING) % RING, 2);  // 同岁【经过】下一个（跨过它、落在后一格，走提示路径）
    ok(second.st.yearsPaid === 0 && second.st.skipped === 1 && second.cashDelta === 0,
      `同岁再踩 → 因本年已结而略过（yearsPaid=${second.st.yearsPaid}、入账 0）`);
    const n = E.paydayNoticeOf(g, second.ld, false);
    ok(n && n.kind === 'already', `提示 kind = ${n && n.kind} —— 明说「已结过」，不让玩家以为漏发`);
  }

  /* 摊还中被还清的小额负债：期数少于理论上限属正常 */
  {
    const cfg1 = findConfig(window.RAT_RACE, 'paycheck', 1, 6);
    const { g, p } = mkGame();
    p.liabs.car = 1200; p.loans = null; E.ensureLoans(p);   /* 余额很小，1 年 12 期内必然还清 */
    const r = step(g, p, cfg1.from, cfg1.steps);
    ok(E.loanInfo(p, 'car').balance === 0, `1 年 12 期摊还后小车贷已结清`);
    ok(r.periodDelta > 0 && r.periodDelta < r.snap.active * 12,
      `期数 ${r.periodDelta} < 理论上限（一笔负债中途还清后不再计期，属正常）`);
  }

  /* 入不敷出：结余为负时记缺口、不动现金、走统一面板 */
  const cfg2 = findConfig(window.RAT_RACE, 'paycheck', 1, 6);
  const { g:g2, p:p2 } = mkGame('小区保安', '101');
  p2.liabs.bank = 900000; p2.loans = null; E.ensureLoans(p2);
  const r2 = step(g2, p2, cfg2.from, cfg2.steps);
  ok(r2.st.amount === 0 && r2.st.deficit > 0 && r2.cashDelta === 0,
    `结余为负时：入账 0、缺口 ¥${r2.st.deficit}、现金不变（不会把现金扣成负数）`);
  ok(E.paydayNoticeOf(g2, r2.ld, false) === null, '纯入不敷出时不产生发薪提示（交给入不敷出面板）');
  const P = E.resolveSpace(g2, p2, r2.ld);
  ok(P && P.type === 'deficit', `落格后先弹入不敷出面板（type=${P && P.type}）`);
  ok(P && P.amount === r2.st.deficit, `面板金额与结算记录同源（¥${P && P.amount}）`);

  /* 停在结算格 → 确认面板的文案口径（每格 1 年自证文案） */
  const { g:g3, p:p3 } = mkGame(undefined, undefined, 3);
  const ix = PAY_IN[1];
  const r3 = step(g3, p3, (ix - 1 + RING) % RING, 1);
  const P3 = E.resolveSpace(g3, p3, r3.ld);
  ok(P3 && P3.type === 'info' && /结算 1 年（第 \d+ 岁）/.test(P3.msg),
    `确认面板写明「结算 1 年（第 X 岁）」：${P3 && P3.msg}`);
  ok(P3 && P3.msg.indexOf(money(r3.st.amount)) >= 0, '面板金额与实际入账一致');
  ok(P3 && P3.msg.indexOf('待结') >= 0, `面板点明剩余积欠（剩 ${r3.st.arrears} 年待结）`);
}

/* ============================ ⑤ 一整局：积欠与守恒 ============================ */
sec('⑤ 一整局：每笔恰好 1 年 · 积欠不丢年 · 终局结清推平');
{
  function playLong(careerName, seed){
    const g = E.newGame({ rule:'101', mode:'solo', count:1, names:['测'], seed });
    const p = g.players[0];
    const c = global.CAREERS.filter(x => x.name === careerName)[0];
    p.job = c; p.baseSalary = c.salary;
    p.liabs = Object.assign({home:0,school:0,car:0,credit:0,bank:0,other:0,extraPay:0}, c.liab);
    p.loans = null; E.ensureLoans(p); E.refreshLife(g, p);
    p.cash = E.finance(p).cashflow + c.savings;
    let rnd = (function(s){ return function(){ s = (s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; })(seed ^ 0x5bf03635);
    let hits = 0, years = 0, nonUnit = 0, skipTurns = 0, badArith = 0, turns = 0, maxArrears = 0;
    function handlePending(){
      let guard = 0;
      while (g.pending && guard++ < 60) {
        const P = g.pending;
        switch (P.type) {
          case 'deficit': {
            let rr = A.payDeficit(g, P.amount);
            if (!rr.ok) { const prof = E.creditProfile(g, p);
              const take = Math.min(Math.max(1000, Math.ceil((rr.shortfall||0)/1000)*1000), prof ? prof.available : 0);
              if (take > 0) A.takeLoan(g, take);
              rr = A.payDeficit(g, P.amount); }
            if (!rr.ok) { E.declareBankruptcy(g, p); E.clearPending(g); return; }
            const L = P.landed; E.clearPending(g);
            if (L) E.resolveSpace(g, p, Object.assign({}, L, { deficit: 0 }));
            break;
          }
          case 'opportunity': case 'opportunity202': {
            let d = P.deal;
            if (!d) { const dk = P.choices || ['small','big'];
              const rr = A.chooseDeck(g, dk[Math.floor(rnd()*dk.length)]); if (rr && rr.ok) d = rr.card; }
            if (d && p.cash > 8000 && p.energy > 40 && rnd() < 0.7) A.buyDeal(g, d, d.min || 1);
            E.clearPending(g); break;
          }
          case 'charity': A.doCharity(g, rnd() < 0.4); E.clearPending(g); break;
          case 'rest': if (p.energy < 40 && p.cash > 5000) A.vacation(g); E.clearPending(g); break;
          case 'downsized': A.doDownsized(g, P.amount); E.clearPending(g); break;
          case 'doodad': {
            let rr = A.payDoodad(g, P.card, P.cost);
            if (!rr.ok) { const prof = E.creditProfile(g, p);
              const take = Math.min(Math.max(1000, Math.ceil((rr.shortfall||0)/1000)*1000), prof ? prof.available : 0);
              if (take > 0) A.takeLoan(g, take);
              rr = A.payDoodad(g, P.card, P.cost); }
            if (!rr.ok) E.declareBankruptcy(g, p);
            E.clearPending(g); break;
          }
          case 'baby': A.addBaby(g); break;
          default: E.clearPending(g); break;
        }
      }
    }
    while (!g.over && turns < 400) {
      turns++;
      const cur = E.current(g);
      if (!cur || cur.out) { E.nextPlayer(g); continue; }
      handlePending();
      if (E.isJobless(cur) && cur.energy >= 12) A.huntJob(g);
      if (!cur.pausedThisTurn) {
        const ring = cur.inFT ? window.FAST_TRACK : window.RAT_RACE;
        const kind = cur.inFT ? 'cashflowday' : 'paycheck';
        const n = E.diceCount(g, cur);
        const d = E.rollDice(g, n);
        const ld = E.movePlayer(g, cur, d.reduce((a,b)=>a+b,0));
        if (ld.settled) {
          hits += ld.path.filter(i => ring[i].t === kind).length;
          years += ld.settled.yearsPaid;
          if (ld.settled.years.some(y => y.years > 1)) nonUnit++;
          if (ld.settled.skipped > 0) skipTurns++;
          maxArrears = Math.max(maxArrears, ld.settled.arrears || 0);
          /* 每笔真正结算的金额都必须满足「年结余 × 1」—— 玩家可在日志里核账 */
          ld.settled.years.forEach(y => {
            if (y.years > 0 && y.amount !== E.annual(y.monthly) * y.years) badArith++;
          });
        }
        E.resolveSpace(g, cur, ld);
        handlePending();
      }
      E.endTurn(g);
    }
    return { hits, years, nonUnit, skipTurns, badArith, turns, out: p.out,
             settledAge: p.settledAge, age: E.ageOf(g), maxArrears };
  }

  const cases = [['软件工程师', 20260920], ['软件工程师', 7], ['小区保安', 99]];
  let sumHits = 0, sumYears = 0, sumNonUnit = 0, sumSkip = 0, sumBad = 0, finished = 0, flat = 0;
  for (const [nm, seed] of cases){
    const r = playLong(nm, seed);
    sumHits += r.hits; sumYears += r.years; sumNonUnit += r.nonUnit;
    sumSkip += r.skipTurns; sumBad += r.badArith;
    if (!r.out){ finished++; if (r.settledAge === r.age) flat++; }
    note(`${nm} / 种子 ${seed}：命中结算格 ${r.hits} 次、发薪结算 ${r.years} 年、最deep积欠 ${r.maxArrears} 年、`
       + `含略过回合 ${r.skipTurns} 次、${r.turns} 回合${r.out ? '（中途破产）' : `（走完全程，终局结清后 settledAge=${r.settledAge} = ${r.age} 岁）`}`);
  }
  ok(sumBad === 0, `三局合计：每笔金额都满足「年结余 × 年数」（异常 ${sumBad} 处）`);
  ok(sumNonUnit === 0,
    `发薪结算中不存在「一笔多年」：每笔恰好 1 年（异常 ${sumNonUnit} 处）—— 多年合并只发生在突变点 / 终局`);
  ok(finished === 0 || flat === finished,
    `走完全程的 ${finished} 局，终局结清都把 settledAge 推到 ${'终龄'}（推平 ${flat}/${finished}）—— 积欠不丢年`);
  note(`略过回合 ${sumSkip} 次（外圈密度 > 1 或突变点刚结清后同岁再踩，均如实记账）`);

  /* 密度：命中次数应显著低于局长度 —— 这是 3 个发薪日（0.44/轮）的守门断言 */
  const perRound = sumHits / (cases.length * 45);
  ok(perRound > 0.3 && perRound < 0.6,
    `发薪日密度 ${perRound.toFixed(2)} 个/轮（期望 0.3—0.6，标定值 ≈0.44）`
    + '—— 掉出区间就说明棋盘密度被改了，必须同步核对结算步长');
}

/* ============================ 结论 ============================ */
{
  const bad = OUT.filter(l => l.indexOf('❌') >= 0);
  OUT.push('');
  OUT.push(bad.length === 0
    ? `✅ 发薪结算全部通过（一个结算格 = 一年：单笔 / 跨多格 / 积欠 / 略过 / 零个 + 一整局守恒，共 ${OUT.filter(l => l.indexOf('✅') >= 0).length} 项）`
    : `❌ 失败 ${bad.length} 项：\n` + bad.join('\n'));
}
console.log(OUT.join('\n'));
process.exit(OUT.filter(l => l.indexOf('❌') >= 0).length ? 1 : 0);
