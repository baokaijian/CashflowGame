/* ==========================================================================
   data-cards-101.js — 101 牌堆：小额理财卡 / 大额置业卡 / 行情政策卡 / 意外支出卡
   本土化：投资品种、标的名称、行情事件全部替换为国内常见投资理财场景。
   数值沿用原有标定以保证对局平衡。
   ========================================================================== */

/* ---------- 小额理财卡（成本较低、门槛低，适合起步积累） ---------- */
window.DECK_SMALL = [
  { id:'sm1',  kind:'stock', symbol:'510300', price:11,  range:true, min:100, max:1000, nm:'沪深300ETF',
    note:'每份 ¥11，可买 100—1,000 份。宽基指数，等待行情回暖后卖出。' },
  { id:'sm2',  kind:'stock', symbol:'513050', price:22, range:true, min:100, max:1000, nm:'中概互联ETF',
    note:'每份 ¥22，可买 100—1,000 份。波动较大，注意仓位。' },
  { id:'sm3',  kind:'stock', symbol:'588000', price:9,  range:true, min:100, max:1000, nm:'科创50ETF',
    note:'每份 ¥9，可买 100—1,000 份。科技成长风格。' },
  { id:'sm4',  kind:'stock', symbol:'512880', price:43, range:true, min:100, max:1000, nm:'券商ETF',
    note:'每份 ¥43，可买 100—1,000 份。行情风向标，弹性大。' },
  { id:'sm5',  kind:'realestate', tier:'park', nm:'小区车位', dp:55920,  cost:139800,  cf:297, rent:641,
    note:'总价 ¥139,800，首付 ¥55,920（40%），出租月收入 ¥641（净现金流 +¥297 · 净回报 6.4%/年）。' },
  { id:'sm6',  kind:'realestate', tier:'res', nm:'单身公寓', dp:48390,  cost:161300,  cf:209, rent:672,
    note:'总价 ¥161,300，首付 ¥48,390（30%），出租月收入 ¥672（净现金流 +¥209 · 净回报 5.2%/年）。' },
  { id:'sm7',  kind:'realestate', tier:'com', nm:'地铁口小商铺', dp:106425, cost:236500, cf:650, rent:1183,
    note:'总价 ¥236,500，首付 ¥106,425（45%），出租月收入 ¥1,183（净现金流 +¥650 · 净回报 7.3%/年）。' },
  { id:'sm8',  kind:'realestate', tier:'res', nm:'老破小', dp:32250, cost:107500, cf:-130, rent:179,
    note:'总价 ¥107,500，首付 ¥32,250（30%），出租月收入 ¥179（净现金流 −¥130 · 净回报 -4.8%/年）。房龄老、租金上不去，等待拆迁或行情回暖后出手。' },
  { id:'sm9',  kind:'savings', tier:'credit', nm:'高收益债基金', cost:10800, interest:52,
    note:'投入 ¥10,800，月派息 +¥52（年化 5.8%）。收益高于普通理财，伴随信用风险，本金可能波动。' },
  { id:'sm10', kind:'business', tier:'self', nm:'社区团购团长', cost:10800, cf:99,
    note:'投入 ¥10,800，月净收入 +¥99（净回报 11.0%/年）。（副业，需要投入精力打理）' },
  { id:'sm11', kind:'collectible', nm:'黄金积存', unit:true, price:215, min:10, max:100,
    note:'金价 ¥215/克，可买 10—100 克，等待金价上涨后卖出。' },
  { id:'sm12', kind:'collectible', nm:'白银积存', unit:true, price:11, min:100, max:1000,
    note:'银价 ¥11/克，可买 100—1,000 克。' },
  { id:'sm13', kind:'collectible', nm:'纪念币收藏', cost:6500,
    note:'收藏纪念币 ¥6,500，等待收藏市场报价。' },
  { id:'sm14', kind:'stock', symbol:'000777', price:17, range:true, min:100, max:500, nm:'医药白马',
    note:'每股 ¥17，可买 100—500 股。' }
];

