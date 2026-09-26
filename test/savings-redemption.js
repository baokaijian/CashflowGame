/* 到期理财必须按本人持仓本金兑付，旧选项不能串款或重复到账。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
  vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);
const E=c.Engine,A=c.Act;
function game(){
  const g=E.newGame({rule:'101',mode:'solo',count:1,seed:42}),p=g.players[0];
  Object.keys(p.assets).forEach(k=>p.assets[k]=[]);p.cash=100000;p.energy=100;
  for(const card of [c.DECK_SMALL.find(x=>x.id==='sm9'),c.DECK_BIG.find(x=>x.id==='bg12')])assert(A.buyDeal(g,card).ok);
  E.setPending(g,{type:'market',card:{id:'mk15',kind:'savings',rate:1.05}});return g;
}
function options(g){return A.marketOptions(g,g.pending.card);}
function rejectsUnchanged(g,opt){const before=JSON.stringify(g),r=A.marketSell(g,opt);assert.equal(r.ok,false);assert(r.msg);assert.equal(JSON.stringify(g),before);}
let n=0;function test(name,fn){fn();console.log('✅ '+name);n++;}
test('缺少编号的旧选项不能将两种产品都按第一种金额兑付',()=>{
  const g=game();rejectsUnchanged(g,{kind:'savings',pid:0,ix:0,label:'高收益债基金',price:11340});
});
test('两种真实产品按各自本金兑付，两种出售顺序均准确且只到账一次',()=>{
  for(const reverse of [false,true]){
    const g=game(),p=g.players[0],cash=p.cash,opts=options(g);if(reverse)opts.reverse();
    for(const opt of opts){const r=A.marketSell(g,opt);assert(r.ok);assert.equal(r.proceeds,opt.label==='高收益债基金'?11340:45150);rejectsUnchanged(g,opt);}
    assert.equal(p.cash-cash,56490);assert.equal(p.assets.savings.length,0);assert.equal(E.finance(p).inc.interest,0);
    assert.equal(p.stats.marketProceeds,56490);assert.equal(p.stats.marketSells,2);
    const trades=g.assetMarket.trades.filter(x=>x.type==='到期兑付');assert.equal(trades.length,2);
    assert.equal(trades.reduce((s,x)=>s+x.principal,0),53800);assert.equal(trades.reduce((s,x)=>s+x.gain,0),2690);
    assert(g.log.some(x=>x.text.includes('本金 ¥43,000')&&x.text.includes('¥45,150')));
  }
});
test('重新排序、连续兑付及混合理财/基金不会串持仓；列表编号保持稳定',()=>{
  const g=game(),p=g.players[0];p.assets.funds.push({nm:'独立基金',cost:20000,interest:50});
  const opts=options(g);p.assets.savings.reverse();assert(A.marketSell(g,opts[0]).ok);
  assert.equal(options(g).find(x=>x.assetId===opts[1].assetId).id,opts[1].id);
  assert(A.marketSell(g,opts[2]).ok);assert.equal(p.assets.funds.length,0);assert.equal(p.assets.savings[0].cost,43000);
});
test('金额串用、本金变动、比例变动、过期行情及无效输入均无副作用',()=>{
  const g=game(),opts=options(g),opt=opts[1];
  rejectsUnchanged(g,{...opt,price:opts[0].price});rejectsUnchanged(g,{...opt,principal:10800});
  rejectsUnchanged(g,{...opt,rate:2});rejectsUnchanged(g,{...opt,assetKind:'funds'});
  rejectsUnchanged(g,null);
  g.players[0].assets.savings[1].cost=42000;rejectsUnchanged(g,opt);g.players[0].assets.savings[1].cost=43000;
  g.turnNo++;rejectsUnchanged(g,opt);g.turnNo--;
  g.pending.card.rate=1.1;rejectsUnchanged(g,opt);g.pending.card.rate=1.05;
  E.clearPending(g);rejectsUnchanged(g,opt);
});
test('恢复旧行情丢弃旧下标选项，按历史实际本金计算，不用新卡成本覆盖',()=>{
  let g=game();g.players[0].assets.savings[1].cost=20000;
  g.pending.impact={options:[{kind:'savings',pid:0,ix:0,price:11340}],forced:[]};
  g=JSON.parse(JSON.stringify(g));E.migrateTime(g);
  let opts=options(g);assert.equal(opts[1].price,21000);assert(A.marketSell(g,opts[0]).ok);
  const cash=g.players[0].cash;g=JSON.parse(JSON.stringify(g));E.migrateTime(g);
  assert.equal(g.players[0].cash,cash);assert.equal(options(g).length,1);assert(A.marketSell(g,options(g)[0]).ok);
  assert.equal(g.players[0].cash,cash+21000);
});
test('无效本金、比例及重复编号明确拒绝；零比例不被替换为本金',()=>{
  const g=game(),p=g.players[0];options(g);
  p.assets.savings[1].holdingId=p.assets.savings[0].holdingId;rejectsUnchanged(g,options(g)[0]);
  p.assets.savings.pop();g.pending.card.rate=0;let opt=options(g)[0];assert.equal(opt.price,0);assert(A.marketSell(g,opt).ok);
  for(const bad of [NaN,Infinity,-1]){const h=game();h.pending.card.rate=bad;rejectsUnchanged(h,options(h)[0]);}
  const h=game();h.players[0].assets.savings[0].cost=-100;rejectsUnchanged(h,options(h)[0]);
});
console.log(`\n${n} 组到期兑付验证通过。`);
