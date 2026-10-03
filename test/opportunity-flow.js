/* 单笔投资决定、方向缓存与独立行情的可保存状态。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','save-state'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);
const E=c.Engine,A=c.Act,S=c.SaveState;let n=0;
function test(name,fn){fn();n++;console.log('✅ '+name);}
function game(rule='202',count=1){const g=E.newGame({rule,mode:count===1?'solo':'age',count,seed:42});g.players.forEach(p=>{p.cash=2000000;p.energy=100;Object.keys(p.assets).forEach(k=>p.assets[k]=[]);});E.setPending(g,{type:rule==='202'?'opportunity202':'opportunity',choices:rule==='202'?['capgain','cashflow']:['small','big'],...(rule==='202'?{market:{kind:'business',rate:2.2}}:{})});A.opportunityState(g);return g;}
function restore(g){return S.prepare(S.encode(g,{rolled:true},false)).g;}
test('两版方向各抽一次，来回查看不重复研究、洗牌或消耗随机',()=>{
 for(const rule of ['101','202']){const g=game(rule),dirs=g.pending.choices;const first=A.chooseDeck(g,dirs[0]);assert(first.ok);const second=A.chooseDeck(g,dirs[1]);assert(second.ok);
  const energy=g.players[0].energy,rng=JSON.stringify(g.rngState),deck=JSON.stringify(g.decks);assert(A.chooseDeck(g,dirs[0]).revisited);assert.equal(g.pending.deal.id,first.card.id);
  assert.equal(g.players[0].energy,energy);assert.equal(JSON.stringify(g.rngState),rng);assert.equal(JSON.stringify(g.decks),deck);
  const saved=restore(g);assert(A.chooseDeck(saved,dirs[1]).revisited);assert.equal(saved.pending.deal.id,second.card.id);assert.equal(saved.players[0].energy,energy);
 }
});
test('买入只完成投资，保留行情；普通、机构与转让均不能再次执行',()=>{
 for(const method of ['plain','org','transfer']){
  const g=game('202',method==='transfer'?2:1),P=g.pending,card=c.DECK_CASHFLOW.find(x=>x.id=== (method==='org'?'cf3':'cf5'));
  P.deal=card;P.deckName='cashflow';P.flow.cards.cashflow=card;
  const r=method==='org'?A.buyDealWithOrg(g,card,'balanced'):method==='transfer'?A.sellOpportunity(g,card,1,1000):A.buyDeal(g,card);assert(r.ok);
  assert.equal(P.flow.decision,method==='transfer'?'transferred':'bought');assert.equal(P.flow.marketDone,false);assert.equal(g.pending,P);
  const before=JSON.stringify(g);assert(!A.buyDeal(g,card).ok);assert(!A.buyDealWithOrg(g,c.DECK_CASHFLOW.find(x=>x.id==='cf3')).ok);assert(!A.sellOpportunity(g,card,1,1000).ok);assert(!A.chooseDeck(g,'capgain').ok);assert.equal(JSON.stringify(g),before);
 }
});
test('行情子事项保存原投资与已买标记，恢复不重放现金或研究',()=>{
 let g=game(),P=g.pending;const card=c.DECK_CASHFLOW.find(x=>x.id==='cf5');P.deal=card;P.flow.cards.cashflow=card;
 assert(A.buyDeal(g,card).ok);const cash=g.players[0].cash;
 g.pending={type:'market',card:P.market,p:0,returnOpportunity:P,impact:A.marketImpact(g,P.market),quoteRecorded:true};
 g=restore(g);assert.equal(g.players[0].cash,cash);assert.equal(g.pending.returnOpportunity.flow.decision,'bought');assert.equal(g.pending.returnOpportunity.flow.marketDone,false);
 const snapshot=JSON.stringify(g);assert(!A.buyDeal(g,card).ok);assert(!A.chooseDeck(g,'cashflow').ok);assert.equal(JSON.stringify(g),snapshot);
});
test('先行情、放弃与未完成状态独立保存，非法缓存或进度拒绝恢复',()=>{
 const g=game();g.pending.flow.marketDone=true;const saved=restore(g);assert.equal(saved.pending.flow.decision,null);assert.equal(saved.pending.flow.marketDone,true);
 A.decideOpportunity(saved,'skipped');assert.equal(saved.pending.flow.decision,'skipped');assert.equal(restore(saved).pending.flow.marketDone,true);
 for(const mutate of [x=>x.pending.flow.marketDone=null,x=>x.pending.flow.decision='unknown',x=>x.pending.flow.cards.market={kind:'stock',price:1}]){const bad=JSON.parse(JSON.stringify(g));mutate(bad);assert.throws(()=>S.encode(bad,{rolled:true},false));}
});
test('旧机会只接续尚存事项，已有牌缓存且不猜测已丢失历史',()=>{
 const g=game();delete g.pending.flow;g.pending.deal=E.drawDeal(g,'cashflow');g.pending.deckName='cashflow';const before=g.players[0].energy;
 const flow=A.opportunityState(g);assert.equal(flow.decision,null);assert.equal(flow.marketDone,false);assert(A.chooseDeck(g,'cashflow').revisited);assert.equal(g.players[0].energy,before);
 g.pending={type:'market',card:{kind:'business',rate:2.2},p:0};assert.equal(A.opportunityState(g),null);assert.equal(restore(g).pending.returnOpportunity,undefined);
});
console.log(`\n${n} 组机会事项回归通过`);
