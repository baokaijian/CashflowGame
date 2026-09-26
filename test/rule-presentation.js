/* 第一批 D3：展示与真实出圈规则一致，旧惩罚和完整流水承诺不再出现。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','ui-core','ui-summary'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,U=c.UI;let n=0;
function test(label,fn){fn();n++;console.log('✅ '+label);}
test('两套规则的财务面板都使用真实门槛，显式上下文优先于当前游戏',()=>{
 for(const rule of ['101','202']){
  const g=E.newGame({rule,mode:'age',count:2,seed:42});c.Game={g:{rule:rule==='101'?'202':'101'}};
  for(const p of g.players){
   const expected=E.money(E.annual(E.escapeTarget(g,p))),html=U.renderIncome(p,g);
   const row=html.match(/data-escape-target>([^<]+)/)[1];assert(row.includes(expected));assert(row.includes('严格超过'));
   c.Game={g};assert.equal(U.renderIncome(p),html);
  }
 }
});
test('恰好等于仍不可出圈，超过后才可；生活预算变化自动反映在门槛',()=>{
 for(const rule of ['101','202']){
  const g=E.newGame({rule,mode:'solo',count:1,seed:42}),p=g.players[0];
  Object.keys(p.assets).forEach(k=>p.assets[k]=[]);
  let target=E.escapeTarget(g,p);p.assets.business=[{nm:'门槛测试',cost:1000,cf:target}];
  assert.equal(E.escapeProgress(g,p).canEscape,false);p.assets.business[0].cf++;assert.equal(E.escapeProgress(g,p).canEscape,true);
  p.liabs.car=0;p.liabs.credit=0;target=E.escapeTarget(g,p);
  assert(U.renderIncome(p,g).includes(E.money(E.annual(target))));assert(E.finance(p).exp.carGap>=0);
 }
});
test('破产流程结束玩家行动，不再写入跳回合的惩罚日志',()=>{
 const g=E.newGame({rule:'202',mode:'age',count:2,seed:42}),p=g.players[0];
 Object.keys(p.assets).forEach(k=>p.assets[k]=[]);p.cash=0;p.salary=0;
 assert(E.checkBankruptcy(g,p));assert(p.out);
 assert(!g.log.some(x=>/202 破产惩罚|跳过 3 回合/.test(x.text)));
});
test('界面与导出说明不再使用旧门槛或完整流水承诺',()=>{
 for(const file of ['ui-core','ui-game','ui-summary']){
  const source=fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8');
  assert(!/门槛本身就是|门槛就是总支出|门槛 = 总支出（|退出游戏 \+ 跳回合|月供立刻从支出里消失|整局每一次决策|整局的每一次决策/.test(source),file);
 }
 const g=E.newGame({rule:'202',mode:'solo',count:1,seed:42});
 const text=c.UiSummary.exportMarkdown(g);assert(text.includes('不是完整交易流水'));assert(text.includes('60 个财富采样点'));
});
console.log(`\n${n} 组规则展示回归通过`);
