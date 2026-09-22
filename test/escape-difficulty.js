/* ============================================================================
   escape-difficulty.js —— 投资回报标定 与 出圈门槛难度
   ============================================================================
   回答三类问题：
     ① 卡片的金额是否与 window.YIELD 的标定基准逐项自洽？
        （首付比例、毛租金回报、净现金流 = 毛租金 − 月供、备注与字段同值）
     ② 门槛是否真的带上了安全边际？企业达标线是否与回报口径同源？
     ③ 出圈难度是否落在目标区间？（用会买入、会出圈的 AI 实跑 12 个职业）

   为什么需要它：
     金额是「一个字段改、三个字段跟着变」的联动结构（首付 → 贷款 → 月供 → 净现金流）。
     手改任何一处都会让玩家算出对不上的账，而这类错误不会报错、只会让人以为系统算错了。

   改动下列内容后必须重跑：
     YIELD（房贷月利率 / 首付比例 / 毛租金回报 / 各类净回报 / 安全边际 / 企业达标线）、
     任何带 tier 的投资卡、tools/rebalance-returns.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'js') + '/';
global.window = {};
for (const f of ['data-careers.js', 'data-board.js', 'data-cards-101.js', 'data-cards-202.js', 'engine.js', 'engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];

const E = global.Engine, A = global.Act;
const Y = global.YIELD;
const OUT = [];
let pass = 0, fail = 0;
const ok = (c, m) => { OUT.push((c ? '   ✅ ' : '   ❌ ') + m); c ? pass++ : fail++; };
const sec = t => OUT.push('', '=== ' + t + ' ===');
const money = v => '¥' + Math.round(v).toLocaleString('en-US');
const sign = v => (v >= 0 ? '+' : '−') + money(Math.abs(v));

/* ============================ ① 标定自洽 ============================ */
sec('① 卡片金额与 YIELD 基准逐项对账');

const DECKS = {
  '101 小额理财': global.DECK_SMALL,
  '101 大额置业': global.DECK_BIG,
  '202 杠杆交易': global.DECK_CAPGAIN,
  '202 大额现金流': global.DECK_CASHFLOW
};
/* 与工具里一致的特例（各有现实理由，见 tools/rebalance-returns.js） */
const SPECIAL = { sm8: { rentRate: 0.020 }, cg14: { down: 1.0 } };

let cardCount = 0, tierBad = 0, dpBad = 0, rentBad = 0, cfBad = 0, noteBad = 0;
const yields = {};

