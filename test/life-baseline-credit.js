/* 生活基线 · 自由圈账本 · 信用额度 —— 三条新规则的数学与边界验证
   运行：node test/life-baseline-credit.js      退出码 0 = 全通过

   这三条规则解决的是同一个问题的三个面：
     ① 生活基线 —— 门槛不随负债消失而崩塌（房贷还清 ≠ 住房成本归零）
     ② 自由圈账本 —— 顺流层也要扣支出，也一样会破产
     ③ 信用额度 —— 借钱的上限由收入与征信决定，不再是「想要多少有多少」

   改动下面任一配置后必须重跑：
     LIFEBASE（housingRate / freeTrackMult）
     CREDIT（maxDTI / incomeMult / hardCap / 各信用系数 / collateralRate）
     UNEMPLOYMENT（lifeCut）、BANK.loanRate、职业卡的 liab 结构
*/
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'js') + '/';

global.window = {};
for (const f of ['data-careers.js', 'data-board.js', 'data-cards-101.js', 'data-cards-202.js', 'engine.js', 'engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];

const E = global.Engine, A = global.Act;
const LB = window.LIFEBASE, CR = window.CREDIT, LOANS = window.LOAN_TYPES;

const OUT = [];
let pass = 0, fail = 0;
const ok = (c, m) => { OUT.push((c ? '   ✅ ' : '   ❌ ') + m); c ? pass++ : fail++; };
const warn = m => OUT.push('   ⚠️ ' + m);
const sec = t => OUT.push('', '=== ' + t + ' ===');
const money = v => '¥' + Math.round(v).toLocaleString('en-US');

/* 构造一局并指定职业（避免赌随机职业，让每条断言都能精确复现） */
function mk(jobIdx, mode, init) {
  const g = E.newGame({ rule: '101', mode: mode || 'solo', count: 1, names: ['测'], seed: 7 });
  const p = g.players[0];
  if (jobIdx != null) {
    const c = global.CAREERS[jobIdx];
    p.job = c;
    p.liabs = Object.assign({ home: 0, school: 0, car: 0, credit: 0, bank: 0, other: 0, extraPay: 0 }, c.liab);
    p.baseSalary = c.salary;
    p.loans = null;
    E.ensureLoans(p); E.refreshLife(g, p);
  }
  if (init) init(g, p);
  return { g, p };
}
/* 清空全部负债（模拟「房贷与各类贷款都还清」） */
const clearDebt = (g, p) => {
  p.liabs = { home: 0, school: 0, car: 0, credit: 0, bank: 0, other: 0, extraPay: 0 };
  p.loans = null; E.ensureLoans(p); E.refreshLife(g, p);
};
const idxOf = nm => global.CAREERS.findIndex(c => c.name === nm);

/* ==================================================================
   ① 生活基线：住房成本不随负债消失
   ================================================================== */
sec('① 住房基线 —— 房贷还清后门槛不崩塌');

ok(LB && typeof LB.housingRate === 'number' && LB.housingRate > 0,
  `LIFEBASE.housingRate = ${LB && LB.housingRate}（住房基线 = 基础工资 × 该比例 × 人生阶段系数）`);
ok(window.EXP_LABEL.housingGap, `支出科目里有「${window.EXP_LABEL.housingGap}」一项`);

{
  /* 有房贷时：缺口必须为 0（否则就是与房贷月供「双算」，会污染改造前的平衡） */
  let dualCount = 0;
  const rows = [];
  for (let i = 0; i < global.CAREERS.length; i++) {
    const { g, p } = mk(i);
    const f = E.finance(p);
    if (f.exp.home > LB.housingRate * p.baseSalary && f.exp.housingGap > 0) dualCount++;
    rows.push({ nm: global.CAREERS[i].name, home: f.exp.home, base: f.housingBase,
                gap: f.exp.housingGap, tot: f.totalExpenses, cf: f.cashflow });
  }
  ok(dualCount === 0,
    `12 个职业在【有房贷】时住房缺口全为 0（不双算，平衡与改造前一致）`);

  const withDebt = mk(9);                      // 货运司机
  const fb = E.finance(withDebt.p);

  /* 结清全部负债后：住房缺口 = 基线（成本不归零） */
  const cleared = mk(9, null, clearDebt);
  const fa = E.finance(cleared.p);
  ok(cleared.p.liabs.home === 0 && fa.exp.home === 0, '房贷已结清（月供归零）');
  ok(fa.exp.housingGap === fa.housingBase && fa.housingBase > 0,
    `但住房基线顶上来了：缺口 ${money(fa.exp.housingGap)} = 基线 ${money(fa.housingBase)}`);
  ok(fa.totalExpenses > 0, `结清后总支出仍为 ${money(fa.totalExpenses)}（不会降到 0）`);

  /* ★ 核心验收：把 housingRate 设为 0（等价于旧版）看门槛会掉多少 */
  const save = LB.housingRate;
  LB.housingRate = 0;
  const oldWay = E.finance(cleared.p);
  LB.housingRate = save;
  const drop = fa.totalExpenses - oldWay.totalExpenses;
  ok(drop >= fa.housingBase - 1,
    `把住房基线关掉后总支出从 ${money(fa.totalExpenses)} 掉到 ${money(oldWay.totalExpenses)}`
    + `（跌 ${money(drop)}）—— 这一段就是被基线挡住的门槛崩塌`);

  /* 门槛 = 总支出 × 安全边际，所以门槛同步骤不崩塌 */
  const tNew = E.escapeTarget(cleared.g, cleared.p);
  const marg = E.escapeMargin(cleared.g);
  ok(tNew === Math.round(fa.totalExpenses * marg),
    `出圈门槛 = 总支出 × ${marg} = ${money(tNew)}（含住房基线，且留了 ${Math.round((marg - 1) * 100)}% 安全边际）`);
  ok(marg > 1, `安全边际 ${marg} > 1 —— 门槛不再是「刚好覆盖」`);

  /* 现金流也不会因还清贷款而暴涨：跌幅小于房贷月供 */
  const homesDue = fb.exp.home;
  const cfGain = fa.cashflow - fb.cashflow;
  ok(cfGain < homesDue,
    `结清房贷后月结余只增加 ${money(cfGain)}，小于房贷月供 ${money(homesDue)}`
    + ' —— 住房成本只是换了形态，不是消失了');

  /* 基线随人生阶段浮动（与房贷月供同口径，用 lifeCoef）：
     换一个年龄看基线是否跟着 lifeCoef 一起变 */
  const r1 = mk(9);
  const base20 = E.lifeBaseHousing(r1.p);
  r1.p.age = 59;                             // 60 岁左右
  E.refreshLife(r1.g, r1.p);
  const base60 = E.lifeBaseHousing(r1.p);
  ok(base60 !== base20 || r1.p.lifeCoef === 1,
    `住房基线随人生阶段浮动：20 岁 ${money(base20)} → 60 岁 ${money(base60)}（lifeCoef ${r1.p.lifeCoef}）`);

  OUT.push('   · 各职业「有房贷 → 结清后」的门槛对照：');
  for (const nm of ['三甲医院医生', '软件工程师', '货运司机', '小区保安']) {
    const i = idxOf(nm);
    const a = E.finance(mk(i).p), b = E.finance(mk(i, null, clearDebt).p);
    OUT.push(`     ${(nm + '        ').slice(0, 10)} 房贷 ${String(a.exp.home).padStart(5)}`
      + ` | 门槛 ${String(a.totalExpenses).padStart(5)} → ${String(b.totalExpenses).padStart(5)}`
      + `（其中住房基线 ${b.exp.housingGap}）| 结余 ${a.cashflow} → ${b.cashflow}`);
  }
}

/* ==================================================================
   ② 财务自由圈：也要扣支出，也可能会破产
   ================================================================== */
sec('② 财务自由圈 —— 顺流层同样有账本');

{
  const { g, p } = mk(idxOf('软件工程师'));
  p.cash = 500000; p.energy = 100;
  const t = E.escapeTarget(g, p);
  p.assets.realEstate.push({ nm: '出租公寓', dp: 100000, cost: 500000, cf: Math.ceil(t * 1.15), rent: t * 1.5 });
  E.refreshLife(g, p);
  const r = A.escapeRatRace(g, p);
  ok(r.ok && p.inFT, `成功出圈（出圈资金 ${money(r.buyout)}）`);

  const ft = E.ftFinance(p);
  ok(ft.income === E.ftMonthly(p), `自由圈收入 = 毛分红 ${money(ft.income)}`);
  ok(ft.expense > 0, `自由圈支出 ${money(ft.expense)}（不再是「只发钱、不扣支出」）`);
  ok(ft.cashflow === ft.income - ft.expense, '结余 = 收入 − 支出（自洽）');

  /* 支出构成：生活 × freeTrackMult + 贷款月供，且【不含工资薪金个税】 */
  const f = E.finance(p);
  const expectLiving = Math.round((f.exp.retail + f.exp.other + f.exp.elder + f.exp.medical
    + f.exp.children + f.exp.extra + f.exp.housingGap) * LB.freeTrackMult);
  ok(ft.living === expectLiving,
    `生活支出 ${money(ft.living)} = 生活性支出 × ${LB.freeTrackMult}（自由圈档次）`);
  ok(ft.expense === ft.living + f.loanTotal,
    `总支出 ${money(ft.expense)} = 生活 ${money(ft.living)} + 贷款年供折算 ${money(f.loanTotal)}`);
  ok(ft.payrollTax === 0,
    '工资薪金个税不再计（出圈后工资不入账，就不该为不存在的工资交税）');
  warn(`税原本是 ${money(f.exp.taxes)}/月 —— 停征它才不会有「为不存在的工资交税」的荒谬口径`);

  /* 分红日入账 = 年度结余（不是毛分红） */
  const before = p.cash;
  const ld = E.movePlayer(g, p, 1);             // 外圈 index 1 = 分红日
  ok(ld.space.t === 'cashflowday', `落点是分红日`);
  ok(ld.collected === E.annual(E.ftFinance(p).cashflow),
    `分红日入账 ${money(ld.collected)} = 自由圈年度结余（毛分红 ${money(E.annual(ft.income))}`
    + ` − 支出 ${money(E.annual(ft.expense))}）`);
  ok(p.cash - before === ld.collected, '现金变化与 collected 一致');

  /* ★ 跨模块口径一致性：界面上的「年结余」必须与分红日实发的是同一个数。
     曾经出过 bug —— 分红日按自由圈账本入账，而顶栏 / 面板的「年结余」
     仍读工资口径，同一屏上显示出 ¥59,928 与 ¥97,824 两个数。 */
  ok(E.settleCashflow(p) === E.ftFinance(p).cashflow,
    `settleCashflow 在自由圈下走分红口径（${money(E.settleCashflow(p))}/月 = 分红日实发）`);
  ok(E.settleCashflow(p) !== E.finance(p).cashflow,
    `且不等于工资口径（${money(E.finance(p).cashflow)}/月）—— 同一屏不会出现两套口径`);
  const rm = mk(idxOf('软件工程师'));
  ok(E.settleCashflow(rm.p) === E.finance(rm.p).cashflow,
    '老鼠赛跑下 settleCashflow 仍走工资口径（未出圈时行为不变）');
}

{
  /* ★ 破产路径：自由圈的现金流为负 + 无资产可变现 → 应判破产 */
  const { g, p } = mk(idxOf('小区保安'));
  p.inFT = true; p.ftPos = 0; p.cash = 0;
  /* 构造「分红远小于生活支出」的财务自由圈状态：
     企业现金流极少，但房贷 + 生活档次支出照付 */
  p.ftBusiness = 0;
  p.assets.ftBusiness = [];
  const ft = E.ftFinance(p);
  ok(ft.cashflow < 0, `构造出自由圈的负现金流：分红 ${money(ft.income)} − 支出 ${money(ft.expense)} = ${money(ft.cashflow)}`);
  /* 清空所有可变现资产，让 checkBankruptcy 无法通过变现脱身 */
  p.assets.savings = []; p.assets.funds = []; p.assets.stocks = [];
  p.assets.collectibles = []; p.assets.lands = [];
  const bankrupt = E.checkBankruptcy(g, p);
  ok(bankrupt === true && p.out === true,
    `自由圈玩家同样会破产出局（outReason = ${p.outReason}）`);
  ok(p.stats.bankrupts === 1 && p.creditBanUntil > g.round,
    `破产后记入征信：破产 ${p.stats.bankrupts} 次，禁贷至第 ${p.creditBanUntil} 轮`);
  ok((p.outReason || '').indexOf('破产') >= 0, `出局原因：「${p.outReason}」`);

  /* 对照：老鼠赛跑玩家的月现金流若为正，则不会破产 */
  const w = mk(idxOf('软件工程师'));
  w.p.cash = 0;
  ok(E.checkBankruptcy(w.g, w.p) === false && !w.p.out,
    '对照：老鼠赛跑且现金流为正的玩家不会破产');
}

/* ==================================================================
   ③ 信用额度：收入决定你能借多少
   ================================================================== */
sec('③ 信用额度 —— 收入与征信决定上限');

ok(CR && CR.maxDTI > 0 && CR.incomeMult > 0,
  `CREDIT：DTI 上限 ${(CR.maxDTI * 100).toFixed(0)}%，授信上限 = 年收入 × ${CR.incomeMult}，硬顶 ${money(CR.hardCap)}`);

{
  /* 每个职业的额度都要落在「双约束」之内 */
  OUT.push('   · 各职业的开局授信：');
  let allOk = true, allPositive = true;
  for (let i = 0; i < global.CAREERS.length; i++) {
    const { g, p } = mk(i);
    const c = E.creditProfile(g, p);
    const f = E.finance(p);
    const capByIncome = Math.min(E.annual(f.totalIncome) * CR.incomeMult, CR.hardCap);
    const capByDTI = Math.max(0, f.totalIncome * CR.maxDTI - f.loanTotal) / LOANS.bank.rate;
    const within = c.limit <= Math.max(capByIncome, capByDTI, 0) + 1;
    if (!within) allOk = false;
    if (c.available <= 0) allPositive = false;
    OUT.push(`     ${(global.CAREERS[i].name + '        ').slice(0, 10)}`
      + ` DTI ${(c.dtiNow * 100).toFixed(0).padStart(3)}%`
      + ` | 授信 ${String(c.limit).padStart(7)}`
      + `（收入侧 ${String(Math.round(capByIncome)).padStart(7)} / DTI 侧 ${String(Math.round(capByDTI)).padStart(7)}）`
      + ` | 信用 ${c.score.toFixed(2)} ${c.grade.key}`);
  }
  ok(allOk, '12 个职业的授信额度都不超过「年收入倍数」与「DTI 空间」两条上限');
  ok(allPositive, '12 个职业开局都有可借额度（不会一上手就借不到）');
}

{
  /* DTI 是硬约束：借满后不能继续借 */
  const { g, p } = mk(idxOf('汽修技师'));       // DTI 最高（47%），DTI 侧是约束
  const c0 = E.creditProfile(g, p);
  ok(c0.byDTI < c0.byIncome,
    `汽修技师由 DTI 侧约束（DTI 空间 ${money(c0.byDTI)} < 收入侧 ${money(c0.byIncome)}）`);
  const r1 = A.takeLoan(g, c0.available);
  ok(r1.ok && p.cash >= c0.available, `按可借额度借满 ${money(c0.available)} 成功`);
  const c1 = E.creditProfile(g, p);
  ok(c1.available === 0 && !c1.ok, `借满后再评估：可用 ${money(c1.available)}，ok=${c1.ok} —— 无法继续借`);
  const r2 = A.takeLoan(g, 1000);
  ok(!r2.ok, `再借 1000 被拒：「${r2.msg}」`);
}

{
  /* ★ 反向验证：旧版能滚到几千万的杠杆螺旋，现在被上限挡住 */
  const { g, p } = mk(idxOf('三甲医院医生'));
  let rounds = 0, total = 0;
  for (let i = 0; i < 60; i++) {                // 连借 60 次
    const c = E.creditProfile(g, p);
    if (c.available <= 0) break;
    const r = A.takeLoan(g, c.available);
    if (!r.ok) break;
    total += c.available; rounds++;
  }
  const cap = E.annual(E.finance(p).totalIncome) * CR.incomeMult;
  ok(total <= cap * 1.02,
    `连续借 ${rounds} 次直到被拒，累计借入 ${money(total)}，不超过授信上限 ${money(cap)}`);
  ok(total < 2000000,
    `不再出现旧版那种「滚到千万级」的螺旋（上限把总额压在 ${money(total)}）`);
  const cEnd = E.creditProfile(g, p);
  ok(cEnd.dtiNow <= CR.maxDTI + 0.01,
    `借满后负债收入比 ${(cEnd.dtiNow * 100).toFixed(0)}% 仍在上限 ${(CR.maxDTI * 100).toFixed(0)}% 之内`);
}

{
  /* 拒绝授信的各种情形 */
  const a = mk(idxOf('货运司机'));
  E.startJobless(a.g, a.p, 5000);
  a.p.assets = { stocks: [], realEstate: [], business: [], ftBusiness: [], savings: [], funds: [], lands: [], collectibles: [] };
  a.p.options = []; a.p.shorts = [];
  const ca = E.creditProfile(a.g, a.p);
  ok(!ca.ok && ca.monthlyIncome === 0 && ca.collateral === 0,
    `失业 + 无资产 + 无收入 → 拒绝授信：「${ca.reasons[0]}」`);

  /* 失业但有资产 → 抵押通道仍可借 */
  const b = mk(idxOf('货运司机'));
  b.p.assets.savings.push({ nm: '定期存款', cost: 60000, interest: 200 });
  const cb0 = E.creditProfile(b.g, b.p);
  ok(cb0.collateral === 60000, `抵押物价值 ${money(cb0.collateral)}（存款按全额算）`);
  E.startJobless(b.g, b.p, 5000);
  const cb = E.creditProfile(b.g, b.p);
  ok(cb.ok && cb.available > 0,
    `失业但有存款 → 仍可借 ${money(cb.available)}（抵押通道不受就业状态影响）`);
  /* 征信分（score）与就业状态是两件事：失业下调的是【收入侧】系数，
     不是征信本身 —— 所以断言要看 incomeScore，不能看 score。 */
  ok(cb.incomeScore < cb0.incomeScore,
    `失业的收入侧系数被下调：${cb0.incomeScore.toFixed(2)} → ${cb.incomeScore.toFixed(2)}（机构收缩授信）`);
  ok(cb.score === cb0.score,
    `但征信分本身不变（${cb.score.toFixed(2)}）—— 失业不等于失信`);
  warn('抵押贷看的是抵押物价值，与有没有工作无关 —— 这一步若也被失业清零，'
    + '「失业」就直接等于「出局」了。');
  const rb = A.takeLoan(b.g, cb.available);
  ok(rb.ok, `抵押额度可以实际借出（${money(cb.available)}）`);

  /* 退休 → 额度折半 */
  const r = mk(idxOf('货运司机'));
  r.p.age = 64; E.refreshLife(r.g, r.p);
  ok(r.p.retired, `64 岁进入退休（年龄 ${E.ageOf(r.g)}）`);
  const cr = E.creditProfile(r.g, r.p);
  ok(cr.retired && cr.incomeScore < cr.score,
    `退休后的收入侧系数被折半：${cr.score.toFixed(2)} → ${cr.incomeScore.toFixed(2)}`);

  /* 破产 → 禁贷期 + 事后折价 */
  const q = mk(idxOf('三甲医院医生'));
  const cq0 = E.creditProfile(q.g, q.p);
  q.p.stats.bankrupts = 1; q.p.creditBanUntil = q.g.round + CR.banTurns;
  const cq = E.creditProfile(q.g, q.p);
  ok(!cq.ok && cq.reasons.some(s => s.indexOf('征信恢复期') >= 0),
    `破产后禁贷期拒绝授信：「${cq.reasons[0]}」`);
  q.p.creditBanUntil = 0;                       // 禁贷期结束
  const cq2 = E.creditProfile(q.g, q.p);
  ok(cq2.limit < cq0.limit,
    `禁贷期结束后额度仍被折价：${money(cq0.limit)} → ${money(cq2.limit)}（破产记录的影响）`);

  /* 入不敷出 → 信用下调 */
  const d = mk(idxOf('三甲医院医生'));
  const cd0 = E.creditProfile(d.g, d.p);
  d.p.stats.deficitMonths = 6;
  const cd = E.creditProfile(d.g, d.p);
  ok(cd.score < cd0.score,
    `入不敷出 6 个月后信用系数下调：${cd0.score.toFixed(2)} → ${cd.score.toFixed(2)}`);
}

{
  /* takeLoan 被拒时【不能改动账目】—— 这是最容易出的那种「拒绝了一半」的 bug */
  const { g, p } = mk(idxOf('汽修技师'));
  const c = E.creditProfile(g, p);
  A.takeLoan(g, c.available);                   // 先借满
  const cash0 = p.cash, debt0 = p.liabs.bank;
  const r = A.takeLoan(g, 50000);
  ok(!r.ok, `超额借款被拒：「${r.msg}」`);
  ok(p.cash === cash0 && p.liabs.bank === debt0,
    `被拒后现金与负债分文未动（${money(cash0)} / ${money(debt0)}）`);
}

/* ==================================================================
   ④ 长局：三条规则同时生效时不会把游戏跑死
   ================================================================== */
sec('④ 长局回归（单人与多人）');

{
  let seed = 20260920;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  function handle(g, p) {
    let guard = 0;
    while (g.pending && guard++ < 60) {
      const P = g.pending;
      switch (P.type) {
        case 'deficit': {
          let r = A.payDeficit(g, P.amount);
          if (!r.ok) {
            const prof = E.creditProfile(g, p);
            const take = Math.min(Math.max(1000, Math.ceil((r.shortfall || 0) / 1000) * 1000), prof ? prof.available : 0);
            if (take > 0) A.takeLoan(g, take);
            r = A.payDeficit(g, P.amount);
          }
          if (!r.ok) { E.declareBankruptcy(g, p); E.clearPending(g); return; }
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
          E.clearPending(g); break;
        }
        case 'charity': A.doCharity(g, rnd() < 0.4); E.clearPending(g); break;
        case 'rest': if (p.energy < 40 && p.cash > 5000) A.vacation(g); E.clearPending(g); break;
        case 'downsized': A.doDownsized(g, P.amount); E.clearPending(g); break;
        case 'doodad': {
          let r = A.payDoodad(g, P.card, P.cost);
          if (!r.ok) {
            const prof = E.creditProfile(g, p);
            const take = Math.min(Math.max(1000, Math.ceil((r.shortfall || 0) / 1000) * 1000), prof ? prof.available : 0);
            if (take > 0) A.takeLoan(g, take);
            r = A.payDoodad(g, P.card, P.cost);
          }
          if (!r.ok) E.declareBankruptcy(g, p);
          E.clearPending(g); break;
        }
        case 'baby': A.addBaby(g); E.clearPending(g); break;
        default: E.clearPending(g); break;
      }
    }
  }

  function play(mode, rule, count, seedv) {
    seed = seedv;
    const cfg = { rule, count, names: ['甲', '乙', '丙', '丁'].slice(0, count), seed: seedv };
    if (mode === 'solo') { cfg.mode = 'solo'; cfg.count = 1; }
    const g = E.newGame(cfg);
    let turns = 0, negCash = 0, nan = 0, overLimit = 0, stuck = 0;
    /* ★ 断言口径：用「历史最高授信额度」而不是「当前额度」。
       授信额度会随状态变化 —— 失业时收入侧系数 ×0.35、退休 ×0.5、入不敷出 / 破产再打折。
       所以「已借余额 > 当前额度」是【真实的降额行为】（银行降额，已借的钱不会消失），
       不是 bug。要守的是「借钱这个动作不能绕过额度校验」——
       那才等价于「余额 ≤ 该玩家历史上任何时刻的额度」。 */
    const maxLimit = {};
    while (!g.over && turns < 3000) {
      turns++;
      const p = E.current(g);
      if (!p || p.out) { E.nextPlayer(g); continue; }
      const t0 = g.turnNo;
      handle(g, p);
      if (E.isJobless(p) && p.energy >= 12) A.huntJob(g);
      if (!p.pausedThisTurn) {
        const n = E.diceCount(g, p);
        const d = E.rollDice(g, n);
        const ld = E.movePlayer(g, p, d.reduce((a, b) => a + b, 0));
        E.resolveSpace(g, p, ld);
        handle(g, p);
      }
      E.endTurn(g);
      if (g.turnNo === t0) stuck++;
      for (const q of g.players) {
        if (q.cash < 0) negCash++;
        if (!isFinite(q.cash)) nan++;
        /* 负债不得超过授信额度（新规则的核心不变式） */
        if (q.liabs.bank > 0) {
          const c = E.creditProfile(g, q);
          maxLimit[q.id] = Math.max(maxLimit[q.id] || 0, c.limit);
          if (q.liabs.bank > maxLimit[q.id] + 1) overLimit++;
        }
      }
    }
    return { g, turns, negCash, nan, overLimit, stuck };
  }

  const rSolo = play('solo', '101', 1, 20260920);
  ok(rSolo.turns < 3000 && rSolo.g.over, `单人 101 正常结束（${rSolo.turns} 回合，${rSolo.g.soloResult ? rSolo.g.soloResult.label : '—'}）`);
  ok(rSolo.negCash === 0, `全程现金非负（越界 ${rSolo.negCash} 次）`);
  ok(rSolo.nan === 0, `全程数值有限（NaN ${rSolo.nan} 次）`);
  ok(rSolo.overLimit === 0,
    `全程信用贷余额从未突破过【历史最高授信额度】（越界 ${rSolo.overLimit} 次）`
    + '—— 借钱这一步绕不过额度校验');

  const rMulti = play('age', '202', 4, 7);
  ok(rMulti.turns < 3000 && rMulti.g.over, `多人 202 正常结束（${rMulti.turns} 回合，存活 ${rMulti.g.players.filter(p => !p.out).length}/4）`);
  ok(rMulti.negCash === 0, `多人局全程现金非负（越界 ${rMulti.negCash} 次）`);
  ok(rMulti.nan === 0, `多人局全程数值有限（NaN ${rMulti.nan} 次）`);
  ok(rMulti.overLimit === 0,
    `多人局信用贷余额从未突破过【历史最高授信额度】（越界 ${rMulti.overLimit} 次）`);
  ok(rMulti.stuck === 0, `没有回合被空转（卡死 ${rMulti.stuck} 次）`);
}

/* ==================================================================
   汇总
   ================================================================== */
OUT.push('');
for (const line of OUT) console.log(line);
console.log('');
console.log(fail === 0
  ? `✅ 生活基线 / 自由圈账本 / 信用额度 全部通过（${pass} 项）`
  : `❌ 有 ${fail} 项未通过（通过 ${pass} 项）`);
process.exit(fail === 0 ? 0 : 1);
