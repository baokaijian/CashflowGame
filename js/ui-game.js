/* ==========================================================================
   ui-game.js — 主界面：棋盘、玩家、财务/日志/规则/设置面板、回合流程
   ========================================================================== */
(function(){
'use strict';
const E = window.Engine, A = window.Act, U = window.UI;
const $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;

const Game = { g:null, boardView:'ratrace', peeking:false, rolled:false, animating:false };
window.Game = Game;

/* ------------------------------ 棋盘视图 ------------------------------ */
/* 「圈」是【每个玩家自己的状态】（p.inFT / p.pos / p.ftPos），而一张屏幕一次只能显示一条跑道，
   所以「显示哪条跑道」是一个独立的视图状态。规则：
     · 默认永远跟随【当前行动玩家】所在的圈 —— 回合切换 / 掷骰 / 刷新恢复都会对齐，
       保证轮到谁，板上就是谁的圈和他的棋子位置（不会停在别人的圈上）。
     · 允许临时「查看另一条跑道」（👀），此时副标题会写明当前行动玩家在哪条跑道第几格；
       一旦该玩家掷骰或回合切换，视图自动归位 —— 避免出现「我掷了骰子但棋子在屏幕上不动」。
   这样两个玩家分处不同圈时，交替始终是「各自的圈 + 各自记录的位置」。 */
function curCircle(g){ return E.current(g).inFT ? 'fasttrack' : 'ratrace'; }
function bothCircles(g){
  return g.players.some(p=>!p.out && p.inFT) && g.players.some(p=>!p.out && !p.inFT);
}
function syncBoardView(g, force){
  if(!g) return;
  if(Game.peeking && !force) return;          /* 正在查看另一条跑道：暂不抢回，等玩家行动 */
  Game.boardView = curCircle(g);
}
/* 结束「查看」状态并把视图对齐到当前玩家所在的圈 */
function resetBoardView(g){
  Game.peeking = false;
  syncBoardView(g, true);
}

/* ------------------------------ 本地存档 ------------------------------ */
/* 方案：整局状态就是一份纯数据（players / decks / log / pending 全是普通对象），
   直接 JSON 序列化进 localStorage；牌堆与弃牌堆一并保存，刷新后卡序不丢。
   写入策略：状态变化时做 180ms 合并写入（避免掷骰动画期间高频落盘），
   并在页面隐藏 / 关闭时强制落盘一次。 */
const SAVE_KEY = 'cf_save_v1';
const CFG_KEY  = 'cf_cfg_v1';
const SAVE_VER = 1;

function store(fn, fallback){
  try{ return fn(); }catch(e){ return fallback; }   /* 隐私模式 / 配额超限 → 静默降级，不影响对局 */
}
function saveCfg(cfg){
  store(()=>localStorage.setItem(CFG_KEY, JSON.stringify({
    v:SAVE_VER, rule:cfg.rule, mode:cfg.mode, count:cfg.count, names:cfg.names,
    showAll:cfg.showAll, fast:cfg.fast
  })));
}
function loadCfg(){
  return store(()=>{
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    return (c && c.v === SAVE_VER) ? c : null;
  }, null);
}
function saveState(){
  if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  store(()=>{
    if(!Game.g){ localStorage.removeItem(SAVE_KEY); return; }
    /* rng 是函数，不能进 JSON；本作未使用随机种子，置空即可 */
    const g = JSON.parse(JSON.stringify(Game.g, (k, v)=> k === 'rng' ? undefined : v));
    g.log = (g.log || []).slice(0, 80);                       /* 日志瘦身，控制存档体积 */
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v:SAVE_VER, at:Date.now(), rolled:Game.rolled, boardView:Game.boardView, g
    }));
  });
}
let saveTimer = null;
function scheduleSave(){
  if(saveTimer) return;
  saveTimer = setTimeout(()=>{ saveTimer = null; saveState(); }, 180);
}
/* 刷新后恢复：优先恢复对局，其次恢复开局表单的上次选择 */
function tryRestore(){
  const data = store(()=>{
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return (d && d.v === SAVE_VER && d.g && d.g.players && d.g.players.length) ? d : null;
  }, null);

  const cfg = loadCfg();
  if(cfg){                                      /* 开局表单回填上次配置 */
    const mb2 = $$('#segMode .segmented__item').find(b=>b.dataset.v === cfg.mode);
    if(mb2) mb2.click();
    const rb = $$('#segRule .segmented__item').find(b=>b.dataset.v === cfg.rule);
    if(rb) rb.click();
    const cb = $$('#segCount .segmented__item').find(b=> +b.dataset.n === cfg.count);
    if(cb) cb.click();
    if(cfg.names) $$('#nameGrid input').forEach((inp, i)=>{ if(cfg.names[i]) inp.value = cfg.names[i]; });
    U.Setup.showAll = cfg.showAll !== false; U.Setup.fast = cfg.fast !== false;
    $('#optShowAll').checked = U.Setup.showAll;
    $('#optFast').checked = U.Setup.fast;
  }
  if(!data) return false;

  Game.g = data.g;
  Game.g.rng = null;
  Game.rolled = !!data.rolled;
  Game.animating = false;
  resetBoardView(Game.g);   /* 视图按【当前玩家】推导，而不是信任存档里的旧值 */
  Game.g.players.forEach(p=>{ p.pausedNotified = false; });   /* 弹层不存档，恢复后允许再提示一次 */
  lastCanEnd = false; healedPending = null;
  $('#setupScreen').hidden = true;
  renderAll();
  U.toast(Game.g.over ? '已恢复上次对局（本局已结束）' : '已恢复上次的对局进度', 'ok');
  if(!Game.g.over) pauseNotice(Game.g);
  return true;
}

/* ------------------------------ 开局 ------------------------------ */
function startGame(cfg){
  Game.g = E.newGame(cfg);
  Game.boardView = 'ratrace';
  Game.peeking = false;
  Game.rolled = false;
  lastCanEnd = false; healedPending = null;
  $('#setupScreen').hidden = true;
  E.beginTurn(Game.g);
  U.activeTab('finance');
  resetBoardView(Game.g);
  renderAll();
  saveCfg({ rule:cfg.rule, mode:cfg.mode, count:cfg.count, names:cfg.names,
            showAll:cfg.showAll, fast:U.Setup.fast !== false });
  saveState();
  nudge('#btnRoll');
  U.toast('游戏开始！轮到 <b>' + esc(E.current(Game.g).name) + '</b> 掷骰子', 'ok');
}
window.startGame = startGame;

/* ------------------------------ 重置 ------------------------------ */
/* 唯一回到开始页面的入口：清空存档 → 清空内存对局 → 回到开局设置 */
function resetGame(){
  const doReset = ()=>{
    store(()=>localStorage.removeItem(SAVE_KEY));
    if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    Game.g = null; Game.rolled = false; Game.animating = false; Game.boardView = 'ratrace'; Game.peeking = false;
    $('#setupScreen').hidden = false;
    $('#die1').textContent = '–'; $('#die2').hidden = true; $('#die3').hidden = true;
    renderAllReset();
  };
  U.confirmBox('重置游戏',
    '将清空当前对局与本地存档，并回到开始页面。<br><span class="muted">此操作不可撤销。</span>',
    '重置游戏', doReset, true);
}

/* ------------------------------ 总渲染 ------------------------------ */
function renderAll(){
  if(!Game.g) return;
  syncDrawerForMode(Game.g);
  renderBoard(); renderPlayers(); renderFinance(); renderLog(); renderRules(); renderSettings(); updateActions();
}
/* 抽屉里有两项是「多人专属」：玩家间交易、买断对手资产（202）。
   单人模式没有对手，留着它们只会让人点进去看到一张空表。
   注意这里是【隐藏】而不是删除 —— 切回多人模式时要能原样回来。 */
function syncDrawerForMode(g){
  const solo = E.isSolo(g);
  const t = document.querySelector('.drawer__item[data-act="trade"]');
  if(t) t.hidden = solo;
}
window.renderAll = renderAll;

/* ------------------------------ 棋盘 ------------------------------ */
function renderBoard(){
  const g = Game.g;
  const cur = E.current(g);
  const isFT = Game.boardView === 'fasttrack';
  const spaces = isFT ? FAST_TRACK : RAT_RACE;
  const board = $('#board');
  board.innerHTML = '';
  spaces.forEach((sp, i)=>{
    const pos = RING_POS[i];
    const d = document.createElement('div');
    d.className = 'space type-' + sp.t;
    d.style.gridRow = pos.r; d.style.gridColumn = pos.c;
    let ico = sp.ico, nm = sp.nm, sub = sp.sub || '';
    if(sp.t === 'dream'){
      const dr = DREAMS[sp.dream];
      ico = dr.ico; nm = dr.nm; sub = money(dr.cost);
      if(g.players.some(p=>p.dreamIdx===sp.dream)) d.classList.add('type-dreamdone');
    }
    const owners = isFT ? g.players.filter(p=>!p.out && p.assets.ftBusiness.some(b=>b.bizId===bizOfSpace(sp, i))) : [];
    d.innerHTML = `<span class="space__ico">${ico}</span>
      <span class="space__nm">${esc(nm)}</span>
      ${sub ? `<span class="space__sub">${esc(sub)}</span>` : ''}
      <span class="tokens"></span>`;
    const markers = [];
    if(isFT){
      /* 奶酪：玩家梦想所在格 */
      g.players.filter(p=>!p.out && p.dreamIdx===sp.dream && sp.t==='dream').forEach(p=>markers.push(p));
    }
    const tok = $('.tokens', d);
    g.players.filter(p=>!p.out).forEach(p=>{
      const onThisBoard = isFT ? p.inFT : !p.inFT;
      if(!onThisBoard) return;
      const here = isFT ? p.ftPos : p.pos;
      if(here !== i) return;
      const t = document.createElement('span');
      t.className = 'token'; t.style.background = p.color; t.textContent = p.icon;
      t.title = p.name;
      if(p.id === cur.id) t.classList.add('token--big');
      tok.appendChild(t);
    });
    if(isFT && sp.t==='business' && owners.length) ico = sp.ico;
    if(cur && ((isFT && cur.inFT && cur.ftPos===i) || (!isFT && !cur.inFT && cur.pos===i))) d.classList.add('space--here');
    board.appendChild(d);
  });
  $('#boardTitle').textContent = isFT ? '财务自由圈 · Fast Track' : '老鼠赛跑 · Rat Race';
  const sub = $('#boardSub');
  if(Game.peeking){
    /* 在看别人的圈时，必须能一眼看出当前行动的是谁、他在自己那边的哪一格 */
    const c = E.current(g);
    sub.textContent = `👀 正在查看另一条跑道 · 当前行动：${c.name}（${c.inFT ? '财务自由圈' : '老鼠赛跑'} · 第 ${(c.inFT ? c.ftPos : c.pos) + 1} 格）`;
    sub.classList.add('peek');
  } else {
    sub.textContent = isFT ? '掷 2 粒骰子前进 · 企业格只能用现金购买（不允许贷款）' : '掷 1 粒骰子前进，停下来执行格子的操作';
    sub.classList.remove('peek');
  }
  renderCenter();
}
function p_inFT(p){ return p.inFT; }
function bizOfSpace(sp, i){
  /* 按顺序把 6 个企业格映射到 7 种企业 */
  const idxs = FAST_TRACK.map((s,ix)=>s.t==='business'?ix:-1).filter(x=>x>=0);
  const k = idxs.indexOf(i);
  return k>=0 ? FT_BUSINESSES[k % FT_BUSINESSES.length].id : '';
}
function renderCenter(){
  const g = Game.g, cur = E.current(g);
  const esc_ = E.escapeProgress(g, cur);
  const isFT = Game.boardView==='fasttrack';
  const c = $('#boardCenter');
  c.innerHTML = `
    <div class="bc-title">${isFT ? '🏁 财务自由圈' : '🐭 老鼠赛跑'}</div>
    <div class="bc-cards">
      ${isFT ? '' : `
      <div class="pile pile--small"><span class="big">💡</span>${g.rule==='202'?'杠杆交易':'小额理财'}<small>剩 ${E.deckLeft(g.decks[g.rule==='202'?'capgain':'small'])}</small></div>
      <div class="pile pile--big"><span class="big">🏢</span>${g.rule==='202'?'大额现金流':'大额置业'}<small>剩 ${E.deckLeft(g.decks[g.rule==='202'?'cashflow':'big'])}</small></div>`}
      <div class="pile pile--market"><span class="big">📈</span>市场行情<small>剩 ${E.deckLeft(g.decks.market)}</small></div>
      <div class="pile pile--doodad"><span class="big">💳</span>额外支出<small>剩 ${E.deckLeft(g.decks.doodad)}</small></div>
    </div>
    <div class="bc-stats">
      <div class="bc-stat"><span class="bc-stat__k">${E.isAgeMode(g)?'年龄 / 轮次':'轮次'}</span><b>${E.isAgeMode(g)? E.ageOf(g)+' 岁' : '第 '+g.round+' 轮'}<i>${E.isAgeMode(g)? '第 '+g.round+' 轮 · 距退休 '+E.yearsLeft(g)+' 年' : '无限模式'}</i></b></div>
      ${E.isSolo(g) ? (()=>{ const st = E.soloStage(g), i = E.soloStageOf(g);
        return `<div class="bc-stat"><span class="bc-stat__k">人生阶段 ${i+1}/${window.SOLO_STAGES.length}</span>
          <b>${esc(st.nm)}<i>${esc(st.range)} · ${esc(st.tag)}</i></b></div>`; })() : ''}
      <div class="bc-stat"><span class="bc-stat__k">当前玩家</span><b style="color:${cur.color}">${esc(cur.name)}</b></div>
      <div class="bc-stat"><span class="bc-stat__k">手头现金</span><b>${money(cur.cash)}</b></div>
      <div class="bc-stat"><span class="bc-stat__k">年结余</span><b class="${E.settleCashflow(cur)<0?'neg':''}">${money(E.annual(E.settleCashflow(cur)))}</b></div>
      ${cur.inFT
        ? `<div class="bc-stat"><span class="bc-stat__k">分红收入（年·毛额）</span><b>${money(E.annual(E.ftMonthly(cur)))}</b></div>
           <div class="bc-stat"><span class="bc-stat__k">企业累计增加</span><b>${money(cur.ftGain||0)}<i> / ${money(E.empireTarget())}</i></b></div>`
        : `<div class="bc-stat"><span class="bc-stat__k">被动收入（年）</span><b>${money(E.annual(esc_.passive))}<i> / 门槛 ${money(E.annual(esc_.target))}</i></b></div>`}
    </div>
    ${(bothCircles(g) || Game.peeking) ? `<button class="btn btn--s ${Game.peeking ? 'btn--tonal' : 'btn--outline'}" id="btnSwapBoard">${
      Game.peeking ? '↩ 回到当前玩家的跑道' : (isFT ? '👀 查看老鼠赛跑' : '👀 查看财务自由圈')}</button>` : ''}`;
  const sw = $('#btnSwapBoard');
  if(sw) sw.onclick = ()=>{
    Game.peeking = !Game.peeking;
    Game.boardView = Game.peeking ? (cur.inFT ? 'ratrace' : 'fasttrack') : curCircle(g);
    renderAll();                 /* 按钮文案与中央统计一起刷新（原先只 renderBoard，标签不更新） */
  };
}

