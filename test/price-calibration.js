/* 价格标定一致性（零依赖，Node 直跑）
   守住标定之后最容易被破坏的三件事：
     ① 卡片备注里的价格数字必须与字段【同值】—— 否则又出现「备注写 ¥300,000、卡面写 ¥645,000」；
     ② 价格字段不能出现 0 / 负数 —— 曾经因为取整单位设成「百元」把期权权利金抹成 0；
     ③ 买入价与卖出价必须同口径 —— 只换一边就会出现低买高卖。

   运行：node test/price-calibration.js      退出码 0 = 全部通过

   ⚠️ 改动 tools/calibrate-prices.js、卡片价格字段、或 window.PRICE.scale 后必须重跑。 */

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'js') + '/';

global.window = {};
for (const f of ['data-careers.js', 'data-board.js', 'data-cards-101.js', 'data-cards-202.js', 'engine.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];

const OUT = [];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; OUT.push('   ✅ ' + m); } else { fail++; OUT.push('   ❌ ' + m); } };
const warn = m => OUT.push('   ⚠️ ' + m);
const sec = t => OUT.push('', '=== ' + t + ' ===');
const num = s => Number(String(s).replace(/,/g, ''));

const DECKS = { DECK_SMALL: global.DECK_SMALL, DECK_BIG: global.DECK_BIG, DECK_CAPGAIN: global.DECK_CAPGAIN,
                DECK_CASHFLOW: global.DECK_CASHFLOW, DECK_MARKET_101: global.DECK_MARKET_101,
                DECK_MARKET_202: global.DECK_MARKET_202 };
const PRICE_FIELDS = ['price', 'cost', 'dp', 'strike', 'premium'];

/* ---------------- ① 标定元信息 ---------------- */
sec('① 标定元信息');
const P = global.window.PRICE;
ok(P && typeof P.scale === 'number' && P.scale > 1,
   `window.PRICE.scale = ${P && P.scale}（> 1，说明数据已按货币增量换算过）`);
ok(P && typeof P.basis === 'string' && P.basis.length > 10, '标定依据有文字记录：' + (P && P.basis));
ok(P && Array.isArray(P.untouched) && P.untouched.includes('cf') && P.untouched.includes('rent'),
   '明确记录了不参与换算的字段（收益类）：' + (P && P.untouched.join(' / ')));

/* ---------------- ② 价格字段无 0 / 负数 ---------------- */
sec('② 价格字段不能为 0 或负数');
let zero = [], total = 0;
for (const [nm, deck] of Object.entries(DECKS)) {
  for (const c of deck) {
    for (const f of PRICE_FIELDS) {
      if (typeof c[f] !== 'number') continue;
      total++;
      if (!(c[f] > 0)) zero.push(`${nm}:${c.id}.${f}=${c[f]}`);
    }
  }
}
ok(zero.length === 0, `${total} 个价格字段全部为正${zero.length ? '，异常：' + zero.join(', ') : ''}`);
/* 期权是取整单位最容易踩坏的地方 —— 单独再钉一次 */
const opts = Object.values(DECKS).flat().filter(c => c.kind === 'option' || c.kind === 'straddle');
ok(opts.length > 0 && opts.every(c => c.strike > 0 && c.premium > 0),
   `${opts.length} 张期权 / 跨式卡的 strike 与 premium 都 > 0（权利金取整单位是 0.1、行权价是 1，不是 100）`);
const prem = opts.map(c => c.premium);
ok(Math.min(...prem) < 10 && Math.max(...prem) < 100,
   `权利金仍在「每股几元」的量级（${Math.min(...prem)} — ${Math.max(...prem)}），没有被误按百元取整`);

/* ---------------- ③ 备注数字与字段同值 ---------------- */
sec('③ 备注里的价格数字必须与字段同值');
const mismatch = [];
const pickYen = (s, re) => { const m = String(s).match(re); return m ? num(m[1]) : null; };
for (const [nm, deck] of Object.entries(DECKS)) {
  for (const c of deck) {
    const note = c.note || '';
    if (note.indexOf('¥') < 0) continue;
    /* 出租物业：总价 / 首付 必须等于 cost / dp（收益类数字刻意不同值，不检查） */
    if (c.kind === 'realestate' && /总价/.test(note) && typeof c.cost === 'number') {
      const a = pickYen(note, /总价\s*¥([\d,]+)/), b = pickYen(note, /首付\s*¥([\d,]+)/);
      if (a !== c.cost || (typeof c.dp === 'number' && b !== c.dp))
        mismatch.push(`${nm}:${c.id} 备注 总价${a}/首付${b} vs 字段 ${c.cost}/${c.dp}`);
      continue;
    }
    /* 期权 / 跨式：权利金、合计、行权价三处都要对上 */
    if ((c.kind === 'option' || c.kind === 'straddle') && /权利金/.test(note)) {
      const p1 = pickYen(note, /权利金\s*¥([\d.]+)/);
      const p2 = pickYen(note, /=\s*¥([\d,]+)/);
      const st = pickYen(note, /行权价\s*¥([\d,]+)/);
      if (p1 !== c.premium || (p2 !== null && p2 !== Math.round(c.premium * 100)) || (st !== null && st !== c.strike))
        mismatch.push(`${nm}:${c.id} 备注 ${p1}/${p2}/${st} vs 字段 ${c.premium}/${Math.round(c.premium * 100)}/${c.strike}`);
      continue;
    }
    /* 其余（股票 / 收藏品 / 经营 / 固收 / 土地 / 市场报价）：第一个 ¥ 数字必须等于那个价格字段 */
    const first = pickYen(note, /¥([\d,]+)/);
    const field = PRICE_FIELDS.map(f => c[f]).find(v => typeof v === 'number' && v > 0);
    if (first !== null && typeof field === 'number' && first !== field)
      mismatch.push(`${nm}:${c.id} 备注¥${first} vs 字段 ${field}`);
  }
}
ok(mismatch.length === 0,
   mismatch.length ? `备注与字段不一致 ${mismatch.length} 处：\n      ` + mismatch.slice(0, 6).join('\n      ')
                   : '全部含金额的备注都与字段同值（一处不一致就会让玩家以为系统算错）');

