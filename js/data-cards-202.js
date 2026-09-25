/* ==========================================================================
   data-cards-202.js — 202 牌堆：杠杆交易卡 / 大额现金流卡 / 行情政策卡(42) / 意外支出卡
   本土化：加入国内常见的政策与市场背景（限购放松、租赁指导价、集采、
   产业并购、平台监管、土地收储等），标的与产品名称全部替换为国内场景。
   ========================================================================== */

/* ---------- 杠杆交易卡（替换 101 的「小额理财」，含股票 / 期权 / 两融） ---------- */
window.DECK_CAPGAIN = [
  { id:'cg1', kind:'stock', symbol:'600666',  price:9,  range:true, min:100, max:1000, nm:'白酒龙头',
    note:'每股 ¥9，可买 100—1,000 股。低位区间，适合建仓或融券做空。' },
  { id:'cg2', kind:'stock', symbol:'600666',  price:26, range:true, min:100, max:1000, nm:'白酒龙头',
    note:'每股 ¥26，可买 100—1,000 股。' },
  { id:'cg3', kind:'stock', symbol:'300999', price:13,  range:true, min:100, max:1000, nm:'新能源龙头',
    note:'每股 ¥13，可买 100—1,000 股。' },
  { id:'cg4', kind:'stock', symbol:'300999', price:54, range:true, min:100, max:1000, nm:'新能源龙头',
    note:'每股 ¥54，可买 100—1,000 股。高位区间，可考虑融券做空。' },
  { id:'cg5', kind:'stock', symbol:'588000',  price:6,  range:true, min:100, max:2000, nm:'科创50ETF',
    note:'每份 ¥6，可买 100—2,000 份。' },
  { id:'cg6', kind:'stock', symbol:'510300',price:34, range:true, min:100, max:1000, nm:'沪深300ETF',
    note:'每份 ¥34，可买 100—1,000 份。' },
  { id:'cg7', kind:'option', symbol:'600666',  strike:32, premium:4.3, dir:'call', turns:3, nm:'白酒龙头 看涨期权',
    note:'权利金 ¥4.3/股 × 100 股 = ¥430，行权价 ¥32。预期上涨时买入，3 回合内有效。' },
  { id:'cg8', kind:'option', symbol:'600666',  strike:22, premium:3.2, dir:'put', turns:3, nm:'白酒龙头 看跌期权',
    note:'权利金 ¥3.2/股 × 100 股 = ¥320，行权价 ¥22。预期下跌时买入，3 回合内有效。' },
  { id:'cg9', kind:'option', symbol:'300999', strike:43, premium:5.4, dir:'call', turns:3, nm:'新能源龙头 看涨期权',
    note:'权利金 ¥5.4/股 × 100 股 = ¥540，行权价 ¥43。3 回合内有效。' },
  { id:'cg10',kind:'option', symbol:'300999', strike:43, premium:4.3, dir:'put', turns:3, nm:'新能源龙头 看跌期权',
    note:'权利金 ¥4.3/股 × 100 股 = ¥430，行权价 ¥43。3 回合内有效。' },
  { id:'cg11',kind:'straddle', symbol:'600666', strike:26, premium:7.5, nm:'白酒龙头 跨式期权',
    note:'同时买入看涨与看跌，合计权利金 ¥7.5/股 × 100 股 = ¥750。适合预期大幅波动但方向不明。' },
  { id:'cg12',kind:'collectible', nm:'黄金积存', unit:true, price:258, min:10, max:100,
    note:'金价 ¥258/克，可买 10—100 克。' },
  { id:'cg13',kind:'collectible', nm:'白银积存', unit:true, price:13, min:100, max:2000,
    note:'银价 ¥13/克，可买 100—2,000 克。' },
  { id:'cg14', opProfile:'housing',kind:'realestate', tier:'res', nm:'法拍房', dp:172000, cost:172000, cf:0, rent:717, capital:true,
    note:'总价 ¥172,000，首付 ¥172,000（100%），无租金收入。等待行情回升后出售赚取差价。' },
  { id:'cg15', opProfile:'commercial',kind:'realestate', tier:'com', nm:'郊区小地块', dp:29025, cost:64500, cf:0, rent:323, capital:true,
    note:'总价 ¥64,500，首付 ¥29,025（45%），无租金收入。博取土地升值。' },
  { id:'cg16',kind:'stock', symbol:'600666',  price:4,  range:true, min:100, max:2000, nm:'白酒龙头（恐慌抛售）',
    note:'每股 ¥4，可买 100—2,000 股。市场恐慌，注意仓位。' }
];

