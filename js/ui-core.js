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
function toast(msg, type){
  const host = $('#toastHost');
  const d = document.createElement('div');
  d.className = 'toast' + (type? ' toast--'+type : '');
  d.innerHTML = msg;
  host.appendChild(d);
  setTimeout(()=>{ d.style.transition='opacity .3s,transform .3s'; d.style.opacity='0'; d.style.transform='translateY(8px)';
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
function renderIncome(p){
  const f = E.finance(p);
  const L = window.EXP_LABEL, I = window.INC_LABEL;
  return `
  <div class="sec">
    <div class="sec__title">收入</div>
    <div class="rowlist">
      ${line(I.salary, f.inc.salary)}
      ${f.inc.interest  ? line(I.interest, f.inc.interest) : ''}
      ${f.inc.dividend  ? line(I.dividend, f.inc.dividend) : ''}
      ${f.inc.realEstate? line(I.realEstate, f.inc.realEstate) : ''}
      ${f.inc.business  ? line(I.business, f.inc.business) : ''}
      ${f.inc.ftBusiness? line(I.ftBusiness, f.inc.ftBusiness) : ''}
    </div>
    <div class="sec__total"><span>总收入</span><span class="money">${money(f.totalIncome)}</span></div>
  </div>
  <div class="sec">
    <div class="sec__title">支出</div>
    <div class="rowlist">
      ${line(L.taxes, f.exp.taxes)}
      ${line(L.home, f.exp.home)}
      ${line(L.school, f.exp.school)}
      ${line(L.car, f.exp.car)}
      ${line(L.credit, f.exp.credit)}
      ${line(L.retail, f.exp.retail)}
      ${line(L.other, f.exp.other)}
      ${f.exp.extra ? line(L.extra, f.exp.extra) : ''}
      ${line(`${L.children} × ${p.children}`, f.exp.children)}
      ${f.exp.bank ? line(L.bank, f.exp.bank) : ''}
    </div>
    <div class="sec__total"><span>总支出</span><span class="money">${money(f.totalExpenses)}</span></div>
  </div>
  <div class="sec">
    <div class="sec__total" style="background:var(--primary-container);color:var(--on-primary-container)">
      <span>月现金流（收入 − 支出）</span><span class="money">${money(f.cashflow)}</span>
    </div>
    <div class="sec__total" style="background:var(--secondary-container);color:var(--secondary)">
      <span>被动收入</span><span class="money">${money(f.passive)}</span>
    </div>
  </div>`;
}
function assetLine(nm, meta){
  return `<div class="asset"><span class="asset__t">${esc(nm)}</span><span class="asset__m">${meta}</span></div>`;
}
function renderAssets(p){
  const a = p.assets;
  const blocks = [];
  if(a.stocks.length) blocks.push(a.stocks.map(s=>assetLine(`${s.symbol} ${s.shares} 股`, `成本 ${money(s.cost)}/股 · 市值 ${money(s.shares*s.cost)}`)).join(''));
  if(a.realEstate.length) blocks.push(a.realEstate.map(r=>assetLine(r.nm, `首付 ${money(r.dp)} · 房租净收入 ${money(r.cf)}/月`)).join(''));
  if(a.business.length) blocks.push(a.business.map(b=>assetLine(b.nm, `投入 ${money(b.cost)} · +${money(b.cf)}/月`)).join(''));
  if(a.ftBusiness.length) blocks.push(a.ftBusiness.map(b=>assetLine(b.nm, `投入 ${money(b.cost)} · +${money(b.cf)}/月`)).join(''));
  if(a.savings.length) blocks.push(a.savings.map(s=>assetLine(s.nm, `本金 ${money(s.cost)} · +${money(s.interest)}/月`)).join(''));
  if(a.funds.length) blocks.push(a.funds.map(s=>assetLine(s.nm, `本金 ${money(s.cost)} · +${money(s.interest)}/月`)).join(''));
  if(a.lands.length) blocks.push(a.lands.map(l=>assetLine(l.nm, `取得成本 ${money(l.cost)}`)).join(''));
  if(a.collectibles.length) blocks.push(a.collectibles.map(c=>assetLine(`${c.nm} ×${c.qty||1}`, `成本 ${money(c.cost)}`)).join(''));
  if(p.options.length) blocks.push(p.options.map(o=>assetLine(o.label, `行权价 ${money(o.strike)} · 权利金 ${money(o.premium)}/股 · ${o.expiresAt - 0 > 0 ? '剩余 ≤3 回合' : ''}`)).join(''));
  if(p.shorts && p.shorts.length) blocks.push(p.shorts.map(s=>assetLine(`做空 ${s.symbol} ${s.shares} 股`, `建仓价 ${money(s.price)} · 出现报价强制平仓`)).join(''));
  if(!blocks.length) return '<p class="muted">暂无资产。</p>';
  return `<div class="rowlist">${blocks.join('')}</div>`;
}
function renderLiabs(p){
  const l = p.liabs;
  const rows = [
    l.home   && line('房贷', l.home),
    l.school && line('助学贷款', l.school),
    l.car    && line('车贷', l.car),
    l.credit && line('信用卡分期', l.credit),
    l.bank   && line('信用贷', l.bank),
    l.other  && line('其他负债', l.other)
  ].filter(Boolean).join('');
  return rows ? `<div class="rowlist">${rows}</div>` : '<p class="muted">无负债。</p>';
}

/* ------------------------------ 开局设置 ------------------------------ */
const Setup = { rule:'101', mode:'age', count:4, names:[], showAll:true, fast:true };
function initSetup(){
  /* 游戏模式：年龄模式（20→65 岁，共 45 轮） / 无限模式 */
  const segMode = $('#segMode');
  $$('.segmented__item', segMode).forEach(b=>{
    b.onclick = ()=>{
      $$('.segmented__item', segMode).forEach(x=>x.classList.remove('segmented__item--active'));
      b.classList.add('segmented__item--active');
      Setup.mode = b.dataset.v;
      $('#modeHint').textContent = (window.GAME_MODES[Setup.mode] || {}).desc || '';
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
        ? '跳出条件：被动收入 &gt; 总支出 × <b>2</b>；启用杠杆交易 / 大额现金流卡、融券做空、期权、联合购买，行情卡 42 张（抽满 25 张重洗）。'
        : '跳出条件：被动收入 &gt; 总支出。仅做多，投资机会格只抽投资卡，市场波动温和。';
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
  renderNames();
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
                   <input maxlength="8" placeholder="玩家${i+1}" value="${esc(old[i]||'')}">`;
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
  confirmBox, renderIncome, renderAssets, renderLiabs, assetLine, line, initSetup, renderNames, Setup,
  initChrome, closeDrawer, activeTab };
})();