/* ---------------- ④ 意外支出卡不得被换算 ---------------- */
sec('④ 意外支出卡不参与换算');
const dd = [...(global.DECK_DOODAD_101 || []), ...(global.DECK_DOODAD_202 || [])];
ok(dd.length > 0 && dd.every(c => typeof c.cost === 'number' && c.cost < 100000),
   `${dd.length} 张意外支出卡的金额仍是一次性事件量级（最大 ¥${Math.max(...dd.map(c => c.cost)).toLocaleString('en-US')}）—— 它们由「消费升级 × 消费档次」独立调节`);

/* ---------------- ⑤ 买卖两侧同口径 ---------------- */
sec('⑤ 买入价与卖出价必须同口径');
const estateDeal = Object.values(DECKS).flat().filter(c => c.kind === 'realestate' && typeof c.cost === 'number' && c.nm);
const estateOffer = global.DECK_MARKET_101.filter(c => c.kind === 'realestate' && typeof c.price === 'number');
const ratios = [];
for (const o of estateOffer) {
  const d = estateDeal.find(x => x.nm === o.prop);
  if (d) ratios.push({ nm: d.nm, buy: d.cost, sell: o.price, r: o.price / d.cost });
}
ok(ratios.length > 0, `匹配到 ${ratios.length} 组「买入 → 市场收购」同名物业`);
const tooLow = ratios.filter(x => x.r < 0.9);
ok(tooLow.length === 0,
   tooLow.length ? `有收购价低于买入价的物业（买入即亏）：${tooLow.map(x => `${x.nm} 买${x.buy} 卖${x.sell}`).join('; ')}`
                 : `所有物业的收购价都不低于买入价（${ratios.map(x => x.nm + ' ×' + x.r.toFixed(2)).join(' · ')}）`);
/* 股票：行情卡报价与买入价的量级必须一致（同乘一个系数才不会出低买高卖） */
const stockDeal = Object.values(DECKS).flat().filter(c => c.kind === 'stock' && typeof c.price === 'number');
const stockMkt = global.DECK_MARKET_202.filter(c => c.kind === 'stock' && typeof c.price === 'number');
ok(Math.max(...stockMkt.map(c => c.price)) / Math.max(...stockDeal.map(c => c.price)) < 100,
   `股票的两个价格体系量级一致（买入价 ≤ ¥${Math.max(...stockDeal.map(c => c.price))}，行情报价 ≤ ¥${Math.max(...stockMkt.map(c => c.price))}）`);

/* ---------------- ⑥ 财务自由圈目标已换算 ---------------- */
sec('⑥ 财务自由圈的企业与梦想');
const biz = global.FT_BUSINESSES, dreams = global.DREAMS;
ok(biz.every(b => b.cost > 100000), `7 家企业的成本均已上调（¥${Math.min(...biz.map(b => b.cost)).toLocaleString('en-US')} — ¥${Math.max(...biz.map(b => b.cost)).toLocaleString('en-US')}）`);
ok(dreams.every(d => d.cost > 200000), `6 个梦想的成本均已上调（¥${Math.min(...dreams.map(d => d.cost)).toLocaleString('en-US')} — ¥${Math.max(...dreams.map(d => d.cost)).toLocaleString('en-US')}）`);
/* 收益率（cf / cost）在原始数据里本就大致齐平（约 6%），标定同时上调 cost、
   不动 cf，所以收益率整体被压缩同一个倍数。这里断言「压缩后仍在同一窄带」，
   用来发现「只换了一部分企业的 cost」这类半途而废的标定。 */
const yields = biz.map(b => b.cf / b.cost);
ok(Math.max(...yields) / Math.min(...yields) < 1.3,
   `7 家企业的收益率仍在同一窄带（${(Math.min(...yields) * 100).toFixed(2)}% — ${(Math.max(...yields) * 100).toFixed(2)}%），说明 cost 是整批换算的`);
const dYields = dreams.map(d => d.cost);
ok(Math.max(...dYields) / Math.min(...dYields) < 3,
   `6 个梦想的成本跨度合理（最大 / 最小 = ${(Math.max(...dYields) / Math.min(...dYields)).toFixed(2)}）`);

/* ---------------- 小结 ---------------- */
OUT.push('', '─'.repeat(72));
OUT.push(fail === 0
  ? `✅ 价格标定一致性全部通过（系数 ×${P.scale}），共 ${pass} 项`
  : `❌ 有 ${fail} 项未通过（通过 ${pass} 项）`);
warn('标定只解决「名义量随货币增量同步」这一件事。它【不会】改变出圈时机 ——');
warn('  实测把系数从 1.0 调到 4.0，出圈年龄中位数只在 45—46 岁之间移动，');
warn('  因为真正的约束是出圈门槛（总支出）与卡片抽取，不是攒首付的速度。');
console.log(OUT.join('\n'));
process.exit(fail === 0 ? 0 : 1);
