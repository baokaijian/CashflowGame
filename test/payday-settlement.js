/* 发薪日 = 一年收支 + 一年摊还 + 一岁。运行：node test/payday-settlement.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({ console });
ctx.window = ctx;
for (const file of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), ctx);
}
const E = ctx.Engine, A = ctx.Act;
let passed = 0;
function test(name, run) { run(); passed++; console.log('✅ ' + name); }
function game(mode = 'solo', rule = '101', count = 2) {
  const g = E.newGame({ mode, rule, count, seed:20260922 });
  const p = g.players[0];
  p.cash = 10000000;
  return {g, p};
}
function pay(g, p, steps = 1) {
  if (p.inFT) p.ftPos = 0; else p.pos = 1;
  return E.movePlayer(g, p, steps);
}
function acknowledge(g, p, landed) {
  E.resolveSpace(g, p, landed);
  if (g.pending && g.pending.type === 'deficit') {
    assert(E.payDeficit(g, p, g.pending.amount).ok);
    E.clearPending(g);
    E.resolveSpace(g, p, {...landed, deficit:0});
  }
  E.clearPending(g);
}

for (const mode of ['solo', 'age', 'endless']) for (const rule of ['101', '202']) {
  for (const inFT of [false, true]) test(`${mode}/${rule}/${inFT ? '分红' : '发薪'}：每格结一年并长一岁`, () => {
    const {g, p} = game(mode, rule);
    p.inFT = inFT; p.assets.business.push({nm:'分红测试企业',cost:100000,cf:10000});
    E.refreshLife(g, p);
    const before = p.cash, expected = E.annual(E.settleCashflow(p));
    const periods = E.loanInfo(p, 'home').periods;
    const landed = pay(g, p);
    assert.equal(landed.settled.yearsPaid, 1);
    assert.equal(E.ageOf(g, p), 21);
    assert.equal(p.cash - before, Math.max(0, expected));
    assert.equal(landed.deficit, Math.max(0, -expected));
    assert.equal(E.loanInfo(p, 'home').periods - periods, 12);
    assert.equal(p.settledAge, 21);
    assert.equal(g.round, 1);
    acknowledge(g, p, landed);
    const after = p.cash, debt = JSON.stringify(p.liabs);
    E.resolveSpace(g, p, {...landed, deficit:0});
    E.clearPending(g);
    assert.equal(p.cash, after);
    assert.equal(JSON.stringify(p.liabs), debt);
    E.endTurn(g);
    assert.equal(E.ageOf(g, p), 21, '结束回合不能再长岁');
  });
}

test('多次经过 / 一次跨两格：不跳过，每一笔都按新年龄和剩余负债重新计算', () => {
  const a = game(), b = game();
  a.p.age = b.p.age = 27;
  a.p.liabs.car = b.p.liabs.car = 100; // 第一笔结清车贷，第二笔支出相应变化
  E.refreshLife(a.g, a.p); E.refreshLife(b.g, b.p);
  const many = pay(a.g, a.p, 9);
  const first = pay(b.g, b.p), second = pay(b.g, b.p);
  assert.equal(many.settled.yearsPaid, 2);
  assert.equal(many.settled.skipped, 0);
  assert.equal(a.p.age, 29);
  assert.equal(many.collected, first.collected + second.collected);
  assert.equal(many.deficit, first.deficit + second.deficit);
  assert.equal(a.p.cash, b.p.cash);
  assert.equal(JSON.stringify(a.p.liabs), JSON.stringify(b.p.liabs));
  assert.notEqual(many.settled.years[0].monthly, many.settled.years[1].monthly);
});

test('零步 / 不经过发薪日 / 回合暂停：钱、贷款和年龄都不推进', () => {
  const {g,p} = game();
  const before = JSON.stringify({ cash:p.cash, age:p.age, liabs:p.liabs });
  const zero = E.movePlayer(g,p,0);
  assert.equal(zero.path.length,0);
  assert.equal(zero.settled,null);
  const one = E.movePlayer(g,p,1);
  assert.equal(one.settled,null);
  assert.equal(JSON.stringify({ cash:p.cash, age:p.age, liabs:p.liabs }), before);
  p.skipTurns = 2;
  E.markTurnPause(g);
  E.endTurn(g);
  E.endTurn(g);
  assert.equal(p.age,20);
  assert.equal(p.cash,10000000);
});

test('失业、复职、终局均不产生额外补结；旧 settledAge 不再影响发薪', () => {
  const {g,p} = game();
  g.round = 70; p.settledAge = 1;
  const cash = p.cash, debt = JSON.stringify(p.liabs);
  E.startJobless(g,p,0);
  assert.equal(p.cash,cash);
  assert.equal(p.age,20);
  assert.equal(JSON.stringify(p.liabs),debt);
  assert.equal(E.settleAtBreak(g,p),null);
  const ld = pay(g,p);
  assert.equal(ld.settled.yearsPaid,1);
  assert.equal(p.age,21);
  assert(ld.deficit > 0);
  acknowledge(g,p,ld);
  while(E.isJobless(p)) { p.energy=100; E.jobHunt(g,p); }
  const after=p.cash;
  E.finalSettle(g);
  assert.equal(p.cash,after);
  assert.equal(p.age,21);
});

test('一回合跨过退休年龄：60→61 按工资、61→62 按养老金，且没有补结', () => {
  const {g,p} = game();
  p.age=60; E.refreshLife(g,p);
  const before=p.cash, salaryYear=E.annual(E.settleCashflow(p));
  const separate=JSON.parse(JSON.stringify(g));pay(separate,separate.players[0]);
  const pensionMonthly=E.settleCashflow(separate.players[0]); // 61 岁账本，不能拿62岁的医疗费反推
  const ld=pay(g,p,9);
  assert.equal(ld.settled.yearsPaid,2);
  assert.equal(ld.settled.years[0].amount,salaryYear);
  assert.equal(ld.settled.years[1].monthly,pensionMonthly);
  assert(p.retired);
  assert.equal(p.age,62);
  assert.equal(p.cash-before,ld.collected);
  assert.equal(g.lastRetire.age,61);
  assert.equal(g.lastRetire.years,0);
  assert.equal(E.retireBreakOf(g),null);
});

test('多人各自年龄、工资阶段和精力上限独立', () => {
  const {g,p} = game('age'); const other=g.players[1];
  p.age=59; other.age=27;
  E.refreshAllLife(g);
  const salary=other.salary, energy=E.energyMax(g,other);
  pay(g,p);
  assert.equal(p.age,60);
  assert.equal(other.age,27);
  assert.equal(other.salary,salary);
  assert.equal(E.energyMax(g,other),energy);
  E.endTurn(g);
  assert.equal(E.ageOf(g),27);
  assert.equal(E.ageOf(g,p),60);
});

test('最后一年停在结算日；缺口必须处理完才能结束；终局不多发一年', () => {
  const {g,p}=game(); p.age=64; p.liabs.bank=5000000;
  E.refreshLife(g,p);
  const ld=pay(g,p,24);
  assert.equal(ld.path.length,1);
  assert.equal(ld.settled.yearsPaid,1);
  assert.equal(ld.to,2);
  assert.equal(p.age,65);
  assert(ld.deficit>0);
  E.resolveSpace(g,p,ld);
  assert.equal(g.pending.type,'deficit');
  E.endTurn(g);
  assert.equal(g.over,false);
  acknowledge(g,p,ld);
  const cash=p.cash, debt=JSON.stringify(p.liabs);
  E.endTurn(g);
  assert(g.over);
  assert.equal(p.cash,cash);
  assert.equal(JSON.stringify(p.liabs),debt);
  assert.equal(g.soloResult.endAgeNow,65);
  assert.equal(g.finalSettled.length,0);
});

test('最后一年无法填补缺口时破产，而非免费退休', () => {
  const {g,p}=game(); p.age=64; p.cash=0; p.liabs.bank=5000000;
  const ld=pay(g,p); E.resolveSpace(g,p,ld);
  assert.equal(E.payDeficit(g,p,g.pending.amount).ok,false);
  E.declareBankruptcy(g,p);
  assert(g.over && p.out);
  assert.equal(g.soloResult.grade,'F');
});

test('多人先到终龄者等待；跳过已完成席位，其他人仍可长岁，最后统一排名', () => {
  const {g,p}=game('age'); const q=g.players[1]; p.age=64; q.age=63; q.cash=10000000;
  acknowledge(g,p,pay(g,p)); E.endTurn(g);
  assert(p.finished && !p.out && !g.over);
  assert.equal(E.current(g),q);
  const snapshot=JSON.stringify({cash:p.cash,age:p.age,liabs:p.liabs});
  acknowledge(g,q,pay(g,q)); E.endTurn(g);
  assert.equal(E.current(g),q);
  assert.equal(q.age,64);
  assert.equal(JSON.stringify({cash:p.cash,age:p.age,liabs:p.liabs}),snapshot);
  acknowledge(g,q,pay(g,q)); E.endTurn(g);
  assert(g.over && q.finished);
  assert.equal(g.winner, E.netWorth(p)>E.netWorth(q) ? p.id : q.id);
});

test('资产折旧按实际结算年推进；出圈年龄独立记录，不从轮数倒推', () => {
  const {g,p}=game();
  const item=E.stampAsset(g,{nm:'企业',cost:100000,cf:100000}); p.assets.business.push(item);
  g.round=30;
  assert.equal(E.appraiseAsset(g,'business',item).years,0);
  pay(g,p);
  assert.equal(E.appraiseAsset(g,'business',item).years,1);
  assert(A.escapeRatRace(g).ok);
  assert.equal(p.escapeAge,21);
  assert.equal(E.soloOutcome(g,p).escapeAge,21);
});

test('截图回归：积压两个回合后经过一次，只入账 ¥25,080 而非 ¥50,160', () => {
  const {g,p}=game();
  p.name='Derek';
  // 固定年结余，隔离职业随机数及贷款到期引起的账本变化。
  p.job={...p.job,salary:0,taxes:0,retail:0,other:0,car:0,credit:0}; p.baseSalary=0;
  E.LOAN_KEYS.forEach(k=>p.liabs[k]=0);
  Object.keys(p.assets).forEach(k=>p.assets[k]=[]);
  p.assets.savings.push({nm:'测试年结余',cost:100000,interest:2090});
  g.round=3; p.age=22; p.settledAge=20;
  E.refreshLife(g,p);
  assert.equal(E.annual(E.settleCashflow(p)),25080);
  const before=p.cash;
  const landed=pay(g,p);
  assert.equal(p.cash-before,25080);
  assert.equal(landed.settled.count,1);
  assert.equal(landed.settled.yearsPaid,1);
  assert.equal(p.age,23);
  assert(g.log[0].text.includes('年结余 ¥25,080 × 1'));
  acknowledge(g,p,landed);
  E.endTurn(g);
  assert.equal(p.cash-before,25080);
});

test('新档恢复不重复结算；旧档保留年龄现金并只迁移一次', () => {
  const {g,p}=game(); pay(g,p,9);
  const restored=JSON.parse(JSON.stringify(g));
  E.migrateTime(restored);
  assert.equal(restored.players[0].age,22);
  assert.equal(restored.players[0].cash,p.cash);
  const legacy=JSON.parse(JSON.stringify(g));
  delete legacy.timeVersion; delete legacy.players[0].age;
  legacy.round=12; legacy.players[0].settledAge=23;
  E.migrateTime(legacy);
  const lp=legacy.players[0];
  assert.equal(lp.age,31);
  assert.equal(lp.cash,p.cash);
  const before=JSON.stringify(legacy); E.migrateTime(legacy);
  assert.equal(JSON.stringify(legacy),before);
  E.refreshLife(legacy,lp);
  const cash=lp.cash, expected=E.annual(E.settleCashflow(lp));
  const landed=pay(legacy,lp);
  assert.equal(lp.cash-cash,Math.max(0,expected));
  assert.equal(landed.settled.yearsPaid,1);
  assert.equal(lp.age,32);
});
console.log(`\n✅ ${passed} 组年度结算测试全部通过`);
