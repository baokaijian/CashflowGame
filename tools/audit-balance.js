/* 第四批：真实开局、多职业、固定种子；只审计，不改价格。可用 --baseline <ref> 比较。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
function load(ref){
  const c=vm.createContext({console});c.window=c;
  for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions']){
    const file='js/'+f+'.js';
    vm.runInContext(ref?cp.execFileSync('git',['show',ref+':'+file],{cwd:ROOT,encoding:'utf8'}):fs.readFileSync(path.join(ROOT,file),'utf8'),c);
  }
  return c;
}
function samples(c){
  const groups=new Map(c.CAREERS.map(x=>[x.name,[]]));
  for(let seed=20260920;[...groups.values()].some(x=>x.length<6);seed++){
    if(seed>20270920)throw Error('未能生成完整职业样本');
    const g=c.Engine.newGame({rule:'101',mode:'solo',seed});
    const list=groups.get(g.players[0].job.name);if(list.length<6)list.push(seed);
  }
  return [...groups].flatMap(([career,seeds])=>seeds.map(seed=>({career,seed})));
}
function run(c,sample,rule,policy){
  const E=c.Engine,A=c.Act,g=E.newGame({rule,mode:'solo',seed:sample.seed}),p=g.players[0];
  if(p.job.name!==sample.career)throw Error('职业样本发生改变');
  let turns=0,reward=0,ftAt=null;const trades=[],seen={};
  function fund(amount){
    if(p.cash>=amount)return true;
    const credit=E.creditProfile(g,p),need=Math.ceil((amount-p.cash)/1000)*1000;
    if(credit.available>=need)A.takeLoan(g,need);
    for(const x of E.sellableAssets(p,g).sort((a,b)=>a.value-b.value)){
      if(p.cash>=amount)break;
      if(x.value>0)E.liquidate(g,p,x.key,x.i,x.assetId);
    }
    return p.cash>=amount;
  }
  function market(card,execute=true,applied=false){
    if(!applied){seen[card.id]=(seen[card.id]||0)+1;A.marketImpact(g,card);}
    if(!execute)return;
    for(const opt of A.marketOptions(g,card)){
      const asset=opt.kind==='realestate'?p.assets.realEstate.find(x=>x.holdingId===opt.assetId):null;
      const plan=asset?E.propertySettlement(g,asset,opt.wholePrice):null;
      const must=['disaster','land-disaster'].includes(opt.kind);
      const sell=policy==='realize' && (plan?plan.gain>0:['business','savings','fund','stock','collectible','land'].includes(opt.kind));
      if(must||sell){
        const before=p.cash,r=A.marketSell(g,opt);
        if(r.ok&&must)break;
        if(r.ok&&asset)trades.push({card:card.id,property:asset.nm,age:p.age,heldYears:asset.heldYears,cost:asset.cost,down:asset.dp,price:plan.price,debt:plan.debt,proceeds:p.cash-before,gain:plan.gain,equityReturn:+(plan.gain/asset.dp).toFixed(4)});
      }
    }
  }
  function handle(){
    let guard=0;
    while(g.pending&&!p.out&&guard++<40){
      const P=g.pending;
      switch(P.type){
        case 'deficit':
          if(!fund(P.amount)||!A.payDeficit(g,P.amount).ok){E.declareBankruptcy(g,p);E.clearPending(g);break;}
          E.clearPending(g);if(P.landed)E.resolveSpace(g,p,{...P.landed,deficit:0});continue;
        case 'opportunity':case 'opportunity202':{
          const deck=rule==='101'?(p.cash<180000?'small':'big'):(p.cash<160000?'capgain':'cashflow');
          const r=A.chooseDeck(g,deck),d=r.card;
          if(P.market)market(P.market,false);
          if(r.ok){
            const need=A.dealCost(g,d),reserve=Math.max(20000,E.finance(p).totalExpenses*6);
            // 两策略采用相同买入规则；realize 另买纯资本利得房产并接受当期卖出报价。
            const flow=d.kind==='savings'?d.interest:d.cf;
            if((flow>0||(policy==='realize'&&d.capital))&&p.cash-need>=reserve)A.buyDeal(g,d);
            else if(d.joint&&p.cash-need*.5>=reserve)A.buyDealWithOrg(g,d);
          }
          if(P.market)market(P.market,true,true);
          break;
        }
        case 'market':market(P.card);break;
        case 'doodad':if(!fund(P.cost.cost)||!A.payDoodad(g,P.card,P.cost).ok)E.declareBankruptcy(g,p);break;
        case 'downsized':A.doDownsized(g,P.amount);break;
        case 'baby':A.addBaby(g);break;
        case 'charity':A.doCharity(g,false);break;
        case 'rest':if(p.energy<50&&p.cash>10000)A.vacation(g);break;
        case 'business':{
          const b=[...c.FT_BUSINESSES].reverse().find(b=>p.cash-b.cost>Math.max(20000,E.ftFinance(p).expense*6));
          if(b)A.buyFTBusiness(g,b.id);break;
        }
        case 'dream':if(!p.dreamOwned&&P.dream.id===p.dreamIdx)A.buyDream(g);break;
        case 'ftEvent':A.ftEvent(g,P.key,P.amount);break;
      }
      E.clearPending(g);
    }
    if(guard>=40)throw Error('待处理事件未结束');
  }
  while(!g.over&&turns++<500){
    E.beginTurn(g);handle();
    if(p.out||g.over)break;
    if(E.isJobless(p))A.huntJob(g);
    if(!p.pausedThisTurn){
      const dice=E.rollDice(g,E.diceCount(g,p));
      E.resolveSpace(g,p,E.movePlayer(g,p,dice.reduce((a,b)=>a+b,0)));handle();
      if(!p.out&&!g.pending&&E.escapeProgress(g,p).canEscape&&!p.inFT){
        const r=A.escapeRatRace(g);if(r.ok){reward=r.buyout;ftAt=E.ftFinance(p);}
      }
    }
    E.endTurn(g);
  }
  const state=JSON.stringify({p,market:g.market,rng:g.rngState,decks:g.decks},(k,v)=>['track','trackVersion','trackLegacy','historyIncomplete'].includes(k)||typeof v==='function'?undefined:v);
  return {rule,policy,...sample,escapeAge:p.escapeAge,escapePassive:p.escapePassive,bankrupt:p.out,capped:!g.over&&!p.out,endAge:p.age,turns:Math.min(turns,500),energy:p.energy,upkeep:E.energyUpkeep(p),reward,ftAt,cash:p.cash,net:E.netWorth(p),dream:p.dreamOwned,rewardCoversDream:reward>=c.DREAMS[p.dreamIdx].cost,empire:p.ftGain>=E.empireTarget(),trades,seen,
    firstTrackAge:p.track[0]?.age,trackPoints:p.track.length,digest:crypto.createHash('sha256').update(state).digest('hex')};
}
function offers(c){
  const sources={101:[...c.DECK_SMALL,...c.DECK_BIG],202:[...c.DECK_CAPGAIN,...c.DECK_CASHFLOW]};
  return ['101','202'].flatMap(rule=>(rule==='101'?c.DECK_MARKET_101:c.DECK_MARKET_202).filter(x=>x.kind==='realestate').map(m=>{
    const d=sources[rule].find(x=>x.kind==='realestate'&&x.nm===m.prop);
    return {rule,id:m.id,property:m.prop,price:m.price,buyCard:d?.id||null,cost:d?.cost||null,down:d?.dp||null,equityReturn:d?+((m.price-d.cost)/d.dp).toFixed(4):null};
  }));
}
const median=a=>a.length?[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)]:null;
function summarize(rows){
  return ['101','202'].flatMap(rule=>['hold','realize'].map(policy=>{
    const r=rows.filter(x=>x.rule===rule&&x.policy===policy),escaped=r.filter(x=>x.escapeAge!=null);
    return {rule,policy,games:r.length,escapes:escaped.length,medianEscapeAge:median(escaped.map(x=>x.escapeAge)),bankrupt:r.filter(x=>x.bankrupt).length,capped:r.filter(x=>x.capped).length,dreams:r.filter(x=>x.dream).length,empires:r.filter(x=>x.empire).length,propertySales:r.reduce((s,x)=>s+x.trades.length,0),medianNet:median(r.map(x=>x.net)),medianReward:median(escaped.map(x=>x.reward)),rewardCoversDream:escaped.filter(x=>x.rewardCoversDream).length,negativeFTAtEscape:escaped.filter(x=>x.ftAt.cashflow<0).length};
  }));
}
function audit(baseline){
  const c=load(),cases=samples(c),rows=[];
  for(const rule of ['101','202'])for(const policy of ['hold','realize'])for(const s of cases)rows.push(run(c,s,rule,policy));
  let comparison=null;
  if(baseline){
    const b=load(baseline),old=rows.map(x=>run(b,x,x.rule,x.policy));
    comparison={baseline,games:old.length,careers:c.CAREERS.map(career=>({career:career.name,before:summarize(old.filter(x=>x.career===career.name)),after:summarize(rows.filter(x=>x.career===career.name))})),changedOutcomes:old.filter((x,i)=>['cash','net','escapeAge','bankrupt','capped','dream','empire','reward'].some(k=>x[k]!==rows[i][k])).length,summary:summarize(old),lostOpeningBefore:old.filter(x=>x.firstTrackAge>20).length,lostOpeningAfter:rows.filter(x=>x.firstTrackAge>20).length};
  }
  return {method:'500-turn cap reported separately; 6 natural-opening seeds per career, 12 careers, 101/202, hold/realize; reserve 6 months or 20000; no options/shorts, no optimal-play claim',samples:cases,cappedCases:rows.filter(x=>x.capped).map(({rule,policy,career,seed,endAge,turns,energy,upkeep})=>({rule,policy,career,seed,endAge,turns,energy,upkeep})),offers:offers(c),summary:summarize(rows),comparison,careers:c.CAREERS.flatMap(x=>summarize(rows.filter(r=>r.career===x.name)).map(s=>({career:x.name,...s}))),witnesses:rows.filter(x=>x.trades.length).map(({rule,policy,career,seed,trades})=>({rule,policy,career,seed,trades}))};
}
if(require.main===module){
  const args=process.argv.slice(2),i=args.indexOf('--baseline'),out=args.indexOf('--out'),result=audit(i<0?null:args[i+1]);
  if(out>=0)fs.writeFileSync(args[out+1],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({summary:result.summary,comparison:result.comparison,offers:result.offers},null,2));
}
module.exports={load,samples,run,offers,summarize,audit};
