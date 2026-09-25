/* 家庭年度收支：边界、独立计龄、真实结算与存档幂等。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act,F=c.FAMILY;
function game(mode='solo',rule='101'){
 const g=E.newGame({mode,rule,count:2,seed:42}),p=g.players[0];p.cash=10000000;
 return {g,p};
}
function pay(g,p,steps=1){if(p.inFT)p.ftPos=0;else p.pos=1;return E.movePlayer(g,p,steps);}
let n=0;function test(name,run){run();n++;console.log('✅ '+name);}
test('新添丁记录出生年龄，18 / 22 岁边界逐项减少养育支出',()=>{
 const {g,p}=game();p.age=28;assert(A.addBaby(g).ok);assert.equal(p.family.children[0].birthAge,28);
 const base=p.job.perChild;
 for(const [age,ratio] of [[28,1],[45,1],[46,.5],[49,.5],[50,0]]){
  p.age=age;E.refreshLife(g,p);assert.equal(E.finance(p).exp.children,Math.round(base*ratio));
 }
 assert.equal(p.children,1);assert.equal(E.familySummary(p).dependentCount,0);
});
test('多个子女分别计龄；成年不释放终身最多三个孩子的名额',()=>{
 const {g,p}=game();for(const age of [20,24,28]){p.age=age;assert(A.addBaby(g).ok);}
 p.age=42;E.refreshLife(g,p);
 assert.equal(E.finance(p).exp.children,Math.round(p.job.perChild*.5)+p.job.perChild);
 assert(A.addBaby(g).capped);assert.equal(p.family.children.length,3);
});
test('17→18 岁先结原养育费，下一年才用减半金额',()=>{
 const {g,p}=game();p.age=20;A.addBaby(g);p.age=37;E.refreshLife(g,p);
 const monthly=E.settleCashflow(p),oldCost=E.finance(p).exp.children,ld=pay(g,p);
 assert.equal(ld.settled.years[0].amount,E.annual(monthly));assert.equal(p.age,38);
 assert.equal(E.finance(p).exp.children,Math.round(oldCost*.5));
 assert(g.log.some(x=>x.text.includes('成年过渡期')));
 const logs=g.log.length;E.refreshLife(g,p);E.familySummary(p);assert.equal(g.log.length,logs);
});
test('跨两个发薪日逐年切换子女费用，并仅记两个缴费年',()=>{
 const {g,p}=game();A.addBaby(g);p.age=37;E.refreshLife(g,p);
 const ld=pay(g,p,9);assert.equal(ld.settled.count,2);assert.equal(p.age,39);
 assert.equal(p.family.contributionYears,2);assert.equal(E.familySummary(p).children[0].age,19);
 assert.equal(ld.settled.years[1].monthly,E.settleCashflow(p));
});
test('没有经过发薪日、换回合或重复刷新，子女与缴费年数均不增长',()=>{
 const {g,p}=game();A.addBaby(g);p.pos=2;
 E.movePlayer(g,p,1);E.refreshLife(g,p);E.nextPlayer(g);E.familySummary(p);
 assert.equal(p.age,20);assert.equal(p.family.contributionYears,0);assert.equal(E.familySummary(p).children[0].age,0);
});
test('只有在职且领取工资的已结算年份计缴费；失业和出圈不计',()=>{
 const {g,p}=game();pay(g,p);assert.equal(p.family.contributionYears,1);
 p.joblessNeed=3;p.joblessProgress=0;E.refreshLife(g,p);pay(g,p);assert.equal(p.family.contributionYears,1);
 p.joblessNeed=0;E.refreshLife(g,p);pay(g,p);assert.equal(p.family.contributionYears,2);
 p.inFT=true;p.ftBase=10000;pay(g,p);assert.equal(p.family.contributionYears,2);assert.equal(p.age,24);
});
test('连续41个在职年份到61岁，退休切换为45%上限且不额外发钱',()=>{
 const {g,p}=game();for(let i=0;i<F.pensionFullYears;i++)pay(g,p);
 assert.equal(p.age,61);assert.equal(p.family.contributionYears,41);assert(p.retired);
 assert.equal(p.salary,Math.round(p.baseSalary*c.SOLO.pensionRatio));
 assert.equal(g.lastRetire.amount,0);const before=p.cash;pay(g,p);
 assert.equal(p.family.contributionYears,41);assert(p.cash!==before);
});
test('相同职业的养老金随缴费年数增加，超过上限不再增长',()=>{
 const {g,p}=game();p.age=61;let previous=-1;
 for(const years of [0,10,20,30,41,50]){
  p.family.contributionYears=years;E.refreshLife(g,p);
  assert.equal(p.salary,Math.round(p.baseSalary*c.SOLO.pensionRatio*Math.min(1,years/F.pensionFullYears)));
  assert(p.salary>=previous);previous=p.salary;
 }
 p.energy=0;E.refreshLife(g,p);assert.equal(p.salary,previous,'养老金不受低精力工资折扣影响');
});
test('60→61 按在职账本结清，61→62 开始收取医疗并领取对应养老金',()=>{
 const {g,p}=game();p.age=60;p.family.contributionYears=40;E.refreshLife(g,p);
 const wageYear=E.annual(E.settleCashflow(p)),ld=pay(g,p);
 assert.equal(ld.settled.years[0].amount,wageYear);assert.equal(p.family.contributionYears,41);
 assert.equal(E.familySummary(p).medicalBase,Math.round(p.baseSalary*F.medicalBaseRate));
 const pensionYear=E.annual(E.settleCashflow(p)),next=pay(g,p);
 assert.equal(next.settled.years[0].amount,pensionYear);
 assert.equal(E.familySummary(p).medicalBase,Math.round(p.baseSalary*(F.medicalBaseRate+F.medicalAnnualStep)));
});
test('退休基础医疗逐年增加，康复只移除临时医疗，不移除基础医疗',()=>{
 const {g,p}=game();p.age=61;p.family.contributionYears=41;E.refreshLife(g,p);
 const base=E.familySummary(p).medicalBase;p.medicalExp=100;p.crisisTurns=1;
 assert.equal(E.finance(p).exp.medical,base+100);
 E.tickEnergy(g,p);assert.equal(p.crisisTurns,0);assert.equal(p.medicalExp,0);assert.equal(E.finance(p).exp.medical,base);
 for(const age of [62,65,100]){
  p.age=age;E.refreshLife(g,p);
  const expected=Math.round(p.baseSalary*Math.min(F.medicalMaxRate,F.medicalBaseRate+(age-61)*F.medicalAnnualStep));
  assert.equal(E.finance(p).exp.medical,expected);assert(expected>=base);
 }
});
test('自由圈仍计家庭支出，但不把养老金或新缴费重复加入分红',()=>{
 const {g,p}=game('solo','202');A.addBaby(g);p.age=61;p.family.contributionYears=30;p.inFT=true;p.ftBase=10000;E.refreshLife(g,p);
 const f=E.finance(p),ft=E.ftFinance(p);
 assert.equal(ft.income,E.ftMonthly(p));assert(f.exp.children>=0);assert(f.exp.medical>0);
 assert.equal(ft.expense,E.ftExpenseOf(p,f));const ld=pay(g,p);assert.equal(ld.settled.years[0].monthly,ft.cashflow);
 assert.equal(p.family.contributionYears,30);
});
test('多人分别计龄，只有自己的发薪推进孩子年龄，养老金退休仍仅限单人',()=>{
 const {g,p}=game('age'),q=g.players[1];A.addBaby(g);g.cur=1;A.addBaby(g);g.cur=0;
 pay(g,p);assert.equal(E.familySummary(p).children[0].age,1);assert.equal(E.familySummary(q).children[0].age,0);
 q.age=64;E.refreshLife(g,q);assert(!q.retired);assert.equal(E.familySummary(q).medicalBase,0);
});
test('旧档保留原养育支出，从迁移点计龄；历史缴费明确标为兼容估计',()=>{
 const {g,p}=game();p.age=55;p.children=2;delete p.family;const cash=p.cash;
 E.migrateTime(g);assert.equal(E.finance(p).exp.children,2*p.job.perChild);
 assert.equal(E.familySummary(p).children[0].age,0);assert(p.family.children.every(x=>x.ageUnknown));
 assert.equal(p.family.contributionYears,35);assert.equal(p.family.estimatedContributionYears,35);assert.equal(p.cash,cash);
 const save=JSON.parse(JSON.stringify(g));E.migrateTime(save);
 assert.equal(JSON.stringify(save.players[0].family),JSON.stringify(p.family));
 pay(g,p);assert.equal(E.familySummary(p).children[0].age,1);assert.equal(p.family.contributionYears,36);
});
test('保存恢复不增加缴费、年龄或现金；养老金与医疗完全一致',()=>{
 const {g,p}=game();p.age=60;p.family.contributionYears=30;E.refreshLife(g,p);pay(g,p);A.addBaby(g);
 const snapshot=JSON.parse(JSON.stringify(g)),cash=p.cash,f=JSON.stringify(E.familySummary(p));
 E.migrateTime(snapshot);E.migrateTime(snapshot);const restored=snapshot.players[0];
 assert.equal(restored.cash,cash);assert.equal(JSON.stringify(E.familySummary(restored)),f);
 const years=restored.family.contributionYears;E.settleFamilyYear(snapshot,restored,60);assert.equal(restored.family.contributionYears,years);
});
console.log(`\n${n} 组家庭生命周期回归通过`);
