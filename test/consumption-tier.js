/* 消费升级规则（意外支出 × 消费档次）的数学验证。
   改动 LIFESTYLE / 社会等级门槛 / 意外支出卡数据后必须重跑。
   运行：node test/consumption-tier.js     退出码 0 = 全通过 */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'js') + '/';
global.window = {};
for (const f of ['data-careers.js','data-board.js','data-cards-101.js','data-cards-202.js','engine.js','engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(window)) if (!(k in global)) global[k] = window[k];
const E = window.Engine, A = window.Act, L = window.LIFESTYLE;

const OUT = [], bad = [];
const ok = (c, m) => { OUT.push((c ? '   ✅ ' : '   ❌ ') + m); if (!c) bad.push(m); };
const sec = t => OUT.push('', '=== ' + t + ' ===');
const money = v => '¥' + Math.round(v).toLocaleString('en-US');

/* ---------------- 参数自洽 ---------------- */
sec('参数自洽');
ok(Array.isArray(L.byLevel) && L.byLevel.length === E.LADDER.length,
  `byLevel 系数条目数（${L.byLevel.length}）与等级数（${E.LADDER.length}）一致`);
ok(L.byLevel[0] === 1, `最低等级不加价：L0 系数 = ${L.byLevel[0]}`);
let mono = true;
for (let i = 1; i < L.byLevel.length; i++) if (L.byLevel[i] < L.byLevel[i - 1]) mono = false;
ok(mono, '系数随等级单调不降：' + L.byLevel.join(' → '));
ok(L.why && L.why.length === L.byLevel.length, `每一档都有「为什么是这个系数」的说明（${L.why.length} 条）`);
ok(typeof L.basicDamp === 'number' && L.basicDamp >= 0 && L.basicDamp <= 1,
  `基础型支出承接比例 basicDamp = ${L.basicDamp}（0—1 之间）`);

/* ---------------- 卡片标注完整 ---------------- */
sec('意外支出卡的消费敏感度标注');
const decks = { '101': window.DECK_DOODAD_101, '202': window.DECK_DOODAD_202 };
let lifeN = 0, basicN = 0, missing = [];
Object.entries(decks).forEach(([rule, deck]) => {
  deck.forEach(card => {
    if (card.scale === 'life') lifeN++;
    else if (card.scale === 'basic') basicN++;
    else missing.push(rule + '/' + card.id + ' ' + card.nm);
  });
});
ok(missing.length === 0, `全部 ${lifeN + basicN} 张卡都标注了 scale` + (missing.length ? '，缺：' + missing.join('、') : ''));
ok(lifeN > 0 && basicN > 0, `两类都有：消费升级型 ${lifeN} 张、基础型 ${basicN} 张`);

/* ---------------- 逐级核对计价 ---------------- */
const g = E.newGame({ rule: '101', mode: 'age', count: 2, names: ['甲', '乙'] });
const p = g.players[0];
function setLevel(target) {
  p.assets.savings = []; p.liabs.bank = 0;
  p.inFT = false; p.escaped = false; p.out = false; p.outReason = '';
  p.cash = 1000; p.stats.peakCash = 1000;
  g.over = false; g.winner = null;
  const t = E.escapeTarget(g, p);
  const exp = E.finance(p).totalExpenses;
  const cur = E.escapeProgress(g, p).passive;
  if (target === 0) { p.out = true; p.outReason = '破产'; p.assets.savings = []; }
  else if (target === 1) { /* 覆盖度极低 + 应急金不足 → L1 */ }
  else if (target === 2) { p.cash = Math.round(exp * 4); p.stats.peakCash = p.cash; }
  else { const need = t * [0, 0, 0, 0.30, 0.60, 0.90, 1.20, 0][target] - cur;
         if (need > 0) p.assets.savings.push({ nm: '构造存单', cost: 100, interest: Math.round(need) }); }
  if (target === 7) { g.over = true; g.winner = p.id; }
  return E.socialClassOf(g, p);
}
const LIFE_CARD  = window.DECK_DOODAD_101.find(c => c.scale === 'life');
const BASIC_CARD = window.DECK_DOODAD_101.find(c => c.scale === 'basic');
const BIG_CARD   = window.DECK_DOODAD_202.find(c => c.scale === 'life' && c.extraPay > 0);

sec('逐级核对：消费升级型全额承接');
OUT.push('   等级   系数   标价      实付      加成');
E.LADDER.forEach((lv, i) => {
  if (i === 6) return;                        /* L6 需要出圈，单独测 */
  const cls = setLevel(i);
  const c = E.doodadCost(g, p, LIFE_CARD);
  const expectMult = L.byLevel[i];
  const expectCost = Math.round(LIFE_CARD.cost * expectMult);
  ok(cls.lv === i, `L${i} ${lv.name}：等级判定正确（覆盖度 ${Math.round(cls.cover * 100)}%）`);
  ok(Math.abs(c.mult - expectMult) < 1e-9, `  · 系数 = ×${c.mult}（期望 ×${expectMult}）`);
  ok(c.factor === expectMult, `  · 消费升级型全额承接：factor = ${c.factor}`);
  ok(c.cost === expectCost, `  · 实付 ${money(c.cost)} = 标价 ${money(LIFE_CARD.cost)} × ${expectMult}`);
  ok(c.added === c.cost - LIFE_CARD.cost, `  · 加成分开记账：${money(c.added)}`);
  OUT.push(`   L${i}     ×${String(expectMult).padEnd(5)} ${money(LIFE_CARD.cost).padStart(8)} ${money(c.cost).padStart(9)} ${money(c.added).padStart(9)}`);
});
ok(LIFE_CARD !== undefined && BASIC_CARD !== undefined, '测试用的两类卡片都取到了');

sec('逐级核对：基础型只承接一部分加成');
[0, 2, 4, 7].forEach(i => {
  const cls = setLevel(i);
  const c = E.doodadCost(g, p, BASIC_CARD);
  const expectFactor = 1 + (L.byLevel[i] - 1) * L.basicDamp;
  ok(Math.abs(c.factor - expectFactor) < 1e-9,
    `L${i} 基础型 factor = ${c.factor.toFixed(4)}（期望 ${expectFactor.toFixed(4)} = 1 + (${L.byLevel[i]}−1)×${L.basicDamp}）`);
  ok(c.cost === Math.round(BASIC_CARD.cost * expectFactor), `  · 实付 ${money(c.cost)}`);
  if (i > 0) {
    const lifeC = E.doodadCost(g, p, LIFE_CARD);
    ok(c.factor < lifeC.factor, `  · 基础型加成（×${c.factor.toFixed(2)}）确实低于消费升级型（×${lifeC.factor.toFixed(2)}）`);
  }
});

sec('每月额外支出（使用成本）同步放大');
setLevel(4);
const big = E.doodadCost(g, p, BIG_CARD);
ok(big.extraBase === BIG_CARD.extraPay, `标价月支出 ${money(big.extraBase)}`);
ok(big.extraPay === Math.round(BIG_CARD.extraPay * big.factor),
  `实付月支出 ${money(big.extraPay)} = ${money(big.extraBase)} × ${big.factor.toFixed(2)}（豪车的持续使用成本）`);

sec('L6 财务自由档');
{
  p.assets.savings = []; p.cash = 1000; p.stats.peakCash = 1000;
  p.inFT = true; p.escaped = true; p.out = false; g.over = false; g.winner = null;
  const cls = E.socialClassOf(g, p);
  const c = E.doodadCost(g, p, LIFE_CARD);
  ok(cls.lv === 6, `已出圈 → L6 ${cls.level.name}`);
  ok(c.mult === L.byLevel[6], `系数 = ×${c.mult}`);
  ok(c.why && c.why.length > 0, `给出了这一档的解释：「${c.why}」`);
}

/* ---------------- 支付路径 ---------------- */
sec('实际扣款与记账');
{
  const gg = E.newGame({ rule: '101', mode: 'age', count: 1, names: ['甲'] });
  const pp = gg.players[0];
  pp.inFT = true;                                  /* 顶到高档，便于观察加成 */
  const card = window.DECK_DOODAD_101.find(c => c.scale === 'life' && !c.extraPay);
  const before = pp.cash;
  const cost = E.doodadCost(gg, pp, card);
  const r = A.payDoodad(gg, card, cost);
  ok(r.ok, '支付成功');
  ok(pp.cash === before - cost.cost, `现金按【实付】扣减：${money(before)} → ${money(pp.cash)}`);
  ok(pp.stats.doodadTierPaid === cost.added,
    `因消费档次多付的部分单独记账：doodadTierPaid = ${money(pp.stats.doodadTierPaid)}`);
  ok(pp.stats.forcedTotal === cost.cost, `强制支出累计按实付计：${money(pp.stats.forcedTotal)}`);
  /* 锁定值优先：即使等级变化，也按弹层上写好的数扣 */
  const locked = { base: card.cost, extraBase: 0, cost: card.cost, extraPay: 0, mult: 1, factor: 1,
                   kind: 'life', damp: 1, lv: 0, levelName: '入不敷出', why: '', added: 0 };
  const c2 = pp.cash;
  A.payDoodad(gg, card, locked);
  ok(pp.cash === c2 - card.cost, `传入手工锁定的金额时按锁定值扣款（${money(card.cost)}）—— 保证弹层与账目一致`);
}

sec('单调性：地位越高，同一张卡越贵');
{
  const costs = [];
  [1, 3, 5, 6].forEach(i => { setLevel(i); costs.push([i, E.doodadCost(g, p, LIFE_CARD).cost]); });
  let up = true;
  for (let i = 1; i < costs.length; i++) if (costs[i][1] < costs[i - 1][1]) up = false;
  ok(up, costs.map(([i, c]) => `L${i}=${money(c)}`).join(' → '));
}

OUT.push('', '══════════════════════════════════');
OUT.push(bad.length ? `❌ 失败 ${bad.length} 项：\n   ` + bad.join('\n   ')
                    : '✅ 消费升级规则全部通过');
console.log(OUT.join('\n'));
process.exit(bad.length ? 1 : 0);
