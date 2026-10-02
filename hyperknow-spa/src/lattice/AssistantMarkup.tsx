import React from 'react';
import { PenTool } from 'lucide-react';
import { parseMarkup } from './markup';
import type { MarkupBlock, MarkupInline } from './markup';
import { L } from './i18n/content';

// 导师回复的渲染层:markup.ts 解析出的区块树 → React 元素。
// 文本一律作纯文本节点,不存在 HTML 字符串拼接通道;聊天气泡、译文面板共用。

const SECTION_LABELS: Record<string, [string, string]> = {
  definition: ['Definition', '定义'],
  key_points: ['Key points', '要点'],
  example: ['Example', '示例'],
  application: ['Applications', '应用'],
  core_equations: ['Core equations', '核心公式'],
  common_mistakes: ['Common mistakes', '常见误区'],
  important_takeaways: ['Key takeaways', '核心结论'],
  proof: ['Proof', '证明'],
};

const DIAGRAM_LABELS: Record<string, [string, string]> = {
  mermaid: ['Flow diagram', '流程图'],
  desmos: ['Function plot', '函数图像'],
  gemini_image: ['Illustration', '概念插图'],
};

const Inlines: React.FC<{ inlines: MarkupInline[] }> = ({ inlines }) => (
  <>
    {inlines.map((inl, i) => {
      if (!inl.text) return null;
      let node: React.ReactNode = inl.text.split('\n').flatMap((line, li) => (li ? [<br key={`b${i}-${li}`} />, line] : [line]));
      if (inl.math) node = <span className="cp-markup-math">{node}</span>;
      else if (inl.code) node = <code>{node}</code>;
      if (inl.italic) node = <em>{node}</em>;
      if (inl.bold) node = <strong>{node}</strong>;
      if (inl.link)
        node = (
          <a href={inl.link} target="_blank" rel="noopener noreferrer">
            {node}
          </a>
        );
      return <React.Fragment key={i}>{node}</React.Fragment>;
    })}
  </>
);

const BlockView: React.FC<{ block: MarkupBlock }> = ({ block }) => {
  switch (block.kind) {
    case 'p':
      return (
        <p>
          <Inlines inlines={block.inlines} />
        </p>
      );
    case 'heading': {
      const body = <Inlines inlines={block.inlines} />;
      if (block.level === 2) return <h3 className="cp-markup-heading">{body}</h3>;
      if (block.level === 3) return <h4 className="cp-markup-heading">{body}</h4>;
      return <h5 className="cp-markup-heading">{body}</h5>;
    }
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines inlines={item} />
            </li>
          ))}
        </List>
      );
    }
    case 'code':
      /* mermaid 围栏与 <diagram> 同语义:聊天气泡里渲染为虚线占位签,不裸奔源码 */
      if (block.lang.toLowerCase() === 'mermaid') {
        return (
          <div className="cp-markup-diagram">
            <PenTool size={13} />
            <strong>{L('Flow diagram', '流程图')}</strong>
            <span>mermaid</span>
          </div>
        );
      }
      return (
        <pre>
          <code>{block.text}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote>
          <Inlines inlines={block.inlines} />
        </blockquote>
      );
    case 'math':
      return <div className="cp-markup-math-block">{block.text}</div>;
    case 'table':
      return (
        <div className="cp-markup-table-wrap">
          <table className="cp-markup-table">
            {block.head && (
              <thead>
                <tr>
                  {block.head.map((cell, ci) => (
                    <th key={ci}>
                      <Inlines inlines={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>
                      <Inlines inlines={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'section': {
      const label = SECTION_LABELS[block.section];
      return (
        <div className="cp-markup-section">
          <span className="cp-markup-section-kicker">{label ? L(label[0], label[1]) : block.section.replace(/_/g, ' ')}</span>
          {block.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      );
    }
    case 'diagram': {
      const label = DIAGRAM_LABELS[block.subtype];
      return (
        <div className="cp-markup-diagram">
          <PenTool size={13} />
          <strong>{block.caption || (label ? L(label[0], label[1]) : L('Visual aid', '图示'))}</strong>
          {block.caption ? <span>{label ? L(label[0], label[1]) : block.subtype}</span> : null}
        </div>
      );
    }
  }
};

/** 聊天气泡/译文面板的导师富文本入口;解析不出结构时退化为纯段落。 */
export const AssistantMarkup: React.FC<{ text: string }> = ({ text }) => {
  const blocks = parseMarkup(text);
  if (!blocks.length) return null;
  return (
    <div className="cp-markup">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
};
