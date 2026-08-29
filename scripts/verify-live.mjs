// scripts/verify-live.mjs
import https from "node:https";

const urls = [
  "https://www.aetherstudio.top/bookshelf/hello-system?v=20260829expanded",
  "https://www.aetherstudio.top/bookshelf/hello-system/part-1/02-variables-out-of-control?v=20260829expanded",
  "https://www.aetherstudio.top/bookshelf/hello-system/part-5/47-defensive-validation?v=20260829expanded",
  "https://www.aetherstudio.top/bookshelf/hello-system/part-5/50-idempotency-and-repeated-clicks?v=20260829expanded",
  "https://www.aetherstudio.top/bookshelf/hello-system/part-5/51-cas-and-optimistic-locking?v=20260829expanded",
  "https://www.aetherstudio.top/bookshelf/hello-system/part-6/56-full-request-journey?v=20260829expanded"
];

async function checkUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        resolve({ url, statusCode: res.statusCode, length: data.length, body: data });
      });
    }).on("error", reject);
  });
}

async function run() {
  console.log("================ 线上生产环境实时验收 ================");
  for (const url of urls) {
    const res = await checkUrl(url);
    console.log(`[LIVE HTTP ${res.statusCode}] ${res.url} (${res.length} bytes)`);

    if (url.includes("hello-system?")) {
      const hasOld320 = res.body.includes("320 毫秒");
      const hasOldSector = res.body.includes("磁盘物理扇区");
      console.log(`  -> 首页: 包含旧版"320 毫秒": ${hasOld320}, 包含旧版"磁盘物理扇区": ${hasOldSector}`);
    }
    if (url.includes("02-variables")) {
      const hasStage = res.body.includes("11 阶段") || res.body.includes("平铺变量到复合数据类型");
      console.log(`  -> 第02章: 包含 11 阶段深度推导: ${hasStage}`);
    }
    if (url.includes("47-defensive")) {
      const hasTrust = res.body.includes("信任边界");
      const hasOldFluff = res.body.includes("前端防君子，后端防小人");
      console.log(`  -> 第47章: 包含"信任边界": ${hasTrust}, 包含旧口号"前端防君子": ${hasOldFluff}`);
    }
    if (url.includes("50-idempotency")) {
      const hasGuard = res.body.includes("In-Flight Guard") || res.body.includes("防重复提交保护");
      const hasOldDebounce = res.body.includes("点击瞬间将按钮置为 disabled”叫作 前端防抖");
      console.log(`  -> 第50章: 包含"In-Flight Guard": ${hasGuard}, 包含错误防抖表述: ${hasOldDebounce}`);
    }
    if (url.includes("51-cas")) {
      const hasAtomic = res.body.includes("原子条件更新");
      console.log(`  -> 第51章: 包含"原子条件更新": ${hasAtomic}`);
    }
    if (url.includes("56-full-request")) {
      const hasJourney = res.body.includes("全景控制流") || res.body.includes("数据形态演变");
      const hasOld320 = res.body.includes("320 毫秒全景透视");
      console.log(`  -> 第56章: 包含三重视角全景: ${hasJourney}, 包含旧版"320 毫秒全景透视": ${hasOld320}`);
    }
  }
  console.log("======================================================");
}

run();
