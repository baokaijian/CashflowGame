/* 价格标定（一次性、可复跑）—— 把资产价格整体乘以 K，并把卡片备注里的价格数字同步换算。
 *
 * 为什么需要它
 *   方案 A（发薪日结算「自上次结算以来经过的年数」）把一生的结算覆盖率
 *   从 44.4% 提到约 95.6%，即「每个游戏年沉淀下来的净现金」变为原来的约 2.15 倍。
 *   资产价格是【存量货币】量，不换算的话同样的钱能买到 2.15 倍多的资产。
 *
 * 为什么换算的是价格、不是收益
 *   现金流（cf / rent / interest）是「一年能产生多少」的速率量，与货币存量无关；
 *   价格是「要用多少存量货币去买」的存量量。所以只调价格、不动收益 ——
 *   等价于「资产变贵了、收益率被压缩」，这也正是货币变多时真实经济体的样子。
 *
 * 为什么写进数据文件而不是做成运行时常量
 *   价格字段有 30+ 处读取点（买入 / 出售 / 抵押 / 净资产 / 卡面展示 / 做空平仓 …）。
 *   任何一处漏掉都会造成「买方按新价、卖方按旧价」的低买高卖漏洞。
 *   一次性写进数据，所有读取点自动一致，零代码改动、零遗漏风险。
 *
 * ⚠️ 只处理【资产牌堆】，不动意外支出卡（DECK_DOODAD_*）：
 *    意外支出是「一次性的事件金额」，与职业卡的收支刻度同源；它的相对权重
 *    由一个独立的机制（消费升级 × 消费档次）调节，不参与货币存量换算。
 *
 * 用法
 *   node tools/calibrate-prices.js          # 默认系数
 *   node tools/calibrate-prices.js 2.15     # 指定系数
 *
 * 幂等保护：已标定过会拒绝二次标定。还原：
 *   git checkout -- js/data-cards-101.js js/data-cards-202.js js/data-board.js js/data-careers.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const K = Number(process.argv[2] || 2.15);
if (!(K > 0)) { console.error('系数必须为正数'); process.exit(1); }

/* 只换算「价格类」字段 —— 收益类（cf / rent / interest）与比例类（pct / rate）不动 */
const PRICE_FIELDS = ['price', 'cost', 'dp', 'strike', 'premium'];
/* 参与换算的牌堆（意外支出牌堆刻意排除） */
const DECKS = ['DECK_SMALL', 'DECK_BIG', 'DECK_CAPGAIN', 'DECK_CASHFLOW', 'DECK_MARKET_101', 'DECK_MARKET_202'];

/* 取整单位按字段分档 —— 绝不能统一按百元取整：
   premium 是「每股几元」的小数（1.5—3.5），strike 是个位/十位数（10—20），
   统一按百元取整会把它们全部抹成 0，期权就变成免费且必然行权。 */
const ROUND_UNIT = { price: 1, strike: 1, premium: 0.1, cost: 100, dp: 100 };
const roundFor = (f, v) => {
  const u = ROUND_UNIT[f] || 1;
  return Math.round(v / u) * u;
};
const fmt = v => Number(v).toLocaleString('en-US');

