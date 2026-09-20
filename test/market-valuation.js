/* ==========================================================================
   test/market-valuation.js — 资产动态估值 / 多头借贷识别 / 退休与终局结算
   --------------------------------------------------------------------------
   零依赖，Node 直跑：

     node test/market-valuation.js        # 退出码 0 = 全通过

   覆盖三组机制：
     ① 资产动态估值（市场周期 + 行情冲击 + 折旧 + 抵押折扣）
     ② 多头借贷识别（产品数 / 近期申请 / 使用率 → 降额与拒贷）
     ③ 退休突变点结算 + 终局结清（口径与残差）

   改动下列任何一项后**必须重跑**：
     MARKET（周期 / 折旧 / 抵押折扣）、CREDIT.multi、SOLO.retireAge、
     资产卡的价格字段、UMPLOYMENT（因为失业也会走突变点结算）
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'js') + '/';

global.window = {};
for (const f of ['data-careers.js','data-board.js','data-cards-101.js','data-cards-202.js','engine.js','engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];

const E = global.Engine, A = global.Act;
const M = window.MARKET, C = window.CREDIT;
const money = E.money;
const OUT = [];
let fails = 0, passes = 0;

const ok = (c, m) => { if (c) { passes++; OUT.push('   ✅ ' + m); } else { fails++; OUT.push('   ❌ ' + m); } };
const sec = t => OUT.push('', '=== ' + t + ' ===');
const warn = m => OUT.push('   ⚠️ ' + m);
const idxOf = n => window.CAREERS.findIndex(c => c.name === n);

/* 造一个单人局并把玩家换成指定职业（去掉职业卡自带的负债，便于隔离变量） */
function solo(name, seed){
  const g = E.newGame({ rule:'101', mode:'solo', count:1, names:['测'], seed: seed || 7 });
  const p = g.players[0];
  if (name) {
    const c = window.CAREERS[idxOf(name)];
    p.job = c; p.baseSalary = c.salary;
    p.liabs = Object.assign({ home:0, school:0, car:0, credit:0, bank:0, other:0, extraPay:0 }, c.liab);
    p.loans = null; E.ensureLoans(p);
  }
  E.refreshLife(g, p);
  return { g, p };
}

/* ───────────────────────── ① 资产动态估值 ───────────────────────── */

sec('① 市场周期：确定性、相位错开、存款不参与');
{
  const { g, p } = solo('软件工程师');
  /* 确定性：同一轮次反复求值必须一致（否则存档 / 复盘 / 回归都不可复现） */
  g.round = 17;
  const a1 = E.marketIndex(g, 'realEstate'), a2 = E.marketIndex(g, 'realEstate');
  ok(a1 === a2, `同轮次反复求值一致（${a1.toFixed(4)}）—— 未引入随机数`);

  /* 周期确实在变，且在振幅范围内 */
  const vals = [];
  for (let r = 1; r <= 33; r++) { g.round = r; vals.push(E.marketCycleOf(g, 'realEstate')); }
  const amp = M.cycle.amp;
  ok(Math.min(...vals) >= 1 - amp - 1e-9 && Math.max(...vals) <= 1 + amp + 1e-9,
     `房产指数落在 [${(1-amp).toFixed(2)}, ${(1+amp).toFixed(2)}] 内（实测 ${Math.min(...vals).toFixed(3)} — ${Math.max(...vals).toFixed(3)}）`);
  ok(Math.max(...vals) - Math.min(...vals) > amp,
     `周期确实在波动（极差 ${(Math.max(...vals)-Math.min(...vals)).toFixed(3)}）`);

  /* 相位错开：房产与土地不应同步（同轮次两个指数不同） */
  let sameCount = 0;
  for (let r = 1; r <= 16; r++) {
    g.round = r;
    if (Math.abs(E.marketCycleOf(g, 'realEstate') - E.marketCycleOf(g, 'lands')) < 1e-9) sameCount++;
  }
  ok(sameCount === 0, '房产与土地的相位错开（16 个轮次里没有一次同步）');

  /* 存款 / 理财不参与周期。
     ⚠️ 取轮次要避开周期的过零点：8 年周期下第 9 / 17 / … 轮房产指数恰好 = 1，
        用它做「是否波动」的断言会得到假失败。 */
  g.round = 11;
  ok(E.marketCycleOf(g, 'savings') === 1 && E.marketCycleOf(g, 'funds') === 1,
     '存款 / 理财的本金不随行情波动（flat 生效）');
  ok(E.marketCycleOf(g, 'realEstate') !== 1, '但房产 / 企业仍随行情波动');
}