for (const [deckNm, list] of Object.entries(DECKS)) {
  for (const c of list) {
    const hasFlow = (typeof c.cf === 'number' && c.cf !== 0) || (typeof c.interest === 'number' && c.interest !== 0);
    if (hasFlow && !c.tier) { tierBad++; OUT.push('   ⚠️ 有现金流却未标档位：' + c.id + ' ' + c.nm); }
    if (!c.tier) continue;
    const t = Y.tier[c.tier];
    if (!t) { tierBad++; OUT.push('   ⚠️ 未知档位：' + c.id + ' → ' + c.tier); continue; }
    cardCount++;

    if (t.down !== undefined) {
      const sp = SPECIAL[c.id] || {};
      const downRate = sp.down !== undefined ? sp.down : t.down;
      const rentRate = sp.rentRate !== undefined ? sp.rentRate : t.rent;
      const wantDp = Math.round(c.cost * downRate);
      const wantRent = Math.round(c.cost * rentRate / 12);
      const wantCf = c.capital ? 0 : Math.round(wantRent - (c.cost - wantDp) * Y.mortgageRate);
      if (c.dp !== wantDp) { dpBad++; OUT.push(`   ⚠️ ${c.id} 首付 ${c.dp} ≠ cost × ${downRate} = ${wantDp}`); }
      if (c.rent !== wantRent) { rentBad++; OUT.push(`   ⚠️ ${c.id} 租金 ${c.rent} ≠ cost × ${rentRate}/12 = ${wantRent}`); }
      if (c.cf !== wantCf) { cfBad++; OUT.push(`   ⚠️ ${c.id} 净现金流 ${c.cf} ≠ 租金 − 月供 = ${wantCf}`); }
      /* 备注必须与字段同值（价格标定那一轮踩过：备注写死金额 → 与卡面打架） */
      const note = c.note || '';
      const need = c.capital
        ? [money(c.dp), money(c.cost)]
        : [money(c.dp), money(c.rent), sign(c.cf)];
      if (!need.every(x => note.indexOf(x) >= 0)) {
        noteBad++;
        OUT.push(`   ⚠️ ${c.id} 备注与字段不一致 → 缺 ${need.filter(x => note.indexOf(x) < 0).join(' / ')}`);
      }
      const rate = c.dp > 0 ? c.cf * 12 / c.dp : 0;
      /* 区间统计要排除两类卡：
         · capital —— 纯资本利得型（无现金流，回报率恒为 0）
         · SPECIAL —— 刻意设计成【坏交易】的卡（老破小），它的负回报是设计意图 */
      const isSpecial = !!SPECIAL[c.id] || !!c.capital;
      if (!isSpecial) (yields[c.tier] = yields[c.tier] || []).push({ id: c.id, rate });
    } else {
      const field = c.kind === 'savings' ? 'interest' : 'cf';
      const want = Math.round(c.cost * t.net / 12);
      if (c[field] !== want) { cfBad++; OUT.push(`   ⚠️ ${c.id} ${field} ${c[field]} ≠ cost × ${t.net}/12 = ${want}`); }
      const note = c.note || '';
      const need = [money(c.cost), sign(c[field])];
      if (!need.every(x => note.indexOf(x) >= 0)) {
        noteBad++;
        OUT.push(`   ⚠️ ${c.id} 备注与字段不一致 → 缺 ${need.filter(x => note.indexOf(x) < 0).join(' / ')}`);
      }
      (yields[c.tier] = yields[c.tier] || []).push({ id: c.id, rate: t.net });
    }
  }
}
ok(tierBad === 0, `${cardCount} 张带档位的投资卡，档位齐全（缺档 ${tierBad} 处）`);
ok(dpBad === 0, `首付比例全部等于 cost × YIELD 的首付比例（不符 ${dpBad} 处）`);
ok(rentBad === 0, `毛租金全部等于 cost × YIELD 的租金回报（不符 ${rentBad} 处）`);
ok(cfBad === 0, `净现金流全部等于「毛租金 − 贷款 × 房贷月利率」（不符 ${cfBad} 处）`);
ok(noteBad === 0, `所有卡片备注里的金额与字段同值（不符 ${noteBad} 处）—— 不会出现「卡面 ¥2,688、备注 ¥3,600」`);

/* 房贷月利率必须与实际计息用的利率一致，否则净现金流是拿另一个利率算的 */
ok(Y.mortgageRate === global.LOAN_TYPES.home.rate,
  `标定用的房贷月利率 ${Y.mortgageRate} 与 LOAN_TYPES.home.rate 一致`);

/* 特例的业务含义必须成立 */
const sm8 = global.DECK_SMALL.find(c => c.id === 'sm8');
ok(sm8 && sm8.cf < 0, `老破小仍是【坏交易】（净现金流 ${money(sm8.cf)}，房龄老租金上不去）—— 游戏需要能一眼看出差标的`);
const cg14 = global.DECK_CAPGAIN.find(c => c.id === 'cg14');
ok(cg14 && cg14.dp === cg14.cost, `法拍房按全款计（首付 ${money(cg14.dp)} = 成交价）—— 法院要求短期内付清`);

/* ============================ ② 回报率落在现实区间 ============================ */
sec('② 各类投资的回报率是否落在现实区间');

const BANDS = {
  res:    [0.040, 0.070, '住宅（二三线租金上沿 ÷ 30% 首付）'],
  com:    [0.060, 0.090, '商业物业（租金回报高于住宅）'],
  park:   [0.050, 0.080, '车位'],
  self:   [0.090, 0.130, '自营实业（雇人打理后的净回报）'],
  brand:  [0.070, 0.110, '品牌加盟（省心但让利）'],
  equity: [0.080, 0.120, '股权投资'],
  credit: [0.040, 0.070, '固收']
};
for (const [tier, [lo, hi, nm]] of Object.entries(BANDS)) {
  const rows = yields[tier] || [];
  if (!rows.length) { ok(false, `档位 ${tier} 没有卡片`); continue; }
  const rs = rows.map(r => r.rate);
  const mn = Math.min(...rs), mx = Math.max(...rs);
  ok(mn >= lo - 1e-3 && mx <= hi + 1e-3,
    `${tier} ${nm}：${(mn * 100).toFixed(1)}% — ${(mx * 100).toFixed(1)}%（目标 ${(lo * 100).toFixed(0)}%—${(hi * 100).toFixed(0)}%）`);
}
/* 改造前的对照：房产/实业投入口径回报是 22%—45% */
ok((yields.res || []).every(r => r.rate < 0.12),
  `房产首付口径回报全部低于 12%（改造前是 22.3%—44.7%，那是 2010—2020 高杠杆行情的数字）`);
