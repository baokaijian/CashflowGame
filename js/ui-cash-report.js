/* PDF 模板的损益表 / 资产负债表结构，金额直接读取游戏账本。 */
(function(){
'use strict';
const E=window.Engine,U=window.UI,esc=U.esc,money=E.money;
let selected=null;
const groups=[['financial','金融资产'],['fixed','固定资产'],['operating','经营权益'],['intangible','无形权益'],['other','其他资产']];
const groupOf=(kind,item)=>kind==='ftBusiness'&&item.franchise?'intangible':
  ['stocks','savings','funds'].includes(kind)?'financial':['realEstate','lands'].includes(kind)?'fixed':
  ['business','ftBusiness'].includes(kind)?'operating':'other';
function collect(g,p){
  const f=E.finance(p),plan=E.settlementPlan(p),month=plan.months[0],appraisal=E.appraiseAll(g,p);
  const income=[['salary',p.retired?'养老金':'工资'],['interest','存款 / 理财利息'],['dividend','基金分红'],
    ['realEstate','房产净收入'],['business','企业经营净收入'],['ftBusiness','自由圈企业及特许经营净收入']]
    .map(([key,label])=>({key,label,monthly:key==='salary'&&p.inFT?0:f.inc[key],
      note:key==='salary'?(p.inFT?'自由圈不计工资或养老金':p.retired?'按缴费年数计算；旧档估计见下方说明':'当前年龄、就业与精力下的工资；税费列入支出'):
        key==='realEstate'?'本人持有份额，已扣项目融资利息及适用管理费':'按当前持仓计算；交易价差不计入经常收入'}))
    .map(x=>({...x,annual:E.annual(x.monthly)}));
  const labels={taxes:'工资税费',housingGap:'住房生活费',carGap:'用车生活费',consumptionGap:'日常消费补足',
    retail:'日常消费',other:'其他生活费',elder:'赡养费用',medical:'医疗费用',extra:'额外固定支出',children:'子女养育费'};
  const mult=p.inFT?window.LIFEBASE.freeTrackMult:1,budgets=E.livingBudget(p,mult);
  const expenses=Object.entries(labels).map(([key,label])=>{
    let value=f.exp[key];
    if(p.inFT){const gap=['housingGap','carGap','consumptionGap'].indexOf(key);
      value=key==='taxes'?0:gap>=0?budgets[gap].gap:Math.round(value*mult);}
    return {key,label,monthly:value,annual:E.annual(value),note:key==='children'?'按每名子女当前阶段计算':
      key==='medical'?'退休基础医疗与康复费用':p.inFT?'已按自由圈生活档次计算':'生活费用独立于偿债'};
  });
  const rounding=month.living-expenses.reduce((sum,x)=>sum+x.monthly,0);
  if(rounding) expenses.push({key:'rounding',label:'生活费用合计取整差额',monthly:rounding,annual:E.annual(rounding),note:'保持科目合计与实际账本一致'});
  E.LOAN_KEYS.forEach(key=>expenses.push({key:'loan:'+key,label:E.loanType(key).nm+'本息',
    monthly:plan.schedule.loans[key].payments[0],annual:plan.loanPayments[key],
    note:E.loanType(key).kind==='revolving'?'按本金付息，年度结算不自动还本':'逐月摊还；年中结清后停止扣供'}));
  const assets=appraisal.rows.map(r=>{
    const a=r.item,kind=r.kind;
    return {kind,group:groupOf(kind,a),name:E.assetName(a),book:r.book,value:r.value,
      note:kind==='stocks'?`${a.shares} 股 · 取得单价 ${money(a.cost)} · ${r.source}`:
        kind==='realEstate'?`持有 ${(E.holdingShare(a)*100).toFixed(1)}% · 本人首付 ${money(a.dp)} · 对应项目融资 ${money(E.projectDebt(a))}`:
        kind==='ftBusiness'&&a.franchise?'特许经营已支付投入；按游戏经营资产规则估值':
        ['business','ftBusiness'].includes(kind)?'经营权益，不等同于企业名下全部设备或房产':r.source};
  });
  const liabilities=E.LOAN_KEYS.map(key=>({name:E.loanType(key).nm,balance:p.liabs[key],
    monthly:plan.schedule.loans[key].payments[0],annual:plan.loanPayments[key],note:'个人贷款；本息列入上方支出'}));
  p.assets.realEstate.forEach(a=>{const balance=E.projectDebt(a);if(balance>0)liabilities.push({name:E.assetName(a)+' · 项目融资',
    balance,monthly:null,annual:null,note:'利息已扣在房产净收入中，不再扣个人月供；出售时归还本金'});});
  const debt=liabilities.reduce((sum,x)=>sum+x.balance,0),book=p.cash+appraisal.book,value=p.cash+appraisal.value;
  return {income,expenses,assets,liabilities,plan,month,passive:f.passive,book,value,debt,
    bookNet:book-debt,valueNet:value-debt,family:E.familySummary(p),energy:E.energyUpkeep(p),recover:E.energyRecover(g,p)};
}
function rows(items){
  return items.map(x=>`<tr><th scope="row">${esc(x.label)}<small>${esc(x.note)}</small></th><td>${money(x.monthly)}</td><td>${money(x.annual)}</td></tr>`).join('');
}
function flowTable(title,items,monthly,annual){
  return `<section class="cash-sheet__section"><h4>${title}</h4><div class="cash-sheet__table-wrap"><table class="cash-sheet__table">
    <thead><tr><th>项目</th><th>当前月度</th><th>未来一年</th></tr></thead><tbody>${rows(items)}</tbody>
    <tfoot><tr><th>${title==='收入'?'总收入':'总支出'}</th><td>${money(monthly)}</td><td>${money(annual)}</td></tr></tfoot></table></div></section>`;
}
function render(g,p){
  const d=collect(g,p),m=d.month;
  const groupsHTML=groups.map(([key,label])=>{
    const items=d.assets.filter(x=>x.group===key);
    return `<tr class="cash-sheet__group"><th colspan="3">${label}</th></tr>`+(items.length?items.map(x=>
      `<tr><th scope="row">${esc(x.name)}<small>${esc(x.note)}</small></th><td>${money(x.book)}</td><td>${money(x.value)}</td></tr>`).join(''):
      `<tr><td colspan="3" class="cash-sheet__empty">${key==='intangible'?'未持有独立登记的无形权益；品牌、商誉等未单独建模':'暂无此类持仓'}</td></tr>`);
  }).join('');
  const childText=d.family.children.length?d.family.children.map((c,i)=>`子女 ${i+1}：${c.ageUnknown?'更新后计龄 '+c.age+' 年':c.age+' 岁'}，${c.stage}，基础养育费 ${money(c.expense)}/月`).join('；'):'暂无子女';
  return `<article class="cash-sheet" data-cash-sheet>
    <header class="cash-sheet__identity"><div><p class="cash-sheet__eyebrow">CASHFLOW · 实时经济状况</p><h2>${esc(p.name)}的现金流报表</h2>
      <p>${esc(p.job.name)} · ${E.ageOf(g,p)} 岁 · 第 ${g.round} 轮 · ${p.out?'已出局':p.finished?'已完成人生':p.inFT?'财务自由圈':'老鼠赛跑'}</p></div>
      <span class="cash-sheet__stamp">${p.inFT?'分红账本':'个人账本'}</span></header>
    <div class="cash-sheet__kpis">
      <div><span>手头现金</span><strong data-report-cash>${money(p.cash)}</strong></div>
      <div><span>当前月净现金流</span><strong data-report-monthly class="${m.net<0?'neg':'pos'}">${money(m.net)}</strong></div>
      <div><span>下一结算日预计年净额</span><strong data-report-annual class="${d.plan.amount<0?'neg':'pos'}">${money(d.plan.amount)}</strong></div>
    </div>
    <h3 class="cash-sheet__heading">损益表 <small>当前月度与未来一年计划</small></h3>
    <div class="cash-sheet__columns">${flowTable('收入',d.income,m.income,d.plan.income)}${flowTable('支出',d.expenses,m.living+m.loans,d.plan.expense)}</div>
    <div class="cash-sheet__equation"><span>月净额 = 收入 − 生活及其他支出 − 实际月供</span><b>${money(m.income)} − ${money(m.living)} − ${money(m.loans)} = ${money(m.net)}</b></div>
    <p class="cash-sheet__note">非工资收入 ${money(d.passive)}/月。每经过一个${p.inFT?'分红日':'发薪日'}结算一年；未来一年按实际 12 个月贷款计划计算，年中结清时不等于当前月净额乘十二。${p.inFT?'工资和养老金不另行入账。':''}</p>
    <h3 class="cash-sheet__heading">资产负债表 <small>当前持仓与未偿还本金</small></h3>
    <div class="cash-sheet__columns">
      <section class="cash-sheet__section"><h4>资产</h4><div class="cash-sheet__table-wrap"><table class="cash-sheet__table"><thead><tr><th>资产 / 分类</th><th>账面成本</th><th>参考估值</th></tr></thead><tbody>
        <tr><th scope="row">现金<small>包括已到账借款与交易款项</small></th><td>${money(p.cash)}</td><td>${money(p.cash)}</td></tr>${groupsHTML}
        </tbody><tfoot><tr><th>总资产</th><td data-report-book>${money(d.book)}</td><td data-report-value>${money(d.value)}</td></tr></tfoot></table></div></section>
      <section class="cash-sheet__section"><h4>负债与净资产</h4><div class="cash-sheet__table-wrap"><table class="cash-sheet__table"><thead><tr><th>负债项目</th><th>剩余本金</th></tr></thead><tbody>
        ${d.liabilities.map(x=>`<tr><th scope="row">${esc(x.name)}<small>${esc(x.note)}${x.monthly===null?'':` · 当前月供 ${money(x.monthly)} · 未来年供 ${money(x.annual)}`}</small></th><td>${money(x.balance)}</td></tr>`).join('')}
        </tbody><tfoot><tr><th>总负债</th><td data-report-debt>${money(d.debt)}</td></tr><tr><th>账面净资产</th><td data-report-book-net>${money(d.bookNet)}</td></tr>
        <tr><th>参考估值净资产</th><td data-report-value-net>${money(d.valueNet)}</td></tr></tfoot></table></div>
        <p class="cash-sheet__note">净资产 = 总资产 − 个人贷款 − 房产项目融资。房产金额均为本人份额；估值不是可保证成交的报价。经营权益及无形权益是游戏展示分类。</p></section>
    </div>
    <section class="cash-sheet__context"><h4>当前收支说明</h4><p>${esc(childText)}</p>
      <p>维护 ${d.energy} 精力/回合 · 自然恢复 ${d.recover} · ${p.retired?'退休':'在职或求职阶段'} · 缴费 ${d.family.contributionYears} 年${d.family.estimatedContributionYears?`（含旧档兼容估计 ${d.family.estimatedContributionYears} 年）`:''}。${p.out?'出局后的数值可能是清算结果。':''}</p>
      ${g.pending&&g.pending.p===p.id&&g.pending.type==='deficit'?`<p class="neg">待处理年度缺口 ${money(g.pending.amount)}；尚未完成的补款不计为已扣现金。</p>`:''}
      <p>买卖、借款到账和提前还本为一次性现金往来；上方损益表展示经常收支，已到账款项反映在现金余额。</p>
      ${(p.options.length||p.shorts.length)?`<h4>交易风险头寸</h4><p>期权和做空不计入现有游戏净资产口径，另列观察；做空回补金额会随行情变化。</p>
        ${p.options.map(o=>`<p>${esc(o.label)} · ${o.shares} 股 · 已付权利金 ${money(o.premium*o.shares)} · 剩余 ${Math.max(0,o.expiresAt-g.turnNo)} 个回合</p>`).join('')}
        ${p.shorts.map(s=>`<p>做空 ${esc(s.symbol)} · ${s.shares} 股 · 建仓价 ${money(s.price)}/股</p>`).join('')}`:''}
    </section>
  </article>`;
}
function masked(g,p){return U.Setup.showAll===false&&p.id!==E.current(g).id&&!g.over;}
function refresh(){
  const g=window.UiGame.Game.g,host=U.$('[data-cash-report-content]');
  if(!g||!host)return;
  const p=g.players[selected]||E.current(g);
  host.innerHTML=masked(g,p)?'<p class="hint">已关闭对手财务明细。请切换到当前行动玩家查看报表。</p>':render(g,p);
}
function open(pid){
  const g=window.UiGame.Game.g;if(!g)return;
  selected=g.players[pid]?pid:E.current(g).id;
  const dismiss=()=>{
    U.closeModal();
    if(window.UiGame.Game.g===g&&g.pending&&window.UiPending)window.UiPending.showPending();
  };
  U.openModal(`<div class="modal__head"><h3>查看现金报表</h3></div><div class="modal__body cash-report-body">
    <div class="cash-sheet__toolbar"><label>查看玩家 <select data-cash-report-player>${g.players.map(p=>`<option value="${p.id}"${p.id===selected?' selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
      <span>按当前账本更新</span></div><div data-cash-report-content></div></div>
    <div class="modal__foot"><button class="btn btn--tonal" data-report-refresh>刷新报表</button><button class="btn btn--primary" data-report-close>关闭</button></div>`,{
      onDismiss:dismiss,onMount(modal){
        U.$('[data-cash-report-player]',modal).onchange=ev=>{selected=Number(ev.target.value);refresh();};
        U.$('[data-report-refresh]',modal).onclick=refresh;U.$('[data-report-close]',modal).onclick=dismiss;refresh();
      }
    });
}
window.UiCashReport={collect,render,open,refresh};
})();
