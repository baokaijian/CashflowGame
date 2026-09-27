/* 租金行情：毛租金逐次变化，融资利息和管理费分别扣一次。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','save-state','ui-core','ui-summary'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act;let n=0;function test(label,fn){fn();n++;console.log('✅ '+label);}
function game(count=1){const g=E.newGame({rule:'202',mode:count===1?'solo':'age',count,seed:42});g.players.forEach(p=>{for(const k of Object.keys(p.assets))p.assets[k]=[];p.cash=10000000;p.energy=100;});return g;}
function property(g,p=g.players[0],share=1,propertyId){const re={nm:'租金回归房',cost:200000*share,dp:100000*share,projectDebt:100000*share,financingRate:.006,rent:1000*share,cf:400*share,share};p.assets.realEstate.push(re);E.registerProperty(g,p,re,propertyId);return re;}
const shock=(g,pct)=>A.marketImpact(g,{kind:'rentDelta',pct});
test('上涨20%只改变毛租金，项目融资及利率不变',()=>{
 const g=game(),r=property(g),cash=g.players[0].cash;shock(g,.2);
 assert.equal(r.rent,1200);assert.equal(r.cf,600);assert.equal(r.projectDebt,100000);assert.equal(r.financingRate,.006);assert.equal(g.players[0].cash,cash);
});
test('连续涨20%跌20%按当前租金累乘，不跳回历史净额',()=>{
 const g=game(),r=property(g);r.baseCf=987654;shock(g,.2);shock(g,-.2);
 assert.equal(r.rent,960);assert.equal(r.cf,360);assert.equal(E.assetMarket(g).properties[r.propertyId].rent,960);
});
test('零净现金流的出租房也能受益，负净额房不会因降租反而改善',()=>{
 const g=game(),r=property(g);r.rent=600;r.cf=0;E.assetMarket(g).properties[r.propertyId].rent=600;
 shock(g,-.2);assert.equal(r.rent,480);assert.equal(r.cf,-120);shock(g,.5);assert.equal(r.rent,720);assert.equal(r.cf,120);
});
test('租金跌至零仍要支付项目利息，管理费只对正净额收取',()=>{
 const g=game(),p=g.players[0],r=property(g);p.inFT=true;r.orgContract={fee:.2,upkeep:.55};
 shock(g,.2);assert.equal(E.managementFee(r),120);assert.equal(E.ftMonthly(p),480);
 shock(g,-1);assert.equal(r.cf,-600);assert.equal(E.managementFee(r),0);assert.equal(E.ftMonthly(p),-600);
});
test('同一实体多持有人只调整一次毛租金，分别扣本人融资',()=>{
 const g=game(2),a=property(g,g.players[0],.5),b=property(g,g.players[1],.5,a.propertyId);b.projectDebt=25000;
 shock(g,.2);assert.equal(E.assetMarket(g).properties[a.propertyId].rent,1200);
 assert.equal(a.rent+b.rent,1200);assert.equal(a.cf,300);assert.equal(b.cf,450);
});
test('出售一部分后的挂牌份额与留存份额经历同一租金行情',()=>{
 const g=game(2),p=g.players[0],a=property(g,p,.5),b=property(g,g.players[1],.5,a.propertyId);
 assert(A.marketSell(g,A.marketOptions(g,{kind:'realestate',prop:a.nm,price:220000})[0]).ok);
 g.turnNo++;shock(g,.2);const plan=E.propertyListings(g)[0];assert.equal(plan.rent,600);assert.equal(b.rent,600);
 E.setPending(g,{type:'opportunity202'});assert(A.buyPropertyListing(g,plan.listingId,plan).ok);assert.equal(p.assets.realEstate[0].rent,600);
});
test('全部出售后空置实体连续行情累乘，买回预览与执行一致',()=>{
 const g=game(),p=g.players[0],r=property(g);assert(A.marketSell(g,A.marketOptions(g,{kind:'realestate',prop:r.nm,price:220000})[0]).ok);
 g.turnNo++;shock(g,.2);shock(g,-.2);const plan=E.propertyListings(g)[0];assert.equal(plan.rent,960);
 E.setPending(g,{type:'opportunity202'});assert(A.buyPropertyListing(g,plan.listingId,plan).ok);assert.equal(p.assets.realEstate[0].cf,plan.cf);
});
test('法拍房及小地块买入、行情、卖出、买回始终零租金零持有现金流',()=>{
 for(const id of ['cg14','cg15']){
  const g=game(),p=g.players[0],card=c.DECK_CAPGAIN.find(x=>x.id===id);assert.equal(card.rent,0);assert(A.buyDeal(g,card).ok);
  let r=p.assets.realEstate[0];shock(g,.3);assert.equal(r.rent,0);assert.equal(r.cf,0);
  assert(A.marketSell(g,A.marketOptions(g,{kind:'realestate',prop:r.nm,price:card.cost*1.2})[0]).ok);
  g.turnNo++;shock(g,.3);const plan=E.propertyListings(g)[0];assert(plan.capital);assert.equal(plan.rent,0);assert.equal(plan.cf,0);
  E.setPending(g,{type:'opportunity202'});assert(A.buyPropertyListing(g,plan.listingId,plan).ok);r=p.assets.realEstate[0];assert(r.capital);assert.equal(r.cf,0);
 }
});
test('旧档只按当前保留租金继续，不重放历史行情或改现金',()=>{
 const g=game(),p=g.players[0],r=property(g);r.baseCf=123456;shock(g,.2);const cash=p.cash;
 const restored=c.SaveState.prepare(c.SaveState.encode(g,{rolled:false},false)).g;assert.equal(restored.players[0].cash,cash);
 shock(restored,-.2);assert.equal(restored.players[0].assets.realEstate[0].rent,960);
 const once=JSON.stringify(restored);E.migrateTime(restored);assert.equal(JSON.stringify(restored),once);
});
test('旧档可识别纯资本资产及无人持有的实体恢复零租金属性',()=>{
 const g=game(),p=g.players[0];const card=c.DECK_CAPGAIN.find(x=>x.id==='cg14');assert(A.buyDeal(g,card).ok);
 const r=p.assets.realEstate[0],prop=E.assetMarket(g).properties[r.propertyId];delete r.capital;delete prop.capital;r.cf=717;r.rent=717;prop.rent=717;
 const cash=p.cash;E.migrateTime(g);assert(r.capital&&prop.capital);assert.equal(r.rent,0);assert.equal(r.cf,0);assert.equal(p.cash,cash);
 p.assets.realEstate=[];delete prop.capital;prop.rent=717;E.migrateTime(g);assert(prop.capital);assert.equal(prop.rent,0);
});
test('非法租金比例不改变任何账本或估值，允许合法全额降租',()=>{
 for(const pct of [NaN,Infinity,-1.1]){const g=game();property(g);const before=JSON.stringify(g);shock(g,pct);assert.equal(JSON.stringify(g),before);}
});
test('自由圈复盘当前收支与结算、年度走势、导出同源',()=>{
 for(const retired of [false,true]){
  const g=game(),p=g.players[0];property(g);p.inFT=true;p.age=retired?62:40;E.refreshLife(g,p);E.trackRound(g);
  const ft=E.ftFinance(p),summary=c.UiSummary.collect(g,p),out=JSON.parse(c.UiSummary.exportJSON(g)).players[0];
  assert.equal(summary.f.totalIncome,ft.income);assert.equal(summary.f.totalExpenses,ft.expense);assert.equal(summary.f.cashflow,ft.cashflow);
  assert.equal(out.metrics.totalIncome,ft.income);assert.equal(out.metrics.totalExpenses,ft.expense);assert.equal(out.metrics.monthlyCashflow,ft.cashflow);assert.equal(p.track.at(-1).cf,ft.cashflow);
 }
});
test('内圈复盘保持原账本，恰好等于门槛不能声称已经出圈达标',()=>{
 const g=game(),p=g.players[0];const target=E.escapeTarget(g,p);p.assets.savings=[{nm:'边界理财',cost:10000,interest:target}];
 assert(!E.escapeProgress(g,p).canEscape);assert.equal(c.UiSummary.collect(g,p).f.cashflow,E.finance(p).cashflow);
 assert(!c.UiSummary.exportMarkdown(g).includes('你已满足出圈条件'));
});
console.log(n+' 组租金与复盘口径回归通过');