sec('② 配置表键名与 ASSET_KINDS 对齐（写错键名会被静默忽略）');
{
  const tables = { 'cycle.phase': M.cycle.phase, decay: M.decay, haircut: M.haircut };
  Object.keys(tables).forEach(tn => {
    const t = tables[tn];
    const bad = Object.keys(t).filter(k => E.ASSET_KINDS.indexOf(k) < 0);
    ok(bad.length === 0, `${tn} 的键都在 ASSET_KINDS 内${bad.length ? '（越界：' + bad.join(',') + '）' : ''}`);
  });
  /* 每一类资产都应有折旧率与抵押折扣，否则会被静默当作 0 / 默认值 */
  const flat = M.cycle.flat || [];
  const missDecay = E.ASSET_KINDS.filter(k => M.decay[k] === undefined);
  const missHair  = E.ASSET_KINDS.filter(k => M.haircut[k] === undefined);
  const missPhase = E.ASSET_KINDS.filter(k => M.cycle.phase[k] === undefined && flat.indexOf(k) < 0);
  ok(missDecay.length === 0, `每类资产都有折旧率${missDecay.length ? '（缺 ' + missDecay.join(',') + '）' : ''}`);
  ok(missHair.length === 0, `每类资产都有抵押折扣${missHair.length ? '（缺 ' + missHair.join(',') + '）' : ''}`);
  ok(missPhase.length === 0, `每类非 flat 资产都有周期相位${missPhase.length ? '（缺 ' + missPhase.join(',') + '）' : ''}`);
}

sec('③ 折旧按持有年数计提');
{
  const { g, p } = solo('软件工程师');
  p.assets.business.push(E.stampAsset(g, { nm:'便利店', cost:200000, cf:8000 }));
  p.assets.lands.push(E.stampAsset(g, { nm:'土地', cost:100000 }));
  g.round = 1;
  const b1 = E.appraiseAsset(g, 'business', p.assets.business[0]);
  ok(b1.years === 0 && Math.abs(b1.decay - 1) < 1e-9, `买入当年不折旧（持有 0 年，折旧因子 ${b1.decay.toFixed(3)}）`);
  g.round = 11;                                   // 持有 10 年
  const b2 = E.appraiseAsset(g, 'business', p.assets.business[0]);
  const want = Math.pow(1 - M.decay.business, 10);
  ok(b2.years === 10 && Math.abs(b2.decay - want) < 1e-9,
     `企业持有 10 年 → 折旧因子 ${b2.decay.toFixed(3)}（= (1 − ${M.decay.business})^10 = ${want.toFixed(3)}）`);
  const l2 = E.appraiseAsset(g, 'lands', p.assets.lands[0]);
  ok(l2.decay > 1, `土地按负折旧（长期微涨）→ 因子 ${l2.decay.toFixed(3)} > 1`);
  const re = { nm:'房', dp:100000, cost:500000 }; p.assets.realEstate.push(E.stampAsset(g, re));
  const r2 = E.appraiseAsset(g, 'realEstate', p.assets.realEstate[0]);
  ok(Math.abs(r2.decay - 1) < 1e-9, '房产不折旧（折旧因子恒为 1）');
  ok(r2.book === 500000, `房产账面取总价而不是首付（${money(r2.book)}）`);
}

