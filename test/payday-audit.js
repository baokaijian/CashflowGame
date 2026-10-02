/* 发薪日志必须解释实结金额，不重算或改写历史。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','save-state'])
  vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);
const E=c.Engine,A=c.Act,S=c.SaveState;
let count=0;
function test(name,fn){fn();count++;console.log('✅ '+name);}
function game(free=false){
  const g=E.newGame({rule:'101',mode:'solo',seed:42}),p=g.players[0];p.cash=10000000;p.inFT=free;
  E.LOAN_KEYS.forEach(k=>{p.liabs[k]=0;p.loans[k]={base:0,due:0,periods:24};});
  p.assets.business.push({nm:'稳定企业',cost:100000,cf:30000});
  E.refreshLife(g,p);return {g,p};
}
function pay(g,p){if(p.inFT)p.ftPos=0;else p.pos=1;const landed=E.movePlayer(g,p,1);return {landed,log:g.log[0],text:g.log[0].cashflowDetails.join('\n')};}
function matches(statement){assert.equal(statement.items.reduce((s,x)=>s+x.value,0),statement.amount);}

test('首年逐项加总等于现金实入；第二年相同账本明确持平',()=>{
  const {g,p}=game(),cash=p.cash,first=pay(g,p);
  matches(p.lastCashflowStatement);assert.equal(p.lastCashflowStatement.amount,p.cash-cash);
  assert.match(first.text,/稳定企业（资产净收入） ¥360,000/);
  assert.match(first.text,/无上次|从本次开始/);
  assert.match(first.text,/第 1—12 月/);
  assert.match(pay(g,p).log.text,/较上次年净额持平/);
});
test('新增资产和借款分别解释增加与扣供；提前结清不混入年收入',()=>{
  const {g,p}=game();pay(g,p);
  p.assets.business.push({nm:'新商店',cost:10000,cf:100});assert(A.takeLoan(g,5000).ok);
  const second=pay(g,p);assert.match(second.text,/新增持仓：新商店.*使年净额增加 ¥1,200/);
  assert.match(second.text,/信用贷本息.*使年净额减少 ¥600/);
  assert.match(second.log.text,/较上次年净额增加 ¥600/);
  assert(A.prepayLoan(g,'bank',5000,'settle').ok);
  const third=pay(g,p);assert.match(third.text,/信用贷本息.*使年净额增加 ¥600/);
  assert.match(third.text,/一次性现金往来/);matches(p.lastCashflowStatement);
});
test('年中结清按100、100、52扣款，之后月净额增加；下年仅多252',()=>{
  const {g,p}=game();p.liabs.car=250;p.loans.car={base:250,due:100,periods:24};
  const first=pay(g,p);
  assert.match(first.text,/第 1—2 月：¥100\/月；第 3 月：¥52\/月；第 4—12 月：¥0\/月/);
  assert.match(first.text,/第 3 月结清/);assert.equal(first.landed.settled.years[0].loanTotal,252);
  assert.match(pay(g,p).log.text,/较上次年净额增加 ¥252/);
});
test('同名不同持仓分别对比，旧凭据不会随卖出修改',()=>{
  const {g,p}=game();p.assets.business.push({nm:'同名店',cost:1000,cf:100},{nm:'同名店',cost:2000,cf:200});
  const first=pay(g,p),saved=JSON.stringify(first.log);p.assets.business.splice(1,1);
  const second=pay(g,p);assert.match(second.text,/持仓退出：同名店.*使年净额减少 ¥1,200/);
  assert.equal(JSON.stringify(first.log),saved);assert.match(second.log.text,/减少 ¥1,200/);
});
test('长岁工资和子女成年只影响下一年度，注明生效顺序',()=>{
  const {g,p}=game();p.age=27;E.addChild(g,p);p.family.children[0].birthAge=10;
  const first=pay(g,p);assert.match(first.text,/结算后长岁及还贷影响/);
  assert.match(first.text,/下一年预计净额/);assert.match(first.text,/子女阶段：未成年 → 成年过渡期/);
  const second=pay(g,p);assert.match(second.text,/与上次对账：27→28 岁/);
  assert.match(second.text,/子女养育费.*使年净额增加/);assert.match(second.text,/工资阶段：/);
});
test('截图回归：收入不变，子女成年后少支出840，19644→20484',()=>{
  const {g,p}=game();p.job=c.CAREERS.find(x=>x.id==='trucker');p.baseSalary=p.job.salary;p.name='Derek';
  p.liabs.school=6000;p.loans.school={base:6000,due:60,periods:24};p.liabs.bank=15000;
  p.assets.funds=[{nm:'高收益债基金',cost:10000,interest:52}];
  p.assets.realEstate=[{nm:'小区车位',cost:100000,dp:50000,cf:297}];
  p.assets.business=[{nm:'社区团购团长',cost:10800,cf:99}];p.age=38;
  p.family.children=[21,24,27].map((birthAge,i)=>({id:'child-'+(i+1),birthAge,ageUnknown:false}));p.children=3;
  const first=pay(g,p),prior=p.lastCashflowStatement;
  assert.equal(first.landed.collected,19644);assert.equal(first.landed.settled.years[0].income,45876);
  const cash=p.cash,second=pay(g,p),row=second.landed.settled.years[0];
  assert.equal(p.cash-cash,20484);assert.equal(row.income,45876);assert.equal(row.living,22872);assert.equal(row.loanTotal,2520);
  assert.match(second.log.text,/原因：子女养育费年度支出减少 ¥840/);
  assert(second.log.cashflowDetails[0].startsWith('与上次对账：'));
  assert.match(second.log.cashflowDetails[1],/子女养育费.*-¥5,040 → -¥4,200/);
  for(const item of prior.items){
    const after=p.lastCashflowStatement.items.find(x=>x.key===item.key);
    assert.equal(after.value-item.value,item.key==='expense:children'?840:0);
  }
});
test('退休、医疗和精力变化分别解释；分红日不叠加工资',()=>{
  const {g,p}=game();p.age=60;
  assert.match(pay(g,p).text,/收入口径：在职工资 → 退休养老金/);
  assert.match(pay(g,p).text,/医疗费.*使年净额减少/);
  const x=game();pay(x.g,x.p);x.p.energy=1;assert.match(pay(x.g,x.p).text,/精力绩效：无折减 → 低精力折减/);
  x.p.energy=100;x.p.inFT=true;
  const ft=pay(x.g,x.p);assert.match(ft.log.text,/分红日/);assert.match(ft.text,/财务自由圈（不计工资或养老金）/);
  assert.equal(x.p.lastCashflowStatement.items.find(r=>r.key==='salary').value,0);matches(x.p.lastCashflowStatement);
});
test('自由圈费用取整可对账，负净额说明待补缺口',()=>{
  const {g,p}=game(true);p.assets.business=[];p.medicalExp=1;
  const cash=p.cash,r=pay(g,p);assert(r.landed.deficit>0);assert.equal(p.cash,cash);
  matches(p.lastCashflowStatement);assert.equal(p.lastCashflowStatement.amount,-r.landed.deficit);
  assert.match(r.text,/待处理缺口/);assert.doesNotMatch(r.text,/本年净额已一次性计入现金/);
});
test('自动保存续局保留基准，日志裁剪不影响比较，旧档首年不猜历史',()=>{
  const {g,p}=game();pay(g,p);g.log=[];
  const restored=S.prepare(S.encode(g,{rolled:false},true)).g,rp=restored.players[0];
  assert.match(pay(restored,rp).log.text,/较上次年净额持平/);
  delete rp.lastCashflowStatement;assert.match(pay(restored,rp).text,/不猜测历史变化原因/);
  const data=JSON.parse(S.encode(restored,{rolled:false},true));data.g.players[0].lastCashflowStatement.amount++;
  assert.throws(()=>S.prepare(JSON.stringify(data)),/年度对账金额/);
});
test('多人、连续跨年各自对比；重复查看与零步不会追加凭据',()=>{
  const g=E.newGame({rule:'202',mode:'age',count:2,seed:42}),[p,q]=g.players;
  p.pos=1;const r=E.movePlayer(g,p,9);assert.equal(r.settled.years.length,2);
  assert.match(g.log[0].cashflowDetails.join('\n'),/与上次对账：20→21 岁/);
  assert.match(pay(g,q).text,/从本次开始/);assert.equal(p.lastCashflowStatement.since,21);
  const before=JSON.stringify(p.lastCashflowStatement),n=g.log.length;
  E.movePlayer(g,p,0);E.resolveSpace(g,p,r);E.resolveSpace(g,p,r);
  assert.equal(g.log.length,n);assert.equal(JSON.stringify(p.lastCashflowStatement),before);
});
console.log(`\n${count} 组发薪日志对账回归通过`);
