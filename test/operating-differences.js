/* 经营选择的现金、精力、交易与恢复不变式；零依赖。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act;
function game(count=1){
  const g=E.newGame({mode:count===1?'solo':'age',rule:'202',count,seed:42});
  g.players.forEach(p=>{Object.keys(p.assets).forEach(k=>p.assets[k]=[]);p.cash=5000000;p.energy=100;});
  return g;
}
const card=c.DECK_CASHFLOW.find(x=>x.id==='cf1');
const blank=()=>({assets:{realEstate:[],business:[],ftBusiness:[]},options:[],shorts:[]});
let n=0;function test(name,fn){fn();n++;console.log('✅ '+name);}
test('同类组合节省管理，但超量扩张仍超过恢复能力，排列不改变维护',()=>{
  const p=blank();for(let i=0;i<5;i++)p.assets.realEstate.push({nm:'住宅',opProfile:'housing',share:1});
  assert.equal(E.energyUpkeep(p),8);p.assets.realEstate.reverse();assert.equal(E.energyUpkeep(p),8);
  for(let i=0;i<9;i++)p.assets.realEstate.push({nm:'住宅',opProfile:'housing',share:1});
  assert(E.energyUpkeep(p)>14);assert(E.operatingSummary(p).overload>0);
  p.assets.realEstate=[];p.options=[{},{}];p.shorts=[{}];assert.equal(E.energyUpkeep(p),9);
});
test('同一房产的多笔份额不重复计管理项目，跨类型不能滥用规模优惠',()=>{
  const p=blank();p.assets.realEstate=[{propertyId:'one',share:.4},{propertyId:'one',share:.6}];
  assert.equal(E.operatingSummary(p).count,1);assert.equal(E.energyUpkeep(p),2);
  p.assets.realEstate=[{opProfile:'housing'},{opProfile:'commercial'}];
  assert.equal(E.operatingSummary(p).saving,0);assert.equal(E.energyUpkeep(p),5);
});
test('卡片携带经营类型，实际买入保存且不同实业工作量、折旧不同',()=>{
  const g=game(),p=g.players[0];
  for(const id of ['bg5','bg6','bg8']){p.energy=100;assert(A.buyDeal(g,c.DECK_BIG.find(x=>x.id===id)).ok);}
  const [brand,self,equipment]=p.assets.business;
  assert.equal(brand.operating.id,'brand');assert.equal(self.operating.upkeep,4);assert.equal(equipment.operating.decay,.08);
  for(const x of p.assets.business)x.heldYears=10;
  assert(E.appraiseAsset(g,'business',brand).decay>E.appraiseAsset(g,'business',self).decay);
  assert(E.appraiseAsset(g,'business',self).decay>E.appraiseAsset(g,'business',equipment).decay);
});
test('每类企业到长期残值下限后不再机械归零，实际报价仍可低于残值',()=>{
  const g=game(),p=g.players[0];
  for(const id of ['self','brand','equity','equipment','technology','standard']){
    const x={nm:id,opProfile:id,cost:100000,cf:100,heldYears:200};
    assert.equal(E.appraiseAsset(g,'business',x).decay,c.OPERATIONS.profiles[id].floor);
  }
  const x={nm:'设备',opProfile:'equipment',cost:100000,cf:100,heldYears:200};p.assets.business=[x];
  A.marketImpact(g,{kind:'business',rate:.01,nm:'折价收购'});
  assert.equal(E.appraiseAsset(g,'business',x).value,1000);
  assert(A.marketSell(g,A.marketOptions(g,{kind:'business',rate:.01})[0]).ok);
});
test('折旧只由真实年度推进，回合和读取不重复计提',()=>{
  const g=game(),p=g.players[0];assert(A.buyDeal(g,c.DECK_BIG.find(x=>x.id==='bg8')).ok);
  const x=p.assets.business[0],before=E.appraiseAsset(g,'business',x).decay;
  g.round+=20;E.finance(p);E.energyUpkeep(p);assert.equal(E.appraiseAsset(g,'business',x).decay,before);
  p.pos=1;E.movePlayer(g,p,1);assert.equal(x.heldYears,1);assert.equal(E.appraiseAsset(g,'business',x).decay,.92);
});
test('三种伙伴有实际出资、净收入和管理成本取舍',()=>{
  const g=game(),a=A.orgPartnerPlan(g,card,'balanced'),b=A.orgPartnerPlan(g,card,'capital'),d=A.orgPartnerPlan(g,card,'operator');
  assert(b.mine<a.mine && b.cf<a.cf);assert(d.cf<a.cf && d.upkeep<a.upkeep);
  assert.equal(d.fee,Math.round(d.grossCf*.2));assert.equal(a.fee,0);
  assert(b.energy>a.energy && d.energy<a.energy);
});
test('机构购入实扣、财务、年度结余与预览一致，管理费只收一次',()=>{
  for(const id of ['balanced','capital','operator']){
    const g=game(),p=g.players[0],plan=A.orgPartnerPlan(g,card,id),cash=p.cash,energy=p.energy;
    assert(A.buyDealWithOrg(g,card,id).ok);const x=p.assets.realEstate[0];
    assert.equal(p.cash,cash-plan.mine);assert.equal(p.energy,energy-plan.energy);
    assert.equal(E.finance(p).inc.realEstate,plan.cf);assert.equal(E.energyUpkeep(p),plan.upkeep);
    assert.equal(E.projectDebt(x),x.cost-x.dp);assert.equal(E.managementFee(x),plan.fee);
    const expected=E.annual(E.settleCashflow(p)),before=p.cash;p.pos=1;E.movePlayer(g,p,1);
    assert.equal(p.cash-before,expected);assert.equal(E.finance(p).inc.realEstate,plan.cf);
  }
});
test('租金变化后收费随正收益变化；亏损不收费，不影响项目融资或房产估值',()=>{
  const g=game(),p=g.players[0];A.buyDealWithOrg(g,card,'operator');const x=p.assets.realEstate[0];
  A.marketImpact(g,{kind:'rentDelta',pct:-.2});assert.equal(E.managementFee(x),Math.round(x.cf*.2));
  const value=E.propertyValue(g,x),debt=E.projectDebt(x);x.cf=-300;
  assert.equal(E.assetCashflow(x),-300);assert.equal(E.managementFee(x),0);
  assert.equal(E.propertyValue(g,x),value);assert.equal(E.projectDebt(x),debt);
});
test('合同与经营快照恢复幂等，配置变化不会改写已有合同',()=>{
  let g=game(),p=g.players[0];A.buyDealWithOrg(g,card,'operator');const x=p.assets.realEstate[0];
  const before=JSON.stringify(x.orgContract),cash=p.cash;
  const config=c.OPERATIONS.partners.find(x=>x.id==='operator'),fee=config.fee;config.fee=.9;
  try{g=E.migrateTime(JSON.parse(JSON.stringify(g)));E.migrateTime(g);p=g.players[0];
    assert.equal(JSON.stringify(p.assets.realEstate[0].orgContract),before);assert.equal(p.cash,cash);
    assert.equal(E.managementFee(p.assets.realEstate[0]),Math.round(x.cf*.2));
  }finally{config.fee=fee;}
});
test('旧档不补收管理费，不改现金、份额、原现金流，识别已持有经营类型',()=>{
  const g=game(),p=g.players[0];p.assets.realEstate=[{nm:card.nm+'（与机构共有）',partner:'机构',share:.5,cost:card.cost/2,dp:card.dp/2,cf:800,rent:2000}];
  p.assets.business=[{nm:'新能源充电桩',cost:96800,cf:887,heldYears:12}];const cash=p.cash;
  E.migrateTime(g);E.migrateTime(g);
  assert.equal(p.cash,cash);assert.equal(E.finance(p).inc.realEstate,800);assert.equal(p.assets.realEstate[0].share,.5);
  assert.equal(p.assets.business[0].operating.id,'equipment');assert.equal(p.assets.business[0].heldYears,12);
});
test('机构份额出售只收本人权益，挂牌买回保留经营属性，原服务合同随退出结束',()=>{
  const g=game(),p=g.players[0];A.buyDealWithOrg(g,card,'operator');const x=p.assets.realEstate[0],price=1500000;
  const cash=p.cash,plan=E.propertySettlement(g,x,price);
  assert(A.marketSell(g,A.marketOptions(g,{kind:'realestate',prop:card.nm,price})[0]).ok);
  assert.equal(p.cash-cash,plan.proceeds);assert.equal(p.assets.realEstate.length,0);
  g.turnNo++;E.setPending(g,{type:'opportunity202'});const listing=E.propertyListings(g)[0];
  assert(A.buyPropertyListing(g,listing.listingId,listing).ok);const y=p.assets.realEstate[0];
  assert.equal(y.propertyId,x.propertyId);assert.equal(y.operating.id,x.operating.id);
  assert.equal(E.managementFee(y),0);assert.equal(E.assetCashflow(y),y.cf);
});
test('自由圈企业与特许经营也保留经营差异，分红数值不被折旧误扣',()=>{
  const g=game(),p=g.players[0];p.inFT=true;p.assets.business.push({nm:'分红测试企业',cost:100000,cf:1234});
  assert(A.buyFTBusiness(g,'b3').ok);p.energy=100;assert(A.openFranchise(g,'b3').ok);
  assert.equal(p.assets.ftBusiness[0].operating.id,'equipment');assert.equal(p.assets.ftBusiness[1].operating.id,'equipment');
  const income=E.ftMonthly(p);p.assets.ftBusiness.forEach(x=>x.heldYears=100);
  assert.equal(E.ftMonthly(p),income);assert(E.energyUpkeep(p)>0);
});
test('无效机构、非单人、非联合卡、现金不足和精力不足全部无副作用',()=>{
  for(const mode of ['id','multiplayer','card','cash','energy']){
    const g=game(mode==='multiplayer'?2:1),p=g.players[0];
    if(mode==='cash')p.cash=0;if(mode==='energy')p.energy=0;
    const before=JSON.stringify(p),r=A.buyDealWithOrg(g,mode==='card'?{...card,joint:false}:card,mode==='id'?'missing':'operator');
    assert(!r.ok);assert.equal(JSON.stringify(p),before);
  }
});
console.log(`\n${n} 组经营差异回归通过`);
