export type GalaxyId = "origo" | "mnemora" | "miralume" | "antevera";

export type PlanetId =
  | "aurelia"
  | "nyx"
  | "caelum"
  | "solenne"
  | "talaman"
  | "merivel"
  | "eidora"
  | "neravia"
  | "arbor-null"
  | "novaia"
  | "peregris"
  | "chronara";

export type TargetId = "singularity" | PlanetId;

export type OrbitConfig = {
  radiusX: number;
  radiusZ: number;
  tilt: number;
  phase: number;
  speed: number;
  color: number;
  opacity: number;
};

export type PlanetVisual = {
  radius: number;
  geometry: "sphere" | "crystal";
  colorA: number;
  colorB: number;
  glow: number;
  atmosphere: number;
  seed: number;
  pattern: number;
  ringColor?: number;
  ringScale?: number;
  ringTilt?: [number, number, number];
  moons?: number;
};

export type PlanetStory = {
  id: PlanetId;
  galaxyId: GalaxyId;
  index: string;
  name: string;
  type: string;
  chapter: string;
  title: string;
  body: string;
  coda: string;
  archiveTitle: string;
  archive: [string, string];
  lightAge: string;
  epoch: string;
  distance: string;
  accent: string;
  cameraOffset: [number, number, number];
  focusOffset: [number, number, number];
  mobileCameraOffset: [number, number, number];
  mobileFocusOffset: [number, number, number];
  orbit: OrbitConfig;
  visual: PlanetVisual;
};

export const SINGULARITY = {
  id: "singularity" as const,
  index: "00",
  name: "THE WITNESS WELL",
  type: "CENTRAL SINGULARITY",
  chapter: "界外纪",
  title: "我们在奇点之外，为尚未诞生的世界命名",
  body: "杭州视界奇点科技相信，技术不是答案的终点，而是想象获得引力的方式。观渊折叠距离，见界环保存文明未能说完的疑问；每一颗星，都是一个仍可进入的世界。",
  coda: "看见不是占有。每一束抵达眼睛的光，都已经替它的故乡活过漫长的一生。",
  lightAge: "不可丈量",
  epoch: "BEYOND THE HORIZON",
  distance: "HORIZON CROWN",
  accent: "#d7b77f",
};

export const GALAXIES: Array<{
  id: GalaxyId;
  index: string;
  name: string;
  latin: string;
  thesis: string;
  accent: string;
  position: [number, number, number];
}> = [
  { id: "origo", index: "01", name: "源光", latin: "ORIGO", thesis: "光从孤独出发，文明靠共同想象抵达彼此。", accent: "#b88961", position: [17, 0.2, 2.4] },
  { id: "mnemora", index: "02", name: "忆潮", latin: "MNEMORA", thesis: "过去并未消失，只是学会以地貌说话。", accent: "#c49a6c", position: [-2.2, 1.1, 17.1] },
  { id: "miralume", index: "03", name: "镜梦", latin: "MIRALUME", thesis: "名字与梦也有质量，它们会改变天气。", accent: "#8da8d9", position: [-17.2, -0.8, -2.1] },
  { id: "antevera", index: "04", name: "未至", latin: "ANTEVERA", thesis: "来自这里的光，仿佛总比事件更早抵达。", accent: "#8ebca9", position: [2.4, 1.2, -17.2] },
];

const camera = {
  desktop: [5.2, 2.7, 10.8] as [number, number, number],
  focus: [-2.25, -0.05, 0] as [number, number, number],
  mobile: [0.3, 3.1, 11.4] as [number, number, number],
  mobileFocus: [0, -0.1, 0] as [number, number, number],
};