const biz = yields.self || [];
ok(biz.every(r => r.rate < 0.15),
  `实业净回报全部低于 15%（改造前小生意卡是 22%—30%，等于把自己的劳动算成了投资回报）`);

/* ============================ ③ 门槛与企业达标线 ============================ */
sec('③ 出圈门槛的安全边际 与 企业达标线');

const g101 = E.newGame({ rule: '101', mode: 'solo', count: 1, names: ['测'], seed: 7 });
const g202 = E.newGame({ rule: '202', mode: 'solo', count: 1, names: ['测'], seed: 7 });
ok(E.escapeMargin(g101) === Y.safetyMargin, `101 门槛倍数 = ${E.escapeMargin(g101)}（来自 YIELD）`);
ok(E.escapeMargin(g202) === Y.safetyMargin202, `202 门槛倍数 = ${E.escapeMargin(g202)}（来自 YIELD）`);
ok(E.escapeMargin(g101) > 1 && E.escapeMargin(g202) > 1,
  `两个规则都留了安全边际 —— 门槛不是「刚好覆盖支出」（真实规划里没人这么辞职）`);

const p1 = g101.players[0];
const tot = E.finance(p1).totalExpenses;
ok(E.escapeTarget(g101, p1) === Math.round(tot * E.escapeMargin(g101)),
  `门槛 = 总支出 ${money(tot)} × ${E.escapeMargin(g101)} = ${money(E.escapeTarget(g101, p1))}`);
const pr = E.escapeProgress(g101, p1);
ok(pr.target === E.escapeTarget(g101, p1) && pr.canEscape === (pr.passive > pr.target),
  'escapeProgress 与 escapeTarget 同源（界面进度与判定不会出现两套口径）');

ok(E.empireTarget() === Y.empireTarget, `企业达标线 = ${money(E.empireTarget())}（来自 YIELD，不再是 5 处硬编码）`);
/* 达标线与回报口径同源：全买下所有企业的总现金流，应当明显高于达标线（否则不可能达成） */
const ftSum = global.FT_BUSINESSES.reduce((s, b) => s + b.cf, 0);
ok(ftSum > E.empireTarget() * 1.5,
  `把全部 7 家企业买下可获得 ${money(ftSum)}/月，是达标线的 ${(ftSum / E.empireTarget()).toFixed(1)} 倍 —— 胜利条件仍然可达`);
const ftTop = Math.max(...global.FT_BUSINESSES.map(b => b.cf));
ok(ftTop < E.empireTarget(),
  `最大一家企业的现金流 ${money(ftTop)} 低于达标线 —— 必须买入多家，不能靠一张卡通关`);

/* ============================ ④ 出圈难度实测 ============================ */
sec('④ 出圈难度实测（12 职业 · 会买入、会出圈的 AI）');

