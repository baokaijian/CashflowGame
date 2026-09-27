/* 第四批：可达报价、权益收益、标定幂等、真实规则模拟。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const audit=require('../tools/audit-balance'),c=audit.load(),E=c.Engine,A=c.Act;
let count=0;function test(n,f){f();console.log('✅ '+n);count++;}
function game(rule){const g=E.newGame({rule,mode:'solo',seed:7});g.players[0].cash=1e8;g.players[0].energy=100;return g;}
test('两版所有房产报价均对应本版可购买房产',()=>{
 const rows=audit.offers(c);assert.equal(rows.length,12);assert(rows.every(x=>x.buyCard));
});
test('新增报价与来源首付、单次权益收益和备注一致',()=>{
 const offers=c.DECK_MARKET_202.filter(x=>x.sourceCard);assert.equal(offers.length,4);
 for(const m of offers){const d=[...c.DECK_CAPGAIN,...c.DECK_CASHFLOW].find(x=>x.id===m.sourceCard);
  assert.equal(m.prop,d.nm);assert.equal(m.price,Math.round(d.cost+d.dp*m.equityGain));assert(m.note.includes(E.money(m.price)));}
});
test('每张房产报价用真实购买与出售结算，融资仅扣一次',()=>{
 for(const o of audit.offers(c)){
  const g=game(o.rule),p=g.players[0],d=[...c.DECK_SMALL,...c.DECK_BIG,...c.DECK_CAPGAIN,...c.DECK_CASHFLOW].find(x=>x.id===o.buyCard);
  assert(A.buyDeal(g,d).ok);const cash=p.cash;
  const m=(o.rule==='101'?c.DECK_MARKET_101:c.DECK_MARKET_202).find(x=>x.id===o.id);
  const opt=A.marketImpact(g,m).options.find(x=>x.kind==='realestate');assert(opt);
  assert(A.marketSell(g,opt).ok);assert.equal(p.cash-cash,m.price-(d.cost-d.dp));assert(!A.marketSell(g,opt).ok);
 }
});
test('新报价共有商铺与物流园按本人份额结算',()=>{
 for(const id of ['m24','m26']){const g=game('202'),p=g.players[0],m=c.DECK_MARKET_202.find(x=>x.id===id),d=c.DECK_CASHFLOW.find(x=>x.id===m.sourceCard);
  assert(A.buyDealWithOrg(g,d).ok);const re=p.assets.realEstate.at(-1),plan=E.propertySettlement(g,re,m.price),cash=p.cash;
  assert(A.marketSell(g,A.marketImpact(g,m).options[0]).ok);assert.equal(p.cash-cash,plan.proceeds);assert.equal(plan.price,Math.round(m.price*re.share));}
});
test('旧档锁定报价保留，恢复不重写历史成交与现金',()=>{
 const g=game('202'),p=g.players[0],old={id:'m22',kind:'realestate',prop:'小区车位',price:236500};
 g.decks.market.draw=[old];g.pending={type:'market',p:0,card:old};const cash=p.cash;
 E.migrateTime(g);assert.equal(g.decks.market.draw[0].price,236500);assert.equal(g.pending.card.prop,'小区车位');assert.equal(p.cash,cash);
});
test('回报重算工具两次执行保持新报价及备注，调整首付后报价同步',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cashflow-balance-'));
 try{for(const dir of ['js','tools'])fs.cpSync(path.join(__dirname,'..',dir),path.join(tmp,dir),{recursive:true});
  const run=()=>cp.execFileSync(process.execPath,['tools/rebalance-returns.js'],{cwd:tmp,stdio:'pipe'});
  run();const first=fs.readFileSync(path.join(tmp,'js/data-cards-202.js'),'utf8');run();assert.equal(fs.readFileSync(path.join(tmp,'js/data-cards-202.js'),'utf8'),first);
  const cfg=path.join(tmp,'js/data-careers.js');let text=fs.readFileSync(cfg,'utf8');assert(text.includes('down:0.45'));fs.writeFileSync(cfg,text.replace('down:0.45','down:0.50'));run();
  const changed=fs.readFileSync(path.join(tmp,'js/data-cards-202.js'),'utf8');assert.notEqual(changed,first);assert(changed.includes('price:83850'));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('审计使用自然职业开局，固定操作可复现且确实经过行情成交',()=>{
 const sample=audit.samples(c)[0];
 const a=audit.run(c,sample,'101','realize'),b=audit.run(c,sample,'101','realize');assert.deepEqual(a,b);assert(Object.keys(a.seen).length>0);
 assert.equal(a.career,E.newGame({rule:'101',mode:'solo',seed:sample.seed}).players[0].job.name);
});
console.log(count+' 组平衡审计回归通过');
