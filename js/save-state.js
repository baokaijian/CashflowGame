/* 完整存档编解码：不依赖 DOM；在临时副本上校验和迁移，成功后才能替换当前对局。 */
(function(){
'use strict';
const E=window.Engine, VERSION=2, KEY='cf_save_v1', MAX_CHARS=2000000;
const ASSETS=['stocks','realEstate','business','ftBusiness','savings','funds','lands','collectibles'];
const DECKS=['small','big','market','doodad','capgain','cashflow'];
const PENDING=['info','rest','deficit','opportunity','opportunity202','market','doodad','charity','baby','downsized','business','dream','ftEvent'];
const obj=x=>x!==null && typeof x==='object' && !Array.isArray(x);
function requireValue(ok,msg){if(!ok)throw new Error(msg);}
function finite(x){return typeof x==='number' && Number.isFinite(x);}
function integer(x,min,max){return Number.isSafeInteger(x)&&x>=min&&x<=max;}
function numbers(x,keys){keys.forEach(k=>{if(x[k]!=null)requireValue(finite(x[k]),'数值字段无效：'+k);});}
function cardRecord(card){
  requireValue(obj(card),'卡片记录无效');
  numbers(card,['cost','dp','price','cf','interest','rent','rate','pct','premium','strike','min','max','amount']);
  for(const k of ['nm','symbol','kind','note','prop','target'])if(card[k]!=null)requireValue(typeof card[k]==='string','卡片字段无效：'+k);
}
function cleanTree(root){
  let count=0;
  function visit(x,depth){
    requireValue(++count<=150000 && depth<=40,'存档结构过大或嵌套过深');
    if(typeof x==='number')requireValue(finite(x),'存档包含无效数值');
    if(x && typeof x==='object')Object.keys(x).forEach(k=>{
      requireValue(!['__proto__','prototype','constructor'].includes(k),'存档含有不支持的字段');visit(x[k],depth+1);
    });
  }
  visit(root,0);
}
function validate(data){
  requireValue(obj(data) && [1,VERSION].includes(data.v),'不是可恢复的游戏存档，或版本不支持；复盘报告不能用于恢复对局');
  if(data.v===VERSION)requireValue(data.format==='cashflow-save','完整存档格式不正确');
  requireValue(finite(data.at)&&data.at>=0,'存档时间无效');
  const g=data.g;requireValue(obj(g),'存档缺少完整对局');
  requireValue(['101','202'].includes(g.rule)&&['solo','age','endless'].includes(g.mode),'游戏规则或模式无效');
  requireValue(Array.isArray(g.players)&&integer(g.players.length,1,6),'玩家列表无效');
  requireValue(integer(g.cur,0,g.players.length-1)&&integer(g.round,1,10000000)&&integer(g.turnNo,0,100000000),'当前回合无效');
  requireValue(obj(g.market)&&integer(g.marketDrawn,0,100000000),'行情状态无效');
  requireValue(finite(g.startAge)&&finite(g.endAge)&&g.endAge>g.startAge,'年龄范围无效');
  requireValue(g.timeVersion==null||[1,2].includes(g.timeVersion),'时间规则版本不支持');
  requireValue(typeof data.rolled==='boolean'&&typeof g.over==='boolean','行动状态无效');
  requireValue(g.winner==null||integer(g.winner,0,g.players.length-1),'获胜玩家无效');
  requireValue(Array.isArray(g.log)&&Array.isArray(g.lastDice)&&Array.isArray(g.lastPath),'对局记录无效');
  g.log.forEach(x=>requireValue(obj(x)&&typeof x.text==='string','日志记录无效'));
  g.players.forEach((p,i)=>{
    requireValue(obj(p)&&p.id===i&&typeof p.name==='string'&&p.name.length<=200,'玩家身份无效');
    requireValue(typeof p.color==='string'&&/^#[\da-f]{3,8}$/i.test(p.color)&&typeof p.icon==='string','玩家显示信息无效');
    requireValue(obj(p.job)&&typeof p.job.name==='string'&&obj(p.job.liab),'职业数据不完整');
    for(const k of ['salary','taxes','home','school','car','credit','retail','other','perChild','savings'])requireValue(finite(p.job[k]),'职业金额无效');
    requireValue(finite(p.cash)&&finite(p.salary)&&integer(p.children,0,3)&&typeof p.inFT==='boolean','玩家财务数据无效');
    requireValue(integer(p.pos,0,23)&&integer(p.ftPos,0,23),'棋盘位置无效');
    requireValue(p.age==null||finite(p.age),'玩家年龄无效');
    numbers(p,['energy','baseSalary','salaryMult','taxesCur','lifeCoef','elderCare','joblessProgress','joblessNeed','wings','medicalExp','crisisTurns','creditBanUntil','ftGain','ftBase','settledAge','settledYears','charityTurns','skipTurns','turnsPlayed']);
    requireValue(p.ftIncomeVersion==null||p.ftIncomeVersion===1,'分红规则版本不支持');
    requireValue(obj(p.liabs)&&obj(p.assets),'资产负债数据不完整');
    E.LOAN_KEYS.forEach(k=>requireValue(finite(p.liabs[k])&&p.liabs[k]>=0,'负债金额无效'));
    ASSETS.forEach(k=>{
      requireValue(Array.isArray(p.assets[k])&&p.assets[k].length<=10000,'持仓列表无效');
      p.assets[k].forEach(a=>{
        requireValue(obj(a)&&finite(a.cost)&&a.cost>=0,'持仓取得成本无效');
        numbers(a,['heldYears','buyRound','qty','rent','projectDebt','financingRate','baseCf']);
        requireValue(typeof (k==='stocks'?a.symbol:a.nm)==='string','持仓名称无效');
        if(k==='stocks')requireValue(integer(a.shares,1,1000000000),'股票数量无效');
        if(['realEstate','business','ftBusiness'].includes(k))requireValue(finite(a.cf),'资产现金流无效');
        if(k==='realEstate')requireValue(finite(a.dp)&&a.dp>=0&&(a.share==null||(finite(a.share)&&a.share>0&&a.share<=1)),'房产权益无效');
        if(['savings','funds'].includes(k))requireValue(finite(a.interest),'理财派息无效');
      });
    });
    for(const k of ['options','shorts','track','milestones']){
      requireValue(Array.isArray(p[k]),'玩家记录不完整');p[k].forEach(x=>requireValue(obj(x),'玩家记录内容无效'));
    }
    if(p.loanDrawRounds)requireValue(Array.isArray(p.loanDrawRounds)&&p.loanDrawRounds.every(finite),'借款轮次记录无效');
    p.options.forEach(o=>requireValue(obj(o)&&typeof o.id==='string'&&typeof o.symbol==='string'&&finite(o.shares)&&finite(o.strike)&&finite(o.expiresAt),'期权记录无效'));
    if(p.family){requireValue(obj(p.family)&&p.family.version===1&&Array.isArray(p.family.children),'家庭记录版本或结构无效');p.family.children.forEach(x=>requireValue(obj(x),'子女记录无效'));}
  });
  requireValue(obj(g.decks),'缺少完整牌堆');
  DECKS.forEach(k=>{
    const d=g.decks[k];requireValue(obj(d)&&Array.isArray(d.draw)&&Array.isArray(d.disc)&&d.draw.length+d.disc.length>0,'牌堆无效');
    requireValue(d.draw.length+d.disc.length<=1000,'牌堆过大');
    d.draw.concat(d.disc).forEach(card=>{cardRecord(card);requireValue(typeof card.id==='string','卡片编号无效');});
  });
  if(g.pending){
    const p=g.pending;requireValue(obj(p)&&PENDING.includes(p.type)&&integer(p.p,0,g.players.length-1),'待处理事件无效');
    for(const k of ['card','market','deal'])if(p[k]!=null)cardRecord(p[k]);
    if(p.choices)requireValue(Array.isArray(p.choices)&&p.choices.every(x=>DECKS.includes(x)),'可选牌堆无效');
    if(p.impact){requireValue(obj(p.impact),'行情结算无效');if(p.impact.forced)requireValue(Array.isArray(p.impact.forced)&&p.impact.forced.every(obj),'强制结算记录无效');}
    if(['market','doodad'].includes(p.type))requireValue(obj(p.card),'待处理卡片缺失');
    if(['deficit','charity','downsized','ftEvent'].includes(p.type))requireValue(finite(p.amount)&&p.amount>=0,'待处理金额无效');
    if(p.type==='dream')requireValue(obj(p.dream)&&finite(p.dream.cost),'梦想事件无效');
  }
  if(data.pendingDice!=null){
    requireValue(!data.rolled&&!g.pending&&!g.over&&Array.isArray(data.pendingDice)&&integer(data.pendingDice.length,1,3)&&data.pendingDice.every(x=>integer(x,1,6)),'待完成骰子无效');
  }
  if(g.assetMarket)requireValue(obj(g.assetMarket)&&obj(g.assetMarket.quotes)&&obj(g.assetMarket.properties)&&Array.isArray(g.assetMarket.listings)&&Array.isArray(g.assetMarket.trades)&&integer(g.assetMarket.next,0,Number.MAX_SAFE_INTEGER),'资产交易记录无效');
}
function prepare(text){
  requireValue(typeof text==='string'&&text.length<=MAX_CHARS,'存档文件过大');
  let data;try{data=JSON.parse(text);}catch(e){throw new Error('存档不是有效的 JSON 文件');}
  cleanTree(data);validate(data);
  E.restoreRandom(data.g);E.migrateTime(data.g);
  validate(data);
  // 在临时状态推导关键账本，迁移或金额异常不得污染当前游戏。
  data.g.players.forEach(p=>{
    const f=E.finance(p),ft=E.ftFinance(p),a=E.appraiseAll(data.g,p);
    requireValue([f.totalIncome,f.totalExpenses,ft.income,ft.expense,a.value,a.collateral].every(finite),'存档账本无法正确计算');
  });
  return data;
}
function encode(g,view,local){
  requireValue(!!g,'当前没有对局可备份');
  const data={format:'cashflow-save',v:VERSION,at:Date.now(),rolled:!!view.rolled,pendingDice:view.pendingDice||null,g};
  const text=JSON.stringify(data,(k,v)=>{
    if(typeof v==='number')requireValue(finite(v),'当前对局包含无效数值，未覆盖上次存档');
    return typeof v==='function'?undefined:v;
  });
  requireValue(text.length<=MAX_CHARS,'对局已超过支持的存档大小上限');
  const copy=JSON.parse(text);if(local)copy.g.log=copy.g.log.slice(0,80);
  cleanTree(copy);validate(copy);return JSON.stringify(copy);
}
window.SaveState={VERSION,KEY,MAX_CHARS,prepare,encode};
})();