/* ------------------------------ 玩家列表 ------------------------------ */
function renderPlayers(){
  const g = Game.g, cur = E.current(g);
  const host = $('#playerList');
  host.innerHTML = '';
  g.players.forEach(p=>{
    const f = E.finance(p);
    const d = document.createElement('div');
    d.className = 'pcard' + (p.id===cur.id && !g.over ? ' pcard--active' : '') + (p.out?' pcard--out':'');
    d.style.borderLeftColor = p.color;
    d.innerHTML = `
      <div class="pcard__top">
        <span class="token" style="background:${p.color}">${p.icon}</span>
        <span class="pcard__name">${esc(p.name)}</span>
        <span class="pcard__tag ${p.inFT?'pcard__tag--ft':''} ${p.out?'pcard__tag--out':''}">
          ${p.out?'出局':(p.inFT?'财务自由圈':'老鼠赛跑')}</span>
      </div>
      <div class="pcard__job">${p.job.ico} ${esc(p.job.name)} · 孩子 ${p.children}${
        p.joblessNeed > 0 && p.joblessProgress < p.joblessNeed ? ' · <b class="warn">失业求职中</b>' : ''}</div>
      <div class="pcard__grid">
        <div>现金 <b>${money(p.cash)}</b></div>
        <div>年结余 <b class="${E.settleCashflow(p)<0?'neg':''}">${money(E.annual(E.settleCashflow(p)))}</b></div>
        <div>被动收入 <b>${money(E.annual(f.passive))}</b></div>
        <div>净资产 <b>${money(E.netWorth(p))}</b></div>
      </div>
      <div class="pcard__energy">${U.energyBar(p, g)}</div>
      <div class="pcard__esc">${U.escapeBar(p, g)}</div>`;
    d.onclick = ()=> showPlayerDetail(p.id);
    host.appendChild(d);
  });
}
function showPlayerDetail(pid){
  const g = Game.g, p = g.players[pid];
  const cur = E.current(g);
  const mask = (U.Setup.showAll === false) && p.id !== cur.id && !g.over;
  U.openModal(`
    <div class="modal__head">
      <span class="token token--big" style="background:${p.color}">${p.icon}</span>
      <div><h3>${esc(p.name)}</h3><p class="muted">${p.job.ico} ${esc(p.job.name)} · ${p.out?'已出局（'+esc(p.outReason)+'）':(p.inFT?'财务自由圈':'老鼠赛跑')}</p></div>
    </div>
    <div class="modal__body">
      <div class="sec__total"><span>现金</span><span class="money">${money(p.cash)}</span></div>
      ${mask ? `
        <div class="sec"><div class="sec__title">资产概览</div>
          <div class="rowlist">
            <div class="rowlist__row"><span>房产</span><b>${p.assets.realEstate.length} 处</b></div>
            <div class="rowlist__row"><span>企业</span><b>${p.assets.business.length + p.assets.ftBusiness.length} 家</b></div>
            <div class="rowlist__row"><span>股票</span><b>${p.assets.stocks.reduce((s,x)=>s+x.shares,0)} 股</b></div>
            <div class="rowlist__row"><span>年结余</span><b>${money(E.annual(E.settleCashflow(p)))}</b></div>
            <div class="rowlist__row"><span>被动收入（年）</span><b>${money(E.annual(E.finance(p).passive))}</b></div>
            <div class="rowlist__row"><span>净资产</span><b>${money(E.netWorth(p))}</b></div>
          </div>
          <p class="hint">已开启「不显示对手财务明细」，仅显示概览。可在开局设置中调整。</p>
        </div>`
      : `${U.renderIncome(p)}
        <div class="sec"><div class="sec__title">资产负债表 · 资产</div>${U.renderAssets(p)}</div>
        <div class="sec"><div class="sec__title">资产负债表 · 负债</div>${U.renderLiabs(p)}</div>`}
    </div>
    <div class="modal__foot"><button class="btn btn--primary" data-close>关闭</button></div>`,
    { onMount(m){ $('[data-close]',m).onclick = U.closeModal; } });
}

/* ------------------------------ 财务面板（当前玩家） ------------------------------ */
function renderFinance(){
  const g = Game.g, p = E.current(g);
  const f = E.finance(p), pr = E.escapeProgress(g,p);
  const host = $('#paneFinance');
  const passivePct = f.totalIncome>0 ? Math.round(f.passive/f.totalIncome*100):0;

  /* 社会等级：对局中随时对照「我现在在哪一层」，不必打开复盘。
     ★ 复用 UiSummary 的同一份评估 —— 口径只能有一处，这里只负责画出来，
       否则迟早出现「面板说 L4、复盘说 L5」这种自相矛盾。 */
  const SC_TONE = { bad:'var(--red)', warn:'var(--orange)', good:'var(--green)' };
  const clsBlock = (function(){
    const S = window.UiSummary;
    if(!S || !S.classBrief) return '';
    const cls = S.classBrief(g, p);
    const tone = SC_TONE[cls.level.tone] || 'var(--accent)';
    const stepTone = L => SC_TONE[L.tone] || 'var(--accent)';
    const ls = E.lifestyleOf(g, p);
    return `<div class="esc-block" style="border-left:3px solid ${tone}">
      <div class="esc-block__hd">
        <span>社会等级（对局中实时对照）</span>
        <b class="esc-block__pct" style="color:${tone}">L${cls.lv}</b>
      </div>
      <div class="sc-ladder sc-ladder--sm">
        ${E.LADDER.map((L, i)=>`<span class="sc-step${i <= cls.lv ? ' sc-step--on' : ''}${i === cls.lv ? ' sc-step--cur' : ''}" style="--sc:${stepTone(L)}" title="L${i} ${L.name}"></span>`).join('')}
      </div>
      <div class="esc-block__meta">
        <span><b style="color:${tone}">${esc(cls.level.name)}</b></span>
        ${cls.next
          ? `<span>距「${esc(cls.next.name)}」<b>${Math.round(cls.next.prog * 100)}%</b></span>`
          : '<span>已是最高等级</span>'}
      </div>
      <div class="esc-block__meta">
        <span>消费档次</span>
        <span>意外支出 <b>×${ls.mult.toFixed(2)}</b></span>
      </div>
      <p class="hint" style="margin-top:6px">${esc(cls.level.real)}</p>
    </div>`;
  })();
  host.innerHTML = `
    <div class="fin-head">
      <span class="token token--big" style="background:${p.color}">${p.icon}</span>
      <div><h3>${esc(p.name)}</h3><p class="muted">${p.job.ico} ${esc(p.job.name)} · 第 ${g.round} 轮 · ${p.inFT?'财务自由圈':'老鼠赛跑'}</p></div>
    </div>
    <div class="sec">
      <div class="sec__total"><span>手头现金</span><span class="money">${money(p.cash)}</span></div>
      <div class="sec__total"><span>年结余</span><span class="money ${E.settleCashflow(p)<0?'neg':''}">${money(E.annual(E.settleCashflow(p)))}</span></div>
      ${p.inFT
        ? `<div class="sec__total" style="background:var(--secondary-container);color:var(--secondary)"><span>分红收入（年·毛额）</span><span class="money">${money(E.annual(E.ftMonthly(p)))} <span class="muted">净额见上方年结余</span></span></div>
           <div class="esc-block">
             <div class="esc-block__hd"><span>出圈进度</span><b class="esc-block__pct pos">100%</b></div>
             <div class="progress"><div class="progress__bar" style="width:100%"></div></div>
             <div class="esc-block__meta"><span>已进入财务自由圈 —— 出圈这件事对你已经完成</span></div>
           </div>
           <div class="esc-block">
             <div class="esc-block__hd"><span>企业达标进度（所购企业的<b>月现金流之和</b> ≥ ${money(E.empireTarget())} 即获胜）</span><b class="esc-block__pct">${Math.min(100, Math.floor((p.ftGain||0) / (E.empireTarget() / 100)))}%</b></div>
             <div class="progress"><div class="progress__bar" style="width:${Math.min(100,(p.ftGain||0)/500)}%"></div></div>
             <div class="esc-block__meta"><span>累计 <b class="money">${money(p.ftGain||0)}</b> / ${money(E.empireTarget())}</span></div>
           </div>`
        : `<div class="sec__total" style="background:var(--secondary-container);color:var(--secondary)"><span>被动收入（年）</span><span class="money">${money(E.annual(f.passive))}</span></div>
           <div class="esc-block">
             <div class="esc-block__hd">
               <span>出圈进度（被动收入 ＞ 支出 × ${E.escapeMargin(g)}）</span>
               <b class="esc-block__pct ${pr.canEscape?'pos':''}">${pr.pctText}%</b>
             </div>
             <div class="progress"><div class="progress__bar" style="width:${pr.pctText}%"></div></div>
             <div class="esc-block__meta">
               <span>被动收入（年）<b class="money">${money(E.annual(pr.passive))}</b> / 门槛 <b class="money">${money(E.annual(pr.target))}</b></span>
               <span>${pr.canEscape ? '✅ 已达标，点主按钮即可出圈' : `还差 <b class="money">${money(E.annual(pr.gap))}</b> 被动收入（年）`}</span>
             </div>
           </div>`}
      ${clsBlock}
      ${p.skipTurns>0?`<p class="hint" style="margin-top:8px">⏸️ 之后还有 ${p.skipTurns} 个回合轮到你时不能行动（回合仍属于你）。</p>`:''}
    </div>

    <div class="sec">
      <div class="sec__title"><span>精力与人生状态</span><span>${E.isAgeMode(g) ? E.ageOf(g)+' 岁 · 距退休 '+E.yearsLeft(g)+' 年' : '无限模式'}</span></div>
      ${(function(){
        /* 人生阶段卡片：只呈现叙事 + 当前实时的曲线值。
           数值全部读自引擎（salary / lifeCoef / elderCare / energyMax），
           阶段表本身不含任何业务数值 —— 否则会出现「阶段说 ×1.35、工资表说 ×1.20」。 */
        if(!E.isSolo(g)) return '';
        const i = E.soloStageOf(g), st = window.SOLO_STAGES[i];
        return `<div class="stage-card">
          <div class="stage-card__hd">
            <span class="stage-card__no">人生阶段 ${i+1} / ${window.SOLO_STAGES.length}</span>
            <b>${esc(st.nm)}</b>
          </div>
          <div class="stage-card__steps">${window.SOLO_STAGES.map((_, k)=>
            `<span class="${k <= i ? 'on' : ''}${k === i ? ' cur' : ''}"></span>`).join('')}</div>
          <div class="stage-card__meta">
            <span>${esc(st.range)} · ${esc(st.tag)}</span>
            <span>核心：<b>${esc(st.tension)}</b></span>
          </div>
          <div class="stage-card__vals">
            <span>主动收入 <b>${money(p.salary)}</b>${p.retired ? '（养老金）' : '（工资）'}</span>
            <span>生活支出 <b>×${p.lifeCoef}</b></span>
            <span>赡养 <b>${p.elderCare > 0 ? money(p.elderCare) + '/月' : '无'}</b></span>
            <span>精力上限 <b>${E.energyMax(g, p)}</b></span>
          </div>
          <p class="hint">${esc(st.note)}</p>
        </div>`;
      })()}
      <div class="energy-panel">
        <div class="energy-panel__hd">
          <span>精力（决定你还能同时推进多少事）</span>
          <b>${Math.round(p.energy)} / ${E.energyMax(g, p)}</b>
        </div>
        ${U.energyBar(p, g, { label:false })}
        <div class="energy-flow">
          <span>每回合恢复 <i>+${E.energyRecover(g, p)}</i></span>
          <span>持有维护 <i>−${E.energyUpkeep(p)}</i></span>
          <span>净变化 <i class="${E.energyRecover(g,p) - E.energyUpkeep(p) < 0 ? 'neg' : 'pos'}">${(E.energyRecover(g,p) - E.energyUpkeep(p)) >= 0 ? '+' : ''}${E.energyRecover(g,p) - E.energyUpkeep(p)}</i></span>
        </div>
        ${E.energyRecover(g,p) - E.energyUpkeep(p) < 0
          ? `<p class="hint" style="margin-top:8px">⚠️ 你名下的资产已经超出能照看的范围，精力会持续下滑。可考虑<b>卖掉一部分需要打理的资产</b>，或停在「起点」选择休假。</p>`
          : ''}
      </div>
      <div class="fin-chips">${U.lifeChips(p, g)}</div>
      ${E.isJobless(p) ? `<p class="hint" style="margin-top:8px">📉 <b>失业中</b>：工资已归零，支出照付。每回合可点「投递简历 · 求职」（消耗 ${window.UNEMPLOYMENT.huntEnergy} 点精力）推进求职进度 ${p.joblessProgress}/${p.joblessNeed}。</p>` : ''}
      ${p.wings>0 ? `<p class="hint" style="margin-top:8px">🪶 持有<b>银翅膀 ×${p.wings}</b>：掷骰时可选择改用 3 粒骰子（走得更快，但落点更难控制）。</p>` : ''}
    </div>
    <div class="fin-cols">
      <div>${U.renderIncome(p)}</div>
      <div>
        <div class="sec"><div class="sec__title">资产</div>${U.renderAssets(p)}
          ${(function(){
            /* 资产估值：账面成本 ≠ 当前市价。玩家最需要看到的就是这个差额 ——
               「纸面上有 50 万」和「现在能抵押出多少」是两件事。 */
            const ap = E.appraiseAll(g, p);
            if(!ap.rows.length) return '';
            const d = ap.value - ap.book;
            const pctv = ap.book > 0 ? d / ap.book * 100 : 0;
            return `<div class="sec__total" style="margin-top:8px">
                <span>资产估值 <span class="muted">（账面 ${money(ap.book)} → 当前市价）</span></span>
                <span class="money ${d >= 0 ? 'pos' : 'neg'}">${money(ap.value)}
                  <span class="muted">${d >= 0 ? '+' : ''}${pctv.toFixed(1)}%</span></span>
              </div>
              <p class="hint">估值 = 账面成本 × 行情周期 × 折旧。房价会跌、设备会旧、土地长期微涨 ——
                <b>纸面资产不等于现在能变现的钱</b>，抵押额度就是按这个市价算的。</p>`;
          })()}
        </div>
        <div class="sec"><div class="sec__title">负债</div>${U.renderLiabs(p)}</div>
      </div>
    </div>`;
}