/* ---------- 大额现金流卡（替换 101 的「大额置业」，大型地产与经营项目） ---------- */
window.DECK_CASHFLOW = [
  { id:'cf1', opProfile:'housing', kind:'realestate', tier:'res', nm:'长租公寓整栋', dp:387000, cost:1290000, cf:1673, rent:5375, joint:true,
    note:'总价 ¥1,290,000，首付 ¥387,000（30%），出租月收入 ¥5,375（净现金流 +¥1,673 · 净回报 5.2%/年）。202 规则：可联合购买，按出资比例分配现金流。' },
  { id:'cf2', opProfile:'commercial', kind:'realestate', tier:'com', nm:'写字楼整层', dp:774000, cost:1720000, cf:4721, rent:8600, joint:true,
    note:'总价 ¥1,720,000，首付 ¥774,000（45%），出租月收入 ¥8,600（净现金流 +¥4,721 · 净回报 7.3%/年）。可联合购买。' },
  { id:'cf3', opProfile:'commercial', kind:'realestate', tier:'com', nm:'商业综合体商铺', dp:1161000, cost:2580000, cf:7082, rent:12900, joint:true,
    note:'总价 ¥2,580,000，首付 ¥1,161,000（45%），出租月收入 ¥12,900（净现金流 +¥7,082 · 净回报 7.3%/年）。可联合购买。' },
  { id:'cf4', opProfile:'brand', kind:'business', tier:'brand', nm:'连锁餐饮集团', cost:322500, cf:2419,
    note:'入股 ¥322,500，月净收入 +¥2,419（净回报 9.0%/年）。' },
  { id:'cf5', opProfile:'equity', kind:'business', tier:'equity', nm:'汽车经销店',  cost:258000, cf:2150,
    note:'入股 ¥258,000，月净收入 +¥2,150（净回报 10.0%/年）。' },
  { id:'cf6', opProfile:'equity', kind:'business', tier:'equity', nm:'医疗器械公司股权', cost:430000, cf:3583,
    note:'入股 ¥430,000，月净收入 +¥3,583（净回报 10.0%/年）。' },
  { id:'cf7', opProfile:'brand', kind:'business', tier:'brand', nm:'连锁洗衣品牌',  cost:129000, cf:968,
    note:'入股 ¥129,000，月净收入 +¥968（净回报 9.0%/年）。' },
  { id:'cf8', opProfile:'commercial', kind:'realestate', tier:'com', nm:'仓储物流园',  dp:677250, cost:1505000, cf:4131, rent:7525, joint:true,
    note:'总价 ¥1,505,000，首付 ¥677,250（45%），出租月收入 ¥7,525（净现金流 +¥4,131 · 净回报 7.3%/年）。可联合购买。' },
  { id:'cf9', kind:'land', nm:'商业用地', cost:107500, cf:0,
    note:'取得用地 ¥107,500，等待收储或转让。' },
  { id:'cf10',kind:'savings', tier:'credit', nm:'私募债', cost:64500, interest:312,
    note:'认购 ¥64,500，月派息 +¥312（年化 5.8%）。私募债流动性差、信用风险高。' }
];

