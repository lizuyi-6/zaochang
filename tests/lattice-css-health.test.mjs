// lattice CSS 健康契约:注释不得吞并规则体。
// 2026-10-01 事故:死规则清理脚本删除 .cj-issue-pill 规则时留下未闭合注释
// `/* "Have an issue?" pill (joined mode) {`,吞掉 .cj-layout(display:flex)直到
// 下一个 */,课程旅程双列布局塌成 block 叠加(线上真实课程页首例暴露;demo 右列为空
// 掩盖了症状)。本测试用忠实状态机扫描全部 lattice CSS:任何注释含 { 即为伤口。
// (注释段作者若真要写带花括号的文字,请改写措辞,不给解析器留歧义。)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const cssDir = fileURLToPath(new URL("../hyperknow-spa/src/", import.meta.url));
const cssFiles = [
  "index.css",
  "styles/variables.css",
  "styles/fonts.css",
  "lattice/shell.css",
  "lattice/mobile.css",
  "lattice/SettingsModal.css",
  "lattice/whiteboard/whiteboard.css",
  "lattice/pages/ChatPage.css",
  "lattice/pages/CourseJourney.css",
  "lattice/pages/CoursesPage.css",
  "lattice/pages/HistoryPage.css",
  "lattice/pages/Home.css",
  "lattice/pages/LearningFeed.css",
  "lattice/pages/MarketplacePage.css",
  "lattice/pages/Onboarding.css",
  "lattice/pages/PlansPage.css",
  "lattice/pages/SignIn.css",
];

function commentWounds(css) {
  const wounds = [];
  let i = 0;
  let inComment = false;
  let cstart = 0;
  while (i < css.length) {
    if (!inComment && css.startsWith("/*", i)) {
      inComment = true;
      cstart = i;
      i += 2;
      continue;
    }
    if (inComment && css.startsWith("*/", i)) {
      const seg = css.slice(cstart, i);
      if (seg.includes("{")) {
        wounds.push({ line: css.slice(0, cstart).split("\n").length, braceCount: seg.split("{").length - 1 });
      }
      inComment = false;
      i += 2;
      continue;
    }
    i += 1;
  }
  return wounds;
}

test("lattice CSS:注释不得包含花括号(防规则被注释吞并)", () => {
  for (const rel of cssFiles) {
    const css = readFileSync(join(cssDir, rel), "utf8");
    const wounds = commentWounds(css);
    assert.deepEqual(wounds, [], `${rel} 存在吞并规则的注释: ${JSON.stringify(wounds)}`);
  }
});

test("course journey 布局主规则存活(.cj-layout display:flex 不被吞)", () => {
  const css = readFileSync(join(cssDir, "lattice/pages/CourseJourney.css"), "utf8");
  const idx = css.indexOf(".cj-layout {");
  assert.ok(idx > 0, ".cj-layout 规则必须存在");
  // 规则起点到本规则 { 之间不得有未闭合注释
  const before = css.slice(0, idx);
  let inComment = false;
  for (let i = 0; i < before.length; i++) {
    if (!inComment && before.startsWith("/*", i)) { inComment = true; i += 1; continue; }
    if (inComment && before.startsWith("*/", i)) { inComment = false; i += 1; continue; }
  }
  assert.equal(inComment, false, ".cj-layout 选择器不得位于未闭合注释内");
  const body = css.slice(idx, css.indexOf("}", idx));
  assert.match(body, /display:\s*flex/);
});