/* ------------------------------ 日志 / 规则 / 设置 ------------------------------ */
function renderLog(){
  const host = $('#paneLog');
  host.innerHTML = '<div class="log">' + Game.g.log.map(l=>
    `<div class="log__item log__item--${l.type}">${l.who?`<span class="log__who">${esc(l.who)}：</span>`:''}${esc(l.text)}</div>`
  ).join('') + '</div>';
}
function renderRules(){
  const g = Game.g;
  const ageMode = E.isAgeMode(g);
  $('#paneRules').innerHTML = `
  <div class="rules">
    <h4>当前对局</h4>
    <div class="rulelist">
      <div class="rulelist__row rulelist__row--head"><div>维度</div><div>当前设置</div></div>
      <div class="rulelist__row"><div>游戏模式</div><div>${ageMode
        ? `年龄模式 · ${g.startAge} 岁起步，每完成一整轮长 1 岁，<b>${g.endAge} 岁退休结算</b>；现 ${E.ageOf(g)} 岁（第 ${g.round}/${E.maxRounds(g)} 轮，距退休 ${E.yearsLeft(g)} 年）`
        : `无限模式 · 不设年龄与轮数上限；现第 ${g.round} 轮`}</div></div>
      <div class="rulelist__row"><div>规则版本</div><div>${g.rule} 规则</div></div>
      <div class="rulelist__row"><div>出圈条件</div><div>被动收入 ＞ 总支出 × ${E.escapeMargin(g)}<span class="muted">（安全边际）</span></div></div>
      <div class="rulelist__row"><div>骰子</div><div>按<b>各玩家自己所在的圈</b>：内圈 1 粒 / 财务自由圈 2 粒</div></div>
      <div class="rulelist__row"><div>投资机会格</div><div>${g.rule==='202'?'同时抽投资卡 + 行情卡':'只抽投资卡（小额理财 / 大额置业）'}</div></div>
      <div class="rulelist__row"><div>行情卡</div><div>${g.rule==='202'?'42 张，抽满 25 张重洗':'16 张，波动温和'}</div></div>
      <div class="rulelist__row"><div>交易方向</div><div>${g.rule==='202'?'做多 + 融券做空 + 期权':'仅做多'}</div></div>
      <div class="rulelist__row"><div>意外支出</div><div>${g.rule==='202'?'金额较重':'金额较轻'}</div></div>
      <div class="rulelist__row"><div>房产</div><div>${g.rule==='202'?'可联合购买，租金随行情波动':'独立购买'}</div></div>
      <div class="rulelist__row"><div>财务自由圈企业</div><div>${g.rule==='202'?'可开设特许经营':'仅可购买'}</div></div>
      <div class="rulelist__row"><div>初始资产</div><div>${g.rule==='202'?'职业卡 + 随机投资组合':'仅职业卡'}</div></div>
      <div class="rulelist__row"><div>现金约束</div><div>现金<b>不能为负</b>：付不出必须先贷款补足或变卖资产</div></div>
      <div class="rulelist__row"><div>破产惩罚</div><div>${g.rule==='202'?'退出游戏 + 跳回合与借贷限制':'退出游戏'}</div></div>
    </div>
    <h4>轮数与年龄</h4>
    <ul>
      <li><b>一轮</b> = 所有存活玩家各行动一次。</li>
      <li><b>年龄模式</b>：开局 ${g.startAge} 岁，每完成一整轮所有玩家长 1 岁，到 <b>${g.endAge} 岁</b>退休结算，共 ${E.maxRounds(g)} 轮。</li>
      <li><b>无限模式</b>：不设年龄与轮数上限，一直玩到有人达成获胜条件。</li>
      <li>年龄模式下，若中途有人买下梦想或企业累计达标，仍会提前结束对局。</li>
    </ul>
    <h4>两条跑道（有人出圈后怎么继续）</h4>
    <ul>
      <li>「圈」是<b>每个玩家自己的状态</b>：内圈位置与财务自由圈位置分别记录、互不覆盖，骰子数也按各自所在的圈计算。</li>
      <li>屏幕一次只显示一条跑道，默认<b>永远跟随当前行动玩家</b> —— 轮到谁，就显示谁的圈和他自己的棋子位置。</li>
      <li>想看别人时点<b>「👀 查看……」</b>，副标题会写明当前行动玩家在哪条跑道第几格；他一旦掷骰或回合切换，视图自动回到他的跑道。</li>
      <li>回合交替始终按座位顺序进行，与玩家身处哪个圈无关（只有<b>出局玩家</b>才会被跳过）。</li>
      <li><b>暂停回合</b>（裁员失业）：回合<b>照常轮到你</b>，只是这几个回合不能掷骰 / 交易 / 借贷 ——
          轮转不会被跳过，也不会让对手连续行动。</li>
    </ul>
    <h4>回合流程</h4>
    <ul>
      <li>内圈掷 1 粒骰子（财务自由圈掷 2 粒），移动棋子。</li>
      <li>经过或停在<b>发薪日</b>：结算<b>一整年</b> —— 领取年度结余（年收入 − 年支出），
        并偿还贷款当年的本金（12 期）。<b>一轮 = 一年，一次发薪日 = 一年</b>。</li>
      <li><b>投资机会格</b>：抽投资卡，决定是否买入；多人模式下资金不足可把投资卡转让给其他玩家（<b>单人模式没有转让，只能买入或放弃</b>）。</li>
      <li><b>市场行情格</b>：抽行情卡，所有玩家可卖出相关资产；202 规则下租金随行情波动。</li>
      <li><b>意外支出格</b>：支付卡片金额。<b>添丁格</b>：子女 +1（上限 3 个），养育支出增加。</li>
      <li><b>公益捐赠格</b>：捐出总收入的 10%，未来 2 轮可选掷 1—2 粒骰子。</li>
      <li><b>裁员失业格</b>：支付一次总支出，此后<b>两个回合轮到你时不能行动</b>（回合仍属于你，界面会提示并交棒）。</li>
      <li><b>资金不足时</b>：现金不能为负，必须三选一 —— 贷款补足 / 变卖资产（账面 80% 急售）/ 宣告破产退出游戏。</li>
      <li><b>主动认输</b>：可在菜单里主动退出本局。与破产不同，认输<b>不清算资产</b>，按净资产计入排名。</li>
    </ul>
    <h4>获胜条件</h4>
    <ul>
      <li>第一个在财务自由圈买下自己梦想的玩家。</li>
      <li>第一个在财务自由圈通过购买企业使<b>企业月现金流之和</b>增加 ≥ ${money(E.empireTarget())} 的玩家
        （这是「资产规模」的度量，与年度结算无关）。</li>
      <li>${ageMode ? `<b>年龄模式</b>：全部玩家到 ${g.endAge} 岁退休时按<b>净资产</b>排名，最高者获胜。` : '无限模式下没有轮数上限，直到有人达成上述条件为止。'}</li>
      <li>${g.rule==='202'?'202：买断对手资产使其出局，最终存活者获胜。':'101：破产者退出游戏，其余玩家继续。'}</li>
    </ul>
    <h4>本局复盘</h4>
    <ul>
      <li>任何玩家<b>出局</b>（破产 / 认输 / 被买断）时，系统会立刻为该玩家生成一份<b>整局复盘报告</b>。</li>
      <li>本局结束时（退休结算 / 获胜 / 全员出局），战绩页也提供「查看复盘报告」入口；菜单里可随时查看。</li>
      <li>报告包含：结局与评级、关键指标、五维表现、财富走势、关键决策时间线、出圈诊断与改进建议、下一局行动清单。</li>
      <li>所有结论来自整局记录的<b>决策计数</b>与<b>逐轮财富快照</b>，不是主观评价。</li>
    </ul>
    <h4>贷款与提前还款</h4>
    <ul>
      <li>六类贷款<b>全部支持提前还款</b>，统一在「贷款管家」里操作。</li>
      <li>每笔贷款都有明确的<b>年供、月利率、剩余年数、剩余利息</b>。经过一次发薪日即偿还<b>一年</b>（12 期）：
          每期利息 = 剩余本金 × 月利率，月供的其余部分冲减本金。</li>
      <li>剩余期限以<b>年</b>显示（剩余期数 ÷ 12，向上取整）—— 与年龄、轮次同一把尺子。</li>
      <li>部分提前还款<b>不得低于 1 期月供</b>；想一次还清直接选「结清全部」。</li>
      <li>还款后二选一：<b>年供不变 · 缩短期限</b>（省利息最多，默认）或 <b>期限不变 · 降低年供</b>（减轻每年压力）。</li>
      <li>结清后该笔年供立即从支出中消失，年结余同步改善。</li>
    </ul>
    <div class="rulelist">
      <div class="rulelist__row rulelist__row--head"><div>贷款类型</div><div>月息 / 年化 · 违约金 · 锁定期</div></div>
      ${E.LOAN_KEYS.map(k=>{ const t = E.loanType(k); return `<div class="rulelist__row"><div>${t.nm}</div><div>${
        (t.rate*100).toFixed(2)}% / 年化约 ${(t.rate*12*100).toFixed(1)}% · ${
        t.prepayRate ? '还本额 ' + (t.prepayRate*100).toFixed(0) + '%' : '免收'} · ${
        t.minPeriod ? '满 ' + t.minPeriod + ' 期' : '无'}${t.kind === 'revolving' ? ' · 随借随还' : ''}</div></div>`; }).join('')}
    </div>
    <h4>人生模拟（精力 · 收入曲线 · 逆流）</h4>
    <ul>
      <li><b>精力</b>：独立于现金的第二重资源，代表「你还有没有时间与体力管这些事」。
        每回合自然恢复 <b>+${E.energyRecover(g, E.current(g))}</b> 点（随年龄衰减），
        而名下每处房产 / 家企业 / 每笔期权都会持续消耗。持有过多会净流失 —— 适时减持是正常操作。</li>
      <li><b>精力归零 → 健康危机</b>：强制休养 ${window.ENERGY.crisisRestTurns} 个回合，每月新增医疗支出（约半个月支出），
        持续约半年，期间精力恢复减半。这是「长期过劳」的真实代价。</li>
      <li><b>休假</b>：停在「起点」可花约一个月支出换 +${window.ENERGY.vacationEnergy} 点精力 —— 花钱买休息，是唯一的主动恢复通道。</li>
      <li><b>收入随年龄变化</b>：${window.SALARY_CURVE.map(c=>`${c.phase} ×${c.mult}`).join(' · ')}。
        巅峰期在 36—45 岁，此后受年龄门槛影响回落到七成 —— <b>越晚完成原始积累，越难跳出老鼠赛跑</b>。</li>
      <li><b>支出随人生阶段变化</b>：${window.LIFE_STAGES.filter(s=>s.to<100).map(s=>`${s.nm} ×${s.coef}`).join(' · ')}。
        中年期起新增<b>赡养父母支出</b>，这是「三明治一代」最真实的压力来源。</li>
      <li><b>失业（逆流）</b>：被裁后按 N+1 惯例<b>领取</b>离职补偿，但<b>工资归零、支出照付</b>，
        需要投入精力求职才能重新就业（40 岁 / 50 岁以上求职更难）。撑不过去就只能变卖资产。</li>
      <li><b>入不敷出</b>：年度结余为负时，每年需动用储蓄补上缺口；储蓄耗尽后同样要面对贷款 / 变卖 / 破产三条路。</li>
    </ul>
    <h4>关键数值</h4>
    <ul>
      <li>信用贷月息 <b>${(E.loanType('bank').rate*100).toFixed(1)}%</b>（年化约 ${(E.loanType('bank').rate*12*100).toFixed(0)}%），随借随还；财务自由圈投资只能用现金，不允许贷款。</li>
      <li><b>信用贷额度由收入核定</b>：负债收入比须 ≤ <b>${((window.CREDIT&&window.CREDIT.maxDTI||0.55)*100).toFixed(0)}%</b>，
        授信总额不超过<b>年收入的 ${(window.CREDIT&&window.CREDIT.incomeMult||1.2).toFixed(1)} 倍</b>（取较小者再乘信用系数）。
        失业 / 求职期与破产后的征信恢复期内<b>不予授信</b>；退休后额度折半；白户（从未借过款）也会被谨慎对待。
        —— 借钱能撑一时，但最终要靠收入去还。</li>
      <li>主动变卖资产按账面价 <b>${Math.round(E.SELL_RATE*100)}%</b> 立即变现；破产时银行按 <b>${Math.round(E.BANK_RATE*100)}%</b> 收购全部可变现资产抵债。</li>
      <li><b>多头借贷会被识别</b>：同时在多个<b>信用类</b>产品上有余额、近期频繁申请信用贷、或额度使用率过高，
        都会触发降额；达到红线时<b>直接拒贷</b>（房贷 / 车贷 / 助学属于正常负债，不计入）。</li>
      <li><b>抵押物按当前市价估值</b>：银行不按你的买入价放贷 —— 房价随 <b>8 年周期 ±15%</b> 波动（各类资产相位错开），
        企业按 <b>4%/年</b> 折旧、土地长期微涨，存款 / 理财的本金不随行情变动。
        <b>市价下行时你的可贷额度会一起缩水。</b></li>
      <li><b>退休与终局都会结清</b>：61 岁退休时先把此前未结算的年份按<b>在职口径</b>结清，再切换为养老金；
        65 岁结束时再补结最后一段 —— 所以「一生结算的总年数 = 你的实际年龄跨度」，不会有年头凭空漏账。</li>
      <li>进入财务自由圈的启动资金 = <b>月被动收入 × 100</b>（≈ 8.3 年的被动收入，
        这是原版的游戏化数字，不是按年结算的金额）。</li>
      <li>融券做空不需支付现金，出现该标的价格时<b>强制买回平仓</b>，可随时操作。</li>
      <li>看涨 / 看跌 / 跨式期权有 <b>3 回合</b>时间限制，逾期权利金损失。</li>
    </ul>
  </div>`;
}
function renderSettings(){
  const g = Game.g, p = E.current(g);
  $('#paneSettings').innerHTML = `
    <div class="sec">
      <div class="sec__title">游戏信息</div>
      <div class="rowlist">
        <div class="rowlist__row"><span>游戏模式</span><b>${E.modeLabel(g)}${E.isSolo(g) ? ` · ${E.soloStage(g).nm}` : ''}</b></div>
        <div class="rowlist__row"><span>规则版本</span><b>${g.rule} 规则</b></div>
        <div class="rowlist__row"><span>玩家人数</span><b>${g.players.length} 人</b></div>
        <div class="rowlist__row"><span>当前轮次</span><b>第 ${g.round} 轮${E.isAgeMode(g) ? ` / 共 ${E.maxRounds(g)} 轮` : ''}</b></div>
        ${E.isAgeMode(g) ? `<div class="rowlist__row"><span>当前年龄</span><b>${E.ageOf(g)} 岁 · 距退休 ${E.yearsLeft(g)} 年</b></div>` : ''}
        <div class="rowlist__row"><span>人生阶段</span><b>${esc(p.lifeStage||'')} · ${esc(p.salaryPhase||'')}</b></div>
        <div class="rowlist__row"><span>收入系数</span><b>×${(p.salaryMult||1).toFixed(2)} → 实发 ${money(p.salary)}</b></div>
        <div class="rowlist__row"><span>精力</span><b>${Math.round(p.energy)} / ${E.energyMax(g,p)}</b></div>
        ${p.medicalExp>0?`<div class="rowlist__row"><span>医疗支出</span><b class="neg">${money(p.medicalExp)}/月 · 剩 ${p.crisisTurns} 回合</b></div>`:''}
        <div class="rowlist__row"><span>行情卡已抽</span><b>${g.marketDrawn}${g.rule==='202'?' / 25':' 张'}</b></div>
      </div>
    </div>
    <div class="sec">
      <div class="sec__title">操作</div>
      <button class="btn btn--tonal btn--block" data-act="finance" style="margin-bottom:8px">财务报表总览</button>
      <button class="btn btn--tonal btn--block" data-act="loan" style="margin-bottom:8px">贷款管家（提前还款）</button>
      <button class="btn btn--tonal btn--block" data-act="trade" style="margin-bottom:8px">玩家间交易</button>
      ${g.rule==='202'?`<button class="btn btn--tonal btn--block" data-act="short" style="margin-bottom:8px">融券做空 / 期权操作</button>`:''}
      <button class="btn btn--primary btn--block" data-act="summary" style="margin-bottom:8px">📊 本局复盘报告</button>
      <button class="btn btn--outline btn--block" data-act="surrender" style="margin-bottom:8px">🏳️ 主动认输</button>
      <button class="btn btn--outline btn--block" data-act="restart">重新开始</button>
    </div>`;
  $$('#paneSettings [data-act]').forEach(b=> b.onclick = ()=>onMenu(b.dataset.act));
}

