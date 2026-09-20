/* ==========================================================================
   data-board.js — 棋盘（内圈老鼠赛跑 24 格 / 外圈财务自由圈 24 格）
   本土化：格位名称、梦想、企业、初始投资组合全部替换为国内投资理财场景。
   ========================================================================== */

/* 7×7 外环 24 格坐标（顺时针，从左上角开始） */
function ringPositions(){
  const p = [];
  for(let c=1;c<=7;c++) p.push({r:1,c});        // 上边 1..7
  for(let r=2;r<=7;r++) p.push({r,c:7});        // 右边
  for(let c=6;c>=1;c--) p.push({r:7,c});        // 下边
  for(let r=6;r>=2;r--) p.push({r,c:1});        // 左边
  return p;                                     // 共 24 格
}
window.RING_POS = ringPositions();

/* ---------- 内圈：老鼠赛跑（掷 1 粒骰子） ---------- */
window.RAT_RACE = [
  { t:'start',        nm:'起点',     ico:'🏁', sub:'休假 · 恢复精力' },
  { t:'opportunity',  nm:'投资机会',  ico:'💡', sub:'理财 / 置业' },
  { t:'paycheck',     nm:'发薪日',    ico:'💰', sub:'结算一整年' },
  { t:'opportunity',  nm:'投资机会',  ico:'💡' },
  { t:'doodad',       nm:'意外支出',  ico:'💳', sub:'抽取意外支出卡' },
  { t:'market',       nm:'市场行情',  ico:'📈', sub:'抽取行情 / 政策卡' },
  { t:'opportunity',  nm:'投资机会',  ico:'💡' },
  { t:'paycheck',     nm:'发薪日',    ico:'💰' },
  { t:'baby',         nm:'添丁',     ico:'👶', sub:'子女支出增加' },
  { t:'opportunity',  nm:'投资机会',  ico:'💡' },
  { t:'charity',      nm:'公益捐赠',  ico:'🎗️', sub:'税前扣除 · 得银翅膀' },
  { t:'market',       nm:'市场行情',  ico:'📈' },
  { t:'opportunity',  nm:'投资机会',  ico:'💡' },
  { t:'downsized',    nm:'裁员失业',  ico:'📉', sub:'工资归零 · 需重新求职' },
  { t:'paycheck',     nm:'发薪日',    ico:'💰' },
  { t:'opportunity',  nm:'投资机会',  ico:'💡' },
  { t:'market',       nm:'市场行情',  ico:'📈' },
  { t:'opportunity',  nm:'投资机会',  ico:'💡' },
  { t:'doodad',       nm:'意外支出',  ico:'💳' },
  { t:'baby',         nm:'添丁',     ico:'👶' },
  { t:'opportunity',  nm:'投资机会',  ico:'💡' },
  { t:'market',       nm:'市场行情',  ico:'📈' },
  { t:'charity',      nm:'公益捐赠',  ico:'🎗️' },
  { t:'doodad',       nm:'意外支出',  ico:'💳' }
];

/* ---------- 外圈：财务自由圈（掷 2 粒骰子） ---------- */
window.FAST_TRACK = [
  { t:'start',        nm:'自由起点',  ico:'🏁', sub:'Fast Track' },
  { t:'cashflowday',  nm:'分红日',    ico:'💰', sub:'领取年度分红' },
  { t:'business',     nm:'企业投资',  ico:'🏭', sub:'仅限现金购买' },
  { t:'cashflowday',  nm:'分红日',    ico:'💰' },
  { t:'dream',        nm:'梦想',     ico:'🌸', dream:0 },
  { t:'cashflowday',  nm:'分红日',    ico:'💰' },
  { t:'business',     nm:'企业投资',  ico:'🏭' },
  { t:'taxaudit',     nm:'税务稽查',  ico:'🧾', sub:'支付一半现金' },
  { t:'cashflowday',  nm:'分红日',    ico:'💰' },
  { t:'dream',        nm:'梦想',     ico:'🌸', dream:1 },
  { t:'cashflowday',  nm:'分红日',    ico:'💰' },
  { t:'business',     nm:'企业投资',  ico:'🏭' },
  { t:'divorce',      nm:'离婚析产',  ico:'💔', sub:'支付一半现金' },
  { t:'cashflowday',  nm:'分红日',    ico:'💰' },
  { t:'dream',        nm:'梦想',     ico:'🌸', dream:2 },
  { t:'business',     nm:'企业投资',  ico:'🏭' },
  { t:'cashflowday',  nm:'分红日',    ico:'💰' },
  { t:'lawsuit',      nm:'官司赔偿',  ico:'⚖️', sub:'赔偿 ¥50,000' },
  { t:'cashflowday',  nm:'分红日',    ico:'💰' },
  { t:'dream',        nm:'梦想',     ico:'🌸', dream:3 },
  { t:'business',     nm:'企业投资',  ico:'🏭' },
  { t:'dream',        nm:'梦想',     ico:'🌸', dream:4 },
  { t:'business',     nm:'企业投资',  ico:'🏭' },
  { t:'dream',        nm:'梦想',     ico:'🌸', dream:5 }
];

