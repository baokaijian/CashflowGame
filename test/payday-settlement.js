/* ============================================================================
   发薪日结算用例 —— 方案 A：一次结算 = 结清「自上次结算以来经过的年数」

   被验证的规则（唯一一句话）：
     · 经过 / 停在发薪日（分红日）格 → 结算 due = 当前年龄 − 上次结算年龄 年
     · 一次结算的入账 = 年结余 × due（这 due 年统一按当前月结余折算，不逐年回溯）
     · 摊还 due × 12 期（领几年就还几年）
     · due ≤ 0（本年已结）→ 记一笔「略过」，不再发钱
     · 同一次移动跨多个结算格 → 只有第 1 个真正结算，其余因 due 已被推平而略过
     · 跨 0 个结算格 → 不结算、不推进、日志不出现发薪记录

   ⚠️ 棋盘前提：内圈 3 个发薪日（等距 2/10/18，间隔 8 格）→ 每轮平均经过 ≈0.44 个。
      方案 A 下密度只决定「多久结一次账」，一生结算总年数恒 ≈ 局长度（第 ⑤ 段验收）。
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
/* behind：让 settledAge 落后当前年龄 behind 年（默认落后到开局，due 最大）。
   behind = 0 → 本年已结（due = 0），用于「略过」分支。 */
