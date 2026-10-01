// 见界导师回复富文本解析契约(markup.ts)。
// 后端 prompt 契约 = Markdown + <div content-section> 容器 + <diagram> 标签 + 数学;
// 前端唯一渲染通道是本解析器 → React 元素(绝无 HTML 字符串拼接)。
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMarkup, markupToPlain } from '../hyperknow-spa/src/lattice/markup.ts';

test('content-section 容器解析为 section 区块,内部 p/ul/li/strong 分层', () => {
  const blocks = parseMarkup(
    '<div content-section="important_takeaways"><p><strong>核心结论:</strong>景深变浅。</p><ul><li><strong>大光圈:</strong>景深浅</li></ul></div>',
  );
  assert.equal(blocks.length, 1);
  const sec = blocks[0];
  assert.equal(sec.kind, 'section');
  assert.equal(sec.section, 'important_takeaways');
  assert.equal(sec.blocks.length, 2);
  const [p, list] = sec.blocks;
  assert.equal(p.kind, 'p');
  assert.deepEqual(
    p.inlines.map((i) => [i.text, i.bold === true]),
    [['核心结论:', true], ['景深变浅。', false]],
  );
  assert.equal(list.kind, 'list');
  assert.equal(list.ordered, false);
  assert.equal(list.items[0][0].text, '大光圈:');
  assert.equal(list.items[0][0].bold, true);
  assert.equal(list.items[0][1].text, '景深浅');
  assert.equal(list.items[0][1].bold, undefined);
});

test('Markdown 区块:标题/列表/加粗/行内码/围栏代码/引用/有序列表', () => {
  const md = [
    '### 延伸阅读',
    '- 记住 `f 值倒数` 口诀',
    '- **曝光三角** 相互制约',
    '',
    '> 提示:先练构图',
    '',
    '```python',
    'print("hi")',
    '```',
    '',
    '1. 第一步',
    '2. 第二步',
  ].join('\n');
  const blocks = parseMarkup(md);
  assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'list', 'quote', 'code', 'list']);
  assert.equal(blocks[0].level, 3);
  const list = blocks[1];
  assert.equal(list.items[0][1].code, true);
  assert.equal(list.items[0][1].text, 'f 值倒数');
  assert.equal(list.items[1][0].bold, true);
  assert.equal(blocks[3].lang, 'python');
  assert.equal(blocks[3].text, 'print("hi")');
  assert.equal(blocks[4].ordered, true);
  assert.equal(blocks[4].items.length, 2);
});

test('diagram 标签只留元数据,mermaid/公式源码不上屏', () => {
  const blocks = parseMarkup(
    '<diagram data-subtype="mermaid" data-layout="block" data-caption="流程">\n```mermaid\ngraph TD\n  A-->B\n```\n</diagram>',
  );
  assert.deepEqual(blocks, [{ kind: 'diagram', subtype: 'mermaid', caption: '流程' }]);
});

test('容器外的零散标签降级为 Markdown 记号(<p>/<strong>/<br>)', () => {
  const blocks = parseMarkup('段一<p>段二 <strong>加粗</strong> 收尾<br>换行');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'p');
  assert.equal(blocks[1].kind, 'p');
  assert.equal(blocks[1].inlines.some((i) => i.bold && i.text === '加粗'), true);
});

test('未知/危险标签丢弃标签本身,内部文本仍以纯文本节点存在(无 HTML 拼接通道)', () => {
  const plain = markupToPlain('前<script>alert(1)</script>后');
  assert.equal(plain, '前alert(1)后');
  assert.doesNotMatch(plain, /<script>/);
});

test('流式半截:结尾未闭合的 "<div content-sec" 被吞,未闭合容器按已有内容即席闭合', () => {
  assert.deepEqual(parseMarkup('前文 <div content-sec'), [{ kind: 'p', inlines: [{ text: '前文 ' }] }]);
  const partial = parseMarkup('<div content-section="definition"><p>定义中');
  assert.equal(partial[0].kind, 'section');
  assert.equal(partial[0].section, 'definition');
  assert.equal(partial[0].blocks[0].inlines[0].text, '定义中');
});

test('数学:$..$ 行内作 math 片段,$$..$$ 独立成块', () => {
  const blocks = parseMarkup('光圈 $N=2$ 与\n\n$$DOF \\approx 2Nc$$');
  assert.equal(blocks[0].kind, 'p');
  assert.equal(blocks[0].inlines[1].math, true);
  assert.equal(blocks[0].inlines[1].text, 'N=2');
  assert.equal(blocks[1].kind, 'math');
  assert.equal(blocks[1].text, 'DOF \\approx 2Nc');
});

test('链接只放行 http(s)/mailto/相对路径,javascript: 降级为纯文本', () => {
  const ok = parseMarkup('[文档](https://example.com/a)')[0].inlines[0];
  assert.equal(ok.link, 'https://example.com/a');
  const bad = parseMarkup('[点我](javascript:alert(1))')[0].inlines[0];
  assert.equal(bad.link, undefined);
  assert.equal(bad.text, '点我');
});

test('实体解码一次到位(&amp;lt; 不二次解码)', () => {
  assert.equal(markupToPlain('A &amp; B &lt;tag&gt;'), 'A & B <tag>');
  assert.equal(markupToPlain('&amp;lt;'), '&lt;');
});

test('markupToPlain:结构转行,标记全剥(供 TTS/复制)', () => {
  const plain = markupToPlain(
    '导语**加粗**。\n\n<div content-section="key_points"><ul><li>点一</li><li>点二</li></ul></div>\n\n<diagram data-subtype="desmos" data-caption="曲线"></diagram>',
  );
  assert.equal(plain, '导语加粗。\n\n- 点一\n- 点二\n\n[曲线]');
});

test('生产实测样本(E2E 发现的渲染 bug 原文形态)', () => {
  const blocks = parseMarkup(
    '光圈 f 值越小,景深越浅。<div content-section="important_takeaways"><p><strong>要点:</strong>背景虚化增强。</p></div>',
  );
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'p');
  assert.equal(blocks[1].kind, 'section');
});
