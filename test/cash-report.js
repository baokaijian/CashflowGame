/* 模板报表与游戏实结、共有份额、估值及净资产保持一致。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','ui-core','ui-cash-report'])
 vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);
const E=c.Engine,R=c.UiCashReport;let n=0;
function test(name,fn){fn();n++;console.log('✅ '+name);}
function game(rule='101',free=false){
 const g=E.newGame({rule,mode:'solo',seed:42}),p=g.players[0];p.cash=10000000;p.inFT=free;
 E.refreshLife(g,p);return {g,p};
}
function total(list,key){return list.reduce((sum,x)=>sum+x[key],0);}
test('两套规则和两圈收支、个人及项目负债均可加总对账',()=>{
 for(const rule of ['101','202'])for(const free of [false,true]){
  const {g,p}=game(rule,free),d=R.collect(g,p),f=free?E.ftFinance(p):E.finance(p),plan=E.settlementPlan(p);
  assert.equal(total(d.income,'monthly'),free?f.income:f.totalIncome);
  assert.equal(total(d.expenses,'monthly'),free?f.expense:f.totalExpenses);
  assert.equal(total(d.income,'annual'),plan.income);assert.equal(total(d.expenses,'annual'),plan.expense);
  assert.equal(d.month.net,E.settleCashflow(p));assert.equal(d.plan.amount,plan.amount);
  assert.equal(d.bookNet,E.netWorth(p));assert.equal(d.valueNet,E.valuedNetWorth(g,p));
 }
});
test('年中结清的当前月供100与年度实际252分别显示，实际入账同源',()=>{
 const {g,p}=game();E.LOAN_KEYS.forEach(k=>{p.liabs[k]=0;p.loans[k]={base:0,due:0,periods:24};});
 p.liabs.car=250;p.loans.car={base:250,due:100,periods:24};
 p.assets.business.push({nm:'测试企业',cost:1000,cf:10000});
 const d=R.collect(g,p),car=d.expenses.find(x=>x.key==='loan:car');
 assert.equal(car.monthly,100);assert.equal(car.annual,252);assert.notEqual(d.plan.amount,d.month.net*12);
 const cash=p.cash;p.pos=1;E.movePlayer(g,p,1);assert.equal(p.cash-cash,d.plan.amount);
 assert.equal(R.collect(g,p).expenses.find(x=>x.key==='loan:car').monthly,0);
});
test('共有房产的成本、估值与融资只用本人份额，项目利息不重复扣',()=>{
 const {g,p}=game();const item={nm:'共有商铺',cost:100000,dp:45000,share:.25,cf:650,projectDebt:55000,rent:876};
 p.assets.realEstate.push(item);E.registerProperty(g,p,item);const d=R.collect(g,p),row=d.assets.find(x=>x.name==='共有商铺');
 assert.equal(row.book,100000);assert.match(row.note,/25.0%/);assert.equal(row.value,E.propertyValue(g,item));
 assert.equal(d.liabilities.find(x=>x.name==='共有商铺 · 项目融资').balance,55000);
 assert.equal(d.income.find(x=>x.key==='realEstate').monthly,E.assetCashflow(item));
 assert.equal(d.expenses.filter(x=>x.key.startsWith('loan:')).length,6);
 assert.equal(d.bookNet,E.netWorth(p));assert.equal(d.valueNet,E.valuedNetWorth(g,p));
});
test('金融、固定、经营、无形及其他分类不重复计资产，未建模内容明确',()=>{
 const {g,p}=game();p.assets.stocks.push({symbol:'ETF',shares:3,cost:100});
 p.assets.lands.push({nm:'地块',cost:5000});p.assets.business.push({nm:'小店',cost:2000,cf:50});
 p.assets.ftBusiness.push({nm:'品牌特许经营',franchise:true,cost:3000,cf:70});
 p.assets.collectibles.push({nm:'收藏品',cost:1000,qty:2});
 const d=R.collect(g,p);assert.equal(d.assets.find(x=>x.name==='ETF').group,'financial');
 assert.equal(d.assets.find(x=>x.name==='地块').group,'fixed');assert.equal(d.assets.find(x=>x.name==='小店').group,'operating');
 assert.equal(d.assets.find(x=>x.name==='品牌特许经营').group,'intangible');assert.equal(d.assets.find(x=>x.name==='收藏品').group,'other');
 assert.equal(total(d.assets,'book')+p.cash,d.book);
 p.assets.ftBusiness=[];assert(R.render(g,p).includes('品牌、商誉等未单独建模'));
});
test('买卖借还及长岁后重新读当前账本，不将交易款当作经常收入',()=>{
 const {g,p}=game();E.LOAN_KEYS.forEach(k=>p.liabs[k]=0);const first=R.collect(g,p);
 p.liabs.bank=5000;p.cash+=5000;const loan=R.collect(g,p);
 assert.equal(loan.book-first.book,5000);assert.equal(loan.debt-first.debt,5000);assert.equal(loan.month.net-first.month.net,-50);
 p.assets.business.push({nm:'新店',cost:1000,cf:100});p.cash-=1000;
 assert.equal(R.collect(g,p).month.net-loan.month.net,100);p.assets.business=[];
 assert.equal(R.collect(g,p).month.net,loan.month.net);
 p.age=61;E.refreshLife(g,p);const retirement=R.collect(g,p);assert.equal(retirement.income[0].monthly,p.salary);
 p.inFT=true;assert.equal(R.collect(g,p).income[0].monthly,0);
});
test('自由圈费用取整、零收入、负净额及子女变化仍可对账',()=>{
 const {g,p}=game('101',true);E.LOAN_KEYS.forEach(k=>p.liabs[k]=0);p.medicalExp=1;E.addChild(g,p);
 const d=R.collect(g,p);assert.equal(total(d.expenses,'monthly'),E.ftFinance(p).expense);
 assert.equal(total(d.expenses,'annual'),d.plan.expense);assert(d.plan.amount<0);
 E.setPending(g,{type:'deficit',amount:1234});assert(R.render(g,p).includes('待处理年度缺口 ¥1,234'));
 assert(R.render(g,p).includes('尚未完成的补款不计为已扣现金'));
});
test('报表为只读展示，期权做空单列，字符串安全转义',()=>{
 const {g,p}=game();p.name='<img src=x>';p.assets.business.push({nm:'<b>测试企业</b>',cost:1000,cf:50});
 p.options.push({id:'test',label:'测试期权',symbol:'ABC',shares:100,premium:2,strike:10,expiresAt:3});
 p.shorts.push({symbol:'ABC',shares:100,price:10});E.finance(p);
 const before=JSON.stringify({cash:p.cash,liabs:p.liabs,age:p.age,assets:p.assets,log:g.log}),html=R.render(g,p);
 assert(html.includes('&lt;img'));assert(!html.includes('<img src=x>'));assert(html.includes('交易风险头寸'));
 assert(html.includes('不计入现有游戏净资产口径'));
 assert.equal(JSON.stringify({cash:p.cash,liabs:p.liabs,age:p.age,assets:p.assets,log:g.log}),before);
});
console.log(`\n${n} 组实时现金报表回归通过`);