sec('④ 抵押折扣：房产按已付首付的权益比例，其余按处境难度');
{
  const { g, p } = solo('软件工程师');
  g.round = 1;
  p.assets.realEstate.push(E.stampAsset(g, { nm:'房', dp:100000, cost:500000, cf:0, rent:0 }));
  const cv1 = E.collateralValue(g, p);
  /* 房产：500,000 × 1.00（指数，第 1 轮相位 0）× 权益比例 0.2 = 100,000 */
  ok(cv1 === 100000, `房产按权益比例折算：${money(cv1)}（= 总价 × 20% 首付比例）`);
  p.assets.realEstate.length = 0;
  p.assets.savings.push(E.stampAsset(g, { nm:'存单', cost:150000, interest:600 }));
  ok(E.collateralValue(g, p) === 150000, `存款按 100% 折算：${money(E.collateralValue(g, p))}`);
  p.assets.savings.length = 0;
  p.assets.business.push(E.stampAsset(g, { nm:'店', cost:200000, cf:0 }));
  /* 期望值必须带上市场指数：各类资产相位不同，第 1 轮只有房产（相位 0）指数恰好为 1 */
  const wantBiz = Math.round(E.appraiseAsset(g, 'business', p.assets.business[0]).value * M.haircut.business);
  ok(E.collateralValue(g, p) === wantBiz,
     `企业按处置难度 ${Math.round(M.haircut.business*100)}% 折算：${money(E.collateralValue(g, p))}`
     + `（= 估值 ${money(E.appraiseAsset(g,'business',p.assets.business[0]).value)} × ${M.haircut.business}）`);
}

sec('⑤ 行情冲击：可累乘 + 有上下限 + 影响抵押额度');
{
  const { g, p } = solo('软件工程师');
  g.round = 10;
  p.assets.realEstate.push(E.stampAsset(g, { nm:'房', dp:100000, cost:500000, cf:3000, rent:6000 }));
  E.refreshLife(g, p);
  const before = E.collateralValue(g, p);
  const cpBefore = E.creditProfile(g, p);

  /* 租金下行 → 估值联动下调（租金与估值的相关性在现实中很强） */
  const impact = A.marketImpact(g, { kind:'rentDelta', pct:-0.2, nm:'保障性租赁住房入市' });
  E.refreshLife(g, p);
  const after = E.collateralValue(g, p);
  const cpAfter = E.creditProfile(g, p);
  ok(after < before, `租金 −20% → 可抵押净值 ${money(before)} → ${money(after)}`);
  ok(impact.note.indexOf('估值联动') >= 0, `行情卡说明里写明了估值联动：${impact.note}`);
  ok(cpAfter.limit <= cpBefore.limit, `授信额度随之收缩：${money(cpBefore.limit)} → ${money(cpAfter.limit)}`);

  /* clamp：反复叠加不会漂移到荒谬区间 */
  for (let i = 0; i < 40; i++) E.bumpMarket(g, 'realEstate', 0.9);
  const cl = M.shockClamp;
  ok(E.marketShockOf(g, 'realEstate') >= cl[0] - 1e-9,
     `连续 40 次 −10% 后仍不低于下限 ${cl[0]}（实测 ${E.marketShockOf(g,'realEstate').toFixed(3)}）`);
  for (let i = 0; i < 200; i++) E.bumpMarket(g, 'realEstate', 1.2);
  ok(E.marketShockOf(g, 'realEstate') <= cl[1] + 1e-9,
     `连续 200 次 +20% 后仍不高于上限 ${cl[1]}（实测 ${E.marketShockOf(g,'realEstate').toFixed(3)}）`);
  /* 估值必须始终非负有限 */
  const ap = E.appraiseAll(g, p);
  ok(isFinite(ap.value) && ap.value >= 0, `极端行情下估值仍为非负有限值（${money(ap.value)}）`);
}

sec('⑥ 估值必须给每项资产打上买入轮次（否则折旧年限会算错）');
{
  const g = E.newGame({ rule:'202', mode:'solo', count:1, names:['测'], seed:3 });
  const p = g.players[0];
  const all = [];
  E.ASSET_KINDS.forEach(k => (p.assets[k] || []).forEach(it => all.push({ k, it })));
  ok(all.length > 0, `202 组合卡开局就带来了 ${all.length} 项资产`);
  ok(all.every(x => x.it.buyRound != null), '组合卡的资产都已有买入轮次（不会在首次买入时被误标为当前轮次）');
  ok(all.every(x => x.it.buyRound === 1), '组合卡的买入轮次记为第 1 轮（从 20 岁起算折旧）');
}

/* ───────────────────────── ② 多头借贷识别 ───────────────────────── */