export const PLANETS: PlanetStory[] = [
  {
    id: "aurelia", galaxyId: "origo", index: "01.1", name: "AURELIA", type: "RING GIANT", chapter: "起源",
    title: "所有光都曾独自出发", body: "在名字、历史和见证者出现以前，恒星已经把漫长的沉默写进宇宙。",
    coda: "我们以为自己在回忆，其实只是旧日的光终于抵达。", lightAge: "38.6 MIN", epoch: "THE FIRST WITNESS", distance: "04.72 AU", accent: "#b88961",
    archiveTitle: "第一位见证者没有名字",
    archive: ["AURELIA 的星环并非尘埃，而是一座缓慢展开的天文档案。每一层环带都保存着一颗早已熄灭的恒星抵达这里时留下的光谱。", "环上的居民终生只负责辨认一种颜色。他们知道自己无法读完宇宙，于是把准确看见一小部分，当作对浩瀚最诚实的回答。"],
    cameraOffset: [6.8, 3.4, 14], focusOffset: [-3.1, -0.15, 0], mobileCameraOffset: [3.2, 3.2, 13.8], mobileFocusOffset: [-0.25, -0.1, 0],
    orbit: { radiusX: 4.7, radiusZ: 3.7, tilt: 0.3, phase: 0.65, speed: 0.009, color: 0x8b665d, opacity: 0.075 },
    visual: { radius: 2.08, geometry: "sphere", colorA: 0x07112f, colorB: 0x4f8fb8, glow: 0x6aa8ca, atmosphere: 0x668eb8, seed: 1.1, pattern: 0.2, ringColor: 0xb8a78f, ringScale: 2.08, moons: 1 },
  },
  {
    id: "nyx", galaxyId: "origo", index: "01.2", name: "NYX", type: "EMBER WORLD", chapter: "造史",
    title: "人类把偶然称为命运", body: "我们用故事组织陌生人，用年代丈量恐惧，再把选择写成仿佛必然的历史。",
    coda: "文明向前，并不代表它知道要去哪里。", lightAge: "67.7 MIN", epoch: "THE SHARED FICTION", distance: "08.13 AU", accent: "#9a6674",
    archiveTitle: "火焰从未承认任何王朝",
    archive: ["NYX 的裂谷每隔七十年重新发光，统治者便宣称那是祖先对自己的认证。直到一名测绘者发现，熔流只是在重复更古老的地质节律。", "真相没有立刻推翻王朝。人们先失去了共同相信的天空，随后才开始艰难地学习：没有神谕，也必须共同决定明天。"],
    cameraOffset: [-3.8, 2.8, 10.4], focusOffset: [-2.4, 0, 0], mobileCameraOffset: [-2.5, 2.8, 10], mobileFocusOffset: [0, -0.1, 0],
    orbit: { radiusX: 7.7, radiusZ: 6.2, tilt: -0.5, phase: 3.65, speed: 0.006, color: 0x4f476d, opacity: 0.055 },
    visual: { radius: 1.06, geometry: "sphere", colorA: 0x080103, colorB: 0x55121a, glow: 0xf04828, atmosphere: 0xc8524c, seed: 2.4, pattern: 1.1, ringColor: 0xb45a4f, ringScale: 1.4 },
  },
  {
    id: "caelum", galaxyId: "origo", index: "01.3", name: "CAELUM", type: "ICE WORLD", chapter: "余响",
    title: "未来先于我们醒来", body: "当记忆可以被保存、预测和重写，真正稀缺的也许不再是答案，而是决定成为什么。",
    coda: "终点不是被计算出来的，它仍等待一次自由的选择。", lightAge: "107.3 MIN", epoch: "BEYOND THE LAST PROPHECY", distance: "12.90 AU", accent: "#6977a8",
    archiveTitle: "冰层保存了所有未被选择的未来",
    archive: ["CAELUM 的晶层会在决定发生前生成相应裂纹。城邦据此消除了灾难，也逐渐不再允许任何无法预测的行动。", "最后一位占卜师砸碎了自己的观测镜。她说，自由并不保证更好的结局，只保证结局仍然属于活着的人。"],
    cameraOffset: [-2.2, 3.3, 10.8], focusOffset: [-2.2, 0, 0], mobileCameraOffset: [0.5, 3, 10.2], mobileFocusOffset: [-0.2, 0, 0],
    orbit: { radiusX: 11, radiusZ: 8.8, tilt: 0.7, phase: 5.75, speed: 0.0045, color: 0x6977a8, opacity: 0.045 },
    visual: { radius: 1.42, geometry: "sphere", colorA: 0x07102f, colorB: 0x6da7c8, glow: 0x72b9ee, atmosphere: 0x8fb9da, seed: 3.6, pattern: 2.2, ringColor: 0x86b6d9, ringScale: 1.3 },
  },
  {
    id: "solenne", galaxyId: "mnemora", index: "02.1", name: "SOLENNE", type: "AMBER TIDE WORLD", chapter: "旧昼",
    title: "所有黄昏都记得一个名字", body: "这里的海水会在日落后复述亡者的口音。居民从不立碑，只把一滴水交给潮汐；千年以后，整颗星球仍在轻声叫他们回家。",
    coda: "被记住并非永生，只是告别终于有了可供后来者辨认的回音。", lightAge: "83 万光年", epoch: "THE TIDE REMEMBERS", distance: "0.83 MLY", accent: "#c89561",
    archiveTitle: "海洋只保留真正说出口的话",
    archive: ["SOLENNE 的潮声不会复述思想，只记得一个人曾向世界说出的句子。因此这里的人在临别前格外谨慎，不愿让最后的话成为怨恨。", "也有人一生沉默，只在黄昏时对海说出自己的名字。数百年后，陌生的孩子仍会从浪里听见他，并相信无人应当彻底消失。"],
    cameraOffset: camera.desktop, focusOffset: camera.focus, mobileCameraOffset: camera.mobile, mobileFocusOffset: camera.mobileFocus,
    orbit: { radiusX: 4.2, radiusZ: 3.4, tilt: 0.35, phase: 0.4, speed: 0.008, color: 0xb58355, opacity: 0.07 },
    visual: { radius: 1.52, geometry: "sphere", colorA: 0x1a0d24, colorB: 0xc28145, glow: 0xf2b66d, atmosphere: 0xd49a63, seed: 4.2, pattern: 0.65, moons: 1 },
  },
  {
    id: "talaman", galaxyId: "mnemora", index: "02.2", name: "TALAMAN", type: "MIGRANT MONUMENT WORLD", chapter: "碑砂",
    title: "历史在风里不断更换作者", body: "碑砂没有王宫，只有会移动的石碑。每当政权宣称自己永恒，沙海便在夜里挪动文字，把英雄移到注脚，把无名者重新放回第一页。",
    coda: "权力热爱刻字，风却坚持为沉默的人留出位置。", lightAge: "91 万光年", epoch: "THE UNWRITTEN FIRST PAGE", distance: "0.91 MLY", accent: "#b78b68",
    archiveTitle: "碑文每夜都向无名者移动",
    archive: ["TALAMAN 的石碑会沿磁场缓慢迁徙。史官试图用锁链固定它们，第二天却发现锁链也成为碑文的一部分，记录下谁害怕历史改变位置。", "后来的人不再修建纪念碑，而是为每个年代留下一片空地。他们说，真正公正的历史必须允许后来者带着新证据走进来。"],
    cameraOffset: camera.desktop, focusOffset: camera.focus, mobileCameraOffset: camera.mobile, mobileFocusOffset: camera.mobileFocus,
    orbit: { radiusX: 6.8, radiusZ: 5.7, tilt: -0.42, phase: 2.7, speed: 0.0058, color: 0x856958, opacity: 0.055 },
    visual: { radius: 1.26, geometry: "crystal", colorA: 0x140c10, colorB: 0x9d6546, glow: 0xe0a77c, atmosphere: 0xb77759, seed: 5.8, pattern: 1.55 },
  },
  {
    id: "merivel", galaxyId: "mnemora", index: "02.3", name: "MERIVEL", type: "SUSPENDED GARDEN WORLD", chapter: "迟雨",
    title: "未来曾以一场旧雨来临", body: "云层里的雨要走三百年才落到地面，因此孩子们种树时从不为自己许愿。他们接住祖先送来的水，也把尚未出生者的春天托回天空。",
    coda: "真正的远见，是替永远见不到的人保留一场雨。", lightAge: "104 万光年", epoch: "RAIN FOR THE UNBORN", distance: "1.04 MLY", accent: "#7ba59d",
    archiveTitle: "每场雨都有两个时代的署名",
    archive: ["MERIVEL 的云园由历代照料者共同维护。播种者不知道雨会落在哪里，收获者也无从感谢最初托起水汽的人。", "他们仍保留一条古老规则：任何一代只能使用一半降水。另一半必须重新送回高空，交给一个尚未出现、也无法回报他们的春天。"],
    cameraOffset: camera.desktop, focusOffset: camera.focus, mobileCameraOffset: camera.mobile, mobileFocusOffset: camera.mobileFocus,
    orbit: { radiusX: 9.4, radiusZ: 8.1, tilt: 0.62, phase: 5.1, speed: 0.0042, color: 0x62877d, opacity: 0.045 },
    visual: { radius: 1.38, geometry: "sphere", colorA: 0x061c2a, colorB: 0x4c9d88, glow: 0x99d9b9, atmosphere: 0x74b9a7, seed: 6.9, pattern: 2.45, ringColor: 0x78bfa9, ringScale: 1.35, ringTilt: [1.18, 0.15, -0.3], moons: 2 },
  },
  {
    id: "eidora", galaxyId: "miralume", index: "03.1", name: "EIDORA", type: "MIRROR ICE WORLD", chapter: "镜眠",
    title: "每个梦都在借用别人的脸", body: "镜眠的冰原会映出观看者没有选择的人生。旅人起初把它当作神谕，后来才明白，那些幸福与悔恨并非预言，只是可能性请求被看见。",
    coda: "自我不是唯一答案，而是无数岔路暂时达成的约定。", lightAge: "463 万光年", epoch: "THE BORROWED FACE", distance: "4.63 MLY", accent: "#8da8d9",
    archiveTitle: "镜面之下没有更正确的人生",
    archive: ["EIDORA 的旅行者常在冰面前停留数年，观看另一个自己拥有不同的爱人、职业和故乡。有人因此幸福，也有人再也无法返回现实。", "守镜人从不劝他们选择哪一边，只会在冰开始融化时提醒：可能性值得被看见，却不能替你承担任何一次真正的生活。"],
    cameraOffset: camera.desktop, focusOffset: camera.focus, mobileCameraOffset: camera.mobile, mobileFocusOffset: camera.mobileFocus,
    orbit: { radiusX: 4.4, radiusZ: 3.6, tilt: -0.28, phase: 1.2, speed: 0.0075, color: 0x7189b0, opacity: 0.07 },
    visual: { radius: 1.4, geometry: "crystal", colorA: 0x090e31, colorB: 0x8ebee0, glow: 0xb5d9f4, atmosphere: 0x91b8e1, seed: 7.7, pattern: 3.25, ringColor: 0xa7c9e5, ringScale: 1.2, ringTilt: [1.3, -0.2, 0.25] },
  },
  {
    id: "neravia", galaxyId: "miralume", index: "03.2", name: "NERAVIA", type: "DRIFT OCEAN WORLD", chapter: "潮生",
    title: "海替没有名字的人保存月光", body: "潮生没有陆地，漂流城每年都推选一位陌生人担任月亮。那个人不发号施令，只在最高处守夜，让迷航者相信远方仍有人醒着。",
    coda: "共同体最初的形状，也许只是黑夜里一盏不熄的灯。", lightAge: "481 万光年", epoch: "THE NAMELESS MOON", distance: "4.81 MLY", accent: "#6f9fb9",
    archiveTitle: "守夜者不需要被所有人认识",
    archive: ["NERAVIA 的月亮不是天体，而是一座由漂流城轮流托举的灯塔。担任月亮的人必须放弃姓名，因为求救者不该先判断灯属于哪个阵营。", "一年后，守夜者回到人群，没有勋章也没有特权。只有远海归来的船会为他留下一盏灯，证明匿名的善意也能拥有漫长回声。"],
    cameraOffset: camera.desktop, focusOffset: camera.focus, mobileCameraOffset: camera.mobile, mobileFocusOffset: camera.mobileFocus,
    orbit: { radiusX: 6.9, radiusZ: 5.8, tilt: 0.48, phase: 3.3, speed: 0.0054, color: 0x547992, opacity: 0.052 },
    visual: { radius: 1.58, geometry: "sphere", colorA: 0x031329, colorB: 0x2b87a2, glow: 0x6dc7d8, atmosphere: 0x5ea9c5, seed: 8.5, pattern: 0.95, moons: 1 },
  },
  {
    id: "arbor-null", galaxyId: "miralume", index: "03.3", name: "ARBOR NULL", type: "HOLLOW FOREST WORLD", chapter: "空枝",
    title: "空缺也会长成一片森林", body: "空枝的树木围绕看不见的树干生长，枝叶共同描出一个巨大的缺席。居民说那是失落的神；植物学家却认为，万物只是需要一个中心来彼此靠近。",
    coda: "有些信仰并非相信存在，而是共同照料一处空白。", lightAge: "502 万光年", epoch: "THE TENDED ABSENCE", distance: "5.02 MLY", accent: "#799c87",
    archiveTitle: "他们共同照料一棵不存在的树",
    archive: ["ARBOR NULL 的森林中心没有物质，所有根系却朝那里弯曲。居民每天为那处空白浇水，并把重要的争论带到树影缺席的地方进行。", "没有人能证明中心曾经存在。但长久的照料让彼此敌对的村落共享了同一片土壤，有时共同维护的空白比确定的神更能使人靠近。"],
    cameraOffset: camera.desktop, focusOffset: camera.focus, mobileCameraOffset: camera.mobile, mobileFocusOffset: camera.mobileFocus,
    orbit: { radiusX: 9.7, radiusZ: 8.4, tilt: -0.66, phase: 5.6, speed: 0.004, color: 0x57745f, opacity: 0.043 },
    visual: { radius: 1.34, geometry: "sphere", colorA: 0x020d0b, colorB: 0x406f55, glow: 0x7fc39b, atmosphere: 0x6f9e7d, seed: 9.9, pattern: 4.15, ringColor: 0x72a686, ringScale: 1.65, ringTilt: [1.08, 0.32, -0.12] },
  },
  {
    id: "novaia", galaxyId: "antevera", index: "04.1", name: "NOVAIA", type: "REVERSE BLOOM WORLD", chapter: "白芽",
    title: "尚未出生者已经开始回望", body: "白芽的生命从未来向过去生长。老人负责播种，婴儿在梦里收获；每一代人都只看见花期的一半，却仍愿意为另一半修建花园。",
    coda: "希望不是确定会抵达，而是愿意给未知留下位置。", lightAge: "731 万光年", epoch: "THE GARDEN BEFORE TIME", distance: "7.31 MLY", accent: "#9fc6b2",
    archiveTitle: "花园先有回忆，后来才有种子",
    archive: ["NOVAIA 的白芽从果实向种子生长。孩子醒来时记得一座尚未建成的花园，老人则按照他们模糊的描述修路、引水、留下空地。", "没有一代见过完整花期，却没有人因此停工。他们相信希望不是提前看见结果，而是愿意让陌生的未来拥有落脚之处。"],
    cameraOffset: camera.desktop, focusOffset: camera.focus, mobileCameraOffset: camera.mobile, mobileFocusOffset: camera.mobileFocus,
    orbit: { radiusX: 4.3, radiusZ: 3.5, tilt: 0.32, phase: 0.9, speed: -0.0072, color: 0x789d8a, opacity: 0.07 },
    visual: { radius: 1.48, geometry: "sphere", colorA: 0x0d2420, colorB: 0xa9d7b7, glow: 0xd9f0cf, atmosphere: 0xa6d3be, seed: 10.8, pattern: 2.85, ringColor: 0xa7d6bd, ringScale: 1.2, moons: 3 },
  },
  {
    id: "peregris", galaxyId: "antevera", index: "04.2", name: "PEREGRIS", type: "ROGUE WORLD", chapter: "无岸",
    title: "没有归宿的星也拥有方向", body: "无岸不环绕任何恒星，只沿见界环缓慢漂流。它的居民拒绝绘制国界，却为每位过客记录来路，因为他们相信方向不必以占有终点为前提。",
    coda: "归属不一定是一块土地，也可以是一群记得你来路的人。", lightAge: "756 万光年", epoch: "THE REMEMBERED ROAD", distance: "7.56 MLY", accent: "#a8b4ad",
    archiveTitle: "一颗流浪星如何保存方向",
    archive: ["PEREGRIS 没有太阳，城市依靠过客带来的星图校准航向。每张图都只记录来路，不标注终点，因为这颗星不会两次经过同一片天空。", "居民告别时从不说留下。他们会说：若有一天你忘记自己从哪里出发，这里仍有人替你保存那段方向。"],
    cameraOffset: camera.desktop, focusOffset: camera.focus, mobileCameraOffset: camera.mobile, mobileFocusOffset: camera.mobileFocus,
    orbit: { radiusX: 7.1, radiusZ: 6, tilt: -0.5, phase: 3.7, speed: -0.005, color: 0x68756f, opacity: 0.05 },
    visual: { radius: 1.2, geometry: "sphere", colorA: 0x020506, colorB: 0x35413d, glow: 0xc6c9b2, atmosphere: 0x8d9e96, seed: 11.6, pattern: 1.85 },
  },
  {
    id: "chronara", galaxyId: "antevera", index: "04.3", name: "CHRONARA", type: "TWILIGHT CRYSTAL WORLD", chapter: "终钟",
    title: "末日只是尺度更大的清晨", body: "终钟的核心每隔千年敲响一次，预告恒星剩余的呼吸。居民从不逃亡，他们把城市拆成种子送向宇宙，并将最后一座钟留给无人抵达的黎明。",
    coda: "文明的反面不是消失，而是不再把未来托付给任何人。", lightAge: "788 万光年", epoch: "THE BELL STILL TRAVELS", distance: "7.88 MLY", accent: "#c3b48a",
    archiveTitle: "最后一座城被拆成了种子",
    archive: ["CHRONARA 的钟声每次响起，城市便主动拆除一条街，把材料制成携带文字、作物与音乐的航行种子。居民知道大多数种子永远不会抵达。", "最后留下的人没有建造纪念碑。他们只校准那座面向空无的钟，因为文明最后的尊严，不是被未来记住，而是仍愿意把未来交出去。"],
    cameraOffset: camera.desktop, focusOffset: camera.focus, mobileCameraOffset: camera.mobile, mobileFocusOffset: camera.mobileFocus,
    orbit: { radiusX: 9.8, radiusZ: 8.5, tilt: 0.7, phase: 5.8, speed: -0.0038, color: 0x8a8068, opacity: 0.042 },
    visual: { radius: 1.42, geometry: "crystal", colorA: 0x17120b, colorB: 0xb5a064, glow: 0xf0dda0, atmosphere: 0xc4b887, seed: 12.9, pattern: 3.75, ringColor: 0xd3c28c, ringScale: 1.45, ringTilt: [1.2, -0.12, 0.36] },
  },
];

export const PLANETS_BY_GALAXY = Object.fromEntries(
  GALAXIES.map((galaxy) => [galaxy.id, PLANETS.filter((planet) => planet.galaxyId === galaxy.id)]),
) as Record<GalaxyId, PlanetStory[]>;

export const PLANET_BY_ID = Object.fromEntries(
  PLANETS.map((planet) => [planet.id, planet]),
) as Record<PlanetId, PlanetStory>;
