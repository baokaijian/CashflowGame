/* 统一报价、项目融资、资产身份与再次挂牌的现金不变式。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act;
function game(count=1){
  const g=E.newGame({mode:count===1?'solo':'age',rule:'202',count,seed:42});
  g.players.forEach(p=>{Object.keys(p.assets).forEach(k=>p.assets[k]=[]);p.cash=2000000;p.energy=100;});
  g.assetMarket={version:1,quotes:{},properties:{},listings:[],trades:[],next:0,feeRate:0};
  return g;
}
function property(g,p=g.players[0],share=1,id){
  const r={nm:'回归商铺',cost:1000000*share,dp:300000*share,cf:1000*share,rent:3870*share,share,heldYears:4};
  p.assets.realEstate.push(r);E.stampAsset(g,r);E.registerProperty(g,p,r,id);return r;
}
function sell(g,price=1200000){const card={kind:'realestate',prop:'回归商铺',price};A.marketImpact(g,card);const o=A.marketOptions(g,card)[0];assert(A.marketSell(g,o).ok);return o;}
function nextOpportunity(g){g.turnNo++;E.setPending(g,{type:'opportunity202'});}
let n=0;function test(name,fn){fn();n++;console.log('✅ '+name);}
test('同股不同成本、不同玩家的估值和抵押均使用最新行情',()=>{
  const g=game(2),[p,q]=g.players;
  p.assets.stocks=[{symbol:'ABC',shares:100,cost:10}];q.assets.stocks=[{symbol:'ABC',shares:50,cost:30}];
  A.marketImpact(g,{kind:'stock',symbol:'ABC',price:20});
  assert.equal(E.appraiseAll(g,p).value,2000);assert.equal(E.appraiseAll(g,q).value,1000);
  assert.equal(E.appraiseAll(g,p).collateral,1000);
  p.age+=6;q.age+=2;assert.equal(E.appraiseAll(g,p).value,2000,'报价不再另乘周期');
  const card={kind:'stock',symbol:'ABC',price:5,min:100,max:1000};
  assert.equal(A.dealCost(g,card,100),2000);const before=p.cash;assert(A.buyDeal(g,card,{qty:100}).ok);
  assert.equal(before-p.cash,2000);assert.equal(E.appraiseAll(g,p).value,4000);
  const opt=A.marketOptions(g,{kind:'stock',symbol:'ABC',price:20})[0];
  assert(A.marketSell(g,{...opt,qty:150}).ok);assert.equal(p.stats.marketProceeds,3000);
  assert.equal(E.appraiseAll(g,p).value,1000);
});
test('从未持有的股票报价也被保存；旧个人报价不会覆盖统一行情',()=>{
  const g=game(),p=g.players[0];A.marketImpact(g,{kind:'stock',symbol:'ABC',price:25});
  p.stockPrice={ABC:99};assert.equal(E.stockPrice(g,'ABC'),25);
  const saved=JSON.parse(JSON.stringify(g));E.migrateTime(saved);assert.equal(E.stockPrice(saved,'ABC'),25);
});
test('房产升跌按余额扣融资，负权益不产生抵押额度',()=>{
  const g=game(),p=g.players[0],r=property(g,p,.5);
  assert.equal(E.appraiseAll(g,p).value,500000);assert.equal(E.appraiseAll(g,p).collateral,150000);
  A.marketImpact(g,{kind:'realestate',prop:r.nm,price:1200000});
  assert.equal(E.appraiseAll(g,p).collateral,250000);
  A.marketImpact(g,{kind:'realestate',prop:r.nm,price:600000});
  assert.equal(E.appraiseAll(g,p).value,300000);assert.equal(E.appraiseAll(g,p).collateral,0);
  assert.equal(r.projectDebt,350000);assert.equal(r.cost,500000);assert.equal(r.dp,150000);
});
test('非零手续费下按本人份额还本，仅实际净款进入现金和统计',()=>{
  const g=game(),p=g.players[0],r=property(g,p,.5);g.assetMarket.feeRate=.01;
  const cash=p.cash;sell(g);
  assert.equal(p.cash-cash,244000);assert.equal(p.stats.marketProceeds,244000);
  const last=g.assetMarket.trades.at(-1);assert.equal(last.price,600000);assert.equal(last.debt,350000);assert.equal(last.fee,6000);
  assert.equal(E.appraiseAll(g,p).collateral,0);assert.equal(g.assetMarket.properties[r.propertyId].history.length,2);
});
test('卖出下一回合挂牌；买回同一实体、历史和年数保留、持仓编号更换',()=>{
  const g=game(),p=g.players[0],r=property(g);const old=sell(g);
  assert.equal(E.propertyListings(g).length,0);nextOpportunity(g);
  const quote=E.propertyListings(g)[0],cash=p.cash;assert.equal(quote.cost,1200000);
  assert.equal(quote.debt,840000);assert.equal(quote.dp,360000);
  const result=A.buyPropertyListing(g,quote.listingId,quote);assert(result.ok);
  assert.equal(cash-p.cash,360000);assert.equal(result.item.propertyId,r.propertyId);
  assert.notEqual(result.item.holdingId,r.holdingId);assert.equal(result.item.heldYears,4);
  assert.equal(result.item.cf,3870-Math.round(840000*c.YIELD.mortgageRate));
  assert.equal(E.propertyListings(g).length,0);assert.equal(g.assetMarket.properties[r.propertyId].history.length,3);
  assert(!A.marketSell(g,old).ok);assert(!A.buyPropertyListing(g,quote.listingId,quote).ok);
  assert.equal(p.assets.realEstate.length,1);
});
test('挂牌期间继续记录年数；行情继续更新挂牌而非回到最初买价',()=>{
  const g=game(),p=g.players[0];property(g);sell(g);nextOpportunity(g);p.age+=3;
  A.marketImpact(g,{kind:'realestate',prop:'回归商铺',price:1400000});
  const x=E.propertyListings(g)[0];assert.equal(x.cost,1400000);assert.equal(x.heldYears,7);
});
test('现金不足、精力不足、报价过期或不在机会中时，买回完全不扣款',()=>{
  const g=game(),p=g.players[0];property(g);sell(g);nextOpportunity(g);
  const quote=E.propertyListings(g)[0];p.cash=1;
  let snapshot=JSON.stringify(g);assert(!A.buyPropertyListing(g,quote.listingId,quote).ok);assert.equal(JSON.stringify(g),snapshot);
  p.cash=2000000;p.energy=0;snapshot=JSON.stringify(g);
  assert(!A.buyPropertyListing(g,quote.listingId,quote).ok);assert.equal(JSON.stringify(g),snapshot);
  p.energy=100;A.marketImpact(g,{kind:'realestate',prop:'回归商铺',price:1500000});snapshot=JSON.stringify(g);
  assert(!A.buyPropertyListing(g,quote.listingId,quote).ok);assert.equal(JSON.stringify(g),snapshot);
  E.clearPending(g);snapshot=JSON.stringify(g);assert(!A.buyPropertyListing(g,quote.listingId).ok);assert.equal(JSON.stringify(g),snapshot);
});
test('多方共有同一实体，各自出售和买回只处理各自份额',()=>{
  const g=game(2),[p,q]=g.players,r=property(g,p,.3);property(g,q,.7,r.propertyId);
  const opts=A.marketOptions(g,{kind:'realestate',prop:'回归商铺',price:1200000});
  for(const opt of opts) assert(A.marketSell(g,opt).ok);
  nextOpportunity(g);const listings=E.propertyListings(g);assert.equal(listings.length,2);
  assert.equal(listings.reduce((s,x)=>s+x.cost,0),1200000);assert.equal(listings[0].propertyId,listings[1].propertyId);
  assert(A.buyPropertyListing(g,listings[0].listingId,listings[0]).ok);
  assert.equal(E.propertyListings(g).length,1);assert.equal(p.assets.realEstate[0].share,.3);
});
test('新旧存档迁移不动现金和取得成本，重载不重复记录历史',()=>{
  const g=game(),p=g.players[0];property(g);delete g.assetMarket;const r=p.assets.realEstate[0];delete r.projectDebt;delete r.propertyId;delete r.holdingId;
  p.stockPrice={ABC:23};const cash=p.cash,cost=r.cost;E.migrateTime(g);
  assert.equal(p.cash,cash);assert.equal(r.cost,cost);assert.equal(r.projectDebt,700000);assert.equal(E.stockPrice(g,'ABC'),23);
  const snap=JSON.parse(JSON.stringify(g));E.migrateTime(snap);
  assert.equal(JSON.stringify(snap.assetMarket),JSON.stringify(g.assetMarket));
});
test('急售按估值折价再还本，并保留房产挂牌记录',()=>{
  const g=game(),p=g.players[0],r=property(g);
  A.marketImpact(g,{kind:'realestate',prop:r.nm,price:1200000});const info=E.sellableAssets(p,g)[0],cash=p.cash;
  assert.equal(info.value,1200000*E.SELL_RATE-700000);
  assert(A.liquidate(g,p,'realEstate',0,info.assetId).ok);assert.equal(p.cash-cash,info.value);
  assert(!A.liquidate(g,p,'realEstate',0,info.assetId).ok);nextOpportunity(g);assert.equal(E.propertyListings(g).length,1);
});
test('收藏品筛选和旧下标移动不会卖错；多单位卖出统计记全款',()=>{
  const g=game(),p=g.players[0];p.assets.collectibles=[{nm:'无关',qty:1,cost:100},{nm:'金币',qty:10,cost:1000},{nm:'金币',qty:5,cost:1000}];
  const opts=A.marketOptions(g,{kind:'collectible',prop:'金币',price:200});assert.equal(opts[0].ix,1);
  assert(A.marketSell(g,opts[0]).ok);assert(A.marketSell(g,opts[1]).ok);assert(!A.marketSell(g,opts[0]).ok);
  assert.equal(p.assets.collectibles[0].nm,'无关');assert.equal(p.stats.marketProceeds,3000);
});
test('协议转让融资随资产走，重新标记成本但不重复给买方加债',()=>{
  const g=game(2),[p,q]=g.players,r=property(g,p,.5),seller=p.cash,buyer=q.cash;
  const result=A.transferProperty(g,p,q,r.holdingId,250000);assert(result.ok);
  assert.equal(p.cash-seller,250000);assert.equal(buyer-q.cash,250000);
  assert.equal(result.item.cost,600000);assert.equal(result.item.projectDebt,350000);
  assert.equal(result.item.propertyId,r.propertyId);assert.notEqual(result.item.holdingId,r.holdingId);
  assert.equal(g.assetMarket.listings.length,0);assert.equal(E.appraiseAll(g,q).collateral,250000);
  assert(!A.transferProperty(g,p,q,r.holdingId,250000).ok);
});
test('不同投入额的同名企业按同一收购倍率估值，不串成最后一项总价',()=>{
  const g=game(),p=g.players[0];p.assets.business=[{nm:'咖啡店',cost:1000},{nm:'咖啡店',cost:2000}];
  A.marketImpact(g,{kind:'business',rate:1.5});assert.equal(E.appraiseAll(g,p).value,4500);
});
test('破产清算使用报价还本，负权益核销后现金不为负，房产仍保留',()=>{
  const g=game(),p=g.players[0],r=property(g);p.cash=0;
  A.marketImpact(g,{kind:'realestate',prop:r.nm,price:1200000});
  assert(A.declareBankruptcy(g,p).ok);assert.equal(p.cash,0);assert.equal(p.assets.realEstate.length,0);
  const record=g.assetMarket.trades.at(-1);assert.equal(record.type,'破产清算');
  assert.equal(record.price,600000);assert.equal(record.debt,700000);assert.equal(record.proceeds,-100000);
  assert.equal(g.assetMarket.listings.length,1);assert.equal(g.assetMarket.properties[r.propertyId].history.length,2);
});
test('参考净资产保留房产全额负权益，区别于最低为零的抵押权益',()=>{
  const g=game(),p=g.players[0];property(g);p.cash=50000;
  Object.keys(p.liabs).forEach(k=>p.liabs[k]=0);
  A.marketImpact(g,{kind:'realestate',prop:'回归商铺',price:600000});
  assert.equal(E.valuedNetWorth(g,p),-50000);assert.equal(E.collateralValue(g,p),0);
  assert.equal(E.netWorth(p),350000,'账面口径继续保留取得成本');
});
console.log(`\n${n} 组统一资产交易回归通过`);