/* ------------------------------ 操作栏 ------------------------------ */
/* 只读地算出下一位仍在场的玩家（不改变回合状态），用于「结束回合」按钮文案 */
function nextAliveName(g, fromId){
  if(g.players.length < 2) return '';
  let i = fromId, guard = 0;
  do{ i = (i+1) % g.players.length; guard++; } while(g.players[i].out && guard <= g.players.length*2);
  return g.players[i].name;
}
/* 回合节拍：重放一次 CSS 动画，让状态变化看得见 */
function nudge(sel){
  const el = $(sel); if(!el) return;
  el.classList.remove('btn--nudge'); void el.offsetWidth; el.classList.add('btn--nudge');
  setTimeout(()=>el.classList.remove('btn--nudge'), 700);
}
function flashSeat(pid){
  const el = $$('#playerList .pcard')[pid]; if(!el) return;
  el.classList.remove('pcard--flash'); void el.offsetWidth; el.classList.add('pcard--flash');
  setTimeout(()=>el.classList.remove('pcard--flash'), 1100);
}
/* 回合状态条：把「现在轮到谁 / 这一步该做什么」常驻在操作区正上方 */
function renderTurnBar(g, p, pendingBusy, canEnd){
  const bar = $('#turnBar'); if(!bar) return;
  $('#turnDot').style.background = p.color;
  $('#turnName').textContent = g.over ? '游戏结束' : `轮到 ${p.name}`;
  let s, txt;
  if(g.over){
    s = 'over';
    txt = (g.winner != null && g.players[g.winner]) ? `🏆 ${g.players[g.winner].name} 获胜` : '本局已结束';
  }
  else if(p.pausedThisTurn){ s = 'pause'; txt = `本回合暂停（健康危机休养 · 此后还剩 ${p.skipTurns} 轮）· 请交给下一位`; }
  else if(pendingBusy){ s = 'card'; txt = `待处理：${g.pending.title || '卡片'}`; }
  else if(Game.animating){ s = 'roll'; txt = '掷骰中…'; }
  else if(E.isJobless(p)){ s = 'jobless'; txt = `失业求职中 ${p.joblessProgress}/${p.joblessNeed} · 工资已归零 · 精力 ${Math.round(p.energy)}/${E.energyMax(g,p)}`; }
  else if(canEnd){ s = 'end'; txt = '已移动 · 请结束回合交给下一位'; }
  else {
    s = 'roll';
    const low = Math.round(p.energy) < (window.ENERGY.lowAt || 30);
    txt = `${E.isAgeMode(g) ? E.ageOf(g)+' 岁 · ' : ''}第 ${g.round} 轮 · ${p.inFT ? '财务自由圈' : '老鼠赛跑'}`
        + ` · ${p.salaryPhase || ''}${low ? ` · ⚠️ 精力偏低（${Math.round(p.energy)}）` : ''}`;
  }
  $('#turnState').textContent = txt;
  if(bar.dataset.state !== s) bar.dataset.state = s;
}

let lastCanEnd = false;
let lastEndAt = 0;      /* 结束回合的防连点时间戳：双击会一次吃掉下一位的回合 */
let healedPending = null;
let handoffTimer = null;

function updateActions(){
  const g = Game.g, p = E.current(g);
  const btnRoll = $('#btnRoll'), label = $('#btnRollLabel'), endBtn = $('#btnEndTurn');
  const n = E.diceCount(g, p);
  const pendingBusy = !!g.pending;
  const paused = !!p.pausedThisTurn && !g.over;      /* 本回合暂停：回合仍是他的，但不能行动 */
  const canEnd = (Game.rolled || paused) && !pendingBusy && !g.over;

  /* 当前玩家已出局（例如刚宣告破产）→ 自动交棒，不必让他自己点「结束回合」 */
  if(p.out && !g.over && !Game.animating && !pendingBusy){
    if(!handoffTimer){
      handoffTimer = setTimeout(()=>{
        handoffTimer = null;
        if(Game.g === g && !g.over && E.current(g).out) endTurn();
      }, 300);
    }
  } else if(handoffTimer){ clearTimeout(handoffTimer); handoffTimer = null; }

  const chip = $('#turnChip');
  if(chip){ chip.hidden = false; chip.textContent = `${E.isAgeMode(g) ? E.ageOf(g)+' 岁 · ' : ''}第 ${g.round} 轮 · ${p.name}`; }

  /* 主操作按钮互换：屏幕上任何时刻只有一个明确的主操作。
     未移动 →「掷骰子」是主按钮；移动完且卡片结算完 →「结束回合」升为主按钮；
     本局已结束 →「再来一局」升为主按钮（旧版本局结束后所有按钮同时失效，
     玩家关掉结算弹层就再也走不出去）。 */
  if(g.over){
    btnRoll.className = 'btn btn--primary btn--xl';
    btnRoll.disabled = false;
    label.textContent = '🎉 再来一局';
    endBtn.className = 'btn btn--tonal';
    endBtn.textContent = '查看战绩';
    endBtn.hidden = false;
  } else {
    if(canEnd){
      btnRoll.className = 'btn btn--tonal';
      endBtn.className = 'btn btn--primary btn--xl';
      endBtn.textContent = paused
        ? (g.players.length > 1 ? `结束回合 · 交给 ${nextAliveName(g, p.id)}` : '结束回合')
        : (g.players.length > 1 ? `结束回合 · 轮到 ${nextAliveName(g, p.id)}` : '结束回合');
    } else {
      btnRoll.className = 'btn btn--primary btn--xl';
      endBtn.className = 'btn btn--tonal';
      endBtn.textContent = '结束回合';
    }
    btnRoll.disabled = pendingBusy || Game.rolled || Game.animating || paused;
    label.textContent = paused ? `本回合暂停（此后还剩 ${p.skipTurns} 轮）`
      : pendingBusy ? '处理卡片中…'
      : Game.animating ? '掷骰中…'
      : Game.rolled ? '本回合已移动'
      : `掷骰子（${n} 粒）`;
    endBtn.hidden = !canEnd;
  }

  $('#die2').hidden = n < 2;
  $('#die3').hidden = n < 3;
  /* 银翅膀：做慈善换来的「一次掷 3 粒」机会。走得更快，但落点更难控制 ——
     这是财富流里少见的、真实存在取舍的机制，所以保留并做成显式切换。 */
  const canWing = (p.wings||0) > 0 && !p.inFT && !Game.rolled && !g.over && !pendingBusy && !paused;
  $('#btnDiceChoice').hidden = !canWing;
  if(canWing){
    $('#btnDiceChoice').textContent = p.diceChoice === window.WINGS.dice
      ? `🪶 银翅膀：掷 3 粒（点击改回 1 粒）`
      : `🪶 银翅膀：掷 1 粒（点击改用 3 粒）`;
  }
  /* 失业期间主操作之外多一条「求职」——不做就只能干等，游戏会变成纯运气 */
  const huntBtn = $('#btnJobHunt');
  if(huntBtn){
    const huntable = E.isJobless(p) && !g.over && !pendingBusy && !paused;
    huntBtn.hidden = !huntable;
    if(huntable) huntBtn.textContent = `投递简历 · 求职（${p.joblessProgress}/${p.joblessNeed}，耗 ${window.UNEMPLOYMENT.huntEnergy} 精力）`;
  }

  renderTurnBar(g, p, pendingBusy, canEnd);

  /* 主操作发生切换时给一个视觉落点，玩家不必猜下一步点哪 */
  if(canEnd && !lastCanEnd) nudge('#btnEndTurn');
  lastCanEnd = canEnd;

  /* 自愈：本轮卡片尚未结算、但弹层已不在屏幕上 → 自动把卡片找回来，避免回合状态死锁。
     healedPending 只用于防「showPending 打不开 → 无限重开」；
     卡片一旦正常显示就立刻解除标记，否则「先贷款」这类子弹层再次顶掉卡片时就救不回来了。 */
  if(pendingBusy){
    if(!$('#modalHost').hidden){
      healedPending = null;                 /* 卡片已在屏幕上 → 解除一次性保护 */
    } else if(window.UiPending && healedPending !== g.pending){
      healedPending = g.pending;
      setTimeout(()=>{
        if(g.pending && $('#modalHost').hidden){
          window.UiPending.showPending();
          if(!$('#modalHost').hidden) healedPending = null;   /* 成功找回 → 允许再次自愈 */
        }
      }, 0);
    }
  } else healedPending = null;

  const esc_ = E.escapeProgress(g, p);
  let b = $('#btnEscape');
  if(esc_.canEscape && !p.inFT && !g.over && !p.pausedThisTurn){
    if(!b){
      b = document.createElement('button');
      b.id = 'btnEscape'; b.className = 'btn btn--tonal';
      $('#btnRoll').parentNode.appendChild(b);
    }
    b.textContent = '🎉 跳出老鼠赛跑 → 财务自由圈';
    b.onclick = ()=>{
      const r = A.escapeRatRace(g);
      if(!r.ok) return U.toast(r.msg, 'err');
      resetBoardView(g);          /* 出圈后视图跟到财务自由圈 */
      renderAll();
      U.toast(`进入财务自由圈！出圈资金 ${money(r.buyout)}`, 'ok');
    };
  } else if(b) b.remove();

  scheduleSave();   /* 所有状态变化最终都会收敛到 updateActions，在这里合并落盘 */
}

