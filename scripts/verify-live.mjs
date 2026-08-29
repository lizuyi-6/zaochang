// scripts/verify-live.mjs
// 《Hello System》V1 Freeze 线上冒烟验收。
// 注意: 关键词存在不等于技术正确——本脚本同时校验 HTTP 状态、页面标题、
// 目录节点数、附录F parent 关系与旧 URL 重定向、Canonical API 契约片段与禁用语。
// 阅读进度保护与 D1 正文 hash 由 wrangler d1 侧查询补充验证(见发布清单)。

import https from "node:https";

const BASE = "https://www.aetherstudio.top";
const V = "v=20260829freeze1";

const checks = [
  {
    name: "书主页",
    url: `${BASE}/bookshelf/hello-system?${V}`,
    expectStatus: 200,
    expectIncludes: ["Hello System", "Mini Campus"],
    expectExcludes: ["320 毫秒", "磁盘物理扇区"],
  },
  {
    name: "第02章 (复合类型)",
    url: `${BASE}/bookshelf/hello-system/part-1/02-variables-out-of-control?${V}`,
    expectStatus: 200,
    expectTitle: "第02章",
    expectIncludes: ["平铺变量", "源码语义模型"],
    expectExcludes: ["内存栈帧局部变量表"],
  },
  {
    name: "第47章 (信任边界)",
    url: `${BASE}/bookshelf/hello-system/part-5/47-defensive-validation?${V}`,
    expectStatus: 200,
    expectTitle: "第47章",
    expectIncludes: ["信任边界"],
    expectExcludes: ["前端防君子，后端防小人"],
  },
  {
    name: "第50章 (幂等)",
    url: `${BASE}/bookshelf/hello-system/part-5/50-idempotency-and-repeated-clicks?${V}`,
    expectStatus: 200,
    expectTitle: "第50章",
    expectIncludes: ["幂等"],
    expectExcludes: ["点击瞬间将按钮置为 disabled”叫作 前端防抖"],
  },
  {
    name: "第51章 (原子条件更新)",
    url: `${BASE}/bookshelf/hello-system/part-5/51-cas-and-optimistic-locking?${V}`,
    expectStatus: 200,
    expectTitle: "第51章",
    expectIncludes: ["原子条件更新", "enrolled &lt; capacity|enrolled < capacity"],
  },
  {
    name: "第56章 (旗舰全景)",
    url: `${BASE}/bookshelf/hello-system/part-6/56-full-request-journey?${V}`,
    expectStatus: 200,
    expectTitle: "第56章",
    expectIncludes: ["全景控制流|控制流", "数据形态", "本示例的技术前提"],
    expectExcludes: ["320 毫秒全景透视", "鼠标微动开关", "LSN: 1048500", "永恒不变的底层逻辑"],
  },
  {
    name: "附录F 新稳定 URL (直属书根)",
    url: `${BASE}/bookshelf/hello-system/appx-f-myths-faq?${V}`,
    expectStatus: 200,
    expectTitle: "附录F",
    expectIncludes: ["常见误区"],
  },
  {
    name: "附录F 旧层级 URL 兼容重定向",
    url: `${BASE}/bookshelf/hello-system/part-5/appx-f-myths-faq?${V}`,
    expectRedirectTo: "/bookshelf/hello-system/appx-f-myths-faq",
  },
];

function fetchRaw(url, redirectsRemaining = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && redirectsRemaining === 0) {
        res.resume();
        resolve({ url, statusCode: res.statusCode, location: res.headers.location ?? "", body: "" });
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ url, statusCode: res.statusCode, location: "", body: data }));
    }).on("error", reject);
  });
}

function matchAny(body, pattern) {
  return pattern.split("|").some((p) => body.includes(p));
}

async function run() {
  console.log("================ 线上生产环境实时验收 (V1 Freeze) ================");
  let failures = 0;

  for (const check of checks) {
    const res = await fetchRaw(check.url);
    const problems = [];

    if (check.expectRedirectTo) {
      if (![301, 302, 307, 308].includes(res.statusCode)) {
        problems.push(`期望 3xx 重定向, 实际 HTTP ${res.statusCode}`);
      } else {
        // Next.js redirect() 会把相对路径解析成绝对 URL 写进 Location 头, 两种形态都合法
        let target = res.location.split("?")[0].replace(/\/$/, "");
        if (target.startsWith("http://") || target.startsWith("https://")) {
          target = new URL(target).pathname.replace(/\/$/, "");
        }
        if (target !== check.expectRedirectTo) {
          problems.push(`重定向目标错误: ${res.location}`);
        }
      }
      console.log(`${problems.length === 0 ? "[PASS]" : "[FAIL]"} ${check.name}: HTTP ${res.statusCode} -> ${res.location}`);
    } else {
      if (res.statusCode !== check.expectStatus) problems.push(`HTTP ${res.statusCode}, 期望 ${check.expectStatus}`);
      if (check.expectTitle && !res.body.includes(check.expectTitle)) problems.push(`标题缺少 "${check.expectTitle}"`);
      for (const p of check.expectIncludes ?? []) {
        if (!matchAny(res.body, p)) problems.push(`缺少关键内容: ${p}`);
      }
      for (const p of check.expectExcludes ?? []) {
        if (res.body.includes(p)) problems.push(`存在禁用内容: ${p}`);
      }
      console.log(`${problems.length === 0 ? "[PASS]" : "[FAIL]"} ${check.name}: HTTP ${res.statusCode} (${res.body.length} bytes)`);
    }
    for (const p of problems) console.log(`       - ${p}`);
    failures += problems.length;
  }

  // 目录节点数与 parent 关系: 书主页 TOC 中应恰好出现 77 个非书根节点链接,
  // 附录F 必须以书根直属路径出现, 且不得再出现在 part-5 之下。
  const cover = await fetchRaw(`${BASE}/bookshelf/hello-system?${V}`);
  if (cover.statusCode === 200) {
    const hrefs = [...cover.body.matchAll(/href="\/bookshelf\/hello-system\/([^"?#]+)"/g)]
      .map((m) => decodeURIComponent(m[1]).replace(/\/$/, ""));
    const unique = new Set(hrefs.filter((h) => h.length > 0));
    const problems = [];
    if (unique.size !== 77) problems.push(`TOC 非书根节点数 = ${unique.size}, 期望 77 (全书 78 节点 - 书根)`);
    if (!unique.has("appx-f-myths-faq")) problems.push("附录F 未以书根直属路径出现在目录中");
    if ([...unique].some((h) => h === "part-5/appx-f-myths-faq")) problems.push("附录F 仍挂在 part-5 之下");
    console.log(`${problems.length === 0 ? "[PASS]" : "[FAIL]"} 目录结构: ${unique.size} 个非书根节点`);
    for (const p of problems) console.log(`       - ${p}`);
    failures += problems.length;
  } else {
    console.log(`[FAIL] 书主页目录抓取失败: HTTP ${cover.statusCode}`);
    failures += 1;
  }

  console.log("==================================================================");
  if (failures > 0) {
    console.error(`验收失败: ${failures} 项问题`);
    process.exitCode = 1;
  } else {
    console.log("全部冒烟检查通过。");
  }
}

run();