/* ---------- 大额置业卡（需要更多资金，提供更大现金流） ---------- */
window.DECK_BIG = [
  { id:'bg1', kind:'realestate', tier:'res', nm:'三居室住宅',  dp:193500, cost:645000, cf:837, rent:2688,
    note:'总价 ¥645,000，首付 ¥193,500（30%），出租月收入 ¥2,688（净现金流 +¥837 · 净回报 5.2%/年）。' },
  { id:'bg2', kind:'realestate', tier:'res', nm:'学区房',     dp:290250, cost:967500, cf:1254, rent:4031,
    note:'总价 ¥967,500，首付 ¥290,250（30%），出租月收入 ¥4,031（净现金流 +¥1,254 · 净回报 5.2%/年）。' },
  { id:'bg3', kind:'realestate', tier:'com', nm:'整层写字楼',  dp:580500, cost:1290000, cf:3541, rent:6450,
    note:'总价 ¥1,290,000，首付 ¥580,500（45%），出租月收入 ¥6,450（净现金流 +¥3,541 · 净回报 7.3%/年）。' },
  { id:'bg4', kind:'realestate', tier:'com', nm:'沿街商铺',  dp:387000, cost:860000, cf:2361, rent:4300,
    note:'总价 ¥860,000，首付 ¥387,000（45%），出租月收入 ¥4,300（净现金流 +¥2,361 · 净回报 7.3%/年）。' },
  { id:'bg5', kind:'business', tier:'brand', nm:'连锁奶茶加盟',  cost:161300, cf:1210,
    note:'加盟出资 ¥161,300，月净收入 +¥1,210（净回报 9.0%/年）。' },
  { id:'bg6', kind:'business', tier:'self', nm:'社区生鲜超市',  cost:64500, cf:591,
    note:'开店投入 ¥64,500，月净收入 +¥591（净回报 11.0%/年）。' },
  { id:'bg7', kind:'business', tier:'self', nm:'快递驿站',      cost:53800, cf:493,
    note:'接手驿站 ¥53,800，月净收入 +¥493（净回报 11.0%/年）。' },
  { id:'bg8', kind:'business', tier:'self', nm:'新能源充电桩',  cost:96800, cf:887,
    note:'自建充电桩 ¥96,800，月净收入 +¥887（净回报 11.0%/年）。' },
  { id:'bg9', kind:'business', tier:'self', nm:'小酒馆',       cost:43000, cf:394, risky:true,
    note:'投入 ¥43,000，月净收入 +¥394（净回报 11.0%/年）。受消费行情影响，存在客流枯竭风险。' },
  { id:'bg10',kind:'land', nm:'城郊待开发土地',   cost:64500, cf:0,
    note:'取得土地 ¥64,500，暂不产生现金流，等待开发商收购或收储加价。' },
  { id:'bg11',kind:'stock', symbol:'600666', price:22, range:true, min:1000, max:5000, nm:'白酒龙头',
    note:'每股 ¥22，可买 1,000—5,000 股。' },
  { id:'bg12',kind:'savings', tier:'credit', nm:'债权转让项目', cost:43000, interest:208,
    note:'受让债权 ¥43,000，月派息 +¥208（年化 5.8%）。属于高风险项目，请谨慎。' }
];

