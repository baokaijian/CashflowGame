/* ==========================================================================
   data-cards-101.js — 101 牌堆：小额理财卡 / 大额置业卡 / 行情政策卡 / 意外支出卡
   本土化：投资品种、标的名称、行情事件全部替换为国内常见投资理财场景。
   数值沿用原有标定以保证对局平衡。
   ========================================================================== */

/* ---------- 小额理财卡（成本较低、门槛低，适合起步积累） ---------- */
window.DECK_SMALL = [
  { id:'sm1',  kind:'stock', symbol:'510300', price:5,  range:true, min:100, max:1000, nm:'沪深300ETF',
    note:'每份 ¥5，可买 100—1,000 份。宽基指数，等待行情回暖后卖出。' },
  { id:'sm2',  kind:'stock', symbol:'513050', price:10, range:true, min:100, max:1000, nm:'中概互联ETF',
    note:'每份 ¥10，可买 100—1,000 份。波动较大，注意仓位。' },
  { id:'sm3',  kind:'stock', symbol:'588000', price:4,  range:true, min:100, max:1000, nm:'科创50ETF',
    note:'每份 ¥4，可买 100—1,000 份。科技成长风格。' },
  { id:'sm4',  kind:'stock', symbol:'512880', price:20, range:true, min:100, max:1000, nm:'券商ETF',
    note:'每份 ¥20，可买 100—1,000 份。行情风向标，弹性大。' },
  { id:'sm5',  kind:'realestate', nm:'小区车位', dp:3000,  cost:65000,  cf:100, rent:400,
    note:'总价 ¥65,000，首付 ¥3,000，出租月收入 ¥400（净现金流 +¥100）。' },
  { id:'sm6',  kind:'realestate', nm:'单身公寓', dp:5000,  cost:75000,  cf:200, rent:600,
    note:'总价 ¥75,000，首付 ¥5,000，出租月收入 ¥600（净现金流 +¥200）。' },
  { id:'sm7',  kind:'realestate', nm:'地铁口小商铺', dp:8000, cost:110000, cf:400, rent:1000,
    note:'总价 ¥110,000，首付 ¥8,000，出租月收入 ¥1,000（净现金流 +¥400）。' },
  { id:'sm8',  kind:'realestate', nm:'老破小', dp:2000, cost:50000, cf:-100, rent:300,
    note:'总价 ¥50,000，首付 ¥2,000，租金偏低净现金流 −¥100。等待拆迁或行情回暖后出手。' },
  { id:'sm9',  kind:'savings', nm:'高收益债基金', cost:5000, interest:50,
    note:'投入 ¥5,000，月度派息 +¥50（年化约 12%）。收益高伴随信用风险，本金可能波动。' },
  { id:'sm10', kind:'business', nm:'社区团购团长', cost:5000, cf:150,
    note:'投入 ¥5,000 做社区团购副业，月净收入 +¥150。' },
  { id:'sm11', kind:'collectible', nm:'黄金积存', unit:true, price:100, min:10, max:100,
    note:'金价 ¥100/克，可买 10—100 克，等待金价上涨后卖出。' },
  { id:'sm12', kind:'collectible', nm:'白银积存', unit:true, price:5, min:100, max:1000,
    note:'银价 ¥5/克，可买 100—1,000 克。' },
  { id:'sm13', kind:'collectible', nm:'纪念币收藏', cost:3000,
    note:'收藏纪念币 ¥3,000，等待收藏市场报价。' },
  { id:'sm14', kind:'stock', symbol:'000777', price:8, range:true, min:100, max:500, nm:'医药白马',
    note:'每股 ¥8，可买 100—500 股。' }
];

/* ---------- 大额置业卡（需要更多资金，提供更大现金流） ---------- */
window.DECK_BIG = [
  { id:'bg1', kind:'realestate', nm:'三居室住宅',  dp:40000, cost:300000, cf:1600, rent:3600,
    note:'总价 ¥300,000，首付 ¥40,000，出租月收入 ¥3,600（净现金流 +¥1,600）。' },
  { id:'bg2', kind:'realestate', nm:'学区房',     dp:60000, cost:450000, cf:2400, rent:5400,
    note:'总价 ¥450,000，首付 ¥60,000，出租月收入 ¥5,400（净现金流 +¥2,400）。' },
  { id:'bg3', kind:'realestate', nm:'整层写字楼',  dp:80000, cost:600000, cf:3200, rent:7200,
    note:'总价 ¥600,000，首付 ¥80,000，出租月收入 ¥7,200（净现金流 +¥3,200）。' },
  { id:'bg4', kind:'realestate', nm:'沿街商铺',  dp:50000, cost:400000, cf:2500, rent:4000,
    note:'总价 ¥400,000，首付 ¥50,000，出租月收入 ¥4,000（净现金流 +¥2,500）。' },
  { id:'bg5', kind:'business', nm:'连锁奶茶加盟',  cost:75000, cf:1200,
    note:'加盟出资 ¥75,000，月净收入 +¥1,200。' },
  { id:'bg6', kind:'business', nm:'社区生鲜超市',  cost:30000, cf:1600,
    note:'开店投入 ¥30,000，月净收入 +¥1,600。' },
  { id:'bg7', kind:'business', nm:'快递驿站',      cost:25000, cf:1000,
    note:'接手驿站 ¥25,000，月净收入 +¥1,000。' },
  { id:'bg8', kind:'business', nm:'新能源充电桩',  cost:45000, cf:2000,
    note:'自建充电桩 ¥45,000，月净收入 +¥2,000。' },
  { id:'bg9', kind:'business', nm:'小酒馆',       cost:20000, cf:1000, risky:true,
    note:'投入 ¥20,000，月净收入 +¥1,000；受消费行情影响，存在客流枯竭风险。' },
  { id:'bg10',kind:'land', nm:'城郊待开发土地',   cost:30000, cf:0,
    note:'取得土地 ¥30,000，暂不产生现金流，等待开发商收购或收储加价。' },
  { id:'bg11',kind:'stock', symbol:'600666', price:10, range:true, min:1000, max:5000, nm:'白酒龙头',
    note:'每股 ¥10，可买 1,000—5,000 股。' },
  { id:'bg12',kind:'savings', nm:'债权转让项目', cost:20000, interest:700,
    note:'受让债权 ¥20,000，月派息 +¥700（年化约 42%，属于高风险项目，请谨慎）。' }
];