/* ------------------------------ 回合流程 ------------------------------ */
function roll(){
  const g = Game.g, p = E.current(g);
  if(g.over || g.pending || Game.rolled || Game.animating) return;
  if(p.pausedThisTurn) return U.toast(`<b>${esc(p.name)}</b> 本回合暂停，不能行动`, 'err');
  /* 掷骰前把视图拉回当前玩家自己的圈：否则「查看另一条跑道」时掷骰，
     他的棋子在屏幕上根本不动，看起来就像回合没有轮到他。 */
  if(Game.peeking){ resetBoardView(g); renderBoard(); }
  const n = E.diceCount(g, p);
  if(n === window.WINGS.dice) E.useWing(p);    /* 掷出即消耗：用了才有成本，不用就不会丢 */
  const dice = E.rollDice(g, n);
  g.lastDice = dice;
  Game.animating = true;
  updateActions();
  const ds = [$('#die1'), $('#die2'), $('#die3')];
  ds.forEach((d,i)=>{ if(!d) return; d.hidden = i >= n; d.classList.add('die--roll'); });
  let ticks = 0;
  const fast = U.Setup.fast === false ? false : true;
  const maxTicks = fast ? 6 : 14;
  const timer = setInterval(()=>{
    for(let i=0;i<n;i++) if(ds[i]) ds[i].textContent = 1 + Math.floor(Math.random()*6);
    if(++ticks > maxTicks){
      clearInterval(timer);
      for(let i=0;i<n;i++) if(ds[i]) ds[i].textContent = dice[i];
      finishRoll(dice);
    }
  }, 70);
}
function finishRoll(dice){
  const g = Game.g, p = E.current(g);
  const sum = dice.reduce((a,b)=>a+b,0);
  const res = E.movePlayer(g, p, sum);
  Game.rolled = true;
  Game.animating = false;
  /* ★ 发薪提示：现金已在这里进账（movePlayer 内完成结算），
     所以提示必须紧随其后 —— 落在 resolveSpace 之前，玩家先看到「已发薪」，
     随后才是所在格子的面板。停在结算格与纯入不敷出时 paydayNoticeOf 返回 null，
     由对应的弹层负责说明（见该函数的注释）。 */
  U.paydayNotice(E.paydayNoticeOf(g, res, p.inFT));
  E.resolveSpace(g, p, res);
  renderAll();
    if(g.pending) {
    if(g.pending.type === 'market'){
      const impact = A.marketImpact(g, g.pending.card);
      g.pending.impact = impact;
    }
    window.UiPending.showPending();
  }
  renderAll();
}
function endTurn(){
  const g = Game.g;
  if(g.over) return;
  if(g.pending) return U.toast('请先处理当前卡片，回合才能继续', 'err');
  /* 防连点：结束回合是「交棒」动作，双击会一次吃掉下一位的整个回合 */
  const now = Date.now();
  if(now - lastEndAt < 320) return;
  lastEndAt = now;
  const acting = E.current(g);          /* 本回合玩家：可能在这次结算里被动破产 */
  E.endTurn(g);
  Game.rolled = false;
  const nxt = E.current(g);
  resetBoardView(g);            /* 视图切到新行动玩家所在的圈（并结束临时查看） */
  renderAll();
  /* 出局 → 先给出局者本人的复盘；复盘的页脚可以再回到战绩页。
     这样「破产即出复盘」这条规则不受本局是否同时结束的影响。 */
  const reported = reportIfNeeded(acting);
  if(g.over){
    if(reported) return;
    winnerModal(); return;
  }
  if(reported) return;
  /* 退休是收入断崖：必须在玩家看到「钱怎么少了」之前解释清楚 */
  if(retireNotice(g)) return;
  /* 本回合结束时精力被耗尽 → 健康危机。必须先说清楚「为什么被打断」，
     否则玩家只会觉得游戏莫名其妙地不让他行动。 */
  if(crisisNotice(g)) return;
  /* 新玩家本回合处于暂停（健康危机休养）→ 明确提示，而不是悄悄跳过他 */
  if(pauseNotice(g)) return;
  /* 交接反馈：新席位闪一下 + 掷骰按钮轻弹，明确告诉玩家「换人了，该你了」 */
  flashSeat(nxt.id);
  nudge('#btnRoll');
  U.toast('轮到 <b>'+esc(nxt.name)+'</b>，请掷骰子', 'ok');
}

/* ------------------------------ 菜单动作 ------------------------------ */
function onMenu(act){
  const g = Game.g;
  if(!g){
    if(act==='theme') U.toggleTheme();
    if(act==='help') openHelp();
    return;
  }
  switch(act){
    case 'finance': openFinanceOverview(); break;
    case 'players': U.openModal(`
        <div class="modal__head"><h3>玩家一览</h3></div>
        <div class="modal__body">${g.players.map(p=>`
          <div class="pcard" style="margin-bottom:8px;border-left-color:${p.color}" data-pid="${p.id}">
            <div class="pcard__top"><span class="token" style="background:${p.color}">${p.icon}</span>
            <span class="pcard__name">${esc(p.name)}</span>
            <span class="pcard__tag">${p.out?'出局':(p.inFT?'财务自由圈':'老鼠赛跑')}</span></div>
            <div class="pcard__job">${p.job.ico} ${esc(p.job.name)} · 现金 ${money(p.cash)} · 年结余 ${money(E.annual(E.settleCashflow(p)))}</div>
          </div>`).join('')}</div>
        <div class="modal__foot"><button class="btn btn--text" data-close>关闭</button></div>`,
        { onMount(m){ $('[data-close]',m).onclick = U.closeModal;
          $$('[data-pid]',m).forEach(x=>x.onclick=()=>showPlayerDetail(+x.dataset.pid)); } });
      break;
    case 'help': openHelp(); break;
    case 'loan': openLoanCenter(); break;
    case 'trade':
      /* 单人下不是「禁用」，而是明确告知替代路径 —— 玩家看到「按钮不见了」会困惑，
         看到「改用机构转让」才知道该怎么做。 */
      if(E.isSolo(g)) return U.toast('单人模式没有其他玩家：没有玩家间交易，遇到投资机会只能「买入」或「放弃」。', 'info');
      openTrade(); break;
    case 'short': openShortPanel(); break;
    case 'summary': window.UiSummary.openSummary(); break;
    case 'surrender': surrenderFlow(); break;
    case 'theme': U.toggleTheme(); break;
    case 'restart': resetGame(); break;
  }
}
function renderAllReset(){
  $('#playerList').innerHTML=''; $('#paneFinance').innerHTML=''; $('#paneLog').innerHTML='';
  $('#turnChip').hidden = true;
  lastCanEnd = false; healedPending = null;
}
window.onMenu = onMenu;

function openHelp(){
  const g = Game.g;
  const tmp = document.createElement('div');
  const view = g || { rule:U.Setup.rule, players:[], marketDrawn:0, round:1 };
  U.openModal(`
    <div class="modal__head"><h3>规则速查 · ${view.rule} 规则</h3></div>
    <div class="modal__body">
      <div class="rulelist">
        <div class="rulelist__row rulelist__row--head"><div>维度</div><div>${view.rule==='202'?'202 规则':'101 规则'}</div></div>
        <div class="rulelist__row"><div>游戏模式</div><div>${view.mode==='endless' ? '无限模式（不设年龄与轮数上限）' : `年龄模式（20 岁起步，每完成一整轮长 1 岁，65 岁退休结算，共 45 轮）`}</div></div>
        <div class="rulelist__row"><div>出圈条件</div><div>被动收入 &gt; 总支出 × ${(window.YIELD && (view.rule==='202' ? window.YIELD.safetyMargin202 : window.YIELD.safetyMargin)) || '—'}</div></div>
        <div class="rulelist__row"><div>骰子</div><div>按<b>各玩家自己所在的圈</b>：内圈 1 粒 / 财务自由圈 2 粒</div></div>
        <div class="rulelist__row"><div>投资方向</div><div>${view.rule==='202'?'仅做多 + 做空 + 期权':'仅做多（上涨市）'}</div></div>
        <div class="rulelist__row"><div>行情卡</div><div>${view.rule==='202'?'42 张，抽满 25 张重洗':'波动温和，全部使用'}</div></div>
        <div class="rulelist__row"><div>额外支出</div><div>${view.rule==='202'?'惩罚重，可能大额支付':'惩罚较轻'}</div></div>
        <div class="rulelist__row"><div>房地产</div><div>${view.rule==='202'?'可联合购买，租金可变动':'独立购买'}</div></div>
        <div class="rulelist__row"><div>投资机会格</div><div>${view.rule==='202'?'同时抽投资卡与行情卡':'仅抽投资卡'}</div></div>
        <div class="rulelist__row"><div>财务自由圈企业</div><div>${view.rule==='202'?'可开设特许经营':'仅购买'}</div></div>
        <div class="rulelist__row"><div>初始资产</div><div>${view.rule==='202'?'职业卡 + 随机投资组合':'仅职业卡'}</div></div>
        <div class="rulelist__row"><div>现金约束</div><div>现金不能为负：付不出必须先贷款补足或变卖资产（80% 急售）</div></div>
        <div class="rulelist__row"><div>破产惩罚</div><div>${view.rule==='202'?'退出游戏 + 跳回合与借贷限制':'退出游戏'}</div></div>
      </div>
      <h4 style="margin:14px 0 6px;font-size:13px;color:var(--primary)">获胜条件</h4>
      <p class="muted">① 第一个在财务自由圈买下自己梦想的玩家；② 第一个在财务自由圈通过购买企业使企业月现金流之和增加 ≥ ${money(E.empireTarget())} 的玩家；③ ${view.rule==='202'?'买断对手资产使其出局，最终存活者获胜。':'破产者退出游戏。'}</p>
      <h4 style="margin:14px 0 6px;font-size:13px;color:var(--primary)">关键数值</h4>
      <p class="muted">信用贷月息 1%（年化约 12%）；主动变卖按账面价 80% 变现，破产时银行半价收购；出圈资金 = 月被动收入 × 100；融券做空强制平仓；期权 3 回合限制。</p>
    </div>
    <div class="modal__foot"><button class="btn btn--primary" data-close>知道了</button></div>`,
    { onMount(m){ $('[data-close]',m).onclick = U.closeModal; } });
}

function openFinanceOverview(){
  const g = Game.g;
  U.openModal(`
    <div class="modal__head"><h3>财务报表总览</h3></div>
    <div class="modal__body">
      <div class="rowlist" style="margin-bottom:14px">
        <div class="rowlist__row rowlist__row--head"><span>玩家</span><span>职业 · 状态</span></div>
        ${g.players.map(p=>`<div class="rowlist__row" data-pid="${p.id}" style="cursor:pointer">
          <span><span class="token" style="background:${p.color};display:inline-grid;vertical-align:middle">${p.icon}</span> ${esc(p.name)}</span>
          <span>${esc(p.job.name)} · ${p.out?'出局':(p.inFT?'财务自由圈':'老鼠赛跑')}</span></div>`).join('')}
      </div>
      ${g.players.map(p=>{
        const f = E.finance(p);
        return `<div class="sec">
          <div class="sec__title"><span>${esc(p.name)}</span><span>${money(f.cashflow)}/月</span></div>
          <div class="rowlist">
            <div class="rowlist__row"><span>工资</span><b>${money(f.inc.salary)}</b></div>
            <div class="rowlist__row"><span>被动收入（年）</span><b>${money(E.annual(f.passive))}</b></div>
            <div class="rowlist__row"><span>总支出</span><b>${money(f.totalExpenses)}</b></div>
            <div class="rowlist__row"><span>现金 / 净资产</span><b>${money(p.cash)} / ${money(E.netWorth(p))}</b></div>
            ${p.inFT?`<div class="rowlist__row"><span>分红收入（年·毛额）</span><b>${money(E.annual(E.ftMonthly(p)))}</b></div>`:''}
          </div></div>`;
      }).join('')}
    </div>
    <div class="modal__foot"><button class="btn btn--primary" data-close>关闭</button></div>`,
    { onMount(m){ $('[data-close]',m).onclick = U.closeModal;
      $$('[data-pid]',m).forEach(x=>x.onclick=()=>{ U.closeModal(); showPlayerDetail(+x.dataset.pid); }); } });
}

/* ------------------------------ 贷款管家 ------------------------------ */
/* 六类贷款（房贷 / 助学贷款 / 车贷 / 信用卡分期 / 其他负债 / 信用贷）统一在一处管理，
   全部支持提前还款。还款后可选两种方式，与现实中银行给的选项一致：
     · 年供不变 · 缩短期限（默认，省利息最多）
     · 期限不变 · 降低年供（减轻每年的还款压力）
   ★ 预览与实际扣款共用 Engine.prepayPlan，界面算的和账上扣的一定一致。 */
const LoanUI = { key:null, mode:'shorten' };

