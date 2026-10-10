/* 穷举移动路径与完整人生：每个实际经过的结算格恰好对应一年 / 一岁。 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const ctx = vm.createContext({console}); ctx.window = ctx;
for(const name of ['data-careers','data-board','data-cards-101','data-cards-202','engine','engine-actions'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),ctx);
const E=ctx.Engine;
let walks=0;
for(const rule of ['101','202']) for(const inFT of [false,true]) {
  const board=inFT ? ctx.FAST_TRACK : ctx.RAT_RACE;
  const type=inFT ? 'cashflowday' : 'paycheck';
  for(let from=0;from<24;from++) for(let steps=0;steps<=48;steps++) {
    const g=E.newGame({rule,mode:'endless',count:2,seed:42});
    const p=g.players[0]; p.inFT=inFT; p.pos=p.ftPos=from; p.cash=10000000; p.assets.business.push({nm:'分红测试企业',cost:100000,cf:20000});
    const expected=Array.from({length:steps},(_,i)=>(from+i+1)%24);
    const hits=expected.filter(ix=>board[ix].t===type);
    const ld=E.movePlayer(g,p,steps);
    assert.deepEqual(Array.from(ld.path),expected);
    assert.equal(ld.to,(from+steps)%24);
    assert.equal(E.ageOf(g,p),20+hits.length);
    assert.equal(p.settledYears,hits.length);
    if(hits.length) {
      const st=ld.settled;
      assert.equal(st.yearsPaid,hits.length);
      assert.equal(st.count,hits.length);
      assert.equal(st.skipped,0);
      assert.equal(st.arrears,0);
      assert.equal(st.years.reduce((sum,row)=>sum+row.amount,0),ld.collected-ld.deficit);
      st.years.forEach((row,i)=>{
        assert.equal(row.since,20+i);
        assert.equal(row.through,21+i);
        assert.equal(row.months.length,12);
        assert.equal(row.amount,row.months.reduce((s,m)=>s+m.income-m.living-m.loans,0));
        assert.equal(row.amount,row.income-row.expense);
      });
      const notice=E.paydayNoticeOf(g,ld,inFT);
      if(ld.space.t===type || (ld.deficit>0 && ld.collected===0)) assert.equal(notice,null);
      else {
        assert.equal(notice.kind,'paid');
        assert.equal(notice.years,hits.length);
        assert.equal(notice.amount,ld.collected);
        assert.equal(notice.since,20);
        assert.equal(notice.through,20+hits.length);
      }
    } else {
      assert.equal(ld.settled,null);
      assert.equal(ld.collected,0);
      assert.equal(E.paydayNoticeOf(g,ld,inFT),null);
    }
    walks++;
  }
}
console.log(`✅ ${walks} 条路径：零步、经过、停留、跨零点、多圈，无遗漏 / 重复 / 跳过`);

let games=0;
for(const mode of ['solo','age']) for(const rule of ['101','202']) for(const seed of [3,42,20260922]) {
  const g=E.newGame({mode,rule,count:4,seed});
  const ledger=g.players.map(()=>[]);
  g.players.forEach((p,i)=>{
    p.cash=100000000;
    // 同局内外圈并行，故意制造不同的长岁速度。
    p.inFT=!!(i%2); p.assets.business.push({nm:'分红测试企业',cost:100000,cf:20000});
  });
  let turns=0;
  while(!g.over && turns++<2500) {
    const p=E.current(g), beforeAge=p.age;
    const ages=g.players.map(q=>q.age);
    const n=E.diceCount(g,p), dice=E.rollDice(g,n);
    const ld=E.movePlayer(g,p,dice.reduce((a,b)=>a+b,0));
    const hits=ld.path.filter(ix=>(p.inFT?ctx.FAST_TRACK:ctx.RAT_RACE)[ix].t===(p.inFT?'cashflowday':'paycheck'));
    assert.equal(p.age-beforeAge,hits.length);
    assert(p.age<=g.endAge);
    g.players.forEach((q,i)=>{if(q!==p) assert.equal(q.age,ages[i]);});
    if(ld.settled) ledger[p.id].push(...ld.settled.years);
    E.resolveSpace(g,p,ld);
    if(g.pending && g.pending.type==='deficit') {
      assert(E.payDeficit(g,p,g.pending.amount).ok);
      E.clearPending(g);
      E.resolveSpace(g,p,{...ld,deficit:0});
    }
    // 卡片行为由 lifecycle-regression 覆盖，本测试只核验时间和结算。
    E.clearPending(g);
    const afterAge=p.age;
    E.endTurn(g);
    assert.equal(p.age,afterAge);
  }
  assert(g.over,'必须按个人终龄结束，不能再依赖 50 轮');
  g.players.forEach((p,i)=>{
    assert.equal(p.age,70);
    assert(p.finished);
    assert.equal(p.settledYears,50);
    assert.equal(ledger[i].length,50);
    ledger[i].forEach((row,j)=>{
      assert.equal(row.since,20+j);
      assert.equal(row.through,21+j);
      assert.equal(row.years,1);
    });
  });
  assert.equal(g.finalSettled.length,0);
  assert(g.round>50,'内圈需要超过 50 轮才完成 50 次发薪');
  games++;
}
console.log(`✅ ${games} 局完整人生：每位玩家 20→70 岁恰好 50 笔，个人年龄独立、终局无补结`);

/* 更新已有的 65 岁对局，不改账、不复活已结束的人生。 */
const save=fs.readFileSync(path.join(__dirname,'../js/save-state.js'),'utf8');vm.runInContext(save,ctx);
for(const mode of ['solo','age']){
 const g=E.newGame({mode,rule:'101',count:2,seed:42});g.endAge=65;
 g.players.forEach((p,i)=>{p.age=i?64:65;p.settledYears=p.age-20;p.finished=!i;p.cash=10000000;delete p.cashflowPreview;});
 g.pending={type:'deficit',p:0,amount:1234};
 const data=ctx.SaveState.prepare(ctx.SaveState.encode(g,{rolled:true},false)),copy=data.g;
 assert.equal(copy.endAge,70);assert.equal(copy.players[0].age,65);assert.equal(copy.players[0].cash,10000000);assert.equal(copy.players[0].finished,false);
 assert.equal(copy.players[0].settledYears,45);assert.equal(copy.pending.amount,1234);assert(data.rolled);
 const logs=copy.log.length;E.migrateTime(copy);assert.equal(copy.log.length,logs,'再次恢复不重复延长');
}
{
 const g=E.newGame({mode:'solo',rule:'101',seed:42}),p=g.players[0];g.endAge=65;p.age=65;p.finished=true;g.over=true;g.soloResult={endAge:65,endAgeNow:65};
 const copy=ctx.SaveState.prepare(ctx.SaveState.encode(g,{rolled:false},false)).g;
 assert(copy.over);assert.equal(copy.endAge,65);assert(copy.players[0].finished);assert.equal(copy.soloResult.endAgeNow,65);
}
{
 const g=E.newGame({mode:'endless',rule:'101',count:2,seed:42});g.endAge=65;
 E.migrateTime(g);assert.equal(g.endAge,65);assert(!E.lifeComplete(g,g.players[0]));
}
console.log('✅ 旧档续局延长至70岁，65岁等待席位重新参与；终局、缺口、现金及无限模式保留');
