/* ==========================================================================
   engine.js — 游戏核心引擎（纯逻辑，无 DOM 依赖）
   规则依据：《富爸爸穷爸爸》现金流游戏完整规则文档（101 + 202 整合版）
   ========================================================================== */
(function(){
'use strict';

/* ------------------------------ 工具 ------------------------------ */
const money = n => (n<0?'-¥':'¥') + Math.abs(Math.round(n)).toLocaleString('en-US');
const moneyK = n => '¥' + Math.round(n).toLocaleString('en-US');
function shuffle(a, rnd){
  const arr = a.slice();
  for(let i=arr.length-1;i>0;i--){ const j = Math.floor((rnd?rnd():Math.random())*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}
function pick(arr, rnd){ return arr[Math.floor((rnd?rnd():Math.random())*arr.length)]; }

/* ------------------------------ 卡组 ------------------------------ */
function makeDeck(cards){
  return { draw: shuffle(cards), disc: [], total: cards.length };
}
function drawCard(deck, onReshuffle){
  if(deck.draw.length === 0){
    deck.draw = shuffle(deck.disc); deck.disc = [];
    if(onReshuffle) onReshuffle();
  }
  return deck.draw.pop() || null;
}
function deckLeft(deck){ return deck.draw.length; }

/* ------------------------------ 财务计算 ------------------------------ */
/* 收入支出表 + 资产负债表（实时推导，任何操作后立即生效） */
function finance(p){
  const inc = {
    salary:      p.salary || 0,
    interest:    (p.assets.savings||[]).reduce((s,x)=>s+x.interest,0),
    dividend:    (p.assets.funds||[]).reduce((s,x)=>s+x.interest,0),
    realEstate:  (p.assets.realEstate||[]).reduce((s,x)=>s+x.cf,0),   /* 联合购买时 cf 已按出资比例切分 */
    business:    (p.assets.business||[]).reduce((s,x)=>s+x.cf,0),
    ftBusiness:  (p.assets.ftBusiness||[]).reduce((s,x)=>s+x.cf,0)
  };
  const bankLoanPay = Math.round((p.liabs.bank||0) * BANK.loanRate);
  const exp = {
    taxes:  p.job.taxes,
    home:   p.liabs.home ? p.job.home : 0,
    school: p.liabs.school ? p.job.school : 0,
    car:    p.liabs.car ? (p.job.car || Math.round(p.liabs.car*0.025)) : 0,
    credit: p.liabs.credit ? p.job.credit : 0,
    retail: p.job.retail,
    other:  p.job.other,
    extra:  p.liabs.extraPay || 0,
    children: p.children * p.job.perChild,
    bank:   bankLoanPay
  };
  const totalIncome   = inc.salary + inc.interest + inc.dividend + inc.realEstate + inc.business + inc.ftBusiness;
  const totalExpenses = exp.taxes+exp.home+exp.school+exp.car+exp.credit+exp.retail+exp.other+exp.extra+exp.children+exp.bank;
  const passive = inc.interest + inc.dividend + inc.realEstate + inc.business + inc.ftBusiness;
  return { inc, exp, totalIncome, totalExpenses, cashflow: totalIncome - totalExpenses, passive, bankLoanPay };
}

/* 跳出老鼠赛跑的门槛 */
function escapeTarget(g, p){
  const f = finance(p);
  return g.rule==='202' ? f.totalExpenses*2 : f.totalExpenses;
}
function escapeProgress(g, p){
  const f = finance(p), t = escapeTarget(g,p);
  return { passive:f.passive, target:t, pct: t>0 ? Math.min(1, f.passive/t) : 1,
           canEscape: f.passive > t };
}
/* 财务自由圈月现金流 = 出圈时锁定的被动收入 + 财务自由圈企业现金流 */
function ftMonthly(p){
  return (p.ftBase||0) + (p.assets.ftBusiness||[]).reduce((s,x)=>s+x.cf,0);
}
/* 资产总账面价值（用于净资产统计） */
function netWorth(p){
  let a = p.cash;
  a += p.assets.stocks.reduce((s,x)=>s+x.shares*x.cost,0);
  a += p.assets.realEstate.reduce((s,x)=>s+x.dp,0);
  a += p.assets.business.reduce((s,x)=>s+x.cost,0);
  a += p.assets.ftBusiness.reduce((s,x)=>s+x.cost,0);
  a += p.assets.savings.reduce((s,x)=>s+x.cost,0);
  a += p.assets.funds.reduce((s,x)=>s+x.cost,0);
  a += p.assets.lands.reduce((s,x)=>s+x.cost,0);
  a += p.assets.collectibles.reduce((s,x)=>s+x.cost,0);
  const l = p.liabs.home+p.liabs.school+p.liabs.car+p.liabs.credit+p.liabs.bank+(p.liabs.other||0);
  return a - l;
}

/* ------------------------------ 玩家 ------------------------------ */
const ASSET_KEYS = ['stocks','realEstate','business','ftBusiness','savings','funds','lands','collectibles'];
function newPlayer(i, name, job, color, icon){
  return {
    id:i, seat:i, name:name||('玩家'+(i+1)), color, icon,
    job,
    salary: job.salary,
    children: 0,
    cash: 0,
    liabs: { home:job.liab.home, school:job.liab.school, car:job.liab.car, credit:job.liab.credit, bank:0, other:0, extraPay:0 },
    assets: { stocks:[], realEstate:[], business:[], ftBusiness:[], savings:[], funds:[], lands:[], collectibles:[] },
    pos: 0, ftPos: 0, inFT: false,
    ftBase: 0, ftGain: 0,
    charityTurns: 0, skipTurns: 0,
    dreamIdx: i % DREAMS.length, dreamOwned: false,
    options: [], shorts: [],
    turnsPlayed: 0,
    out: false, outReason: '',
    franchise: [],
    /* 复盘数据：决策计数 / 关键节点 / 逐轮财富快照（随整局状态一起被存档持久化） */
    stats: null, track: [], milestones: [],
    escaped: false, escapeRound: null, escapePassive: 0,
    reportShown: false
  };
}

/* ------------------------------ 开局 ------------------------------ */
function newGame(cfg){
  const n = cfg.count;
  const careers = shuffle(CAREERS.slice());
  const portfolios = shuffle(PORTFOLIOS.slice());
  const g = {
    rule: cfg.rule || '101',
    /* 游戏模式：age = 年龄模式（20 岁起步，65 岁退休结算）；endless = 无限模式 */
    mode: cfg.mode === 'endless' ? 'endless' : 'age',
    startAge: AGE_START, endAge: AGE_END,
    players: [], cur: 0, round: 1, turnNo: 0,
    phase: 'ratrace',
    over: false, winner: null, winReason: '',
    log: [], pending: null, lastDice: [], lastPath: [],
    rng: cfg.seed ? (function(s){ return function(){ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; })(cfg.seed) : null,
    decks: {
      small:  makeDeck(DECK_SMALL),
      big:    makeDeck(DECK_BIG),
      market: makeDeck(cfg.rule==='202' ? DECK_MARKET_202 : DECK_MARKET_101),
      doodad: makeDeck(cfg.rule==='202' ? DECK_DOODAD_202 : DECK_DOODAD_101),
      capgain:makeDeck(DECK_CAPGAIN),
      cashflow:makeDeck(DECK_CASHFLOW)
    },
    marketDrawn: 0
  };
  for(let i=0;i<n;i++){
    const p = newPlayer(i, (cfg.names&&cfg.names[i])||('玩家'+(i+1)), careers[i%careers.length],
                        PLAYER_COLORS[i].c, PLAYER_ICONS[i]);
    if(g.rule==='202'){
      const pf = portfolios[i%portfolios.length];
      applyPortfolio(p, pf);
      p.portfolio = pf;
    }
    const f = finance(p);
    /* 第 7 步：起始现金 = 月现金流 + 储蓄（202 规则另加初始投资组合中的现金） */
    p.cash = f.cashflow + p.job.savings + (p.pfCash || 0);
    p.startCash = p.cash;
    g.players.push(p);
  }
  log(g, `游戏开始 · ${g.rule} 规则 · ${n} 位玩家 · ${g.mode==='age' ? `年龄模式（${g.startAge}→${g.endAge} 岁，共 ${maxRounds(g)} 轮）` : '无限模式'}`, 'sys');
  log(g, g.rule==='202'
    ? '跳出条件：被动收入 > 总支出 × 2；启用资本利得/大额现金流卡、做空与期权。'
    : '跳出条件：被动收入 > 总支出；投资机会格仅抽投资卡。', 'info');
  g.players.forEach(p=>{
    log(g, `${p.name} 抽到【${p.job.name}】工资 ${money(p.salary)}，起始现金 ${money(p.cash)}`, 'info', p.name);
  });
  trackRound(g);                   /* 起始快照：报告的财富走势从第 1 轮就有基准点 */
  return g;
}

function applyPortfolio(p, pf){
  if(pf.cash) p.cash = (p.cash||0) + 0;   // 现金直接加到起始现金
  if(pf.stocks) for(const k in pf.stocks){
    p.assets.stocks.push({ symbol:k, shares:pf.stocks[k].shares, cost:pf.stocks[k].cost });
  }
  if(pf.realEstate) pf.realEstate.forEach(x=>p.assets.realEstate.push(Object.assign({},x)));
  if(pf.business) pf.business.forEach(x=>p.assets.business.push(Object.assign({},x)));
  if(pf.land) p.assets.lands.push(Object.assign({},pf.land));
  if(pf.collectible) p.assets.collectibles.push(Object.assign({},pf.collectible));
  if(pf.liabs) for(const k in pf.liabs){ p.liabs[k] = (p.liabs[k]||0) + pf.liabs[k]; }
  if(pf.extraPay) p.liabs.extraPay = (p.liabs.extraPay||0) + pf.extraPay;
  p.pfCash = pf.cash || 0;
  p.pfIncome = pf.income || null;
  if(pf.income){
    const amt = pf.income.interest || pf.income.dividend || 0;
    if(pf.income.interest) p.assets.savings.push({ nm:pf.nm, cost:pf.cash||5000, interest:amt });
    else p.assets.funds.push({ nm:pf.nm, cost:pf.cash||3000, interest:amt });
  }
}

/* ------------------------------ 日志 ------------------------------ */
function log(g, text, type, who){
  g.log.unshift({ text, type:type||'info', who:who||'', t:Date.now(), round:g.round });
  if(g.log.length > 300) g.log.length = 300;
}

/* ------------------------------ 年龄 / 轮次 ------------------------------ */
/* 年龄模式：开局 20 岁，所有玩家各行动一次算一轮，每完成一整轮长 1 岁。
   round 表示「当前正在进行的第几轮」（从 1 开始），因此：
     年龄 = startAge + (round - 1)
   已完成的轮数 = round - 1
   总轮数上限 = endAge - startAge（20 → 65 共 45 轮） */
function ageOf(g){ return g.startAge + (g.round - 1); }
function yearsLeft(g){ return Math.max(0, g.endAge - ageOf(g)); }
function maxRounds(g){ return g.endAge - g.startAge; }
function isAgeMode(g){ return g.mode === 'age'; }

/* ------------------------------ 复盘数据采集 ------------------------------ */
/* 游戏结束时能给出「有据可依」的复盘：结论全部由这里记录的计数与快照推导，
   而不是事后从日志文本里猜。兼容旧存档 —— 旧档没有这些字段，initTrack 会补齐默认值。 */
const STAT_KEYS = {
  paychecks:0, dealsSeen:0, dealsBought:0, dealsPassed:0, dealsSold:0, dealsSoldTotal:0,
  investTotal:0, cfGained:0,
  loans:0, loanTotal:0, repaid:0, marketSells:0, marketProceeds:0,
  donations:0, donationTotal:0, forcedCount:0, forcedTotal:0, downsized:0, babies:0,
  liquidations:0, liquidatedValue:0, ftBusinesses:0, buyouts:0, dreams:0,
  /* 峰值用 null 哨兵：初始 0 会让「净资产长期为负」的对局把峰值误记成 0 */
  peakPassive:null, peakNetWorth:null, peakCash:null
};
function initTrack(p){
  if(!p.stats || typeof p.stats !== 'object') p.stats = {};
  for(const k in STAT_KEYS){
    const def = STAT_KEYS[k];
    if(def === null){ if(p.stats[k] === undefined) p.stats[k] = null; }
    else if(typeof p.stats[k] !== 'number') p.stats[k] = def;
  }
  if(!Array.isArray(p.track)) p.track = [];
  if(!Array.isArray(p.milestones)) p.milestones = [];
  if(typeof p.escaped !== 'boolean') p.escaped = !!p.inFT;
  if(p.escapeRound === undefined) p.escapeRound = null;
  if(typeof p.reportShown !== 'boolean') p.reportShown = false;
  return p;
}
function bump(p, key, n){
  initTrack(p);
  p.stats[key] = (p.stats[key] || 0) + (n === undefined ? 1 : n);
}
/* 关键节点：只记「值得回看」的决策，报告的决策时间线直接用它 */
function milestone(g, p, text, kind){
  initTrack(p);
  p.milestones.push({ round:g.round, text, kind:kind || 'info' });
  if(p.milestones.length > 60) p.milestones.shift();
}
/* 每完成一整轮给所有玩家拍一张快照：现金 / 被动收入 / 月现金流 / 净资产 */
function trackRound(g){
  g.players.forEach(p=>{
    initTrack(p);
    const f = finance(p), nw = netWorth(p);
    p.track.push({ round:g.round, cash:p.cash, passive:f.passive, cf:f.cashflow, net:nw });
    if(p.track.length > 60) p.track.shift();
    const st = p.stats;
    if(st.peakPassive === null || f.passive > st.peakPassive) st.peakPassive = f.passive;
    if(st.peakCash === null || p.cash > st.peakCash) st.peakCash = p.cash;
    if(st.peakNetWorth === null || nw > st.peakNetWorth) st.peakNetWorth = nw;
  });
}

/* ------------------------------ 回合流转 ------------------------------ */
function current(g){ return g.players[g.cur]; }
function alivePlayers(g){ return g.players.filter(p=>!p.out); }

function beginTurn(g){
  const p = current(g);
  if(g.over) return null;
  if(p.out){ nextPlayer(g); return beginTurn(g); }
  p.turnStart = { cash:p.cash, cf:finance(p).cashflow };
  /* 慈善加成回合递减 */
  if(p.charityTurns>0) { /* 在实际掷骰后消耗 */ }
  return p;
}

function nextPlayer(g){
  if(g.over) return;
  let guard = 0;
  do{
    g.cur = (g.cur+1) % g.players.length;
    if(g.cur === 0){ trackRound(g); g.round++; expireOptions(g); }
    guard++;
  } while(g.players[g.cur].out && guard < g.players.length*2);
  /* 年龄模式：完成一整轮（所有玩家各行动一次，即 round 递增）即长 1 岁，满 65 岁退休结算 */
  if(isAgeMode(g) && g.round > maxRounds(g)){ endByAge(g); return null; }
  const p = current(g);
  if(p.skipTurns > 0){
    p.skipTurns--;
    log(g, `${p.name} 暂停回合（剩余 ${p.skipTurns} 轮）`, 'sys', p.name);
    nextPlayer(g);
  }
  return current(g);
}

/* 年龄模式结束：按净资产排名，最高者获胜 */
function endByAge(g){
  if(g.over) return;
  g.over = true;
  const alive = alivePlayers(g).slice().sort((a,b)=>netWorth(b)-netWorth(a));
  if(alive.length){
    g.winner = alive[0].id;
    g.winReason = `到达 ${g.endAge} 岁退休结算，按净资产排名 ${alive[0].name} 以 ${money(netWorth(alive[0]))} 位列第一`;
    log(g, `🏁 到达 ${g.endAge} 岁，本局退休结算：${alive[0].name} 净资产 ${money(netWorth(alive[0]))} 排名第一`, 'good', alive[0].name);
  } else {
    g.winner = null;
    g.winReason = `到达 ${g.endAge} 岁，但全部玩家均已破产出局，本局无人获胜`;
    log(g, `🏁 到达 ${g.endAge} 岁，全部玩家均已出局，本局结束`, 'sys');
  }
}

/* 期权 3 回合限制 */
function expireOptions(g){
  g.players.forEach(p=>{
    if(p.out) return;
    const alive = [];
    p.options.forEach(o=>{
      if(o.expiresAt <= g.turnNo){
        log(g, `${p.name} 的 ${o.label} 已到期作废，权利金 ${money(o.premium*o.shares)} 损失`, 'bad', p.name);
      } else alive.push(o);
    });
    p.options = alive;
  });
}

/* ------------------------------ 掷骰 & 移动 ------------------------------ */
function diceCount(g, p){
  if(g.phase === 'fasttrack' || p.inFT) return 2;
  if(p.charityTurns > 0) return p.diceChoice || 1;
  return 1;
}
function rollDice(g, n){
  const out = [];
  for(let i=0;i<n;i++) out.push(1 + Math.floor((g.rng? g.rng():Math.random())*6));
  return out;
}
function spacesOf(g, p){ return p.inFT ? FAST_TRACK : RAT_RACE; }
const RING_LEN = 24;

function pathBetween(from, to){
  const out = []; let i = from;
  let guard = 0;
  do{ i = (i+1) % RING_LEN; out.push(i); guard++; } while(i !== to && guard < 60);
  return out;
}

/* 执行移动 + 结算经过的格子 + 返回落点待处理事件 */
function movePlayer(g, p, steps){
  const spaces = spacesOf(g, p);
  const from = p.inFT ? p.ftPos : p.pos;
  const to = (from + steps) % RING_LEN;
  const path = pathBetween(from, to);
  g.lastPath = path;
  if(p.inFT) p.ftPos = to; else p.pos = to;

  /* 经过 / 停留 结算日格子 → 领取月现金流 */
  let collected = 0;
  path.forEach(ix=>{
    const sp = spaces[ix];
    if(!p.inFT && sp.t === 'paycheck'){ collected += finance(p).cashflow; }
    if(p.inFT && sp.t === 'cashflowday'){ collected += ftMonthly(p); }
  });
  if(collected !== 0){
    p.cash += collected;
    log(g, `${p.name} 经过发薪日，领取 ${money(collected)}`, 'good', p.name);
  }
  return { from, to, path, collected, space: spaces[to] };
}

/* ------------------------------ 格子结算 ------------------------------ */
function resolveSpace(g, p, landed){
  const sp = landed.space;
  const isFT = p.inFT;
  switch(sp.t){
    case 'start':
      setPending(g, { type:'info', ico:'🏁', title: isFT?'财务自由圈起点':'起点', msg:'原地休息，本轮无操作。' });
      break;
    case 'paycheck': case 'cashflowday':
      setPending(g, { type:'info', ico:'💰', title: isFT?'现金流日':'发薪日',
        msg:`已领取月现金流 ${money(isFT?ftMonthly(p):finance(p).cashflow)}。` });
      break;
    case 'opportunity':
      if(g.rule === '202'){
        /* 202：停在投资机会格同时抽取投资卡与行情卡（投资卡由玩家选择牌堆后再抽） */
        const mk = drawMarket(g);
        setPending(g, { type:'opportunity202', market:mk, choices:['capgain','cashflow'],
          title:'投资机会格', ico:'💡' });
      } else {
        setPending(g, { type:'opportunity', choices:['small','big'], title:'投资机会格', ico:'💡' });
      }
      break;
    case 'market':{
      const mk = drawMarket(g);
      setPending(g, { type:'market', card:mk, title:'市场行情', ico:'📈' });
      break;
    }
    case 'doodad':{
      const card = drawCard(g.decks.doodad, ()=>log(g,'额外支出卡用完，重新洗牌','sys'));
      if(card) g.decks.doodad.disc.push(card);   /* 用完放回弃牌堆，抽完自动重洗 */
      setPending(g, { type:'doodad', card, title:'额外支出', ico:'💳' });
      break;
    }
    case 'charity':{
      const f = finance(p);
      const amount = Math.round(f.totalIncome * 0.10);
      setPending(g, { type:'charity', amount, title:'公益捐赠', ico:'🎗️' });
      break;
    }
    case 'baby':
      setPending(g, { type:'baby', title:'孩子', ico:'👶' });
      break;
    case 'downsized':{
      const f = finance(p);
      setPending(g, { type:'downsized', amount:f.totalExpenses, title:'失业', ico:'📉' });
      break;
    }
    case 'business':
      setPending(g, { type:'business', title:'企业投资', ico:'🏭', shop:FT_BUSINESSES });
      break;
    case 'dream':{
      const dream = DREAMS[sp.dream];
      setPending(g, { type:'dream', dream, title:'梦想格', ico:'🌸' });
      break;
    }
    case 'taxaudit': case 'divorce': case 'lawsuit':{
      /* 金额在「落到格子的那一刻」锁定：之后中途贷款 / 变现不会改变这笔已发生的债务，
         也保证弹层上写的数字与实际扣款完全一致。 */
      const key = sp.t, ev = FT_EVENTS[key];
      let amount = 0;
      if(key === 'taxaudit') amount = Math.min(Math.max(10000, Math.round(p.cash*0.5)), p.cash);
      if(key === 'divorce')  amount = Math.round(p.cash*0.5);
      if(key === 'lawsuit')  amount = Math.min(50000, p.cash);
      setPending(g, { type:'ftEvent', key, ev, amount, title:ev.nm, ico:ev.ico });
      break;
    }
    default:
      setPending(g, { type:'info', title:sp.nm, ico:sp.ico||'•', msg:'无特殊操作。' });
  }
  return g.pending;
}
function setPending(g, obj){ obj.p = g.cur; g.pending = obj; return g.pending; }
function clearPending(g){ g.pending = null; }

/* ------------------------------ 抽卡 ------------------------------ */
function drawDeal(g, deckName){
  const n = deckName || (g.rule==='202' ? 'capgain' : 'small');
  const deck = g.decks[n];
  const card = drawCard(deck, ()=>log(g,'投资卡用完，重新洗牌','sys'));
  if(card) deck.disc.push(card);   /* 抽过的卡进入弃牌堆，牌堆抽空后重新洗入 */
  return Object.assign({ deck:n }, card || {});
}
function drawMarket(g){
  const deck = g.decks.market;
  if(deck.draw.length === 0){
    deck.draw = shuffle(deck.disc.concat(g.rule==='202'?[]:[]));
    deck.disc = [];
    if(g.rule==='202'){ g.marketDrawn = 0; log(g,'202 行情卡已抽满，重新洗牌 42 张','sys'); }
  }
  const card = deck.draw.pop();
  deck.disc.push(card);
  g.marketDrawn++;
  /* 202：抽满 25 张后重新洗牌（不保证所有行情卡都出现） */
  if(g.rule==='202' && g.marketDrawn >= 25 && deck.draw.length>0){
    deck.draw = shuffle(deck.draw.concat(deck.disc)); deck.disc=[]; g.marketDrawn = 0;
    log(g, '202 规则：行情卡抽满 25 张，重新洗牌','sys');
  }
  return card;
}

/* ------------------------------ 结束回合 ------------------------------ */
function endTurn(g){
  const p = current(g);
  clearPending(g);
  if(p.charityTurns > 0){
    p.charityTurns--;
    if(p.charityTurns===0) log(g, `${p.name} 的慈善加成结束`, 'info', p.name);
  }
  p.turnsPlayed++;
  p.diceChoice = 1;
  g.turnNo++;
  checkBankruptcy(g, p);
  if(g.over) return null;
  nextPlayer(g);
  return current(g);
}

/* ------------------------------ 现金不变式 ------------------------------ */
/* 规则：现金永不为负。付不出的部分必须先通过「向银行贷款」或「变卖资产」补足，
   两条路都走不通时，只能宣告破产退出游戏 —— 与真实社会的处理方式一致。
   旧版允许现金先变负、回合结束时按【账面原价】自动变现补齐，既不真实玩家也无感。 */
const SELL_RATE = 0.8;              /* 主动变卖：账面价 × 80%（急售折价） */
const BANK_RATE = 0.5;              /* 破产清算：银行半价收购 */

function assetLabel(it){
  if(it.symbol) return `${it.symbol} ${it.shares} 股`;
  if(it.qty) return `${it.nm} ×${it.qty}`;
  return it.nm;
}
/* 唯一支付原语：现金不足时不扣款，而是返回差额（绝不产生负数现金） */
function payCash(p, amount){
  const amt = Math.max(0, Math.round(amount || 0));
  if(amt <= p.cash){ p.cash -= amt; return { ok:true, paid:amt, shortfall:0 }; }
  return { ok:false, paid:0, shortfall: amt - p.cash };
}
/* 可主动变卖的资产清单（含急售价）。期权与财务自由圈企业不计入：
   期权本就随时可能作废，财务自由圈企业计入出圈战绩、不便回退。 */
const SELL_KEYS = ['stocks','realEstate','business','savings','funds','lands','collectibles'];
function sellableAssets(p){
  const out = [];
  p.assets.stocks.forEach((s,i)=>out.push({ key:'stocks', i, nm:assetLabel(s), book:s.shares*s.cost }));
  p.assets.realEstate.forEach((r,i)=>out.push({ key:'realEstate', i, nm:assetLabel(r), book:r.dp||0 }));
  p.assets.business.forEach((b,i)=>out.push({ key:'business', i, nm:assetLabel(b), book:b.cost||0 }));
  p.assets.savings.forEach((x,i)=>out.push({ key:'savings', i, nm:assetLabel(x), book:x.cost||0 }));
  p.assets.funds.forEach((x,i)=>out.push({ key:'funds', i, nm:assetLabel(x), book:x.cost||0 }));
  p.assets.lands.forEach((l,i)=>out.push({ key:'lands', i, nm:assetLabel(l), book:l.cost||0 }));
  p.assets.collectibles.forEach((c,i)=>out.push({ key:'collectibles', i, nm:assetLabel(c), book:c.cost||0 }));
  return out.map(x=>Object.assign(x, { value: Math.round(x.book * SELL_RATE) }));
}
function sellValue(p){ return sellableAssets(p).reduce((s,x)=>s+x.value, 0); }
/* 变卖一项资产换现金：拿到急售价，同时永久失去该资产及其现金流 */
function liquidate(g, p, key, idx){
  if(SELL_KEYS.indexOf(key) < 0) return { ok:false, msg:'该资产不可变卖。' };
  const list = p.assets[key];
  if(!list || !list[idx]) return { ok:false, msg:'资产不存在。' };
  const info = sellableAssets(p).filter(x=>x.key===key && x.i===idx)[0];
  const value = info ? info.value : 0;
  list.splice(idx, 1);
  p.cash += value;
  bump(p, 'liquidations'); bump(p, 'liquidatedValue', value);
  milestone(g, p, `第 ${g.round} 轮急售「${info?info.nm:''}」换现金 ${money(value)}（账面 ${money(info?info.book:0)}，折价变现）`, 'bad');
  log(g, `${p.name} 急售 ${info?info.nm:''}，账面 ${money(info?info.book:0)}，按 ${Math.round(SELL_RATE*100)}% 变现 ${money(value)}`, 'info', p.name);
  return { ok:true, value };
}
/* 主动宣告破产：银行半价收购全部可变现资产抵债，玩家退出游戏 */
function declareBankruptcy(g, p){
  if(p.out) return { ok:false, msg:'该玩家已经出局。' };
  bankLiquidate(g, p);
  p.cash = Math.max(0, p.cash);
  p.out = true;
  p.outReason = '宣告破产';
  milestone(g, p, `第 ${g.round} 轮现金不足以偿付到期债务，宣告破产（银行半价清算全部可变现资产抵债）`, 'bad');
  log(g, `${p.name} 无力偿付到期债务，宣告破产退出游戏`, 'bad', p.name);
  checkLastStanding(g);
  return { ok:true };
}

/* 主动认输：不等破产，玩家自己选择退出本局。
   与破产的区别：认输保留全部资产与负债（仍按净资产计入最终排名），不做半价清算。 */
function surrender(g, p){
  if(p.out) return { ok:false, msg:'该玩家已经出局。' };
  p.out = true;
  p.outReason = '主动认输';
  milestone(g, p, `第 ${g.round} 轮主动认输退出本局（资产与负债完整保留，按净资产计入排名）`, 'bad');
  log(g, `${p.name} 主动认输，退出本局`, 'bad', p.name);
  checkLastStanding(g);
  return { ok:true };
}

/* ------------------------------ 破产 ------------------------------ */
function liquidatableValue(p){
  let v = 0;
  p.assets.stocks.forEach(s=>v += s.shares*s.cost*0.5);
  p.options.forEach(o=>v += 0);           // 银行以半价收购期权，且作废不计
  p.assets.collectibles.forEach(c=>v += c.cost*0.5);
  p.assets.savings.forEach(c=>v += c.cost);
  p.assets.funds.forEach(c=>v += c.cost);
  return v;
}
/* 现金为负 → 被迫变现资产偿债（仍不足则进入破产判定） */
function settleNegativeCash(g, p){
  if(p.cash >= 0) return true;
  const pool = [];
  p.assets.stocks.forEach((s,i)=>pool.push({ k:'stock', i, v:s.shares*s.cost, name:`${s.symbol} 股票 ${s.shares} 股` }));
  p.assets.collectibles.forEach((c,i)=>pool.push({ k:'collectible', i, v:c.cost, name:c.nm }));
  p.assets.savings.forEach((c,i)=>pool.push({ k:'savings', i, v:c.cost, name:c.nm }));
  p.assets.funds.forEach((c,i)=>pool.push({ k:'funds', i, v:c.cost, name:c.nm }));
  p.assets.lands.forEach((c,i)=>pool.push({ k:'land', i, v:c.cost, name:c.nm }));
  pool.sort((a,b)=>b.v-a.v);
  for(const it of pool){
    if(p.cash >= 0) break;
    p.cash += it.v;
    if(it.k==='stock')            p.assets.stocks.splice(it.i,1);
    else if(it.k==='collectible') p.assets.collectibles.splice(it.i,1);
    else if(it.k==='savings')     p.assets.savings.splice(it.i,1);
    else if(it.k==='funds')       p.assets.funds.splice(it.i,1);
    else if(it.k==='land')        p.assets.lands.splice(it.i,1);
    log(g, `${p.name} 现金不足，被迫变现 ${it.name} 换取 ${money(it.v)}`, 'bad', p.name);
  }
  return p.cash >= 0;
}

/* 破产：月现金流为负，且出售所有可变现资产后仍无法扭转 → 退出游戏 */
function checkBankruptcy(g, p){
  if(p.out) return false;
  settleNegativeCash(g, p);                    /* 现金为负时先被迫变现资产 */
  const f = finance(p);
  if(f.cashflow >= 0) return false;            /* 月现金流为正的角色不会破产 */
  const liq = p.cash + liquidatableValue(p);
  if(liq > 0) return false;                    /* 仍有资产可变现，玩家可自行扭转 */
  /* 出售所有资产仍无法扭转 → 破产出局 */
  bankLiquidate(g, p);
  p.out = true;
  p.outReason = '破产';
  milestone(g, p, `第 ${g.round} 轮月现金流为负（${money(f.cashflow)}）且已无资产可变现，被动破产出局`, 'bad');
  log(g, `${p.name} 月现金流为负且已无偿付能力，出售全部资产后仍无法扭转，宣告破产，退出游戏`, 'bad', p.name);
  if(g.rule==='202'){
    log(g, `202 破产惩罚：跳过 3 回合且此后仅能就特定卡牌借贷（该玩家已出局）`, 'bad', p.name);
  }
  checkLastStanding(g);
  return true;
}
function bankLiquidate(g, p){
  let proceeds = 0;
  /* 银行按半价收购全部可变现资产（房产 / 企业 / 土地此前漏掉，会凭空消失且不计价） */
  p.assets.stocks.forEach(s=>{ proceeds += s.shares*s.cost*BANK_RATE; log(g,`银行以半价收购 ${p.name} 的 ${s.symbol} 股票 ${s.shares} 股`, 'bad', p.name); });
  p.assets.collectibles.forEach(c=>{ proceeds += c.cost*BANK_RATE; });
  p.assets.savings.forEach(c=>{ proceeds += c.cost; });
  p.assets.funds.forEach(c=>{ proceeds += c.cost; });
  p.assets.realEstate.forEach(r=>{ proceeds += (r.dp||0)*BANK_RATE; log(g,`银行以半价收购 ${p.name} 的房产「${r.nm}」`, 'bad', p.name); });
  p.assets.business.forEach(b=>{ proceeds += (b.cost||0)*BANK_RATE; log(g,`银行以半价收购 ${p.name} 的企业「${b.nm}」`, 'bad', p.name); });
  p.assets.lands.forEach(l=>{ proceeds += (l.cost||0)*BANK_RATE; log(g,`银行以半价收购 ${p.name} 的土地「${l.nm}」`, 'bad', p.name); });
  p.options.forEach(o=>log(g, `${p.name} 的期权作废`, 'bad', p.name));
  p.assets.stocks=[]; p.assets.collectibles=[]; p.assets.savings=[]; p.assets.funds=[];
  p.assets.realEstate=[]; p.assets.business=[]; p.assets.lands=[]; p.options=[];
  p.cash += proceeds;
  /* 优先还贷，不足部分银行核销 */
  const debt = p.liabs.home+p.liabs.school+p.liabs.car+p.liabs.credit+p.liabs.bank+(p.liabs.other||0);
  const pay = Math.min(p.cash, debt);
  const rest = debt - pay;
  p.cash -= pay;
  p.liabs = { home:0, school:0, car:0, credit:0, bank:0, other:0, extraPay:0 };
  if(rest>0) log(g, `${p.name} 贷款缺口 ${money(rest)} 由银行核销`, 'sys', p.name);
}

/* ------------------------------ 胜负 ------------------------------ */
function checkLastStanding(g){
  const alive = alivePlayers(g);
  /* 全员破产出局：本局无人获胜，直接结束（否则会在没有存活玩家的情况下无限空转） */
  if(alive.length === 0){
    g.over = true; g.winner = null;
    g.winReason = '全部玩家均已破产出局，本局无人获胜';
    log(g, '🏁 全部玩家均已破产出局，本局结束', 'sys');
    return;
  }
  if(alive.length === 1 && g.players.length > 1 && g.rule === '202'){
    win(g, alive[0], '通过买断与破产机制成为最后的存活者');
  }
}
function win(g, p, reason){
  g.over = true; g.winner = p.id; g.winReason = reason;
  log(g, `🏆 ${p.name} 获胜：${reason}`, 'good', p.name);
}
function checkWin(g, p, reason){ win(g, p, reason); }

/* ------------------------------ 导出 ------------------------------ */
window.Engine = {
  money, moneyK, shuffle, pick, finance, escapeTarget, escapeProgress, ftMonthly, netWorth,
  newGame, current, alivePlayers, beginTurn, nextPlayer, endTurn, diceCount, rollDice,
  movePlayer, resolveSpace, clearPending, setPending, drawDeal, drawMarket, drawCard,
  log, expireOptions, checkBankruptcy, settleNegativeCash, checkLastStanding, win, ftMonthlyIncome: ftMonthly,
  RING_LEN, ASSET_KEYS, liquidatableValue, applyPortfolio, deckLeft,
  /* 现金不变式：现金永不为负 */
  SELL_RATE, BANK_RATE, assetLabel, payCash, sellableAssets, sellValue, liquidate, declareBankruptcy,
  /* 年龄 / 轮次 */
  ageOf, yearsLeft, maxRounds, isAgeMode, endByAge,
  /* 复盘数据采集 */
  surrender, initTrack, bump, milestone, trackRound, STAT_KEYS
};
})();
