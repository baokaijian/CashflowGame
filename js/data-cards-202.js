/* ==========================================================================
   data-cards-202.js — 202 牌堆：杠杆交易卡 / 大额现金流卡 / 行情政策卡(42) / 意外支出卡
   本土化：加入国内常见的政策与市场背景（限购放松、租赁指导价、集采、
   产业并购、平台监管、土地收储等），标的与产品名称全部替换为国内场景。
   ========================================================================== */

/* ---------- 杠杆交易卡（替换 101 的「小额理财」，含股票 / 期权 / 两融） ---------- */
window.DECK_CAPGAIN = [
  { id:'cg1', kind:'stock', symbol:'600666',  price:4,  range:true, min:100, max:1000, nm:'白酒龙头',
    note:'每股 ¥4，可买 100—1,000 股。低位区间，适合建仓或融券做空。' },
  { id:'cg2', kind:'stock', symbol:'600666',  price:12, range:true, min:100, max:1000, nm:'白酒龙头',
    note:'每股 ¥12，可买 100—1,000 股。' },
  { id:'cg3', kind:'stock', symbol:'300999', price:6,  range:true, min:100, max:1000, nm:'新能源龙头',
    note:'每股 ¥6，可买 100—1,000 股。' },
  { id:'cg4', kind:'stock', symbol:'300999', price:25, range:true, min:100, max:1000, nm:'新能源龙头',
    note:'每股 ¥25，可买 100—1,000 股。高位区间，可考虑融券做空。' },
  { id:'cg5', kind:'stock', symbol:'588000',  price:3,  range:true, min:100, max:2000, nm:'科创50ETF',
    note:'每份 ¥3，可买 100—2,000 份。' },
  { id:'cg6', kind:'stock', symbol:'510300',price:16, range:true, min:100, max:1000, nm:'沪深300ETF',
    note:'每份 ¥16，可买 100—1,000 份。' },
  { id:'cg7', kind:'option', symbol:'600666',  strike:15, premium:2, dir:'call', turns:3, nm:'白酒龙头 看涨期权',
    note:'权利金 ¥2/股 × 100 股 = ¥200，行权价 ¥15。预期上涨时买入，3 回合内有效。' },
  { id:'cg8', kind:'option', symbol:'600666',  strike:10, premium:1.5, dir:'put', turns:3, nm:'白酒龙头 看跌期权',
    note:'权利金 ¥1.5/股 × 100 股 = ¥150，行权价 ¥10。预期下跌时买入，3 回合内有效。' },
  { id:'cg9', kind:'option', symbol:'300999', strike:20, premium:2.5, dir:'call', turns:3, nm:'新能源龙头 看涨期权',
    note:'权利金 ¥2.5/股 × 100 股 = ¥250，行权价 ¥20。3 回合内有效。' },
  { id:'cg10',kind:'option', symbol:'300999', strike:20, premium:2, dir:'put', turns:3, nm:'新能源龙头 看跌期权',
    note:'权利金 ¥2/股 × 100 股 = ¥200，行权价 ¥20。3 回合内有效。' },
  { id:'cg11',kind:'straddle', symbol:'600666', strike:12, premium:3.5, nm:'白酒龙头 跨式期权',
    note:'同时买入看涨与看跌，合计权利金 ¥3.5/股 × 100 股 = ¥350。适合预期大幅波动但方向不明。' },
  { id:'cg12',kind:'collectible', nm:'黄金积存', unit:true, price:120, min:10, max:100,
    note:'金价 ¥120/克，可买 10—100 克。' },
  { id:'cg13',kind:'collectible', nm:'白银积存', unit:true, price:6, min:100, max:2000,
    note:'银价 ¥6/克，可买 100—2,000 克。' },
  { id:'cg14',kind:'realestate', nm:'法拍房', dp:6000, cost:80000, cf:0, rent:0, capital:true,
    note:'法拍成交价 ¥80,000，首付 ¥6,000，无租金收入，等待行情回升后出售赚取差价。' },
  { id:'cg15',kind:'realestate', nm:'郊区小地块', dp:4000, cost:30000, cf:0, rent:0, capital:true,
    note:'首付 ¥4,000，无现金流，博取土地升值。' },
  { id:'cg16',kind:'stock', symbol:'600666',  price:2,  range:true, min:100, max:2000, nm:'白酒龙头（恐慌抛售）',
    note:'每股 ¥2，可买 100—2,000 股。市场恐慌，注意仓位。' }
];

