const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','save-state'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);
const E=c.Engine,A=c.Act,S=c.SaveState;let n=0;
function test(name,fn){fn();n++;console.log('✅ '+name);}
function game(rule='101',seed=42){return E.newGame({rule,mode:'solo',count:1,seed});}
function trace(g){const out=[];for(let i=0;i<150;i++){out.push(E.rollDice(g,2).join(','),E.drawDeal(g,i%2?'small':'cashflow').id,E.drawMarket(g).id);const d=g.decks.doodad,card=E.drawCard(d);d.disc.push(card);out.push(card.id);}return out;}
test('101 / 202 存档恢复后的骰子、投资、额外支出与行情重洗逐项一致',()=>{
 for(const rule of ['101','202']){
  const g=game(rule);for(let i=0;i<17;i++){E.rollDice(g,2);E.drawMarket(g);}
  const restored=S.prepare(S.encode(g,{rolled:false},false)).g;
  assert.deepEqual(trace(restored),trace(g));assert.equal(restored.rngState.state,g.rngState.state);
 }
});
test('202 第25张行情与101耗尽牌堆都使用同一可保存随机源',()=>{
 for(const rule of ['101','202']){
  const g=game(rule),count=rule==='202'?24:g.decks.market.draw.length-1;
  for(let i=0;i<count;i++)E.drawMarket(g);
  const r=S.prepare(S.encode(g,{rolled:false},false)).g;
  for(let i=0;i<50;i++)assert.equal(E.drawMarket(r).id,E.drawMarket(g).id);
 }
});
test('恢复后的全部牌堆绑定同一状态，读取或保存不会推进随机数',()=>{
 const g=game(),before=g.rngState.state,text=S.encode(g,{rolled:false},false),r=S.prepare(text).g;
 assert.equal(g.rngState.state,before);assert.equal(r.rngState.state,before);
 Object.values(r.decks).forEach(d=>assert.equal(d.rnd,r.rng));
 assert.equal(S.prepare(S.encode(r,{rolled:false},false)).g.rngState.state,before);
});
test('未给种子的正常游戏也能连续恢复，种子0可重复开局',()=>{
 const g=game('202',null),r=S.prepare(S.encode(g,{rolled:false},false)).g;assert.deepEqual(trace(g),trace(r));
 assert.deepEqual(trace(game('101',0)),trace(game('101',0)));
});
test('旧档只建立今后的随机状态，保存后可复现，不宣称还原旧序列',()=>{
 const old=JSON.parse(S.encode(game(),{rolled:false},false));delete old.g.rngState;old.v=1;delete old.format;
 const restored=S.prepare(JSON.stringify(old)).g;assert(restored.rngMigrated);
 const copy=S.prepare(S.encode(restored,{rolled:false},false)).g;
 assert.deepEqual(trace(copy),trace(restored));assert.equal(copy.log.filter(x=>x.text.includes('旧存档没有随机历史')).length,1);
});
test('无效或未知随机状态拒绝恢复，不偷偷切换另一序列',()=>{
 for(const state of [{version:9,state:1},{version:1,state:-1},{version:1,state:1.5}]){
  const d=JSON.parse(S.encode(game(),{rolled:false},false));d.g.rngState=state;assert.throws(()=>S.prepare(JSON.stringify(d)),/随机状态/);
 }
});
test('期权编号不依赖时钟或额外随机数，恢复后购买不重号',()=>{
 const g=game('202'),p=g.players[0];p.cash=1000000;p.energy=100;const card=c.DECK_CAPGAIN.find(x=>x.kind==='straddle');
 const r=S.prepare(S.encode(g,{rolled:false},false)).g;
 assert(A.buyDeal(g,card).ok);assert(A.buyDeal(r,card).ok);
 assert.deepEqual(Array.from(p.options,x=>x.id),Array.from(r.players[0].options,x=>x.id));
 const count=p.options.length;assert(A.buyDeal(g,card).ok);assert.equal(new Set(p.options.map(x=>x.id)).size,count+2);
});
console.log(`\n${n} 组随机状态验证通过。`);
