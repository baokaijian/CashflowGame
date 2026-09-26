/* ==========================================================================
   ui-core.js — 通用 UI：主题、弹层、Toast、抽屉、开局设置、财务报表渲染
   ========================================================================== */
(function(){
'use strict';
const E = window.Engine;
const money = E.money;
const $  = (s, r) => (r||document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r||document).querySelectorAll(s));
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct = n => Math.round(n*100) + '%';

/* ------------------------------ 主题 ------------------------------ */
function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem('cf_theme', t); }catch(e){}
}
function initTheme(){
  let t = 'dark';
  try{ t = localStorage.getItem('cf_theme') || 'dark'; }catch(e){}
  setTheme(t);
}
function toggleTheme(){
  setTheme(document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark');
}

/* ------------------------------ Toast ------------------------------ */
/* 发薪 / 分红的即时提示 —— 只在【经过结算格但未停留】时出现。
   为什么用 Toast 而不是弹层：经过是常态（内圈每轮约 0.44 次），
   每次都要求点一次「确定」会变成纯粹的点击负担；而停在结算格时已经有确认弹层。
   数据全部来自 Engine.paydayNoticeOf —— 界面不自己判断「该不该提示」，
   也不自己算金额（否则迟早出现「提示写 ¥674、到账 ¥8,088」这类账实不符）。 */
function paydayNotice(n){
  if(!n) return false;
  const nm = n.inFT ? '分红' : '发薪';

  const sub = [];
  sub.push(`结算 ${n.years} 年（${n.since}→${n.through} 岁）`
    + (n.years === 1 ? ` · 年结余 ${money(n.perYear)} × 1` : ` · 每个${nm}日各结 1 年`));
  if(n.deficit > 0) sub.push(`另有 ${money(n.deficit)} 入不敷出，需另行补上`);

  const tone = n.deficit > 0 ? 'err' : 'ok';
  const head = n.amount > 0
    ? `💰 已${nm} <b>${money(n.amount)}</b>`
    : `${nm}日结算：收支恰好打平`;
  toast(`${head}<span class="toast__sub">${sub.join(' · ')}</span>`, tone);
  return true;
}

function toast(msg, type){
  const host = $('#toastHost');
  /* 最多同时保留 3 条：提示堆叠过高会向下蔓延到「掷骰子 / 结束回合」所在的操作区，
     而那排按钮必须始终可点。column-reverse 下 firstChild 是最旧的一条。 */
  while(host.children.length >= 3) host.removeChild(host.firstChild);
  const d = document.createElement('div');
  d.className = 'toast' + (type? ' toast--'+type : '');
  d.innerHTML = msg;
  host.appendChild(d);
  /* 退场向上收回：与顶部锚定的入场方向保持一致，视觉上是「从顶栏下来又退回顶栏」 */
  setTimeout(()=>{ d.style.transition='opacity .3s,transform .3s'; d.style.opacity='0'; d.style.transform='translateY(-8px)';
    setTimeout(()=>d.remove(), 320); }, type==='err'?3600:2400);
}

/* ------------------------------ 弹层 ------------------------------ */
let modalOnClose = null;     /* 关闭回调 */
let modalOnDismiss = null;   /* 被「关闭」时的退回逻辑：子弹层（如贷款）用完要回到它顶掉的那张卡片 */
function openModal(html, opts){
  opts = opts || {};
  const host = $('#modalHost'), scrim = $('#scrim'), modal = $('#modal');
  modal.innerHTML = html;
  host.hidden = false; scrim.hidden = false;
  modalOnClose = opts.onClose || null;
  modalOnDismiss = opts.onDismiss || null;
  if(opts.onMount) opts.onMount(modal);
}
function closeModal(){
  $('#modalHost').hidden = true; $('#scrim').hidden = true;
  const cb = modalOnClose; modalOnClose = null; modalOnDismiss = null;
  if(cb) cb();
  /* 任何弹层关闭后都复核一次回合状态：
     若本轮卡片仍未结算，updateActions 里的自愈逻辑会把它重新拉回屏幕上。
     这解决了「子弹层（贷款 / 二次确认）关掉后父级卡片丢失 → 回合卡死」的整类问题。 */
  const G = window.Game;
  if(G && G.g && window.UiGame && window.UiGame.updateActions) window.UiGame.updateActions();
}
/* 请求关闭（ESC / 点遮罩）：
   1) 子弹层声明了退回逻辑 → 交给它自己处理（例：贷款弹层关掉后要回到投资卡）；
   2) 否则若本轮还有未结算的卡片 → 拦下并提示，必要时把卡片重新打开。
   背景：卡片弹层一旦被关掉而 pending 残留，掷骰与结束回合会同时不可用，回合永久卡死。 */
function requestClose(){
  if(modalOnDismiss){ const fn = modalOnDismiss; fn(); return; }
  const g = window.Game && window.Game.g;
  if(g && g.pending){
    if($('#modalHost').hidden && window.UiPending){
      window.UiPending.showPending();                 /* 已被误关 → 自动把卡片找回来 */
      toast('本轮卡片尚未结算，已为你重新打开', 'err');
    } else {
      toast('请先处理当前卡片，回合才能继续', 'err');
    }
    return;
  }
  closeModal();
}
/* 通用确认框 */
function confirmBox(title, body, okText, onOk, danger){
  openModal(`
    <div class="modal__head"><h3>${esc(title)}</h3></div>
    <div class="modal__body"><p class="muted">${body}</p></div>
    <div class="modal__foot">
      <button class="btn btn--text" data-cancel>取消</button>
      <button class="btn ${danger?'btn--danger':'btn--primary'}" data-ok>${esc(okText||'确定')}</button>
    </div>`, { onMount(m){
      $('[data-cancel]',m).onclick = closeModal;
      $('[data-ok]',m).onclick = ()=>{ closeModal(); onOk && onOk(); };
    }});
}

/* ------------------------------ 财务报表渲染 ------------------------------ */
function line(k, v, cls){
  return `<div class="kv"><span class="kv__k">${esc(k)}</span><span class="kv__v ${cls||''}">${money(v)}</span></div>`;
}
/* 收支表：★ 一律按【年度】呈现 —— 一次发薪日结算的就是这一年的收支。
   金额由 E.annual() 统一换算（唯一真源是 window.TIME.monthsPerPayday），
   界面绝不自己写 ×12，否则改口径时必然漏掉几处。 */
/* 财务自由圈用的是另一套账本（分红 − 自由圈生活支出 − 仍在还的贷款），
   所以收支表要整块换掉，而不是在老鼠赛跑的表上加两行 ——
   否则玩家会看到「工资收入」与「分红」并列，误以为自由圈还领工资。 */
function renderIncomeFT(p){
  const ft = E.ftFinance(p);
  const A = v => E.annual(v);
  const LB = window.LIFEBASE || {};
  const labels={interest:'理财利息',dividend:'基金分红',realEstate:'房产净收入（已扣项目利息与机构管理费）',
    business:'实业现金流',ftBusiness:'自由圈企业现金流'};
  const sources=Object.entries(ft.incomeSources).filter(([,value])=>value!==0);
  return `
  <div class="sec" data-ft-income>
    <div class="sec__title">财务自由圈 · 收入<span class="muted">年度 · 一次分红日结算一年</span></div>
    <div class="rowlist">
      ${sources.length?sources.map(([key,value])=>line(labels[key],A(value),value<0?'neg':'')).join(''):line('当前持仓分红',0)}
    </div>
    <div class="sec__total"><span>年总收入</span><span class="money">${money(A(ft.income))}</span></div>
    <p class="hint">按当前持仓计算，尚未扣除下方家庭生活费与贷款月供。售出、转让或兑付后停止对应收入，租金及经营变化会同步反映；出圈资金只奖励一次。</p>
    ${p.ftIncomeMigration?`<p class="hint" data-ft-income-migration>旧存档已更新分红规则：更新时月收入由 ${money(p.ftIncomeMigration.previousIncome)} 调整为 ${money(p.ftIncomeMigration.income)}。历史现金与出圈奖励保留，不重算已发生的年度结算；此后收入随持仓变化。</p>`:''}
  </div>
  <div class="sec">
    <div class="sec__title">支出<span class="muted">年度</span></div>
    <div class="rowlist">
      ${line(`生活支出（自由圈档次 ×${(LB.freeTrackMult||1).toFixed(2)}）`, A(ft.living))}
      ${ft.loans ? line('贷款年供', A(ft.loans)) : ''}
    </div>
    <div class="sec__total"><span>年总支出</span><span class="money">${money(A(ft.expense))}</span></div>
  </div>
  <div class="sec">
    <div class="sec__total" style="background:${ft.cashflow >= 0 ? 'var(--primary-container);color:var(--on-primary-container)' : 'var(--error-container, #ffdad6);color:var(--red)'}">
      <span>${ft.cashflow >= 0 ? '年结余（分红日入账）' : '年缺口（入不敷出）'}</span><span class="money">${money(A(ft.cashflow))}</span>
    </div>
  </div>
  <p class="hint">出圈后主动收入退出生活：工资不再入账，与工资绑定的个税也一并停征。
    但住房、用车、消费预算与贷款月供照旧 —— <b>顺流层同样会因为开销超过分红而破产</b>。</p>`;
}
function renderIncome(p,g){ return renderIncomeBase(p,g)+renderLivingBudget(p)+renderFamily(p); }
function renderLivingBudget(p){
  const mult=p.inFT?window.LIFEBASE.freeTrackMult:1,rows=E.livingBudget(p,mult);
  return `<div class="sec" data-living-budget><div class="sec__title">还贷后仍在的生活预算</div>
    <p class="hint">月度金额${p.inFT?'，已含自由圈生活档次':''}。现有月供和日常消费先抵扣预算，只有不足部分计入支出；结清贷款仍能减少偿债负担。</p>
    <div class="rowlist">${rows.map(r=>`<div class="rowlist__row" data-budget="${r.key}"><span>${r.name}<br><small>预算 ${money(r.base)} · 已计月供及消费 ${money(r.covered)}</small></span><b>补足 ${money(r.gap)}/月</b></div>`).join('')}</div>
    <p class="hint">用车预算包含养护与更新准备；消费预算包含持续消费与用品更新。属于游戏预算，不是新增借款或历史欠款。</p></div>`;
}
function renderFamily(p){
  const f=E.familySummary(p),F=window.FAMILY;
  return `<div class="sec" data-family-budget>
    <div class="sec__title">家庭收支随人生变化</div>
    <p class="hint">以下为月度基础金额${p.inFT?'，支出计入自由圈生活费后再应用生活档次系数':''}。子女 ${F.childAdultAge} 岁起养育支出减半，${F.childIndependentAge} 岁起归零；成年后仍保留子女记录。</p>
    <div class="rowlist">
      ${f.children.map((c,i)=>`<div class="rowlist__row" data-child-budget><span>子女 ${i+1} · ${c.ageUnknown?`更新后计龄 ${c.age} 年`:`${c.age} 岁`}<br><span class="muted">${esc(c.stage)}${c.ageUnknown?' · 历史年龄未知，保留原支出后开始计龄':''}</span></span><b>${money(c.expense)}/月</b></div>`).join('')}
      ${!f.children.length?'<div class="rowlist__row"><span>子女养育</span><b>暂无子女</b></div>':''}
      <div class="rowlist__row"><span>已记录缴费年数${f.estimatedContributionYears?`<br><span class="muted">含旧档兼容估计 ${f.estimatedContributionYears} 年</span>`:''}</span><b data-contribution-years>${f.contributionYears} 年</b></div>
      <div class="rowlist__row"><span>${p.retired?'养老金':'按当前缴费记录估算的养老金'}<br><span class="muted">基础工资 × ${(f.pensionRatio*100).toFixed(1)}%；${p.inFT?'自由圈只发分红，养老金不另行入账':'仅单人退休后切换领取'}</span></span><b data-family-pension>${money(f.pension)}/月</b></div>
      <div class="rowlist__row"><span>退休基础医疗</span><b data-medical-base>${money(f.medicalBase)}/月</b></div>
      <div class="rowlist__row"><span>临时健康危机医疗${f.crisisMedical?` · 剩 ${p.crisisTurns} 回合`:''}</span><b>${money(f.crisisMedical)}/月</b></div>
    </div>
    <p class="hint">每结算一个在职、有工资的年份记 1 年缴费；失业、退休和出圈后不新增。${F.pensionFullYears} 年达到基础工资 ${Math.round(window.SOLO.pensionRatio*100)}% 的养老金上限。游戏只记录缴费年数，不新增一笔缴费扣款。退休医疗按基础工资 ${(F.medicalBaseRate*100).toFixed(1)}% 起，每长一岁增加 ${(F.medicalAnnualStep*100).toFixed(1)} 个百分点，上限 ${(F.medicalMaxRate*100).toFixed(1)}%。</p>
  </div>`;
}
function renderIncomeBase(p,g){
  if(p.inFT) return renderIncomeFT(p);
  g=g || (window.Game && window.Game.g);
  const f = E.finance(p);
  const A = v => E.annual(v);
  const L = window.EXP_LABEL, I = window.INC_LABEL;
  return `
  <div class="sec">
    <div class="sec__title">收入<span class="muted">年度 · 一次发薪日结算一年</span></div>
    <div class="rowlist">
      ${line(p.retired?'养老金':I.salary, A(f.inc.salary))}
      ${f.inc.interest  ? line(I.interest, A(f.inc.interest)) : ''}
      ${f.inc.dividend  ? line(I.dividend, A(f.inc.dividend)) : ''}
      ${f.inc.realEstate? line(I.realEstate, A(f.inc.realEstate)) : ''}
      ${f.inc.business  ? line(I.business, A(f.inc.business)) : ''}
      ${f.inc.ftBusiness? line(I.ftBusiness, A(f.inc.ftBusiness)) : ''}
    </div>
    <div class="sec__total"><span>年总收入</span><span class="money">${money(A(f.totalIncome))}</span></div>
  </div>
  <div class="sec">
    <div class="sec__title">支出<span class="muted">年度</span></div>
    <div class="rowlist">
      ${line(L.taxes, A(f.exp.taxes))}
      ${line(L.home, A(f.exp.home))}
      ${f.exp.housingGap ? line(L.housingGap, A(f.exp.housingGap)) : ''}
      ${line(L.school, A(f.exp.school))}
      ${line(L.car, A(f.exp.car))}
      ${f.exp.carGap ? line(L.carGap,A(f.exp.carGap)) : ''}
      ${line(L.credit, A(f.exp.credit))}
      ${f.exp.consumptionGap ? line(L.consumptionGap,A(f.exp.consumptionGap)) : ''}
      ${line(L.retail, A(f.exp.retail))}
      ${line(L.other, A(f.exp.other))}
      ${f.exp.otherLoan ? line(L.otherLoan, A(f.exp.otherLoan)) : ''}
      ${f.exp.extra ? line(L.extra, A(f.exp.extra)) : ''}
      ${line(`${L.children}（需支持 ${E.familySummary(p).dependentCount} / 共 ${p.children} 个）`, A(f.exp.children))}
      ${f.exp.elder   ? line(L.elder, A(f.exp.elder))     : ''}
      ${f.exp.medical ? line(L.medical, A(f.exp.medical), 'neg') : ''}
      ${f.exp.bank ? line(L.bank, A(f.exp.bank)) : ''}
    </div>
    <div class="sec__total"><span>年总支出</span><span class="money">${money(A(f.totalExpenses))}</span></div>
  </div>
  <div class="sec">
    <div class="sec__total" style="background:var(--primary-container);color:var(--on-primary-container)">
      <span>${f.cashflow >= 0 ? '年结余（发薪日入账）' : '年缺口（入不敷出）'}</span><span class="money">${money(A(f.cashflow))}</span>
    </div>
    <div class="sec__total" style="background:var(--secondary-container);color:var(--secondary)">
      <span>被动收入（年）</span><span class="money">${money(A(f.passive))} <span class="muted" data-escape-target>/ 门槛 ${money(A(E.escapeTarget(g,p)))}（须严格超过）</span></span>
    </div>
  </div>`;
}
function assetLine(nm, meta){
  return `<div class="asset"><span class="asset__t">${esc(nm)}</span><span class="asset__m">${meta}</span></div>`;
}
function operationMeta(kind,item){
  const op=E.operationProfile(kind,item),contract=item.orgContract;
  return `${esc(op.label)} · 基础管理 ${op.upkeep} 精力/回合`+
    (kind==='realEstate'?'':` · 年折旧 ${(op.decay*100).toFixed(1)}% · 残值基准 ${Math.round(op.floor*100)}%`)+
    (contract?` · ${esc(contract.name)} · 管理费 ${money(E.managementFee(item))}/月（正现金流 ${Math.round(contract.fee*100)}%）`:'');
}
function operatingPreview(p,kind,item){
  const assets=Object.assign({},p.assets,{[kind]:[...(p.assets[kind]||[]),item]});
  const before=E.energyUpkeep(p),after=E.energyUpkeep(Object.assign({},p,{assets}));
  return `<span data-operating-preview class="hint" style="display:block">${operationMeta(kind,item)}<br>买入后组合维护：${before} → <b>${after} 精力/回合</b>（已计同类管理节省与扩张负担）</span>`;
}
function renderAssets(p, g){
  g=g || (window.Game && window.Game.g);
  const a = p.assets;
  const blocks = [];
  if(a.stocks.length) blocks.push(a.stocks.map(s=>assetLine(`${s.symbol} ${s.shares} 股`, `取得总成本 ${money(s.shares*s.cost)}（单价约 ¥${Number(s.cost).toLocaleString('en-US',{maximumFractionDigits:6})}/股） · ${g?`参考市值 ${money(E.appraiseAsset(g,'stocks',s).value)}`:`账面 ${money(s.shares*s.cost)}`}`)).join(''));
  if(a.realEstate.length) blocks.push(a.realEstate.map(r=>assetLine(r.nm, `首付 ${money(r.dp)} · 本人购入总价 ${money(r.cost)} · 项目融资余额 ${money(E.projectDebt(r))}${g?` · 本人参考估值 ${money(E.propertyValue(g,r))}`:''} · 房租净收入 ${money(E.assetCashflow(r))}/月 · ${operationMeta('realEstate',r)} · 编号 ${r.propertyId||'待登记'}`)).join(''));
  if(a.business.length) blocks.push(a.business.map(b=>assetLine(b.nm, `投入 ${money(b.cost)} · +${money(b.cf)}/月 · ${operationMeta('business',b)}`)).join(''));
  if(a.ftBusiness.length) blocks.push(a.ftBusiness.map(b=>assetLine(b.nm, `投入 ${money(b.cost)} · +${money(b.cf)}/月 · ${operationMeta('ftBusiness',b)}`)).join(''));
  if(a.savings.length) blocks.push(a.savings.map(s=>assetLine(s.nm, `本金 ${money(s.cost)} · +${money(s.interest)}/月`)).join(''));
  if(a.funds.length) blocks.push(a.funds.map(s=>assetLine(s.nm, `本金 ${money(s.cost)} · +${money(s.interest)}/月`)).join(''));
  if(a.lands.length) blocks.push(a.lands.map(l=>assetLine(l.nm, `取得成本 ${money(l.cost)}`)).join(''));
  if(a.collectibles.length) blocks.push(a.collectibles.map(c=>assetLine(`${c.nm} ×${c.qty||1}`, `成本 ${money(c.cost)}`)).join(''));
  if(p.options.length) blocks.push(p.options.map(o=>assetLine(o.label, `行权价 ${money(o.strike)} · 权利金 ${money(o.premium)}/股 · ${o.expiresAt - 0 > 0 ? '剩余 ≤3 回合' : ''}`)).join(''));
  if(p.shorts && p.shorts.length) blocks.push(p.shorts.map(s=>assetLine(`做空 ${s.symbol} ${s.shares} 股`, `建仓价 ${money(s.price)} · 出现报价强制平仓`)).join(''));
  if(!blocks.length) return '<p class="muted">暂无资产。</p>';
  const ops=E.operatingSummary(p);
  return `<div data-operating-summary class="hint">组合管理：${ops.count} 项经营资产 · 同类节省 ${ops.saving.toFixed(1)} · 扩张协调 +${ops.overload.toFixed(1)} · 总维护 <b>${ops.total} 精力/回合</b>（含期权和做空）</div><div class="rowlist">${blocks.join('')}</div>`;
}
/* 负债表：除了余额，一并给出年供与剩余【年数】——
   ★ 期限一律以「年」呈现：游戏里每个结算日 = 一年，一次结算按「结算年」折算 12 个月，
     用「期（月）」展示会与年龄对不上（详见 window.TIME）。
     `剩余 0 年`不会出现：还清的那一刻余额即为 0，这一行直接从表里消失。 */
function renderLiabs(p){
  E.ensureLoans(p);
  const migration=p.portfolioFinancingMigration;
  const notice=migration && migration.status==='review'
    ? `<p class="hint neg" data-financing-review>旧组合融资待核对：${esc(migration.reason)}。已保留原账，可能仍有重复债务；没有自动减债或补发现金。</p>` : '';
  let rows = E.LOAN_KEYS.map(k=>{
    const i = E.loanInfo(p, k);
    if(i.balance <= 0) return '';
    const sub = i.revolving
      ? `月息 ${money(i.due)} · 随借随还`
      : `年供 ${money(i.dueYear)} · 剩余 ${i.remainingYears} 年`;
    return `<div class="rowlist__row"><span>${i.nm}<br><span class="muted">${sub}</span></span><b class="money">${money(i.balance)}</b></div>`;
  }).filter(Boolean).join('');
  rows += p.assets.realEstate.filter(r=>E.projectDebt(r)>0).map(r=>`<div class="rowlist__row"><span>${esc(r.nm)} · 项目融资<br><span class="muted">持有期付息，已扣在房租净收入中；出售时还本</span></span><b class="money">${money(E.projectDebt(r))}</b></div>`).join('');
  return notice+(rows ? `<div class="rowlist">${rows}</div>` : '<p class="muted">无负债。</p>');
}

/* ------------------------------ 精力与状态 ------------------------------ */
/* 精力条：把「余量」和「上限」同时画出来，并按余量分级变色。
   分级阈值与 engine 的 ENERGY.lowAt 对齐 —— 界面提示与规则判定必须是同一个口径。 */
function energyBar(p, g, opts){
  opts = opts || {};
  const max = (g && window.Engine.energyMax) ? E.energyMax(g, p) : 100;
  const cur = Math.max(0, Math.round(p.energy || 0));
  const pctV = max > 0 ? Math.max(0, Math.min(100, Math.round(cur / max * 100))) : 0;
  const lowAt = (window.ENERGY && window.ENERGY.lowAt) || 30;
  const cls = cur <= 0 ? 'ebar--crit' : (cur < lowAt ? 'ebar--low' : '');
  const color = cur <= 0 ? 'var(--red)' : (cur < lowAt ? 'var(--orange)' : 'var(--accent)');
  return `<div class="ebar ${cls}">
    ${opts.label === false ? '' : '<span class="ebar__lbl">精力</span>'}
    <span class="ebar__track"><span class="ebar__fill" style="width:${pctV}%;background:${color}"></span></span>
    <span class="ebar__v">${cur} / ${max}</span>
  </div>`;
}
/* 出圈进度条：沿用 .ebar 的骨架（同一套对齐、圆角与数字排版），
   但用「蓝→绿」渐变把它和精力条区分开 —— 一条是「你还剩多少体力」，
   一条是「你离自由还有多远」，语义完全不同，不能长得一样。

   数值一律取 Engine.escapeProgress 的 pctText，界面不自己算比例：
   进度条宽度、百分比文字、财务面板里的数字必须来自同一个口径。 */
function escapeBar(p, g){
  const pr = E.escapeProgress(g, p);
  const mod = pr.status === 'escaped' ? ' ebar--done'
            : pr.status === 'ready'   ? ' ebar--ready' : '';
  return `<div class="ebar ebar--esc${mod}">
    <span class="ebar__lbl">${pr.status === 'escaped' ? '已出圈' : '出圈'}</span>
    <span class="ebar__track"><span class="ebar__fill" style="width:${pr.pctText}%"></span></span>
    <span class="ebar__v">${pr.pctText}%</span>
  </div>`;
}
/* 人生阶段标签：收入曲线阶段 + 就业状态。
   这里是玩家判断「我是不是该抓紧了」的唯一依据 —— 收入会随年龄回落，必须能看见。 */
function lifeChips(p, g){
  const out = [];
  const family=E.familySummary(p);
  if(p.retired){
    out.push(`<span class="life-chip">养老金 ${money(p.salary)}/月 · 缴费 ${family.contributionYears} 年</span>`);
  } else if(p.joblessNeed > 0 && p.joblessProgress < p.joblessNeed){
    out.push(`<span class="life-chip life-chip--bad">📉 失业求职中 ${p.joblessProgress}/${p.joblessNeed}</span>`);
  } else {
    const mult = typeof p.salaryMult === 'number' ? p.salaryMult : 1;
    const cls = mult > 1 ? '' : (mult < 1 ? 'life-chip--warn' : '');
    out.push(`<span class="life-chip ${cls}">收入 ×${mult.toFixed(2)} · ${esc(p.salaryPhase || '')}</span>`);
  }
  if(p.lifeStage) out.push(`<span class="life-chip">${esc(p.lifeStage)}</span>`);
  if(p.elderCare > 0) out.push(`<span class="life-chip life-chip--warn">赡养 ${money(p.elderCare)}/月</span>`);
  if(family.medicalBase>0) out.push(`<span class="life-chip life-chip--warn">退休基础医疗 ${money(family.medicalBase)}/月</span>`);
  if(p.medicalExp > 0) out.push(`<span class="life-chip life-chip--bad">医疗 ${money(p.medicalExp)}/月 · 剩 ${p.crisisTurns} 回合</span>`);
  if(p.wings > 0) out.push(`<span class="life-chip">🪶 银翅膀 ×${p.wings}</span>`);
  return out.join('');
}

/* ------------------------------ 开局设置 ------------------------------ */
/* 单人模式要收掉「玩家人数」这一栏 —— 它是多人概念的残留，留着只会让人以为还能加人。
   切回多人模式时必须完整还原（含上次选的人数），所以在进入单人前先把人数存起来。 */
function applyModeUI(){
  const solo = Setup.mode === 'solo';
  if(solo){
    if(Setup.count > 1) Setup.savedCount = Setup.count;
    Setup.count = 1;
  } else if(Setup.savedCount){
    Setup.count = Setup.savedCount;
  }
  const fc = $('#fieldCount'), nl = $('#namesLabel'), hint = $('#modeHint');
  if(fc) fc.hidden = solo;
  if(nl) nl.textContent = solo ? '你的名字' : '玩家名称';
  if(hint) hint.textContent = (window.GAME_MODES[Setup.mode] || {}).desc || '';
  renderNames();
}
/* 开局页的「游戏规则」模块：把出圈条件与达成方式讲清楚。
   内容随规则版本实时切换 —— 101 与 202 的门槛倍数不同（×1.5 / ×2.5）。
   ★ 倍数取 window.YIELD 的安全边际，不在这里写死：
     写死就会出现「规则页说 ×1、财务面板算 ×1.5」这种同屏两套口径。
   达成方式的侧重点也不同，所以不能用一段写死的文案。 */
function renderSetupRules(){
  const host = $('#setupRulesBody');
  if(!host) return;
  const r202 = Setup.rule === '202';
  const mg = r202 ? window.YIELD.safetyMargin202 : window.YIELD.safetyMargin;
  const cond = `被动收入 ＞ 总支出 × <b>${mg}</b>`;
  host.innerHTML = `
    <div class="rules-goal">
      <span class="rules-goal__lbl">出圈条件 · ${Setup.rule} 规则</span>
      <span class="rules-goal__val">${cond}</span>
    </div>
    <p class="rules-sub">
      式子左边是<b>被动收入</b>，右边是<b>总支出 × ${mg}</b> —— 两边同时算数，
      任何一边变化都会立刻改变你的进度。${r202 ? '202 的门槛更高、更难，但出圈资金也更高。' : ''}
      ${mg > 1 ? `门槛不是「刚好覆盖支出」，而是留了 <b>${Math.round((mg - 1) * 100)}% 的安全边际</b>：
      支出会波动（医疗、通胀、家庭变故），零缓冲意味着任何一次意外都会击穿 ——
      真实规划里没有人会在「被动收入 = 支出」的那一刻辞职。` : ''}
    </p>

    <div class="rules-cols">
      <div class="rules-col">
        <h4>① 做高被动收入 <span class="rules-tag">分子</span></h4>
        <ul>
          <li><b>金融资产</b>存款利息 · 股票股利 · 基金分红</li>
          <li><b>房地产</b>租金与房产现金流</li>
          <li><b>企业</b>经营性现金流</li>
        </ul>
        <p class="rules-warn">⚠️ 副业等<b>主动收入不计入</b>被动收入 —— 工资再高也跳不出老鼠赛跑。</p>
      </div>
      <div class="rules-col">
        <h4>② 压低总支出 <span class="rules-tag">分母</span></h4>
        <ul>
          <li><b>提前还清贷款</b>减少偿债支出，住房、用车与消费仍保留生活预算</li>
          <li><b>偿还信用贷</b>高息负债越早还越好</li>
          <li><b>控制负债与消费</b>门槛随之下降</li>
        </ul>
        <p class="rules-note">门槛 = 总支出 × ${mg}。还款后的实际改善取决于剩余月供与生活预算，详见贷款管家预览。</p>
      </div>
    </div>

    <div class="rules-out">
      <h4>③ 达标之后</h4>
      <ul>
        <li>点「🎉 跳出老鼠赛跑 → 财务自由圈」出圈，获得 <b>出圈资金 = 月被动收入 × 100</b>（≈ 8.3 年被动收入）</li>
        <li>财务自由圈掷 <b>2 粒</b>骰子；企业只能<b>现金</b>购买，不可贷款</li>
        <li>在自己的<b>梦想格</b>付清费用即获胜</li>
      </ul>
    </div>
    ${Setup.mode === 'solo' ? `
    <div class="rules-out">
      <h4>🎯 单人模式 · 与自己的人生赛跑</h4>
      <ul>
        <li>只有你一位玩家，从 <b>20 岁走到 65 岁</b>，共 45 次年度结算 —— 完整经历六个人生阶段
          （起步期 → 成长期 → 巅峰期 → 平台期 → 冲刺期 → 退休期）</li>
        <li><b>${window.SOLO.retireAge} 岁起工资停发</b>，按缴费年数改领养老金；${window.FAMILY.pensionFullYears} 年达到基础工资
          ${Math.round(window.SOLO.pensionRatio * 100)}% 的上限，养老金免征个税；退休基础医疗随年龄增加</li>
        <li>没有其他玩家：遇到投资机会<b>只能「买入」或「放弃」</b>（没有转让给他人 / 机构这条路）；
          202 大额房产可选择<b>共担资本 / 资金后盾 / 运营管家</b>，比较出资、净收益与管理精力</li>
      </ul>
      <p class="rules-note"><b>不排名次</b>，按「什么时候做到的」评人生评级 ——
        <b>${window.SOLO.winAge} 岁前</b>出圈并实现梦想＝<b>人生赢家（S）</b>；
        圆梦但晚于门槛＝大器晚成（A）；只出圈未圆梦＝B；未出圈看积累程度＝C／D；中途出局＝F。</p>
    </div>` : ''}
    <p class="rules-foot">${Setup.mode === 'solo'
      ? '对局中财务面板会显示<b>当前人生阶段</b>与<b>消费档次</b>，以及距出圈还差多少。'
      : '对局中每位玩家的席位卡上都有<b>实时出圈进度百分比</b>，财务面板里还能看到「还差多少」。'}</p>
  `;
}

const Setup = { rule:'101', mode:'age', count:4, names:[], showAll:true, fast:true };
function initSetup(){
  /* 游戏模式：年龄模式（20→65 岁，共 45 次年度结算） / 无限模式 */
  const segMode = $('#segMode');
  $$('.segmented__item', segMode).forEach(b=>{
    b.onclick = ()=>{
      $$('.segmented__item', segMode).forEach(x=>x.classList.remove('segmented__item--active'));
      b.classList.add('segmented__item--active');
      Setup.mode = b.dataset.v;
      applyModeUI();
      renderSetupRules();          /* 单人模式追加的规则说明要跟着出现／消失 */
    };
  });
  const segRule = $('#segRule');
  $$('.segmented__item', segRule).forEach(b=>{
    b.onclick = ()=>{
      $$('.segmented__item', segRule).forEach(x=>x.classList.remove('segmented__item--active'));
      b.classList.add('segmented__item--active');
      Setup.rule = b.dataset.v;
      $('#ruleBadge').textContent = Setup.rule + ' 规则';
      $('#ruleBadge').className = 'badge ' + (Setup.rule==='202'?'badge--202':'badge--rule');
      $('#ruleHint').innerHTML = Setup.rule==='202'
        ? `跳出条件：被动收入 &gt; 总支出 × <b>${window.YIELD.safetyMargin202}</b>；启用杠杆交易 / 大额现金流卡、融券做空、期权、联合购买，行情卡 42 张（抽满 25 张重洗）。`
        : `跳出条件：被动收入 &gt; 总支出 × <b>${window.YIELD.safetyMargin}</b>；仅做多，投资机会格只抽投资卡，市场波动温和。`;
      renderSetupRules();       /* 规则模块的门槛倍数与文案随版本同步切换 */
    };
  });
  const segCount = $('#segCount');
  segCount.innerHTML = [2,3,4,5,6].map(n=>`<button class="segmented__item ${n===4?'segmented__item--active':''}" data-n="${n}">${n} 人</button>`).join('');
  $$('.segmented__item', segCount).forEach(b=>{
    b.onclick = ()=>{
      $$('.segmented__item', segCount).forEach(x=>x.classList.remove('segmented__item--active'));
      b.classList.add('segmented__item--active');
      Setup.count = +b.dataset.n;
      renderNames();
    };
  });
  applyModeUI();                /* 首次进入即同步一次人数 / 名称栏的显隐 */
  renderSetupRules();           /* 首次进入即按当前规则版本填充 */
  $('#optShowAll').onchange = e => Setup.showAll = e.target.checked;
  $('#optFast').onchange = e => Setup.fast = e.target.checked;
  $('#btnStart').onclick = ()=>{
    Setup.names = $$('#nameGrid input').map(i=>i.value.trim()||i.placeholder);
    Setup.showAll = $('#optShowAll').checked;
    Setup.fast = $('#optFast').checked;
    Setup.mode = ($('#segMode .segmented__item--active') || {}).dataset ? $('#segMode .segmented__item--active').dataset.v : Setup.mode;
    startGame({ rule:Setup.rule, mode:Setup.mode, count:Setup.count, names:Setup.names, showAll:Setup.showAll });
  };
}
function renderNames(){
  const grid = $('#nameGrid');
  const old = $$('input', grid).map(i=>i.value);
  grid.innerHTML = '';
  for(let i=0;i<Setup.count;i++){
    const c = PLAYER_COLORS[i];
    const d = document.createElement('div');
    d.className = 'name-grid__item';
    d.innerHTML = `<span class="name-grid__dot" style="background:${c.c}"></span>
                   <input maxlength="8" placeholder="${Setup.mode === 'solo' ? '我' : '玩家'+(i+1)}" value="${esc(old[i]||'')}">`;
    grid.appendChild(d);
  }
}

/* ------------------------------ 抽屉 & 全局按钮 ------------------------------ */
function initChrome(handlers){
  $('#btnTheme').onclick = toggleTheme;
  $('#btnReset').onclick = ()=> handlers.onMenu && handlers.onMenu('restart');
  $('#btnHelp').onclick = ()=> handlers.onMenu && handlers.onMenu('help');
  $('#btnMenu').onclick = ()=>{
    const d = $('#drawer');
    d.hidden = false; $('#scrim').hidden = false;
    $('#scrim').onclick = closeDrawer;
  };
  $('#btnDrawerClose').onclick = closeDrawer;
  $$('.drawer__item').forEach(b=>b.onclick = ()=>{ closeDrawer(); handlers.onMenu && handlers.onMenu(b.dataset.act); });
  $$('.tab').forEach(t=>t.onclick = ()=>{
    $$('.tab').forEach(x=>x.classList.remove('tab--active'));
    t.classList.add('tab--active');
    $$('.tabpane').forEach(p=>p.classList.toggle('tabpane--active', p.dataset.pane===t.dataset.tab));
  });
  $('#btnReport').onclick = ()=> handlers.onMenu && handlers.onMenu('finance');
  $('#scrim').onclick = closeDrawer;
}
function closeDrawer(){ $('#drawer').hidden = true; if($('#modalHost').hidden) $('#scrim').hidden = true; }
function activeTab(name){
  const t = $$('.tab').find(x=>x.dataset.tab===name); if(t) t.click();
}

window.UI = { $, $$, esc, money, pct, setTheme, initTheme, toggleTheme, toast, openModal, closeModal, requestClose,
  confirmBox, operationMeta, operatingPreview, renderIncome, renderAssets, renderLiabs, assetLine, line, initSetup, renderNames, applyModeUI, Setup,
  initChrome, closeDrawer, activeTab, energyBar, escapeBar, lifeChips, renderSetupRules, paydayNotice };
})();
