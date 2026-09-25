/* 购买标的、持有资产与抵押明细必须逐项对应。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = vm.createContext({console}); ctx.window=ctx;
for(const name of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),ctx);
const E=ctx.Engine,A=ctx.Act;
const g=E.newGame({mode:'solo',rule:'101',count:1,seed:42}),p=g.players[0];
const shop=ctx.DECK_SMALL.find(c=>c.id==='sm7');
Object.keys(p.assets).forEach(k=>p.assets[k]=[]);
p.age=26; p.cash=34505;
p.assets.stocks.push({symbol:'TEST',shares:700,cost:22});
E.setPending(g,{type:'opportunity',deal:shop});
let cp=E.creditProfile(g,p);
assert.equal(cp.appraisal.book,15400);
assert.equal(cp.appraisal.value,15400);
assert.equal(cp.collateral,7700);
assert.equal(cp.appraisal.rows.length,1);
assert.equal(cp.appraisal.rows[0].item.symbol,'TEST');
assert.equal(cp.appraisal.rows[0].collateral,7700);
assert(!A.buyDeal(g,shop,{}).ok);
assert.equal(E.appraiseAll(g,p).rows.length,1,'待购或买入失败的商铺不计入抵押物');
const before=p.cash;
assert(!A.takeLoan(g,cp.available+1).ok);
assert.equal(p.cash,before,'不能借用尚未买入的商铺提高额度');

p.cash=200000;p.energy=100;
assert(A.buyDeal(g,shop,{}).ok);
assert.equal(p.cash,200000-106425);
cp=E.creditProfile(g,p);
const row=cp.appraisal.rows.find(r=>r.kind==='realEstate');
assert.equal(row.item.nm,'地铁口小商铺');
assert.equal(row.book,236500);
assert.equal(row.item.dp,106425);
assert.equal(row.collateralShare,0.45);
assert.equal(row.value,236500,'新买入房产以成交价作为当前参考');
assert.equal(row.debt,130075);
assert.equal(row.collateral,row.value-row.debt);
for(const field of ['book','value','collateral'])
  assert.equal(cp.appraisal[field],cp.appraisal.rows.reduce((sum,r)=>sum+r[field],0));
assert.equal(cp.collateral,cp.appraisal.collateral);
assert.equal(cp.byCollateral,Math.round(cp.collateral*ctx.CREDIT.collateralRate));
const saved=JSON.parse(JSON.stringify(g));E.migrateTime(saved);
assert.equal(E.creditProfile(saved,saved.players[0]).collateral,cp.collateral);
assert(A.liquidate(g,p,'realEstate',0).ok);
assert.equal(E.appraiseAll(g,p).book,15400,'卖出后对应房产从抵押明细移除');

const g2=E.newGame({mode:'solo',rule:'202',count:1,seed:42}),p2=g2.players[0];
Object.keys(p2.assets).forEach(k=>p2.assets[k]=[]);
p2.cash=1000000;p2.energy=100;
const card=ctx.DECK_CASHFLOW.find(c=>c.kind==='realestate'&&c.joint);
assert(A.buyDealWithOrg(g2,card).ok);
const joint=E.appraiseAll(g2,p2).rows[0];
assert.equal(joint.book,Math.round(card.cost*0.5),'共有资产只计本人的购买份额');
assert.equal(joint.item.dp,Math.round(card.dp*0.5));
assert.equal(joint.collateral,Math.max(0,joint.value-joint.debt));
console.log('✅ 现有资产 / 待购商铺 / 买入失败 / 超额拒贷 / 购买入账 / 逐项抵押 / 合计 / 存档 / 卖出 / 共有份额全部通过');
