/* 历史修正必须可核对、幂等、可回退；不猜测缺失收支。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const memory=new Map();let fail=false;
const c=vm.createContext({console,setTimeout,clearTimeout,localStorage:{getItem:k=>memory.get(k)||null,
 setItem(k,v){if(fail)throw new Error('禁止写入');memory.set(k,v);},removeItem:k=>memory.delete(k)}});c.window=c;
for(const f of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions','save-state'])vm.runInContext(fs.readFileSync(`${__dirname}/../js/${f}.js`,'utf8'),c);
const E=c.Engine,A=c.Act,S=c.SaveState;let count=0;
const game=(rule='101')=>E.newGame({rule,mode:'solo',seed:42});
const encode=g=>S.encode(g,{rolled:false},false),plain=x=>JSON.parse(JSON.stringify(x));
const plan=(g,q)=>S.planRepair(encode(g),{player:0,evidence:'原始完整存档已逐笔核对',...q});
function test(name,fn){fn();console.log('✅ '+name);count++;}
function legacy(){
 const g=game('202'),p=g.players[0];
 p.portfolio={nm:'老破小出租房',realEstate:[{nm:'老破小出租房',cost:170000,dp:50000,cf:708}],liabs:{other:120000},extraPay:492};
 p.liabs.other=135000;p.loans.other={base:135000,due:700,periods:1};
 p.portfolioFinancingMigration={version:1,status:'review',reason:'其他负债混有借款'};
 p.assets.realEstate=[{nm:'老破小出租房',cost:170000,dp:50000,cf:708,rent:708,projectDebt:120000,buyRound:1,heldYears:0}];
 E.migrateAssets(g);return g;
}
test('同一旧备份重复导入、改变键顺序，后续骰子与牌序相同',()=>{
 const raw=plain(JSON.parse(encode(game('202'))));delete raw.g.rngState;
 const reverse=x=>Array.isArray(x)?x.map(reverse):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reverse(v)])):x;
 const a=S.prepare(JSON.stringify(raw)).g,b=S.prepare(JSON.stringify(reverse(raw))).g;
 assert.equal(a.rngState.state,b.rngState.state);assert(a.rngMigrated);
 for(let i=0;i<60;i++){assert.deepEqual(plain(E.rollDice(a,2)),plain(E.rollDice(b,2)));assert.equal(E.drawMarket(a).id,E.drawMarket(b).id);}
 assert.equal(a.log.filter(x=>x.text.includes('旧存档没有随机历史')).length,1);
});
test('家庭核对只改变未来支出，保留未知孩子、锁定缺口及已结算年',()=>{
 const g=game(),p=g.players[0];p.age=61;delete p.family;p.children=2;E.migrateTime(g);
 E.setPending(g,{type:'deficit',amount:1234});const cash=p.cash,last=p.family.lastYearAge;
 const q={kind:'family',childId:p.family.children[0].id,childAge:22,contributionYears:30};
 const preview=plan(g,q),n=S.prepare(preview.text).g,person=n.players[0];
 assert.equal(p.family.children[0].ageUnknown,true,'预览不改当前局');
 assert.equal(E.familySummary(person).children[0].expense,0);assert(person.family.children[1].ageUnknown);
 assert.equal(person.family.contributionYears,30);assert.equal(person.family.estimatedContributionYears,0);
 assert.equal(person.family.lastYearAge,last);assert.equal(person.cash,cash);assert.equal(n.pending.amount,1234);
 assert.equal(person.salary,Math.round(person.baseSalary*.45*30/41));
 assert.throws(()=>plan(n,q),/没有需要修改/);
 E.movePlayer(n,person,8);assert.equal(person.family.contributionYears,30,'退休后修正不会重复缴费');
});
test('家庭非法年龄、缴费、重复身份和坏凭据被拒绝',()=>{
 const g=game(),p=g.players[0];E.addChild(g,p);
 for(const q of [{kind:'family',childId:p.family.children[0].id,childAge:100},{kind:'family',contributionYears:2},{kind:'cash',cash:-1},{kind:'cash',cash:20,evidence:'猜'},{kind:'cost',totalCost:NaN}])assert.throws(()=>plan(g,q));
 const d=JSON.parse(encode(g));d.g.players[0].family.children[0].birthAge=999;assert.throws(()=>S.prepare(JSON.stringify(d)),/子女/);
 d.g.players[0].family.children[0].birthAge=20;d.g.players[0].family.children.push({...d.g.players[0].family.children[0]});assert.throws(()=>S.prepare(JSON.stringify(d)),/子女/);
});
test('混合融资只拆确认部分，关联指定房产，恢复不再减债',()=>{
 const g=legacy(),p=g.players[0],asset=p.assets.realEstate[0],cash=p.cash;
 const result=plan(g,{kind:'financing',disposition:'held',duplicate:110000,remainingDue:200,assetId:asset.holdingId,rent:708});
 const n=S.prepare(result.text).g,x=n.players[0],r=x.assets.realEstate[0];
 assert.equal(x.liabs.other,25000);assert.equal(x.loans.other.due,200);assert.equal(r.projectDebt,110000);assert.equal(r.cf,257);
 assert.equal(x.cash,cash);assert.equal(x.portfolioFinancingMigration.status,'confirmed');
 const again=S.prepare(encode(n)).g;assert.equal(again.players[0].liabs.other,25000);assert.equal(again.players[0].assets.realEstate[0].cf,257);
 assert.throws(()=>plan(n,{kind:'financing',disposition:'sold',duplicate:10000,remainingDue:0}));
 assert.equal(p.liabs.other,135000,'预览失败与成功均不直接改原账');
});
test('已售重复债务清理不补售房款；独立债务可以有据确认保留',()=>{
 const g=legacy(),cash=g.players[0].cash;
 let n=S.prepare(plan(g,{kind:'financing',disposition:'sold',duplicate:120000,remainingDue:100}).text).g;
 assert.equal(n.players[0].liabs.other,15000);assert.equal(n.players[0].cash,cash);
 n=S.prepare(plan(g,{kind:'financing',disposition:'separate',duplicate:0}).text).g;
 assert.equal(n.players[0].liabs.other,135000);assert.equal(n.players[0].portfolioFinancingMigration.status,'confirmed');
 for(const q of [{duplicate:200000,remainingDue:0},{duplicate:120000,remainingDue:0},{duplicate:-1,remainingDue:100}])assert.throws(()=>plan(g,{kind:'financing',disposition:'sold',...q}));
});
test('融资不唯一或共有时拒绝，不能把别人的整笔借款转给少数份额',()=>{
 const g=legacy(),item=g.players[0].assets.realEstate[0];item.share=.5;
 assert.throws(()=>plan(g,{kind:'financing',disposition:'held',duplicate:120000,remainingDue:100,assetId:item.holdingId,rent:708}),/整套毛租金/);
 assert.equal(g.players[0].liabs.other,135000);assert.equal(item.projectDebt,120000);
});
test('共有融资可按份额逐项拆分，保留未完成状态并同步实体租金',()=>{
 const g=legacy(),p=g.players[0],item=p.assets.realEstate[0];item.share=.5;item.cost=85000;item.dp=25000;item.projectDebt=60000;
 const q={kind:'financing',disposition:'held',duplicate:55000,remainingDue:400,assetId:item.holdingId,rent:354,wholeRent:708,finishReview:false};
 const n=S.prepare(plan(g,q).text).g;assert.equal(n.players[0].liabs.other,80000);assert.equal(n.players[0].portfolioFinancingMigration.status,'review');
 assert.equal(n.players[0].assets.realEstate[0].cf,128);assert.equal(n.assetMarket.properties[item.propertyId].rent,708);
 const done=S.prepare(plan(n,{kind:'financing',disposition:'separate',duplicate:0}).text).g;
 assert.equal(done.players[0].liabs.other,80000);assert.equal(done.players[0].portfolioFinancingMigration.status,'confirmed');
});
test('唯一协议成交记录自动恢复取得成本，现金和经营年数不变',()=>{
 const g=E.newGame({rule:'101',mode:'age',count:2,seed:12}),[a,b]=g.players;
 a.assets.stocks=[{symbol:'TEST',shares:3,cost:100,heldYears:5}];b.cash=100000;
 const id=E.holdingId(g,a.assets.stocks[0]);assert(A.transferAsset(g,a,b,'stock',id,1001).ok);
 const item=b.assets.stocks[0];item.cost=100;const cash=b.cash;
 const restored=S.prepare(encode(g)).g;assert.equal(restored.players[1].assets.stocks[0].cost,1001/3);assert.equal(restored.players[1].cash,cash);
 assert.equal(restored.players[1].assets.stocks[0].heldYears,5);assert.equal(restored.recovery.entries.length,1);
 assert.equal(S.prepare(encode(restored)).g.recovery.entries.length,1);
});
test('历史本金按本人凭据修正，股票成本不取整，理财兑付按修正本金',()=>{
 const g=game(),p=g.players[0];p.assets.stocks=[{symbol:'X',shares:3,cost:9,heldYears:8}];
 const id=E.holdingId(g,p.assets.stocks[0]),cash=p.cash;
 let n=S.prepare(plan(g,{kind:'cost',assetKind:'stocks',assetId:id,totalCost:1000}).text).g;
 assert.equal(n.players[0].assets.stocks[0].cost,1000/3);assert.equal(n.players[0].assets.stocks[0].heldYears,8);assert.equal(n.players[0].cash,cash);
 assert.throws(()=>plan(n,{kind:'cost',assetKind:'stocks',assetId:'missing',totalCost:1}));
 p.assets.funds=[{nm:'历史理财',cost:10800,interest:20}];const fund=E.holdingId(g,p.assets.funds[0]);
 n=S.prepare(plan(g,{kind:'cost',assetKind:'funds',assetId:fund,totalCost:43000}).text).g;
 const card={id:'test-redemption',kind:'savings',rate:1.05};
 E.setPending(n,{type:'market',card});const opts=A.marketOptions(n,card);
 assert(opts.length===1);assert(A.marketSell(n,opts[0]).ok);assert.equal(n.players[0].cash-cash,45150);
 assert(!A.marketSell(n,opts[0]).ok);
});
test('现金修正使用目标余额，重复操作不会再补一次，锁定缺口保持',()=>{
 const g=game();E.setPending(g,{type:'deficit',amount:456});
 const n=S.prepare(plan(g,{kind:'cash',cash:50000}).text).g;
 assert.equal(n.players[0].cash,50000);assert.equal(n.pending.amount,456);assert.throws(()=>plan(n,{kind:'cash',cash:50000}),/没有需要修改/);
 const row=n.recovery.entries[0].changes[0];assert.equal(row.after,50000);assert.equal(row.before,g.players[0].cash);
});
test('已售房产凭据补录不发钱、下次行动可买回；重复凭据拒绝',()=>{
 const g=game(),q={kind:'listing',reference:'sale-2026-001',name:'历史已售商铺',value:1000000,rent:5000,share:1,downRate:.45,heldYears:3,capital:false};
 const cash=g.players[0].cash,n=S.prepare(plan(g,q).text).g;
 assert.equal(n.players[0].cash,cash);assert.equal(n.players[0].assets.realEstate.length,g.players[0].assets.realEstate.length);assert.equal(E.propertyListings(n).length,0);
 n.turnNo++;const listings=E.propertyListings(n);assert.equal(listings.length,1);assert.equal(listings[0].debt,550000);assert.equal(listings[0].heldYears,3);
 assert.throws(()=>plan(n,q),/已补录/);
 n.players[0].cash=2000000;n.players[0].energy=100;E.setPending(n,{type:'opportunity'});
 assert(A.buyPropertyListing(n,listings[0].listingId,listings[0]).ok);
 assert.equal(n.players[0].assets.realEstate.at(-1).propertyId,listings[0].propertyId);
 assert.throws(()=>plan(g,{...q,capital:true}),/毛租金/);
});
test('补录优先保留原实体，不能与当前持仓或挂牌重复',()=>{
 const g=game(),p=g.players[0];p.assets.realEstate=[{nm:'旧商铺',cost:100000,dp:45000,cf:275,rent:500}];E.migrateAssets(g);
 const item=p.assets.realEstate[0],id=item.propertyId;
 const q={kind:'listing',propertyId:id,reference:'旧售房凭据-02',name:'旧商铺',value:E.propertyValue(g,item),rent:500,downRate:.45,share:1,heldYears:1,capital:false};
 assert.throws(()=>plan(g,q),/已有持仓/);
 p.assets.realEstate=[];
 const n=S.prepare(plan(g,q).text).g;assert.equal(n.assetMarket.listings.at(-1).propertyId,id);assert.equal(Object.keys(n.assetMarket.properties).length,Object.keys(g.assetMarket.properties).length);
 assert.throws(()=>plan(g,{...q,propertyId:null}),/同名实体/);
});
test('真实历史单独归档，不覆盖账本或伪造走势；同档再补无新增',()=>{
 const old=game(),g=game();E.log(old,'旧日志凭据','info');old.players[0].track[0].cash=123;
 const q={kind:'history',backup:encode(old),sameGame:true};const before=plain(g.players[0].track),cash=g.players[0].cash,rng=g.rngState.state;
 const n=S.prepare(plan(g,q).text).g;
 assert.equal(n.players[0].cash,cash);assert.deepEqual(plain(n.players[0].track),before);assert.equal(n.rngState.state,rng);
 assert(n.recovery.archive.logs.some(x=>x.text==='旧日志凭据'));assert(n.recovery.archive.tracks.some(x=>x.cash===123));
 assert.throws(()=>plan(n,q),/没有可补入/);assert.throws(()=>plan(g,{...q,sameGame:false}),/同一局/);
 old.players[0].name='另一局';assert.throws(()=>plan(g,{...q,backup:encode(old)}),/不匹配/);
 const local=JSON.parse(S.encode(n,{rolled:false},true));assert.equal(local.g.recovery.archive.logs.length,n.recovery.archive.logs.length);
});
test('预览保持原局；过期方案和备份写入失败不应用也不覆盖好档',()=>{
 c.UI={$:()=>null,$$:()=>[],esc:String,money:E.money,toast(){}};
 vm.runInContext(fs.readFileSync(`${__dirname}/../js/ui-game.js`,'utf8'),c);
 const U=c.UiGame;U.Game.g=game();assert(U.saveState().ok);let preview=plan(U.Game.g,{kind:'cash',cash:40000});
 U.Game.g.players[0].cash++;let saved=memory.get(S.KEY);assert(!U.applyRepair(preview).ok);assert.equal(memory.get(S.KEY),saved);
 preview=plan(U.Game.g,{kind:'cash',cash:40000});const before=U.Game.g.players[0].cash;
 fail=true;assert(!U.applyRepair(preview).ok);fail=false;
 assert.equal(U.Game.g.players[0].cash,before);assert.equal(memory.get(S.KEY),saved);assert(!memory.has(S.REPAIR_BACKUP_KEY));
});
test('无效修正记录和未完成骰子拒绝，完整核对档重复保存可恢复',()=>{
 const g=game(),n=S.prepare(plan(g,{kind:'cash',cash:99999}).text);
 const encoded=S.encode(n.g,n,false),again=S.prepare(encoded);assert.deepEqual(plain(again.g.recovery),plain(n.g.recovery));
 n.g.recovery.entries.push({...n.g.recovery.entries[0]});assert.throws(()=>S.prepare(JSON.stringify(n)),/凭据/);
 const raw=S.encode(game(),{rolled:false,pendingDice:[3]},false);assert.throws(()=>S.planRepair(raw,{player:0,kind:'cash',cash:10,evidence:'原始现金核对凭据'}),/骰子/);
});
console.log(count+' 组历史核对回归通过');
