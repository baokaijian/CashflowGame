/* ==========================================================================
   ui-game.js — 主界面：棋盘、玩家、财务/日志/规则/设置面板、回合流程
   ========================================================================== */
(function(){
'use strict';
const E = window.Engine, A = window.Act, U = window.UI;
const $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;

const Game = { g:null, boardView:'ratrace', rolled:false, animating:false };
window.Game = Game;

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
  Game.boardView = data.boardView || (E.current(Game.g).inFT ? 'fasttrack' : 'ratrace');
  lastCanEnd = false; healedPending = null;
  $('#setupScreen').hidden = true;
  renderAll();
  U.toast(Game.g.over ? '已恢复上次对局（本局已结束）' : '已恢复上次的对局进度', 'ok');
  return true;
}

/* ------------------------------ 开局 ------------------------------ */
function startGame(cfg){
  Game.g = E.newGame(cfg);
  Game.boardView = 'ratrace';
  Game.rolled = false;
  lastCanEnd = false; healedPending = null;
  $('#setupScreen').hidden = true;
  E.beginTurn(Game.g);
  U.activeTab('finance');
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
    Game.g = null; Game.rolled = false; Game.animating = false; Game.boardView = 'ratrace';
    $('#setupScreen').hidden = false;
    $('#die1').textContent = '–'; $('#die2').hidden = true;
    renderAllReset();
  };
  U.confirmBox('重置游戏',
    '将清空当前对局与本地存档，并回到开始页面。<br><span class="muted">此操作不可撤销。</span>',
    '重置游戏', doReset, true);
}

