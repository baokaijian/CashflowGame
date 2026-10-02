/* 诊断须区分历史事实与当前状态，建议应与可执行动作一致。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','ui-core','ui-summary'])
 vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);
const E=c.Engine,U=c.UiSummary;let n=0;
function test(name,fn){fn();n++;console.log('✅ '+name);}
function game(){
 const g=E.newGame({rule:'101',mode:'solo',seed:42}),p=g.players[0];p.cash=100000;
 E.LOAN_KEYS.forEach(k=>p.liabs[k]=0);E.refreshLife(g,p);E.initTrack(p);
 return {g,p};
}
function report(g){return JSON.parse(U.exportJSON(g)).players[0];}
function advice(g,p){const m=U.collect(g,p);return U.adviceOf(g,p,m,U.scoreOf(g,p,m));}

test('精力归零真实触发危机，诊断说明机制并优先提供恢复建议',()=>{
 const {g,p}=game();p.energy=1;p.assets.business=[{nm:'高维护企业',cost:1000,cf:100,operating:{group:'test',label:'测试',upkeep:20,decay:0,floor:1}}];
 assert(E.tickEnergy(g,p));assert.equal(p.stats.crises,1);
 const a=advice(g,p),text=a[0].d;assert.match(text,/精力降至零时触发危机/);assert.match(text,/康复期间恢复减半/);
 assert.match(text,/应先降低持续维护负担/);assert.match(text,/休假只补充精力/);
 assert(!/运气|每 2—3 轮/.test(JSON.stringify(a)));
 assert(report(g).nextGamePlan[0].includes('先平衡精力'));
});
test('历史危机后组合已调整，不以当前持仓断言历史过载',()=>{
 const {g,p}=game();p.stats.crises=10;p.assets.business=[];
 const a=advice(g,p)[0];assert.equal(a.t,'精力曾被透支，需要调整经营与恢复节奏');
 assert.match(a.d,/当前每回合维护消耗 0 点/);assert.match(a.d,/不代表历史危机发生时/);
 assert(!/资产规模已经超出|只能恢复|运气/.test(a.d));
 const r=report(g);assert.match(r.grade.verdict,/10 次精力归零/);
 assert(!/整局节奏很干净|整体健康/.test(r.grade.verdict));
});
test('没有危机时也根据维护与恢复相等或不足分别提示',()=>{
 const {g,p}=game(),m=U.collect(g,p),sc=U.scoreOf(g,p,m),recover=E.energyRecover(g,p);
 const equal=U.adviceOf(g,p,{...m,upkeep:recover},sc)[0];assert.match(equal.t,/占满/);assert.match(equal.d,/额外投入/);
 const over=U.adviceOf(g,p,{...m,upkeep:recover+4},sc)[0];assert.match(over.t,/超过/);assert.match(over.d,/净减少 4 点/);
});
test('当前已结清不声称全程零负债，信用贷利息不冒充全部贷款利息',()=>{
 const {g,p}=game();p.stats.loans=2;p.stats.loanTotal=15000;p.stats.repaid=15000;
 const debt=report(g).dimensions.find(x=>x.key==='debt');assert.match(debt.comment,/当前个人贷款已结清/);
 assert(!U.exportMarkdown(g).includes('全程零负债'));
 p.liabs.home=50000;p.liabs.bank=5000;
 const comment=report(g).dimensions.find(x=>x.key==='debt').comment;assert.match(comment,/其中信用贷每月利息 ¥50/);
});
test('现金峰值不能掩盖当前安全垫不足',()=>{
 const {g,p}=game();p.stats.peakCash=1000000;p.cash=10;
 const r=report(g),a=r.advice.find(x=>x.title.includes('现金缓冲不足'));assert(a);assert.match(a.detail,/当前现金 ¥10/);
 assert(r.metrics.currentSafetyMonths<.1);assert(r.metrics.safetyMonths>3);
 assert.match(a.detail,/峰值.*不代表现在可动用/);
});
test('放弃和缺口不作无凭据归因，低评分不直接认定现金流为负',()=>{
 const {g,p}=game();p.stats.dealsSeen=8;p.stats.dealsPassed=8;p.stats.downsized=1;p.stats.deficitMonths=12;p.stats.deficitTotal=1000;
 const a=JSON.stringify(advice(g,p));assert.match(a,/放弃是合理选择/);assert.match(a,/不能据此断定全部缺口来自失业/);
 p.cash=100000;assert(E.settleCashflow(p)>0);assert(!report(g).grade.verdict.includes('现金流为负'));
 const text=U.exportMarkdown(g);assert(!/每轮至少|每 2 轮至少|主要发生在失业期间|只有一处|唯一的进阶/.test(text));
});
test('主动退出与破产不混用清算后余额推断历史',()=>{
 const {g,p}=game();p.out=true;p.outReason='主动认输';
 let r=report(g);assert.match(r.advice[0].title,/主动退出/);assert(!/破产的直接原因|可急售资产为零/.test(JSON.stringify(r.advice)));
 p.outReason='资金不足';r=report(g);assert.match(r.advice[0].title,/退出前记录/);assert.match(r.advice[0].detail,/不能据此认定/);
});
test('网页及两种导出共用诊断，精力和消费建议保留机制边界',()=>{
 const {g,p}=game();p.stats.crises=2;p.escaped=p.inFT=true;p.assets.business=[{nm:'测试企业',cost:100000,cf:20000}];
 const r=report(g),md=U.exportMarkdown(g),html=U.reportHTML(g,0);
 for(const a of r.advice){assert(md.includes(a.title));assert(html.includes(a.title));}
 assert(!/不需要打理.*流动性好|性价比最高|每轮至少|全程零负债|运气/.test(md));
 assert(r.nextGamePlan.some(x=>x.includes('承受能力不足')));
 assert(r.socialClass.levers.some(x=>x.detail.includes('不能靠卖掉某一类资产保证降低')));
});
console.log(`\n${n} 组复盘诊断回归通过`);
