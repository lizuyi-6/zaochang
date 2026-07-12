export type Product = {
  id: string | number;
  slug?: string;
  official?: boolean;
  ownerName: string;
  ownerInitial: string;
  title: string;
  description: string;
  longDescription: string;
  category: string;
  demoType: string;
  demoUrl?: string | null;
  coverTheme: "coral" | "mint" | "blue" | "yellow" | "ink";
  price: number;
  likes: number;
  plays: number;
  image: string;
  accent: string;
  release: string;
  tags: string[];
};

export type CommunityPost = {
  id: string | number;
  ownerName: string;
  ownerInitial: string;
  role: string;
  content: string;
  createdAt: string;
  likes: number;
  comments: number;
  color: "coral" | "mint" | "blue" | "yellow" | "ink";
  image?: string;
  productSlug?: string;
  postType?: "记录" | "版本发布" | "共创招募";
};

export const products: Product[] = [
  {
    id: "mori",
    slug: "mori",
    ownerName: "林默",
    ownerInitial: "林",
    title: "MORI 专注森林",
    description: "把专注时段变成会生长的声音景观。",
    longDescription:
      "MORI 不记录你完成了多少任务，而是把每次不被打断的时间变成一片有天气、有声音、有季节变化的森林。它想让专注不再像自我管理，更像进入一个愿意停留的地方。",
    category: "声音影像",
    demoType: "focus",
    coverTheme: "mint",
    price: 0,
    likes: 842,
    plays: 12842,
    image:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=88",
    accent: "#b9ecc8",
    release: "v1.7 · 2 天前",
    tags: ["专注", "声音", "生成景观"],
  },
  {
    id: "wander",
    slug: "wander",
    ownerName: "小路",
    ownerInitial: "路",
    title: "漫游路线生成器",
    description: "给我 40 分钟，带你绕开熟悉的街道。",
    longDescription:
      "输入可用时间、体力和想遇见的东西，漫游会生成一条不追求效率的路线。每条路线只存在一天，走完后会留下声音、照片和一句话。",
    category: "生活方式",
    demoType: "route",
    coverTheme: "blue",
    price: 6,
    likes: 319,
    plays: 4630,
    image:
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=88",
    accent: "#92c6ef",
    release: "v0.9 · 5 小时前",
    tags: ["城市", "路线", "随机性"],
  },
  {
    id: "typewave",
    slug: "typewave",
    official: true,
    ownerName: "Niko",
    ownerInitial: "N",
    title: "字浪排版实验室",
    description: "用节奏控制字距、重量与呼吸。",
    longDescription:
      "字浪是一件给文字工作者的可玩工具。你可以像调声音一样调字体，让一段文字产生速度、停顿和重音，再导出为海报或动态片段。",
    category: "互动体验",
    demoType: "type",
    coverTheme: "coral",
    price: 9,
    likes: 577,
    plays: 7914,
    image:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=88",
    accent: "#d8b46a",
    release: "v2.2 · 昨天",
    tags: ["排版", "动效", "创作工具"],
  },
  {
    id: "loops",
    slug: "loops",
    ownerName: "阿声",
    ownerInitial: "声",
    title: "四拍 Loop 厨房",
    description: "把窗外的声音切成一段可以分享的节拍。",
    longDescription:
      "录下十秒环境声，Loop 厨房会自动切出四个可用片段。用户可以调换顺序、速度和密度，在一分钟内做出一段属于当下地点的声音明信片。",
    category: "声音影像",
    demoType: "mix",
    coverTheme: "yellow",
    price: 12,
    likes: 264,
    plays: 3810,
    image:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=88",
    accent: "#f1ca51",
    release: "v1.1 · 3 天前",
    tags: ["采样", "节拍", "声音明信片"],
  },
  {
    id: "sprout",
    slug: "sprout",
    ownerName: "松果工作室",
    ownerInitial: "松",
    title: "阳台芽点日志",
    description: "轻量记录光照、浇水和每一片新叶。",
    longDescription:
      "芽点不要求连续打卡。每次拍照后，它会把叶片变化、天气和你的文字叠在一条生长时间线上，让照顾植物变成一份缓慢积累的共同记忆。",
    category: "效率工具",
    demoType: "tracker",
    coverTheme: "ink",
    price: 4,
    likes: 186,
    plays: 2140,
    image:
      "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=88",
    accent: "#171816",
    release: "v0.6 · 6 天前",
    tags: ["植物", "记录", "时间线"],
  },
  {
    id: "minute",
    slug: "minute",
    ownerName: "西米",
    ownerInitial: "西",
    title: "一分钟小剧场",
    description: "把今天最普通的一句话变成一场微型演出。",
    longDescription:
      "输入一句真实发生过的话，系统会为它生成角色、灯光、停顿和舞台调度。作品可以被其他人重新演绎，形成同一句话的不同版本。",
    category: "互动体验",
    demoType: "stage",
    coverTheme: "coral",
    price: 8,
    likes: 431,
    plays: 5260,
    image:
      "https://images.unsplash.com/photo-1507924538820-ede94a04019d?auto=format&fit=crop&w=1200&q=88",
    accent: "#ff5c3d",
    release: "v1.4 · 今天",
    tags: ["戏剧", "文字", "共创"],
  },
];