function loanOpBlock(g, p){
  const key = LoanUI.key;
  if(!key) return '';
  const info = E.loanInfo(p, key), t = E.loanType(key);
  if(info.balance <= 0) return '';
  const quick = [];
  if(!info.revolving && info.due > 0){
    quick.push(`<button class="btn btn--s btn--outline" data-quick="due">1 期 ${money(info.due)}</button>`);
    quick.push(`<button class="btn btn--s btn--outline" data-quick="year">12 期 ${money(info.due*12)}</button>`);
  }
  quick.push(`<button class="btn btn--s btn--outline" data-quick="all">结清全部 ${money(info.balance)}</button>`);
  const modeBar = info.revolving ? `
    <p class="hint" style="margin-top:12px">信用贷随借随还、按剩余本金计息，没有固定期数；还款后月息立即按新余额重算。</p>`
    : `<div class="segmented segmented--sm" style="margin-top:12px" id="ppMode">
        <button class="segmented__item ${LoanUI.mode==='shorten'?'segmented__item--active':''}" data-mode="shorten">年供不变 · 缩短期限</button>
        <button class="segmented__item ${LoanUI.mode==='reduce'?'segmented__item--active':''}" data-mode="reduce">期限不变 · 降低年供</button>
      </div>`;
  return `
    <div class="sec" style="border:1px solid var(--sep);border-radius:var(--r-m);padding:14px;margin-top:14px">
      <div class="sec__title"><span>${esc(info.nm)} · 提前还款</span><span>剩余本金 ${money(info.balance)}</span></div>
      <p class="hint">${esc(t.note)}${info.prepayRate ? `　违约金按提前还本额的 <b>${(info.prepayRate*100).toFixed(0)}%</b> 收取。` : '　<b>不收违约金</b>。'}</p>
      <div class="number-row">
        <div class="stepper">
          <button data-pp-minus>−</button><input id="ppAmt" type="number" value="${defaultAmt(info)}" min="0" step="1000"><button data-pp-plus>+</button>
        </div>
        ${quick.join('')}
      </div>
      ${modeBar}
      <div class="rowlist" style="margin-top:12px" id="ppPreview"></div>
      <p class="hint" id="ppMsg" hidden></p>
      <button class="btn btn--primary btn--block" data-do style="margin-top:12px">确认提前还款</button>
    </div>`;
}
function defaultAmt(info){
  if(info.revolving) return Math.max(1000, Math.round(info.balance / 4 / 100) * 100);
  const v = Math.min(info.balance, Math.max(info.due * 12, 5000));
  return Math.max(100, Math.round(v / 100) * 100);
}
/* 预览渲染：与 Engine.prepayPlan 同源，不会出现「预览一套、扣款一套」 */
function paintPreview(m, g, p){
  const box = $('#ppPreview', m), msgEl = $('#ppMsg', m), btn = $('[data-do]', m);
  if(!box) return;
  const key = LoanUI.key, info = E.loanInfo(p, key);
  const inp = $('#ppAmt', m);
  const want = Math.round(+((inp && inp.value) || 0));
  const plan = E.prepayPlan(p, key, want, LoanUI.mode);
  const row = (k, v, cls) => `<div class="rowlist__row"><span>${k}</span><b class="${cls||''}">${v}</b></div>`;
  if(!plan.ok){
    box.innerHTML = row('本次还本', money(Math.min(Math.max(0, want), info.balance)))
      + row('违约金', info.prepayRate ? `${(info.prepayRate*100).toFixed(0)}%` : '免收', 'pos');
    if(msgEl){ msgEl.hidden = false; msgEl.innerHTML = '⚠️ ' + esc(plan.msg); }
    if(btn){ btn.disabled = true; btn.textContent = '暂不可还款'; }
    return;
  }
  if(msgEl) msgEl.hidden = true;
  if(btn){ btn.disabled = false; btn.textContent = plan.cleared ? `确认结清（支付 ${money(plan.need)}）` : `确认提前还款（支付 ${money(plan.need)}）`; }
  const balBefore = money(plan.before.balance), balAfter = money(plan.after.balance);
  const dueRow = `<div class="rowlist__row"><span>每年还款</span><b>${money(E.annual(plan.before.due))} → ${plan.after.due ? money(E.annual(plan.after.due)) : '—'}</b></div>`;
  const remRow = plan.info.revolving
    ? '<div class="rowlist__row"><span>还款计划</span><b>随借随还 · 无固定期数</b></div>'
    : `<div class="rowlist__row"><span>剩余期限</span><b>${E.toYears(plan.before.remaining)} 年 → ${E.toYears(plan.after.remaining)} 年</b></div>`;
  const intRow = (plan.before.interestLeft == null)
    ? ''
    : `<div class="rowlist__row"><span>剩余利息</span><b>${money(plan.before.interestLeft)} → ${money(plan.after.interestLeft || 0)}</b></div>`;
  box.innerHTML =
      row('本次还本', money(plan.amt))
    + row(`违约金${info.prepayRate ? `（${(info.prepayRate*100).toFixed(0)}%）` : '（免收）'}`, money(plan.fee), plan.fee ? 'neg' : 'pos')
    + row('本次应付现金', money(plan.need), 'money')
    + row('剩余本金', `${balBefore} → ${balAfter}`)
    + dueRow + remRow + intRow
    + (plan.savedInterest != null ? row('可节省利息', money(plan.savedInterest), 'pos') : '');
}

/* 多头等级 → 语义色：正常 / 关注 / 较集中 / 多头 */
const MULTI_TONE = { '正常':'var(--green)', '关注':'var(--accent)', '较集中':'var(--orange)', '多头':'var(--red)' };

function openLoanCenter(key, preset){
  const g = Game.g, p = E.current(g);
  const fromCard = !!g.pending;    /* 从卡片里的「先贷款 / 贷款补足」进来时，本轮卡片还未结算 */
  if(key !== undefined) LoanUI.key = key;
  if(LoanUI.key && E.loanInfo(p, LoanUI.key).balance <= 0) LoanUI.key = null;
  /* 统一退路：贷款弹层是从卡片里顶上来的，关闭后必须把那张卡片还给玩家。
     否则会留下「没有弹层 + pending 残留」的状态 —— 掷骰禁用、结束回合隐藏，回合卡死。 */
  const backFromLoan = ()=>{
    LoanUI.key = null;
    U.closeModal();
    const gg = Game.g;
    if(gg && gg.pending && window.UiPending) window.UiPending.showPending();
    renderAll();
  };
  const startAmt = Math.max(100, Math.round((preset || 1000) / 100) * 100);
  /* 授信档案与界面读同一份判定：面板上写的额度、按钮是否可用、
     实际能借到多少，全部来自 Engine.creditProfile —— 不允许界面自己算。 */
  const cp = E.creditProfile(g, p) || { ok:false, available:0, limit:0, used:0, score:1,
    grade:{key:'—',label:'—'}, monthlyIncome:0, dtiNow:0, maxDTI:0.55, reasons:['无法评估授信。'] };
  const loans = E.LOAN_KEYS.map(k=>E.loanInfo(p, k)).filter(i=>i.balance > 0);
  const debt = loans.reduce((s2,i)=>s2+i.balance, 0);
  const dueSum = E.finance(p).loanTotal || 0;
  const rows = loans.length ? loans.map(i=>`
      <div class="rowlist__row">
        <span><b>${esc(i.nm)}</b> · 剩余 <b class="money">${money(i.balance)}</b>
          <br><span class="muted">${i.revolving
            ? `月息 ${money(i.due)}（${(i.rate*100).toFixed(2)}% / 月，年化约 ${(i.rateAnnual*100).toFixed(1)}%）· 随借随还`
            : `年供 ${money(i.dueYear)} · 月利率 ${(i.rate*100).toFixed(2)}%（年化约 ${(i.rateAnnual*100).toFixed(1)}%）· <b>剩余 ${i.remainingYears} 年</b> · 剩余利息 ${money(i.interestLeft)} · 已还 ${i.paidYears} 年`}</span></span>
        <button class="btn btn--s btn--tonal" data-pick="${i.key}">${i.canPrepay ? '提前还款' : `满 ${i.minPeriod} 期后可还`}</button>
      </div>`).join('') : '';
  U.openModal(`
    <div class="modal__head"><h3>贷款管家</h3>
      <p class="muted">六类贷款都支持提前还款；还款后可选「缩短期限」或「降低年供」（一次发薪日偿还一年）</p></div>
    <div class="modal__body">
      <div class="rowlist">
        <div class="rowlist__row"><span>手头现金</span><b class="money">${money(p.cash)}</b></div>
        <div class="rowlist__row"><span>负债合计</span><b class="money">${money(debt)}</b></div>
        <div class="rowlist__row"><span>每年还款合计</span><b class="money">${money(E.annual(dueSum))}</b></div>
      </div>

      <div class="sec__title" style="margin-top:16px">贷款明细</div>
      ${rows ? `<div class="rowlist">${rows}</div>` : '<p class="muted">当前没有未结清的贷款。</p>'}

      ${loanOpBlock(g, p)}

      <div class="sec__title" style="margin-top:18px">信用贷借款</div>
      <p class="hint">信用贷随借随还，月息 <b>${(E.loanType('bank').rate*100).toFixed(1)}%</b>（年化约 ${(E.loanType('bank').rate*12*100).toFixed(0)}%）。
        <b>额度由收入核定</b>：银行同时看「负债收入比 ≤ ${(cp.maxDTI*100).toFixed(0)}%」与
        「年收入 × ${(window.CREDIT && window.CREDIT.incomeMult || 1.2).toFixed(1)} 倍」，取较小者再乘信用系数。</p>
      <div class="rowlist">
        <div class="rowlist__row"><span>信用评级</span>
          <b style="color:${cp.ok ? 'var(--green)' : 'var(--red)'}">${cp.grade.key} · ${cp.grade.label}
          <span class="muted">（系数 ${cp.score.toFixed(2)}${cp.retired ? ' · 退休折半' : ''}${cp.deficitMonths ? ` · 入不敷出 ${cp.deficitMonths} 次` : ''}${cp.bankrupts ? ` · 破产 ${cp.bankrupts} 次` : ''}）</span></b></div>
        <div class="rowlist__row"><span>月收入 / 现有月还款</span><b>${money(cp.monthlyIncome)} / ${money(dueSum)}</b></div>
        <div class="rowlist__row"><span>负债收入比</span>
          <b class="${cp.dtiNow > cp.maxDTI ? 'neg' : ''}">${(cp.dtiNow*100).toFixed(0)}% <span class="muted">/ 上限 ${(cp.maxDTI*100).toFixed(0)}%</span></b></div>
        <div class="rowlist__row"><span>授信总额 / 已用</span><b>${money(cp.limit)} / ${money(cp.used)}</b></div>
        <div class="rowlist__row"><span>本次可借</span><b class="money">${money(cp.available)}</b></div>
      </div>
      ${cp.ok ? '' : `<p class="hint" style="color:var(--red);margin-top:8px">🚫 ${cp.reasons.map(esc).join(' ')}</p>`}

      <div class="sec__title" style="margin-top:16px">多头借贷识别</div>
      <div class="rowlist">
        <div class="rowlist__row"><span>多头等级</span>
          <b style="color:${MULTI_TONE[cp.multi.level] || 'var(--on-surface)'}">${cp.multi.level}
          <span class="muted">（授信 ×${cp.multi.mult.toFixed(2)}）</span></b></div>
        <div class="rowlist__row"><span>在贷信用类产品</span>
          <b>${cp.multi.nProducts} 种 <span class="muted">${cp.multi.products.length ? cp.multi.products.map(k => esc((E.loanType(k) || {}).nm || k)).join(' / ') : '—'}</span></b></div>
        <div class="rowlist__row"><span>近期信用贷申请</span>
          <b>${cp.multi.draws} 次 <span class="muted">/ 近 ${cp.multi.drawWindow} 回合</span></b></div>
        <div class="rowlist__row"><span>额度使用率</span>
          <b class="${cp.multi.util > 0.6 ? 'neg' : ''}">${(cp.multi.util * 100).toFixed(0)}%</b></div>
      </div>
      ${cp.multi.reasons.length ? `<p class="hint" style="color:var(--orange);margin-top:6px">⚠️ 已识别：${cp.multi.reasons.map(esc).join('；')}</p>` : ''}
      <p class="hint">多头借贷 = 同时在多个<b>信用类</b>产品上有借贷关系，是资金链紧张的最强信号 ——
        短期反复借还往往意味着「借新还旧」，风控会据此降额甚至拒贷。
        房贷 / 车贷 / 助学贷款属于正常负债，<b>不计入</b>多头。</p>

      <div class="sec__title" style="margin-top:16px">抵押物估值（动态）</div>
      <div class="rowlist">
        <div class="rowlist__row"><span>账面成本</span><b>${money(cp.appraisal.book)}</b></div>
        <div class="rowlist__row"><span>当前估值</span>
          <b class="${cp.appraisal.value >= cp.appraisal.book ? 'pos' : 'neg'}">${money(cp.appraisal.value)}
          <span class="muted">${cp.appraisal.book > 0 ? ((cp.appraisal.value / cp.appraisal.book - 1) * 100 >= 0 ? '+' : '') + ((cp.appraisal.value / cp.appraisal.book - 1) * 100).toFixed(1) + '%' : '—'}</span></b></div>
        <div class="rowlist__row"><span>可抵押净值</span><b class="money">${money(cp.collateral)}</b></div>
        <div class="rowlist__row"><span>折算规则</span>
          <b><span class="muted">房产按已付首付的权益比例；其余按处置难度 ${Math.round(((window.MARKET && window.MARKET.haircut && window.MARKET.haircut.business) || 0.4) * 100)}%—100%</span></b></div>
      </div>
      <p class="hint">银行按抵押物的<b>当前市价</b>放贷，而市价会随行情周期涨跌、资产本身也会折旧
        （房产不折旧，企业与设备约 4%/年，土地长期微涨）。
        <b>房价下行时你的可贷额度会一起缩水</b> —— 这正是现实中「抵押物不足被要求补保证金」的由来。</p>
      ${cp.appraisal.rows.length ? `<details class="appraisal-detail">
        <summary>查看 ${cp.appraisal.rows.length} 项资产的重估明细</summary>
        <div class="rowlist">
          ${cp.appraisal.rows.map(r => `<div class="rowlist__row">
            <span>${esc(r.item.nm || r.item.symbol || '资产')}</span>
            <span><span class="muted">账面 ${money(r.book)} × ${r.index.toFixed(2)}${r.years > 0 ? ' × 折旧 ' + r.decay.toFixed(2) : ''}</span>
            <b>${money(r.value)}</b></span>
          </div>`).join('')}
        </div>
      </details>` : '<p class="hint">目前没有可抵押的资产。</p>'}
      <div class="number-row">
        <div class="stepper">
          <button data-minus ${cp.ok?'':'disabled'}>−</button><input id="loanAmt" type="number" value="${Math.min(startAmt, Math.max(0, cp.available))}" min="100" step="100" ${cp.ok?'':'disabled'}><button data-plus ${cp.ok?'':'disabled'}>+</button>
        </div>
        ${[1000,5000,10000,20000].filter(v=>v<=cp.available).map(v=>`<button class="btn btn--s btn--outline" data-set="${v}">${money(v)}</button>`).join('')}
      </div>
      ${fromCard ? `<p class="hint" style="margin-top:12px">🔙 本轮卡片尚未结算，完成或关闭后将自动返回刚才的决策。</p>` : ''}
    </div>
    <div class="modal__foot">
      <button class="btn btn--text" data-close>关闭</button>
      <button class="btn btn--primary" data-loan ${cp.ok?'':'disabled'}>${cp.ok ? '确认借款' : '当前无法授信'}</button>
    </div>`,
    { onDismiss: backFromLoan,                    /* ESC / 点遮罩同样回到卡片 */
      onMount(m){
      const input = $('#loanAmt',m);
      $('[data-minus]',m).onclick = ()=>{ input.value = Math.max(100, (+input.value)-100); };
      $('[data-plus]',m).onclick  = ()=>{ input.value = (+input.value)+100; };
      $$('[data-set]',m).forEach(b=>b.onclick=()=>{ input.value = b.dataset.set; });
      $('[data-close]',m).onclick = backFromLoan;
      $('[data-loan]',m).onclick = ()=>{
        const r = A.takeLoan(g, Math.round(+input.value||0));
        if(!r.ok) return U.toast(r.msg,'err');
        backFromLoan();
        U.toast('贷款到账','ok');
      };
      /* 选中某笔贷款 → 展开操作区 */
      $$('[data-pick]',m).forEach(b=>b.onclick = ()=>{
        LoanUI.key = b.dataset.pick;
        openLoanCenter(LoanUI.key);
      });
      const ppInput = $('#ppAmt', m);
      if(ppInput){
        const upd = ()=> paintPreview(m, g, p);
        paintPreview(m, g, p);
        ppInput.oninput = upd;
        $('[data-pp-minus]',m).onclick = ()=>{ ppInput.value = Math.max(0, (+ppInput.value)-1000); upd(); };
        $('[data-pp-plus]',m).onclick  = ()=>{ ppInput.value = (+ppInput.value)+1000; upd(); };
        $$('[data-quick]',m).forEach(b=>b.onclick=()=>{
          const info = E.loanInfo(p, LoanUI.key);
          const v = b.dataset.quick === 'all' ? info.balance
                  : b.dataset.quick === 'year' ? info.due*12 : info.due;
          ppInput.value = Math.round(v);
          upd();
        });
        $$('[data-mode]',m).forEach(b=>b.onclick=()=>{
          LoanUI.mode = b.dataset.mode;
          $$('#ppMode .segmented__item', m).forEach(x=>x.classList.toggle('segmented__item--active', x===b));
          upd();
        });
        $('[data-do]',m).onclick = ()=>{
          const plan = E.prepayPlan(p, LoanUI.key, Math.round(+ppInput.value||0), LoanUI.mode);
          if(!plan.ok) return U.toast(plan.msg, 'err');
          const r = A.prepayLoan(g, LoanUI.key, plan.amt, LoanUI.mode);
          if(!r.ok) return U.toast(r.msg, 'err');
          renderAll();
          U.toast(r.cleared
            ? `${E.loanType(r.key||LoanUI.key).nm}已结清，每年还款减少 ${money(E.annual(r.before.due))}`
            : `已提前还款 ${money(r.principal)}${r.fee ? `（含违约金 ${money(r.fee)}）` : ''}，${r.mode === 'reduce' ? `年还款降至 ${money(E.annual(r.after.due))}` : `剩余期限缩短至 ${E.toYears(r.after.remaining)} 年`}`
            + (r.savedInterest ? `，节省利息 ${money(r.savedInterest)}` : ''), 'ok');
          openLoanCenter(LoanUI.key);
        };
      }
    }});
}
/* 兼容旧调用名（资金不足面板会用它并代入缺口金额） */
function openLoan(preset){ LoanUI.key = null; LoanUI.mode = 'shorten'; openLoanCenter(null, preset); }