/* ---------- 大额现金流卡（替换 101 的「大额置业」，大型地产与经营项目） ---------- */
window.DECK_CASHFLOW = [
  { id:'cf1', kind:'realestate', nm:'长租公寓整栋', dp:60000, cost:600000, cf:3600, rent:9000, joint:true,
    note:'总价 ¥600,000，首付 ¥60,000，月租金收入 ¥9,000（净 +¥3,600）。202 规则：可联合购买，按出资比例分配现金流。' },
  { id:'cf2', kind:'realestate', nm:'写字楼整层', dp:80000, cost:800000, cf:5000, rent:11000, joint:true,
    note:'总价 ¥800,000，首付 ¥80,000，月租金收入 ¥11,000（净 +¥5,000）。可联合购买。' },
  { id:'cf3', kind:'realestate', nm:'商业综合体商铺', dp:100000, cost:1200000, cf:8000, rent:18000, joint:true,
    note:'总价 ¥1,200,000，首付 ¥100,000，月租金收入 ¥18,000（净 +¥8,000）。可联合购买。' },
  { id:'cf4', kind:'business', nm:'连锁餐饮集团', cost:150000, cf:4000,
    note:'入股 ¥150,000，月分红 +¥4,000。' },
  { id:'cf5', kind:'business', nm:'汽车经销店',  cost:120000, cf:3000,
    note:'入股 ¥120,000，月分红 +¥3,000。' },
  { id:'cf6', kind:'business', nm:'医疗器械公司股权', cost:200000, cf:5500,
    note:'入股 ¥200,000，月分红 +¥5,500。' },
  { id:'cf7', kind:'business', nm:'连锁洗衣品牌',  cost:60000, cf:2200,
    note:'入股 ¥60,000，月分红 +¥2,200。' },
  { id:'cf8', kind:'realestate', nm:'仓储物流园',  dp:70000, cost:700000, cf:4200, rent:9600, joint:true,
    note:'总价 ¥700,000，首付 ¥70,000，月租金收入 ¥9,600（净 +¥4,200）。可联合购买。' },
  { id:'cf9', kind:'land', nm:'商业用地', cost:50000, cf:0,
    note:'取得用地 ¥50,000，等待收储或转让。' },
  { id:'cf10',kind:'savings', nm:'私募债', cost:30000, interest:1200,
    note:'认购 ¥30,000，月派息 +¥1,200。私募债流动性差、信用风险高。' }
];

