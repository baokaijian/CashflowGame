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

/* ------------------------------ 投资机会格：选择牌堆 & 买卡 ------------------------------ */
function chooseDeck(g, deckName){
  const p = E.current(g);
  E.bump(p, 'dealsSeen');
  const card = E.drawDeal(g, deckName);
  if(g.pending) { g.pending.deal = card; g.pending.deckName = deckName; }
  return card;
}
/* 一次性拿到全部可执行的方案（含联合购买） */
function dealCost(g, card, qty){
  const q = qty || card.min || 1;
  if(card.kind === 'stock') return card.price * q;
  if(card.kind === 'collectible' && card.unit) return card.price * q;
  if(card.kind === 'option' || card.kind === 'straddle') return (card.premium||0) * 100;
  return card.dp || card.cost || 0;
}
function buyDeal(g, card, exec){
  const p = E.current(g);
  exec = exec || {};
  const qty = exec.qty || card.min || 1;
  const cost = dealCost(g, card, qty);
  if(!canPay(p, cost)) return { ok:false, msg:'现金不足，可先向银行贷款或把投资卡卖给其他玩家。' };
  pay(p, cost);
  const base = card.base || card.nm || card.symbol;
  switch(card.kind){
    case 'stock':
      p.stockPrice = p.stockPrice || {}; p.stockPrice[card.symbol] = card.price;
      addStock(p, card.symbol, qty, card.price);
      log(g, `${p.name} 以 ${money(card.price)}/股 买入 ${card.symbol} ${qty} 股，支出 ${money(cost)}`, 'info', p.name);
      break;
    case 'collectible':
      if(card.unit){ addCollectible(p, card.nm, qty, card.price); p.collectPrice = card.price;
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
      const share = exec.share || 1;
      p.assets.realEstate.push({ nm:card.nm, dp:cost, cost:card.cost, cf:Math.round(card.cf*share), rent:card.rent||0, share, joint:!!(exec.partners&&exec.partners.length) });
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
  if(!buyer || buyer.out || buyer.id===seller.id) return { ok:false, msg:'请选择其他玩家。' };
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

  /* 1) 股票报价 → 做空者强制买回平仓 */
  if(card.kind === 'stock'){
    g.players.forEach(p=>{
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
    g.players.forEach(p=>{
      p.assets.realEstate.forEach(re=>{
        re.baseCf = (re.baseCf===undefined? re.cf : re.baseCf);
        re.cf = Math.round(re.baseCf * (1 + card.pct));
      });
    });
    out.note = `全体出租房产租金收入 ${card.pct>0?'+':''}${Math.round(card.pct*100)}%`;
  }
  /* 3) 生成可执行交易清单 */
  out.options = marketOptions(g, card);
  return out;
}

function matchProp(re, prop){
  if(!prop) return true;
  return (re.nm||'').indexOf(prop) >= 0 || (prop||'').indexOf(re.nm||'') >= 0;
}
function marketOptions(g, card){
  const list = [];
  if(!card) return list;
  g.players.forEach(p=>{
    if(p.out) return;
    switch(card.kind){
      case 'stock':
        p.assets.stocks.filter(s=>s.symbol===card.symbol).forEach(s=>{
          const profit = (card.price - s.cost) * s.shares;
          list.push({ id:`s_${p.id}_${s.symbol}`, pid:p.id, pname:p.name, ico:'📈',
            label:`${s.symbol} 股票 ${s.shares} 股`, sub:`成本 ${money(s.cost)} → 现价 ${money(card.price)}（${profit>=0?'+':''}${money(profit)}）`,
            price:card.price, max:s.shares, kind:'stock', symbol:s.symbol });
        });
        p.options.filter(o=>o.symbol===card.symbol).forEach(o=>{
          const intrinsic = o.dir==='call' ? Math.max(0, card.price-o.strike) : Math.max(0, o.strike-card.price);
          list.push({ id:`o_${o.id}`, pid:p.id, pname:p.name, ico:'📜',
            label:o.label, sub:`行权价 ${money(o.strike)} · 现价 ${money(card.price)} · 内在价值 ${money(intrinsic*100)}`,
            kind:'option', optionId:o.id, intrinsic });
        });
        break;
      case 'realestate':
        p.assets.realEstate.filter(re=>matchProp(re, card.prop)).forEach((re,ix)=>{
          const profit = card.price - (re.cost||0);
          list.push({ id:`r_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'🏠',
            label:re.nm, sub:`买入价 ${money(re.cost)} → 售出 ${money(card.price)}（差价 ${profit>=0?'+':''}${money(profit)}）+ 首付返还 ${money(re.dp)}`,
            kind:'realestate', prop:re.nm, price:card.price, ix });
        });
        break;
      case 'business':
        p.assets.business.forEach((b,ix)=>{
          const price = Math.round(b.cost*card.rate);
          list.push({ id:`b_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'🏪',
            label:b.nm, sub:`购入 ${money(b.cost)} → 收购价 ${money(price)}（${money(price-b.cost)}）`,
            kind:'business', ix, price });
        });
        break;
      case 'collectible':
        p.assets.collectibles.filter(c=>matchProp({nm:c.nm}, card.prop)).forEach((c,ix)=>{
          list.push({ id:`c_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'🪙',
            label:`${c.nm} × ${c.qty||1}`, sub:`成本 ${money(c.cost)} → 报价 ${money(card.price)}/单位（合计 ${money(card.price*(c.qty||1))}）`,
            kind:'collectible', ix, price:card.price, max:c.qty||1 });
        });
        break;
      case 'land':
        p.assets.lands.forEach((l,ix)=>{
          list.push({ id:`l_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'🌾',
            label:l.nm, sub:`成本 ${money(l.cost)} → 收购价 ${money(card.price)}（${money(card.price-l.cost)}）`,
            kind:'land', ix, price:card.price });
        });
        break;
      case 'savings':
        p.assets.savings.concat(p.assets.funds).forEach((s,ix)=>{
          const price = Math.round(s.cost*(card.rate||1));
          list.push({ id:`v_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'🏦',
            label:s.nm, sub:`本金 ${money(s.cost)} → 到期兑现 ${money(price)}`,
            kind:'savings', ix, price });
        });
        break;
      case 'disaster':
        p.assets.realEstate.filter(re=>matchProp(re, card.target)).forEach((re,ix)=>{
          list.push({ id:`x_${p.id}_${ix}`, pid:p.id, pname:p.name, ico:'💥',
            label:`${re.nm} 受灾`, sub:`选择该房产承受损失（资产归零）`, kind:'disaster', ix });
        });
        p.assets.lands.filter(l=>matchProp({nm:l.nm}, card.target)||card.target==='土地').forEach((l,ix)=>{
          list.push({ id:`x_${p.id}_l${ix}`, pid:p.id, pname:p.name, ico:'💥',
            label:`${l.nm} 受灾`, sub:`选择该土地承受损失（资产归零）`, kind:'land-disaster', ix });
        });
        break;
    }
  });
  return list;
}

/* 执行交易（内部实现，记账统一交给下面的 marketSell 包装） */
function doMarketSell(g, opt){
  const p = g.players[opt.pid];
  if(!p) return { ok:false };
  switch(opt.kind){
    case 'stock':{
      const s = p.assets.stocks.find(x=>x.symbol===opt.symbol);
      if(!s) return { ok:false };
      const qty = Math.min(opt.qty||s.shares, s.shares);
      const proceeds = qty*opt.price;
      const cost = qty*s.cost;
      p.cash += proceeds; s.shares -= qty;
      if(s.shares<=0) p.assets.stocks = p.assets.stocks.filter(x=>x!==s);
      log(g, `${p.name} 卖出 ${opt.symbol} ${qty} 股，收入 ${money(proceeds)}（${proceeds-cost>=0?'资本利得':'资本亏损'} ${money(Math.abs(proceeds-cost))}）`, proceeds>=cost?'good':'bad', p.name);
      return { ok:true, text:`收入 ${money(proceeds)}` };
    }
    case 'option':{
      const o = p.options.find(x=>x.id===opt.optionId);
      if(!o) return { ok:false };
      const gain = opt.intrinsic * o.shares;
      p.cash += gain;
      p.options = p.options.filter(x=>x!==o);
      log(g, `${p.name} 行使 ${o.label}，获得 ${money(gain)}`, gain>0?'good':'bad', p.name);
      return { ok:true, text:`行权获得 ${money(gain)}` };
    }
    case 'realestate':{
      const re = p.assets.realEstate[opt.ix]; if(!re) return { ok:false };
      const gain = opt.price - (re.cost||0);
      p.cash += re.dp + gain;
      p.assets.realEstate.splice(opt.ix,1);
      log(g, `${p.name} 出售 ${re.nm}：收回首付 ${money(re.dp)} + 差价 ${money(gain)}，共 ${money(re.dp+gain)}`, gain>=0?'good':'bad', p.name);
      return { ok:true, text:`收回 ${money(re.dp+gain)}` };
    }
    case 'business':{
      const b = p.assets.business[opt.ix]; if(!b) return { ok:false };
      p.cash += opt.price;
      p.assets.business.splice(opt.ix,1);
      log(g, `${p.name} 出售企业 ${b.nm}，收入 ${money(opt.price)}`, 'good', p.name);
      return { ok:true };
    }
    case 'collectible':{
      const c = p.assets.collectibles[opt.ix]; if(!c) return { ok:false };
      const qty = Math.min(opt.qty||c.qty||1, c.qty||1);
      const proceeds = opt.price*qty;
      p.cash += proceeds;
      c.cost -= (c.cost/(c.qty||1))*qty; c.qty -= qty;
      if(c.qty<=0) p.assets.collectibles.splice(opt.ix,1);
      log(g, `${p.name} 卖出 ${c.nm} ×${qty}，收入 ${money(proceeds)}`, 'good', p.name);
      return { ok:true };
    }
    case 'land':{
      const l = p.assets.lands[opt.ix]; if(!l) return { ok:false };
      p.cash += opt.price; p.assets.lands.splice(opt.ix,1);
      log(g, `${p.name} 出售 ${l.nm}，收入 ${money(opt.price)}`, 'good', p.name);
      return { ok:true };
    }
    case 'land-disaster':{
      const l = p.assets.lands[opt.ix]; if(!l) return { ok:false };
      p.assets.lands.splice(opt.ix,1);
      log(g, `${p.name} 的 ${l.nm} 因灾害损毁，资产归零`, 'bad', p.name);
      return { ok:true };
    }
    case 'savings':{
      const all = p.assets.savings.concat(p.assets.funds);
      const item = all[opt.ix]; if(!item) return { ok:false };
      p.cash += opt.price;
      p.assets.savings = p.assets.savings.filter(x=>x!==item);
      p.assets.funds = p.assets.funds.filter(x=>x!==item);
      log(g, `${p.name} 兑现 ${item.nm}，收入 ${money(opt.price)}`, 'good', p.name);
      return { ok:true };
    }
    case 'disaster':{
      const re = p.assets.realEstate[opt.ix]; if(!re) return { ok:false };
      p.assets.realEstate.splice(opt.ix,1);
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
      if(opt.price) E.bump(p, 'marketProceeds', opt.price);
      E.milestone(g, p, `第 ${g.round} 轮行情兑现：${opt.label || opt.kind}${r.text ? '（' + r.text + '）' : ''}`, 'good');
    }
  }
  return r;
}

/* ------------------------------ 额外支出 / 慈善 / 孩子 / 失业 ------------------------------ */
/* 强制支出统一走 E.payCash：现金不足时【拒绝扣款并返回差额】，绝不产生负数现金 */
function payDoodad(g, card){
  const p = E.current(g);
  const r = E.payCash(p, card.cost);
  if(!r.ok) return { ok:false, shortfall:r.shortfall, msg:`现金不足，还差 ${money(r.shortfall)}，请先贷款或变卖资产。` };
  if(card.extraPay) p.liabs.extraPay = (p.liabs.extraPay||0) + card.extraPay;
  E.bump(p, 'forcedCount'); E.bump(p, 'forcedTotal', r.paid);
  E.milestone(g, p, `第 ${g.round} 轮意外支出「${card.nm}」${money(r.paid)}${card.extraPay ? `，此后每月多支出 ${money(card.extraPay)}` : ''}`, 'bad');
  log(g, `${p.name} 支付额外支出【${card.nm}】${money(r.paid)}${card.extraPay?`，此后每月额外支出 +${money(card.extraPay)}`:''}`, 'bad', p.name);
  return { ok:true, paid:r.paid };
}
function doCharity(g, yes){
  const p = E.current(g);
  const amount = Math.round(E.finance(p).totalIncome*0.10);
  if(!yes){ log(g, `${p.name} 放弃慈善捐赠`, 'info', p.name); return { ok:true }; }
  if(!canPay(p, amount)) return { ok:false, msg:`现金不足以捐赠 ${money(amount)}，可先出售资产或贷款。` };
  p.cash -= amount;
  p.charityTurns = 2;
  E.bump(p, 'donations'); E.bump(p, 'donationTotal', amount);
  E.milestone(g, p, `第 ${g.round} 轮捐出总收入的 10%（${money(amount)}），换取未来 2 轮可选骰子数`, 'info');
  log(g, `${p.name} 捐赠总收入的 10%（${money(amount)}），未来 2 轮可选择掷 1—2 粒骰子`, 'good', p.name);
  return { ok:true };
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
/* amount 由落格时锁定并传入，保证弹层上写的数字与实际扣款一致
   （旧版在执行时重算总支出，若期间贷过款，实际会多扣） */
function doDownsized(g, amount){
  const p = E.current(g);
  const amt = (amount == null) ? E.finance(p).totalExpenses : amount;
  const r = E.payCash(p, amt);
  if(!r.ok) return { ok:false, shortfall:r.shortfall, msg:`现金不足，还差 ${money(r.shortfall)}，请先贷款或变卖资产。` };
  p.skipTurns += 2;
  E.bump(p, 'downsized'); E.bump(p, 'forcedCount'); E.bump(p, 'forcedTotal', r.paid);
  E.milestone(g, p, `第 ${g.round} 轮遭遇裁员失业：一次性支付总支出 ${money(r.paid)}，并暂停两轮`, 'bad');
  log(g, `${p.name} 失业：支付一次总支出 ${money(r.paid)}，并暂停两轮`, 'bad', p.name);
  return { ok:true, paid:r.paid, amount:amt };
}

/* ------------------------------ 贷款 ------------------------------ */
function takeLoan(g, amount){
  const p = E.current(g);
  if(amount<=0) return { ok:false, msg:'贷款金额需大于 0。' };
  p.liabs.bank += amount; p.cash += amount;
  E.bump(p, 'loans'); E.bump(p, 'loanTotal', amount);
  E.milestone(g, p, `第 ${g.round} 轮借入信用贷 ${money(amount)}，此后每月多付 ${money(Math.round(amount*BANK.loanRate))}`, 'info');
  log(g, `${p.name} 取得信用贷 ${money(amount)}，月息 ${(BANK.loanRate*100).toFixed(1)}%（每月还款 ${money(Math.round(amount*BANK.loanRate))}）`, 'info', p.name);
  return { ok:true };
}
function repayLoan(g, amount){
  const p = E.current(g);
  const amt = Math.min(amount, p.liabs.bank, p.cash);
  if(amt<=0) return { ok:false, msg:'无法还款。' };
  p.liabs.bank -= amt; p.cash -= amt;
  E.bump(p, 'repaid', amt);
  log(g, `${p.name} 偿还信用贷 ${money(amt)}`, 'info', p.name);
  return { ok:true };
}

/* ------------------------------ 财务自由圈：企业 / 梦想 / 事件 ------------------------------ */
function buyFTBusiness(g, bizId){
  const p = E.current(g);
  const biz = FT_BUSINESSES.find(b=>b.id===bizId);
  if(!biz) return { ok:false };
  if(!canPay(p, biz.cost)) return { ok:false, msg:`财务自由圈投资只能用现金，需 ${money(biz.cost)}。` };
  p.cash -= biz.cost;
  p.assets.ftBusiness.push({ nm:biz.nm, cost:biz.cost, cf:biz.cf, bizId:biz.id });
  p.ftGain = (p.ftGain||0) + biz.cf;
  E.bump(p, 'ftBusinesses'); E.bump(p, 'investTotal', biz.cost); E.bump(p, 'cfGained', biz.cf);
  E.milestone(g, p, `第 ${g.round} 轮在财务自由圈购入企业「${biz.nm}」，月现金流 +${money(biz.cf)}（累计 ${money(p.ftGain)} / ¥50,000）`, 'good');
  log(g, `${p.name} 现金购入企业【${biz.nm}】，月现金流 +${money(biz.cf)}（累计增加 ${money(p.ftGain)}）`, 'good', p.name);
  if(p.ftGain >= 50000) E.win(g, p, `在财务自由圈上通过购买企业使月现金流增加 ${money(p.ftGain)}（≥ ¥50,000）`);
  return { ok:true };
}
/* 202：停在已拥有的企业格 → 支付首付开设特许经营 */
function openFranchise(g, bizId){
  const p = E.current(g);
  const owned = p.assets.ftBusiness.find(b=>b.bizId===bizId);
  if(!owned) return { ok:false, msg:'你尚未拥有该企业，无法开设特许经营。' };
  const dp = Math.round(owned.cost*0.20);
  if(!canPay(p, dp)) return { ok:false, msg:`开设特许经营需支付首付 ${money(dp)}。` };
  p.cash -= dp;
  const extraCf = Math.round(owned.cf*0.5);
  p.assets.ftBusiness.push({ nm:owned.nm+' · 特许经营', cost:dp, cf:extraCf, bizId, franchise:true });
  p.ftGain = (p.ftGain||0) + extraCf;
  E.bump(p, 'ftBusinesses'); E.bump(p, 'investTotal', dp); E.bump(p, 'cfGained', extraCf);
  E.milestone(g, p, `第 ${g.round} 轮为「${owned.nm}」开设特许经营，额外现金流 +${money(extraCf)}（累计 ${money(p.ftGain)} / ¥50,000）`, 'good');
  log(g, `${p.name} 为【${owned.nm}】开设特许经营，支付首付 ${money(dp)}，额外现金流 +${money(extraCf)}`, 'good', p.name);
  if(p.ftGain >= 50000) E.win(g, p, `特许经营使月现金流累计增加 ${money(p.ftGain)}`);
  return { ok:true };
}
function buyDream(g){
  const p = E.current(g);
  if(g.phase!=='fasttrack' && !p.inFT) return { ok:false, msg:'梦想格只在财务自由圈生效。' };
  const dream = DREAMS[p.dreamIdx];
  if(!canPay(p, dream.cost)) return { ok:false, msg:`购买梦想需要 ${money(dream.cost)}，现金不足。` };
  p.cash -= dream.cost;
  p.dreamOwned = true;
  E.bump(p, 'dreams');
  E.milestone(g, p, `第 ${g.round} 轮支付 ${money(dream.cost)} 买下梦想「${dream.nm}」——达成获胜条件`, 'good');
  log(g, `${p.name} 支付 ${money(dream.cost)} 买下梦想【${dream.nm}】`, 'good', p.name);
  E.win(g, p, `第一个在财务自由圈买下梦想【${dream.nm}】`);
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
  const price = (p.stockPrice||{})[o.symbol];
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
  const px = price!==undefined ? price : (p.stockPrice||{})[symbol];
  if(px===undefined) return { ok:false, msg:'需要该股票的市场报价才能建立空头（可等到市场行情卡出现）。' };
  p.shorts.push({ symbol, shares, price:px });
  log(g, `${p.name} 做空 ${symbol} ${shares} 股 @ ${money(px)}（资金由银行承担，出现报价时强制买回平仓）`, 'info', p.name);
  return { ok:true };
}
function coverShort(g, symbol){
  const p = E.current(g);
  const px = (p.stockPrice||{})[symbol];
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
  const esc = E.escapeProgress(g, p);
  if(!esc.canEscape) return { ok:false, msg:`被动收入 ${money(esc.passive)} 尚未超过门槛 ${money(esc.target)}。` };
  p.inFT = true;
  g.phase = 'fasttrack';
  p.ftBase = E.finance(p).passive;
  p.ftPos = 0;
  const buyout = p.ftBase * 100;   /* 出圈资金 = 被动收入 × 100 */
  p.cash += buyout;
  p.escaped = true; p.escapeRound = g.round; p.escapePassive = p.ftBase;
  E.milestone(g, p, `第 ${g.round} 轮被动收入 ${money(p.ftBase)} 超过门槛 ${money(esc.target)}，跳出老鼠赛跑，获得出圈资金 ${money(buyout)}`, 'good');
  log(g, `${p.name} 被动收入 ${money(p.ftBase)} ＞ 门槛 ${money(esc.target)}，跳出老鼠赛跑进入财务自由圈！`, 'good', p.name);
  log(g, `${p.name} 获得出圈资金 ${money(buyout)}（被动收入 × 100）作为财务自由圈起始现金`, 'good', p.name);
  return { ok:true, buyout };
}

/* ------------------------------ 202：买断对手资产 ------------------------------ */
function buyout(g, targetId){
  const p = E.current(g);
  const t = g.players[targetId];
  if(!t || t.out || t.id===p.id) return { ok:false, msg:'请选择其他玩家。' };
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
  if(p.ftGain >= 50000) E.win(g, p, `买断资产使月现金流累计增加 ${money(p.ftGain)}`);
  return { ok:true };
}

/* ------------------------------ 交易：现金/资产互易 ------------------------------ */
function trade(g, aId, bId, cashFromA, priceLabel){
  const a = g.players[aId], b = g.players[bId];
  if(!a||!b||a===b) return { ok:false };
  const amt = Math.min(cashFromA, a.cash);
  a.cash -= amt; b.cash += amt;
  log(g, `${a.name} 向 ${b.name} 支付 ${money(amt)}${priceLabel?'（'+priceLabel+'）':''}`, 'info');
  return { ok:true };
}

/* ------------------------------ 导出 ------------------------------ */
window.Act = {
  canPay, dealCost, chooseDeck, buyDeal, sellOpportunity, marketImpact, marketOptions, marketSell,
  payDoodad, doCharity, addBaby, doDownsized, takeLoan, repayLoan,
  buyFTBusiness, openFranchise, buyDream, ftEvent,
  exerciseOption, openShort, coverShort, escapeRatRace, buyout, trade,
  /* 现金不变式：付不出时的两条出路 + 破产 */
  liquidate: E.liquidate, declareBankruptcy: E.declareBankruptcy
};
})();