sec('⑦ 多头借贷：三个维度各自生效');
{
  const { g, p } = solo('软件工程师');
  g.round = 3;

  /* 基线：职业卡自带信用卡分期（1 个信用类产品）→ 不降额 */
  const base = E.multiBorrowingOf(g, p, E.finance(p));
  ok(base.nProducts === 1 && base.products.indexOf('credit') >= 0,
     `职业卡自带 ${base.nProducts} 个信用类产品（信用卡分期）`);
  ok(base.mult === 1 && base.level === '正常', `基线不降额（×${base.mult.toFixed(2)} / ${base.level}）`);

  /* ① 产品数：再借信用贷 → 2 个产品 → 降额 */
  const prof0 = E.creditProfile(g, p);
  A.takeLoan(g, Math.min(3000, prof0.available));
  const afterLoan = E.multiBorrowingOf(g, p, E.finance(p));
  ok(afterLoan.nProducts === 2, `借信用贷后变成 ${afterLoan.nProducts} 个信用类产品`);
  ok(afterLoan.productMult < 1, `产品数带来的降额系数 ${afterLoan.productMult.toFixed(3)}（×${C.multi.productStep}^1）`);

  /* ② 近期申请次数：连续借 → 次数惩罚 */
  for (let r = 4; r <= 6; r++) {
    g.round = r;
    const pr = E.creditProfile(g, p);
    if (pr.ok && pr.available > 0) A.takeLoan(g, Math.min(2000, pr.available));
  }
  const many = E.multiBorrowingOf(g, p, E.finance(p));
  ok(many.draws >= 3, `近期申请次数已累计到 ${many.draws} 次（窗口 ${many.drawWindow} 回合）`);
  ok(many.drawMult < 1, `近期申请次数带来的降额系数 ${many.drawMult.toFixed(3)}`);

  /* ③ 使用率：把额度用掉很大比例 */
  const pr2 = E.creditProfile(g, p);
  if (pr2.available > 0 && pr2.ok) A.takeLoan(g, Math.min(pr2.available, Math.round(many.base * 0.7)));
  const util = E.multiBorrowingOf(g, p, E.finance(p));
  ok(util.util > 0, `额度使用率 ${(util.util * 100).toFixed(0)}%（相对「按收入本可获得的额度」）`);
  ok(util.utilMult <= 1, `使用率系数 ${util.utilMult.toFixed(3)}（未超阈值时为 1）`);

  /* 三者相乘 = 总系数，且有下限 */
  const prod = util.productMult * util.drawMult * util.utilMult;
  ok(Math.abs(util.mult - Math.max(0.05, Math.min(1, prod))) < 1e-9,
     `总系数 = 三维度相乘（${util.productMult.toFixed(2)} × ${util.drawMult.toFixed(2)} × ${util.utilMult.toFixed(2)} = ${util.mult.toFixed(3)}）`);
  ok(util.mult > 0, `总系数有下限，不会被压到 0（${util.mult.toFixed(3)}）`);
}

sec('⑧ 多头借贷：只统计信用类，抵押类负债不计入');
{
  const { g, p } = solo('软件工程师');
  const m = E.multiBorrowingOf(g, p, E.finance(p));
  const isMortgageOnly = m.products.every(k => C.multi.counted.indexOf(k) >= 0);
  ok(isMortgageOnly, `在贷产品只有信用类（${m.products.join(',') || '无'}）`);
  ok(m.products.indexOf('home') < 0 && m.products.indexOf('car') < 0 && m.products.indexOf('school') < 0,
     '房贷 / 车贷 / 助学贷款（职业卡自带）未被计入多头');
  ok(p.liabs.home > 0 || p.liabs.car > 0,
     `而玩家确实背着房贷（${money(p.liabs.home)}）与车贷（${money(p.liabs.car)}）—— 不计入是刻意的`);
}

sec('⑨ 多头借贷：硬拒绝与文案');
{
  const { g, p } = solo('软件工程师');
  g.round = 1;
  for (let r = 1; r <= 6; r++) {
    g.round = r;
    const pr = E.creditProfile(g, p);
    if (pr.ok && pr.available > 0) A.takeLoan(g, Math.min(3000, pr.available));
  }
  const pr = E.creditProfile(g, p);
  ok(p.loanDrawRounds.length >= 4, `申请轮次已记录：${JSON.stringify(p.loanDrawRounds)}`);
  ok(pr.ok === false, '频繁借款最终触发风控拒绝');
  const why = pr.reasons.join(' ');
  ok(why.indexOf('借新还旧') >= 0 || why.indexOf('多头借贷') >= 0, `拒绝原因可解释：${pr.reasons[0]}`);
  /* 文案必须是中文产品名，不能把内部 key 漏给玩家 */
  ok(why.indexOf('credit') < 0 && why.indexOf('bank') < 0,
     '拒绝文案里不出现内部产品 key（credit / bank）');
  /* 被拒时不能改动任何账目 */
  const cash0 = p.cash, debt0 = p.liabs.bank;
  const r2 = A.takeLoan(g, 1000);
  ok(!r2.ok && p.cash === cash0 && p.liabs.bank === debt0, '被拒时现金与负债分文未动');
  /* 时间会冲淡：窗口滑出去之后又能借 */
  g.round = 20;
  const later = E.creditProfile(g, p);
  ok(later.multi.draws === 0, `窗口滑过后近期申请归零（第 20 轮，窗口 ${later.multi.drawWindow}）`);
}

