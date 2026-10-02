/* 月净额、逐月本息与实际年度入账。预期值独立计算，不复用结算实现。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','ui-core'])
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act;
let n=0;function test(nm,fn){fn();n++;console.log('✅ '+nm);}
function game(free=false,mode='solo',rule='101'){
 const g=E.newGame({mode,rule,count:2,seed:42}),p=g.players[0];p.cash=10000000;p.inFT=free;
 E.LOAN_KEYS.forEach(k=>{p.liabs[k]=0;p.loans[k]={base:0,due:0,periods:24};});
 p.assets.business.push({nm:'固定测试企业',cost:100000,cf:30000});
 E.refreshLife(g,p);return {g,p};
}
function due(p,key,balance,payment){p.liabs[key]=balance;p.loans[key]={base:balance,due:payment,periods:24};}
function pay(g,p){if(p.inFT)p.ftPos=0;else p.pos=1;return E.movePlayer(g,p,1);}
for(const free of [false,true]){
 test(`${free?'自由圈':'内圈'}：六类贷款结清完整释放月供、生活费用不变`,()=>{
  for(const key of E.LOAN_KEYS){
   const {g,p}=game(free);due(p,key,10000,500);
   const monthly=E.settleCashflow(p),loan=E.loanDue(p,key),budgets=JSON.stringify(E.livingBudget(p).map(x=>x.gap));
   const expense=(free?E.ftFinance(p).expense:E.finance(p).totalExpenses),cash=p.cash;
   const plan=E.prepayPlan(p,key,p.liabs[key],'settle');assert(plan.ok);assert.equal(plan.budget.saving,loan);
   assert.equal(A.prepayLoan(g,key,p.liabs[key],'settle').ok,true);
   assert.equal(p.cash,cash-plan.need);assert.equal(E.loanDue(p,key),0);
   assert.equal(E.settleCashflow(p),monthly+loan);
   assert.equal((free?E.ftFinance(p).expense:E.finance(p).totalExpenses),expense-loan);
   assert.equal(JSON.stringify(E.livingBudget(p).map(x=>x.gap)),budgets);
   const before=p.cash,expected=E.annual(monthly+loan);assert.equal(pay(g,p).collected,expected);assert.equal(p.cash-before,expected);
  }
 });
 test(`${free?'自由圈':'内圈'}：借入信用贷即扣息、全还清再借仍正确`,()=>{
  const {g,p}=game(free),monthly=E.settleCashflow(p),cash=p.cash;
  assert(A.takeLoan(g,10000).ok);assert.equal(p.cash,cash+10000);assert.equal(E.settleCashflow(p),monthly-100);
  const before=p.cash;assert.equal(pay(g,p).collected,E.annual(monthly-100));assert.equal(p.cash-before,E.annual(monthly-100));
  assert.equal(p.liabs.bank,10000,'信用贷只付息，不擅自扣本金');
  assert(A.prepayLoan(g,'bank',10000,'settle').ok);assert.equal(E.settleCashflow(p),monthly);
  assert(A.takeLoan(g,5000).ok);assert.equal(E.settleCashflow(p),monthly-50);
 });
 test(`${free?'自由圈':'内圈'}：信用贷部分还本无固定期限，按剩余本金重算利息`,()=>{
  for(const mode of ['shorten','reduce']){
   const {g,p}=game(free);due(p,'bank',10000,100);
   const cash=p.cash,monthly=E.settleCashflow(p),plan=E.prepayPlan(p,'bank',2500,mode);
   assert(plan.ok);assert.equal(plan.before.remaining,null);assert.equal(plan.after.remaining,null);
   assert.equal(plan.after.due,75);assert.equal(plan.budget.saving,25);assert.equal(plan.budget.yearSaving,300);
   const r=A.prepayLoan(g,'bank',2500,mode);assert(r.ok);assert.equal(r.after.remaining,null);
   assert.equal(p.cash,cash-2500);assert.equal(p.liabs.bank,7500);assert.equal(E.settleCashflow(p),monthly+25);
   const info=E.loanInfo(p,'bank');assert.equal(info.remainingYears,null);assert.equal(info.dueYear,900);
   const restored=E.migrateTime(JSON.parse(JSON.stringify(g))).players[0];assert.equal(E.loanInfo(restored,'bank').due,75);
   assert.equal(restored.liabs.bank,7500);assert.equal(E.loanInfo(restored,'bank').remaining,null);
  }
 });
 test(`${free?'自由圈':'内圈'}：部分提前还款降低月供与缩期分别生效`,()=>{
  for(const mode of ['reduce','shorten']){
   const {g,p}=game(free);due(p,'car',10000,500);const monthly=E.settleCashflow(p),plan=E.prepayPlan(p,'car',5000,mode);
   assert(plan.ok);assert(A.prepayLoan(g,'car',5000,mode).ok);
   assert.equal(E.settleCashflow(p)-monthly,500-plan.after.due);
   if(mode==='shorten')assert.equal(E.settleCashflow(p),monthly);
   else assert(E.settleCashflow(p)>monthly);
   assert.equal(E.settlementPlan(p).expense,plan.budget.yearAfter);
  }
 });
 test(`${free?'自由圈':'内圈'}：年中还清只扣三期、预览无副作用、入账和尾期一致`,()=>{
  const {g,p}=game(free);due(p,'car',250,100);
  const initial=E.settleCashflow(p),before=JSON.stringify(p),preview=E.settlementPlan(p);
  // car 月利率 0.55%：250 的利息 1，还本 99；151 的利息 1，还本 99；52 的利息 0。
  assert.equal(c.LOAN_TYPES.car.rate,.0055);
  assert.deepEqual(Array.from(preview.schedule.loans.car.payments),[100,100,52,0,0,0,0,0,0,0,0,0]);
  assert.equal(preview.loanTotal,252);assert.equal(preview.amount,12*(initial+100)-252);
  assert.equal(JSON.stringify(p),before,'预览不能还本、扣款或累计期数');
  const cash=p.cash,landed=pay(g,p),row=landed.settled.years[0];
  assert.equal(p.cash-cash,preview.amount);assert.equal(row.amount,preview.amount);assert.equal(row.loanTotal,252);
  assert.equal(p.liabs.car,0);assert.equal(p.loans.car.periods,27);
  assert.equal(row.months[2].loans,52);assert.equal(row.months[3].loans,0);
  assert.equal(E.settleCashflow(p),initial+100);
  const notice=E.paydayNoticeOf(g,{...landed,space:{t:'start'}},free);assert.equal(notice.perYear,row.amount);
  const balance=p.cash;E.resolveSpace(g,p,landed);E.resolveSpace(g,p,landed);assert.equal(p.cash,balance);
 });
}
test('1 元尾款不被豁免或按全年合同月供多扣',()=>{
 const {g,p}=game();due(p,'car',1,100);const initial=E.settleCashflow(p),plan=E.settlementPlan(p);
 assert.equal(E.finance(p).loanTotal,1);assert.equal(plan.loanTotal,1);assert.equal(plan.amount,12*(initial+1)-1);
 pay(g,p);assert.equal(p.liabs.car,0);
});
test('多模式、两套规则均使用逐月净额；连续经过两个发薪日等于分开执行',()=>{
 for(const mode of ['solo','age','endless'])for(const rule of ['101','202']){
  const {g,p}=game(false,mode,rule);due(p,'car',250,100);
  const copy=E.migrateTime(JSON.parse(JSON.stringify(g))),other=copy.players[0];
  p.pos=1;const many=E.movePlayer(g,p,9),a=pay(copy,other),b=pay(copy,other);
  assert.equal(many.collected,a.collected+b.collected);assert.equal(p.cash,other.cash);
  assert.equal(p.age,other.age);assert.equal(JSON.stringify(p.liabs),JSON.stringify(other.liabs));
 }
});
test('年内贷款结束后的盈余可抵全年缺口，负年度净额只交一次',()=>{
 const {g,p}=game(true);p.assets.business=[];due(p,'car',250,100);
 const plan=E.settlementPlan(p),cash=p.cash,ld=pay(g,p);assert(plan.amount<0);
 assert.equal(ld.deficit,-plan.amount);assert.equal(p.cash,cash);E.resolveSpace(g,p,ld);
 assert.equal(g.pending.amount,-plan.amount);assert(E.payDeficit(g,p,g.pending.amount).ok);
 assert.equal(p.cash,cash+plan.amount);
});
test('旧档只更新未来计算，已锁定缺口、历史记录与现金不改写',()=>{
 const {g,p}=game();due(p,'home',10000,500);E.setPending(g,{type:'deficit',amount:1234});
 const cash=p.cash,track=JSON.stringify(p.track);const restored=E.migrateTime(JSON.parse(JSON.stringify(g))),r=restored.players[0];
 assert.equal(r.cash,cash);assert.equal(restored.pending.amount,1234);assert.equal(JSON.stringify(r.track),track);
 const first=E.settlementPlan(r).amount;E.migrateTime(restored);assert.equal(E.settlementPlan(r).amount,first);
});
test('财务页显示月净额与实际年度净额，房产项目利息不二次扣除',()=>{
 for(const free of [false,true]){
  const {g,p}=game(free);due(p,'car',250,100);
  p.assets.realEstate.push({nm:'测试房',cost:100000,dp:50000,projectDebt:50000,rent:1000,cf:795});
  assert.equal(E.finance(p).inc.realEstate,795);assert.equal(E.finance(p).loanTotal,100);
  const html=c.UI.renderIncome(p,g),plan=E.settlementPlan(p);
  assert(html.includes('当前月净现金流'));assert(html.includes(E.money(E.settleCashflow(p))));assert(html.includes(E.money(plan.amount)));
 }
});
console.log(`\n${n} 组贷款与月净现金流回归通过`);
