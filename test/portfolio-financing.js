/* D1：初始房产融资只计一次，旧档按可证明的余额与产权迁移。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({console});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',f+'.js'),'utf8'),c);
const E=c.Engine,A=c.Act,clone=x=>JSON.parse(JSON.stringify(x));
const name='老破小出租房';
function game(){return E.newGame({rule:'202',mode:'solo',count:1,seed:20});}
function legacy(){
  const g=game(),p=g.players[0],r=p.assets.realEstate[0];
  p.portfolio={nm:name,realEstate:[{nm:name,tier:'res',cost:170000,dp:50000,cf:708,rent:708}],liabs:{other:120000},extraPay:492};
  p.liabs.other=120000;p.loans.other={base:120000,due:492,periods:0};r.cf=708;r.rent=708;
  return {g,p,r};
}
function sale(g,r){const card={kind:'realestate',prop:name,price:200000};A.marketImpact(g,card);const opt=A.marketOptions(g,card).find(o=>o.assetId===r.holdingId);assert(opt);assert(A.marketSell(g,opt).ok);}
let n=0;function test(label,fn){fn();console.log('✅ '+label);n++;}
test('新局仅有项目融资，净租金只扣一次利息，起始现金保持旧规则净额',()=>{
  const g=game(),p=g.players[0],r=p.assets.realEstate[0];
  assert.equal(p.portfolio.nm,name);assert.equal(p.portfolio.financingVersion,1);
  assert.equal(p.liabs.other,0);assert.equal(E.projectDebt(r),120000);
  assert.equal(r.rent,708);assert.equal(r.cf,216);assert.equal(r.rent-r.cf,Math.round(r.projectDebt*r.financingRate));
  const f=E.finance(p);assert.equal(f.inc.realEstate,216);assert.equal(f.exp.otherLoan,0);
  const old=legacy();assert.equal(f.cashflow,E.finance(old.p).cashflow);
  assert.equal(p.cash,old.p.cash);assert.equal(E.netWorth(p),E.netWorth(old.p)+120000);
  assert.equal(E.valuedNetWorth(g,p),E.valuedNetWorth(old.g,old.p)+120000);
  E.amortize(g,p);assert.equal(r.projectDebt,120000);assert.equal(p.liabs.other,0);
});
test('新局按当前余额售房、挂牌回购，其他负债不会复活',()=>{
  const g=game(),p=g.players[0],r=p.assets.realEstate[0],cash=p.cash;
  sale(g,r);assert.equal(p.cash-cash,80000);assert.equal(p.liabs.other,0);assert.equal(E.finance(p).inc.realEstate,0);
  g.turnNo++;E.setPending(g,{type:'opportunity202'});const quote=E.propertyListings(g)[0];p.cash=200000;
  assert(A.buyPropertyListing(g,quote.listingId,quote).ok);
  assert.equal(p.assets.realEstate[0].propertyId,r.propertyId);assert.equal(p.liabs.other,0);
  assert.equal(p.assets.realEstate[0].cf,708-Math.round(quote.debt*quote.rate));
});
test('真实发薪只入账一份净结余；破产处置也只偿还一份项目本金',()=>{
  const g=game(),p=g.players[0];p.pos=1;
  const cash=p.cash,expected=E.annual(E.settleCashflow(p));
  const landed=E.movePlayer(g,p,1);assert.equal(landed.settled.count,1);
  assert.equal(p.cash-cash,expected);assert.equal(p.age,21);assert.equal(p.liabs.other,0);
  const r=p.assets.realEstate[0];p.cash=1000000;
  const debt=E.LOAN_KEYS.reduce((sum,k)=>sum+(p.liabs[k]||0),0);
  const expectedCash=Math.max(0,p.cash+Math.round(E.propertyValue(g,r)*E.BANK_RATE)-r.projectDebt-debt);
  assert(A.declareBankruptcy(g,p).ok);assert.equal(p.cash,expectedCash);assert.equal(p.assets.realEstate.length,0);
});
test('未还款旧档迁移只消除重复计债，不改变现金和首年结余',()=>{
  const {g,p,r}=legacy(),cash=p.cash,cf=E.finance(p).cashflow,net=E.netWorth(p),history=clone(g.assetMarket.properties[r.propertyId].history);
  g.pending={type:'deficit',amount:1234};const pending=clone(g.pending);
  E.migrateTime(g);assert.equal(p.liabs.other,0);assert.equal(r.projectDebt,120000);assert.equal(r.cf,216);
  assert.equal(E.finance(p).cashflow,cf);assert.equal(p.cash,cash);assert.equal(E.netWorth(p),net+120000);
  assert.deepEqual(clone(g.pending),pending);assert.deepEqual(clone(g.assetMarket.properties[r.propertyId].history),history);
  const saved=JSON.stringify(g);E.migrateTime(g);assert.equal(JSON.stringify(g),saved);
  const restored=clone(g);E.migrateTime(restored);assert.equal(JSON.stringify(restored),JSON.stringify(clone(g)));
});
test('自然摊还后的余额迁入项目，不再从总价减首付重建 12 万',()=>{
  const {g,p,r}=legacy();E.amortize(g,p);const debt=p.liabs.other,cash=p.cash;assert.equal(debt,119855);
  E.migrateTime(g);assert.equal(r.projectDebt,debt);assert.equal(p.liabs.other,0);assert.equal(p.cash,cash);
  assert.equal(r.cf,708-Math.round(debt*r.financingRate));
  const expected=200000-debt;sale(g,r);assert.equal(p.cash-cash,expected);assert.equal(p.liabs.other,0);
});
test('提前还款与降低月供后的真实余额保留',()=>{
  for(const mode of ['shorten','reduce']){
    const {g,p,r}=legacy();p.cash=500000;assert(E.prepay(g,p,'other',30000,mode).ok);
    const debt=p.liabs.other,cash=p.cash;E.migrateTime(g);
    assert.equal(r.projectDebt,debt);assert.equal(p.cash,cash);assert.equal(p.liabs.other,0);
  }
});
test('旧档已经结清时融资为零，租金不再扣息；后续恢复不重建债务',()=>{
  const {g,p,r}=legacy();p.cash=500000;assert(E.prepay(g,p,'other',120000,'shorten').ok);const cash=p.cash;
  E.migrateTime(g);assert.equal(r.projectDebt,0);assert.equal(r.cf,708);assert.equal(p.cash,cash);
  E.amortize(g,p);E.migrateTime(g);assert.equal(E.projectDebt(r),0);
});
test('有售房还本凭据时只移除重复其他债务，不返还历史现金',()=>{
  const {g,p,r}=legacy();E.amortize(g,p);sale(g,r);const cash=p.cash;const debt=p.liabs.other;
  const net=E.netWorth(p);E.migrateTime(g);
  assert.equal(p.portfolioFinancingMigration.status,'released');assert.equal(p.cash,cash);assert.equal(p.liabs.other,0);
  assert.equal(E.netWorth(p),net+debt);assert.equal(p.assets.realEstate.length,0);
});
test('卖出再买回的旧档不清除新买入的项目融资',()=>{
  const {g,p,r}=legacy();sale(g,r);g.turnNo++;E.setPending(g,{type:'opportunity202'});p.cash=500000;
  const quote=E.propertyListings(g)[0];assert(A.buyPropertyListing(g,quote.listingId,quote).ok);
  const current=clone(p.assets.realEstate[0]),cash=p.cash;E.migrateTime(g);
  assert.equal(p.liabs.other,0);assert.deepEqual(clone(p.assets.realEstate[0]),current);assert.equal(p.cash,cash);
});
test('旧档协议转让后，融资剩余余额绑定当前持有人，而非原借款人',()=>{
  const {g,p,r}=legacy();E.amortize(g,p);const debt=p.liabs.other;
  const q=E.newGame({rule:'101',mode:'age',count:1,seed:5}).players[0];q.id=1;q.cash=500000;g.players.push(q);
  assert(A.transferProperty(g,p,q,r.holdingId,50000).ok);const cash=[p.cash,q.cash];E.migrateTime(g);
  assert.equal(p.liabs.other,0);assert.equal(q.assets.realEstate[0].projectDebt,debt);
  assert.deepEqual([p.cash,q.cash],cash);assert.equal(q.assets.realEstate[0].cf,708-Math.round(debt*r.financingRate));
});
test('租金行情后的毛租金与基准都只扣一次利息',()=>{
  const {g,p,r}=legacy();r.baseCf=708;r.cf=566;r.rent=1058; // 旧租金路径把融资利息加到了 rent
  E.migrateTime(g);assert.equal(r.rent,566);assert.equal(r.cf,74);assert.equal(r.baseCf,216);
  assert.equal(g.assetMarket.properties[r.propertyId].rent,566);
  assert.equal(E.finance(p).exp.otherLoan,0);
});
test('无资产实体历史的早期存档仍可按唯一开局持仓迁移',()=>{
  const {g,p,r}=legacy();delete g.assetMarket;delete r.propertyId;delete r.holdingId;delete r.projectDebt;
  E.migrateTime(g);assert.equal(p.liabs.other,0);assert.equal(r.projectDebt,120000);assert.equal(r.cf,216);
  assert(r.propertyId);assert(r.holdingId);
});
test('混合负债、同名多套、已售无凭据保留原账并明确提示待核对',()=>{
  for(const kind of ['mixed','missing','duplicate','incomplete','missing-plan']){
    const {g,p,r}=legacy();
    if(kind==='mixed'){p.liabs.other+=5000;p.loans.other.base+=5000;}
    if(kind==='missing'){delete g.assetMarket;p.assets.realEstate=[];}
    if(kind==='duplicate'){const copy=clone(r);delete copy.propertyId;delete copy.holdingId;p.assets.realEstate.push(copy);E.registerProperty(g,p,copy);}
    if(kind==='incomplete')delete p.portfolio.liabs;
    if(kind==='missing-plan'){E.amortize(g,p);delete p.loans;}
    const debt=p.liabs.other,cash=p.cash;E.migrateTime(g);
    assert.equal(p.portfolioFinancingMigration.status,'review',kind);assert.equal(p.liabs.other,debt);assert.equal(p.cash,cash);
    if(p.assets.realEstate.length)assert.equal(p.assets.realEstate[0].cf,708);
    const saved=JSON.stringify(g);E.migrateTime(g);assert.equal(JSON.stringify(g),saved);
  }
});
test('普通组合与修复后新局恢复不触发旧债迁移',()=>{
  for(const seed of [1,2,3,4,20,42]){const g=E.newGame({rule:'202',mode:'solo',count:1,seed}),p=g.players[0];const cash=p.cash;
    E.migrateTime(g);assert(!p.portfolioFinancingMigration);assert.equal(p.cash,cash);}
});
test('价格重算工具重复执行不会重新引入 other 或 extraPay',()=>{
  const os=require('node:os'),cp=require('node:child_process');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cashflow-portfolio-'));
  try{
    fs.mkdirSync(path.join(tmp,'js'));fs.mkdirSync(path.join(tmp,'tools'));
    const files=['data-careers.js','data-board.js','data-cards-101.js','data-cards-202.js'];
    for(const f of files)fs.copyFileSync(path.join(__dirname,'../js',f),path.join(tmp,'js',f));
    const tool=path.join(tmp,'tools/rebalance-returns.js');
    fs.copyFileSync(path.join(__dirname,'../tools/rebalance-returns.js'),tool);
    cp.execFileSync(process.execPath,[tool]);const first=files.map(f=>fs.readFileSync(path.join(tmp,'js',f),'utf8'));
    cp.execFileSync(process.execPath,[tool]);assert.deepEqual(files.map(f=>fs.readFileSync(path.join(tmp,'js',f),'utf8')),first);
    const s=vm.createContext({});s.window=s;vm.runInContext(first[1],s);
    const pf=s.PORTFOLIOS.find(x=>x.nm===name),r=pf.realEstate[0];
    assert.equal(pf.liabs,undefined);assert.equal(pf.extraPay,undefined);
    assert.equal(r.cf,r.rent-Math.round(r.projectDebt*r.financingRate));
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
console.log(`\n${n} 组初始组合融资回归通过`);