function openTrade(){
  const g = Game.g, p = E.current(g);
  const others = g.players.filter(x=>x.id!==p.id && !x.out);
  U.openModal(`
    <div class="modal__head"><h3>玩家间交易</h3></div>
    <div class="modal__body">
      <p class="hint">玩家之间可随时进行资产买卖和投资卡转让。抽到但买不起的投资卡，可以卖给其他玩家换取现金。</p>
      <div class="sec__title" style="margin-top:12px">我的资产（卖出）</div>
      <div id="myAssets"></div>
      <div class="sec__title" style="margin-top:12px">对方资产（买入）</div>
      <div id="otherAssets"></div>
    </div>
    <div class="modal__foot">
      <button class="btn btn--text" data-cash>现金转账</button>
      <button class="btn btn--primary" data-close>关闭</button>
    </div>`,
    { onMount(m){
      const list = (who, pid)=>{
        const pl = who==='me' ? p : null;
        const items = [];
        if(pl){
          pl.assets.stocks.forEach((s,i)=>items.push({t:`${s.symbol} ${s.shares} 股`, side:'me', kind:'stock', i, v:s.shares*s.cost}));
          pl.assets.realEstate.forEach((r,i)=>items.push({t:r.nm, side:'me', kind:'realestate', i, v:r.dp}));
          pl.assets.business.forEach((b,i)=>items.push({t:b.nm, side:'me', kind:'business', i, v:b.cost}));
        }
        if(!items.length) return '<p class="muted">暂无。</p>';
        return '<div class="rowlist">' + items.map(x=>`<div class="rowlist__row"><span>${esc(x.t)}（成本 ${money(x.v)}）</span>
          <button class="btn btn--s btn--outline" data-sell="${x.kind}:${x.i}">出售</button></div>`).join('') + '</div>';
      };
      $('#myAssets',m).innerHTML = list('me');
      $('#otherAssets',m).innerHTML = others.length
        ? others.map(o=>`<div class="pcard" style="margin-bottom:8px;border-left-color:${o.color}">
            <div class="pcard__top"><span class="token" style="background:${o.color}">${o.icon}</span>
            <span class="pcard__name">${esc(o.name)}</span><span class="pcard__tag">现金 ${money(o.cash)}</span></div>
            <div class="pcard__jet"></div></div>`).join('')
        : '<p class="muted">暂无其他玩家。</p>';
      $$('[data-sell]',m).forEach(b=>b.onclick=()=>{
        const [kind,i] = b.dataset.sell.split(':');
        sellAssetDialog(p, kind, +i);
      });
      $('[data-cash]',m).onclick = ()=> cashTransferDialog();
      $('[data-close]',m).onclick = U.closeModal;
    }});
}
function sellAssetDialog(p, kind, i){
  const g = Game.g;
  const others = g.players.filter(x=>x.id!==p.id && !x.out);
  if(!others.length) return U.toast('没有其他玩家可以购买','err');
  let item, value;
  if(kind==='stock'){ item = p.assets.stocks[i]; value = item.shares*item.cost; }
  if(kind==='realestate'){ item = p.assets.realEstate[i]; value = item.dp; }
  if(kind==='business'){ item = p.assets.business[i]; value = item.cost; }
  const nm = item.symbol ? `${item.symbol} ${item.shares} 股` : item.nm;
  U.openModal(`
    <div class="modal__head"><h3>出售：${esc(nm)}</h3></div>
    <div class="modal__body">
      <p class="hint">资产账面价值 ${money(value)}。选择买家与成交价（双方自愿）。</p>
      <div class="picklist">
        ${others.map(o=>`<button class="pick" data-oid="${o.id}"><span class="pick__ico">${o.icon}</span>
          <span><span class="pick__t">${esc(o.name)}</span><span class="pick__d">现金 ${money(o.cash)}</span></span>
          <span class="pick__go">›</span></button>`).join('')}
      </div>
      <div class="sec__title">成交价</div>
      <div class="number-row">
        <div class="stepper"><button data-minus>−</button><input id="tradePrice" type="number" value="${Math.round(value)}" step="100"><button data-plus>+</button></div>
      </div>
    </div>
    <div class="modal__foot"><button class="btn btn--text" data-close>取消</button></div>`,
    { onMount(m){
      const inp = $('#tradePrice',m);
      $('[data-minus]',m).onclick=()=>inp.value=Math.max(0,(+inp.value)-100);
      $('[data-plus]',m).onclick=()=>inp.value=(+inp.value)+100;
      $('[data-close]',m).onclick=U.closeModal;
      $$('[data-oid]',m).forEach(b=>b.onclick=()=>{
        const buyer = g.players[+b.dataset.oid];
        const price = Math.round(+inp.value||0);
        if(buyer.cash < price) return U.toast(`${buyer.name} 现金不足`,'err');
        buyer.cash -= price; p.cash += price;
        if(kind==='stock'){ buyer.assets.stocks.push(item); p.assets.stocks.splice(i,1); }
        if(kind==='realestate'){ buyer.assets.realEstate.push(item); p.assets.realEstate.splice(i,1); }
        if(kind==='business'){ buyer.assets.business.push(item); p.assets.business.splice(i,1); }
        E.log(g, `${p.name} 以 ${money(price)} 将 ${nm} 出售给 ${buyer.name}`, 'info');
        U.closeModal(); renderAll(); U.toast('交易完成','ok');
      });
    }});
}
function cashTransferDialog(){
  const g = Game.g, p = E.current(g);
  const others = g.players.filter(x=>x.id!==p.id && !x.out);
  if(!others.length) return U.toast('没有其他玩家','err');
  U.openModal(`
    <div class="modal__head"><h3>现金转账</h3></div>
    <div class="modal__body">
      <div class="picklist">${others.map(o=>`<button class="pick" data-oid="${o.id}">
        <span class="pick__ico">${o.icon}</span><span><span class="pick__t">${esc(o.name)}</span>
        <span class="pick__d">现金 ${money(o.cash)}</span></span><span class="pick__go">›</span></button>`).join('')}</div>
      <div class="sec__title">金额</div>
      <div class="stepper"><button data-minus>−</button><input id="cashAmt" type="number" value="1000" step="100"><button data-plus>+</button></div>
    </div>
    <div class="modal__foot"><button class="btn btn--text" data-close>取消</button></div>`,
    { onMount(m){
      const inp = $('#cashAmt',m);
      $('[data-minus]',m).onclick=()=>inp.value=Math.max(0,(+inp.value)-100);
      $('[data-plus]',m).onclick=()=>inp.value=(+inp.value)+100;
      $('[data-close]',m).onclick=U.closeModal;
      $$('[data-oid]',m).forEach(b=>b.onclick=()=>{
        const to = g.players[+b.dataset.oid];
        const r = A.trade(g, p.id, to.id, Math.round(+inp.value||0), '玩家协商');
        if(r.ok) U.toast('转账完成','ok');
        U.closeModal(); renderAll();
      });
    }});
}

/* 202：融券做空 / 期权操作面板 */
function openShortPanel(){
  const g = Game.g, p = E.current(g);
  const prices = p.stockPrice||{};
  U.openModal(`
    <div class="modal__head"><h3>融券做空 / 期权操作</h3></div>
    <div class="modal__body">
      <p class="hint">融券做空<b>不需要支付现金</b>（券源由券商提供），但一旦出现该标的的行情报价，<b>无论价格如何都必须强制买回平仓</b>。做空可在任意时机操作。可做空标的：${SHORTABLE.join(' / ')}。</p>
      <div class="sec__title" style="margin-top:12px">最近市场报价</div>
      <div class="rowlist">
        ${SHORTABLE.map(s=>`<div class="rowlist__row"><span>${s}</span><b>${prices[s]!==undefined?money(prices[s]):'暂无报价'}</b></div>`).join('')}
      </div>
      <div class="sec__title" style="margin-top:12px">建立空头</div>
      <div class="number-row">
        <div class="stepper"><button data-minus>−</button><input id="shQty" type="number" value="100" step="100"><button data-plus>+</button></div>
        ${SHORTABLE.map(s=>`<button class="btn btn--s btn--outline" data-short="${s}">做空 ${s}</button>`).join('')}
      </div>
      ${p.shorts.length?`<div class="sec__title" style="margin-top:14px">当前空头</div>
        <div class="rowlist">${p.shorts.map(s=>`<div class="rowlist__row"><span>${s.symbol} ${s.shares} 股 @ ${money(s.price)}</span>
        <button class="btn btn--s btn--outline" data-cover="${s.symbol}">平仓</button></div>`).join('')}</div>`:''}
      ${p.options.length?`<div class="sec__title" style="margin-top:14px">持有期权（3 回合限制）</div>
        <div class="rowlist">${p.options.map(o=>`<div class="rowlist__row"><span>${esc(o.label)}</span>
        <button class="btn btn--s btn--outline" data-ex="${o.id}">行权</button></div>`).join('')}</div>`:''}
    </div>
    <div class="modal__foot"><button class="btn btn--primary" data-close>关闭</button></div>`,
    { onMount(m){
      const inp = $('#shQty',m);
      $('[data-minus]',m).onclick=()=>inp.value=Math.max(100,(+inp.value)-100);
      $('[data-plus]',m).onclick=()=>inp.value=(+inp.value)+100;
      $('[data-close]',m).onclick=U.closeModal;
      $$('[data-short]',m).forEach(b=>b.onclick=()=>{
        const r = A.openShort(g, b.dataset.short, Math.round(+inp.value||0));
        if(!r.ok) return U.toast(r.msg,'err');
        U.closeModal(); renderAll(); U.toast('已建立空头','ok');
      });
      $$('[data-cover]',m).forEach(b=>b.onclick=()=>{
        const r = A.coverShort(g, b.dataset.cover);
        if(!r.ok) return U.toast(r.msg,'err');
        U.closeModal(); renderAll();
      });
      $$('[data-ex]',m).forEach(b=>b.onclick=()=>{
        const r = A.exerciseOption(g, b.dataset.ex);
        if(!r.ok) return U.toast(r.msg,'err');
        U.closeModal(); renderAll(); U.toast('行权完成','ok');
      });
    }});
}

/* ------------------------------ 胜利 ------------------------------ */
function winnerModal(){
  const g = Game.g;
  if(E.isSolo(g) && g.soloResult) return soloResultModal(g);
  return winnerModalMulti(g);
}
function winnerModalMulti(g){
  const p = (g.winner != null) ? g.players[g.winner] : null;   /* 全员破产时为 null */
  U.openModal(`
    <div class="modal__head"><h3 class="crown">${p ? '🏆 游戏结束' : '🏁 游戏结束'}</h3></div>
    <div class="modal__body">
      <div class="winner">
        <div class="winner__ico">${p ? p.icon : '💀'}</div>
        <div class="winner__name" ${p?`style="color:${p.color}"`:''}>${p ? esc(p.name) : '无人获胜'}</div>
        <p class="muted">${p ? esc(p.msg||'') : '全部玩家均已破产出局'}</p>
        <p class="hint">${esc(g.winReason)}</p>
      </div>
      <div class="sec__title" style="margin-top:16px">最终战绩</div>
      <div class="rowlist">
        <div class="rowlist__row rowlist__row--head"><span>玩家</span><span>现金 / 年结余 / 净资产</span></div>
        ${g.players.slice().sort((a,b)=>E.netWorth(b)-E.netWorth(a)).map(x=>{
          const f = E.finance(x);
          return `<div class="rowlist__row"><span>${x.icon} ${esc(x.name)}${p && x.id===p.id?' 🏆':''}${x.out?'（出局）':''}</span>
          <span>${money(x.cash)} / ${money(f.cashflow)} / ${money(E.netWorth(x))}</span></div>`;
        }).join('')}
      </div>
    </div>
    <div class="modal__foot">
      <button class="btn btn--text" data-close>查看棋盘</button>
      <button class="btn btn--tonal" data-export>⬇️ 导出分析</button>
      <button class="btn btn--tonal" data-restart>再来一局</button>
      <button class="btn btn--primary" data-summary>📊 查看复盘报告</button>
    </div>`,
    { onMount(m){
      $('[data-close]',m).onclick = U.closeModal;
      $('[data-restart]',m).onclick = ()=>{ U.closeModal(); onMenu('restart'); };
      /* 年龄模式结束后最自然的导出入口 —— 先把分析拿走，再决定要不要细看复盘 */
      $('[data-export]',m).onclick = ()=>{
        try{
          const S = window.UiSummary;
          S.download(S.exportName(g, 'md'), S.exportMarkdown(g), 'text/markdown');
          U.toast(`已导出全部 ${g.players.length} 位参与者的分析报告`, 'ok');
        }catch(e){ U.toast('导出失败：' + e.message, 'err'); }
      };
      $('[data-summary]',m).onclick = ()=>{
        U.closeModal();
        window.UiSummary.openSummary(p ? p.id : null);   /* 全员破产时给当前玩家出报告 */
      };
    }});
}

