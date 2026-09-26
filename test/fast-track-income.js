/* D4：自由圈收益属于当前持有的资产，历史出圈快照不是永久分红权益。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
 vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);
const E=c.Engine,A=c.Act;
function game(rule='202',count=1){
 const g=E.newGame({rule,mode:count===1?'solo':'age',count,seed:42});
 g.players.forEach(p=>{Object.keys(p.assets).forEach(k=>p.assets[k]=[]);p.cash=2000000;p.energy=100;});return g;
}
function property(g,p=g.players[0],share=1,contract){
 const r={nm:'收益归属商铺',cost:1000000*share,dp:300000*share,cf:100000*share,rent:102870*share,share,heldYears:4};
 if(contract)r.orgContract=contract;p.assets.realEstate.push(r);E.registerProperty(g,p,r);return r;
}
function escape(g,p=g.players[0]){g.cur=p.id;const cash=p.cash,passive=E.finance(p).passive;assert(A.escapeRatRace(g).ok);assert.equal(p.cash-cash,passive*100);return passive;}
function sell(g,card,p=g.players[0]){A.marketImpact(g,card);const opt=A.marketOptions(g,card).find(x=>x.pid===p.id);const r=A.marketSell(g,opt);assert(r.ok);return opt;}
let n=0;function test(name,fn){fn();n++;console.log('✅ '+name);}
test('101 / 202 出圈后卖掉唯一房产立即停止收益，下一分红日按实际缺口结算',()=>{
 for(const rule of ['101','202']){
  const g=game(rule),p=g.players[0];property(g);escape(g);
  assert.equal(E.ftMonthly(p),100000);sell(g,{kind:'realestate',prop:'收益归属商铺',price:1200000});
  assert.equal(E.finance(p).passive,0);assert.equal(E.ftMonthly(p),0);
  const cash=p.cash,age=p.age,expected=E.annual(E.ftFinance(p).cashflow);p.ftPos=0;
  const ld=E.movePlayer(g,p,1);assert(expected<0);assert.equal(ld.collected,0);assert.equal(ld.deficit,-expected);
  assert.equal(p.cash,cash);assert.equal(p.age,age+1);assert.equal(ld.settled.yearsPaid,1);
 }
});
test('出圈奖励只发一次，资产收入未变化时不会双算自由圈企业或工资',()=>{
 const g=game(),p=g.players[0];property(g);p.assets.ftBusiness=[{nm:'既有自由圈企业',cost:1000,cf:2000}];
 escape(g);assert.equal(E.ftMonthly(p),102000);assert(p.salary>0);
 const before=JSON.stringify(g);assert(!A.escapeRatRace(g).ok);assert.equal(JSON.stringify(g),before);
 const biz=c.FT_BUSINESSES[0],old=E.ftMonthly(p);assert(A.buyFTBusiness(g,biz.id).ok);
 assert.equal(E.ftMonthly(p)-old,biz.cf);assert.equal(p.ftGain,biz.cf);
 const cf=E.ftMonthly(p);assert(A.openFranchise(g,biz.id).ok);assert.equal(E.ftMonthly(p)-cf,Math.round(biz.cf*.5));
});
test('共有产权出售只移除本人收益，另一位持有人的现金流不变',()=>{
 const g=game('202',2),[p,q]=g.players;const r=property(g,p,.5);property(g,q,.5);escape(g,p);escape(g,q);
 sell(g,{kind:'realestate',prop:r.nm,price:1200000},p);
 assert.equal(E.ftMonthly(p),0);assert.equal(E.ftMonthly(q),50000);
});
test('租金涨跌和机构管理费实时影响净收益，不重复扣费且允许亏损',()=>{
 const g=game(),p=g.players[0],r=property(g,p,1,{fee:.2,upkeep:.55});escape(g);
 assert.equal(E.ftMonthly(p),80000);A.marketImpact(g,{kind:'rentDelta',pct:-.2});
 assert.equal(r.cf,80000);assert.equal(E.ftMonthly(p),64000);
 A.marketImpact(g,{kind:'rentDelta',pct:.1});assert.equal(r.cf,110000);assert.equal(E.ftMonthly(p),88000);
 r.cf=-500;assert.equal(E.ftMonthly(p),-500);assert.equal(E.managementFee(r),0);
});
test('协议转让房产及企业后，卖方停止收益、买方只新增一次',()=>{
 const g=game('202',2),[p,q]=g.players,r=property(g,p,1,{fee:.2});property(g,q);escape(g,p);escape(g,q);
 const before=E.ftMonthly(q);assert(A.transferProperty(g,p,q,r.holdingId,300000).ok);
 assert.equal(E.ftMonthly(p),0);assert.equal(E.ftMonthly(q),before+80000);
 const item={nm:'经营企业',cost:10000,cf:300};p.assets.business.push(item);E.holdingId(g,item);
 assert.equal(E.ftMonthly(p),300);assert(A.transferAsset(g,p,q,'business',item.holdingId,12000).ok);
 assert.equal(E.ftMonthly(p),0);assert.equal(E.ftMonthly(q),before+80300);
});
test('急售、灾害和理财到期均移除未来收益，剩余持仓继续分红',()=>{
 for(const path of ['急售','灾害','理财']){
  const g=game(),p=g.players[0],r=property(g);p.assets.savings.push({nm:'到期本金',cost:10000,interest:50});
  p.assets.funds.push({nm:'继续持有基金',cost:2000,interest:10});escape(g);
  if(path==='急售')assert(E.liquidate(g,p,'realEstate',0,r.holdingId).ok);
  if(path==='灾害')sell(g,{kind:'disaster',target:r.nm});
  if(path==='理财'){
   E.setPending(g,{type:'market',card:{kind:'savings',rate:1.05}});
   const opt=A.marketOptions(g,g.pending.card).find(x=>x.assetKind==='savings');assert(A.marketSell(g,opt).ok);
  }
  assert.equal(E.ftMonthly(p),path==='理财'?100010:60);
 }
});
test('市场卖出再买回同一房产只恢复一份当前融资下的净收益',()=>{
 const g=game(),p=g.players[0],r=property(g);escape(g);sell(g,{kind:'realestate',prop:r.nm,price:1200000});
 assert.equal(E.ftMonthly(p),0);g.turnNo++;E.setPending(g,{type:'opportunity202'});
 const quote=E.propertyListings(g)[0];assert(A.buyPropertyListing(g,quote.listingId,quote).ok);
 assert.equal(p.assets.realEstate.length,1);assert.equal(p.assets.realEstate[0].propertyId,r.propertyId);
 assert.equal(E.ftMonthly(p),E.assetCashflow(p.assets.realEstate[0]));assert(E.ftMonthly(p)>0);
 const before=JSON.stringify(g);assert(!A.buyPropertyListing(g,quote.listingId,quote).ok);assert.equal(JSON.stringify(g),before);
});
test('202 买断同时接收原资产和自由圈企业，收入各计一次且企业战绩不混入原资产',()=>{
 const g=game('202',2),[p,q]=g.players;property(g,p);property(g,q);q.assets.business=[{nm:'被买断实业',cost:10000,cf:200}];
 q.assets.ftBusiness=[{nm:'被买断自由圈企业',cost:20000,cf:300}];escape(g,p);escape(g,q);g.cur=p.id;
 const before=E.ftMonthly(p);assert(A.buyout(g,q.id).ok);
 assert.equal(E.ftMonthly(p),before+100500);assert.equal(p.ftGain,300);assert(q.out);
});
test('旧档只迁移未来收入，保留现金、待付缺口、出圈奖励和历史记录，重复恢复不叠加',()=>{
 const g=game(),p=g.players[0];property(g);escape(g);p.assets.realEstate=[];p.ftBase=100000;delete p.ftIncomeVersion;
 p.assets.ftBusiness=[{nm:'剩余企业',cost:1000,cf:2000}];p.ftGain=2000;
 E.setPending(g,{type:'deficit',amount:500,landed:{deficit:500}});const cash=p.cash,pending=JSON.stringify(g.pending),escapePassive=p.escapePassive;
 let restored=JSON.parse(JSON.stringify(g));E.migrateTime(restored);let rp=restored.players[0];
 assert.equal(rp.ftIncomeVersion,1);assert.equal(rp.ftIncomeMigration.previousIncome,102000);assert.equal(rp.ftIncomeMigration.income,2000);
 assert.equal(E.ftMonthly(rp),2000);assert.equal(rp.cash,cash);assert.equal(rp.escapePassive,escapePassive);assert.equal(rp.ftGain,2000);
 assert.equal(JSON.stringify(restored.pending),pending);const snapshot=JSON.stringify(restored);
 E.migrateTime(restored);assert.equal(JSON.stringify(restored),snapshot);
 restored=JSON.parse(snapshot);E.migrateTime(restored);assert.equal(restored.players[0].cash,cash);assert.equal(E.ftMonthly(restored.players[0]),2000);
});
test('未出圈旧档无需收入迁移说明；新出圈不把历史快照当收入',()=>{
 const g=game(),p=g.players[0];delete p.ftIncomeVersion;p.ftBase=999999;E.migrateTime(g);
 assert.equal(p.ftIncomeVersion,1);assert(!p.ftIncomeMigration);property(g);escape(g);assert.equal(E.ftMonthly(p),100000);
});
test('自由圈授信的收入及使用率基数不包含停止领取的工资',()=>{
 const g=game(),p=g.players[0];property(g);escape(g);p.assets.realEstate=[];
 assert(p.salary>0);const credit=E.creditProfile(g,p);assert.equal(credit.monthlyIncome,0);assert.equal(credit.multi.base,1);
 assert.equal(credit.ok,false);p.assets.business.push({nm:'留存企业',cost:1000,cf:100});
 assert.equal(E.creditProfile(g,p).monthlyIncome,100);
});
console.log(`\n${n} 组自由圈收益归属验证通过。`);
