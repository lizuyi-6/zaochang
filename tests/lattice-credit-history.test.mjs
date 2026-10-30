// 见界积分契约：顶栏与白板不自行造数,MAX 每日额度跟随后端 TIER_CONFIG。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, "utf8");

test("lattice credits: whiteboard completion does not locally deduct, header only shows server balance", () => {
  const whiteboard = read("hyperknow-spa/src/lattice/whiteboard/WhiteboardPage.tsx");
  assert.doesNotMatch(whiteboard, /nextEnergy|current\s*-\s*5|credits:\s*nextEnergy|energy:\s*nextEnergy/);
  assert.match(whiteboard, /lectureCompletePrompt:\s*true/, "结课仍显示练习提示,但不触碰积分状态");

  const header = read("hyperknow-spa/src/lattice/Header.tsx");
  assert.doesNotMatch(header, /state\.energy|lectureDone\s*\?\s*15\s*:\s*20/);
  assert.match(header, /state\.identity\?\.credits\s*\?\?\s*'—'/, "未知余额显示占位符");
  assert.match(header, /<CreditHistoryModal/, "顶栏积分徽章打开积分记录浮层");

  const onboarding = read("hyperknow-spa/src/lattice/pages/Onboarding.tsx");
  assert.doesNotMatch(onboarding, /<span className="ob-energy">[\s\S]{0,100}>\s*100\s*</, "引导页示意顶栏不伪造用户余额");

  const modal = read("hyperknow-spa/src/lattice/CreditHistoryModal.tsx");
  assert.match(modal, /changes since credit history started/, "弹层说明流水从启用后开始,避免暗示回填旧记录");
  assert.match(modal, /Loading credit history/, "记录弹层有加载态");
  assert.match(modal, /No credit changes yet/, "记录弹层有空态");
  assert.match(modal, /role="alert"/, "记录弹层对加载失败提供错误态");

  const types = read("hyperknow-spa/src/lattice/types.ts");
  assert.match(types, /\{ id: 'MAX', price: 29, creditsPerDay: 500 \}/, "MAX 每日额度必须与后端 TIER_CONFIG.MAX 对齐");
  assert.doesNotMatch(types, /energy:\s*15/, "初始状态不得给出编造余额");
});