sec('⑩ 多头借贷只压征信分，不改变「抵押通道与就业状态解耦」这条既有约定');
{
  const { g, p } = solo('货运司机');
  const c0 = E.creditProfile(g, p);
  E.startJobless(g, p, 3000);
  p.assets.savings.push(E.stampAsset(g, { nm:'存单', cost:200000, interest:800 }));
  const c1 = E.creditProfile(g, p);
  ok(c1.incomeScore < c0.incomeScore, `失业压低了收入侧系数：${c0.incomeScore.toFixed(2)} → ${c1.incomeScore.toFixed(2)}`);
  ok(c1.limit > 0 && c1.available > 0,
     `但失业 + 有存款仍可走抵押通道（额度 ${money(c1.limit)}，可借 ${money(c1.available)}）`);
}

/* ───────────────────────── ③ 退休突变与终局结算 ───────────────────────── */

sec('⑪ 退休突变点结算：按在职口径结清、只触发一次');
{
  const { g, p } = solo('软件工程师');
  /* 顺序必须与真实路径一致（nextPlayer：先 retireBreakOf，再 refreshAllLife） */
  g.round = 42;                       /* 61 岁 */
  p.settledAge = 56;                  /* 上次结算停在 55 岁末 */
  const cash0 = p.cash;
  const brk = E.retireBreakOf(g);
  /* settledAge 是「已经结到哪一年」，所以 56 → 61 覆盖 5 年 */
  ok(!!brk && brk.years === 5, `触发结算：覆盖 ${brk ? brk.years : '—'} 年（结到 56 岁 → 61 岁）`);
  ok(p.retireSettled === true, 'retireSettled 标记已置位');
  ok(p.retireRound === 42, `记录了退休发生时的轮次（第 ${p.retireRound} 轮）`);
  ok(p.cash !== cash0, `现金已按在职口径结清（${money(cash0)} → ${money(p.cash)}）`);
  ok(p.settledAge === E.ageOf(g), `结算后记账位推到退休年龄（${p.settledAge}）`);
  ok(E.retireBreakOf(g) === null, '再次调用不重复触发');

  /* 关键：结算用的是【在职】口径，而不是养老金口径 */
  E.refreshAllLife(g);
  ok(p.retired === true, '刷新后已进入退休状态');
  ok(p.salary < p.baseSalary, `收入切换为养老金：${money(p.salary)}（基础 ${money(p.baseSalary)}，替代率 ${Math.round(window.SOLO.pensionRatio*100)}%）`);
  ok(brk.monthly > E.finance(p).cashflow,
     `结算用的月结余（在职 ${money(brk.monthly)}）高于当前的养老金口径（${money(E.finance(p).cashflow)}）—— 口径没搞反`);
  ok(E.finance(p).exp.taxes === 0, '养老金免征个税（税负归零）');
}

sec('⑫ 退休突变：多人模式完全不受影响');
{
  const gm = E.newGame({ rule:'101', mode:'age', count:2, names:['甲','乙'], seed:3 });
  gm.round = 42;
  ok(E.retireBreakOf(gm) === null, '多人模式不触发退休突变结算');
  E.refreshAllLife(gm);
  ok(gm.players[0].retired === false, '多人模式的玩家 61 岁不会「退休」（65 岁同步结算）');
  ok(gm.players[0].taxesCur > 0, '税负也未被清零（不受单人断崖影响）');
}

