export type Product = {
  id: string | number;
  slug?: string;
  official?: boolean;
  founderOwned?: boolean;
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
  pricingModel: "free" | "one_time" | "per_use";
  likes: number;
  plays: number;
  image: string;
  accent: string;
  release: string;
  tags: string[];
};

export const FOUNDER_DISPLAY_NAME = "Abraham Valerio";
export const FOUNDER_INITIAL = "A";

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
    founderOwned: true,
    ownerName: FOUNDER_DISPLAY_NAME,
    ownerInitial: FOUNDER_INITIAL,
    title: "MORI 专注森林",
    description: "把专注时段变成会生长的声音景观。",
    longDescription:
      "MORI 不记录你完成了多少任务，而是把每次不被打断的时间变成一片有天气、有声音、有季节变化的森林。它想让专注不再像自我管理，更像进入一个愿意停留的地方。",
    category: "声音影像",
    demoType: "focus",
    coverTheme: "mint",
    price: 0,
    pricingModel: "free",
    likes: 0,
    plays: 0,
    image:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=88",
    accent: "#b9ecc8",
    release: "可直接体验",
    tags: ["专注", "声音", "生成景观"],
  },
  {
    id: "wander",
    slug: "wander",
    founderOwned: true,
    ownerName: FOUNDER_DISPLAY_NAME,
    ownerInitial: FOUNDER_INITIAL,
    title: "漫游路线生成器",
    description: "给我 40 分钟，带你绕开熟悉的街道。",
    longDescription:
      "输入可用时间、体力和想遇见的东西，漫游会生成一条不追求效率的路线。每条路线只存在一天，走完后会留下声音、照片和一句话。",
    category: "生活方式",
    demoType: "route",
    coverTheme: "blue",
    price: 0,
    pricingModel: "free",
    likes: 0,
    plays: 0,
    image:
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=88",
    accent: "#92c6ef",
    release: "可直接体验",
    tags: ["城市", "路线", "随机性"],
  },
  {
    id: "typewave",
    slug: "typewave",
    official: true,
    founderOwned: true,
    ownerName: FOUNDER_DISPLAY_NAME,
    ownerInitial: FOUNDER_INITIAL,
    title: "字浪排版实验室",
    description: "用节奏控制字距、重量与呼吸。",
    longDescription:
      "字浪是一件给文字工作者的可玩工具。你可以像调声音一样调字体，让一段文字产生速度、停顿和重音，再导出为海报或动态片段。",
    category: "互动体验",
    demoType: "type",
    coverTheme: "coral",
    price: 0,
    pricingModel: "free",
    likes: 0,
    plays: 0,
    image:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=88",
    accent: "#d8b46a",
    release: "造场官方 · 可直接体验",
    tags: ["排版", "动效", "创作工具"],
  },
  {
    id: "loops",
    slug: "loops",
    founderOwned: true,
    ownerName: FOUNDER_DISPLAY_NAME,
    ownerInitial: FOUNDER_INITIAL,
    title: "四拍 Loop 厨房",
    description: "把窗外的声音切成一段可以分享的节拍。",
    longDescription:
      "录下十秒环境声，Loop 厨房会自动切出四个可用片段。用户可以调换顺序、速度和密度，在一分钟内做出一段属于当下地点的声音明信片。",
    category: "声音影像",
    demoType: "mix",
    coverTheme: "yellow",
    price: 0,
    pricingModel: "free",
    likes: 0,
    plays: 0,
    image:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=88",
    accent: "#f1ca51",
    release: "可直接体验",
    tags: ["采样", "节拍", "声音明信片"],
  },
  {
    id: "sprout",
    slug: "sprout",
    founderOwned: true,
    ownerName: FOUNDER_DISPLAY_NAME,
    ownerInitial: FOUNDER_INITIAL,
    title: "阳台芽点日志",
    description: "轻量记录光照、浇水和每一片新叶。",
    longDescription:
      "芽点不要求连续打卡。每次拍照后，它会把叶片变化、天气和你的文字叠在一条生长时间线上，让照顾植物变成一份缓慢积累的共同记忆。",
    category: "效率工具",
    demoType: "tracker",
    coverTheme: "ink",
    price: 0,
    pricingModel: "free",
    likes: 0,
    plays: 0,
    image:
      "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=88",
    accent: "#171816",
    release: "可直接体验",
    tags: ["植物", "记录", "时间线"],
  },
  {
    id: "minute",
    slug: "minute",
    founderOwned: true,
    ownerName: FOUNDER_DISPLAY_NAME,
    ownerInitial: FOUNDER_INITIAL,
    title: "一分钟小剧场",
    description: "把今天最普通的一句话变成一场微型演出。",
    longDescription:
      "输入一句真实发生过的话，系统会为它生成角色、灯光、停顿和舞台调度。作品可以被其他人重新演绎，形成同一句话的不同版本。",
    category: "互动体验",
    demoType: "stage",
    coverTheme: "coral",
    price: 0,
    pricingModel: "free",
    likes: 0,
    plays: 0,
    image:
      "https://images.unsplash.com/photo-1507924538820-ede94a04019d?auto=format&fit=crop&w=1200&q=88",
    accent: "#ff5c3d",
    release: "可直接体验",
    tags: ["戏剧", "文字", "共创"],
  },
];

export const circles = [
  { slug: "indie", name: "独立开发", color: "coral", topic: "本周大家删掉了什么功能？" },
  { slug: "sound", name: "声音实验", color: "blue", topic: "一分钟环境采样接龙" },
  { slug: "tiny-games", name: "小型游戏", color: "yellow", topic: "只有一个按钮的游戏" },
  { slug: "life", name: "生活发明", color: "mint", topic: "让等待变得没那么像浪费" },
  { slug: "type", name: "字与界面", color: "ink", topic: "中文界面的呼吸感" },
  { slug: "open-source", name: "开源小队", color: "blue", topic: "这个周末一起补文档" },
];

export const challenges = [
  { id: "waiting", title: "为“等候”做一件东西", brief: "把等车、加载、排队或等待回复，变成一种值得经历的时间。", color: "blue" },
  { id: "one-button", title: "只有一个按钮", brief: "不允许菜单，不允许说明书，用一次按下和一次松开讲清整个作品。", color: "yellow" },
  { id: "night", title: "凌晨两点的工具", brief: "为那些清醒但没有力气的人，做一个足够温柔的小工具。", color: "coral" },
];

export function findProduct(slug: string) {
  return products.find((product) => product.slug === slug || String(product.id) === slug);
}

export function compactNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