/* ---------- 行情 / 政策卡（101：波动温和，全部使用） ---------- */
window.DECK_MARKET_101 = [
  { id:'mk1',  kind:'stock', symbol:'600666',  price:20,  nm:'消费板块回暖',
    note:'白酒龙头报 ¥20/股，持有者可全部或部分卖出。' },
  { id:'mk2',  kind:'stock', symbol:'600666',  price:40,  nm:'白酒龙头大涨',
    note:'白酒龙头报 ¥40/股，持有者可全部或部分卖出。' },
  { id:'mk3',  kind:'stock', symbol:'300999', price:30,  nm:'新能源板块反弹',
    note:'新能源龙头报 ¥30/股，持有者可全部或部分卖出。' },
  { id:'mk4',  kind:'stock', symbol:'000777',  price:10,  nm:'集采落地，医药修复',
    note:'医药白马报 ¥10/股，持有者可全部或部分卖出。' },
  { id:'mk5',  kind:'stock', symbol:'588888',price:50,  nm:'科创板走强',
    note:'科创50ETF 报 ¥50/份，持有者可全部或部分卖出。' },
  { id:'mk6',  kind:'realestate', prop:'小区车位', price:135000, nm:'车位需求旺盛',
    note:'有买家愿以 ¥135,000 收购你的小区车位。' },
  { id:'mk7',  kind:'realestate', prop:'单身公寓', price:135000, nm:'租赁市场活跃',
    note:'有买家愿以 ¥135,000 收购你的单身公寓。' },
  { id:'mk8',  kind:'realestate', prop:'地铁口小商铺', price:200000, nm:'商铺价格上行',
    note:'有买家愿以 ¥200,000 收购你的地铁口小商铺。' },
  { id:'mk9',  kind:'realestate', prop:'三居室住宅', price:400000, nm:'二手房成交回暖',
    note:'有买家愿以 ¥400,000 收购你的三居室住宅。' },
  { id:'mk10', kind:'realestate', prop:'学区房', price:550000, nm:'学区政策利好',
    note:'有买家愿以 ¥550,000 收购你的学区房。' },
  { id:'mk11', kind:'business', rate:1.8, nm:'并购方要约收购',
    note:'有并购方愿按你投入成本的 180% 收购你持有的经营项目，可择一出售。' },
  { id:'mk12', kind:'collectible', prop:'黄金积存', price:300, nm:'金价上涨',
    note:'黄金报价 ¥300/克，持有者可卖出。' },
  { id:'mk13', kind:'collectible', prop:'白银积存', price:15,  nm:'白银价格上涨',
    note:'白银报价 ¥15/克，持有者可卖出。' },
  { id:'mk14', kind:'land', price:100000, nm:'土地收储',
    note:'政府收储，愿以 ¥100,000 收购你的待开发土地。' },
  { id:'mk15', kind:'savings', rate:1.05, nm:'产品到期兑付',
    note:'你的理财 / 债权项目到期，可按本金的 105% 兑付。' },
  { id:'mk16', kind:'doodadLink', nm:'市场冷清',
    note:'当期无任何报价与买家，本轮无人可出售资产。' }
];

/* ---------- 意外支出卡（101：金额较轻） ---------- */
window.DECK_DOODAD_101 = [
  { id:'dd1', nm:'汽车保养',    cost:200,   note:'常规保养花了 ¥200。' },
  { id:'dd2', nm:'更换轮胎',    cost:500,   note:'四条轮胎 ¥500。' },
  { id:'dd3', nm:'家电损坏',    cost:1000,  note:'洗衣机 + 冰箱 ¥1,000。' },
  { id:'dd4', nm:'家庭出游',    cost:1500,  note:'假期带家人出游 ¥1,500。' },
  { id:'dd5', nm:'牙齿治疗',    cost:800,   note:'补牙与治疗 ¥800。' },
  { id:'dd6', nm:'同事随礼',    cost:300,   note:'同事结婚随礼与置装 ¥300。' },
  { id:'dd7', nm:'宠物就医',    cost:600,   note:'宠物手术 ¥600。' },
  { id:'dd8', nm:'房屋维修',    cost:1200,  note:'屋顶漏水返修 ¥1,200。' },
  { id:'dd9', nm:'手机更换',    cost:900,   note:'手机摔坏换新 ¥900。' },
  { id:'dd10',nm:'家人过生日',  cost:400,   note:'家庭聚餐 ¥400。' },
  { id:'dd11',nm:'补缴个税',    cost:2000,  note:'年度汇算补缴个税 ¥2,000。' },
  { id:'dd12',nm:'电脑升级',    cost:700,   note:'工作电脑升级 ¥700。' }
];