sec('⑬ 退休时不再求职（否则会出现「65 岁还在投简历」）');
{
  const { g, p } = solo('软件工程师');
  g.round = 40; E.refreshAllLife(g);      /* 59 岁 */
  E.startJobless(g, p, 5000);
  ok(E.isJobless(p) === true, '59 岁失业 → 进入求职期');
  g.round = 42; E.refreshAllLife(g);      /* 61 岁 */
  ok(p.retired === true && p.joblessNeed === 0,
     `到退休年龄后求职状态被清除（joblessNeed = ${p.joblessNeed}）`);
  ok(E.isJobless(p) === false, '不再处于求职期，可以正常领养老金');
  ok(p.salary > 0, `养老金正常发放（${money(p.salary)}）`);
}

sec('⑭ 终局结清：残差归零、走真实 endSolo 链路');
{
  const { g, p } = solo('软件工程师');
  g.round = 42; E.retireBreakOf(g); E.refreshAllLife(g);
  p.settledAge = 61;                       /* 假设退休那次已结清到 61 岁 */
  const cash0 = p.cash;
  g.round = 46; E.refreshAllLife(g);       /* 65 岁 → 结束 */
  const residualBefore = E.ageOf(g) - p.settledAge;
  ok(residualBefore === 4, `结束前残差 ${residualBefore} 年（退休期的养老金尚未入账）`);
  E.endSolo(g);
  ok(p.settledAge === E.ageOf(g),
     `endSolo 后记账位推到 65 岁（残差 ${E.ageOf(g) - p.settledAge}）—— 一生结算总量 = 年龄跨度`);
  ok(p.cash > cash0, `最后一段养老金已入账（${money(cash0)} → ${money(p.cash)}）`);
  ok(!!g.soloResult, `评级基于完整一生：${g.soloResult && g.soloResult.grade}（${g.soloResult && g.soloResult.label}）`);
  ok(g.finalSettled && g.finalSettled.length === 1, '结算记录已产出（供复盘 / 界面读取）');
}

sec('⑮ 终局结清不会把现金打成负数');
{
  const { g, p } = solo('小区保安');         /* 最弱职业，最容易出现缺口 */
  g.round = 46; E.refreshAllLife(g);
  p.settledAge = 61;
  p.cash = 0;
  E.finalSettle(g);
  ok(p.cash >= 0, `缺口情形下现金仍非负（${money(p.cash)}）`);
  ok(isFinite(p.cash), '现金是有限数值');
}

/* ───────────────────────── ④ 长局不变量 ───────────────────────── */

