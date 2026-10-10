/* 实时月净额变化及年度预期，核对科目贡献，不把交易现金当发薪。 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','save-state'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act,S=c.SaveState;let n=0;
function test(label,fn){fn();n++;console.log('✅ '+label);}
function game(free=false){const g=E.newGame({rule:'101',mode:'solo',seed:42}),p=g.players[0];p.cash=1e7;p.inFT=free;
 for(const k of E.LOAN_KEYS){p.liabs[k]=0;p.loans[k]={base:0,due:0,periods:24};}
 if(free)p.assets.business.push({nm:"基础企业",cost:1000000,cf:30000});
 E.refreshLife(g,p);E.recordCashflowChanges(g);g.log=[];return {g,p};}
function record(g){E.recordCashflowChanges(g,'测试操作');return g.log[0];}
function match(row){assert.equal(row.changes.reduce((s,x)=>s+x.delta,0),row.to-row.from);}
test('净额由盈转亏与由亏转盈、负基数和零基数均说明清楚',()=>{
 assert.match(E.cashflowTrend(1000,2000),/增加 ¥1,000.*\+100.0%/);
 assert.match(E.cashflowTrend(1000,-1000),/减少 ¥2,000.*−200.0%.*由盈转亏/);
 assert.match(E.cashflowTrend(-1000,2000),/增加 ¥3,000.*\+300.0%.*由亏转盈/);
 assert.match(E.cashflowTrend(0,1000),/不计算涨跌幅.*转为盈余/);
 assert.match(E.cashflowTrend(-1000,0),/转为收支平衡/);
});
for(const free of [false,true])test(`${free?'自由圈':'内圈'}：新资产、借款与提前还本逐项解释，现金不被重复结算`,()=>{
 const {g,p}=game(free),cash=p.cash,monthly=E.settleCashflow(p);
 assert(A.buyDeal(g,{kind:'business',nm:'小店',cost:1000,cf:100}).ok);const a=record(g);
 assert.equal(a.cashflowSummary.to-monthly,100);assert.equal(p.cash,cash-1000);match(a.cashflowSummary);
 assert(a.cashflowSummary.changes.some(x=>x.label.includes('小店')&&x.delta===100));
 assert(A.takeLoan(g,10000).ok);const b=record(g);assert.equal(b.cashflowSummary.to-b.cashflowSummary.from,-100);
 assert(b.cashflowSummary.changes.some(x=>x.key==='loan:bank'&&x.delta===-100));
 const before=p.cash;assert(A.prepayLoan(g,'bank',2500,'settle').ok);const d=record(g);
 assert.equal(d.cashflowSummary.to-d.cashflowSummary.from,25);assert.equal(p.cash,before-2500);match(d.cashflowSummary);
 const count=g.log.length;record(g);record(g);assert.equal(g.log.length,count,'重绘无重复日志');
});
test('净额不变也显示抵消的收入和月供变化，重要科目按金额排序',()=>{
 const {g,p}=game();p.assets.business.push({nm:'大店',cost:1,cf:300},{nm:'小店',cost:1,cf:100});p.liabs.bank=40000;
 const row=record(g).cashflowSummary;assert.equal(row.to,row.from);assert.equal(row.changes[0].key,'loan:bank');assert.equal(row.changes[0].delta,-400);
 assert.equal(row.changes[1].delta,300);assert.equal(row.changes[2].delta,100);match(row);
});
test('年内尾款只改变未来年度净额也会记录，不误报月净额增加',()=>{
 const {g,p}=game();p.liabs.car=250;p.loans.car={base:250,due:100,periods:24};record(g);
 p.liabs.car=151;const l=record(g);assert.equal(l.cashflowSummary.to,l.cashflowSummary.from);
 assert.equal(l.cashflowSummary.annualTo-l.cashflowSummary.annualFrom,100);assert.match(l.cashflowDetails.join('\n'),/下一年预计净额/);
});
test('精力工资折减、租金、子女、退休医疗的金额与因素都可追溯',()=>{
 const {g,p}=game();p.energy=1;E.refreshLife(g,p);let l=record(g);
 assert(l.cashflowSummary.changes.some(x=>x.key==='salary'&&x.delta<0));assert.match(l.cashflowDetails.join('\n'),/精力绩效：无折减 → 低精力折减/);
 p.energy=100;p.age=27;E.refreshLife(g,p);record(g);p.family.children=[{id:'child-1',birthAge:10,ageUnknown:false}];p.children=1;E.refreshLife(g,p);record(g);
 p.age=28;E.refreshLife(g,p);l=record(g);assert(l.cashflowSummary.changes.some(x=>x.key==='expense:children'&&x.delta>0));
 p.age=60;E.refreshLife(g,p);record(g);p.age=61;E.refreshLife(g,p);l=record(g);assert.match(l.cashflowDetails.join('\n'),/退休养老金/);assert(l.cashflowSummary.changes.some(x=>x.key==='expense:medical'&&x.delta<0));
});
test('每次年度实结和后续预期分别记录；终龄不生成下一年的入账预期',()=>{
 const {g,p}=game();p.age=27;E.refreshLife(g,p);p.pos=1;E.movePlayer(g,p,1);const l=g.log[0],s=l.cashflowSummary;
 assert.equal(s.kind,'settlement');assert.equal(s.to,p.lastCashflowStatement.amount);assert(s.annualTo!==s.to);assert(s.nextChanges.some(x=>x.key==='salary'));
 assert.equal(s.nextChanges.reduce((sum,x)=>sum+x.delta,0),s.annualTo-s.annualFrom);
 p.age=69;p.pos=1;E.movePlayer(g,p,1);assert.equal(g.log[0].cashflowSummary.annualTo,null);assert.equal(g.log[0].cashflowSummary.nextChanges,null);
 S.prepare(S.encode(g,{rolled:true},true));
});
test('保存恢复不重放现金或日志；旧档建立当前基准；错误金额拒绝恢复',()=>{
 const {g,p}=game();p.assets.business.push({nm:'同名店',cost:1000,cf:100},{nm:'同名店',cost:2000,cf:200});record(g);
 const raw=S.encode(g,{rolled:false},true),restored=S.prepare(raw).g,count=restored.log.length,cash=restored.players[0].cash;
 record(restored);assert.equal(restored.log.length,count);assert.equal(restored.players[0].cash,cash);
 delete restored.players[0].cashflowPreview;record(restored);assert.equal(restored.log.length,count);
 const bad=JSON.parse(raw);bad.g.players[0].cashflowPreview.monthly.amount++;assert.throws(()=>S.prepare(JSON.stringify(bad)),/预期金额/);
 const broken=JSON.parse(raw);broken.g.log[0].cashflowSummary.to++;assert.throws(()=>S.prepare(JSON.stringify(broken)),/摘要金额/);
});
console.log(n+' 组实时收支变化回归通过');