/* ------------------------------ 总渲染 ------------------------------ */
function renderAll(){
  if(!Game.g) return;
  renderBoard(); renderPlayers(); renderFinance(); renderLog(); renderRules(); renderSettings(); updateActions();
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
  $('#boardSub').textContent  = isFT ? '掷 2 粒骰子前进 · 企业格只能用现金购买（不允许贷款）' : '掷 1 粒骰子前进，停下来执行格子的操作';
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
      <div class="bc-stat"><span class="bc-stat__k">当前玩家</span><b style="color:${cur.color}">${esc(cur.name)}</b></div>
      <div class="bc-stat"><span class="bc-stat__k">手头现金</span><b>${money(cur.cash)}</b></div>
      <div class="bc-stat"><span class="bc-stat__k">月现金流</span><b class="${E.finance(cur).cashflow<0?'neg':''}">${money(E.finance(cur).cashflow)}</b></div>
      ${cur.inFT
        ? `<div class="bc-stat"><span class="bc-stat__k">财务自由圈月现金流</span><b>${money(E.ftMonthly(cur))}</b></div>
           <div class="bc-stat"><span class="bc-stat__k">企业累计增加</span><b>${money(cur.ftGain||0)}<i> / ¥50,000</i></b></div>`
        : `<div class="bc-stat"><span class="bc-stat__k">被动收入</span><b>${money(esc_.passive)}<i> / 门槛 ${money(esc_.target)}</i></b></div>`}
    </div>
    <button class="btn btn--s btn--outline" id="btnSwapBoard">${isFT ? '查看内圈' : '查看财务自由圈'}</button>`;
  $('#btnSwapBoard').onclick = ()=>{ Game.boardView = isFT ? 'ratrace' : 'fasttrack'; renderBoard(); };
}

/* ------------------------------ 玩家列表 ------------------------------ */
function renderPlayers(){
  const g = Game.g, cur = E.current(g);
  const host = $('#playerList');
  host.innerHTML = '';
  g.players.forEach(p=>{
    const f = E.finance(p), pr = E.escapeProgress(g, p);
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
      <div class="pcard__job">${p.job.ico} ${esc(p.job.name)} · 孩子 ${p.children}</div>
      <div class="pcard__grid">
        <div>现金 <b>${money(p.cash)}</b></div>
        <div>月现金流 <b class="${f.cashflow<0?'neg':''}">${money(f.cashflow)}</b></div>
        <div>被动收入 <b>${money(f.passive)}</b></div>
        <div>净资产 <b>${money(E.netWorth(p))}</b></div>
      </div>
      ${p.inFT ? `<div class="progress"><div class="progress__bar" style="width:${Math.min(100,(p.ftGain||0)/500)}%"></div></div>`
               : `<div class="progress"><div class="progress__bar" style="width:${Math.round(pr.pct*100)}%"></div></div>`}`;
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
            <div class="rowlist__row"><span>月现金流</span><b>${money(E.finance(p).cashflow)}</b></div>
            <div class="rowlist__row"><span>被动收入</span><b>${money(E.finance(p).passive)}</b></div>
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
  host.innerHTML = `
    <div class="fin-head">
      <span class="token token--big" style="background:${p.color}">${p.icon}</span>
      <div><h3>${esc(p.name)}</h3><p class="muted">${p.job.ico} ${esc(p.job.name)} · 第 ${g.round} 轮 · ${p.inFT?'财务自由圈':'老鼠赛跑'}</p></div>
    </div>
    <div class="sec">
      <div class="sec__total"><span>手头现金</span><span class="money">${money(p.cash)}</span></div>
      <div class="sec__total"><span>月现金流</span><span class="money ${f.cashflow<0?'neg':''}">${money(f.cashflow)}</span></div>
      ${p.inFT
        ? `<div class="sec__total" style="background:var(--secondary-container);color:var(--secondary)"><span>财务自由圈月现金流</span><span class="money">${money(E.ftMonthly(p))}</span></div>`
        : `<div class="sec__total" style="background:var(--secondary-container);color:var(--secondary)"><span>被动收入</span><span class="money">${money(f.passive)}</span></div>
           <div class="sec__title" style="margin-top:10px"><span>出圈进度（${g.rule==='202'?'被动收入 ＞ 支出×2':'被动收入 ＞ 支出'}）</span><span>${money(pr.passive)} / ${money(pr.target)}</span></div>
           <div class="progress"><div class="progress__bar" style="width:${Math.round(pr.pct*100)}%"></div></div>`}
      ${p.charityTurns>0?`<p class="hint" style="margin-top:8px">🎗️ 慈善加成剩余 ${p.charityTurns} 轮，可选择掷 1—2 粒骰子。</p>`:''}
      ${p.skipTurns>0?`<p class="hint" style="margin-top:8px">⏸️ 暂停回合剩余 ${p.skipTurns} 轮。</p>`:''}
    </div>
    <div class="fin-cols">
      <div>${U.renderIncome(p)}</div>
      <div>
        <div class="sec"><div class="sec__title">资产</div>${U.renderAssets(p)}</div>
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
      <div class="rulelist__row"><div>出圈条件</div><div>${g.rule==='202'?'被动收入 ＞ 总支出 × 2':'被动收入 ＞ 总支出'}</div></div>
      <div class="rulelist__row"><div>骰子</div><div>内圈 1 粒 / 财务自由圈 2 粒</div></div>
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
    <h4>回合流程</h4>
    <ul>
      <li>内圈掷 1 粒骰子（财务自由圈掷 2 粒），移动棋子。</li>
      <li>经过或停在<b>发薪日</b>：领取月现金流（收入 − 支出）。</li>
      <li><b>投资机会格</b>：抽投资卡，决定是否买入；资金不足可把投资卡转让给其他玩家。</li>
      <li><b>市场行情格</b>：抽行情卡，所有玩家可卖出相关资产；202 规则下租金随行情波动。</li>
      <li><b>意外支出格</b>：支付卡片金额。<b>添丁格</b>：子女 +1（上限 3 个），养育支出增加。</li>
      <li><b>公益捐赠格</b>：捐出总收入的 10%，未来 2 轮可选掷 1—2 粒骰子。</li>
      <li><b>裁员失业格</b>：支付一次总支出，并暂停两轮。</li>
      <li><b>资金不足时</b>：现金不能为负，必须三选一 —— 贷款补足 / 变卖资产（账面 80% 急售）/ 宣告破产退出游戏。</li>
      <li><b>主动认输</b>：可在菜单里主动退出本局。与破产不同，认输<b>不清算资产</b>，按净资产计入排名。</li>
    </ul>
    <h4>获胜条件</h4>
    <ul>
      <li>第一个在财务自由圈买下自己梦想的玩家。</li>
      <li>第一个在财务自由圈通过购买企业使月现金流增加 ≥ ¥50,000 的玩家。</li>
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
    <h4>关键数值</h4>
    <ul>
      <li>信用贷 / 信用卡分期月息 <b>${(BANK.loanRate*100).toFixed(1)}%</b>（年化约 ${Math.round(BANK.loanRate*12*100)}%）；财务自由圈投资只能用现金，不允许贷款。</li>
      <li>主动变卖资产按账面价 <b>${Math.round(E.SELL_RATE*100)}%</b> 立即变现；破产时银行按 <b>${Math.round(E.BANK_RATE*100)}%</b> 收购全部可变现资产抵债。</li>
      <li>进入财务自由圈的启动资金 = <b>被动收入 × 100</b>。</li>
      <li>融券做空不需支付现金，出现该标的价格时<b>强制买回平仓</b>，可随时操作。</li>
      <li>看涨 / 看跌 / 跨式期权有 <b>3 回合</b>时间限制，逾期权利金损失。</li>
    </ul>
  </div>`;
}
function renderSettings(){
  const g = Game.g;
  $('#paneSettings').innerHTML = `
    <div class="sec">
      <div class="sec__title">游戏信息</div>
      <div class="rowlist">
        <div class="rowlist__row"><span>游戏模式</span><b>${E.isAgeMode(g) ? '年龄模式' : '无限模式'}</b></div>
        <div class="rowlist__row"><span>规则版本</span><b>${g.rule} 规则</b></div>
        <div class="rowlist__row"><span>玩家人数</span><b>${g.players.length} 人</b></div>
        <div class="rowlist__row"><span>当前轮次</span><b>第 ${g.round} 轮${E.isAgeMode(g) ? ` / 共 ${E.maxRounds(g)} 轮` : ''}</b></div>
        ${E.isAgeMode(g) ? `<div class="rowlist__row"><span>当前年龄</span><b>${E.ageOf(g)} 岁 · 距退休 ${E.yearsLeft(g)} 年</b></div>` : ''}
        <div class="rowlist__row"><span>行情卡已抽</span><b>${g.marketDrawn}${g.rule==='202'?' / 25':' 张'}</b></div>
      </div>
    </div>
    <div class="sec">
      <div class="sec__title">操作</div>
      <button class="btn btn--tonal btn--block" data-act="finance" style="margin-bottom:8px">财务报表总览</button>
      <button class="btn btn--tonal btn--block" data-act="loan" style="margin-bottom:8px">信用贷 / 还款</button>
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
  else if(pendingBusy){ s = 'card'; txt = `待处理：${g.pending.title || '卡片'}`; }
  else if(Game.animating){ s = 'roll'; txt = '掷骰中…'; }
  else if(canEnd){ s = 'end'; txt = '已移动 · 请结束回合交给下一位'; }
  else { s = 'roll'; txt = `${E.isAgeMode(g) ? E.ageOf(g)+' 岁 · ' : ''}第 ${g.round} 轮 · ${p.inFT ? '财务自由圈' : '老鼠赛跑'}`; }
  $('#turnState').textContent = txt;
  if(bar.dataset.state !== s) bar.dataset.state = s;
}

let lastCanEnd = false;
let healedPending = null;
let handoffTimer = null;

function updateActions(){
  const g = Game.g, p = E.current(g);
  const btnRoll = $('#btnRoll'), label = $('#btnRollLabel'), endBtn = $('#btnEndTurn');
  const n = E.diceCount(g, p);
  const pendingBusy = !!g.pending;
  const canEnd = Game.rolled && !pendingBusy && !g.over;

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
      endBtn.textContent = g.players.length > 1 ? `结束回合 · 轮到 ${nextAliveName(g, p.id)}` : '结束回合';
    } else {
      btnRoll.className = 'btn btn--primary btn--xl';
      endBtn.className = 'btn btn--tonal';
      endBtn.textContent = '结束回合';
    }
    btnRoll.disabled = pendingBusy || Game.rolled || Game.animating;
    label.textContent = pendingBusy ? '处理卡片中…'
      : Game.animating ? '掷骰中…'
      : Game.rolled ? '本回合已移动'
      : `掷骰子（${n} 粒）`;
    endBtn.hidden = !canEnd;
  }

  $('#die2').hidden = n < 2;
  $('#btnDiceChoice').hidden = !(p.charityTurns>0 && !Game.rolled && !g.over);
  if(!$('#btnDiceChoice').hidden){
    $('#btnDiceChoice').textContent = `慈善加成：掷 ${p.diceChoice===2?2:1} 粒（点击切换）`;
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
  if(esc_.canEscape && !p.inFT && !g.over){
    if(!b){
      b = document.createElement('button');
      b.id = 'btnEscape'; b.className = 'btn btn--tonal';
      $('#btnRoll').parentNode.appendChild(b);
    }
    b.textContent = '🎉 跳出老鼠赛跑 → 财务自由圈';
    b.onclick = ()=>{
      const r = A.escapeRatRace(g);
      if(!r.ok) return U.toast(r.msg, 'err');
      Game.boardView = 'fasttrack';
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
  const n = E.diceCount(g, p);
  const dice = E.rollDice(g, n);
  g.lastDice = dice;
  Game.animating = true;
  updateActions();
  const d1 = $('#die1'), d2 = $('#die2');
  d2.hidden = n < 2;
  d1.classList.add('die--roll'); d2.classList.add('die--roll');
  let ticks = 0;
  const fast = U.Setup.fast === false ? false : true;
  const maxTicks = fast ? 6 : 14;
  const timer = setInterval(()=>{
    d1.textContent = 1 + Math.floor(Math.random()*6);
    if(n>1) d2.textContent = 1 + Math.floor(Math.random()*6);
    if(++ticks > maxTicks){
      clearInterval(timer);
      d1.textContent = dice[0];
      if(n>1) d2.textContent = dice[1];
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
  const acting = E.current(g);          /* 本回合玩家：可能在这次结算里被动破产 */
  E.endTurn(g);
  Game.rolled = false;
  const nxt = E.current(g);
  Game.boardView = nxt.inFT ? 'fasttrack' : 'ratrace';
  renderAll();
  /* 出局 → 先给出局者本人的复盘；复盘的页脚可以再回到战绩页。
     这样「破产即出复盘」这条规则不受本局是否同时结束的影响。 */
  const reported = reportIfNeeded(acting);
  if(g.over){
    if(reported) return;
    winnerModal(); return;
  }
  if(reported) return;
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
            <div class="pcard__job">${p.job.ico} ${esc(p.job.name)} · 现金 ${money(p.cash)} · 月现金流 ${money(E.finance(p).cashflow)}</div>
          </div>`).join('')}</div>
        <div class="modal__foot"><button class="btn btn--text" data-close>关闭</button></div>`,
        { onMount(m){ $('[data-close]',m).onclick = U.closeModal;
          $$('[data-pid]',m).forEach(x=>x.onclick=()=>showPlayerDetail(+x.dataset.pid)); } });
      break;
    case 'help': openHelp(); break;
    case 'loan': openLoan(); break;
    case 'trade': openTrade(); break;
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
        <div class="rulelist__row"><div>出圈条件</div><div>${view.rule==='202'?'被动收入 &gt; 总支出 × 2':'被动收入 &gt; 总支出'}</div></div>
        <div class="rulelist__row"><div>骰子</div><div>内圈 1 粒 / 财务自由圈 2 粒</div></div>
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
      <p class="muted">① 第一个在财务自由圈买下自己梦想的玩家；② 第一个在财务自由圈通过购买企业使月现金流增加 ≥ ¥50,000 的玩家；③ ${view.rule==='202'?'买断对手资产使其出局，最终存活者获胜。':'破产者退出游戏。'}</p>
      <h4 style="margin:14px 0 6px;font-size:13px;color:var(--primary)">关键数值</h4>
      <p class="muted">信用贷月息 1%（年化约 12%）；主动变卖按账面价 80% 变现，破产时银行半价收购；出圈资金 = 被动收入 × 100；融券做空强制平仓；期权 3 回合限制。</p>
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
            <div class="rowlist__row"><span>被动收入</span><b>${money(f.passive)}</b></div>
            <div class="rowlist__row"><span>总支出</span><b>${money(f.totalExpenses)}</b></div>
            <div class="rowlist__row"><span>现金 / 净资产</span><b>${money(p.cash)} / ${money(E.netWorth(p))}</b></div>
            ${p.inFT?`<div class="rowlist__row"><span>财务自由圈月现金流</span><b>${money(E.ftMonthly(p))}</b></div>`:''}
          </div></div>`;
      }).join('')}
    </div>
    <div class="modal__foot"><button class="btn btn--primary" data-close>关闭</button></div>`,
    { onMount(m){ $('[data-close]',m).onclick = U.closeModal;
      $$('[data-pid]',m).forEach(x=>x.onclick=()=>{ U.closeModal(); showPlayerDetail(+x.dataset.pid); }); } });
}

function openLoan(preset){
  const g = Game.g, p = E.current(g);
  const fromCard = !!g.pending;    /* 从卡片里的「先贷款 / 贷款补足」进来时，本轮卡片还未结算 */
  /* preset：资金不足时代入的缺口金额，省去玩家自己算 */
  const startAmt = Math.max(100, Math.round((preset || 1000) / 100) * 100);
  /* 统一退路：贷款弹层是从卡片里顶上来的，关闭后必须把那张卡片还给玩家。
     否则会留下「没有弹层 + pending 残留」的状态 —— 掷骰禁用、结束回合隐藏，回合卡死。 */
  const backFromLoan = ()=>{
    U.closeModal();
    const gg = Game.g;
    if(gg && gg.pending && window.UiPending) window.UiPending.showPending();
    renderAll();
  };
  U.openModal(`
    <div class="modal__head"><h3>信用贷 / 信用卡分期</h3></div>
    <div class="modal__body">
      <p class="hint">信用贷 / 信用卡分期月息 <b>${(BANK.loanRate*100).toFixed(1)}%</b>（年化约 ${Math.round(BANK.loanRate*12*100)}%）。贷款会增加月支出、降低月现金流，请谨慎使用。</p>
      <div class="sec__total"><span>当前贷款余额</span><span class="money">${money(p.liabs.bank)}</span></div>
      <div class="sec__total"><span>每月还款（${(BANK.loanRate*100).toFixed(1)}%）</span><span class="money">${money(Math.round(p.liabs.bank*BANK.loanRate))}</span></div>
      <div class="sec__title" style="margin-top:14px">贷款金额</div>
      <div class="number-row">
        <div class="stepper">
          <button data-minus>−</button><input id="loanAmt" type="number" value="${startAmt}" min="100" step="100"><button data-plus>+</button>
        </div>
        ${[1000,5000,10000,20000].map(v=>`<button class="btn btn--s btn--outline" data-set="${v}">${money(v)}</button>`).join('')}
      </div>
      ${fromCard ? `<p class="hint" style="margin-top:12px">🔙 本轮卡片尚未结算，完成或关闭后将自动返回刚才的决策。</p>` : ''}
    </div>
    <div class="modal__foot">
      <button class="btn btn--text" data-close>关闭</button>
      <button class="btn btn--tonal" data-repay>还款</button>
      <button class="btn btn--primary" data-loan>确认贷款</button>
    </div>`,
    { onDismiss: backFromLoan,                    /* ESC / 点遮罩同样回到卡片 */
      onMount(m){
      const input = $('#loanAmt',m);
      $('[data-minus]',m).onclick = ()=> input.value = Math.max(100, (+input.value)-100);
      $('[data-plus]',m).onclick  = ()=> input.value = (+input.value)+100;
      $$('[data-set]',m).forEach(b=>b.onclick=()=>input.value=b.dataset.set);
      $('[data-close]',m).onclick = backFromLoan;
      $('[data-loan]',m).onclick = ()=>{
        const r = A.takeLoan(g, Math.round(+input.value||0));
        if(!r.ok) return U.toast(r.msg,'err');
        backFromLoan();
        U.toast('贷款到账','ok');
      };
      $('[data-repay]',m).onclick = ()=>{
        const r = A.repayLoan(g, Math.round(+input.value||0));
        if(!r.ok) return U.toast(r.msg,'err');
        backFromLoan();
        U.toast('还款成功','ok');
      };
    }});
}

/* 玩家间交易：现金 ↔ 机会/资产 */
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
        <div class="rowlist__row rowlist__row--head"><span>玩家</span><span>现金 / 月现金流 / 净资产</span></div>
        ${g.players.slice().sort((a,b)=>E.netWorth(b)-E.netWorth(a)).map(x=>{
          const f = E.finance(x);
          return `<div class="rowlist__row"><span>${x.icon} ${esc(x.name)}${p && x.id===p.id?' 🏆':''}${x.out?'（出局）':''}</span>
          <span>${money(x.cash)} / ${money(f.cashflow)} / ${money(E.netWorth(x))}</span></div>`;
        }).join('')}
      </div>
    </div>
    <div class="modal__foot">
      <button class="btn btn--text" data-close>查看棋盘</button>
      <button class="btn btn--tonal" data-restart>再来一局</button>
      <button class="btn btn--primary" data-summary>📊 查看复盘报告</button>
    </div>`,
    { onMount(m){
      $('[data-close]',m).onclick = U.closeModal;
      $('[data-restart]',m).onclick = ()=>{ U.closeModal(); onMenu('restart'); };
      $('[data-summary]',m).onclick = ()=>{
        U.closeModal();
        window.UiSummary.openSummary(p ? p.id : null);   /* 全员破产时给当前玩家出报告 */
      };
    }});
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
    p.diceChoice = p.diceChoice===2 ? 1 : 2;
    renderAll();
  };
  /* 切后台 / 关页面时强制落盘，避免合并写入还没触发就丢了最后一步 */
  window.addEventListener('beforeunload', saveState);
  window.addEventListener('pagehide', saveState);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) saveState(); });
}
window.UiGame = { Game, startGame, resetGame, tryRestore, saveState, renderAll, roll, endTurn, onMenu, bind, finishRoll, renderCenter,
  showPlayerDetail, openHelp, openLoan, updateActions, openShortPanel, winnerModal, bizOfSpace, p_inFT,
  reportIfNeeded, surrenderFlow };
})();