sec('⑯ 长局回归：四个新机制在整局里不产生非法状态');
{
  /* ⚠️ 必须显式指定职业：`newGame` 内部用 `Math.random()` 洗牌分职业，
     只给 seed 并不能让「职业」可复现 —— 首版就因此出现了间歇性失败
     （同一份代码有时通过、有时不通过，而失败的那次其实只是分到了另一个职业）。 */
  const run = (rule, s, careerIdx) => {
    let seed = s;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const g = E.newGame({ rule, mode:'solo', count:1, names:['测'], seed:s });
    const p = g.players[0];
    const c = window.CAREERS[careerIdx];
    p.job = c; p.baseSalary = c.salary;
    p.liabs = Object.assign({ home:0, school:0, car:0, credit:0, bank:0, other:0, extraPay:0 }, c.liab);
    p.loans = null; E.ensureLoans(p); E.refreshLife(g, p);
    p.cash = E.finance(p).cashflow + c.savings;
    let turns = 0, negCash = 0, nan = 0, negVal = 0, retireBreaks = 0, stuck = 0, minMult = 1;
    const handle = () => {
      let guard = 0;
      while (g.pending && guard++ < 60) {
        const P = g.pending;
        if (P.type === 'opportunity' || P.type === 'opportunity202') {
          let d = P.deal;
          if (!d) {
            const dk = P.choices || (rule === '202' ? ['capgain','cashflow'] : ['small','big']);
            const r = A.chooseDeck(g, dk[Math.floor(rnd()*dk.length)]);
            if (r && r.ok) d = r.card;
          }
          if (d && p.cash > 3000 && p.energy > 30 && rnd() < 0.7) A.buyDeal(g, d, d.min || 1);
        } else if (P.type === 'deficit') {
          let r = A.payDeficit(g, P.amount);
          if (!r.ok) {
            const pr = E.creditProfile(g, p);
            if (pr && pr.available > 0) A.takeLoan(g, Math.min(pr.available, Math.max(1000, r.shortfall)));
            r = A.payDeficit(g, P.amount);
          }
          if (!r.ok) E.declareBankruptcy(g, p);
        } else if (P.type === 'doodad') {
          let r = A.payDoodad(g, P.card, P.cost);
          if (!r.ok) {
            const pr = E.creditProfile(g, p);
            if (pr && pr.available > 0) A.takeLoan(g, Math.min(pr.available, Math.max(1000, r.shortfall || 1000)));
            r = A.payDoodad(g, P.card, P.cost);
          }
          if (!r.ok) E.declareBankruptcy(g, p);
        } else if (P.type === 'charity') { A.doCharity(g, rnd() < 0.4); }
        else if (P.type === 'downsized') { A.doDownsized(g, P.amount); }
        else if (P.type === 'rest') { if (p.energy < 40 && p.cash > 5000) A.vacation(g); }
        else if (P.type === 'baby') { A.addBaby(g); }
        E.clearPending(g);
      }
    };
    while (!g.over && turns < 400) {
      turns++;
      const cur = E.current(g);
      if (!cur || cur.out) { E.nextPlayer(g); continue; }
      handle();
      if (E.isJobless(cur) && cur.energy >= 12) A.huntJob(g);
      if (!cur.pausedThisTurn) {
        const d = E.rollDice(g, E.diceCount(g, cur));
        const L = E.movePlayer(g, cur, d.reduce((a,b)=>a+b,0));
        E.resolveSpace(g, cur, L);
        handle();
      }
      if (g.lastRetire && !g.lastRetire.counted) { g.lastRetire.counted = true; retireBreaks++; }
      E.endTurn(g);
      const q = g.players[0];
      if (q.cash < 0) negCash++;
      if (!isFinite(q.cash)) nan++;
      const ap = E.appraiseAll(g, q);
      if (!isFinite(ap.value) || ap.value < 0) negVal++;
      const cp = E.creditProfile(g, q);
      if (cp.multi && cp.multi.mult < minMult) minMult = cp.multi.mult;
      if (q.retired && q.retireSettled !== true) stuck++;
    }
    return { g, p, turns, negCash, nan, negVal, retireBreaks, stuck, minMult, career: p.job.name };
  };
  /* 覆盖两端：收入最高的职业与最低的职业各跑一遍（最弱职业最容易踩到边界） */
  const pick = [idxOf('软件工程师'), idxOf('小区保安')];
  ['101','202'].forEach(rule => {
    pick.forEach(ci => {
      const r = run(rule, 20260920, ci);
      const tag = `${rule}/${r.career}`;
      ok(r.negCash === 0, `${tag}: 全程现金非负（越界 ${r.negCash} 次）`);
      ok(r.nan === 0, `${tag}: 无 NaN（${r.nan} 次）`);
      ok(r.negVal === 0, `${tag}: 估值始终非负有限（${r.negVal} 次）`);
      ok(r.stuck === 0, `${tag}: 退休后都做过突变结算（遗漏 ${r.stuck} 次）`);
      ok(r.retireBreaks <= 1, `${tag}: 退休突变最多触发一次（实际 ${r.retireBreaks}）`);
      /* 走完全程才要求残差为 0；中途出局走的是破产路径，刻意不做终局结清 */
      const finished = r.g.over && !r.p.out;
      ok(!finished || r.p.settledAge === E.ageOf(r.g),
         `${tag}: ${finished ? '正常结束时残差为 0' : '中途出局（不做终局结清，属预期）'}`
         + `（settledAge ${r.p.settledAge} / ageOf ${E.ageOf(r.g)}）`);
      warn(`${tag} 结束于第 ${r.turns} 回合 · 年龄 ${E.ageOf(r.g)} · 评级 ${r.g.soloResult ? r.g.soloResult.grade : '—'} · 最小多头系数 ${r.minMult.toFixed(3)}`);
    });
  });
}

/* ───────────────────────── 输出 ───────────────────────── */

OUT.push('');
OUT.push('─'.repeat(64));
if (fails === 0) {
  OUT.push(`✅ 资产动态估值 / 多头借贷 / 退休与终局结算 —— 全部通过（${passes} 项断言）`);
} else {
  OUT.push(`❌ 失败 ${fails} 项 / 共 ${passes + fails} 项`);
}
console.log(OUT.join('\n'));
process.exit(fails === 0 ? 0 : 1);