const files = ['js/data-cards-101.js', 'js/data-cards-202.js', 'js/data-board.js', 'js/data-careers.js'];
const original = {};
for (const f of files) original[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');

if (original['js/data-careers.js'].includes('window.PRICE')) {
  console.error('检测到 window.PRICE —— 数据已经标定过了。');
  console.error('如需重新标定，请先还原：git checkout -- js/data-cards-101.js js/data-cards-202.js js/data-board.js js/data-careers.js');
  process.exit(1);
}

const stats = { fields: 0, notes: 0, skipped: [], byDeck: {}, byKind: {} };
const bump = (map, k, key) => { map[k] = map[k] || { fields: 0, notes: 0 }; map[k][key]++; };

/* 备注里的价格数字必须与字段同步，否则又会出现「备注写 ¥300,000、卡面写 ¥645,000」。
   规则刻意收窄，只动「价格类」数字：
     · 出租物业 → 只改「总价」与「首付」（其后的租金 / 净现金流是收益，不换算）
     · 其余 → 只改备注里的【第一个】¥ 数字（它就是买入价 / 报价）
   收益类数字（月净收入 / 派息 / 年化 / 净现金流）一律不动。 */
function scaleNote(kind, note, vals) {
  let out = note, hit = 0;
  /* ⚠️ 必须匹配【完整数字】再替换：只匹配 [\d,]+ 会留下小数尾巴，
     把「¥3.5」换成「¥7.5.5」—— 第一版就踩了这个坑。 */
  const subst = (re, val) => {
    out = out.replace(re, m => { hit++; return m.replace(/[\d,]+(?:\.\d+)?/, fmt(val)); });
  };
  if (kind === 'realestate' && typeof vals.cost === 'number' && /总价/.test(out)) {
    subst(/总价\s*¥[\d,]+/, vals.cost);
    if (typeof vals.dp === 'number') subst(/首付\s*¥[\d,]+/, vals.dp);
  } else if ((kind === 'option' || kind === 'straddle') && typeof vals.premium === 'number') {
    /* 「权利金 ¥3/股 × 100 股 = ¥300，行权价 ¥32」——三处都要换 */
    subst(/权利金\s*¥[\d.]+/, vals.premium);
    subst(/=\s*¥[\d,]+/, Math.round(vals.premium * 100));
    if (typeof vals.strike === 'number') subst(/行权价\s*¥[\d,]+/, vals.strike);
  } else if (/¥[\d,]/.test(out)) {
    const pick = PRICE_FIELDS.find(f => typeof vals[f] === 'number' && vals[f] > 0);
    if (pick) subst(/¥[\d,]+/, vals[pick]);
  }
  return { text: out, hit };
}

/* 按牌堆分块处理：卡片常跨多行，不能按行切 */
function processFile(file) {
  const s = original[file];
  let out = s, last = 0;
  /* 先定位每个牌堆的区间 */
  const regions = [];
  const dre = /window\.(\w+)\s*=\s*\[/g;
  let dm;
  while ((dm = dre.exec(s))) {
    const name = dm[1];
    const end = s.indexOf('\n];', dm.index);
    if (end < 0) continue;
    regions.push({ name, start: dm.index + dm[0].length, end });
  }
  /* 从后往前替换，避免位移 */
  for (let i = regions.length - 1; i >= 0; i--) {
    const R = regions[i];
    if (!DECKS.includes(R.name)) continue;
    const seg = out.slice(R.start, R.end);
    const cre = /\{\s*id:'([^']+)'([\s\S]*?note:'[^']*')/g;
    let cm, segOut = '', segLast = 0;
    while ((cm = cre.exec(seg))) {
      const [whole, id, tail] = cm;
      const kindM = tail.match(/kind:'([^']+)'/);
      const kind = kindM ? kindM[1] : 'unknown';
      let body = whole;
      const vals = {};
      for (const f of PRICE_FIELDS) {
        const fm = body.match(new RegExp('(\\b' + f + '\\s*:\\s*)(-?\\d+(?:\\.\\d+)?)'));
        if (!fm) continue;
        const v = Number(fm[2]);
        if (!(v > 0)) { vals[f] = v; continue; }
        const nv = roundFor(f, v * K);
        if (!(nv > 0)) {           /* 取整单位设错会让小额字段归零，必须当场拦下 */
          console.error(`取整后归零：${R.name}:${id} 的 ${f} = ${v} × ${K} → ${nv}（检查 ROUND_UNIT）`);
          process.exit(1);
        }
        vals[f] = nv;
        body = body.replace(fm[0], fm[1] + nv);
        stats.fields++; bump(stats.byDeck, R.name, 'fields'); bump(stats.byKind, kind, 'fields');
      }
      const nm = body.match(/note:'([^']*)'/);
      if (nm && nm[1].indexOf('¥') >= 0) {
        const r = scaleNote(kind, nm[1], vals);
        if (r.hit > 0) {
          body = body.replace(nm[0], "note:'" + r.text + "'");
          stats.notes++; bump(stats.byDeck, R.name, 'notes'); bump(stats.byKind, kind, 'notes');
        } else {
          stats.skipped.push(R.name + ':' + id + ' (' + kind + ')');
        }
      }
      segOut += seg.slice(segLast, cm.index) + body;
      segLast = cm.index + whole.length;
    }
    segOut += seg.slice(segLast);
    out = out.slice(0, R.start) + segOut + out.slice(R.end);
  }
  /* 落盘前的格式校验：备注里若出现「7.5.5」这类畸形数字，说明替换规则写漏了 */
  const bad = out.match(/note:'[^']*\d+\.\d+\.\d+[^']*'/);
  if (bad) { console.error('备注出现畸形数字，已中止：\n  ' + bad[0]); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, file), out);
}

