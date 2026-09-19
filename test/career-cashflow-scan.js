/* 全职业 × 全年龄扫描：找出「在没有任何额外负债的前提下，月现金流仍会转负」的职业与年龄。
   这类系统性转负意味着游戏在默认轨迹上注定破产 —— 那不是「真实」，那是数值失衡。 */
const fs = require('fs');
const DIR = require('path').join(__dirname, '..', 'js') + '/';
global.window = {};
for (const f of ['data-careers.js','data-board.js','data-cards-101.js','data-cards-202.js','engine.js','engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(window)) if (!(k in global)) global[k] = window[k];
const E = window.Engine;
const money = v => '¥' + Math.round(v).toLocaleString('en-US');

/* 反复开局以覆盖全部职业（开局是随机的） */
const results = [];
const seen = new Set();
for (let i = 0; i < 120 && seen.size < CAREERS.length; i++) {
  const g = E.newGame({ rule:'101', mode:'age', count:6, names:['a','b','c','d','e','f'] });
  g.players.forEach(p => {
    if (seen.has(p.job.id)) return;
    seen.add(p.job.id);
    let minCf = Infinity, minAge = null, negAges = [];
    for (let age = 20; age <= 65; age++) {
      g.round = age - g.startAge + 1;
      E.refreshLife(g, p);
      const cf = E.finance(p).cashflow;
      if (cf < minCf) { minCf = cf; minAge = age; }
      if (cf < 0) negAges.push(age);
    }
    results.push({ name: p.job.name, base: p.job.salary, minCf, minAge, negAges });
  });
}

console.log(`职业覆盖 ${seen.size}/${CAREERS.length}（共 ${results.length} 个职业被扫描）\n`);
console.log('职业'.padEnd(16) + '基础工资'.padStart(10) + '最低现金流'.padStart(12) + ' 出现年龄  转负年龄区间');
console.log('-'.repeat(76));
results.sort((a, b) => a.minCf - b.minCf).forEach(r => {
  const neg = r.negAges.length
    ? `${r.negAges[0]}–${r.negAges[r.negAges.length - 1]} 岁（${r.negAges.length} 年）`
    : '无';
  console.log(
    r.name.padEnd(16) +
    money(r.base).padStart(10) +
    money(r.minCf).padStart(12) +
    String(r.minAge + ' 岁').padStart(10) + '  ' + neg
  );
});

const bad = results.filter(r => r.negAges.length);
console.log('');
console.log(bad.length
  ? `❌ ${bad.length}/${results.length} 个职业存在系统性转负：${bad.map(r => r.name).join('、')}`
  : `✅ 全部 ${results.length} 个职业在默认轨迹上一生现金流为正`);