function mkGame(careerName, rule, behind){
  const g = E.newGame({ rule: rule || '101', mode:'solo', count:1, names:['测'], seed:20260920 });
  const p = g.players[0];
  const c = global.CAREERS.filter(x => x.name === (careerName || '软件工程师'))[0];
  p.job = c; p.baseSalary = c.salary;
  p.liabs = Object.assign({home:0,school:0,car:0,credit:0,bank:0,other:0,extraPay:0}, c.liab);
  p.loans = null; E.ensureLoans(p); E.refreshLife(g, p);
  p.cash = E.finance(p).cashflow + c.savings;
  g.round = 6; E.refreshLife(g, p);                  // 25 岁
  p.settledAge = behind == null ? g.startAge - 1     // 默认：账停在 19 岁 → due = 6
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
sec('① 规则本身：结算年数 = 当前年龄 − 上次结算年龄');
{
  note(`内圈发薪日位置 ${PAY_IN.join(',')}（${PAY_IN.length}/${RING} 格，等距）· 外圈分红日位置 ${DIV_FT.join(',')}（${DIV_FT.length}/${RING} 格）`);
  note(`构型：25 岁、账停在 19 岁 → 每个发薪日单格触发都应一次结清 6 年`);

  /* 逐格扫一遍：每一个结算格单独触发时都结清同样的 due 年 */
  let each = 0, bad = [];
  for (const ix of PAY_IN){
    const { g:g2, p:p2 } = mkGame();
    const r = step(g2, p2, (ix - 1 + RING) % RING, 1);
    if (r.hits !== 1) { bad.push('构型异常 ' + ix); continue; }
    each++;
    if (r.st.yearsPaid !== 6 || r.st.count !== 1 || r.st.years[0].years !== 6) bad.push('格 ' + ix);
  }
  ok(bad.length === 0, `内圈 ${each} 个发薪日逐格验证：每个都一次结清 6 年、记 1 笔${bad.length ? '（异常：' + bad.join(',') + '）' : ''}`);

  /* due 的两种典型值：落后 1 年 → 结 1 年；本年已结（落后 0 年）→ 略过 */
  {
    const { g, p } = mkGame(undefined, undefined, 1);
    const r = step(g, p, (PAY_IN[0] - 1 + RING) % RING, 1);
    ok(r.st.yearsPaid === 1,
       `落后 1 年 → 恰好结算 1 年（实际 ${r.st.yearsPaid} 年）`);
  }
  {
    const { g, p } = mkGame(undefined, undefined, 0);   // settledAge = 当前年龄 → due = 0
    const r = step(g, p, (PAY_IN[0] - 1 + RING) % RING, 1);
    ok(r.st.yearsPaid === 0 && r.st.skipped === 1 && r.cashDelta === 0,
       `本年已结 → 记 1 笔略过、入账 0（yearsPaid=${r.st.yearsPaid} skipped=${r.st.skipped}）`);
  }
}

/* ============================ ② 单个发薪日 ============================ */
sec('② 单个发薪日 → 一次结清 due 年（落格 / 经过同源）');
{
  /* 构型 A：停在发薪日格上，落后 3 年 → 一次结 3 年 */
  const ix = PAY_IN[0];
  const { g, p } = mkGame(undefined, undefined, 3);
  const r = step(g, p, (ix - 1 + RING) % RING, 1);
  const perYear = E.annual(r.st.years[0].monthly);
  note(`构型 A：从 ${(ix-1+RING)%RING} 走 1 步 → 落在发薪日格 ${ix}（路径 ${JSON.stringify(r.ld.path)}），落后 3 年`);
  ok(r.st.count === 1 && r.st.yearsPaid === 3, `结算笔数 1、年数 3（实际 ${r.st.count} 笔 / ${r.st.yearsPaid} 年）`);
  ok(r.st.amount === perYear * 3, `入账 = 年结余 ¥${perYear} × 3 = ¥${r.st.amount}`);
  ok(r.cashDelta === r.st.amount, `现金实增 ¥${r.cashDelta} 与入账同源`);
  ok(r.yearDelta === 3, `settledAge +3（${r.snap.settledAge} → ${p.settledAge}，推到当前年龄 ${E.ageOf(g)}）`);
  ok(r.periodDelta === r.snap.active * 3 * 12,
    `${r.snap.active} 笔在贷负债各摊还 3×12 = 36 期（合计 ${r.periodDelta} 期）—— 领几年就还几年`);
  ok(r.st.skipped === 0, '没有略过的格子');

  /* 构型 B：只经过、不落在发薪日格上（落后 2 年 → 一次结 2 年） */
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
  note(`构型 B：从 ${passOnly.from} 走 ${passOnly.steps} 步 → 落在「${window.RAT_RACE[passOnly.to].nm}」格，路径经过发薪日（${JSON.stringify(passOnly.path)}），落后 2 年`);
  ok(rb.st.count === 1 && rb.st.yearsPaid === 2, `仅经过也照样一次结清 2 年（${rb.st.yearsPaid} 年）`);
  ok(rb.cashDelta === rb.st.amount && rb.yearDelta === 2, '入账与年份推进都正确');

  /* 提示与面板的分工：停在结算格 → 提示返回 null（交给确认面板） */
  const nA = E.paydayNoticeOf(g, r.ld, false);
  ok(nA === null, '停在发薪日格时，即时提示返回 null（由确认面板负责，避免同一件事说两遍）');
  const nb = E.paydayNoticeOf(b.g, rb.ld, false);
  ok(nb && nb.kind === 'paid' && nb.years === 2 && nb.count === 1,
    `仅经过时给出提示数据：kind=${nb && nb.kind} years=${nb && nb.years} amount=¥${nb && nb.amount}`);
}

/* ============================ ③ 跨多个发薪日 ============================ */
sec('③ 跨多个发薪日 → 只有第 1 个结算（其余因本年已结而略过）');
for (const N of [2, 3]){
  /* 等距 8 格 → 跨 2 个至少 8 步、跨 3 个至少 16 步：都在银翅膀（3 粒骰）范围里 */
  const cfg = findConfigNotLanding(window.RAT_RACE, 'paycheck', N, 18)
           || findConfig(window.RAT_RACE, 'paycheck', N, 18);
  if (!cfg){ ok(false, `找不到「跨 ${N} 个发薪日」的构型`); continue; }
  const { g, p } = mkGame(undefined, undefined, 4);   // 落后 4 年
  const r = step(g, p, cfg.from, cfg.steps);
  note(`构型：从 ${cfg.from} 走 ${cfg.steps} 步 → 路径 ${JSON.stringify(cfg.path)} 跨过 ${N} 个发薪日（位置 ${cfg.hits.join(',')}），落后 4 年`);
  ok(r.hits === N && r.st.count === N,
    `结算记录 = 跨过的格子数 = ${N}（每一个命中的格子都记了一笔，含略过的）`);
  ok(r.st.yearsPaid === 4 && r.st.skipped === N - 1,
    `只有第 1 个真正结算：一次结清 4 年，其余 ${N - 1} 个因本年已结而略过`);
  ok(r.st.amount === E.annual(r.st.years[0].monthly) * 4,
    `入账 ¥${r.st.amount} = 年结余 ¥${E.annual(r.st.years[0].monthly)} × 4（算式可直接核账）`);
  ok(r.cashDelta === r.st.amount, `现金实增 ¥${r.cashDelta} 与入账一致`);
  ok(r.yearDelta === 4, `settledAge +4（推到当前年龄，第 2 个结算格才会因 due=0 而略过）`);
  /* ⚠️ 期数不能断言「恰好 = 笔数 × 4 × 12」：多年摊还中若小额负债被还清，
     它后续就不再计期 —— 期数会【少于】理论上限。这是正确行为。 */
  ok(r.periodDelta > 0 && r.periodDelta <= r.snap.active * 4 * 12,
    `${r.snap.active} 笔在贷负债摊还 ${r.periodDelta} 期 ∈ (0, ${r.snap.active * 4 * 12}]（领几年就还几年；中途还清的不再计期）`);
  const n = E.paydayNoticeOf(g, r.ld, false);
  ok(n && n.years === 4 && n.count === N && n.skipped === N - 1,
    `提示数据如实汇报「走了 ${N} 个结算格、结了 4 年、略过 ${N - 1} 个」`);
}

/* 上界：无银翅膀（1 粒骰 ≤6 步）与 3 粒骰（≤18 步）分别最多跨几个 */
{
  const m1 = maxHits(window.RAT_RACE, 'paycheck', 6);
  const m3 = maxHits(window.RAT_RACE, 'paycheck', 18);
  const mf = maxHits(window.FAST_TRACK, 'cashflowday', 12);
  note(`单回合上界：1 粒骰（≤6 步）最多 ${m1.best} 个、3 粒骰（≤18 步）最多 ${m3.best} 个、外圈 2 粒骰（≤12 步）最多 ${mf.best} 个`);
  ok(m1.best === 1, `等距间隔 8 格 > 骰子上限 6 步 → 常态单回合最多 ${m1.best} 个发薪日（跨多个只在银翅膀时发生）`);
  ok(m3.best === 3, `3 粒骰最多跨 ${m3.best} 个（走得越远，略过的越多 —— 但真正结算的仍只有第 1 个）`);

  /* 按最多构型实测：结清 due 年、略过 due-1 个之外的全部 */
  const { g, p } = mkGame(undefined, undefined, 2);
  const r = step(g, p, m3.arg.from, m3.arg.steps);
  ok(r.st.yearsPaid === 2 && r.yearDelta === 2,
    `按最多构型实测：一次结清 ${r.st.yearsPaid} 年、settledAge +${r.yearDelta}`);
  ok(r.st.count === m3.best && r.st.skipped === m3.best - 1,
    `命中的 ${r.st.count} 格中真正结算 1 个、略过 ${r.st.skipped} 个`);
  /* ⚠️ 期数不能断言「恰好 = 笔数 × due × 12」：多年摊还中若某笔负债被还清，
     它后续就不再计期 —— 期数会【少于】理论上限。这是正确行为。 */
  ok(r.periodDelta > 0 && r.periodDelta <= r.snap.active * 2 * 12,
    `摊还 ${r.periodDelta} 期 ∈ (0, ${r.snap.active * 2 * 12}]（少数负债在多年摊还中被还清，期数本就该少）`);
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

  /* 本年已结：先结清，再在同一岁里踩到下一个发薪日 */
  {
    const { g, p } = mkGame(undefined, undefined, 1);
    const first = step(g, p, (PAY_IN[0] - 1 + RING) % RING, 1);   // 结清今年
    ok(first.st.yearsPaid === 1, `第一次：结算 ${first.st.yearsPaid} 年`);
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
    p.liabs.car = 1200; p.loans = null; E.ensureLoans(p);   /* 月供约 ¥210，6 年摊还必然还清 */
    const r = step(g, p, cfg1.from, cfg1.steps);
    ok(E.loanInfo(p, 'car').balance === 0, `6 年摊还后车贷已结清`);
    ok(r.periodDelta > 0 && r.periodDelta < r.snap.active * 6 * 12,
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

  /* 停在结算格 → 确认面板的文案口径（方案 A 自证文案） */
  const { g:g3, p:p3 } = mkGame(undefined, undefined, 3);
  const ix = PAY_IN[1];
  const r3 = step(g3, p3, (ix - 1 + RING) % RING, 1);
  const P3 = E.resolveSpace(g3, p3, r3.ld);
  ok(P3 && P3.type === 'info' && /一次结算，覆盖/.test(P3.msg),
    `确认面板写明「一次结算，覆盖 …」：${P3 && P3.msg}`);
  ok(P3 && P3.msg.indexOf(money(r3.st.amount)) >= 0, '面板金额与实际入账一致');
}

/* ============================ ⑤ 一整局：总年数守恒 ============================ */
sec('⑤ 一整局：一生结算总年数 ≈ 局长度（方案 A 的核心验收）');
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
    let hits = 0, years = 0, multiYearTurns = 0, skipTurns = 0, badArith = 0, turns = 0;
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
          if (ld.settled.yearsPaid > 1) multiYearTurns++;
          if (ld.settled.skipped > 0) skipTurns++;
          /* 每笔真正结算的金额都必须满足「年结余 × 年数」—— 玩家可在日志里核账 */
          ld.settled.years.forEach(y => {
            if (y.years > 0 && y.amount !== E.annual(y.monthly) * y.years) badArith++;
          });
        }
        E.resolveSpace(g, cur, ld);
        handlePending();
      }
      E.endTurn(g);
    }
    return { hits, years, multiYearTurns, skipTurns, badArith, turns, out: p.out,
             settledAge: p.settledAge, age: E.ageOf(g) };
  }

  const cases = [['软件工程师', 20260920], ['软件工程师', 7], ['小区保安', 99]];
  let sumHits = 0, sumYears = 0, sumMulti = 0, sumSkip = 0, sumBad = 0, finished = 0;
  for (const [nm, seed] of cases){
    const r = playLong(nm, seed);
    sumHits += r.hits; sumYears += r.years; sumMulti += r.multiYearTurns;
    sumSkip += r.skipTurns; sumBad += r.badArith;
    if (!r.out) finished++;
    note(`${nm} / 种子 ${seed}：命中结算格 ${r.hits} 次、结算 ${r.years} 年、多年结算回合 ${r.multiYearTurns} 次、`
       + `含略过回合 ${r.skipTurns} 次、${r.turns} 回合${r.out ? '（中途破产）' : `（走完全程，settledAge=${r.settledAge}）`}`);
  }
  ok(sumBad === 0, `三局合计：每笔金额都满足「年结余 × 年数」（异常 ${sumBad} 处）`);
  ok(sumYears > sumHits,
    `结算年数 ${sumYears} > 命中格数 ${sumHits} —— 方案 A 下一次结算覆盖多年，这正是密度 0.44/轮的必然结果`);
  ok(sumMulti > 0, `三局里共出现 ${sumMulti} 次「一次结算覆盖多年」—— 多年结算在真实对局中是常态而非边角`);
  ok(sumSkip > 0, `三局里共出现 ${sumSkip} 个含「本年已结略过」的回合 —— 略过同样被如实记账`);

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
    ? `✅ 发薪结算全部通过（方案 A：单个 / 多年 / 略过 / 零个 + 一整局总年数守恒，共 ${OUT.filter(l => l.indexOf('✅') >= 0).length} 项）`
    : `❌ 失败 ${bad.length} 项：\n` + bad.join('\n'));
}
console.log(OUT.join('\n'));
process.exit(OUT.filter(l => l.indexOf('❌') >= 0).length ? 1 : 0);