/* ---------- 行情 / 政策卡（202：共 42 张，抽满 25 张后重新洗牌） ---------- */
window.DECK_MARKET_202 = [
  { id:'m01', kind:'stock', symbol:'600666',  price:4,  note:'白酒板块大跌，龙头报 ¥4/股。融券做空者必须立即买回平仓。' },
  { id:'m02', kind:'stock', symbol:'600666',  price:9,  note:'白酒龙头报 ¥9/股。' },
  { id:'m03', kind:'stock', symbol:'600666',  price:19,  note:'白酒龙头报 ¥19/股。' },
  { id:'m04', kind:'stock', symbol:'600666',  price:34, note:'白酒龙头报 ¥34/股。' },
  { id:'m05', kind:'stock', symbol:'600666',  price:60, note:'白酒龙头报 ¥60/股。' },
  { id:'m06', kind:'stock', symbol:'600666',  price:97, note:'白酒龙头报 ¥97/股。' },
  { id:'m07', kind:'stock', symbol:'600666',  price:151, note:'消费复苏，白酒龙头涨至 ¥151/股。' },
  { id:'m08', kind:'stock', symbol:'300999', price:6,  note:'新能源龙头报 ¥6/股。' },
  { id:'m09', kind:'stock', symbol:'300999', price:17,  note:'新能源龙头报 ¥17/股。' },
  { id:'m10', kind:'stock', symbol:'300999', price:30, note:'新能源龙头报 ¥30/股。' },
  { id:'m11', kind:'stock', symbol:'300999', price:47, note:'新能源龙头报 ¥47/股。' },
  { id:'m12', kind:'stock', symbol:'300999', price:75, note:'新能源龙头报 ¥75/股。' },
  { id:'m13', kind:'stock', symbol:'300999', price:129, note:'补贴政策落地，新能源龙头涨至 ¥129/股。' },
  { id:'m14', kind:'stock', symbol:'000777',  price:2,  note:'医药白马报 ¥2/股。' },
  { id:'m15', kind:'stock', symbol:'000777',  price:13,  note:'医药白马报 ¥13/股。' },
  { id:'m16', kind:'stock', symbol:'000777',  price:39, note:'医药白马报 ¥39/股。' },
  { id:'m17', kind:'stock', symbol:'000777',  price:86, note:'创新药获批，医药白马涨至 ¥86/股。' },
  { id:'m18', kind:'stock', symbol:'588888',price:19,  note:'科创50ETF 报 ¥19/份。' },
  { id:'m19', kind:'stock', symbol:'588888',price:52, note:'科创50ETF 报 ¥52/份。' },
  { id:'m20', kind:'stock', symbol:'588888',price:118, note:'科创50ETF 报 ¥118/份。' },
  { id:'m21', kind:'stock', symbol:'588888',price:194, note:'科技行情爆发，科创50ETF 涨至 ¥194/份。' },
  { id:'m22', kind:'realestate', prop:'小区车位', price:236500, note:'有买家出价 ¥236,500 收购小区车位。' },
  { id:'m23', kind:'realestate', prop:'小区车位', price:333250, note:'车位紧张，买家出价 ¥333,250。' },
  { id:'m24', kind:'realestate', prop:'单身公寓', price:344000, note:'买家出价 ¥344,000 收购单身公寓。' },
  { id:'m25', kind:'realestate', prop:'法拍房', price:301000, note:'买家出价 ¥301,000 收购法拍房。' },
  { id:'m26', kind:'realestate', prop:'三居室住宅', price:1032000, note:'二手房回暖，买家出价 ¥1,032,000 收购三居室住宅。' },
  { id:'m27', kind:'realestate', prop:'长租公寓整栋', price:1935000, note:'长租机构出价 ¥1,935,000 收购长租公寓整栋。' },
  { id:'m28', kind:'realestate', prop:'写字楼整层', price:2795000, note:'机构出价 ¥2,795,000 收购写字楼整层。' },
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
  { id:'m39', kind:'collectible', prop:'黄金积存', price:968, nm:'金价大涨', note:'避险情绪升温，黄金报价 ¥968/克。' },
  { id:'m40', kind:'collectible', prop:'白银积存', price:43,  nm:'白银上涨', note:'工业需求回升，白银报价 ¥43/克。' },
  { id:'m41', kind:'land', price:387000, nm:'土地收储', note:'政府收储，出价 ¥387,000 收购你的商业 / 待开发用地。' },
  { id:'m42', kind:'doodadLink', nm:'市场真空期', note:'当期无任何报价与买家，本轮无人可交易。' }
];

/* ---------- 意外支出卡（202：金额更重） ---------- */
window.DECK_DOODAD_202 = [
  { id:'d201', scale:'life', nm:'购置度假房产',  cost:12000, extraPay:300, note:'买下一套度假房产，此后每月多出物业与维护。' },
  { id:'d202', scale:'life', nm:'购入新车',      cost:25000, extraPay:300, note:'换了新车，此后每月的保险与保养跟着上涨。' },
  { id:'d203', scale:'life', nm:'房屋大修',      cost:8000,  extraPay:0,   note:'房屋结构与防水大修。' },
  { id:'d204', scale:'basic', nm:'家人急诊手术',  cost:6000,  extraPay:150, note:'家人急诊手术，自付部分不小，此后每月还有康复支出。' },
  { id:'d205', scale:'life', nm:'举办婚礼',      cost:15000, extraPay:0,   note:'办了一场婚礼。' },
  { id:'d206', scale:'life', nm:'车辆年度成本',  cost:5000,  extraPay:200, note:'保险、保养加年检，此后每月的养车成本固定支出。' },
  { id:'d207', scale:'life', nm:'自然灾害损失',  cost:10000, extraPay:0,   note:'保险未覆盖的自然灾害损失。' },
  { id:'d208', scale:'basic', nm:'税务稽查补缴',  cost:9000,  extraPay:0,   note:'税务稽查补缴税款。' },
  { id:'d209', scale:'life', nm:'子女培训年费',  cost:4000,  extraPay:150, note:'子女课外培训年费，此后每月固定支出。' },
  { id:'d210', scale:'life', nm:'房屋加装设备',  cost:3000,  extraPay:0,   note:'加装新风与净水设备。' }
];
