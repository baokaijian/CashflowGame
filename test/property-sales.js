/* 行情卖房：本人份额、准确定位、重复提交、连续出售及旧存档。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act;
function game(count=1){
  const g=E.newGame({mode:count===1?'solo':'age',rule:'202',count,seed:42});
  g.players.forEach(p=>{Object.keys(p.assets).forEach(k=>p.assets[k]=[]);p.cash=2000000;p.energy=100;});
  return g;
}
const offer={kind:'realestate',prop:'长租公寓整栋',price:1935000};
const property=(share=1)=>({nm:'长租公寓整栋',cost:1290000*share,dp:387000*share,cf:1673*share,share,joint:share<1});
let passed=0;
function test(name,fn){fn();console.log('✅ '+name);passed++;}
test('真实机构合伙购买后，仅出售本人一半份额',()=>{
  const g=game(),p=g.players[0],card=c.DECK_CASHFLOW.find(x=>x.nm==='长租公寓整栋');
  assert(A.buyDealWithOrg(g,card).ok);
  const opt=A.marketOptions(g,offer)[0],cash=p.cash;
  assert.equal(opt.wholePrice,1935000);assert.equal(opt.price,967500);
  assert(opt.sub.includes('50.0%'));assert(opt.sub.includes('¥516,000'));
  const r=A.marketSell(g,opt);assert(r.ok);
  assert.equal(p.cash-cash,516000);assert.equal(r.proceeds,516000);
  assert.equal(p.stats.marketProceeds,516000);
  assert(g.log[0].text.includes('¥516,000'));
});
test('两名玩家按不同份额出售，合计不超过整套净回款',()=>{
  const g=game(2);g.players[0].assets.realEstate=[property(0.3)];g.players[1].assets.realEstate=[property(0.7)];
  const opts=A.marketOptions(g,offer);let paid=0;
  for(const o of opts){const p=g.players[o.pid],cash=p.cash;assert(A.marketSell(g,o).ok);paid+=p.cash-cash;}
  assert.equal(paid,1935000-(1290000-387000));
});
test('过滤后的第二项仍出售原数组中的正确房产',()=>{
  const g=game(),p=g.players[0],other={nm:'地铁口小商铺',cost:236500,dp:106425,cf:650};
  p.assets.realEstate=[other,property()];
  const opt=A.marketOptions(g,offer)[0],cash=p.cash;
  assert.equal(opt.ix,1);assert(A.marketSell(g,opt).ok);
  assert.equal(p.assets.realEstate.length,1);assert.equal(p.assets.realEstate[0],other);
  assert.equal(p.cash-cash,1032000);
});
test('同名多套连续出售、数组移动和重复提交均不串房',()=>{
  const g=game(),p=g.players[0];p.assets.realEstate=[property(0.5),property(),property(0.3)];
  const opts=A.marketOptions(g,offer);
  assert.equal(new Set(opts.map(o=>o.assetId)).size,3);
  assert(A.marketSell(g,opts[0]).ok);const cash=p.cash;
  assert(!A.marketSell(g,opts[0]).ok);assert.equal(p.cash,cash);
  assert(A.marketSell(g,opts[2]).ok);assert(A.marketSell(g,opts[1]).ok);
  assert.equal(p.assets.realEstate.length,0);
});
test('卖出再买入同名房产，旧交易不能出售新房产',()=>{
  const g=game(),p=g.players[0];p.assets.realEstate=[property()];
  const old=A.marketOptions(g,offer)[0];assert(A.marketSell(g,old).ok);
  p.assets.realEstate.push(property());const fresh=A.marketOptions(g,offer)[0];
  assert.notEqual(old.assetId,fresh.assetId);
  assert(!A.marketSell(g,old).ok);assert.equal(p.assets.realEstate.length,1);
});
test('旧档无编号时补编号，保存恢复后编号和份额报价保持一致',()=>{
  const g=game(),p=g.players[0];const re=property();delete re.share;
  p.assets.realEstate=[re,property(0.5)];
  const oldOptions=A.marketOptions(g,offer),saved=JSON.parse(JSON.stringify(g));
  E.migrateTime(saved);const newOptions=A.marketOptions(saved,offer);
  assert.equal(JSON.stringify(newOptions),JSON.stringify(oldOptions));
  assert.equal(newOptions[0].price,1935000);
  assert(A.marketSell(saved,oldOptions[1]).ok);
  assert.equal(saved.players[0].assets.realEstate.length,1);
});
test('灾害按房产编号定位，筛选与重复确认不会损毁其他房产',()=>{
  const g=game(),p=g.players[0],other={nm:'商铺',cost:100000,dp:50000};
  p.assets.realEstate=[other,property(),property()];
  const opts=A.marketOptions(g,{kind:'disaster',target:'长租公寓整栋'});
  assert(A.marketSell(g,opts[0]).ok);assert(!A.marketSell(g,opts[0]).ok);
  assert(A.marketSell(g,opts[1]).ok);assert.equal(p.assets.realEstate[0],other);
});
test('亏损卖房不足还本时不扣成负数，筹足补款后才出售',()=>{
  const g=game(),p=g.players[0];p.assets.realEstate=[property(0.5)];p.cash=100;
  const opt=A.marketOptions(g,{...offer,price:500000})[0];
  assert(!A.marketSell(g,opt).ok);assert.equal(p.cash,100);assert.equal(p.assets.realEstate.length,1);
  p.cash=201500;assert(A.marketSell(g,opt).ok);assert.equal(p.cash,0);
});
console.log(`\n${passed} 组房产出售回归通过`);
