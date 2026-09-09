// 独立纯 Node 回归测试；使用 --experimental-strip-types 直接加载 TS，不启动浏览器或 Wrangler。
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDiagram } from "../hyperknow-spa/src/replica/whiteboard/diagram.ts";

function nodeBoxes(code) {
  const rendered = renderDiagram(code);
  assert.ok(rendered, "分叉汇合图应成功渲染");
  const paths = [...rendered.svg.matchAll(/<path d="([^"]+)" fill="#FDFDFB"/g)];
  assert.equal(paths.length, 4, "应有四个节点框，不包括边和箭头");
  return paths.map(([, path]) => {
    // 矩形四边的 Q 控制点不带随机抖动；由其固定 1.5px 外扩还原布局包围盒。
    // 从实际 SVG 取几何，不复制标签尺寸或布局算法。
    const controls = [...path.matchAll(/Q\s+([-\d.]+)\s+([-\d.]+)/g)]
      .map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
    assert.equal(controls.length, 5);
    const box = {
      left: controls[3].x + 1.5,
      top: controls[0].y + 1.5,
      right: controls[1].x - 1.5,
      bottom: controls[2].y - 1.5,
    };
    assert.ok(Object.values(box).every(Number.isFinite));
    assert.ok(box.right > box.left && box.bottom > box.top);
    assert.ok(box.left >= 0 && box.top >= 0);
    assert.ok(box.right <= rendered.w && box.bottom <= rendered.h);
    return box;
  });
}

function assertNoOverlap(boxes) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      assert.ok(
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
        `节点 ${i} 与 ${j} 的包围盒重叠: ${JSON.stringify({ a, b })}`,
      );
    }
  }
}

test("diagram TD: 异宽分叉汇合节点不重叠，同层纵向居中且保留层间距", () => {
  const boxes = nodeBoxes(`flowchart TD
A[root] --> B[b]
A --> C[This branch is very wide]
B --> D[This merge is also wide]
C --> D`);
  const [root, narrow, wide, merge] = boxes;
  assert.ok(wide.right - wide.left > narrow.right - narrow.left);
  assertNoOverlap(boxes);
  assert.equal(narrow.top + narrow.bottom, wide.top + wide.bottom);
  for (const branch of [narrow, wide]) {
    assert.ok(branch.top - root.bottom >= 60, "分叉前保留 TD 层间距");
    assert.ok(merge.top - branch.bottom >= 60, "汇合前保留 TD 层间距");
  }
});

test("diagram LR: 异高分叉汇合节点不重叠，同层横向居中且保留层间距", () => {
  const boxes = nodeBoxes(`flowchart LR
A[root] --> B[b]
A --> C[c<br>c<br>c<br>c]
B --> D[end]
C --> D`);
  const [root, short, tall, merge] = boxes;
  assert.ok(tall.bottom - tall.top > short.bottom - short.top);
  assertNoOverlap(boxes);
  // 高度差产生的错误 x 偏移可能尚不足以重叠，仍必须捕获居中和间距回归。
  assert.equal(short.left + short.right, tall.left + tall.right);
  for (const branch of [short, tall]) {
    assert.ok(branch.left - root.right >= 44, "分叉前保留 LR 层间距");
    assert.ok(merge.left - branch.right >= 44, "汇合前保留 LR 层间距");
  }
});
