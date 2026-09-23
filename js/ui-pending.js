/* ==========================================================================
   ui-pending.js — 卡片结算弹层（机会 / 市场 / 额外支出 / 慈善 / 孩子 / 失业 / 企业 / 梦想 / 事件）
   ========================================================================== */
(function(){
'use strict';
const E = window.Engine, A = window.Act, U = window.UI;
const $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;
const G = () => window.UiGame.Game;

/* ------------------------------ 卡面渲染 ------------------------------ */
/* ⚠️ 关键约定：不同牌堆的卡片字段结构完全不同 ——
   投资卡（小额理财/大额置业/资本利得/现金流）是「可买标的」，字段是 cost / dp / cf / price / min / max；
   行情卡是「报价 / 事件」，字段是 prop / target / rate / pct，**没有成本与月现金流**；
   额外支出卡连 kind 都没有，字段是 cost / extraPay。
   所以必须先按【牌堆】分流，再按 kind 细分；只按 kind 分支会让行情卡读到 undefined → $NaN。 */

const r = (k,v) => `<div class="kv"><span class="kv__k">${k}</span><span class="kv__v">${v}</span></div>`;
const sign = n => (n>=0?'+':'') + money(n);          /* 负数不再渲染成 "+-¥100" */
const DECK_LABEL = { small:'小额理财', big:'大额置业', capgain:'杠杆交易', cashflow:'大额现金流', market:'市场行情', doodad:'额外支出' };
/* 202 的行情卡大多没有 nm，按 kind 给一个像样的标题 */
const MARKET_TITLE = {
  stock:'股票报价', realestate:'物业收购报价', business:'企业收购要约', collectible:'收藏品报价',
  land:'土地收购报价', savings:'存单 / 债权到期', rentDelta:'租金调整', disaster:'资产损毁', doodadLink:'市场真空期'
};
function cardface(label, id, title, rows, note){
  return `<div class="cardface">
      <div class="cardface__no">${label}${id ? ' · ' + esc(id) : ''}</div>
      <div class="cardface__title">${esc(title)}</div>
      ${rows}
      ${note?`<p class="hint" style="margin-top:10px">${esc(note)}</p>`:''}
    </div>`;
}

/* 行情卡：报价 / 事件，只描述「有人出什么价、谁受影响」 */
function marketFace(card){
  const rate = (card.rate == null ? 1 : card.rate);
  let rows = '';
  switch(card.kind){
    case 'stock': {
      const s2 = window.SYMBOLS && window.SYMBOLS[card.symbol];
      rows = r('标的', esc((s2 ? s2.nm + ' ' : '') + card.symbol))
           + (s2 ? r('板块', esc(s2.board)) : '')
           + r('市场报价', money(card.price) + ' / 股');
      break;
    }
    case 'realestate':  rows = r('标的物业', esc(card.prop || '不限')) + r('收购报价', money(card.price)); break;
    case 'business':    rows = r('收购方式', '按你的购入价 × ' + rate) + r('成交比例', Math.round(rate*100) + '%'); break;
    case 'collectible': rows = r('标的', esc(card.prop || '收藏品')) + r('市场报价', money(card.price) + ' / 单位'); break;
    case 'land':        rows = r('标的', esc(card.prop || '土地')) + r('收购报价', money(card.price)); break;
    case 'savings':     rows = r('兑现比例', '本金的 ' + Math.round(rate*100) + '%'); break;
    case 'rentDelta':   rows = r('租金变动', (card.pct>0?'+':'') + Math.round(card.pct*100) + '%')
                            + r('影响范围', '全体出租房产'); break;
    case 'disaster':    rows = r('受灾标的', esc(card.target || '房产 / 土地')) + r('损失', '资产归零'); break;
  }
  const sym = card.symbol && window.SYMBOLS && window.SYMBOLS[card.symbol];
  const title = card.nm || (sym ? sym.nm + ' 报价' : '') || MARKET_TITLE[card.kind] || '市场行情';
  return cardface('市场行情', card.id, title, rows, card.note);
}

/* 额外支出卡：数据里没有 kind，必须按牌堆识别 */
function doodadFace(card, cost){
  /* 卡面显示的必须是【实际金额】：消费档次系数由社会等级决定，
     卡面写标价、弹层写实付，会让人以为系统算错了。 */
  const amount = cost ? cost.cost : card.cost;
  const extra  = cost ? cost.extraPay : (card.extraPay || 0);
  let rows = r('需支付', money(amount));
  if(extra) rows += r('每月额外支出', sign(extra));
  return cardface('额外支出', card.id, card.nm || '额外支出', rows, card.note);
}

/* 投资卡：可买标的，字段完整 */
/* solo 只用于把「可多人联合购买」改成单人下正确的说法 ——
   单人局里没有「多人」，写着可多人联合会让人以为还能拉人。 */
/* 净回报率 = 月现金流 × 12 ÷ 投入。
   这是比较不同投资机会时唯一该看的指标 —— 绝对金额会骗人：
   大额卡的现金流一定更大，但回报率可能更低。 */
function rateRow(invest, flow){
  if(!(invest > 0) || typeof flow !== 'number' || !isFinite(flow)) return '';
  return r('净回报', `${(flow * 12 / invest * 100).toFixed(1)}% / 年`);
}
function dealFace(deckName, card, solo){
  let rows = '';
  switch(card.kind){
    case 'stock':
      rows = r('标的', esc(card.symbol)) + r('单价', money(card.price)+' / 股')
           + (card.range ? r('可买数量', `${card.min} — ${card.max} 股`) : '')
           + r('成本合计', money(card.price*(card.min||1))+' 起');
      break;
    case 'option':
      rows = r('标的', esc(card.symbol)) + r('类型', card.dir==='call'?'看涨期权 Call':'看跌期权 Put')
           + r('行权价', money(card.strike)) + r('权利金', money(card.premium)+' / 股 × 100 股 = ' + money(card.premium*100))
           + r('有效期', '3 回合');
      break;
    case 'straddle':
      rows = r('标的', esc(card.symbol)) + r('结构', '同时买入看涨 + 看跌')
           + r('行权价', money(card.strike)) + r('合计权利金', money(card.premium*100)) + r('有效期', '3 回合');
      break;
    case 'realestate':
      rows = r('买价', money(card.cost)) + r('首付', money(card.dp))
           + r('月现金流', sign(card.cf)) + (card.rent? r('租金', money(card.rent)+' / 月'):'')
           + rateRow(card.dp, card.cf)
           + (card.joint? r('202 规则', solo ? '可与机构合伙购买' : '可多人联合购买'):'')
           + (card.capital? r('类型','资本利得型 · 无现金流'):'');
      break;
    case 'business':
      rows = r('成本', money(card.cost)) + r('月现金流', sign(card.cf)) + rateRow(card.cost, card.cf)
           + (card.risky? r('风险','受行情卡影响，可能枯竭'):'');
      break;
    case 'savings':
      rows = r('本金', money(card.cost)) + r('月利息', sign(card.interest)) + rateRow(card.cost, card.interest);
      break;
    case 'land':
      rows = r('成本', money(card.cost)) + r('月现金流','¥0（等待市场报价）');
      break;
    case 'collectible':
      rows = card.unit ? r('单价', money(card.price)+' / 单位') + r('可买数量', `${card.min} — ${card.max}`)
                       : r('成本', money(card.cost));
      break;
    default:
      if(card.price != null) rows = r('报价', money(card.price));
  }
  return cardface(DECK_LABEL[deckName] || '投资机会', card.id, card.nm || card.symbol || '卡片', rows, card.note);
}

function face(deckName, card, cost, solo){
  if(!card) return '';
  if(deckName === 'market') return marketFace(card);
  if(deckName === 'doodad') return doodadFace(card, cost);
  return dealFace(deckName, card, solo);
}
function foot(btns){ return `<div class="modal__foot">${btns}</div>`; }
function finishTurnAction(){
  const g = G().g;
  E.clearPending(g);
  U.closeModal();
  window.UiGame.renderAll();
}

/* ------------------------------ 主分发 ------------------------------ */
function showPending(){
  const game = G(), g = game.g, P = g.pending;
  if(!P) return;
  const p = g.players[P.p];
  switch(P.type){
    case 'info':          return showInfo(g, p, P);
    case 'rest':          return showRest(g, p, P);
    case 'deficit':       return showDeficit(g, p, P);
    case 'opportunity':   return showOpportunity(g, p, P);
    case 'opportunity202':return showOpportunity202(g, p, P);
    case 'market':        return showMarket(g, p, P);
    case 'doodad':        return showDoodad(g, p, P);
    case 'charity':       return showCharity(g, p, P);
    case 'baby':          return showBaby(g, p, P);
    case 'downsized':     return showDownsized(g, p, P);
    case 'business':      return showBusiness(g, p, P);
    case 'dream':         return showDream(g, p, P);
    case 'ftEvent':       return showFTEvent(g, p, P);
  }
}

/* ------------------------------ 通用 ------------------------------ */
function showInfo(g, p, P){
  U.openModal(`
    <div class="modal__head"><h3>${P.ico} ${esc(P.title)}</h3></div>
    <div class="modal__body"><p class="muted">${esc(P.msg||'')}</p></div>
    ${foot(`<button class="btn btn--primary" data-ok>确定</button>`)}`,
    { onMount(m){ $('[data-ok]',m).onclick = ()=>{ finishTurnAction(); }; } });
}

/* ------------------------------ 投资机会格 ------------------------------ */
function showOpportunity(g, p, P){
  if(!P.deal){
    const is202 = g.rule === '202';
    const opts = is202
      ? [{k:'capgain', ico:'📈', t:'杠杆交易', d:'成本较低、回报较小；含股票、期权、做空等资本利得型交易。'},
         {k:'cashflow',ico:'🏢', t:'大额现金流', d:'需要更多资金，但提供更大的现金流与回报；大型房地产与企业投资。'}]
      : [{k:'small', ico:'💡', t:'小额理财', d:'成本较低、回报较小的投资机会，适合游戏初期积累资本。'},
         {k:'big',   ico:'🏦', t:'大额置业', d:'经营项目投入约 4.3万—16.13万元，房产首付约 19.35万—58.05万元。请按具体项目备足资金，并保留生活与还贷周转金。'}];
    U.openModal(`
      <div class="modal__head"><h3>💡 投资机会 · 选择一个方向</h3></div>
      <div class="modal__body">
        <p class="hint">停在投资机会格，可抽取一类投资卡，并决定是否投资。若自己买不起，可把投资卡卖给其他玩家换取现金。</p>
        <div class="picklist">
          ${opts.map(o=>`<button class="pick" data-k="${o.k}">
            <span class="pick__ico">${o.ico}</span>
            <span><span class="pick__t">${o.t}</span><span class="pick__d">${o.d}</span></span>
            <span class="pick__go">›</span></button>`).join('')}
        </div>
        <div class="sec__total"><span>你的现金</span><span class="money">${money(p.cash)}</span></div>
        <div class="sec__total"><span>你的精力</span><span class="money ${p.energy >= 30 ? '' : 'neg'}">${Math.round(p.energy)} / ${E.energyMax(g, p)}</span></div>
        <p class="hint" style="margin-top:8px">考察一类方向需要投入研究时间（消耗精力），
          而且<b>放弃机会也不退还</b> —— 研究过了就是沉没成本。这也正是「机会」，不是「白给」。</p>
      </div>
    ${foot(`<button class="btn btn--text" data-skip>放弃这次机会</button>`)}`,
      { onMount(m){
        /* ⚠️ 必须有出口：精力不足以考察时若只能点牌堆，玩家会彻底卡在这一格 ——
           放弃不消耗精力（都还没开始研究），所以这条退路是零成本的。 */
        const skip = $('[data-skip]',m);
        if(skip) skip.onclick = ()=>{ finishTurnAction(); U.toast('已放弃这次投资机会', 'info'); };
        $$('[data-k]',m).forEach(b=>b.onclick=()=>{
          const r = A.chooseDeck(g, b.dataset.k);
          if(!r.ok) return U.toast(r.msg, 'err');
          showOpportunity(g, p, g.pending);
        });
      } });
    return;
  }
  showDealCard(g, p, P.deal);
}

/* 202：投资机会格同时抽投资卡 + 行情卡 */
function showOpportunity202(g, p, P){
  if(!P.deal){
    U.openModal(`
      <div class="modal__head"><h3>💡 投资机会（202）· 选择一个方向</h3></div>
      <div class="modal__body">
        <p class="hint">202 规则：停在投资机会格时<b>同时抽取投资卡和行情卡</b>，选择空间更大，游戏节奏更快。</p>
        <div class="picklist">
          <button class="pick" data-k="capgain"><span class="pick__ico">📈</span>
            <span><span class="pick__t">杠杆交易</span><span class="pick__d">股票 / 期权 / 做空 / 法拍房等资本利得型交易</span></span><span class="pick__go">›</span></button>
          <button class="pick" data-k="cashflow"><span class="pick__ico">🏢</span>
            <span><span class="pick__t">大额现金流</span><span class="pick__d">大型房地产与企业投资，可联合购买</span></span><span class="pick__go">›</span></button>
        </div>
        <div class="sec__total"><span>你的现金</span><span class="money">${money(p.cash)}</span></div>
        ${P.market?`<div class="sec__title" style="margin-top:14px">同时抽到的行情卡</div>${face('market', P.market)}`:''}
      </div>
    ${foot(`<button class="btn btn--text" data-skip>放弃这次机会</button>`)}`,
      { onMount(m){
        const skip = $('[data-skip]',m);
        if(skip) skip.onclick = ()=>{ finishTurnAction(); U.toast('已放弃这次投资机会', 'info'); };
        $$('[data-k]',m).forEach(b=>b.onclick=()=>{
          const r = A.chooseDeck(g, b.dataset.k);
          if(!r.ok) return U.toast(r.msg, 'err');
          showOpportunity202(g, p, g.pending);
        });
      } });
    return;
  }
  if(!P.impact && P.market){ P.impact = A.marketImpact(g, P.market); }
  showDealCard(g, p, P.deal, P);
}

/* ------------------------------ 投资卡决策 ------------------------------ */
function showDealCard(g, p, card, P){
  const unitDeal = card.kind==='stock' || (card.kind==='collectible' && card.unit);
  const qty = unitDeal ? (card.min||1) : 1;
  const cost = A.dealCost(g, card, qty);
  const affordable = p.cash >= cost;
  const eCost = A.dealEnergy(card);                 /* 与 engine 共用同一份映射，界面上显示的即为实扣 */
  const energyOK = Math.round(p.energy) >= eCost;
  const minCost = A.dealCost(g, card, card.min||1);
  const others = g.players.filter(x=>x.id!==p.id && !x.out && !x.finished);
  const solo = E.isSolo(g);
  /* 机构合伙的分账读自引擎的纯函数 —— 界面上写的数字必须与实扣一致 */
  const orgPlan = A.orgPartnerPlan(g, card);

  const qtyHtml = unitDeal ? `
    <div class="sec__title">购买数量（${card.min} — ${card.max}）</div>
    <div class="number-row">
      <div class="stepper"><button data-minus>−</button>
        <input id="qty" type="number" value="${card.min}" min="${card.min}" max="${card.max}" step="${card.kind==='collectible'?10:100}">
        <button data-plus>+</button></div>
      <button class="btn btn--s btn--outline" data-max>全部买入（${money(card.price*card.max)}）</button>
    </div>`: '';

  const jointHtml = (card.kind==='realestate' && card.joint) ? (solo ? `
    <div class="sec__title" style="margin-top:12px">与机构合伙人联合购买</div>
    <p class="hint">你只有一个人，没法和其他玩家凑首付 —— 但可以找机构搭伙：
      机构出 <b>${Math.round(orgPlan.orgShare*100)}%</b> 首付、分走同比例的现金流。
      现实里找投资人就是这样：<b>让渡一部分收益，换来「买得起」</b>。</p>
    <div class="rowlist">
      <div class="rowlist__row"><span>你自己出资</span><b>${money(orgPlan.mine)}</b></div>
      <div class="rowlist__row"><span>你将获得的月现金流</span><b>+${money(orgPlan.cf)}</b></div>
      <div class="rowlist__row"><span>牵头所需精力</span><b>${orgPlan.energy}</b></div>
    </div>
    <label class="switch" style="margin-top:10px">
      <input type="checkbox" id="orgPartner">
      <span class="switch__track"><span class="switch__thumb"></span></span>
      <span class="switch__label">引入机构合伙人（首付减半 · 现金流减半）</span>
    </label>` : `
    <div class="sec__title" style="margin-top:12px">202 联合购买</div>
    <p class="hint">可与多名玩家共同购买，按出资比例分配现金流与资本利得。需要首付 ${money(card.dp)}，你的现金 ${money(p.cash)}。</p>
    <div class="rowlist" id="jointRows">
      ${others.map(o=>`<div class="rowlist__row">
        <span><input type="checkbox" data-jp="${o.id}"> ${o.icon} ${esc(o.name)}（现金 ${money(o.cash)}）</span>
        <input type="number" class="textfield" style="width:120px;padding:6px 8px" data-jamt="${o.id}" value="0" step="1000" min="0">
      </div>`).join('')}
      <div class="rowlist__row"><span>你需出资</span><b id="jointMine">${money(card.dp)}</b></div>
    </div>`) : '';

  /* ★ 单人模式【没有】机会转让这条路 —— 遇到机会只有「买入」或「放弃」。
     把一张自己吃不下的投资机会卖出去换现金，现实里并无对应场景
     （机构完全可以自己找项目，不必为你「看过一眼」付费）。
     多人模式照常可以卖给其他玩家。 */
  const sellHtml = (!solo && others.length) ? `
    <div class="sec__title" style="margin-top:12px">把投资卡卖给其他玩家</div>
    <p class="hint">自己买不起时，可以把抽到的投资卡出售给其他玩家换取现金（对方需自付首付）。</p>
    <div class="rowlist">
      ${others.map(o=>`<div class="rowlist__row">
        <span>${o.icon} ${esc(o.name)}（现金 ${money(o.cash)}）</span>
        <span><input type="number" class="textfield" style="width:110px;padding:6px 8px" data-sp="${o.id}" value="1000" step="500" min="0">
        <button class="btn btn--s btn--outline" data-sellto="${o.id}">出售</button></span>
      </div>`).join('')}
    </div>` : '';

  U.openModal(`
    <div class="modal__head"><h3>${card.deck==='big'||card.deck==='cashflow'?'🏢':'💡'} ${esc(card.nm||card.symbol)}</h3></div>
    <div class="modal__body">
      ${face(card.deck, card, null, solo)}
      <div class="sec__total"><span>你需支付</span><b class="money" id="needCost">${money(cost)}</b></div>
      <div class="sec__total"><span>你的现金</span><span class="money ${affordable?'':'neg'}">${money(p.cash)}</span></div>
      <div class="sec__total"><span>需要精力（研究 + 筹建）</span><span class="money ${energyOK?'':'neg'}">${eCost} / 当前 ${Math.round(p.energy)}</span></div>
      ${energyOK ? '' : `<p class="hint">精力不足以承接这笔投资。精力每回合自然恢复，也可以停在「起点」选择休假。</p>`}
      ${qtyHtml}${jointHtml}${sellHtml}
      ${P && P.market ? `<div class="sec__title" style="margin-top:14px">同时抽到的行情卡（可先完成市场交易）</div>${face('market', P.market)}` : ''}
    </div>
    ${foot(`
      <button class="btn btn--text" data-pass>放弃机会</button>
      ${P && P.market ? `<button class="btn btn--tonal" data-market>处理行情卡</button>` : ''}
      <button class="btn btn--tonal" data-loan>先贷款</button>
      <button class="btn btn--primary" data-buy ${(affordable && energyOK)?'':'disabled'}>${energyOK ? '确认买入' : '精力不足'}</button>
    `)}`,
    { onMount(m){
      const q = $('#qty', m);
      const upd = ()=>{
        const n = q ? Math.max(card.min, Math.min(card.max, Math.round(+q.value||card.min))) : 1;
        const c = A.dealCost(g, card, n);
        /* 勾了机构合伙人 → 实付与精力都按合伙方案算，否则按钮状态会与实际扣款脱节 */
        const orgCb = $('#orgPartner', m);
        const useOrg = !!(orgCb && orgCb.checked);
        const need = useOrg ? orgPlan.mine : c;
        const needEnergy = useOrg ? orgPlan.energy : A.dealEnergy(card);
        $('#needCost', m).textContent = money(need);
        const b = $('[data-buy]', m);
        b.textContent = useOrg ? '与机构合伙买入' : '确认买入';
        b.disabled = (p.cash < need) || (Math.round(p.energy) < needEnergy);
        if(q) q.value = n;
        /* 联合购买：你需出资 */
        if($('#jointMine', m)){
          let partners = 0;
          $$('[data-jp]', m).forEach(cb=>{
            if(cb.checked) partners += Math.max(0, Math.round(+$('[data-jamt="'+cb.dataset.jp+'"]', m).value||0));
          });
          $('#jointMine', m).textContent = money(Math.max(0, c - partners));
        }
      };
      if(q){
        q.oninput = upd;
        $('[data-minus]',m).onclick = ()=>{ q.value = Math.max(card.min, (+q.value)-(card.kind==='collectible'?10:100)); upd(); };
        $('[data-plus]',m).onclick  = ()=>{ q.value = Math.min(card.max, (+q.value)+(card.kind==='collectible'?10:100)); upd(); };
        $('[data-max]',m).onclick   = ()=>{ q.value = card.max; upd(); };
      }
      $$('[data-jp]',m).forEach(cb=>{ cb.onchange = upd; });
      if($('#orgPartner',m)) $('#orgPartner',m).onchange = upd;
      $$('[data-jamt]',m).forEach(inp=>{ inp.oninput = upd; });
      $('[data-pass]',m).onclick = ()=>{
        E.bump(p, 'dealsPassed');
        /* 单人下放弃就是唯一的退路（没有转让）—— 顺手把这件事讲清楚 */
        E.milestone(g, p, `第 ${g.round} 轮放弃投资机会「${card.nm||card.symbol}」`, 'info');
        E.log(g, `${p.name} 放弃投资机会【${card.nm||card.symbol}】`, 'info', p.name);
        finishTurnAction();
      };
      $('[data-loan]',m).onclick = ()=>{ U.closeModal(); window.UiGame.onMenu('loan'); };
      if($('[data-market]',m)) $('[data-market]',m).onclick = ()=>{ setMarketOnly(g, p, P); };
      $$('[data-sellto]',m).forEach(b=>b.onclick=()=>{
        const price = Math.round(+$('[data-sp="'+b.dataset.sellto+'"]',m).value||0);
        const r = A.sellOpportunity(g, card, +b.dataset.sellto, price);
        if(!r.ok) return U.toast(r.msg, 'err');
        U.closeModal(); window.UiGame.renderAll(); U.toast('投资卡转让完成', 'ok');
      });
      const buyBtn = $('[data-buy]',m);
      buyBtn.onclick = ()=>{
        const n = q ? Math.max(card.min, Math.min(card.max, Math.round(+q.value||card.min))) : 1;
        /* 单人模式：勾了机构合伙人就走合伙路径（实扣只是自己那一半首付） */
        const orgCb = $('#orgPartner', m);
        if(orgCb && orgCb.checked){
          const r = A.buyDealWithOrg(g, card);
          if(!r.ok) return U.toast(r.msg, 'err');
          finishTurnAction();
          window.UiGame.renderAll();
          U.toast(`与机构合伙买入成功：你出资 ${money(r.mine)}（${Math.round(r.share*100)}%），月现金流 +${money(r.cf)}`, 'ok');
          checkEscapePrompt(g, p);
          return;
        }
        const useJoint = $('#jointMine', m) && card.kind==='realestate' && card.joint;
        if(useJoint){
          const parts = [];
          $$('[data-jp]',m).forEach(cb=>{
            if(!cb.checked) return;
            const amt = Math.max(0, Math.round(+$('[data-jamt="'+cb.dataset.jp+'"]',m).value||0));
            if(amt>0) parts.push({ id:+cb.dataset.jp, amt });
          });
          const mine = A.dealCost(g, card, 1) - parts.reduce((s,x)=>s+x.amt,0);
          if(mine < 0) return U.toast('合作方出资超过首付总额', 'err');
          if(parts.length && p.cash < mine) return U.toast('你的现金不足以承担出资部分', 'err');
          for(const x of parts){
            const o = g.players[x.id];
            if(o.cash < x.amt) return U.toast(`${o.name} 现金不足 ${money(x.amt)}`, 'err');
          }
          /* 联合购买也要付精力：发起人承担全额（跑流程的是他），参与方各承担六成。
             谁都没有「不出力白拿一份」的可能，这符合现实中的分工成本。 */
          const eFull = A.dealEnergy(card), ePart = Math.round(eFull * 0.6);
          for(const x of parts){
            const o = g.players[x.id];
            if(Math.round(o.energy) < ePart) return U.toast(`${o.name} 的精力不足以参与这次联合购买（需 ${ePart} 点）`, 'err');
          }
          if(!A.needEnergy(p, eFull, `联合购买「${card.nm}」`).ok) return U.toast('你的精力不足，无法牵头这笔联合购买', 'err');
          parts.forEach(x=>E.spendEnergy(g.players[x.id], ePart));
          /* 执行联合购买 */
          const total = A.dealCost(g, card, 1);
          const myShare = mine/total;
          p.cash -= mine;
          p.assets.realEstate.push({ nm:card.nm+(mine<total?'（共有）':''), dp:mine, cost:Math.round(card.cost*myShare), cf:Math.round(card.cf*myShare), rent:Math.round((card.rent||0)*myShare), share:myShare, joint:parts.length>0 });
          E.bump(p, 'dealsBought'); E.bump(p, 'investTotal', mine);
          E.bump(p, 'cfGained', Math.round(card.cf*myShare));
          E.milestone(g, p, `第 ${g.round} 轮与 ${parts.length} 位玩家联合购买「${card.nm}」，出资 ${money(mine)}（占比 ${Math.round(myShare*100)}%），月现金流 +${money(Math.round(card.cf*myShare))}`, 'good');
          E.log(g, `${p.name} 联合购买 ${card.nm}，出资 ${money(mine)}（占比 ${Math.round(myShare*100)}%），月现金流 +${money(Math.round(card.cf*myShare))}`, 'good', p.name);
          parts.forEach(x=>{
            const o = g.players[x.id];
            const sh = x.amt/total;
            o.cash -= x.amt;
            o.assets.realEstate.push({ nm:card.nm+'（共有）', dp:x.amt, cost:Math.round(card.cost*sh), cf:Math.round(card.cf*sh), rent:Math.round((card.rent||0)*sh), share:sh, joint:true });
            E.log(g, `${o.name} 参与联合购买 ${card.nm}，出资 ${money(x.amt)}（占比 ${Math.round(sh*100)}%），月现金流 +${money(Math.round(card.cf*sh))}`, 'good', o.name);
          });
          finishTurnAction();
          U.toast('联合购买完成', 'ok');
          checkEscapePrompt(g, p);
          return;
        }
        const r = A.buyDeal(g, card, { qty:n });
        if(!r.ok) return U.toast(r.msg, 'err');
        finishTurnAction();
        U.toast(`买入成功，支出 ${money(r.cost)}`, 'ok');
        checkEscapePrompt(g, p);
      };
      upd();
    }});
}
function setMarketOnly(g, p, P){
  /* 只处理同时抽到的行情卡：把 pending 切换为 market 类型 */
  g.pending = { type:'market', card:P.market, p:p.id, title:'市场行情', ico:'📈', impact:P.impact };
  showPending();
}
function checkEscapePrompt(g, p){
  const esc = E.escapeProgress(g, p);
  if(esc.canEscape && !p.inFT){
    U.toast('🎉 已满足跳出条件！点击「跳出老鼠赛跑 → 财务自由圈」按钮进入财务自由圈。', 'ok');
  }
}

/* ------------------------------ 市场行情 ------------------------------ */
function showMarket(g, p, P){
  if(!P.impact) P.impact = A.marketImpact(g, P.card);
  const card = P.card, opt = (P.impact.options||[]);
  const forced = (P.impact.forced||[]);
  const mine = opt.filter(o=>o.pid===p.id);
  const others = opt.filter(o=>o.pid!==p.id);
  U.openModal(`
    <div class="modal__head"><h3>📈 市场行情</h3></div>
    <div class="modal__body">
      ${face('market', card)}
      ${P.impact.note?`<p class="hint">${esc(P.impact.note)}</p>`:''}
      ${forced.length?`<div class="sec"><div class="sec__title">强制平仓结算</div>
        <div class="rowlist">${forced.map(x=>`<div class="rowlist__row"><span>${esc(x.text)}</span><b class="${x.good?'pos':'neg'}">${x.good?'获利':'亏损'}</b></div>`).join('')}</div></div>`:''}
      ${opt.length?`
        <div class="sec__title">市场交易（所有玩家均可操作）</div>
        <div class="rowlist">
          ${opt.map(o=>`<div class="rowlist__row">
            <span>${o.ico} <b>${esc(o.pname)}</b> · ${esc(o.label)}<br><span class="muted">${esc(o.sub)}</span></span>
            <button class="btn btn--s btn--outline" data-sell="${o.id}">${o.kind==='option'?'行权':(o.kind==='disaster'||o.kind==='land-disaster'?'确认损失':'卖出')}</button>
          </div>`).join('')}
        </div>`:`<p class="muted">本轮没有可交易的资产。</p>`}
      <div class="sec__total" style="margin-top:12px"><span>你的现金</span><span class="money">${money(p.cash)}</span></div>
      <p class="hint">提示：行情卡对所有玩家的同类资产同时生效，可按顺序为每位玩家操作。</p>
    </div>
    ${foot(`<button class="btn btn--primary" data-ok>完成市场结算</button>`)}`,
    { onMount(m){
      $$('[data-sell]',m).forEach(b=>b.onclick=()=>{
        const o = opt.find(x=>String(x.id)===b.dataset.sell);
        if(!o) return;
        const r = A.marketSell(g, o);
        if(!r.ok) return U.toast('操作失败', 'err');
        window.UiGame.renderAll();
        showMarket(g, p, g.pending);
      });
      $('[data-ok]',m).onclick = ()=>{ finishTurnAction(); };
    }});
}

/* ------------------------------ 资金不足决策 ------------------------------ */
/* 现金是硬约束：付不出就必须自己选一条出路 —— 贷款补足 / 变卖资产 / 宣告破产。
   对应真实社会里「借钱、卖东西、还不上就破产」的处理方式。 */
function shortfallPanel(g, p, amount){
  const gap = Math.max(0, amount - p.cash);
  const items = E.sellableAssets(p);
  const total = items.reduce((s,x)=>s+x.value, 0);
  return `
    <div class="sec" style="margin-top:16px">
      <div class="sec__title"><span>资金不足</span><span class="neg">还差 ${money(gap)}</span></div>
      <p class="hint">现金不能为负。请先<b>贷款补足</b>或<b>变卖资产</b>；两条路都走不通时，只能宣告破产退出游戏。</p>
      <div class="picklist" style="margin-top:10px">
        <button class="pick" data-short-loan>
          <span class="pick__ico">🏦</span>
          <span><span class="pick__t">向银行贷款补足</span>
          <span class="pick__d">借入 ${money(gap)}，月息 ${(BANK.loanRate*100).toFixed(1)}% → 此后每月多付 ${money(Math.round(gap*BANK.loanRate))}</span></span>
          <span class="pick__go">›</span></button>
      </div>
      <div class="sec__title" style="margin-top:14px"><span>或变卖资产套现</span><span>急售价 = 账面 ${Math.round(E.SELL_RATE*100)}%</span></div>
      ${items.length ? `<div class="rowlist">
        ${items.map(x=>`<div class="rowlist__row">
          <span>${esc(x.nm)}<br><span class="muted">账面 ${money(x.book)} → 变现 <b class="pos">${money(x.value)}</b></span></span>
          <button class="btn btn--s btn--outline" data-sellone="${x.key}:${x.i}">变卖</button>
        </div>`).join('')}
      </div>
      <p class="hint" style="margin-top:8px">全部变卖可套现 ${money(total)}${total >= gap ? '，足以付清本次款项。' : '，仍不足付清，需要再向银行贷款。'}</p>`
      : '<p class="hint">你已没有可变卖的资产，只能贷款或宣告破产。</p>'}
    </div>`;
}
/* 绑定资金不足面板上的三个动作 */
function bindShortfall(m, g, p, amount){
  const loan = $('[data-short-loan]', m);
  if(loan) loan.onclick = ()=>{ U.closeModal(); window.UiGame.openLoan(amount - p.cash); };
  $$('[data-sellone]', m).forEach(b=>b.onclick = ()=>{
    const parts = b.dataset.sellone.split(':');
    const r = A.liquidate(g, p, parts[0], +parts[1]);
    if(!r.ok) return U.toast(r.msg || '变卖失败', 'err');
    U.toast(`已变现 ${money(r.value)}`, 'ok');
    window.UiGame.renderAll();
    showPending();                      /* 重渲染当前卡片，缺口与按钮状态实时刷新 */
  });
  const bk = $('[data-bankrupt]', m);
  if(bk) bk.onclick = ()=>{
    U.confirmBox('宣告破产',
      `你将失去全部资产（银行按半价收购抵债）并退出本局游戏。<br><span class="muted">确定要宣告破产吗？</span>`,
      '确认破产退出', ()=>{
        A.declareBankruptcy(g, p);
        finishTurnAction();
        p.reportShown = true;
        /* 统一规则：破产 → 立刻给出局者本人的复盘（即使本局因此结束）。
           复盘页脚在「本局已结束」时会提供「查看战绩 / 再来一局」。 */
        window.UiSummary.openSummary(p.id);
        if(!g.over) U.toast(`<b>${esc(p.name)}</b> 已宣告破产，退出游戏`, 'err');
      }, true);
  };
}

/* ------------------------------ 起点：休假 ------------------------------ */
/* 精力机制必须有一条玩家能主动使用的恢复通道，否则「资产过多 → 精力下滑」
   只会变成一条无法自救的死亡螺旋。休假就是这条通道：花钱买休息。 */
function showRest(g, p, P){
  const cost = Math.round(E.finance(p).totalExpenses * (window.ENERGY.vacationCostMult || 1));
  const gain = window.ENERGY.vacationEnergy || 0;
  const max  = E.energyMax(g, p);
  const full = p.energy >= max;
  const canVac = !full && p.cash >= cost;
  U.openModal(`
    <div class="modal__head"><h3>🏁 ${esc(P.title || '起点')}</h3></div>
    <div class="modal__body">
      <p class="hint">${p.inFT ? '财务自由圈起点。' : '老鼠赛跑起点。'}
        停在这里可以选择<b>休假</b>：花一笔钱，把精力拉回来。</p>
      <div class="sec__total"><span>当前精力</span><span class="money">${Math.round(p.energy)} / ${max}</span></div>
      <div class="sec__total"><span>休假花费</span><span class="money">${money(cost)}<span class="muted">（约一个月支出）</span></span></div>
      <div class="sec__total"><span>可恢复精力</span><span class="money pos">+${gain}</span></div>
      ${!canVac ? `<p class="hint" style="margin-top:8px">${full ? '精力已经满格，不需要休假。' : '现金不足以安排这次休假。'}</p>` : ''}
    </div>
    ${foot(`
      <button class="btn btn--text" data-ok>原地休息，跳过</button>
      <button class="btn btn--primary" data-vac ${canVac?'':'disabled'}>休假（花 ${money(cost)}，+${gain} 精力）</button>
    `)}`,
    { onMount(m){
      $('[data-ok]',m).onclick = ()=> finishTurnAction();
      const v = $('[data-vac]',m);
      if(v) v.onclick = ()=>{
        const r = A.vacation(g);
        if(!r.ok) return U.toast(r.msg, 'err');
        finishTurnAction();
        U.toast(`休假结束：精力 +${r.gain}（现 ${Math.round(r.energy)} / ${r.max}）`, 'ok');
      };
    }});
}

/* ------------------------------ 入不敷出 ------------------------------ */
/* 月现金流为负（失业没工资、或月供超过收入），经过结算日时按一年动用储蓄补缺口。
   这是「收入中断」最直接的体现，所以优先于落格事件处理 —— 钱的问题不解决，
   后面的格子事件没有意义。缺口补上之后会自动回到原来落的那一格继续结算。 */
function showDeficit(g, p, P){
  const amount = P.amount;
  const enough = p.cash >= amount;
  const f = p.inFT ? E.ftFinance(p) : E.finance(p);
  U.openModal(`
    <div class="modal__head"><h3>📉 入不敷出</h3></div>
    <div class="modal__body">
      <p class="hint">本次年度结算的收入已经盖不住支出 —— 这通常发生在<b>失业没有工资</b>、
        或<b>贷款月供超过了收入</b>的时候。</p>
      <div class="sec__total"><span>年度结算缺口</span><span class="money neg">${money(amount)}</span></div>
      <div class="sec__total"><span>月现金流</span><span class="money neg">${money(f.cashflow)}</span></div>
      <div class="sec__total"><span>手头现金</span><span class="money ${enough?'':'neg'}">${money(p.cash)}</span></div>
      ${E.isJobless(p) ? `<p class="hint" style="margin-top:8px">📉 你当前处于<b>失业状态</b>，工资为 0。
        越早求职成功，这个缺口就越早止住。</p>` : ''}
      ${enough ? '' : shortfallPanel(g, p, amount)}
    </div>
    ${foot(`
      ${enough ? '' : `<button class="btn btn--danger" data-bankrupt>宣告破产</button>`}
      <button class="btn btn--primary" data-ok ${enough?'':'disabled'}>
        ${enough ? `动用储蓄补上 ${money(amount)}` : `还差 ${money(amount - p.cash)}`}</button>
    `)}`,
    { onMount(m){
      $('[data-ok]',m).onclick = ()=>{
        const r = A.payDeficit(g, amount);
        if(!r.ok) return U.toast(r.msg, 'err');
        const landed = P.landed;
        if(landed){
          /* 缺口补上 → 回到原先落的那一格继续结算（不重复计算这份缺口） */
          E.clearPending(g);
          E.resolveSpace(g, p, Object.assign({}, landed, { deficit:0 }));
          window.UiGame.renderAll();
          if(g.pending) showPending(); else U.closeModal();
        } else {
          finishTurnAction();
        }
      };
      bindShortfall(m, g, p, amount);
    }});
}

/* ------------------------------ 额外支出 ------------------------------ */
function showDoodad(g, p, P){
  const card = P.card;
  /* 消费档次（由社会等级决定）在落格时已算好并锁进 P.cost —— 界面只负责展示。
     若这里重算一遍，玩家在弹层停留期间等级一变，弹层写的数字就会和扣款对不上。
     旧存档没有该字段时兜底现算一次。 */
  const c = P.cost || E.doodadCost(g, p, card);
  const enough = p.cash >= c.cost;
  const tiered = c.factor > 1.001;
  U.openModal(`
    <div class="modal__head"><h3>💳 额外支出</h3></div>
    <div class="modal__body">
      ${face('doodad', card, c)}
      ${tiered ? `<div class="tier-note">
        <div class="tier-note__hd">
          <span>消费档次 · L${c.lv} ${esc(c.levelName)}</span><b>×${c.factor.toFixed(2)}</b>
        </div>
        <div class="tier-note__row"><span>卡片标价</span><b>${money(c.base)}</b></div>
        <div class="tier-note__row"><span>档次加成</span><b class="neg">+${money(c.added)}</b></div>
        <p class="hint">${esc(c.why)}</p>
        <p class="hint">${c.kind === 'basic'
          ? `属于<b>基础型</b>支出（税费 / 罚款 / 医疗 / 人情），与消费档次关系较弱，只承担 ${Math.round(c.damp * 100)}% 的加成。`
          : '属于<b>消费升级型</b>支出 —— 你名下的东西越贵，维护、置换与服务的成本就越高。'}</p>
      </div>` : ''}
      <div class="sec__total"><span>需要支付</span><span class="money neg">${money(c.cost)}</span></div>
      ${c.extraPay ? `<div class="sec__total"><span>此后每月额外支出</span><span class="money neg">${money(c.extraPay)}${c.extraPay !== c.extraBase ? `<span class="muted">（标价 ${money(c.extraBase)}）</span>` : ''}</span></div>` : ''}
      <div class="sec__total"><span>手头现金</span><span class="money ${enough?'':'neg'}">${money(p.cash)}</span></div>
      ${enough ? '' : shortfallPanel(g, p, c.cost)}
    </div>
    ${foot(`
      ${enough ? '' : `<button class="btn btn--danger" data-bankrupt>宣告破产</button>`}
      <button class="btn btn--primary" data-ok ${enough?'':'disabled'}>
        ${enough ? `支付 ${money(c.cost)}` : `还差 ${money(c.cost - p.cash)}`}</button>
    `)}`,
    { onMount(m){
      $('[data-ok]',m).onclick = ()=>{
        const r = A.payDoodad(g, card, c);      /* 用锁定值付款，保证账实一致 */
        if(!r.ok) return U.toast(r.msg, 'err');
        finishTurnAction();
        U.toast(`已支付 ${money(r.paid)}${r.cost && r.cost.added > 0 ? `（含消费档次加成 ${money(r.cost.added)}）` : ''}`, 'ok');
      };
      bindShortfall(m, g, p, c.cost);
    }});
}

/* ------------------------------ 公益捐赠 ------------------------------ */
/* 公益捐赠：把「真实的税务优惠」讲出来 —— 国内个人公益捐赠可在应纳税所得额 30% 以内
   税前扣除（《个人所得税法》第六条），所以净成本低于捐赠额。这不是游戏凭空给的福利。 */
function showCharity(g, p, P){
  const amount = P.amount;
  const refund = E.donationRefund(p, amount);
  const wings  = window.DONATION.wings || 1;
  const enGain = window.ENERGY.charityEnergy || 0;
  const enough = p.cash >= amount;
  U.openModal(`
    <div class="modal__head"><h3>🎗️ 公益捐赠</h3></div>
    <div class="modal__body">
      <p class="hint">捐出<b>总收入的 10%</b>。按《个人所得税法》，捐赠额不超过应纳税所得额
        <b>${Math.round(window.DONATION.limit*100)}%</b> 的部分可以<b>税前扣除</b> —— 所以净成本低于捐款本身。</p>
      <div class="sec__total"><span>捐赠金额</span><span class="money">${money(amount)}</span></div>
      <div class="sec__total"><span>税前扣除可节税</span><span class="money pos">−${money(refund)}</span></div>
      <div class="sec__total"><span>实际净支出</span><span class="money">${money(amount - refund)}</span></div>
      <div class="sec__total"><span>获得银翅膀</span><span>×${wings}（可掷 2 粒骰子 1 次）</span></div>
      ${enGain ? `<div class="sec__total"><span>状态回升</span><span class="money pos">精力 +${enGain}</span></div>` : ''}
      <div class="sec__total"><span>你的现金</span><span class="money ${enough?'':'neg'}">${money(p.cash)}</span></div>
      <p class="hint" style="margin-top:8px">🪶 银翅膀是一次性的「掷 2 粒骰子」机会：<b>走得快，但落点更难控制</b>。
        打算精准落到某个格子时，就不要用它。</p>
    </div>
    ${foot(`
      <button class="btn btn--text" data-no>放弃捐赠</button>
      <button class="btn btn--primary" data-yes ${enough?'':'disabled'}>捐赠 ${money(amount)}</button>
    `)}`,
    { onMount(m){
      $('[data-yes]',m).onclick = ()=>{
        const r = A.doCharity(g,true);
        if(!r.ok) return U.toast(r.msg,'err');
        finishTurnAction();
        U.toast(`已捐赠 ${money(r.amount)}，税前扣除节税 ${money(r.refund)}，获得银翅膀 ×${r.wings}`, 'ok');
      };
      $('[data-no]',m).onclick  = ()=>{ A.doCharity(g,false); finishTurnAction(); };
    }});
}

/* ------------------------------ 孩子 / 失业 ------------------------------ */
function showBaby(g, p, P){
  const capped = p.children >= 3;
  U.openModal(`
    <div class="modal__head"><h3>👶 孩子</h3></div>
    <div class="modal__body">
      <p class="hint">${capped?'每人最多 3 个孩子，本次不再增加支出。':`增加一个孩子，每月支出增加 ${money(p.job.perChild)}。`}</p>
      <div class="sec__total"><span>当前孩子数量</span><span class="money">${p.children} / 3</span></div>
    </div>
    ${foot(`<button class="btn btn--primary" data-ok>确定</button>`)}`,
    { onMount(m){ $('[data-ok]',m).onclick = ()=>{ A.addBaby(g); finishTurnAction(); }; } });
}
/* 失业：被裁真正可怕的地方不是那笔补偿（按 N+1 惯例你其实是【收到】钱），
   而是从此没有工资、而支出一分不少。所以这里把它做成「收入中断 + 求职期」，
   而不是旧版的「付一个月总支出」—— 后者方向正好反了。 */
function showDownsized(g, p, P){
  const base = P.amount;                                  /* 落格时锁定的「一个月总支出」 */
  const sev  = Math.round(base * (window.UNEMPLOYMENT.severance || 1));
  const f0   = E.finance(p);                              /* 此刻工资尚未归零 */
  const after = Math.round(f0.cashflow - f0.inc.salary);  /* 工资归零后的月现金流 */
  const U2 = window.UNEMPLOYMENT;
  const age = E.isAgeMode(g) ? E.ageOf(g) : 0;
  const need = U2.effortBase + (age > 40 ? U2.over40Extra : 0) + (age > 50 ? U2.over50Extra : 0);
  U.openModal(`
    <div class="modal__head"><h3>📉 裁员失业</h3></div>
    <div class="modal__body">
      <p class="hint">你被裁员了。按国内 N+1 的惯例，你会<b>拿到一笔离职补偿</b>；
        但真正的冲击是<b>工资归零，而支出一分不少</b>。</p>
      <div class="sec__total"><span>领取离职补偿</span><span class="money pos">+${money(sev)}</span></div>
      <div class="sec__total"><span>工资收入</span><span class="money neg">${money(f0.inc.salary)} → ¥0</span></div>
      <div class="sec__total"><span>失业后的月现金流</span><span class="money ${after<0?'neg':''}">${money(after)}</span></div>
      <div class="sec__total"><span>预计求职所需</span><span>${need} 个回合${age > 40 ? `（${age} 岁，年龄门槛 +${need - U2.effortBase}）` : ''}</span></div>
      <p class="hint" style="margin-top:8px">每回合可点「投递简历 · 求职」推进进度，每次消耗 <b>${U2.huntEnergy} 点精力</b>；
        精力不够时只能先休息，求职期会被拉长。<br>
        期间只能靠<b>储蓄、被动收入或变卖资产</b>撑过去 —— 这就是「应急金」存在的全部意义。</p>
    </div>
    ${foot(`<button class="btn btn--primary btn--block" data-ok>接受现实，开始求职</button>`)}`,
    { onMount(m){
      $('[data-ok]',m).onclick = ()=>{
        const r = A.doDownsized(g, P.amount);
        if(!r.ok) return U.toast(r.msg, 'err');
        window.UiGame.renderAll();
        finishTurnAction();
        U.toast(`已领取离职补偿 ${money(r.severance)}；工资归零，预计需要 ${r.need} 个回合求职`, 'err');
      };
    }});
}

/* ------------------------------ 财务自由圈：企业投资 ------------------------------ */
function showBusiness(g, p, P){
  const sp = FAST_TRACK[p.ftPos];
  const bizId = window.UiGame.bizOfSpace(sp, p.ftPos);
  const owned = bizId ? p.assets.ftBusiness.find(b=>b.bizId===bizId) : null;
  U.openModal(`
    <div class="modal__head"><h3>🏭 企业投资（财务自由圈）</h3></div>
    <div class="modal__body">
      <p class="hint">财务自由圈投资<b>只能用现金购买，不允许贷款</b>。购买企业可增加月现金流；第一个通过购买企业使月现金流增加 ≥ ${money(E.empireTarget())} 的玩家获胜。</p>
      <div class="sec__total"><span>你的现金</span><span class="money">${money(p.cash)}</span></div>
      <div class="sec__total"><span>已通过企业累计增加</span><span class="money">${money(p.ftGain||0)} / ${money(E.empireTarget())}</span></div>
      <div class="picklist">
        ${FT_BUSINESSES.map(b=>`
          <button class="pick" data-buy="${b.id}" ${p.cash<b.cost?'disabled style="opacity:.45"':''}>
            <span class="pick__ico">${b.ico}</span>
            <span><span class="pick__t">${b.nm}</span>
            <span class="pick__d">价格 ${money(b.cost)} · 月现金流 +${money(b.cf)}</span></span>
            <span class="pick__go">›</span></button>`).join('')}
      </div>
      ${(g.rule==='202' && owned)?`
        <div class="sec__title">开设特许经营（202）</div>
        <p class="hint">你已拥有【${owned.nm}】，可支付首付 ${money(Math.round(owned.cost*0.2))} 开设特许经营，获得额外现金流 +${money(Math.round(owned.cf*0.5))}。</p>
        <button class="btn btn--tonal btn--block" data-franchise="${owned.bizId}">开设特许经营</button>`:''}
    </div>
    ${foot(`<button class="btn btn--text" data-pass>本轮不投资</button>`)}`,
    { onMount(m){
      $$('[data-buy]',m).forEach(b=>b.onclick=()=>{
        const r = A.buyFTBusiness(g, b.dataset.buy);
        if(!r.ok) return U.toast(r.msg,'err');
        finishTurnAction();                       /* 必须走统一收尾：清 pending，否则本轮会卡死 */
        if(g.over){ window.UiGame.winnerModal(); return; }
        U.toast('企业购买成功','ok');
      });
      if($('[data-franchise]',m)) $('[data-franchise]',m).onclick = ()=>{
        const r = A.openFranchise(g, $('[data-franchise]',m).dataset.franchise);
        if(!r.ok) return U.toast(r.msg,'err');
        finishTurnAction();
        if(g.over){ window.UiGame.winnerModal(); return; }
        U.toast('特许经营已开设','ok');
      };
      $('[data-pass]',m).onclick = ()=>{ finishTurnAction(); };
    }});
}

/* ------------------------------ 财务自由圈：梦想格 ------------------------------ */
function showDream(g, p, P){
  const dream = P.dream;
  const mine = p.dreamIdx === dream.id;
  const enough = p.cash >= dream.cost;
  U.openModal(`
    <div class="modal__head"><h3>🌸 梦想格</h3></div>
    <div class="modal__body">
      <div class="cardface">
        <div class="cardface__no">财务自由圈梦想</div>
        <div class="cardface__title">${dream.ico} ${esc(dream.nm)}</div>
        <div class="kv"><span class="kv__k">费用</span><span class="kv__v">${money(dream.cost)}</span></div>
        <div class="kv"><span class="kv__k">你的现金</span><span class="kv__v ${enough?'':'neg'}">${money(p.cash)}</span></div>
      </div>
      ${mine ? `<p class="hint">这是<b>你的梦想</b>（奶酪所在格）。停在梦想格并支付费用即可买下梦想 —— 第一个买下梦想的玩家获胜。</p>`
             : `<p class="hint">这是其他玩家选定的梦想格，你无法购买。</p>`}
      <div class="sec__total"><span>你的梦想</span><span>${DREAMS[p.dreamIdx].ico} ${esc(DREAMS[p.dreamIdx].nm)} ${money(DREAMS[p.dreamIdx].cost)}</span></div>
    </div>
    ${foot(`
      <button class="btn btn--text" data-pass>本轮不购买</button>
      ${mine?`<button class="btn btn--primary" data-buy ${enough?'':'disabled'}>支付 ${money(dream.cost)} 买下梦想</button>`:''}
    `)}`,
    { onMount(m){
      $('[data-pass]',m).onclick = ()=>{ finishTurnAction(); };
      if($('[data-buy]',m)) $('[data-buy]',m).onclick = ()=>{
        const r = A.buyDream(g);
        if(!r.ok) return U.toast(r.msg,'err');
        finishTurnAction();                       /* 同样要清 pending，避免残留锁死回合 */
        window.UiGame.winnerModal();
      };
    }});
}

/* ------------------------------ 财务自由圈：特殊格 ------------------------------ */
function showFTEvent(g, p, P){
  const ev = P.ev;
  const amount = P.amount || 0;                  /* 落格时已锁定的金额，与实际扣款一致 */
  const enough = p.cash >= amount;
  U.openModal(`
    <div class="modal__head"><h3>${ev.ico} ${esc(ev.nm)}</h3></div>
    <div class="modal__body">
      <p class="hint">${esc(ev.desc)}</p>
      <div class="sec__total"><span>本次需支付</span><span class="money neg">${money(amount)}</span></div>
      <div class="sec__total"><span>手头现金</span><span class="money ${enough?'':'neg'}">${money(p.cash)}</span></div>
      ${enough ? '' : shortfallPanel(g, p, amount)}
    </div>
    ${foot(`
      ${enough ? '' : `<button class="btn btn--danger" data-bankrupt>宣告破产</button>`}
      <button class="btn btn--primary" data-ok ${enough?'':'disabled'}>
        ${enough ? '接受结果' : `还差 ${money(amount - p.cash)}`}</button>
    `)}`,
    { onMount(m){
      $('[data-ok]',m).onclick = ()=>{
        const r = A.ftEvent(g, P.key, amount);
        if(!r.ok) return U.toast(r.msg, 'err');
        finishTurnAction();
      };
      bindShortfall(m, g, p, amount);
    }});
}

window.UiPending = { showPending, face };
})();
