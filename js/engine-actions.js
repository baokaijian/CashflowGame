/* ==========================================================================
   engine-actions.js — 玩家操作（买卡、卖出、贷款、期权、做空、交易、出圈、买断）
   ========================================================================== */
(function(){
'use strict';
const E = window.Engine;
const money = E.money;
const log = E.log;

/* ------------------------------ 支付 / 现金检查 ------------------------------ */
function canPay(p, amount){ return p.cash >= amount; }
function pay(p, amount){ p.cash -= amount; return p.cash; }

/* ------------------------------ 精力校验 ------------------------------ */
/* 精力是独立于现金的第二重约束（对应现实中「有没有时间管」）。
   不足时返回一条【可执行】的提示，而不是静默失败 —— 玩家必须知道怎么恢复：
   精力靠回合自然恢复，也可以停在「起点」选择休假。 */
function energyCost(kind){
  const c = (window.ENERGY.buyCost || {})[kind];
  return typeof c === 'number' ? c : 0;
}
/* 卡片 kind → 精力成本的键。界面与逻辑共用这一份映射，
   避免「界面显示 14 点、实际只扣 10 点」这类两套口径的问题。 */
const KIND_ENERGY = { stock:'stocks', collectible:'collectibles', land:'lands', savings:'savings',
                      business:'business', realestate:'realEstate', option:'option', straddle:'option' };
function dealEnergy(card){ return energyCost(KIND_ENERGY[card && card.kind]); }
function needEnergy(p, need, what){
  const n = Math.max(0, Math.round(need || 0));
  if(!n) return { ok:true, cost:0 };
  const r = E.spendEnergy(p, n);
  if(r.ok) return { ok:true, cost:n };
  return { ok:false, cost:n, lack:r.lack,
    msg:`精力不足：${what}需要 ${r.need} 点精力（当前 ${Math.round(p.energy)}，还差 ${r.lack} 点）。` +
        `精力每回合自然恢复，也可以停在「起点」选择休假。` };
}

/* ------------------------------ 投资机会格：选择牌堆 & 买卡 ------------------------------ */
/* 考察投资机会：先付出「研究时间」（精力）才看得到项目。
   借鉴财富流的「考察费」，但真正昂贵的从来不是那 100 / 500 元，而是时间 ——
   所以这里收的是精力，而且【放弃机会也不退还】：研究过了就是沉没成本，这符合现实。 */
function chooseDeck(g, deckName){
  const p = E.current(g);
  const NAMES = { small:'小额理财', big:'大额置业', capgain:'杠杆交易', cashflow:'大额现金流' };
  const cost = (window.ENERGY.dealCost || {})[deckName] || 0;
  const en = needEnergy(p, cost, `考察「${NAMES[deckName] || deckName}」`);
  if(!en.ok) return { ok:false, msg:en.msg, lack:en.lack, need:en.cost };
  E.bump(p, 'dealsSeen');
  const card = E.drawDeal(g, deckName);
  if(g.pending) { g.pending.deal = card; g.pending.deckName = deckName; }
  return { ok:true, card, energyCost:cost };
}
/* 一次性拿到全部可执行的方案（含联合购买） */
function dealCost(g, card, qty){
  card=E.priceDeal(g,card);
  const q = qty || card.min || 1;
  if(card.kind === 'stock') return card.price * q;
  if(card.kind === 'collectible' && card.unit) return card.price * q;
  if(card.kind === 'option' || card.kind === 'straddle') return (card.premium||0) * 100;
  return card.dp || card.cost || 0;
}
function buyDeal(g, card, exec){
  card=E.priceDeal(g,card);
  const p = E.current(g);
  exec = exec || {};
  const qty = exec.qty || card.min || 1;
  const cost = dealCost(g, card, qty);
  if(!Number.isFinite(cost)||cost<0 || !Number.isInteger(qty)||qty<=0)
    return {ok:false,msg:'购买金额或数量无效。'};
  if((card.kind==='stock'||card.unit) && ((card.min!=null && qty<card.min)||(card.max!=null && qty>card.max)))
    return {ok:false,msg:'购买数量超出该机会的范围。'};
  if(!canPay(p, cost)) return { ok:false, msg:'现金不足，可先向银行贷款或把投资卡卖给其他玩家。' };
  /* 买入前先校验精力（筹建 / 跑手续的时间成本）—— 在扣现金之前拦下，避免扣了钱又做不成 */
  const en = needEnergy(p, dealEnergy(card), `买入「${card.nm || card.symbol || '资产'}」`);
  if(!en.ok) return { ok:false, msg:en.msg, lack:en.lack, need:en.cost };
  pay(p, cost);
  const base = card.base || card.nm || card.symbol;
  switch(card.kind){
    case 'stock':
      p.stockPrice = p.stockPrice || {}; p.stockPrice[card.symbol] = card.price;
      addStock(p, card.symbol, qty, card.price);
      if(!E.quoteOf(g,'stocks',card)) E.recordQuote(g,'stocks',card,card.price,'最近买入价');
      log(g, `${p.name} 以 ${money(card.price)}/股 买入 ${card.symbol} ${qty} 股，支出 ${money(cost)}`, 'info', p.name);
      break;
    case 'collectible':
      if(card.unit){ addCollectible(p, card.nm, qty, card.price); p.collectPrice = card.price;
        if(!E.quoteOf(g,'collectibles',card)) E.recordQuote(g,'collectibles',card,card.price,'最近买入价');
        log(g, `${p.name} 买入 ${card.nm} ${qty} 单位，支出 ${money(cost)}`, 'info', p.name); }
      else { addCollectible(p, card.nm, 1, card.cost);
        log(g, `${p.name} 买入 ${card.nm}，支出 ${money(cost)}`, 'info', p.name); }
      break;
    case 'land':
      p.assets.lands.push({ nm:card.nm, cost });
      log(g, `${p.name} 买入 ${card.nm}，支出 ${money(cost)}`, 'info', p.name);
      break;
    case 'savings':
      p.assets.savings.push({ nm:card.nm, cost, interest:card.interest });
      log(g, `${p.name} 认购 ${card.nm}，支出 ${money(cost)}，月现金流 +${money(card.interest)}`, 'good', p.name);
      break;
    case 'business':
      p.assets.business.push({ nm:card.nm, cost, cf:card.cf });
      log(g, `${p.name} 投资 ${card.nm}，支出 ${money(cost)}，月现金流 +${money(card.cf)}`, 'good', p.name);
      break;
    case 'realestate':{
      const share = 1; // 份额买入走机构 / 联合购买 / 再挂牌专用入口。
      p.assets.realEstate.push({ nm:card.nm, dp:cost, cost:card.cost, cf:Math.round(card.cf*share), rent:card.rent||0, share, joint:!!(exec.partners&&exec.partners.length) });
      E.registerProperty(g,p,p.assets.realEstate[p.assets.realEstate.length-1]);
      log(g, `${p.name} 买入 ${card.nm}，首付 ${money(cost)}，月现金流 +${money(Math.round(card.cf*share))}`, 'good', p.name);
      break;
    }
    case 'option':
      p.options.push({ id:'op'+Date.now()+Math.floor(Math.random()*999), symbol:card.symbol, dir:card.dir,
        strike:card.strike, premium:card.premium, shares:100, expiresAt:g.turnNo+3, label:card.nm });
      log(g, `${p.name} 买入 ${card.nm}（权利金 ${money(cost)}，3 回合内有效）`, 'info', p.name);
      break;
    case 'straddle':
      p.options.push({ id:'op'+Date.now()+Math.floor(Math.random()*999), symbol:card.symbol, dir:'call',
        strike:card.strike, premium:card.premium/2, shares:100, expiresAt:g.turnNo+3, label:card.symbol+' 跨式·看涨' });
      p.options.push({ id:'op'+Date.now()+Math.floor(Math.random()*997), symbol:card.symbol, dir:'put',
        strike:card.strike, premium:card.premium/2, shares:100, expiresAt:g.turnNo+3, label:card.symbol+' 跨式·看跌' });
      log(g, `${p.name} 建立 ${card.symbol} 跨式期权（权利金 ${money(cost)}）`, 'info', p.name);
      break;
  }
  /* ★ 给本次买入的资产打上「买入轮次」—— 抵押物折旧依赖持有年数。
     放在 switch 之后一次遍历，而不是在每个分支里手写：
     addStock / addCollectible 两个辅助函数也在此覆盖之内，漏不掉。
     stampAsset 只标记尚无 buyRound 的项，所以不会覆盖已持有资产的原始轮次。 */
  ['stocks','collectibles','lands','savings','business','realEstate']
    .forEach(k => (p.assets[k] || []).forEach(it => E.stampAsset(g, it)));

  const cfAdd = Math.round((card.cf || 0) * (exec.share || 1));
  E.bump(p, 'dealsBought'); E.bump(p, 'investTotal', cost); E.bump(p, 'cfGained', cfAdd);
  E.milestone(g, p, `第 ${g.round} 轮投入 ${money(cost)} 买入「${card.nm || card.symbol || '资产'}」` +
    (cfAdd ? `，月现金流 +${money(cfAdd)}` : ''), cfAdd > 0 ? 'good' : 'info');
  return { ok:true, cost };
}
function addStock(p, symbol, shares, price){
  const ex = p.assets.stocks.find(s=>s.symbol===symbol);
  if(ex){ ex.cost = Math.round((ex.cost*ex.shares + price*shares)/(ex.shares+shares)*100)/100; ex.shares += shares; }
  else p.assets.stocks.push({ symbol, shares, cost:price });
}
function addCollectible(p, nm, qty, price){
  const ex = p.assets.collectibles.find(c=>c.nm===nm);
  if(ex){ ex.qty += qty; ex.cost += price*qty; }
  else p.assets.collectibles.push({ nm, qty, cost:price*qty });
}

/* ------------------------------ 投资卡转让（玩家间交易） ------------------------------ */
function sellOpportunity(g, card, buyerId, price){
  const seller = E.current(g);
  const buyer = g.players[buyerId];
  if(!buyer || buyer.out || buyer.finished || buyer.id===seller.id) return { ok:false, msg:'请选择其他玩家。' };
  if(!canPay(buyer, price)) return { ok:false, msg:`${buyer.name} 现金不足 ${money(price)}。` };
  pay(buyer, price); pay(seller, -price);
  E.bump(seller, 'dealsSold'); E.bump(seller, 'dealsSoldTotal', price);
  E.milestone(g, seller, `第 ${g.round} 轮把投资卡「${card.nm || card.symbol || '投资机会'}」以 ${money(price)} 转让给 ${buyer.name}，换取现金`, 'good');
  log(g, `${buyer.name} 以 ${money(price)} 向 ${seller.name} 购买投资卡【${card.nm||card.symbol||'投资机会'}】`, 'info');
  /* 投资卡随即由买家执行（买家支付自身首付） */
  const r = buyDealFor(g, buyer, card, {});
  if(!r.ok){ buyer.cash += price; seller.cash -= price;
    return { ok:false, msg:`${buyer.name} 无力执行该机会：${r.msg}` }; }
  E.clearPending(g);
  return { ok:true };
}
/* 让指定玩家执行某张卡（供机会转让使用） */
function buyDealFor(g, p, card, exec){
  const bak = g.cur; g.cur = p.id;
  const r = buyDeal(g, card, exec);
  g.cur = bak; return r;
}

/* ------------------------------ 行情卡结算 ------------------------------ */
/* 强制平仓 + 租金波动 + 可交易清单 */
function marketImpact(g, card){
  const out = { forced:[], options:[], note:'' };
  if(!card) return out;
  applyMarketQuote(g,card);

  /* 1) 股票报价 → 做空者强制买回平仓 */
  if(card.kind === 'stock'){
    g.players.forEach(p=>{
      if(p.out || p.finished) return;
      const pos = p.shorts.filter(s=>s.symbol===card.symbol);
      pos.forEach(s=>{
        const diff = (s.price - card.price) * s.shares;
        p.cash += diff;
        out.forced.push({ who:p.name, text:`${p.name} 做空 ${s.symbol} ${s.shares} 股被强制平仓（${money(s.price)} → ${money(card.price)}），${diff>=0?'获利':'亏损'} ${money(Math.abs(diff))}` , good:diff>=0});
        log(g, out.forced[out.forced.length-1].text, diff>=0?'good':'bad', p.name);
      });
      p.shorts = p.shorts.filter(s=>s.symbol!==card.symbol);
      p.stockPrice = p.stockPrice||{}; p.stockPrice[card.symbol] = card.price;
    });
  }
  /* 2) 租金随市场波动（202） */
  if(card.kind === 'rentDelta'){
    g.players.forEach(p=>p.assets.realEstate.forEach(re=>E.registerProperty(g,p,re)));
    /* ★ 租金与估值联动：租金下行通常意味着片区需求走弱，估值也会跟着下调 ——
       现实中这两者的相关性很强（这也是「租金回报率」能作为估值锚的原因）。
       联动强度取 MARKET.rentToValue（房价对租金的弹性小于 1：
       租金跌 20% 时房价通常不会立刻跌 20%，因为房价里还含预期与稀缺性）。 */
    const k = (window.MARKET && window.MARKET.rentToValue) || 0.8;
    E.bumpMarket(g, 'realEstate', 1 + card.pct * k);
    g.players.forEach(p=>{
      if(p.out || p.finished) return;
      p.assets.realEstate.forEach(re=>{
        re.baseCf = (re.baseCf===undefined? re.cf : re.baseCf);
        re.cf = Math.round(re.baseCf * (1 + card.pct));
        const prop=E.registerProperty(g,p,re);
        re.rent=Math.max(0,Math.round(re.cf+E.projectDebt(re)*re.financingRate));
        prop.rent=Math.max(0,Math.round((re.cf+E.projectDebt(re)*re.financingRate)/Math.max(E.holdingShare(re),1e-9)));
      });
    });
    // 空置待售份额也经历租金行情，不能在卖出期间冻结经营条件。
    Object.values(E.assetMarket(g).properties).forEach(prop=>{
      const held=g.players.some(p=>p.assets.realEstate.some(r=>r.propertyId===prop.id));
      if(!held) prop.rent=Math.max(0,Math.round(prop.rent*(1+card.pct)));
    });
    out.note = `全体出租房产租金收入 ${card.pct>0?'+':''}${Math.round(card.pct*100)}%`
             + `，房产估值联动 ${card.pct>0?'+':''}${Math.round(card.pct*k*100)}%`;
  }
  /* 3) 生成可执行交易清单 */
  out.options = marketOptions(g, card);
  return out;
}

function matchProp(re, prop){
  if(!prop) return true;
  return (re.nm||'').indexOf(prop) >= 0 || (prop||'').indexOf(re.nm||'') >= 0;
}
/* 写入统一行情，不执行强平、扣款等事件副作用，可用于恢复旧 pending。 */
function applyMarketQuote(g,card){
  if(card.kind==='stock') E.recordQuote(g,'stocks',card,card.price,'行情报价');
  const mapping={realestate:'realEstate',collectible:'collectibles',land:'lands',business:'business',savings:'savings'};
  const kind=mapping[card.kind];
  if(!kind) return;
  if(kind==='realEstate') Object.values(E.assetMarket(g).properties).forEach(prop=>{
    if(matchProp(prop,card.prop)) E.recordQuote(g,kind,prop,card.price,'行情报价');
  });
  if(kind==='collectibles' && card.prop) E.recordQuote(g,kind,{nm:card.prop},card.price,'行情报价');
  g.players.forEach(p=>{
    if(p.out||p.finished) return;
    const kinds=kind==='savings'?['savings','funds']:[kind];
    kinds.forEach(k=>(p.assets[k]||[]).forEach(item=>{
      if((k==='realEstate'||k==='collectibles')&&!matchProp(item,card.prop)) return;
      const price=(card.kind==='business'||card.kind==='savings')?Math.round(item.cost*(card.rate||1)):card.price;
      const q=E.recordQuote(g,k,item,price,'行情报价');
      if(q && (card.kind==='business'||card.kind==='savings')) q.rate=card.rate==null?1:card.rate;
    }));
  });
}
/* 交易使用持久编号定位房产，不能依赖筛选顺序或出售后会变化的数组下标。
   旧存档在首次生成行情选项时补编号；编号和序号随对局保存。 */
function propertyId(g, re){
  const p=g.players.find(player=>player.assets.realEstate.includes(re));
  E.registerProperty(g,p,re);
  return re.holdingId;
}
/* 行情卡报整套价格；cost / dp 已是本人份额，报价只在这里折算一次。 */
function propertySale(g,re, wholePrice){
  const share = re.share == null ? 1 : re.share;
  if(!Number.isFinite(share) || share < 0 || share > 1 || !Number.isFinite(wholePrice) || wholePrice < 0) return null;
  return E.propertySettlement(g,re,wholePrice);
}
function marketOptions(g, card){
  const list = [];
  if(!card) return list;
  g.players.forEach(p=>{
    if(p.out || p.finished) return;
    switch(card.kind){
      case 'stock':
        p.assets.stocks.filter(s=>s.symbol===card.symbol).forEach(s=>{
          const profit = (card.price - s.cost) * s.shares;
          list.push({ id:`s_${p.id}_${E.holdingId(g,s)}`, pid:p.id, pname:p.name, ico:'📈',
            label:`${s.symbol} 股票 ${s.shares} 股`, sub:`成本 ${money(s.cost)} → 现价 ${money(card.price)}（${profit>=0?'+':''}${money(profit)}）`,
            price:card.price, max:s.shares, kind:'stock', assetId:E.holdingId(g,s), symbol:s.symbol });
        });
        p.options.filter(o=>o.symbol===card.symbol).forEach(o=>{
          const intrinsic = o.dir==='call' ? Math.max(0, card.price-o.strike) : Math.max(0, o.strike-card.price);
          list.push({ id:`o_${o.id}`, pid:p.id, pname:p.name, ico:'📜',
            label:o.label, sub:`行权价 ${money(o.strike)} · 现价 ${money(card.price)} · 内在价值 ${money(intrinsic*100)}`,
            kind:'option', optionId:o.id, intrinsic });
        });
        break;
      case 'realestate':
        p.assets.realEstate.forEach((re,ix)=>{
          if(!matchProp(re, card.prop)) return;
          const sale = propertySale(g,re, card.price);
          if(!sale) return;
          const assetId = propertyId(g, re);
          list.push({ id:`r_${p.id}_${assetId}`, pid:p.id, pname:p.name, ico:'🏠',
            label:re.nm, sub:`整套报价 ${money(card.price)} · 本人份额 ${(sale.share*100).toFixed(1)}% → 本人成交款 ${money(sale.price)}；偿还项目融资 ${money(sale.debt)}，交易费用 ${money(sale.fee)}；${sale.proceeds >= 0 ? '实际收回' : '需补款'} ${money(Math.abs(sale.proceeds))}`,
            kind:'realestate', prop:re.nm, price:sale.price, wholePrice:card.price, assetId, ix });
        });
        break;
      case 'business':
        p.assets.business.forEach((b,ix)=>{
          const price = Math.round(b.cost*card.rate);
          list.push({ id:`b_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'🏪',
            label:b.nm, sub:`购入 ${money(b.cost)} → 收购价 ${money(price)}（${money(price-b.cost)}）`,
            kind:'business', assetId:E.holdingId(g,b), ix, price });
        });
        break;
      case 'collectible':
        p.assets.collectibles.forEach((c,ix)=>{
          if(!matchProp(c,card.prop)) return;
          list.push({ id:`c_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'🪙',
            label:`${c.nm} × ${c.qty||1}`, sub:`成本 ${money(c.cost)} → 报价 ${money(card.price)}/单位（合计 ${money(card.price*(c.qty||1))}）`,
            kind:'collectible', assetId:E.holdingId(g,c), ix, price:card.price, max:c.qty||1 });
        });
        break;
      case 'land':
        p.assets.lands.forEach((l,ix)=>{
          list.push({ id:`l_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'🌾',
            label:l.nm, sub:`成本 ${money(l.cost)} → 收购价 ${money(card.price)}（${money(card.price-l.cost)}）`,
            kind:'land', assetId:E.holdingId(g,l), ix, price:card.price });
        });
        break;
      case 'savings':
        p.assets.savings.concat(p.assets.funds).forEach((s,ix)=>{
          const price = Math.round(s.cost*(card.rate||1));
          list.push({ id:`v_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'🏦',
            label:s.nm, sub:`本金 ${money(s.cost)} → 到期兑现 ${money(price)}`,
            kind:'savings', assetId:E.holdingId(g,s), ix, price });
        });
        break;
      case 'disaster':
        p.assets.realEstate.forEach((re,ix)=>{
          if(!matchProp(re, card.target)) return;
          const assetId = propertyId(g, re);
          list.push({ id:`x_${p.id}_${assetId}`, pid:p.id, pname:p.name, ico:'💥',
            label:`${re.nm} 受灾`, sub:`选择该房产承受损失（资产归零）`, kind:'disaster', assetId, ix });
        });
        p.assets.lands.forEach((l,ix)=>{
          if(!matchProp(l,card.target)&&card.target!=='土地') return;
          list.push({ id:`x_${p.id}_l${ix}`, pid:p.id, pname:p.name, ico:'💥',
            label:`${l.nm} 受灾`, sub:`选择该土地承受损失（资产归零）`, kind:'land-disaster', assetId:E.holdingId(g,l), ix });
        });
        break;
    }
  });
  return list;
}

/* 执行交易（内部实现，记账统一交给下面的 marketSell 包装） */
function doMarketSell(g, opt){
  if(!opt) return {ok:false};
  if(!['option','disaster','land-disaster'].includes(opt.kind) && (!Number.isFinite(opt.price)||opt.price<0))
    return {ok:false,msg:'成交金额无效，请重新查看行情。'};
  const p = g.players[opt.pid];
  if(!p || p.out || p.finished) return { ok:false };
  switch(opt.kind){
    case 'stock':{
      const s = p.assets.stocks.find(x=>x.holdingId===opt.assetId && x.symbol===opt.symbol);
      if(!s) return { ok:false };
      const qty = Math.min(opt.qty==null?s.shares:opt.qty, s.shares);
      if(!Number.isInteger(qty)||qty<=0||!Number.isFinite(opt.price)||opt.price<0) return {ok:false};
      const proceeds = qty*opt.price;
      const cost = qty*s.cost;
      p.cash += proceeds; s.shares -= qty;
      if(s.shares<=0) p.assets.stocks = p.assets.stocks.filter(x=>x!==s);
      log(g, `${p.name} 卖出 ${opt.symbol} ${qty} 股，收入 ${money(proceeds)}（${proceeds-cost>=0?'资本利得':'资本亏损'} ${money(Math.abs(proceeds-cost))}）`, proceeds>=cost?'good':'bad', p.name);
      return { ok:true, proceeds, text:`收入 ${money(proceeds)}` };
    }
    case 'option':{
      const o = p.options.find(x=>x.id===opt.optionId);
      if(!o) return { ok:false };
      const gain = opt.intrinsic * o.shares;
      p.cash += gain;
      p.options = p.options.filter(x=>x!==o);
      log(g, `${p.name} 行使 ${o.label}，获得 ${money(gain)}`, gain>0?'good':'bad', p.name);
      return { ok:true, proceeds:gain, text:`行权获得 ${money(gain)}` };
    }
    case 'realestate':{
      const ix = opt.assetId ? p.assets.realEstate.findIndex(re=>re.holdingId===opt.assetId) : -1;
      if(ix < 0) return { ok:false, msg:'该房产已不在名下，请重新查看行情。' };
      const re = p.assets.realEstate[ix], sale = propertySale(g,re, opt.wholePrice);
      if(!sale) return { ok:false, msg:'房产份额或报价无效。' };
      if(sale.proceeds < 0 && !canPay(p, -sale.proceeds))
        return { ok:false, msg:`售房款不足偿还项目融资，还需补款 ${money(-sale.proceeds)}，请先筹足现金。` };
      p.cash += sale.proceeds;
      E.recordPropertySale(g,p,re,sale,opt.wholePrice);
      p.assets.realEstate.splice(ix,1);
      const text = `${sale.proceeds >= 0 ? '实际收回' : '补款'} ${money(Math.abs(sale.proceeds))}`;
      log(g, `${p.name} 出售 ${re.nm}：整套报价 ${money(opt.wholePrice)} × 本人份额 ${(sale.share*100).toFixed(1)}% = ${money(sale.price)}，偿还项目融资 ${money(sale.debt)}、交易费用 ${money(sale.fee)}，${text}`, sale.gain>=0?'good':'bad', p.name);
      return { ok:true, proceeds:sale.proceeds, text };
    }
    case 'business':{
      const ix=p.assets.business.findIndex(x=>x.holdingId===opt.assetId);
      const b = p.assets.business[ix]; if(!b) return { ok:false };
      p.cash += opt.price;
      p.assets.business.splice(ix,1);
      log(g, `${p.name} 出售企业 ${b.nm}，收入 ${money(opt.price)}`, 'good', p.name);
      return { ok:true, proceeds:opt.price };
    }
    case 'collectible':{
      const ix=p.assets.collectibles.findIndex(x=>x.holdingId===opt.assetId);
      const c = p.assets.collectibles[ix]; if(!c) return { ok:false };
      const qty = Math.min(opt.qty==null?(c.qty||1):opt.qty, c.qty||1);
      if(!Number.isInteger(qty)||qty<=0||!Number.isFinite(opt.price)||opt.price<0) return {ok:false};
      const proceeds = opt.price*qty;
      p.cash += proceeds;
      c.cost -= (c.cost/(c.qty||1))*qty; c.qty = (c.qty||1)-qty;
      if(c.qty<=0) p.assets.collectibles.splice(ix,1);
      log(g, `${p.name} 卖出 ${c.nm} ×${qty}，收入 ${money(proceeds)}`, 'good', p.name);
      return { ok:true, proceeds:proceeds };
    }
    case 'land':{
      const ix=p.assets.lands.findIndex(x=>x.holdingId===opt.assetId);
      const l = p.assets.lands[ix]; if(!l) return { ok:false };
      p.cash += opt.price; p.assets.lands.splice(ix,1);
      log(g, `${p.name} 出售 ${l.nm}，收入 ${money(opt.price)}`, 'good', p.name);
      return { ok:true, proceeds:opt.price };
    }
    case 'land-disaster':{
      const ix=p.assets.lands.findIndex(x=>x.holdingId===opt.assetId);
      const l = p.assets.lands[ix]; if(!l) return { ok:false };
      p.assets.lands.splice(ix,1);
      log(g, `${p.name} 的 ${l.nm} 因灾害损毁，资产归零`, 'bad', p.name);
      return { ok:true };
    }
    case 'savings':{
      const all = p.assets.savings.concat(p.assets.funds);
      const item = all.find(x=>x.holdingId===opt.assetId); if(!item) return { ok:false };
      p.cash += opt.price;
      p.assets.savings = p.assets.savings.filter(x=>x!==item);
      p.assets.funds = p.assets.funds.filter(x=>x!==item);
      log(g, `${p.name} 兑现 ${item.nm}，收入 ${money(opt.price)}`, 'good', p.name);
      return { ok:true, proceeds:opt.price };
    }
    case 'disaster':{
      const ix = opt.assetId ? p.assets.realEstate.findIndex(re=>re.holdingId===opt.assetId) : -1;
      if(ix < 0) return { ok:false };
      const re = p.assets.realEstate[ix];
      p.assets.realEstate.splice(ix,1);
      log(g, `${p.name} 的 ${re.nm} 完全损毁，资产归零`, 'bad', p.name);
      return { ok:true };
    }
  }
  return { ok:false };
}
/* 行情卡交易统一入口：记账放在这里，一次覆盖股票 / 期权 / 房产 / 企业 / 收藏品 / 土地 / 兑现全部类型 */
function marketSell(g, opt){
  const r = doMarketSell(g, opt);
  const isLoss = opt.kind === 'disaster' || opt.kind === 'land-disaster';
  if(r && r.ok && !isLoss){
    const p = g.players[opt.pid];
    if(p){
      E.bump(p, 'marketSells');
      if(r.proceeds != null) E.bump(p, 'marketProceeds', r.proceeds);
      else if(opt.price) E.bump(p, 'marketProceeds', opt.price);
      E.milestone(g, p, `第 ${g.round} 轮行情兑现：${opt.label || opt.kind}${r.text ? '（' + r.text + '）' : ''}`, 'good');
    }
  }
  return r;
}

/* ------------------------------ 额外支出 / 慈善 / 孩子 / 失业 ------------------------------ */
/* 强制支出统一走 E.payCash：现金不足时【拒绝扣款并返回差额】，绝不产生负数现金 */
/* 意外支出：实际金额 = 卡片标价 × 消费档次系数（消费升级规则，系数由社会等级决定）。
   ★ locked 由落格时算好并锁进 pending —— 保证「弹层上写的数字」与「实际扣款」是同一个数。
     若这里重新算一遍，玩家在弹层停留期间等级发生变化，就会出现账实不符。 */
function payDoodad(g, card, locked){
  const p = E.current(g);
  const c = locked || E.doodadCost(g, p, card);
  const r = E.payCash(p, c.cost);
  if(!r.ok) return { ok:false, shortfall:r.shortfall, cost:c, msg:`现金不足，还差 ${money(r.shortfall)}，请先贷款或变卖资产。` };
  if(c.extraPay) p.liabs.extraPay = (p.liabs.extraPay||0) + c.extraPay;
  E.bump(p, 'forcedCount'); E.bump(p, 'forcedTotal', r.paid);
  if(c.added > 0) E.bump(p, 'doodadTierPaid', c.added);   /* 因消费档次多付的部分，单独记账 */
  const tier = c.factor > 1.001
    ? `（标价 ${money(c.base)} × 消费档次 ${c.factor.toFixed(2)}）`
    : '';
  E.milestone(g, p, `第 ${g.round} 轮意外支出「${card.nm}」${money(r.paid)}${tier}${c.extraPay ? `，此后每月多支出 ${money(c.extraPay)}` : ''}`, 'bad');
  log(g, `${p.name} 支付额外支出【${card.nm}】${money(r.paid)}${tier}${c.extraPay?`，此后每月额外支出 +${money(c.extraPay)}`:''}`, 'bad', p.name);
  return { ok:true, paid:r.paid, cost:c };
}
/* 公益捐赠：三重真实效应 ——
   ① 税前扣除：捐赠额在应纳税所得额 30% 以内可据实扣除（《个人所得税法》第六条），
      按边际税率估算节税额，这是国内捐款实实在在的税务优惠；
   ② 银翅膀：一次「掷 2 粒骰子」的机会（财富流的原创机制），走得快但落点更难控制；
   ③ 状态回升：行善带来的心理收益。 */
function doCharity(g, yes){
  const p = E.current(g);
  const amount = Math.round(E.finance(p).totalIncome*0.10);
  if(!yes){ log(g, `${p.name} 放弃公益捐赠`, 'info', p.name); return { ok:true }; }
  if(!canPay(p, amount)) return { ok:false, msg:`现金不足以捐赠 ${money(amount)}，可先变卖资产或贷款。` };
  p.cash -= amount;
  const refund = E.donationRefund(p, amount);
  if(refund > 0) p.cash += refund;                      /* 税前扣除的节税（相当于汇算退税） */
  const wings = (window.DONATION.wings || 1);
  p.wings = (p.wings || 0) + wings;
  const gain = (window.ENERGY.charityEnergy || 0);
  p.energy = Math.min(E.energyMax(g, p), (p.energy||0) + gain);
  E.bump(p, 'donations'); E.bump(p, 'donationTotal', amount);
  E.milestone(g, p, `第 ${g.round} 轮公益捐赠 ${money(amount)}${refund ? `（税前扣除，节税 ${money(refund)}）` : ''}，获得银翅膀 ×${wings}`, 'good');
  log(g, `${p.name} 公益捐赠 ${money(amount)}${refund ? `，税前扣除节税 ${money(refund)}` : ''}，获得银翅膀（可掷 2 粒骰子 1 次）`, 'good', p.name);
  return { ok:true, amount, refund, wings, energyGain:gain };
}
function addBaby(g){
  const p = E.current(g);
  if(p.children >= 3){ log(g, `${p.name} 已有 3 个孩子（上限），本次不再增加支出`, 'info', p.name); return { ok:true, capped:true }; }
  p.children++;
  E.bump(p, 'babies');
  E.milestone(g, p, `第 ${g.round} 轮添丁，每月养育支出 +${money(p.job.perChild)}`, 'bad');
  log(g, `${p.name} 增加一个孩子（共 ${p.children} 个），每月支出 +${money(p.job.perChild)}`, 'bad', p.name);
  return { ok:true };
}
/* 失业：不再收一笔「总支出」，而是【失去主动收入 + 进入求职期】。
   现实依据：被裁真正可怕的地方从来不是那笔离职补偿 —— 按国内 N+1 的惯例，
   你其实是【收到】钱；真正的冲击是从此没有工资、而支出一分不少。
   旧版把失业做成「付一个月总支出」，方向正好反了。 */
function doDownsized(g, amount){
  const p = E.current(g);
  const base = (amount == null) ? E.finance(p).totalExpenses : amount;
  const severance = Math.round(base * (window.UNEMPLOYMENT.severance || 1));
  const r = E.startJobless(g, p, severance);
  /* 退休后走的是另一条路：不进入求职期，只做一次退休金调整 */
  return { ok:true, retired:!!r.retired, hit:r.hit || 0, shortfall:r.shortfall || 0,
           brk:null,
           severance:r.severance, need:r.need, cashflow:E.finance(p).cashflow };
}

/* ------------------------------ 贷款 ------------------------------ */
/* 信用贷要过授信这一关：额度由收入决定，不是「想要多少有多少」。
   拒绝的原因由 Engine.creditProfile 统一给出，界面与这里读同一份判定 ——
   否则会出现「面板说不能借、点了却借到了」这类两套口径的问题。 */
function takeLoan(g, amount){
  const p = E.current(g);
  if(amount<=0) return { ok:false, msg:'贷款金额需大于 0。' };
  const prof = E.creditProfile(g, p);
  if(prof && !prof.ok){
    return { ok:false, credit:prof, msg: prof.reasons[0] || '当前无法获得授信。' };
  }
  if(prof && amount > prof.available){
    return { ok:false, credit:prof,
      msg:`超出授信额度：本次最多可借 ${money(prof.available)}` +
          `（授信总额 ${money(prof.limit)}，已用 ${money(prof.used)}）。` };
  }
  p.liabs.bank += amount; p.cash += amount;
  /* 记录申请轮次 —— 多头借贷识别要看「近期借了几次」：
     短期内反复借还是「借新还旧」最直接的行为信号（对应征信里的贷款审批查询次数）。
     只保留最近一段窗口的记录，避免数组随对局无限增长（存档体积也会失控）。 */
  if(!Array.isArray(p.loanDrawRounds)) p.loanDrawRounds = [];
  p.loanDrawRounds.push(Math.max(0, Number(g.round) || 0));
  const keep = Math.max(4, ((window.CREDIT && window.CREDIT.multi && window.CREDIT.multi.drawWindow) || 6) * 3);
  if(p.loanDrawRounds.length > keep) p.loanDrawRounds = p.loanDrawRounds.slice(-keep);
  E.bump(p, 'loans'); E.bump(p, 'loanTotal', amount);
  E.milestone(g, p, `第 ${g.round} 轮借入信用贷 ${money(amount)}`
    + `（信用 ${prof ? prof.grade.key : '—'}${prof && prof.multi && prof.multi.level !== '正常' ? ` · 多头借贷 ${prof.multi.level}` : ''}），`
    + `此后每月多付 ${money(Math.round(amount*BANK.loanRate))}`, 'info');
  log(g, `${p.name} 取得信用贷 ${money(amount)}，月息 ${(BANK.loanRate*100).toFixed(1)}%（每月还款 ${money(Math.round(amount*BANK.loanRate))}）`, 'info', p.name);
  return { ok:true };
}
/* 提前还款：六类贷款通用（房贷 / 助学贷款 / 车贷 / 信用卡分期 / 其他负债 / 信用贷）。
   amount = 本次还本额，mode = 'shorten'（月供不变·缩期）| 'reduce'（期限不变·减月供）。
   条件校验、违约金与还款计划的换算都在 Engine.prepay 里，这里只负责记账埋点。 */
function prepayLoan(g, key, amount, mode){
  const p = E.current(g);
  const r = E.prepay(g, p, key, amount, mode);
  if(!r.ok) return r;
  E.bump(p, 'repaid', r.principal);
  if(r.cleared) E.bump(p, 'loansCleared');
  return r;
}
/* 兼容旧调用：早先只能还信用贷 */
function repayLoan(g, amount){
  return prepayLoan(g, 'bank', amount, 'shorten');
}

/* ------------------------------ 财务自由圈：企业 / 梦想 / 事件 ------------------------------ */
function buyFTBusiness(g, bizId){
  const p = E.current(g);
  const biz = FT_BUSINESSES.find(b=>b.id===bizId);
  if(!biz) return { ok:false };
  if(!canPay(p, biz.cost)) return { ok:false, msg:`财务自由圈投资只能用现金，需 ${money(biz.cost)}。` };
  const en1 = needEnergy(p, energyCost('ftBusiness'), `购入企业「${biz.nm}」`);
  if(!en1.ok) return { ok:false, msg:en1.msg };
  p.cash -= biz.cost;
  p.assets.ftBusiness.push(E.stampAsset(g, { nm:biz.nm, cost:biz.cost, cf:biz.cf, bizId:biz.id }));
  p.ftGain = (p.ftGain||0) + biz.cf;
  E.bump(p, 'ftBusinesses'); E.bump(p, 'investTotal', biz.cost); E.bump(p, 'cfGained', biz.cf);
  E.milestone(g, p, `第 ${g.round} 轮在财务自由圈购入企业「${biz.nm}」，月现金流 +${money(biz.cf)}（累计 ${money(p.ftGain)} / ${money(E.empireTarget())}）`, 'good');
  log(g, `${p.name} 现金购入企业【${biz.nm}】，月现金流 +${money(biz.cf)}（累计增加 ${money(p.ftGain)}）`, 'good', p.name);
  if(p.ftGain >= E.empireTarget()) E.win(g, p, `在财务自由圈上通过购买企业使月现金流增加 ${money(p.ftGain)}（≥ ${money(E.empireTarget())}）`, 'empire');
  return { ok:true };
}
/* 202：停在已拥有的企业格 → 支付首付开设特许经营 */
function openFranchise(g, bizId){
  const p = E.current(g);
  const owned = p.assets.ftBusiness.find(b=>b.bizId===bizId);
  if(!owned) return { ok:false, msg:'你尚未拥有该企业，无法开设特许经营。' };
  const dp = Math.round(owned.cost*0.20);
  if(!canPay(p, dp)) return { ok:false, msg:`开设特许经营需支付首付 ${money(dp)}。` };
  const en2 = needEnergy(p, energyCost('ftBusiness'), `开设「${owned.nm}」特许经营`);
  if(!en2.ok) return { ok:false, msg:en2.msg };
  p.cash -= dp;
  const extraCf = Math.round(owned.cf*0.5);
  p.assets.ftBusiness.push(E.stampAsset(g, { nm:owned.nm+' · 特许经营', cost:dp, cf:extraCf, bizId, franchise:true }));
  p.ftGain = (p.ftGain||0) + extraCf;
  E.bump(p, 'ftBusinesses'); E.bump(p, 'investTotal', dp); E.bump(p, 'cfGained', extraCf);
  E.milestone(g, p, `第 ${g.round} 轮为「${owned.nm}」开设特许经营，额外现金流 +${money(extraCf)}（累计 ${money(p.ftGain)} / ${money(E.empireTarget())}）`, 'good');
  log(g, `${p.name} 为【${owned.nm}】开设特许经营，支付首付 ${money(dp)}，额外现金流 +${money(extraCf)}`, 'good', p.name);
  if(p.ftGain >= E.empireTarget()) E.win(g, p, `特许经营使月现金流累计增加 ${money(p.ftGain)}`, 'empire');
  return { ok:true };
}
function buyDream(g){
  const p = E.current(g);
  /* 只看玩家自己的圈：原先还允许全局 g.phase==='fasttrack' 放行，会泄漏到内圈玩家 */
  if(!p.inFT) return { ok:false, msg:'梦想格只在财务自由圈生效。' };
  const dream = DREAMS[p.dreamIdx];
  /* 同一个梦想不该被重复购买：多人模式下买到就结束对局，单人模式下若不加这道闸，
     玩家会反复为一个已经拥有的东西付钱。 */
  if(p.dreamOwned) return { ok:false, msg:`你已经实现过梦想「${dream.nm}」了。` };
  if(!canPay(p, dream.cost)) return { ok:false, msg:`购买梦想需要 ${money(dream.cost)}，现金不足。` };
  const en3 = needEnergy(p, energyCost('dream'), `实现梦想「${dream.nm}」`);
  if(!en3.ok) return { ok:false, msg:en3.msg };
  p.cash -= dream.cost;
  p.dreamOwned = true;
  E.bump(p, 'dreams');
  E.milestone(g, p, `第 ${g.round} 轮支付 ${money(dream.cost)} 买下梦想「${dream.nm}」——达成获胜条件`, 'good');
  log(g, `${p.name} 支付 ${money(dream.cost)} 买下梦想【${dream.nm}】`, 'good', p.name);
  E.win(g, p, `${E.isSolo(g) ? '' : '第一个'}在财务自由圈买下梦想【${dream.nm}】`, 'dream');
  return { ok:true };
}
/* 财务自由圈事件：金额在落格时已锁定并传入，扣款精确一致
   （旧版在执行时重算，且税务审计的日志会打印「应交金额」而非「实付金额」） */
function ftEvent(g, key, amount){
  const p = E.current(g);
  const ev = FT_EVENTS[key] || { nm:'财务自由圈事件' };
  const amt = (amount == null) ? Math.round(p.cash * 0.5) : amount;
  const r = E.payCash(p, amt);
  if(!r.ok) return { ok:false, shortfall:r.shortfall, msg:`现金不足，还差 ${money(r.shortfall)}。` };
  const note = (key === 'taxaudit' && r.paid < 10000) ? '（现金不足 ¥10,000，已支付全部现金）' : '';
  E.bump(p, 'forcedCount'); E.bump(p, 'forcedTotal', r.paid);
  E.milestone(g, p, `第 ${g.round} 轮财务自由圈事件「${ev.nm}」支付 ${money(r.paid)}`, 'bad');
  log(g, `${p.name} 遭遇「${ev.nm}」，支付 ${money(r.paid)}${note}`, 'bad', p.name);
  return { ok:true, paid:r.paid };
}

/* ------------------------------ 期权 / 做空 ------------------------------ */
function exerciseOption(g, optId){
  const p = E.current(g);
  const o = p.options.find(x=>x.id===optId);
  if(!o) return { ok:false, msg:'期权不存在或已失效。' };
  const price = E.stockPrice(g,o.symbol);
  if(price===undefined) return { ok:false, msg:'尚无该股票的市场报价，无法行权。' };
  const intrinsic = o.dir==='call' ? Math.max(0, price-o.strike) : Math.max(0, o.strike-price);
  p.cash += intrinsic*o.shares;
  p.options = p.options.filter(x=>x!==o);
  log(g, `${p.name} 行使 ${o.label}（现价 ${money(price)}），获得 ${money(intrinsic*o.shares)}`, intrinsic>0?'good':'bad', p.name);
  return { ok:true, gain:intrinsic*o.shares };
}
/* 做空：随时可操作，不需支付现金；出现该股票报价时强制买回平仓 */
function openShort(g, symbol, shares, price){
  const p = E.current(g);
  if(SHORTABLE.indexOf(symbol)<0) return { ok:false, msg:`该标的不可融券做空（仅 ${SHORTABLE.join(' / ')} 为两融标的）。` };
  if(!shares || shares<=0) return { ok:false, msg:'做空股数需大于 0。' };
  const px = E.stockPrice(g,symbol);
  if(px===undefined) return { ok:false, msg:'需要该股票的市场报价才能建立空头（可等到市场行情卡出现）。' };
  const en = needEnergy(p, energyCost('option'), `建立 ${symbol} 空头（需持续盯盘）`);
  if(!en.ok) return { ok:false, msg:en.msg };
  p.shorts.push({ symbol, shares, price:px });
  log(g, `${p.name} 做空 ${symbol} ${shares} 股 @ ${money(px)}（资金由银行承担，出现报价时强制买回平仓）`, 'info', p.name);
  return { ok:true };
}
function coverShort(g, symbol){
  const p = E.current(g);
  const px = E.stockPrice(g,symbol);
  if(px===undefined) return { ok:false, msg:'尚无市场报价，无法平仓。' };
  p.shorts.filter(s=>s.symbol===symbol).forEach(s=>{
    const diff = (s.price-px)*s.shares;
    p.cash += diff;
    log(g, `${p.name} 主动平仓 ${symbol} ${s.shares} 股，${diff>=0?'获利':'亏损'} ${money(Math.abs(diff))}`, diff>=0?'good':'bad', p.name);
  });
  p.shorts = p.shorts.filter(s=>s.symbol!==symbol);
  return { ok:true };
}

/* ------------------------------ 跳出老鼠赛跑 ------------------------------ */
function escapeRatRace(g){
  const p = E.current(g);
  if(E.lifeComplete(g, p)) return { ok:false, msg:'已到达终龄，请结束回合完成人生结算。' };
  const esc = E.escapeProgress(g, p);
  if(!esc.canEscape) return { ok:false, msg:`被动收入 ${money(esc.passive)} 尚未超过门槛 ${money(esc.target)}。` };
  p.inFT = true;
  E.syncPhase(g);            /* 旧的全局阶段字段：只作为「当前玩家所在圈」的镜像维护 */
  p.ftBase = E.finance(p).passive;
  p.ftPos = 0;
  const buyout = p.ftBase * 100;   /* 出圈资金 = 被动收入 × 100 */
  p.cash += buyout;
  p.escaped = true; p.escapeRound = g.round; p.escapeAge = E.ageOf(g, p); p.escapePassive = p.ftBase;
  E.milestone(g, p, `第 ${g.round} 轮被动收入 ${money(p.ftBase)} 超过门槛 ${money(esc.target)}，跳出老鼠赛跑，获得出圈资金 ${money(buyout)}`, 'good');
  log(g, `${p.name} 被动收入 ${money(p.ftBase)} ＞ 门槛 ${money(esc.target)}，跳出老鼠赛跑进入财务自由圈！`, 'good', p.name);
  log(g, `${p.name} 获得出圈资金 ${money(buyout)}（被动收入 × 100）作为财务自由圈起始现金`, 'good', p.name);
  return { ok:true, buyout };
}

/* ------------------------------ 202：买断对手资产 ------------------------------ */
function buyout(g, targetId){
  const p = E.current(g);
  const t = g.players[targetId];
  if(!t || t.out || t.finished || t.id===p.id) return { ok:false, msg:'请选择其他玩家。' };
  if(!p.inFT) return { ok:false, msg:'买断对手资产的规则仅在财务自由圈生效。' };
  const assets = t.assets.ftBusiness.reduce((s,x)=>s+x.cost,0) + t.assets.business.reduce((s,x)=>s+x.cost,0)
               + t.assets.realEstate.reduce((s,x)=>s+x.dp,0);
  const price = Math.round(assets*1.5);
  if(!canPay(p, price)) return { ok:false, msg:`买断报价 ${money(price)}，现金不足。` };
  p.cash -= price; t.cash += price;
  p.assets.ftBusiness = p.assets.ftBusiness.concat(t.assets.ftBusiness);
  p.assets.business = p.assets.business.concat(t.assets.business);
  p.assets.realEstate = p.assets.realEstate.concat(t.assets.realEstate);
  p.ftGain = (p.ftGain||0) + t.assets.ftBusiness.reduce((s,x)=>s+x.cf,0);
  t.assets.ftBusiness = []; t.assets.business = []; t.assets.realEstate = [];
  t.out = true; t.outReason = '资产被买断';
  E.bump(p, 'buyouts');
  E.milestone(g, p, `第 ${g.round} 轮以 ${money(price)} 买断 ${t.name} 的全部资产`, 'good');
  E.milestone(g, t, `第 ${g.round} 轮全部资产被 ${p.name} 以 ${money(price)} 买断，无力维持而出局`, 'bad');
  log(g, `${p.name} 以 ${money(price)} 买断 ${t.name} 的全部资产，${t.name} 因无力维持而出局`, 'bad');
  E.checkLastStanding(g);
  if(p.ftGain >= E.empireTarget()) E.win(g, p, `买断资产使月现金流累计增加 ${money(p.ftGain)}`, 'empire');
  return { ok:true };
}

/* ------------------------------ 休假 / 补缺口 / 求职 ------------------------------ */
/* 休假：停在「起点」时可主动用现金换精力。
   现实依据：请年假、去度假是真实存在的「花钱买休息」，也是长期高强度投入之后
   唯一能把状态拉回来的办法 —— 精力机制必须有一条玩家可主动使用的恢复通道，
   否则它只会变成一条被动的死亡螺旋。 */
function vacation(g){
  const p = E.current(g);
  const f = E.finance(p);
  const cost = Math.round(f.totalExpenses * (window.ENERGY.vacationCostMult || 1));
  const gain = window.ENERGY.vacationEnergy || 0;
  const maxE = E.energyMax(g, p);
  if(p.energy >= maxE) return { ok:false, msg:`精力已经满格（${Math.round(p.energy)} / ${maxE}），不需要休假。` };
  if(!canPay(p, cost)) return { ok:false, msg:`休假的花费约一个月支出 ${money(cost)}，现金不足。` };
  p.cash -= cost;
  p.energy = Math.min(maxE, p.energy + gain);
  E.bump(p, 'vacations');
  log(g, `${p.name} 休假调整状态，花费 ${money(cost)}，精力 +${gain}（现 ${Math.round(p.energy)} / ${maxE}）`, 'good', p.name);
  return { ok:true, cost, gain, energy:p.energy, max:maxE };
}
/* 补上当期「入不敷出」的缺口 */
function payDeficit(g, amount){
  const p = E.current(g);
  const r = E.payDeficit(g, p, amount);
  if(!r.ok) return { ok:false, shortfall:r.shortfall, msg:`现金不足，还差 ${money(r.shortfall)}，请先贷款或变卖资产。` };
  return { ok:true, paid:r.paid };
}
/* 求职（失业期间） */
function huntJob(g){ return E.jobHunt(g, E.current(g)); }

/* ------------------------------ 单人模式：机构替代 ------------------------------ */
/* 单人模式的根本约束是「没有其他玩家」，原规则里依赖他人的只剩一条：202 联合购买，
   它的现实替代物是「机构合伙人」（见下）。
   ★ 「投资卡转让」在单人下【整体取消】，不做替代：
     把一张自己吃不下的投资机会卖出去换现金，现实里没有对应场景 ——
     机构完全可以自己找项目，不必为你「看过一眼」付费。
     所以单人模式遇到机会只能【买入】或【放弃】。
     多人模式的 sellOpportunity（卖给其他玩家）照常保留。 */

/* 与机构合伙人联合购买（202 大额房产的「联合购买」在单人下的等价形式）。
   机构出 partnerShare 的首付、分走同比例的现金流 —— 现实里找投资人搭伙就是这样：
   你出小头、让渡一部分收益，换来「买得起」。
   精力按玩家自己承担的比例扣（跑流程的仍是他，所以不低于 partnerEnergy 那一档）。 */
/* 机构合伙的分账：总首付 / 玩家出资 / 玩家占比 / 玩家月现金流。
   界面上的「你自己出资」直接读这里，保证与实扣一致。 */
function orgPartnerPlan(g, card){
  const S = window.SOLO;
  const total = dealCost(g, card, 1);
  const orgShare = S.partnerShare || 0.5;
  const share = 1 - orgShare;                        /* 玩家自己占的比例 */
  return { total, orgShare, share, mine: Math.round(total * share),
           cf: Math.round((card.cf || 0) * share),
           energy: Math.max(1, Math.round(dealEnergy(card) * (S.partnerEnergy || 0.6))) };
}

function buyDealWithOrg(g, card){
  if(card.kind!=='realestate') return {ok:false,msg:'机构合伙仅适用于房产。'};
  const p = E.current(g), S = window.SOLO;
  const plan = orgPartnerPlan(g, card);
  const total = plan.total, orgShare = plan.orgShare, share = plan.share, mine = plan.mine;
  if(!canPay(p, mine)) return { ok:false, msg:`机构出 ${Math.round(orgShare*100)}% 首付后，你仍需出资 ${money(mine)}，现金不足。` };
  const en = needEnergy(p, plan.energy, `与机构合伙买入「${card.nm || '房产'}」`);
  if(!en.ok) return { ok:false, msg:en.msg };
  p.cash -= mine;
  const cf = plan.cf;
  p.assets.realEstate.push({
    nm: card.nm + '（与机构共有）', dp: mine, cost: Math.round((card.cost || 0) * share),
    cf, rent: Math.round((card.rent || 0) * share), share, joint: true, partner: '机构'
  });
  (p.assets.realEstate || []).forEach(it => E.stampAsset(g, it));
  E.registerProperty(g,p,p.assets.realEstate[p.assets.realEstate.length-1]);
  E.bump(p, 'dealsBought'); E.bump(p, 'investTotal', mine); E.bump(p, 'cfGained', cf);
  E.milestone(g, p, `第 ${g.round} 轮与机构合伙买入「${card.nm}」，出资 ${money(mine)}（占比 ${Math.round(share*100)}%），月现金流 +${money(cf)}`, 'good');
  E.log(g, `${p.name} 与机构合伙买入 ${card.nm}：机构出 ${money(total - mine)}（${Math.round(orgShare*100)}%），你出 ${money(mine)}（${Math.round(share*100)}%），月现金流 +${money(cf)}`, 'good', p.name);
  return { ok:true, mine, share, cf, orgShare, total };
}

/* 每次机会只能承接一条挂牌；物理房产编号保留，持仓编号重新生成。
   expected 是玩家看到的报价，变化后先要求刷新，不能悄悄按新金额扣款。 */
function buyPropertyListing(g,listingId,expected){
  const p=E.current(g),P=g.pending;
  if(!P || !['opportunity','opportunity202'].includes(P.type) || P.deal || P.purchaseDone)
    return {ok:false,msg:'请在尚未选择投资卡的投资机会中购买挂牌房产。'};
  const listing=E.assetMarket(g).listings.find(l=>l.id===listingId),plan=listing && E.listingPlan(g,listing);
  if(!plan) return {ok:false,msg:'该份额尚未挂牌或已经成交，请刷新列表。'};
  if(expected && ['cost','dp','fee','cf','rent'].some(k=>expected[k]!==plan[k]))
    return {ok:false,msg:'挂牌报价已变化，请刷新列表后再确认。'};
  if(!canPay(p,plan.need)) return {ok:false,msg:`首付及费用合计 ${money(plan.need)}，现金不足。`};
  const en=needEnergy(p,energyCost('realEstate'),'承接挂牌房产');
  if(!en.ok) return en;
  const item={nm:plan.nm,propertyId:plan.propertyId,share:plan.share,joint:plan.share<1,
    cost:plan.cost,dp:plan.dp,projectDebt:plan.debt,financingRate:plan.rate,rent:plan.rent,acquisitionFee:plan.fee,
    cf:plan.cf,heldYears:plan.heldYears};
  E.stampAsset(g,item);E.registerProperty(g,p,item,plan.propertyId);
  p.cash-=plan.need;p.assets.realEstate.push(item);
  listing.status='sold';listing.buyer=p.id;listing.boughtTurn=g.turnNo;
  P.purchaseDone=true;
  E.bump(p,'dealsBought');E.bump(p,'investTotal',plan.need);E.bump(p,'cfGained',plan.cf);
  log(g,`${p.name} 承接挂牌房产 ${plan.nm}（${plan.propertyId}）${(plan.share*100).toFixed(1)}% 份额：成交价 ${money(plan.cost)}，首付 ${money(plan.dp)}，项目融资 ${money(plan.debt)}，费用 ${money(plan.fee)}`,'good',p.name);
  return {ok:true,item,plan};
}

/* 玩家间协商转让：约定价为股权款，项目融资随房产转移；不会再凭空还本或建一笔贷款。 */
function transferProperty(g,seller,buyer,holdingId,equityPrice){
  const item=seller.assets.realEstate.find(r=>r.holdingId===holdingId);
  if(!item || !buyer || buyer===seller || buyer.out || buyer.finished || !Number.isFinite(equityPrice) || equityPrice<0)
    return {ok:false,msg:'房产或转让金额无效。'};
  const debt=E.projectDebt(item),share=E.holdingShare(item);
  if(share<=0 || buyer.cash<equityPrice) return {ok:false,msg:'买方现金不足或份额无效。'};
  const whole=(equityPrice+debt)/share,plan=E.propertySettlement(g,item,whole);
  if(seller.cash+plan.proceeds<0) return {ok:false,msg:'卖方现金不足以支付交易费用。'};
  E.recordPropertySale(g,seller,item,plan,whole,'协议转让（融资随资产转移）',false);
  buyer.cash-=equityPrice;seller.cash+=plan.proceeds;
  seller.assets.realEstate.splice(seller.assets.realEstate.indexOf(item),1);
  const acquired=Object.assign({},item,{dp:equityPrice,cost:equityPrice+debt,projectDebt:debt,buyRound:g.round,legacyAsset:false});
  delete acquired.holdingId;
  buyer.assets.realEstate.push(acquired);E.registerProperty(g,buyer,acquired,item.propertyId);
  E.bump(seller,'marketSells');E.bump(seller,'marketProceeds',plan.proceeds);
  log(g,`${seller.name} 向 ${buyer.name} 转让 ${item.nm}：股权款 ${money(equityPrice)}，随资产转移项目融资 ${money(debt)}，卖方净回款 ${money(plan.proceeds)}`,'info');
  return {ok:true,item:acquired,proceeds:plan.proceeds};
}

/* ------------------------------ 交易：现金/资产互易 ------------------------------ */
function trade(g, aId, bId, cashFromA, priceLabel){
  const a = g.players[aId], b = g.players[bId];
  if(!a || !b || a.out || b.out || a.finished || b.finished) return { ok:false, msg:'只能与仍在行动的玩家交易。' };
  if(!a||!b||a===b) return { ok:false };
  const amt = Math.min(cashFromA, a.cash);
  a.cash -= amt; b.cash += amt;
  log(g, `${a.name} 向 ${b.name} 支付 ${money(amt)}${priceLabel?'（'+priceLabel+'）':''}`, 'info');
  return { ok:true };
}

/* ------------------------------ 导出 ------------------------------ */
window.Act = {
  canPay, dealCost, chooseDeck, buyDeal, sellOpportunity, marketImpact, applyMarketQuote, marketOptions, marketSell,
  payDoodad, doCharity, addBaby, doDownsized, takeLoan, prepayLoan, repayLoan,
  buyFTBusiness, openFranchise, buyDream, ftEvent,
  exerciseOption, openShort, coverShort, escapeRatRace, buyout, trade,
  /* 人生模拟：精力校验 / 休假 / 补缺口 / 求职 */
  energyCost, dealEnergy, needEnergy, vacation, payDeficit, huntJob,
  /* 单人模式：机构接盘（投资卡转让）与机构合伙（联合购买的替代） */
  buyDealWithOrg, orgPartnerPlan, buyPropertyListing, transferProperty,
  /* 现金不变式：付不出时的两条出路 + 破产 */
  liquidate: E.liquidate, declareBankruptcy: E.declareBankruptcy
};
})();