function mk(name, rule) {
  const g = E.newGame({ rule: rule || '101', mode: 'solo', count: 1, names: ['测'], seed: 20260920 });
  const p = g.players[0];
  const c = global.CAREERS.find(x => x.name === name);
  p.job = c; p.baseSalary = c.salary;
  p.liabs = Object.assign({ home: 0, school: 0, car: 0, credit: 0, bank: 0, other: 0, extraPay: 0 }, c.liab);
  p.loans = null; E.ensureLoans(p); E.refreshLife(g, p);
  p.cash = E.finance(p).cashflow + c.savings;
  p.energy = E.energyMax(g, p);
  return { g, p };
}
function scoreOf(c) {
  if (c.kind === 'realestate') return (c.cf || 0) / Math.max(1, c.dp || c.cost || 1);
  if (c.kind === 'business') return (c.cf || 0) / Math.max(1, c.cost || 1);
  if (c.kind === 'savings') return (c.interest || 0) / Math.max(1, c.cost || 1);
  return 0;
}
function handle(g, p) {
  let guard = 0;
  while (g.pending && guard++ < 80) {
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
        const L = P.landed; E.clearPending(g);
        if (L) E.resolveSpace(g, p, Object.assign({}, L, { deficit: 0 }));
        break;
      }
      case 'opportunity': case 'opportunity202': {
        let d = P.deal;
        if (!d) {
          const dk = P.choices || (g.rule === '202' ? ['capgain', 'cashflow'] : ['small', 'big']);
          const want = dk.indexOf('big') >= 0 ? 'big' : (dk.indexOf('cashflow') >= 0 ? 'cashflow' : dk[0]);
          const r = A.chooseDeck(g, want);
          if (r && r.ok) d = r.card;
        }
        if (d) {
          const need = (d.kind === 'realestate') ? (d.dp || 0) : (d.kind === 'savings' || d.kind === 'business') ? (d.cost || 0) : 999999;
          if (scoreOf(d) > 0 && p.cash - need > 20000 && p.energy > 25) A.buyDeal(g, d, d.min || 1);
        }
        E.clearPending(g); break;
      }
      case 'charity': A.doCharity(g, false); E.clearPending(g); break;
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
      case 'baby': A.addBaby(g); break;
      default: E.clearPending(g); break;
    }
  }
}
function play(name, rule) {
  const { g, p } = mk(name, rule);
  let turns = 0, escAge = null, buys = 0, maxPassive = 0;
  while (!g.over && turns < 300) {
    turns++;
    const cur = E.current(g);
    if (!cur || cur.out) { E.nextPlayer(g); continue; }
    handle(g, cur);
    if (E.isJobless(cur) && cur.energy >= 12) A.huntJob(g);
    if (!cur.pausedThisTurn) {
      const n = E.diceCount(g, cur);
      const d = E.rollDice(g, n);
      const L = E.movePlayer(g, cur, d.reduce((a, b) => a + b, 0));
      E.resolveSpace(g, cur, L);
      handle(g, cur);
      const p2 = E.escapeProgress(g, cur);
      maxPassive = Math.max(maxPassive, p2.passive);
      if (!escAge && p2.canEscape) { const r = A.escapeRatRace(g); if (r.ok) escAge = E.ageOf(g); }
    }
    E.endTurn(g);
  }
  return { escAge, maxPassive, out: p.out, buys };
}

const ages = [];
const detail = [];
for (const c of global.CAREERS) {
  const r = play(c.name, '101');
  if (r.escAge) ages.push(r.escAge);
  detail.push(`${c.name} ${r.escAge ? r.escAge + '岁' : '未出圈'}`);
}
ages.sort((a, b) => a - b);
const med = ages.length ? ages[Math.floor(ages.length / 2)] : null;
OUT.push('   · ' + detail.join(' · '));
ok(ages.length >= 4 && ages.length <= 9,
  `101 出圈率 ${ages.length}/12 —— 落在目标区间 4—9/12（改造前是 12/12，人人 30 出头就「自由」）`);
ok(ages.length > 0 && ages[0] >= 40,
  `最早出圈年龄 ${ages[0]} 岁 ≥ 40 —— 不再是 31—34 岁就出圈`);
ok(med !== null && med >= 42,
  `出圈年龄中位 ${med} 岁（改造前 34 岁）`);
ok(ages.length < 12,
  `存在「一生未能出圈」的职业 ${12 - ages.length} 个 —— 出圈重新变成一件需要做到的事`);

const r202 = play('三甲医院医生', '202');
ok(r202.escAge === null || r202.escAge >= 50,
  `202 规则（门槛 ×${Y.safetyMargin202}）更难：医生${r202.escAge ? r202.escAge + ' 岁出圈' : '一生未出圈'}（改造前 43 岁）`);

console.log(OUT.join('\n'));
console.log();
console.log(fail === 0
  ? `✅ 投资回报与出圈难度全部通过（${pass} 项）`
  : `❌ 有 ${fail} 项未通过（通过 ${pass} 项）`);
process.exit(fail === 0 ? 0 : 1);
