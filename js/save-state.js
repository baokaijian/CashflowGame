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
    if(p.family){
      const f=p.family;
      requireValue(obj(f)&&f.version===1&&Array.isArray(f.children)&&f.children.length<=3,'家庭记录版本或结构无效');
      requireValue(integer(f.contributionYears,0,10000000)&&integer(f.estimatedContributionYears,0,f.contributionYears)&&finite(f.lastYearAge),'缴费记录无效');
      const ids=new Set();
      f.children.forEach(x=>{
        requireValue(obj(x)&&typeof x.id==='string'&&!ids.has(x.id)&&finite(x.birthAge)&&x.birthAge>=0&&
          (p.age==null||x.birthAge<=p.age)&&typeof x.ageUnknown==='boolean','子女身份或年龄记录无效');ids.add(x.id);
      });
    }
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
  if(g.recovery){
    const r=g.recovery;
    requireValue(obj(r)&&r.version===1&&integer(r.next,0,1000000)&&Array.isArray(r.entries)&&r.entries.length<=1000,'历史核对记录无效');
    const ids=new Set();r.entries.forEach(x=>{
      requireValue(obj(x)&&integer(x.id,1,r.next)&&!ids.has(x.id)&&typeof x.kind==='string'&&typeof x.evidence==='string'&&
        Array.isArray(x.changes)&&x.changes.every(c=>obj(c)&&typeof c.label==='string'),'历史核对凭据无效');ids.add(x.id);
    });
    if(r.archive)requireValue(obj(r.archive)&&Array.isArray(r.archive.logs)&&r.archive.logs.length<=3000&&r.archive.logs.every(x=>obj(x)&&typeof x.text==='string')&&
      Array.isArray(r.archive.tracks)&&r.archive.tracks.length<=1000&&r.archive.tracks.every(x=>obj(x)&&integer(x.player,0,g.players.length-1)),'补充历史档案无效');
  }
}
function prepare(text){
  requireValue(typeof text==='string'&&text.length<=MAX_CHARS,'存档文件过大');
  let data;try{data=JSON.parse(text);}catch(e){throw new Error('存档不是有效的 JSON 文件');}
  cleanTree(data);validate(data);
  const priorRepairs=data.g.recovery?data.g.recovery.entries.length:0;
  E.restoreRandom(data.g);E.migrateTime(data.g);
  data.g.players.forEach(p=>ASSETS.forEach(kind=>p.assets[kind].forEach(item=>E.holdingId(data.g,item))));
  reconcileReceipts(data.g);
  data.autoRepairs=(data.g.recovery?data.g.recovery.entries.length:0)-priorRepairs;
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
/* 历史核对：只在副本上预览；财务修正与真实交易分开，不重放现金或发薪。 */
const REPAIR_BACKUP_KEY='cf_repair_before_v1';
const clone=x=>JSON.parse(JSON.stringify(x));
function stateKey(data){return JSON.stringify({g:data.g,rolled:data.rolled,pendingDice:data.pendingDice||null});}
function recovery(g){
  if(!g.recovery)g.recovery={version:1,next:0,entries:[]};
  return g.recovery;
}
function recordRepair(g,kind,evidence,changes,extra){
  const r=recovery(g);
  requireValue(r.entries.length<1000,'核对记录已达上限，请先导出完整备份');
  const entry={id:++r.next,kind,evidence,round:g.round,at:Date.now(),changes,...extra};
  r.entries.push(entry);return entry;
}
function reconcileReceipts(g){
  const trades=g.assetMarket && g.assetMarket.trades || [];
  g.players.forEach(p=>['stocks','business'].forEach(kind=>(p.assets[kind]||[]).forEach(item=>{
    if(!item.holdingId || item.costReviewed)return;
    const rows=trades.filter(t=>t && t.type==='协议转让'&&t.kind===kind&&t.buyer===p.id&&t.holdingId===item.holdingId);
    if(rows.length!==1)return;
    if(g.players.flatMap(x=>ASSETS.flatMap(k=>x.assets[k])).filter(x=>x.holdingId===item.holdingId).length!==1)return;
    const t=rows[0];
    if(!integer(t.price,0,1000000000000)||(kind==='stocks'&&t.shares!==item.shares))return;
    const expected=kind==='stocks'?t.price/item.shares:t.price;
    if(item.cost===expected)return;
    const before=item.cost;item.cost=expected;item.costReviewed='receipt';
    recordRepair(g,'receipt','唯一持仓编号对应的协议成交记录',[
      {label:p.name+' · '+E.assetLabel(item)+' 取得成本',before,after:expected}
    ],{player:p.id,holdingId:item.holdingId});
    E.log(g,p.name+' 的持仓成本已按唯一成交凭据恢复；现金不变，可在历史核对中查看。','info',p.name);
  })));
}
function repairStatus(g){
  const rows=[];
  g.players.forEach(p=>{
    const f=p.family;
    if(f && (f.estimatedContributionYears>0||f.children.some(x=>x.ageUnknown)))
      rows.push(p.name+'：家庭历史含兼容估计，可填写确认后的年龄或缴费年数。');
    if(p.portfolioFinancingMigration && p.portfolioFinancingMigration.status==='review')
      rows.push(p.name+'：旧组合融资待拆分，可按凭据转入对应房产或清理已售重复余额。');
    if(p.trackLegacy)rows.push(p.name+'：财富历史不完整，可从同一局的历史备份补入现存记录。');
  });
  if(g.rngMigrated)rows.push('旧档原随机序列缺失；现已固定后续进度，不影响继续游戏。');
  return rows;
}
function planRepair(text,request){
  const sourceData=JSON.parse(text),source=stateKey(sourceData),data=prepare(text),g=data.g;
  requireValue(!data.pendingDice,'请先完成已经生成的骰子再核对历史');
  requireValue(obj(request)&&typeof request.evidence==='string'&&request.evidence.trim().length>=4&&request.evidence.length<=500,
    '请填写至少 4 字的核对依据（最多 500 字），不能只凭猜测修改金额');
  const q=clone(request),p=g.players[q.player],changes=[];
  requireValue(!!p,'请选择有效玩家');
  const set=(target,key,value,label)=>{
    if(JSON.stringify(target[key])===JSON.stringify(value))return;
    changes.push({label,before:target[key]===undefined?null:clone(target[key]),after:clone(value)});target[key]=value;
  };
  const amount=(v,label)=>{requireValue(integer(v,0,1000000000000),label+'须为非负整数');return v;};
  const number=(v,max,label)=>{requireValue(finite(v)&&v>=0&&v<=max,label+'无效');return v;};
  if(q.kind==='family'){
    const f=p.family;
    if(q.childId!=null){
      const child=f.children.find(x=>x.id===q.childId);
      requireValue(!!child && integer(q.childAge,0,Math.floor(p.age)),'子女身份或年龄无效');
      set(child,'birthAge',p.age-q.childAge,'子女出生时父母年龄');
      set(child,'ageUnknown',false,'子女年龄是否未知');
    }
    if(q.contributionYears!=null){
      requireValue(integer(q.contributionYears,0,Math.max(0,p.age-g.startAge)),'缴费年数不能超过已经度过的年数');
      set(f,'contributionYears',q.contributionYears,'实际缴费年数');
      set(f,'estimatedContributionYears',0,'兼容估计缴费年数');
    }
    requireValue(q.childId!=null||q.contributionYears!=null,'请填写要修正的家庭记录');
    E.refreshLife(g,p); // 同步退休养老金；不调用年度结算，也不改变 lastYearAge。
  }else if(q.kind==='financing'){
    requireValue(p.portfolioFinancingMigration && p.portfolioFinancingMigration.status==='review','该玩家没有待核对的组合融资');
    const duplicate=amount(q.duplicate,'重复融资本金'),remaining=p.liabs.other-duplicate;
    requireValue(duplicate<=p.liabs.other,'拆分本金不能超过其他负债余额');
    requireValue(['held','sold','separate'].includes(q.disposition),'请选择融资处理方式');
    if(q.disposition==='separate')requireValue(duplicate===0,'确认独立债务时不能扣减本金');
    if(q.disposition!=='separate'){
      const due=amount(q.remainingDue,'剩余其他负债合同月供');
      requireValue(remaining===0?due===0:due>=Math.round(remaining*E.loanType('other').rate)&&due>0,
        '剩余债务月供需按确认后的合同填写，且至少覆盖当期利息；无债务则填零');
      set(p.liabs,'other',remaining,'其他负债余额');
      set(p.loans,'other',{base:remaining,due,periods:0},'其他负债拆分后的计划');
    }
    if(q.disposition==='held'){
      const holdings=g.players.flatMap(owner=>owner.assets.realEstate.filter(x=>x.holdingId===q.assetId).map(item=>({owner,item})));
      requireValue(holdings.length===1,'请唯一指定承接融资的当前房产');
      const item=holdings[0].item,prop=g.assetMarket.properties[item.propertyId];
      requireValue(E.assetName(item)==='老破小出租房','此入口只核对初始老破小组合融资');
      const share=E.holdingShare(item),rent=amount(q.rent,'本人毛租金');
      requireValue(!item.capital,'纯资本房产不适用出租融资修正');
      set(item,'projectDebt',duplicate,'对应房产剩余项目融资');
      set(item,'rent',rent,'本人毛租金');
      set(item,'cf',rent-Math.round(duplicate*item.financingRate),'房产扣息后月现金流');
      if(item.baseCf!=null)set(item,'baseCf',item.cf,'房产基准净现金流');
      const others=g.players.flatMap(x=>x.assets.realEstate).filter(x=>x.propertyId===item.propertyId&&x!==item);
      const whole=share===1?rent:amount(q.wholeRent,'共有房产整套毛租金');
      requireValue(Math.round(whole*share)===rent,'本人毛租金必须与整套租金及份额对应');
      requireValue(share+others.reduce((sum,x)=>sum+E.holdingShare(x),0)+g.assetMarket.listings.filter(x=>x.propertyId===item.propertyId&&x.status==='listed').reduce((sum,x)=>sum+x.share,0)<=1.0000001,
        '现有产权合计超过整套，请先核对原始产权凭据');
      set(prop,'rent',whole,'房产实体毛租金');
      others.forEach(x=>{
        const owner=g.players.find(person=>person.assets.realEstate.includes(x));
        const ownRent=Math.round(whole*E.holdingShare(x));
        set(x,'rent',ownRent,owner.name+' 的共有毛租金');
        set(x,'cf',ownRent-Math.round(E.projectDebt(x)*x.financingRate),owner.name+' 的共有扣息现金流');
      });
    }
    set(p,'portfolioFinancingMigration',{version:1,status:q.finishReview===false?'review':'confirmed',disposition:q.disposition,evidence:q.evidence,
      duplicate,remaining,...(q.finishReview===false?{reason:'已核对部分融资，仍有剩余项目待核对'}:{})},'组合融资核对结果');
  }else if(q.kind==='cost'){
    requireValue(ASSETS.includes(q.assetKind)&&q.assetKind!=='realEstate','此入口修改非房产取得成本，房产融资请单独核对');
    const items=p.assets[q.assetKind].filter(x=>x.holdingId===q.assetId);
    requireValue(items.length===1,'原持仓已改变，请重新选择');
    const item=items[0],total=amount(q.totalCost,'取得总成本');
    set(item,'cost',q.assetKind==='stocks'?total/item.shares:total,'本人取得成本'+(q.assetKind==='stocks'?'（每股）':''));
    if(changes.length)set(item,'costReviewed','manual','成本核对来源');
  }else if(q.kind==='cash'){
    set(p,'cash',amount(q.cash,'确认后的现金余额'),'当前现金余额');
  }else if(q.kind==='listing'){
    requireValue(typeof q.reference==='string'&&q.reference.trim().length>=4&&q.reference.length<=120,'请填写唯一的售房凭据编号');
    requireValue(!g.assetMarket.listings.some(x=>x.repairReference===q.reference)&&
      !(g.recovery && g.recovery.entries.some(x=>x.reference===q.reference)),'此凭据已补录，不能重复生成房产');
    requireValue(typeof q.name==='string'&&q.name.trim().length>0&&q.name.length<=100,'房产名称无效');
    const value=amount(q.value,'整套参考价'),rent=amount(q.rent,'整套毛租金');
    requireValue(value>0&&finite(q.share)&&q.share>0&&q.share<=1,'参考价和已售份额无效');
    const down=number(q.downRate,1,'首付比例'),years=number(q.heldYears,10000000,'已有持有年数');
    requireValue(typeof q.capital==='boolean'&&(!q.capital||rent===0),'纯资本房产毛租金必须为零');
    const m=g.assetMarket;let id=q.propertyId,prop=id && m.properties[id];
    if(id){
      requireValue(!!prop&&prop.nm===q.name.trim(),'原房产实体与名称不符');
      const occupied=g.players.flatMap(x=>x.assets.realEstate).filter(x=>x.propertyId===id).reduce((sum,x)=>sum+E.holdingShare(x),0)+
        m.listings.filter(x=>x.propertyId===id&&x.status==='listed').reduce((sum,x)=>sum+x.share,0);
      requireValue(occupied+q.share<=1.0000001,'原实体已有持仓或挂牌，不能重复补录该份额');
      requireValue(prop.rent===rent&&prop.downRate===down&&!!prop.capital===q.capital&&
        E.propertyValue(g,{propertyId:id,nm:prop.nm,share:1,cost:prop.referencePrice})===value,'原实体报价、租金或属性已变化，请按现有实体重新核对');
    }else{
      requireValue(!Object.values(m.properties).some(x=>x.nm===q.name.trim())||q.differentProperty===true,
        '已有同名实体，请选择原实体；只有凭据确认是另一套时才另建');
      do{id='property-'+(++m.next);}while(m.properties[id]);
      prop=m.properties[id]={id,nm:q.name.trim(),referencePrice:value,referenceIndex:E.marketIndex(g,'realEstate'),referenceRevision:m.next,
        rent,capital:q.capital,downRate:down,createdAge:p.age-years,operating:clone(E.operationProfile('realEstate',{nm:q.name})),history:[]};
    }
    prop.history.push({type:'凭据补录挂牌',player:p.id,propertyId:id,share:q.share,round:g.round,age:p.age,reference:q.reference});
    const listing={id:'listing-'+(++m.next),propertyId:id,share:q.share,heldYears:years,listedAge:Math.max(...g.players.map(x=>x.age-g.startAge)),
      soldBy:p.id,availableTurn:g.turnNo+1,status:'listed',repairReference:q.reference};
    m.listings.push(listing);changes.push({label:'补录已售房产挂牌（不补发售房款）',before:null,after:{...listing,name:q.name,value,rent,downRate:down}});
  }else if(q.kind==='history'){
    requireValue(typeof q.backup==='string','请选择同一局的历史完整备份');
    const old=prepare(q.backup).g;
    requireValue(old.rule===g.rule&&old.mode===g.mode&&old.startAge===g.startAge&&old.players.length===g.players.length&&
      old.players.every((x,i)=>x.name===g.players[i].name&&x.job.name===g.players[i].job.name),'历史备份的规则、玩家或职业不匹配');
    requireValue(q.sameGame===true,'需要明确确认两份备份属于同一局；姓名与职业相同不能证明同一局');
    const archive=(g.recovery && g.recovery.archive)||{logs:[],tracks:[]};
    const logs=new Set([...g.log,...archive.logs].map(x=>JSON.stringify(x)));
    const tracks=new Set([...g.players.flatMap(x=>x.track.map(row=>JSON.stringify({player:x.id,...row}))),...archive.tracks.map(x=>JSON.stringify(x))]);
    const extraLogs=JSON.parse(q.backup).g.log.filter(row=>{const k=JSON.stringify(row);if(logs.has(k))return false;logs.add(k);return true;});
    const extraTracks=old.players.flatMap(x=>x.track.map(row=>({player:x.id,...row}))).filter(row=>{const k=JSON.stringify(row);if(tracks.has(k))return false;tracks.add(k);return true;});
    requireValue(extraLogs.length+extraTracks.length>0,'没有可补入的新历史记录');
    requireValue(archive.logs.length+extraLogs.length<=3000 && archive.tracks.length+extraTracks.length<=1000,'补充历史过大，请保留原备份查阅');
    recovery(g).archive={logs:archive.logs.concat(extraLogs),tracks:archive.tracks.concat(extraTracks)};
    changes.push({label:'补充历史档案（不覆盖当前账本、走势或随机状态）',before:{logs:archive.logs.length,tracks:archive.tracks.length},
      after:{logs:archive.logs.length+extraLogs.length,tracks:archive.tracks.length+extraTracks.length}});
  }else throw new Error('不支持的核对项目');
  requireValue(changes.length>0,'没有需要修改的差异');
  recordRepair(g,q.kind,q.evidence.trim(),changes,{player:p.id,...(q.reference?{reference:q.reference}:{})});
  E.log(g,p.name+' 完成历史核对：'+changes.map(x=>x.label).join('、')+'；未重放年度结算。','info',p.name);
  // 复盘历史保持原样；核对账本独立保留变更前后及依据，不能伪装成游戏赚取的收益。
  const output=encode(g,data,false);prepare(output);
  return {source,request:q,text:output,changes,before:{cash:sourceData.g.players[p.id].cash,monthly:E.settleCashflow(sourceData.g.players[p.id])},
    after:{cash:p.cash,monthly:E.settleCashflow(p)}};
}

window.SaveState={VERSION,KEY,MAX_CHARS,REPAIR_BACKUP_KEY,prepare,encode,stateKey,planRepair,repairStatus};
})();