export const posts: CommunityPost[] = [
  {
    id: "post-1",
    ownerName: "贺千",
    ownerInitial: "贺",
    role: "独立开发者",
    content: "把产品里最漂亮但没人用的页面删掉以后，核心体验反而更清楚了。今晚发第 7 个版本。",
    createdAt: "18 分钟前",
    likes: 96,
    comments: 18,
    color: "coral",
    productSlug: "typewave",
  },
  {
    id: "post-2",
    ownerName: "听筒",
    ownerInitial: "听",
    role: "声音采集者",
    content: "正在收集城市里不被注意的声音：卷帘门、早班公交、雨棚。已经有 43 段，准备做成一张可玩的地图。",
    createdAt: "1 小时前",
    likes: 141,
    comments: 27,
    color: "blue",
    image:
      "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1400&q=85",
  },
  {
    id: "post-3",
    ownerName: "王不慢",
    ownerInitial: "王",
    role: "工具作者",
    content: "新版本不再替用户安排所有事情，只在真正卡住的时候出现。克制比聪明难得多。",
    createdAt: "3 小时前",
    likes: 74,
    comments: 11,
    color: "yellow",
    productSlug: "sprout",
  },
];

export const circles = [
  { slug: "indie", name: "独立开发", members: 8420, online: 312, color: "coral", topic: "本周大家删掉了什么功能？" },
  { slug: "sound", name: "声音实验", members: 3180, online: 86, color: "blue", topic: "一分钟环境采样接龙" },
  { slug: "tiny-games", name: "小型游戏", members: 6840, online: 229, color: "yellow", topic: "只有一个按钮的游戏" },
  { slug: "life", name: "生活发明", members: 4210, online: 143, color: "mint", topic: "让等待变得没那么像浪费" },
  { slug: "type", name: "字与界面", members: 2570, online: 64, color: "ink", topic: "中文界面的呼吸感" },
  { slug: "open-source", name: "开源小队", members: 1920, online: 51, color: "blue", topic: "这个周末一起补文档" },
];

export const challenges = [
  { id: "waiting", title: "为“等候”做一件东西", brief: "把等车、加载、排队或等待回复，变成一种值得经历的时间。", participants: 286, prize: 18600, daysLeft: 4, color: "blue" },
  { id: "one-button", title: "只有一个按钮", brief: "不允许菜单，不允许说明书，用一次按下和一次松开讲清整个作品。", participants: 174, prize: 8200, daysLeft: 11, color: "yellow" },
  { id: "night", title: "凌晨两点的工具", brief: "为那些清醒但没有力气的人，做一个足够温柔的小工具。", participants: 93, prize: 6400, daysLeft: 18, color: "coral" },
];

export function findProduct(slug: string) {
  return products.find((product) => product.slug === slug || String(product.id) === slug);
}

export function compactNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
