/* ============================================================================
   rebalance-returns.js —— 按 window.YIELD 重算全部投资机会的金额与回报
   ============================================================================

   用法：
     node tools/rebalance-returns.js          # 重算并写回
     node tools/rebalance-returns.js --dry    # 只打印，不写盘

   为什么需要这个脚本，而不是手改数据：
     卡片的 dp / rent / cf / interest 四个字段互相约束（净现金流 = 毛租金 − 月供，
     月供 = (房价 − 首付) × 房贷月利率）。手改任何一个都会破坏约束，而破坏后
     不会报错，只会让玩家算出对不上的账。

   为什么是幂等的：
     四个字段全部从 **cost**（房价 / 投入，本脚本不改它）与 YIELD 的比率推导 —
     重复运行会得到完全一样的结果，不会像「乘系数」那样越乘越小。

   为什么必须同时改 note：
     备注里硬编码了金额。改字段不改备注，就会出现「卡面写 ¥2,688、备注写 ¥3,600」——
     这类矛盾不报错，只会让玩家以为系统算错了（价格标定那一轮已经踩过一次）。
     本脚本的 note 由字段重新生成，并保留每张卡的叙述性尾句（TAILS）。
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.indexOf('--dry') >= 0;

/* ---------- 载入数据，取 YIELD 与卡片现状 ---------- */
global.window = {};
for (const f of ['data-careers.js', 'data-board.js', 'data-cards-101.js', 'data-cards-202.js'])
  eval(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'));
for (const k of Object.keys(global.window)) if (!(k in global)) global[k] = global.window[k];

const Y = global.YIELD;
if (!Y) { console.error('缺少 window.YIELD（应在 data-careers.js 中定义）'); process.exit(1); }

const money = v => '¥' + Math.round(v).toLocaleString('en-US');
const sign = v => (v >= 0 ? '+' : '−') + money(Math.abs(v));

/* ---------- 每张卡的叙述性尾句（数字之外的内容），原样保留 ---------- */
const TAILS = {
  sm8: '房龄老、租金上不去，等待拆迁或行情回暖后出手。',
  sm9: '收益高于普通理财，伴随信用风险，本金可能波动。',
  sm10: '（副业，需要投入精力打理）',
  bg9: '受消费行情影响，存在客流枯竭风险。',
  bg12: '属于高风险项目，请谨慎。',
  cg14: '等待行情回升后出售赚取差价。',
  cg15: '博取土地升值。',
  cf1: '202 规则：可联合购买，按出资比例分配现金流。',
  cf2: '可联合购买。', cf3: '可联合购买。', cf8: '可联合购买。',
  cf10: '私募债流动性差、信用风险高。'
};

/* ---------- 投入动词：让备注读起来仍是原来那种说法 ---------- */
const VERB = {
  bg5: '加盟出资', bg6: '开店投入', bg7: '接手驿站', bg8: '自建充电桩', bg9: '投入',
  sm10: '投入', cf4: '入股', cf5: '入股', cf6: '入股', cf7: '入股',
  sm9: '投入', bg12: '受让债权', cf10: '认购'
};

/* ---------- 特例：与档位公式不符、但有其现实理由的卡片 ---------- */
const SPECIAL = {
  /* 老破小：房龄老 → 租金租不上价（毛租金回报仅 2.0%，远低于同档住宅的 5.0%），
     而维护成本高。它是一张【设计成坏交易】的卡：价值在拆迁 / 行情回暖后的增值。 */
  sm8: { rentRate: 0.020 },
  /* 法拍房：法院要求短期内一次性付清，做不了按揭 → 按全款计。 */
  cg14: { down: 1.0 }
};

/* ---------- 计算一张卡的四个字段 ---------- */
function compute(c) {
  const t = c.tier ? Y.tier[c.tier] : null;
  if (!t) return null;
  const out = {};
  if (t.down !== undefined) {
    /* 房产：首付比例 + 毛租金回报 + 「只还息」的月供 */
    const sp = SPECIAL[c.id] || {};
    const rentRate = sp.rentRate !== undefined ? sp.rentRate : t.rent;
    const downRate = sp.down !== undefined ? sp.down : t.down;
    out.downRate = downRate;
    out.dp = Math.round(c.cost * downRate);
    out.rent = Math.round(c.cost * rentRate / 12);
    out.cf = Math.round(out.rent - (c.cost - out.dp) * Y.mortgageRate);
    out.yield = out.cf * 12 / out.dp;
  } else {
    const v = Math.round(c.cost * t.net / 12);
    if (c.kind === 'savings') out.interest = v; else out.cf = v;
    out.yield = t.net;
  }
  return out;
}

/* ---------- 生成备注 ---------- */
function noteOf(c, v) {
  const t = Y.tier[c.tier];
  const y = (v.yield * 100).toFixed(1);
  const tail = TAILS[c.id] ? TAILS[c.id] : '';
  if (t.down !== undefined) {
    if (c.capital) return `总价 ${money(c.cost)}，首付 ${money(v.dp)}（${Math.round(v.downRate * 100)}%），无租金收入。${tail}`;
    return `总价 ${money(c.cost)}，首付 ${money(v.dp)}（${Math.round(v.downRate * 100)}%），出租月收入 ${money(v.rent)}` +
           `（净现金流 ${sign(v.cf)} · 净回报 ${y}%/年）。${tail}`;
  }
  const verb = VERB[c.id] || '投入';
  if (c.kind === 'savings') return `${verb} ${money(c.cost)}，月派息 ${sign(v.interest)}（年化 ${y}%）。${tail}`;
  return `${verb} ${money(c.cost)}，月净收入 ${sign(v.cf)}（净回报 ${y}%/年）。${tail}`;
}

/* ---------- 改一个文件：按 id 定位卡片块，替换字段与 note ---------- */
const report = [];
function patchFile(rel, ids) {
  let s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const c of ids) {
    const v = compute(c);
    if (!v) { console.error('无法计算（缺 tier）：' + c.id); process.exit(1); }
    const re = new RegExp("(\\{ id:'" + c.id + "',[\\s\\S]*?\\n?\\s*\\})", 'm');
    const m = s.match(re);
    if (!m) { console.error('未找到卡片块：' + c.id); process.exit(1); }
    let block = m[1];
    const setNum = (field, val) => {
      const r = new RegExp('(' + field + ':) ?-?[\\d.]+');
      if (!r.test(block)) { console.error('字段缺失 ' + c.id + '.' + field); process.exit(1); }
      block = block.replace(r, '$1' + val);
    };
    if (v.dp !== undefined) setNum('dp', v.dp);
    if (v.rent !== undefined) setNum('rent', v.rent);
    if (v.cf !== undefined) {
      if (c.capital) { v.cf = 0; }
      setNum('cf', v.cf);
    }
    if (v.interest !== undefined) setNum('interest', v.interest);
    /* 备注：整段替换（note:'...' 内不含单引号） */
    const noteRe = /note:'[^']*'/;
    if (!noteRe.test(block)) { console.error('备注缺失：' + c.id); process.exit(1); }
    block = block.replace(noteRe, "note:'" + noteOf(c, v) + "'");
    s = s.replace(m[1], block);
    report.push({ id: c.id, nm: c.nm, tier: c.tier, dp: v.dp, rent: v.rent, cf: v.cf,
                  interest: v.interest, y: v.yield });
  }
  if (!DRY) fs.writeFileSync(path.join(ROOT, rel), s);
}

