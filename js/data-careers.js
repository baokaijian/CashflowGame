/* ==========================================================================
   data-careers.js — 职业卡数据（中国本土化版）
   收入支出表按国内实际情况命名：个税五险一金 / 房贷 / 教育培训 / 车贷 / 信用卡分期 / 日常消费 / 其他固定支出。
   财务数值沿用游戏内的「量级标定」以保证对局平衡，不直接等同于现实收入水平。
   ========================================================================== */
window.CAREERS = [
  { id:'doctor',   name:'三甲医院医生', ico:'🩺', salary:13200, taxes:3420, home:1900, school:750, car:380, credit:270, retail:50, other:2880, perChild:640, savings:400,
    liab:{ home:202000, school:150000, car:19000, credit:9000 } },
  { id:'pilot',    name:'民航机长',    ico:'✈️', salary:9500,  taxes:2350, home:1330, school:240, car:300, credit:120, retail:50, other:1430, perChild:480, savings:400,
    liab:{ home:143000, school:78000,  car:15000, credit:4000 } },
  { id:'lawyer',   name:'执业律师',    ico:'⚖️', salary:7500,  taxes:1830, home:1100, school:390, car:220, credit:180, retail:50, other:1150, perChild:380, savings:400,
    liab:{ home:115000, school:78000,  car:11000, credit:6000 } },
  { id:'engineer', name:'软件工程师',   ico:'💻', salary:4900,  taxes:1050, home:700,  school:60,  car:210, credit:60,  retail:50, other:690,  perChild:240, savings:400,
    liab:{ home:75000,  school:12000,  car:7000,  credit:4000 } },
  { id:'manager',  name:'企业中层管理', ico:'💼', salary:4600,  taxes:910,  home:700,  school:60,  car:150, credit:60,  retail:50, other:690,  perChild:240, savings:400,
    liab:{ home:75000,  school:12000,  car:5000,  credit:4000 } },
  { id:'teacher',  name:'小学教师',    ico:'📚', salary:3300,  taxes:630,  home:700,  school:60,  car:120, credit:90,  retail:50, other:460,  perChild:180, savings:400,
    liab:{ home:75000,  school:12000,  car:5000,  credit:3000 } },
  { id:'nurse',    name:'护士',       ico:'💉', salary:3100,  taxes:600,  home:700,  school:60,  car:110, credit:60,  retail:50, other:510,  perChild:170, savings:400,
    liab:{ home:75000,  school:12000,  car:4000,  credit:4000 } },
  { id:'police',   name:'民警',       ico:'🚔', salary:3000,  taxes:580,  home:700,  school:60,  car:120, credit:60,  retail:50, other:480,  perChild:160, savings:400,
    liab:{ home:75000,  school:12000,  car:4000,  credit:4000 } },
  { id:'secretary',name:'公司文员',    ico:'🗂️', salary:2500,  taxes:460,  home:700,  school:60,  car:120, credit:60,  retail:50, other:450,  perChild:140, savings:400,
    liab:{ home:75000,  school:12000,  car:5000,  credit:4000 } },
  { id:'trucker',  name:'货运司机',    ico:'🚚', salary:2500,  taxes:460,  home:400,  school:60,  car:80,  credit:60,  retail:50, other:540,  perChild:140, savings:400,
    liab:{ home:40000,  school:12000,  car:5000,  credit:4000 } },
  { id:'mechanic', name:'汽修技师',    ico:'🔧', salary:2000,  taxes:360,  home:700,  school:60,  car:120, credit:60,  retail:50, other:390,  perChild:110, savings:400,
    liab:{ home:75000,  school:12000,  car:5000,  credit:4000 } },
  { id:'janitor',  name:'小区保安',    ico:'🧹', salary:1600,  taxes:280,  home:300,  school:60,  car:60,  credit:60,  retail:50, other:300,  perChild:70,  savings:400,
    liab:{ home:30000,  school:12000,  car:3000,  credit:4000 } }
];

/* 支出 / 收入科目中文名。engine 内部字段名保持不变，避免破坏既有逻辑 */
window.EXP_LABEL = {
  taxes:'个税与五险一金', home:'房贷月供', school:'教育培训支出', car:'车贷月供',
  credit:'信用卡分期', retail:'日常消费', other:'其他固定支出',
  extra:'额外固定支出', children:'子女养育支出', bank:'信用贷还款'
};
window.INC_LABEL = {
  salary:'工资收入', interest:'存款 / 理财收益', dividend:'基金 / 分红收益',
  realEstate:'房租收入', business:'经营分红', ftBusiness:'企业现金流'
};

/* 玩家标识色 */
window.PLAYER_COLORS = [
  { c:'#7c4dff', n:'紫' }, { c:'#00897b', n:'青' }, { c:'#e53935', n:'红' },
  { c:'#fb8c00', n:'橙' }, { c:'#1e88e5', n:'蓝' }, { c:'#8e24aa', n:'品红' }
];

/* 玩家头像图标 */
window.PLAYER_ICONS = ['🐼','🐯','🐰','🐲','🦊','🦉'];

/* 信贷参数：按国内实际水平设定 —— 信用贷 / 信用卡分期名义年化约 12%。
   旧版沿用美式现金贷的「月息 10%（年化 120%）」，明显脱离国内现实。 */
window.BANK = { loanRate:0.01, annualRate:0.12, label:'信用贷 / 信用卡分期' };
