/* 按年龄聚合保留首个点；不改变账本，旧档不补造历史。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','save-state','ui-core','ui-summary'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine;let n=0;function test(label,fn){fn();n++;console.log('✅ '+label);}
function game(count=1){return E.newGame({rule:'101',mode:count===1?'solo':'age',count,seed:42});}
test('长局多轮同龄合并，保留开局和每龄最后观察，不丢早年',()=>{
 const g=game(),p=g.players[0],opening=JSON.stringify(p.track[0]);
 for(let age=20;age<=65;age++){p.age=age;for(let i=0;i<5;i++){g.round++;p.cash=age*100+i;E.trackRound(g);}}
 assert.equal(p.track.length,47);assert.equal(JSON.stringify(p.track[0]),opening);
 for(const row of p.track.slice(1))assert.equal(row.cash,row.age*100+4);
 assert.equal(p.track.at(-1).age,65);
});
test('各玩家年龄独立，出局或等待玩家不持续增加重复点',()=>{
 const g=game(2),[a,b]=g.players;b.out=true;
 for(let i=0;i<15;i++){a.age++;g.round++;E.trackRound(g);}
 assert.equal(a.track.length,16);assert.equal(b.track.length,2);assert.equal(b.track[0].age,b.track[1].age);
});
test('无限模式超过60点时保留首个点和最新59点',()=>{
 const g=game(),p=g.players[0];g.mode='endless';const first=JSON.stringify(p.track[0]);
 for(let i=21;i<=120;i++){p.age=i;g.round++;E.trackRound(g);}
 assert.equal(p.track.length,60);assert.equal(JSON.stringify(p.track[0]),first);assert.equal(p.track.at(-1).age,120);assert.equal(p.track[1].age,62);
});
test('自由圈现金流按当前持仓和自由圈支出记录，不混入工资',()=>{
 const g=game(),p=g.players[0];p.inFT=true;p.assets.business=[{nm:'企业',cost:1000,cf:2000}];E.trackRound(g);
 assert.equal(p.track.at(-1).cf,E.ftFinance(p).cashflow);assert.notEqual(p.track.at(-1).cf,E.finance(p).cashflow);
 p.assets.business=[];E.trackRound(g);assert.equal(p.track.at(-1).passive,0);assert.equal(p.track.at(-1).cf,-E.ftFinance(p).expense);
});
test('旧档聚合保留历史金额、已知首点和峰值，重复迁移不改现金',()=>{
 const g=game(),p=g.players[0];delete p.trackVersion;p.stats=null;p.track=[
  {round:30,age:35,cash:5,net:-30,passive:2,cf:17},
  {round:31,age:35,cash:999,net:-10,passive:9,cf:18},
  {round:32,age:35,cash:7,net:-20,passive:4,cf:19}];
 const cash=p.cash;E.migrateTime(g);assert.equal(p.track.length,2);assert.equal(p.track[0].age,35);assert.equal(p.track[1].cf,19);assert(p.trackLegacy);
 assert.equal(p.stats.peakCash,999);assert.equal(p.stats.peakNetWorth,-10);assert.equal(p.stats.peakPassive,9);assert.equal(p.cash,cash);
 const saved=JSON.stringify(g);E.migrateTime(g);assert.equal(JSON.stringify(g),saved);
 const restored=c.SaveState.prepare(c.SaveState.encode(g,{rolled:false},false));assert.equal(JSON.stringify(restored.g.players[0].track),JSON.stringify(p.track));
});
test('聚合不会丢失同年内的峰值统计，不影响财富等级依据',()=>{
 const g=game(),p=g.players[0];p.cash=1e6;E.trackRound(g);p.cash=100;E.trackRound(g);
 assert.equal(p.track.at(-1).cash,100);assert.equal(p.stats.peakCash,1e6);
});
test('报告图表首尾值和年龄对齐，导出保留聚合历史',()=>{
 const g=game(),p=g.players[0];p.track=[{round:1,age:20,cash:100,passive:100,cf:100,net:100},{round:20,age:30,cash:10,passive:10,cf:10,net:10},{round:80,age:65,cash:80,passive:80,cf:80,net:80}];
 const html=c.UiSummary.reportHTML(g,0);assert(html.includes('20 岁 · ¥100'));assert(!html.includes('20 岁 · ¥10</span>'));assert(html.includes('65 岁 · ¥80'));
 assert(html.includes('L66.7 ')); // 30岁相对20—65岁横轴为2/9，不按索引等距。
 const out=JSON.parse(c.UiSummary.exportJSON(g));assert.equal(out.players[0].wealthTrack.length,3);assert.equal(out.players[0].wealthTrack[0].age,20);
});
console.log(n+' 组财富轨迹回归通过');
