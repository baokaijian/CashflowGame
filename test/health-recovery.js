/* 审计发现的高维护休养循环：真实轮转可恢复行动，仍保留经营代价。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','save-state'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine;let n=0;function test(label,fn){fn();n++;console.log('✅ '+label);}
function game(count=1){const g=E.newGame({rule:'101',mode:count===1?'solo':'age',count,seed:42}),p=g.players[0];p.age=61;p.cash=1e8;p.energy=1;
 p.assets.business=Array.from({length:30},(_,i)=>({nm:'压力企业'+i,cost:1000,cf:100}));return g;}
test('高维护触发危机后两轮休养按时结束，不再续期',()=>{
 const g=game(),p=g.players[0];E.endTurn(g);assert(p.pausedThisTurn);assert.equal(p.skipTurns,1);const crises=p.stats.crises;
 E.endTurn(g);assert(p.pausedThisTurn);assert.equal(p.skipTurns,0);assert.equal(p.energy,0);
 E.endTurn(g);assert(!p.pausedThisTurn);assert.equal(p.stats.crises,crises);assert.equal(p.energy,0);
});
test('恢复后可以推进发薪和年龄，再次过劳仍有代价',()=>{
 const g=game(),p=g.players[0];E.endTurn(g);E.endTurn(g);E.endTurn(g);
 const before=p.age;p.pos=1;const landing=E.movePlayer(g,p,1);assert.equal(p.age,before+1);assert.equal(landing.settled.count,1);
 const crises=p.stats.crises;E.endTurn(g);assert.equal(p.stats.crises,crises+1);assert(p.pausedThisTurn);
});
test('休养中保存恢复保留剩余轮次，不重置危机计数',()=>{
 const g=game();E.endTurn(g);const p=g.players[0],crises=p.stats.crises;
 const restored=c.SaveState.prepare(c.SaveState.encode(g,{rolled:false},false)).g;
 E.endTurn(restored);E.endTurn(restored);assert(!restored.players[0].pausedThisTurn);assert.equal(restored.players[0].stats.crises,crises);
});
test('多人休养不吞掉他人行动，两个暂停回合后恢复',()=>{
 const g=game(2),p=g.players[0];E.endTurn(g);assert.equal(g.cur,1);E.endTurn(g);assert.equal(g.cur,0);assert(p.pausedThisTurn);
 for(let i=0;i<2;i++){E.endTurn(g);assert.equal(g.cur,1);E.endTurn(g);assert.equal(g.cur,0);}
 assert(!p.pausedThisTurn);assert.equal(p.stats.crises,1);
});
test('恢复与医疗倒计时仍生效，精力从不为负且不凭空增资',()=>{
 const g=game(),p=g.players[0];E.healthCrisis(g,p);p.pausedThisTurn=true;const cash=p.cash;
 for(let i=0;i<c.ENERGY.crisisTurns;i++)E.tickEnergy(g,p);
 assert.equal(p.energy,0);assert.equal(p.crisisTurns,0);assert.equal(p.medicalExp,0);assert.equal(p.cash,cash);assert.equal(p.stats.crises,1);
});
test('固定种子的原61岁循环案例能在观察上限内结束',()=>{
 const audit=require('../tools/audit-balance'),ctx=audit.load();
 const r=audit.run(ctx,{career:'民航机长',seed:20260958},'101','hold');assert(!r.capped);assert.equal(r.endAge,65);
});
console.log(n+' 组健康休养回归通过');