/* ---------- 行情 / 政策卡（101：波动温和，全部使用） ---------- */
window.DECK_MARKET_101 = [
  { id:'mk1',  kind:'stock', symbol:'600666',  price:43,  nm:'消费板块回暖',
    note:'白酒龙头报 ¥43/股，持有者可全部或部分卖出。' },
  { id:'mk2',  kind:'stock', symbol:'600666',  price:86,  nm:'白酒龙头大涨',
    note:'白酒龙头报 ¥86/股，持有者可全部或部分卖出。' },
  { id:'mk3',  kind:'stock', symbol:'300999', price:65,  nm:'新能源板块反弹',
    note:'新能源龙头报 ¥65/股，持有者可全部或部分卖出。' },
  { id:'mk4',  kind:'stock', symbol:'000777',  price:22,  nm:'集采落地，医药修复',
    note:'医药白马报 ¥22/股，持有者可全部或部分卖出。' },
  { id:'mk5',  kind:'stock', symbol:'588888',price:108,  nm:'科创板走强',
    note:'科创50ETF 报 ¥108/份，持有者可全部或部分卖出。' },
  { id:'mk6',  kind:'realestate', prop:'小区车位', price:290250, nm:'车位需求旺盛',
    note:'有买家愿以 ¥290,250 收购你的小区车位。' },
  { id:'mk7',  kind:'realestate', prop:'单身公寓', price:290250, nm:'租赁市场活跃',
    note:'有买家愿以 ¥290,250 收购你的单身公寓。' },
  { id:'mk8',  kind:'realestate', prop:'地铁口小商铺', price:430000, nm:'商铺价格上行',
    note:'有买家愿以 ¥430,000 收购你的地铁口小商铺。' },
  { id:'mk9',  kind:'realestate', prop:'三居室住宅', price:860000, nm:'二手房成交回暖',
    note:'有买家愿以 ¥860,000 收购你的三居室住宅。' },
  { id:'mk10', kind:'realestate', prop:'学区房', price:1182500, nm:'学区政策利好',
    note:'有买家愿以 ¥1,182,500 收购你的学区房。' },
  { id:'mk11', kind:'business', rate:1.8, nm:'并购方要约收购',
    note:'有并购方愿按你投入成本的 180% 收购你持有的经营项目，可择一出售。' },
  { id:'mk12', kind:'collectible', prop:'黄金积存', price:645, nm:'金价上涨',
    note:'黄金报价 ¥645/克，持有者可卖出。' },
  { id:'mk13', kind:'collectible', prop:'白银积存', price:32,  nm:'白银价格上涨',
    note:'白银报价 ¥32/克，持有者可卖出。' },
  { id:'mk14', kind:'land', price:215000, nm:'土地收储',
    note:'政府收储，愿以 ¥215,000 收购你的待开发土地。' },
  { id:'mk15', kind:'savings', rate:1.05, nm:'产品到期兑付',
    note:'你的理财 / 债权项目到期，可按本金的 105% 兑付。' },
  { id:'mk16', kind:'doodadLink', nm:'市场冷清',
    note:'当期无任何报价与买家，本轮无人可出售资产。' }
];

/* ---------- 意外支出卡（101：金额较轻） ---------- */
window.DECK_DOODAD_101 = [
  { id:'dd1', scale:'life', nm:'汽车保养',    cost:200,   note:'到店做了一次常规保养。' },
  { id:'dd2', scale:'life', nm:'更换轮胎',    cost:500,   note:'四条轮胎一起换掉。' },
  { id:'dd3', scale:'life', nm:'家电损坏',    cost:1000,  note:'洗衣机与冰箱同时坏了。' },
  { id:'dd4', scale:'life', nm:'家庭出游',    cost:1500,  note:'假期带家人出去转了一圈。' },
  { id:'dd5', scale:'basic', nm:'牙齿治疗',    cost:800,   note:'补牙加治疗。' },
  { id:'dd6', scale:'basic', nm:'同事随礼',    cost:300,   note:'同事结婚，随礼加置装。' },
  { id:'dd7', scale:'basic', nm:'宠物就医',    cost:600,   note:'宠物做了一次手术。' },
  { id:'dd8', scale:'life', nm:'房屋维修',    cost:1200,  note:'屋顶漏水返修。' },
  { id:'dd9', scale:'life', nm:'手机更换',    cost:900,   note:'手机摔坏，换了新的。' },
  { id:'dd10', scale:'basic',nm:'家人过生日',  cost:400,   note:'给家人办了一桌。' },
  { id:'dd11', scale:'basic',nm:'补缴个税',    cost:2000,  note:'年度汇算补缴个税。' },
  { id:'dd12', scale:'life',nm:'电脑升级',    cost:700,   note:'工作电脑升级。' }
];