processFile('js/data-cards-101.js');
processFile('js/data-cards-202.js');

/* ---------------- 财务自由圈企业 / 梦想 ---------------- */
let ftGoals = 0;
{
  const p = path.join(ROOT, 'js/data-board.js');
  let s = fs.readFileSync(p, 'utf8');
  s = s.replace(/(\{ id:'b\d+', nm:'[^']*',\s*ico:'[^']*',\s*cost:)(\d+)/g,
    (m, a, v) => { ftGoals++; return a + roundFor('cost', Number(v) * K); });
  s = s.replace(/(\{ id:\d+,\s*nm:'[^']*',\s*ico:'[^']*',\s*cost:)(\d+)/g,
    (m, a, v) => { ftGoals++; return a + roundFor('cost', Number(v) * K); });
  fs.writeFileSync(p, s);
}

/* ---------------- 记录标定系数（供回归脚本核对） ---------------- */
{
  const p = path.join(ROOT, 'js/data-careers.js');
  let s = fs.readFileSync(p, 'utf8');
  const block = `
/* -------- 价格标定 --------
   方案 A（发薪日结算「自上次结算以来经过的年数」）把一生的结算覆盖率
   从 44.4%（45 年里只结约 20 年）提到约 95.6%（结约 43 年），
   即同等时间里沉淀下来的净现金变为原来的约 2.15 倍。
   资产价格是【存量货币】量，必须同步换算，否则同样的钱能买到 2.15 倍的资产。

   换算的是价格，不动收益（cf / rent / interest）——
   等价于「资产变贵、收益率被压缩」，这也正是货币变多时真实经济体的样子。

   ⚠️ 不要手改卡片里的价格数字。要改系数请用
      \`node tools/calibrate-prices.js <系数>\` —— 它会同时换算卡片字段与备注里的价格数字，
      保证两者不会打架。标定后必须重跑 \`test/time-unit.js\` 与 \`test/payday-trigger.js\`。 */
window.PRICE = {
  scale: ${K},
  basis: '标定系数 = 方案 A 后的结算覆盖率 ÷ 方案 A 前的 ≈ 95.6% ÷ 44.4%',
  fields: ${JSON.stringify(PRICE_FIELDS)},
  untouched: ['cf', 'rent', 'interest', 'pct', 'rate', 'min', 'max']
};

`;
  s = s.replace('/* -------- 银翅膀 --------', block + '/* -------- 银翅膀 --------');
  fs.writeFileSync(p, s);
}

console.log(`价格标定完成：系数 ×${K}`);
console.log(`  换算字段 ${stats.fields} 处 | 同步备注 ${stats.notes} 条 | 自由圈企业 / 梦想 ${ftGoals} 处`);
console.log('  按牌堆：');
for (const k of Object.keys(stats.byDeck)) console.log(`    ${k.padEnd(16)} 字段 ${String(stats.byDeck[k].fields).padStart(3)} · 备注 ${stats.byDeck[k].notes}`);
console.log('  按 kind：');
for (const k of Object.keys(stats.byKind).sort()) console.log(`    ${k.padEnd(16)} 字段 ${String(stats.byKind[k].fields).padStart(3)} · 备注 ${stats.byKind[k].notes}`);
if (stats.skipped.length) console.log(`  ⚠️ 未换算的含 ¥ 备注（需人工核对）：\n    ` + stats.skipped.join('\n    '));