/* ---------- 自由圈企业：只有 cost 与 cf ---------- */
function patchFt() {
  const rel = 'js/data-board.js';
  let s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const b of global.FT_BUSINESSES) {
    const cf = Math.round(b.cost * Y.ftBusiness / 12);
    const re = new RegExp("(\\{ id:'" + b.id + "',[^\\n]*?\\bcf:) ?-?[\\d.]+");
    if (!re.test(s)) { console.error('未找到自由圈企业：' + b.id); process.exit(1); }
    s = s.replace(re, '$1' + cf);
    report.push({ id: b.id, nm: b.nm, tier: 'ft', cf, y: Y.ftBusiness });
  }
  if (!DRY) fs.writeFileSync(path.join(ROOT, rel), s);
}

/* ---------- 202 组合卡里的资产（嵌套结构，逐条精确替换）----------
   ★ 必须用【容忍当前值】的正则，不能写死旧字符串 ——
     否则第一次运行能改、第二次就找不到目标直接失败（不幂等）。 */
function patchPortfolios() {
  const rel = 'js/data-board.js';
  let s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const res = Y.tier.res, eq = Y.tier.equity;

  /* 小户型公寓：无显式负债 → 标准口径 */
  const aptCost = 65000, aptDp = Math.round(aptCost * res.down);
  const aptRent = Math.round(aptCost * res.rent / 12);
  const aptCf = Math.round(aptRent - (aptCost - aptDp) * Y.mortgageRate);
  /* 老破小出租房：显式负债（liabs.other）+ extraPay 已由 applyPortfolio 并入该贷款的月供，
     所以 cf 保持【毛租金】口径，月供单独由 extraPay 承担 ——
     不能改成净额，否则同一笔月供会被算两次。 */
  const oldCost = 170000, oldDebt = 120000, oldDp = oldCost - oldDebt;
  const oldRent = Math.round(oldCost * res.rent / 12);
  const oldDue = Math.round(oldDebt * Y.mortgageRate);
  /* 朋友公司股权 */
  const eqCf = Math.round(10000 * eq.net / 12);
  /* 大额存单 3.0%（原 12%）、货币基金 2.0%（原 12%）—— 原来的年化不真实 */
  const cd = Math.round(5000 * 0.030 / 12), mm = Math.round(3000 * 0.020 / 12);

  /* ★ 按组合卡名锚定【整条记录】再改内部字段与备注 ——
     这些记录里的数字与文案片段（「首付 ¥…」「note:'…'」）在别的卡上也出现过，
     只按片段匹配迟早误伤或漏改。记录一律以 `note:'…' }` 收尾，可以作为右边界。 */
  const patchEntry = (name, fn) => {
    const re = new RegExp("\\{ nm:'" + name + "',[\\s\\S]*?note:'[^']*' \\}");
    const m = s.match(re);
    if (!m) { console.error('未找到组合卡：' + name); process.exit(1); }
    s = s.replace(m[0], fn(m[0]));
  };
  const setNum = (blk, field, val) => {
    const r = new RegExp('(' + field + ':) ?-?[\\d.]+');
    if (!r.test(blk)) { console.error('组合卡字段缺失：' + field + ' @ ' + blk.slice(0, 40)); process.exit(1); }
    return blk.replace(r, '$1' + val);
  };
  const setNote = (blk, text) => blk.replace(/(note:')[^']*(')/, '$1' + text + '$2');

  patchEntry('小户型公寓', blk => {
    blk = setNum(blk, 'dp', aptDp);
    blk = setNum(blk, 'cf', aptCf);
    blk = setNum(blk, 'rent', aptRent);
    return setNote(blk, `首付 ${money(aptDp)} · 出租月收入 ${money(aptRent)}（净现金流 ${sign(aptCf)}）`);
  });

  /* 老破小出租房：cf 存的是【毛租金】，月供由 extraPay 承担（applyPortfolio 会把它
     并进那笔贷款的还款计划）—— 不能把 cf 改成净额，否则同一笔月供被算两次。 */
  patchEntry('老破小出租房', blk => {
    blk = setNum(blk, 'dp', oldDp);
    blk = setNum(blk, 'cf', oldRent);
    blk = setNum(blk, 'rent', oldRent);
    blk = setNum(blk, 'other', oldDebt);
    blk = setNum(blk, 'extraPay', oldDue);
    return setNote(blk, `首付 ${money(oldDp)}（${Math.round(oldDp / oldCost * 100)}%）· 出租月收入 ${money(oldRent)}`
      + ` · 附带房贷 ${money(oldDebt)}（月供 ${money(oldDue)}，另计为支出）`);
  });

  patchEntry('朋友公司股权', blk => {
    blk = setNum(blk, 'cf', eqCf);
    return setNote(blk, `出资 ¥10,000 · 月分红 ${sign(eqCf)}`);
  });

  patchEntry('大额存单', blk => {
    blk = setNum(blk, 'interest', cd);
    return setNote(blk, `¥5,000 大额存单，每月利息 ${money(cd)}（年化 3.0%）。`);
  });

  patchEntry('货币基金', blk => {
    blk = setNum(blk, 'dividend', mm);
    return setNote(blk, `¥3,000 货币基金，每月分红 ${money(mm)}（年化 2.0%）。`);
  });

  if (!DRY) fs.writeFileSync(path.join(ROOT, rel), s);
  report.push({ id: 'pf', nm: '组合卡', tier: '—', dp: aptDp, cf: aptCf, y: res.rent });
}

/* ---------- 执行 ---------- */
/* 只处理【标了档位】的卡片。股票 / 土地 / 收藏品没有 cf 也没有档位，不该被卷入标定。
   反过来也要守住：任何 cf / interest > 0 的卡片都必须有档位，否则会被静默漏掉。 */
function withCf(list) {
  for (const c of list) {
    const hasFlow = (typeof c.cf === 'number' && c.cf !== 0) || (typeof c.interest === 'number' && c.interest !== 0);
    if (hasFlow && !c.tier) {
      console.error('卡片有现金流却未标档位（会被漏掉）：' + c.id + ' ' + c.nm);
      process.exit(1);
    }
  }
  return list.filter(c => c.tier);
}
const SMALL_BIG = withCf([...global.DECK_SMALL, ...global.DECK_BIG]);
patchFile('js/data-cards-101.js', SMALL_BIG);
patchFile('js/data-cards-202.js', withCf([...global.DECK_CAPGAIN, ...global.DECK_CASHFLOW]));
patchFt();
patchPortfolios();

/* ---------- 报告 ---------- */
console.log((DRY ? '[dry-run] ' : '') + '按 window.YIELD 重算投资机会\n');
console.log('档位       | 卡片                                   | 投入      | 月现金流 | 回报率');
for (const r of report) {
  if (r.tier === 'ft') continue;
  const inv = r.dp !== undefined ? r.dp : null;
  console.log('  ' + String(r.tier).padEnd(8) + ' | ' + (r.id + ' ' + r.nm).padEnd(36) + ' | ' +
    (inv !== null ? money(inv) : '—').padStart(9) + ' | ' +
    (r.cf !== undefined ? String(r.cf) : String(r.interest)).padStart(8) + ' | ' +
    (r.y * 100).toFixed(1).padStart(6) + '%');
}
console.log();
console.log('自由圈企业（统一 ' + (Y.ftBusiness * 100) + '%/年）：' +
  report.filter(r => r.tier === 'ft').map(r => r.nm + ' ' + r.cf + '/月').join(' · '));
console.log();
console.log('门槛安全边际：101 ×' + Y.safetyMargin + ' · 202 ×' + Y.safetyMargin202);
if (!DRY) console.log('\n已写回数据文件（幂等：重复运行结果相同）');