/* ---------- 行情 / 政策卡（202：共 42 张，抽满 25 张后重新洗牌） ---------- */
window.DECK_MARKET_202 = [
  { id:'m01', kind:'stock', symbol:'600666',  price:2,  note:'白酒板块大跌，龙头报 ¥2/股。融券做空者必须立即买回平仓。' },
  { id:'m02', kind:'stock', symbol:'600666',  price:4,  note:'白酒龙头报 ¥4/股。' },
  { id:'m03', kind:'stock', symbol:'600666',  price:9,  note:'白酒龙头报 ¥9/股。' },
  { id:'m04', kind:'stock', symbol:'600666',  price:16, note:'白酒龙头报 ¥16/股。' },
  { id:'m05', kind:'stock', symbol:'600666',  price:28, note:'白酒龙头报 ¥28/股。' },
  { id:'m06', kind:'stock', symbol:'600666',  price:45, note:'白酒龙头报 ¥45/股。' },
  { id:'m07', kind:'stock', symbol:'600666',  price:70, note:'消费复苏，白酒龙头涨至 ¥70/股。' },
  { id:'m08', kind:'stock', symbol:'300999', price:3,  note:'新能源龙头报 ¥3/股。' },
  { id:'m09', kind:'stock', symbol:'300999', price:8,  note:'新能源龙头报 ¥8/股。' },
  { id:'m10', kind:'stock', symbol:'300999', price:14, note:'新能源龙头报 ¥14/股。' },
  { id:'m11', kind:'stock', symbol:'300999', price:22, note:'新能源龙头报 ¥22/股。' },
  { id:'m12', kind:'stock', symbol:'300999', price:35, note:'新能源龙头报 ¥35/股。' },
  { id:'m13', kind:'stock', symbol:'300999', price:60, note:'补贴政策落地，新能源龙头涨至 ¥60/股。' },
  { id:'m14', kind:'stock', symbol:'000777',  price:1,  note:'医药白马报 ¥1/股。' },
  { id:'m15', kind:'stock', symbol:'000777',  price:6,  note:'医药白马报 ¥6/股。' },
  { id:'m16', kind:'stock', symbol:'000777',  price:18, note:'医药白马报 ¥18/股。' },
  { id:'m17', kind:'stock', symbol:'000777',  price:40, note:'创新药获批，医药白马涨至 ¥40/股。' },
  { id:'m18', kind:'stock', symbol:'588888',price:9,  note:'科创50ETF 报 ¥9/份。' },
  { id:'m19', kind:'stock', symbol:'588888',price:24, note:'科创50ETF 报 ¥24/份。' },
  { id:'m20', kind:'stock', symbol:'588888',price:55, note:'科创50ETF 报 ¥55/份。' },
  { id:'m21', kind:'stock', symbol:'588888',price:90, note:'科技行情爆发，科创50ETF 涨至 ¥90/份。' },
  { id:'m22', kind:'realestate', prop:'小区车位', price:110000, note:'有买家出价 ¥110,000 收购小区车位。' },
  { id:'m23', kind:'realestate', prop:'小区车位', price:155000, note:'车位紧张，买家出价 ¥155,000。' },
  { id:'m24', kind:'realestate', prop:'单身公寓', price:160000, note:'买家出价 ¥160,000 收购单身公寓。' },
  { id:'m25', kind:'realestate', prop:'法拍房', price:140000, note:'买家出价 ¥140,000 收购法拍房。' },
  { id:'m26', kind:'realestate', prop:'三居室住宅', price:480000, note:'二手房回暖，买家出价 ¥480,000 收购三居室住宅。' },
  { id:'m27', kind:'realestate', prop:'长租公寓整栋', price:900000, note:'长租机构出价 ¥900,000 收购长租公寓整栋。' },
  { id:'m28', kind:'realestate', prop:'写字楼整层', price:1300000, note:'机构出价 ¥1,300,000 收购写字楼整层。' },
  { id:'m29', kind:'rentDelta', pct:-0.20, nm:'保障性租赁住房入市', note:'保障性租赁住房大量入市，你所有出租房产的租金收入下调 20%。' },
  { id:'m30', kind:'rentDelta', pct:-0.10, nm:'租金指导价出台', note:'租金指导价政策出台，你所有出租房产的租金收入下调 10%。' },
  { id:'m31', kind:'rentDelta', pct:0.15, nm:'开学季租赁需求上升', note:'毕业季与开学季叠加，你所有出租房产的租金收入上调 15%。' },
  { id:'m32', kind:'rentDelta', pct:0.30, nm:'片区更新完成', note:'片区改造与地铁开通，你所有出租房产的租金收入上调 30%。' },
  { id:'m33', kind:'disaster', target:'公寓', nm:'老旧小区改造事故', note:'老旧小区改造施工中楼体受损，你持有的一处公寓完全损毁，资产归零（持有多处时由你选择）。' },
  { id:'m34', kind:'disaster', target:'住宅', nm:'地铁施工导致沉降', note:'地铁施工导致地基沉降，你持有的一处住宅被鉴定为危房，资产归零。' },
  { id:'m35', kind:'disaster', target:'土地', nm:'划入生态保护红线', note:'土地被划入生态保护红线，禁止开发，价值归零。' },
  { id:'m36', kind:'business', rate:2.2, nm:'产业资本并购', note:'产业资本按你投入成本的 220% 收购你持有的经营项目，可择一出售。' },
  { id:'m37', kind:'business', rate:1.5, nm:'同行整合收购', note:'同行愿以你投入成本的 150% 收购你的经营项目，可择一出售。' },
  { id:'m38', kind:'business', rate:0.6, nm:'行业出清贱卖', note:'行业出清，你的经营项目只能按投入成本的 60% 折价套现（自愿）。' },
  { id:'m39', kind:'collectible', prop:'黄金积存', price:450, nm:'金价大涨', note:'避险情绪升温，黄金报价 ¥450/克。' },
  { id:'m40', kind:'collectible', prop:'白银积存', price:20,  nm:'白银上涨', note:'工业需求回升，白银报价 ¥20/克。' },
  { id:'m41', kind:'land', price:180000, nm:'土地收储', note:'政府收储，出价 ¥180,000 收购你的商业 / 待开发用地。' },
  { id:'m42', kind:'doodadLink', nm:'市场真空期', note:'当期无任何报价与买家，本轮无人可交易。' }
];

/* ---------- 意外支出卡（202：金额更重） ---------- */
window.DECK_DOODAD_202 = [
  { id:'d201', nm:'购置度假房产',  cost:12000, extraPay:300, note:'度假房产首付 ¥12,000，此后每月额外支出 ¥300。' },
  { id:'d202', nm:'购入新车',      cost:25000, extraPay:300, note:'换车支出 ¥25,000，此后每月额外支出 ¥300。' },
  { id:'d203', nm:'房屋大修',      cost:8000,  extraPay:0,   note:'房屋结构与防水大修 ¥8,000。' },
  { id:'d204', nm:'家人急诊手术',  cost:6000,  extraPay:150, note:'急诊手术自付 ¥6,000，此后每月康复支出 ¥150。' },
  { id:'d205', nm:'举办婚礼',      cost:15000, extraPay:0,   note:'婚礼支出 ¥15,000。' },
  { id:'d206', nm:'车辆年度成本',  cost:5000,  extraPay:200, note:'保险 + 保养 + 年检 ¥5,000，此后每月养车 ¥200。' },
  { id:'d207', nm:'自然灾害损失',  cost:10000, extraPay:0,   note:'保险未覆盖的自然灾害损失 ¥10,000。' },
  { id:'d208', nm:'税务稽查补缴',  cost:9000,  extraPay:0,   note:'税务稽查补缴税款 ¥9,000。' },
  { id:'d209', nm:'子女培训年费',  cost:4000,  extraPay:150, note:'课外培训年费 ¥4,000，此后每月 ¥150。' },
  { id:'d210', nm:'房屋加装设备',  cost:3000,  extraPay:0,   note:'加装新风 / 净水设备 ¥3,000。' }
];