/* 单人模式的结算页：不排名次，只回答「这一生走到了哪一步」。
   评级 / 结局 / 达成时间 / 关键数字全部读自 g.soloResult（引擎算一次，界面只展示）。 */
const SOLO_TONE = { S:'var(--green)', A:'var(--green)', B:'var(--accent)',
                    C:'var(--orange)', D:'var(--orange)', F:'var(--red)' };
function soloResultModal(g){
  const S = g.soloResult, p = g.players[0];
  const tone = SOLO_TONE[S.grade] || 'var(--accent)';
  const f = E.finance(p), cls = E.socialClassOf(g, p);
  const reached = S.endAgeNow >= S.endAge;
  return U.openModal(`
    <div class="modal__head"><h3>${S.win ? '🏆 人生结算' : '🏁 人生结算'}</h3></div>
    <div class="modal__body">
      <div class="solo-hero" style="--sc:${tone}">
        <div class="solo-hero__grade">${esc(S.grade)}</div>
        <div class="solo-hero__t">
          <b style="color:${tone}">${esc(S.label)}</b>
          <small>${reached ? `走完 ${g.startAge}—${g.endAge} 岁，共 ${E.maxRounds(g)} 轮` : `人生在 ${S.endAgeNow} 岁提前结束`}</small>
        </div>
      </div>
      <p class="hint" style="margin-top:10px">${esc(S.reason)}</p>

      <div class="sec__title" style="margin-top:16px">关键时间点</div>
      <div class="rowlist">
        <div class="rowlist__row"><span>跳出老鼠赛跑</span><b>${S.escapeAge != null ? S.escapeAge + ' 岁' : '未出圈'}</b></div>
        <div class="rowlist__row"><span>实现梦想</span><b>${S.dreamAge != null ? S.dreamAge + ' 岁' : '未达成'}</b></div>
        <div class="rowlist__row"><span>人生赢家门槛</span><b>${S.winAge} 岁前</b></div>
        <div class="rowlist__row"><span>结束时间</span><b>${S.endAgeNow} 岁 · 第 ${S.endRound} 轮</b></div>
      </div>

      <div class="sec__title" style="margin-top:16px">最终状态</div>
      <div class="rowlist">
        <div class="rowlist__row"><span>社会等级</span><b>L${S.lv} · ${esc(S.levelName)}</b></div>
        <div class="rowlist__row"><span>被动收入覆盖度</span><b>${Math.round(S.cover * 100)}%（年被动 ${money(E.annual(S.passive))} / 年门槛 ${money(E.annual(S.target))}）</b></div>
        <div class="rowlist__row"><span>净资产</span><b>${money(S.netWorth)}</b></div>
        <div class="rowlist__row"><span>年结余</span><b class="${E.settleCashflow(p) < 0 ? 'neg' : ''}">${money(E.annual(E.settleCashflow(p)))}</b></div>
        <div class="rowlist__row"><span>退休状态</span><b>${p.retired ? '已退休 · 领取养老金' : '尚未退休'}</b></div>
        <div class="rowlist__row"><span>健康危机 / 失业</span><b>${num(p.stats.crises)} 次 / ${num(p.stats.downsized)} 次</b></div>
      </div>
      ${cls.lv < 6 ? `<p class="hint" style="margin-top:10px">距 L6 财务自由还差
        <b>${money(E.annual(Math.max(0, cls.target - cls.passive)))}</b> 的年被动收入 ——
        这正是本局最值得复盘的差距。</p>` : ''}
    </div>
    <div class="modal__foot">
      <button class="btn btn--text" data-close>查看棋盘</button>
      <button class="btn btn--tonal" data-export>⬇️ 导出分析</button>
      <button class="btn btn--tonal" data-restart>再来一局</button>
      <button class="btn btn--primary" data-summary>📊 查看复盘报告</button>
    </div>`,
    { onMount(m){
      $('[data-close]', m).onclick = U.closeModal;
      $('[data-restart]', m).onclick = ()=>{ U.closeModal(); onMenu('restart'); };
      $('[data-export]', m).onclick = ()=>{
        try{
          const Su = window.UiSummary;
          Su.download(Su.exportName(g, 'md'), Su.exportMarkdown(g), 'text/markdown');
          U.toast('已导出本局分析报告', 'ok');
        }catch(e){ U.toast('导出失败：' + e.message, 'err'); }
      };
      $('[data-summary]', m).onclick = ()=>{ U.closeModal(); window.UiSummary.openSummary(p.id); };
    }});
}
function num(v){ return Math.round(v || 0); }

/* ------------------------------ 健康危机提示 ------------------------------ */
/* 精力归零触发。这里要把「怎么变成这样的」讲清楚，并给出可执行的恢复路径，
   否则玩家只会觉得是一次无妄之灾。 */
/* 退休是人生里最大的一次收入断崖（收入腰斩）：必须明确告诉玩家
   「为什么收入突然少了一半」，否则只会觉得游戏莫名其妙地扣钱。
   与 crisisNotice 同构：一次性提示 + shown 标记防重复。 */
function retireNotice(g){
  const r = g.lastRetire;
  if(!r || r.shown) return false;
  r.shown = true;
  const p = g.players[0];
  if(!p) return false;
  const ratio = Math.round((window.SOLO.pensionRatio || 0.45) * 100);
  U.openModal(`
    <div class="modal__head"><h3>🏖️ ${E.ageOf(g)} 岁 · 退休结算</h3></div>
    <div class="modal__body">
      <p class="hint">工资停发，从这一刻起你靠<b>养老金</b>与<b>被动收入</b>生活 ——
        这是「只靠劳动收入」的人生必然遇到的那道台阶。</p>
      <div class="sec__total"><span>退休前补结（${r.years} 年 · 在职口径）</span>
        <span class="money ${r.deficit > 0 ? 'neg' : 'pos'}">${r.amount >= 0 ? '+' : ''}${money(r.amount)}</span></div>
      <div class="sec__total"><span>此后每月主动收入</span><span>${money(p.salary)}（养老金 · 替代率 ${ratio}%）</span></div>
      <div class="sec__total"><span>每月缺口 / 结余</span>
        <span class="money ${E.finance(p).cashflow < 0 ? 'neg' : 'pos'}">${money(E.finance(p).cashflow)}</span></div>
      ${r.deficit > 0 ? `<p class="hint" style="margin-top:8px">⚠️ 退休前还有 <b>${money(r.deficit)}</b> 的缺口需要先补上 ——
        这笔账属于退休前的最后几年，按<b>在职</b>时的收支口径结算。</p>` : ''}
      <p class="hint" style="margin-top:8px"><b>退休后不再有求职这条路。</b>
        此后是资产在养活你，而不是你在养活资产。</p>
    </div>
    <div class="modal__foot"><button class="btn btn--primary btn--block" data-ok>我知道了</button></div>`,
    { onDismiss: ()=> U.closeModal(),
      onMount(m){ $('[data-ok]',m).onclick = ()=> U.closeModal(); } });
  return true;
}

function crisisNotice(g){
  /* 注意：危机属于【刚结束回合的那位玩家】，不一定是新的当前玩家 ——
     所以按 c.by 取人，而不是用 E.current(g)。 */
  const c = g.lastCrisis;
  /* ⚠️ 必须用 == null 判断：玩家 id 从 0 开始，!c.by 会把「第一位玩家」误判成「没有触发者」 */
  if(!c || c.shown || c.by == null) return false;
  const p = g.players[c.by];
  if(!p) return false;
  c.shown = true;
  U.openModal(`
    <div class="modal__head"><h3>🩺 ${esc(p.name)} 精力耗尽 · 健康危机</h3></div>
    <div class="modal__body">
      <p class="hint">长期高强度投入终于拖垮了身体 —— 这是现实中过劳的真实代价，也是精力机制存在的意义。</p>
      <div class="sec__total"><span>强制休养</span><span>${c.rest} 个回合</span></div>
      <div class="sec__total"><span>每月新增医疗支出</span><span class="neg">${money(c.medical)}</span></div>
      <div class="sec__total"><span>精力</span><span>恢复到 ${c.energy}（上限的一半）</span></div>
      <p class="hint" style="margin-top:8px">医疗支出将持续到康复为止（约半年），期间精力恢复速度减半。<br>
        <b>下一步：减持需要打理的资产（房产 / 企业 / 期权），或停在「起点」选择休假。</b></p>
    </div>
    <div class="modal__foot"><button class="btn btn--primary btn--block" data-ok>我知道了</button></div>`,
    { onDismiss: ()=> U.closeModal(),
      onMount(m){ $('[data-ok]',m).onclick = ()=> U.closeModal(); } });
  return true;
}

/* ------------------------------ 暂停回合提示 ------------------------------ */
/* 「暂停回合」= 回合仍然轮到你，但本回合不能掷骰 / 交易 / 借贷。
   必须有明确的提示与交棒按钮，否则玩家会以为「游戏没换人、另一个人还在行动」。 */
function pauseNotice(g){
  const p = E.current(g);
  if(!p || g.over || p.out || !p.pausedThisTurn || p.pausedNotified) return false;
  p.pausedNotified = true;
  U.openModal(`
    <div class="modal__head"><h3>⏸ ${esc(p.name)} 本回合暂停</h3></div>
    <div class="modal__body">
      <p class="hint">健康危机让 <b>${esc(p.name)}</b> 需要休养 —— 本回合仍然轮到你，但不能掷骰、买卖或借贷。</p>
      <div class="sec__total"><span>本回合</span><span>暂停（不能行动）</span></div>
      <div class="sec__total"><span>此后还需暂停</span><span>${p.skipTurns} 个回合</span></div>
      <p class="hint">点下方按钮把回合交给下一位，轮转不会跳过任何人。</p>
    </div>
    <div class="modal__foot">
      <button class="btn btn--primary btn--block" data-pass>交给下一位 →</button>
    </div>`,
    { onDismiss: ()=> U.closeModal(),
      onMount(m){ $('[data-pass]',m).onclick = ()=>{ U.closeModal(); endTurn(); }; } });
  return true;
}

/* ------------------------------ 复盘报告触发 ------------------------------ */
/* 玩家出局（破产 / 认输 / 被买断）→ 自动生成该玩家的整局复盘；同一位玩家只自动弹一次。
   ⚠️ 必须带 p.out 判断：否则每个玩家每次结束回合都会误弹一份报告，还会吃掉交接提示。 */
function reportIfNeeded(p){
  if(!p || !p.out || p.reportShown || !window.UiSummary) return false;
  p.reportShown = true;
  window.UiSummary.openSummary(p.id);
  return true;
}
/* 主动认输：与破产不同，不清算资产，退出后立刻生成复盘 */
function surrenderFlow(){
  const g = Game.g;
  if(!g) return;
  if(g.over) return U.toast('本局已经结束', 'err');
  const p = E.current(g);
  U.confirmBox('主动认输',
    `你将退出本局（<b>${esc(p.name)}</b>），资产与负债完整保留，最终按净资产计入排名。` +
    `<br><span class="muted">与破产的区别：认输不做半价清算，因此不损失资产价值。确认后立即生成这一局的复盘报告。</span>`,
    '确认认输', ()=>{
      const r = E.surrender(g, p);
      if(!r.ok) return U.toast(r.msg, 'err');
      Game.rolled = false;
      E.clearPending(g);
      p.reportShown = true;
      renderAll();
      if(g.over){ winnerModal(); return; }
      window.UiSummary.openSummary(p.id);
    }, true);
}

/* ------------------------------ 绑定 ------------------------------ */
function bind(){
  /* 主/次按钮的语义随局面切换（掷骰 / 结束回合 / 再来一局 / 查看战绩），这里按状态分发 */
  $('#btnRoll').onclick = ()=>{ if(Game.g && Game.g.over) return resetGame(); roll(); };
  $('#btnEndTurn').onclick = ()=>{ if(Game.g && Game.g.over) return winnerModal(); endTurn(); };
  $('#btnDiceChoice').onclick = ()=>{
    const p = E.current(Game.g);
    p.diceChoice = (p.diceChoice === window.WINGS.dice) ? 1 : window.WINGS.dice;
    renderAll();
  };
  const huntBtn = $('#btnJobHunt');
  if(huntBtn) huntBtn.onclick = ()=>{
    const g = Game.g;
    if(!g || g.over || Game.animating) return;
    if(g.pending) return U.toast('请先处理当前卡片', 'err');
    const r = A.huntJob(g);
    if(!r.ok) return U.toast(r.msg, 'err');
    U.toast(r.done
      ? `🎉 重新就业成功！工资恢复为 ${money(r.salary)}`
      : `投递完成（求职进度 ${r.progress}/${r.need}），消耗 ${r.energy} 点精力`, r.done ? 'ok' : 'info');
    renderAll();
  };
  /* 切后台 / 关页面时强制落盘，避免合并写入还没触发就丢了最后一步 */
  window.addEventListener('beforeunload', saveState);
  window.addEventListener('pagehide', saveState);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) saveState(); });
}
window.UiGame = { Game, startGame, resetGame, tryRestore, saveState, renderAll, roll, endTurn, onMenu, bind, finishRoll, renderCenter,
  showPlayerDetail, openHelp, openLoan, openLoanCenter, updateActions, openShortPanel, winnerModal, bizOfSpace, p_inFT,
  syncBoardView, resetBoardView, curCircle, bothCircles, pauseNotice, crisisNotice,
  reportIfNeeded, surrenderFlow, retireNotice };
})();
