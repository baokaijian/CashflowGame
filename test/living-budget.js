/* 持续生活成本：年度结算、贷款预览、自由圈与存档兼容。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act;
function game(){
 const g=E.newGame({mode:'solo',rule:'101',count:1,seed:42}),p=g.players[0];
 p.job=c.CAREERS.find(j=>j.id==='engineer');p.baseSalary=p.job.salary;
 p.liabs={...p.liabs,...p.job.liab};p.loans=null;p.cash=10000000;E.refreshLife(g,p);E.ensureLoans(p);
 return {g,p};
}
let n=0;function test(name,run){run();n++;console.log('✅ '+name);}
test('所有职业开局车贷和信用卡月供覆盖预算，不额外双收费',()=>{
 for(const job of c.CAREERS){const {p}=game();p.job=job;p.baseSalary=job.salary;p.liabs={...p.liabs,...job.liab};p.loans=null;
  const f=E.finance(p);assert.equal(f.exp.carGap,0);assert.equal(f.exp.consumptionGap,0);
 }
});
test('结清车贷与信用卡仍保留持续成本，还款预览与实际总支出一致',()=>{
 for(const key of ['car','credit']){
  const {g,p}=game();E.amortize(g,p); // 实际摊还一年后解除提前还款限制
  const before=E.finance(p),cash=p.cash,plan=E.prepayPlan(p,key,p.liabs[key],'settle');
  assert(plan.ok);assert(plan.budget.saving>=0 && plan.budget.saving<plan.before.due);
  assert.equal(p.cash,cash,'预览不扣款');assert(A.prepayLoan(g,key,p.liabs[key],'settle').ok);
  const after=E.finance(p);assert.equal(after.totalExpenses,plan.budget.after);
  assert.equal(before.totalExpenses-after.totalExpenses,plan.budget.saving);
  assert(after.exp[key==='car'?'carGap':'consumptionGap']>0);
  assert.equal(E.escapeTarget(g,p),Math.round(after.totalExpenses*E.escapeMargin(g)));
  assert.equal(E.livingBudget(p).find(x=>x.key===key).due,0);
 }
});
test('部分提前还款降低月供，预览不改原计划且与实扣后账本相同',()=>{
 for(const free of [false,true]){
  const {g,p}=game();p.inFT=free;p.assets.business.push({nm:'分红测试企业',cost:100000,cf:10000});E.amortize(g,p);
  const loans=JSON.stringify(p.loans),cash=p.cash,amt=Math.round(p.liabs.car*.8);
  const plan=E.prepayPlan(p,'car',amt,'reduce');assert(plan.ok);
  assert.equal(JSON.stringify(p.loans),loans);assert.equal(p.cash,cash);
  assert(A.prepayLoan(g,'car',amt,'reduce').ok);
  assert.equal(free?E.ftFinance(p).expense:E.finance(p).totalExpenses,plan.budget.after);
  assert.equal(E.loanDue(p,'car'),plan.after.due);
 }
});
test('消费预算只补现有日常消费之外的部分，不能重复收原消费',()=>{
 const {p}=game();p.liabs.credit=0;const f=E.finance(p),row=E.livingBudget(p)[2];
 assert.equal(row.total,row.base);assert.equal(row.total,f.exp.retail+f.exp.consumptionGap);
 assert.equal(f.exp.consumptionGap,Math.round(p.job.credit*.5*p.lifeCoef));
});
test('降低月供到预算以下时补足差额；再次加债不会提高生活预算',()=>{
 const {p}=game(),base=E.livingBudget(p)[1].base;
 p.loans.car.due=10;assert.equal(E.finance(p).exp.carGap,base-10);
 p.liabs.car*=10;p.loans.car.due=1000;
 assert.equal(E.livingBudget(p)[1].base,base);assert.equal(E.finance(p).exp.carGap,0);
});
test('自然还清的年度仍按年初账本结算，下一年才使用预算补足',()=>{
 const {g,p}=game();p.liabs.car=10;p.loans.car.due=20;
 const expected=E.annual(E.settleCashflow(p)),cash=p.cash;p.pos=1;
 const move=E.movePlayer(g,p,1);assert.equal(p.cash-cash,expected);assert.equal(move.settled.count,1);
 assert.equal(p.liabs.car,0);assert(E.finance(p).exp.carGap>0);
 const next=E.annual(E.settleCashflow(p)),cash2=p.cash;p.pos=1;E.movePlayer(g,p,1);
 assert.equal(p.cash-cash2,next);
});
test('自由圈先调整预算后抵扣月供，逐步减债不会反向增加支出',()=>{
 for(const key of ['home','car','credit']){
  const {p}=game();p.inFT=true;p.assets.business.push({nm:'分红测试企业',cost:100000,cf:20000});let previous=Infinity;
  for(let due=1000;due>=0;due--){p.liabs[key]=due?10000:0;p.loans[key].due=due;
   const f=E.ftFinance(p);assert(f.expense<=previous,`${key}: ${due}`);previous=f.expense;
  }
  assert(E.livingBudget(p,c.LIFEBASE.freeTrackMult).find(x=>x.key===key).gap>0);
 }
});
test('自由圈提前结清预览自洽，分红与生活预算只扣一次',()=>{
 const {g,p}=game();p.inFT=true;p.assets.business.push({nm:'分红测试企业',cost:100000,cf:10000});E.amortize(g,p);
 const plan=E.prepayPlan(p,'car',p.liabs.car,'settle');assert(plan.ok);assert(A.prepayLoan(g,'car',p.liabs.car,'settle').ok);
 assert.equal(E.ftFinance(p).expense,plan.budget.after);
 const expected=E.annual(E.ftFinance(p).cashflow),cash=p.cash;p.ftPos=0;E.movePlayer(g,p,1);
 assert.equal(p.cash-cash,expected);
});
test('旧存档已清贷仍按原职业恢复预算，不追溯现金或重算锁定缺口',()=>{
 const {g,p}=game();p.liabs.car=0;p.liabs.credit=0;E.setPending(g,{type:'deficit',amount:1234});
 const cash=p.cash;let restored=E.migrateTime(JSON.parse(JSON.stringify(g)));
 const f=E.finance(restored.players[0]);assert(f.exp.carGap>0 && f.exp.consumptionGap>0);
 E.migrateTime(restored);assert.equal(restored.players[0].cash,cash);assert.equal(restored.pending.amount,1234);
 assert.equal(E.finance(restored.players[0]).totalExpenses,f.totalExpenses);
});
test('没有车贷及信用消费基准的角色不凭空新增对应预算',()=>{
 const {p}=game();p.job={...p.job,car:0,credit:0};p.liabs.car=0;p.liabs.credit=0;
 const f=E.finance(p);assert.equal(f.exp.carGap,0);assert.equal(f.exp.consumptionGap,0);
});
test('退休预算随人生阶段变化，赡养医疗与消费预算分开计',()=>{
 const {g,p}=game();p.liabs.car=0;p.liabs.credit=0;p.age=61;E.refreshLife(g,p);
 const f=E.finance(p);assert.equal(f.exp.medical,E.familySummary(p).medicalBase);
 assert.equal(f.exp.carGap,Math.round(p.job.car*.5*p.lifeCoef));
 assert(f.exp.consumptionGap>0);assert(Number.isFinite(f.totalExpenses));
});
console.log(`\n${n} 组持续生活预算回归通过`);
