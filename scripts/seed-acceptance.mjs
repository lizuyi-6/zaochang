// 一次性本地种子脚本:用 TRUST_OAI_IDENTITY_HEADERS 身份头通过真实 API 造验收数据。

const BASE = "http://localhost:3000";
const ADMIN = "preview@zaochang.test";
const CREATOR = "creator@zaochang.test";
const VISITOR = "visitor@zaochang.test";

function headers(name, email, json = true) {
  const h = {
    "oai-authenticated-user-email": email,
    "oai-authenticated-user-full-name": encodeURIComponent(name),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
  if (json) {
    h["content-type"] = "application/json";
    h["accept"] = "application/json";
  }
  return h;
}

async function call(method, path, who, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: headers(who.name, who.email),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const admin = { name: "验收管理员", email: ADMIN };
const creator = { name: "验收创作者", email: CREATOR };
const visitor = { name: "验收访客", email: VISITOR };

// 1. 三个产品(三种定价模式)→ 逐一预审批准
const products = [
  { title: "回声花园", description: "把一段旋律种进虚拟花园, plants 会随音符生长、开花、结果。", category: "互动体验", coverTheme: "green", pricingModel: "free", price: 0 },
  { title: "边界天气台", description: "把窗外天气转换成一段可操作的声音与颜色体验,支持逐日回放与分享。", category: "互动体验", coverTheme: "blue", pricingModel: "one_time", price: 5 },
  { title: "碎片修理工坊", description: "每天十分钟,把散落的文字碎片拼成一件小型机械装置,按次体验。", category: "生活方式", coverTheme: "amber", pricingModel: "per_session", price: 1 },
];
const ids = [];
for (const p of products) {
  const r = await call("POST", "/api/products", creator, p);
  ids.push(r.product.id);
  console.log("product created:", r.product.id, r.product.title, r.product.status);
}
for (const id of ids) {
  const r = await call("PATCH", "/api/admin/moderation", admin, { action: "approve_product", targetRef: String(id), note: "平台预审确认产品说明与体验入口符合发布要求。" });
  console.log("approved:", r.productId, r.reviewStatus);
}

// 2. 创作者两条帖子(不同类型)
const posts = [
  { content: "回声花园上线了:把旋律种进花园,看着它开花。欢迎来体验!", postType: "版本发布" },
  { content: "招一位音效共创伙伴,负责碎片修理工坊的机械音色设计,有意思的来圈子聊聊。", postType: "共创招募" },
];
for (const p of posts) {
  const r = await call("POST", "/api/actions", creator, { action: "post", ...p });
  console.log("post created:", r.post.id);
}

// 3. 访客点赞产品 + 帖子,给创作者打赏 → 产生通知
await call("POST", "/api/actions", visitor, { action: "like", productId: ids[0] });
await call("POST", "/api/actions", visitor, { action: "check_in" });
const tip = await call("POST", "/api/actions", visitor, { action: "tip", productId: ids[0], amount: 5, idempotencyKey: "seed_tip_001" });
console.log("tip:", JSON.stringify(tip).slice(0, 120));

// 4. 访客创建收藏夹并加入产品
const col = await call("POST", "/api/actions", visitor, { action: "create_collection", name: "周末玩什么", description: "收藏一些慢节奏的小体验" });
console.log("collection:", JSON.stringify(col).slice(0, 160));
await call("POST", "/api/actions", visitor, { action: "add_to_collection", collectionId: col.collection?.id ?? col.id, productId: ids[0] });

// 5. 创作者注册开发者 OAuth 客户端
const client = await call("POST", "/api/developer/clients", creator, { name: "回声花园外部站", redirectUris: "https://echo.example.com/callback", scopes: "openid profile fruit:pay" });
console.log("client:", JSON.stringify(client).slice(0, 200));

// 6. 创作者提交孵化申请
const app = await call("POST", "/api/incubation", creator, { name: "回声花园 · 声音生态计划", projectType: "互动体验", oneLiner: "把城市声音变成可种植的花园生态", problem: "城市人缺少放松的声音场景", progress: "已上线第一个版本", team: "两人小队", need: "音色设计共创", contact: "creator@zaochang.test" });
console.log("incubation:", JSON.stringify(app).slice(0, 200));

console.log("PRODUCT_IDS=" + ids.join(","));
