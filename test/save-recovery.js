const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const notices=[],memory=new Map();let failWrite=false,failRemove=false;
const c=vm.createContext({console,setTimeout,clearTimeout,localStorage:{
 getItem:k=>memory.get(k)||null,setItem(k,v){if(failWrite)throw Object.assign(new Error('满了'),{name:'QuotaExceededError'});memory.set(k,v);},
 removeItem(k){if(failRemove)throw new Error('禁止删除');memory.delete(k);}
}});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','save-state'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);
c.UI={$:()=>null,$$:()=>[],esc:String,money:c.Engine.money,toast:(...a)=>notices.push(a)};
vm.runInContext(fs.readFileSync(`${__dirname}/../js/ui-game.js`,'utf8'),c);
const E=c.Engine,S=c.SaveState,U=c.UiGame;let n=0;
function test(name,fn){fn();n++;console.log('✅ '+name);}
function game(){return E.newGame({rule:'101',mode:'solo',count:1,seed:42});}
function data(){return JSON.parse(S.encode(game(),{rolled:false},false));}
test('完整存档含持仓、牌堆、待处理事件与骰子状态，恢复不重放结算',()=>{
 const g=game(),p=g.players[0];E.setPending(g,{type:'deficit',amount:500});
 const before=p.cash,r=S.prepare(S.encode(g,{rolled:true},false));assert.equal(r.g.players[0].cash,before);
 assert.equal(r.g.pending.amount,500);assert.equal(r.rolled,true);assert.equal(r.g.decks.small.draw.length,g.decks.small.draw.length);
 E.clearPending(g);const dice=E.rollDice(g,2),d=S.prepare(S.encode(g,{rolled:false,pendingDice:dice},false));assert.deepEqual(Array.from(d.pendingDice),Array.from(dice));
});
test('空间不足不覆盖上次有效记录，显示失败；重试成功才更新成功时间',()=>{
 U.Game.g=game();assert(U.saveState().ok);const previous=memory.get(S.KEY),at=U.saveStatus.lastSuccess;
 U.Game.g.players[0].cash+=1234;failWrite=true;assert(!U.saveState().ok);assert(!U.saveState().ok);
 assert.equal(memory.get(S.KEY),previous);assert.equal(U.saveStatus.state,'failed');assert.equal(U.saveStatus.lastSuccess,at);assert.equal(notices.length,1);
 assert.equal(S.prepare(U.backupText()).g.players[0].cash,U.Game.g.players[0].cash,'失败时仍可取得完整当前备份');
 failWrite=false;assert(U.saveState().ok);assert.equal(U.saveStatus.state,'saved');assert.notEqual(memory.get(S.KEY),previous);
});
test('无效JSON、报告、未知版本、缺少牌堆或错位玩家被拒绝',()=>{
 assert.throws(()=>S.prepare('{'));assert.throws(()=>S.prepare(JSON.stringify({players:[]})));
 for(const mutate of [d=>d.v=99,d=>delete d.g.decks,d=>d.g.players[0].id=3,d=>d.g.cur=9,d=>d.g.players[0].assets.stocks=[{symbol:'A',shares:-1,cost:20}],d=>d.g.pending={type:'unknown',p:0},d=>d.g.players[0].family.children=[null]]){
  const d=data();mutate(d);assert.throws(()=>S.prepare(JSON.stringify(d)));
 }
 assert.throws(()=>S.prepare('{"__proto__":{},"v":1}'),/不支持的字段/);
});
test('异常数值保存失败，最后好档不受影响；坏存档在临时副本上迁移',()=>{
 U.Game.g=game();assert(U.saveState().ok);const before=memory.get(S.KEY);U.Game.g.players[0].cash=NaN;
 assert(!U.saveState().ok);assert.equal(memory.get(S.KEY),before);
 const d=data();d.g.players[0].cash=null;const snapshot=JSON.stringify(d);assert.throws(()=>S.prepare(snapshot));assert.equal(JSON.stringify(d),snapshot);
});
test('旧版完整存档可迁移，复盘报告不能冒充完整备份',()=>{
 const d=data();d.v=1;delete d.format;delete d.g.rngState;delete d.g.players[0].ftIncomeVersion;
 const r=S.prepare(JSON.stringify(d));assert.equal(r.g.players[0].ftIncomeVersion,1);assert(r.g.rngMigrated);
 const report={v:1,at:Date.now(),players:d.g.players};assert.throws(()=>S.prepare(JSON.stringify(report)),/完整对局/);
});
test('完整下载保留当前内存日志；本机存档仍保留80条，不丢牌堆与随机进度',()=>{
 const g=game();for(let i=0;i<120;i++)E.log(g,'记录'+i,'info');
 const full=JSON.parse(S.encode(g,{rolled:false},false)),local=JSON.parse(S.encode(g,{rolled:false},true));
 assert.equal(full.g.log.length,g.log.length);assert.equal(local.g.log.length,80);assert.deepEqual(local.g.decks,full.g.decks);assert.deepEqual(local.g.rngState,full.g.rngState);
});
console.log(`\n${n} 组存档保护验证通过。`);
