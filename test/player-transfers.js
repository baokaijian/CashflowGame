/* 第一批 D2：协议转让使用新成本与持仓身份，拒绝路径不改账。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act,copy=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(kind='stock'){
 const g=E.newGame({rule:'202',mode:'age',count:2,seed:42});
 for(const p of g.players){Object.keys(p.assets).forEach(k=>p.assets[k]=[]);p.cash=100000;p.energy=100;}
 const [seller,buyer]=g.players,key=kind==='stock'?'stocks':'business';
 const item=kind==='stock'?{symbol:'AUDIT',shares:100,cost:10,heldYears:4}:{nm:'审计企业',cost:1000,cf:100,heldYears:8,opProfile:'self'};
 seller.assets[key].push(item);E.stampAsset(g,item,key);E.holdingId(g,item);
 if(kind==='stock')E.recordQuote(g,'stocks',item,20,'测试行情');
 return {g,seller,buyer,item,key};
}
let n=0;function test(label,fn){fn();n++;console.log('✅ '+label);}
test('股票按实际总价重建单位成本，并记录卖方所得、双方现金和新持仓',()=>{
 const {g,seller,buyer,item}=fixture(),sellerNet=E.netWorth(seller),buyerNet=E.netWorth(buyer);g.round=9;
 const oldId=item.holdingId,result=A.transferAsset(g,seller,buyer,'stock',oldId,3000);assert(result.ok);
 assert.equal(seller.cash,103000);assert.equal(buyer.cash,97000);assert.equal(result.item.cost,30);
 assert.equal(result.item.buyRound,9);assert.equal(result.item.heldYears,4);assert.notEqual(result.item.holdingId,oldId);
 near(E.netWorth(seller)-sellerNet,2000);near(E.netWorth(buyer),buyerNet);
 assert.equal(result.record.gain,2000);assert.equal(result.record.sellerCost,1000);
 assert.equal(seller.stats.marketProceeds,3000);assert.equal(buyer.stats.investTotal,3000);
 assert.equal(E.stockPrice(g,'AUDIT'),20,'协议价不覆盖全市场股票报价');
});
test('不能整除股数的成交款不取整单位成本，已有同股持仓保持独立',()=>{
 const {g,seller,buyer,item}=fixture();item.shares=3;buyer.assets.stocks.push({symbol:'AUDIT',shares:10,cost:5});
 const result=A.transferAsset(g,seller,buyer,'stock',item.holdingId,1000);assert(result.ok);near(result.item.cost*3,1000);
 assert.equal(buyer.assets.stocks.length,2);assert.equal(buyer.assets.stocks[0].cost,5);
 const saved=copy(g);E.migrateTime(saved);near(saved.players[1].assets.stocks[1].cost*3,1000);
 const opt=A.marketOptions(saved,{kind:'stock',symbol:'AUDIT',price:500}).find(o=>o.assetId===result.item.holdingId);
 assert(A.marketSell(saved,{...opt,qty:1}).ok);near(saved.players[1].assets.stocks[1].cost*2,2000/3);
});
test('企业成本更新，经营年数与合同保留，行情收购与新成本一致',()=>{
 const {g,seller,buyer,item}=fixture('business');item.orgContract={id:'test',fee:.2,upkeep:.3};
 const op=copy(item.operating),decay=E.appraiseAsset(g,'business',item).decay;
 const result=A.transferAsset(g,seller,buyer,'business',item.holdingId,3000);assert(result.ok);
 assert.equal(result.item.cost,3000);assert.equal(result.item.cf,100);assert.equal(result.item.heldYears,8);
 assert.deepEqual(copy(result.item.operating),op);assert.deepEqual(copy(result.item.orgContract),copy(item.orgContract));
 assert.notEqual(result.item.orgContract,item.orgContract);
 assert.equal(E.appraiseAsset(g,'business',result.item).decay,decay,'转手不能恢复为零年折旧');
 buyer.pos=1;E.movePlayer(g,buyer,1);assert.equal(result.item.heldYears,9);
 const quote={kind:'business',rate:1.5};A.marketImpact(g,quote);
 const opt=A.marketOptions(g,quote).find(o=>o.pid===buyer.id);assert.equal(opt.price,4500);
 const before=buyer.cash;assert(A.marketSell(g,opt).ok);assert.equal(buyer.cash-before,4500);
});
test('零元转让是零取得成本；重复提交和再次转手后的旧编号不可用',()=>{
 const {g,seller,buyer,item}=fixture('business');const oldId=item.holdingId;
 const first=A.transferAsset(g,seller,buyer,'business',oldId,0);assert(first.ok);assert.equal(first.item.cost,0);
 let state=JSON.stringify(g);assert(!A.transferAsset(g,seller,buyer,'business',oldId,0).ok);assert.equal(JSON.stringify(g),state);
 const back=A.transferAsset(g,buyer,seller,'business',first.item.holdingId,700);assert(back.ok);
 assert.equal(back.item.cost,700);assert.notEqual(back.item.holdingId,oldId);
 state=JSON.stringify(g);assert(!A.transferAsset(g,seller,buyer,'business',oldId,500).ok);assert.equal(JSON.stringify(g),state);
});
test('旧行情选项和数组移动不会操作另一持仓',()=>{
 const {g,seller,buyer,item}=fixture();const stale=A.marketOptions(g,{kind:'stock',symbol:'AUDIT',price:20})[0];
 seller.assets.stocks.unshift({symbol:'OTHER',shares:1,cost:1});
 assert(A.transferAsset(g,seller,buyer,'stock',item.holdingId,3000).ok);
 assert.equal(seller.assets.stocks[0].symbol,'OTHER');const state=JSON.stringify(g);
 assert(!A.marketSell(g,stale).ok);assert.equal(JSON.stringify(g),state);
});
test('无效价款、资金不足、结束对局和退出玩家全部原子拒绝',()=>{
 for(const condition of ['negative','nan','infinity','fraction','unsafe','cash','seller-out','buyer-out','finished','same','over','kind','prototype','foreign','missing','shares']){
  const f=fixture(),{g,seller,buyer,item}=f;let price=3000,kind='stock',target=buyer,id=item.holdingId;
  if(condition==='negative')price=-1;if(condition==='nan')price=NaN;if(condition==='infinity')price=Infinity;
  if(condition==='fraction')price=.5;if(condition==='unsafe')price=Number.MAX_SAFE_INTEGER+1;
  if(condition==='cash')buyer.cash=10;if(condition==='seller-out')seller.out=true;if(condition==='buyer-out')buyer.out=true;
  if(condition==='finished')buyer.finished=true;if(condition==='same')target=seller;if(condition==='over')g.over=true;
  if(condition==='kind')kind='land';if(condition==='prototype')kind='__proto__';if(condition==='foreign')target=copy(buyer);
  if(condition==='missing')id='gone';if(condition==='shares')item.shares=0;
  const state=JSON.stringify(g);assert(!A.transferAsset(g,seller,target,kind,id,price).ok,condition);assert.equal(JSON.stringify(g),state,condition);
 }
});
test('新交易记录和旧持仓恢复均不改历史现金或猜测旧成本',()=>{
 const {g,seller,buyer,item}=fixture();assert(A.transferAsset(g,seller,buyer,'stock',item.holdingId,1234).ok);
 const saved=copy(g),before=JSON.stringify(saved);E.migrateTime(saved);assert.equal(JSON.stringify(saved),before);
 const old=fixture();const cash=old.seller.cash,cost=old.item.cost;E.migrateTime(old.g);assert.equal(old.item.cost,cost);assert.equal(old.seller.cash,cash);
});
console.log(`\n${n} 组玩家转让回归通过`);