/* ---------- 梦想格（棋子上放的“奶酪”） ---------- */
window.DREAMS = [
  { id:0, nm:'环游世界',          ico:'🌍', cost:1075000 },
  { id:1, nm:'一线城市大平层',     ico:'🏙️', cost:860000 },
  { id:2, nm:'私人海岛度假村',     ico:'🏝️', cost:752500 },
  { id:3, nm:'家乡建一栋别墅',     ico:'🏡', cost:645000 },
  { id:4, nm:'开一家自己的咖啡馆',  ico:'☕', cost:537500 },
  { id:5, nm:'资助一所希望小学',   ico:'🏫', cost:430000 }
];

/* ---------- 财务自由圈企业（绿色格：只能用现金购买，不允许贷款） ---------- */
window.FT_BUSINESSES = [
  { id:'b1', nm:'连锁奶茶品牌',  ico:'🧋', cost:215000, cf:6000  },
  { id:'b2', nm:'连锁火锅店',    ico:'🍲', cost:322500, cf:9000  },
  { id:'b3', nm:'新能源充电站',  ico:'🔌', cost:430000, cf:12000 },
  { id:'b4', nm:'物流快递公司',  ico:'🚚', cost:537500, cf:15000 },
  { id:'b5', nm:'商业综合体',    ico:'🏬', cost:752500, cf:22000 },
  { id:'b6', nm:'科技公司',      ico:'💻', cost:1075000, cf:30000 },
  { id:'b7', nm:'新能源整车厂',  ico:'🏭', cost:1720000, cf:50000 }
];

/* ---------- 财务自由圈特殊格费用 ---------- */
window.FT_EVENTS = {
  taxaudit:{ nm:'税务稽查', ico:'🧾', desc:'税务稽查补缴，支付你手上现金的一半（至少 ¥10,000，不足则全部支付）。' },
  divorce  :{ nm:'离婚析产', ico:'💔', desc:'离婚财产分割，支付你手上现金的一半。' },
  lawsuit  :{ nm:'官司赔偿', ico:'⚖️', desc:'败诉赔偿 ¥50,000；若现金不足，支付全部现金。' }
};

/* ---------- 202 规则：初始投资组合卡（开局随机抽取） ---------- */
window.PORTFOLIOS = [
  { nm:'大额存单',      ico:'🏦', cash:5000,  income:{ interest:50 },   note:'¥5,000 大额存单，每月利息 ¥50。' },
  { nm:'沪深300ETF',    ico:'📈', stocks:{ '510300':{ shares:100, cost:5 } },  note:'100 份沪深300ETF，成本 ¥5/份。' },
  { nm:'中概互联ETF',   ico:'📉', stocks:{ '513050':{ shares:500, cost:10 } }, note:'500 份中概互联ETF，成本 ¥10/份。' },
  { nm:'货币基金',      ico:'📊', cash:3000,  income:{ dividend:30 },   note:'¥3,000 货币基金，每月分红 ¥30。' },
  { nm:'小户型公寓',    ico:'🏠', realEstate:[{ nm:'小户型公寓', dp:5000,  cost:65000,  cf:100,  rent:400 }], note:'首付 ¥5,000 · 月租金收入 +¥100' },
  { nm:'老破小出租房',  ico:'🏘️', realEstate:[{ nm:'老破小出租房', dp:20000, cost:170000, cf:500, rent:1400 }],
                                    liabs:{ other:120000 }, extraPay:1200, note:'首付 ¥20,000 · 月租金收入 +¥500 · 附带房贷 ¥120,000（月供 ¥1,200）' },
  { nm:'朋友公司股权',  ico:'🏪', business:[{ nm:'朋友公司股权', cost:10000, cf:300 }], note:'出资 ¥10,000 · 月分红 +¥300' },
  { nm:'郊区宅基地',    ico:'🌾', land:{ nm:'郊区宅基地', cost:15000 }, note:'取得成本 ¥15,000 · 无现金流' },
  { nm:'黄金积存',      ico:'🪙', collectible:{ nm:'黄金积存', cost:2000 }, note:'成本 ¥2,000 · 无现金流' },
  { nm:'代步车 + 车贷',  ico:'🚗', cash:2000, liabs:{ car:8000 }, extraPay:200, note:'现金 ¥2,000，另有车贷 ¥8,000（月供 ¥200）' }
];

/* ---------- 可做空的标的（202 规则：两融标的，可融券卖空） ---------- */
window.SHORTABLE = ['600666','300999'];

/* 游戏中的股票 / ETF 标的（代码均为虚构，仅用于游戏） */
window.SYMBOLS = {
  '600666':{ nm:'白酒龙头',   base:10, board:'沪市主板' },
  '300999':{ nm:'新能源龙头', base:20, board:'创业板'   },
  '000777':{ nm:'医药白马',   base:5,  board:'深市主板' },
  '588888':{ nm:'科创50ETF',  base:30, board:'科创板ETF' }
};

/* ---------- 游戏模式 ---------- */
window.GAME_MODES = {
  age    :{ nm:'年龄模式', desc:'20 岁起步，每完成一整轮长 1 岁，65 岁退休结算，共 45 轮。' },
  solo   :{ nm:'单人模式', desc:'一个人走完 20→65 岁：收入见顶、精力衰减、父母老去、最终退休。'
                                  + '61 岁起工资停发、改领养老金；没有其他玩家 —— 投资卡可转让给机构，'
                                  + '联合购买由机构合伙人承接。不排名次，按「达成时间 + 最终社会等级」评出人生评级。' },
  endless:{ nm:'无限模式', desc:'不设年龄与轮数上限，一直玩到有人达成获胜条件。' }
};
window.AGE_START = 20;
window.AGE_END   = 65;
