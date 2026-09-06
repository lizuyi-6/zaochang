import { ASSET_BASE } from '../services/baseUrl';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { DiagramRenderer } from './DiagramRenderer';

interface MarkdownRendererProps {
  content: string;
}

interface SectionConfig {
  label: string;
  accent: string;
  bg: string;
  icon?: string;
}

const SECTION_CONFIGS: Record<string, SectionConfig> = {
  definition: {
    label: "Definition",
    accent: "#4C6694",
    bg: "rgba(76, 102, 148, 0.04)",
    icon: `${ASSET_BASE}pages/chatResponsePage/markdownRenderer/definition.svg`
  },
  example: {
    label: "Example",
    accent: "#6B8E7B",
    bg: "rgba(107, 142, 123, 0.04)",
    icon: `${ASSET_BASE}pages/chatResponsePage/markdownRenderer/example.svg`
  },
  application: {
    label: "Application",
    accent: "#7B6B8E",
    bg: "rgba(123, 107, 142, 0.04)",
    icon: `${ASSET_BASE}pages/chatResponsePage/markdownRenderer/application.svg`
  },
  core_equations: {
    label: "",
    accent: "transparent",
    bg: "rgba(0, 0, 0, 0.02)"
  },
  key_points: {
    label: "Key Points",
    accent: "#F5C842",
    bg: "rgba(245, 200, 66, 0.06)",
    icon: `${ASSET_BASE}pages/chatResponsePage/markdownRenderer/key_points.svg`
  },
  common_mistakes: {
    label: "Common Mistakes",
    accent: "#A67C6B",
    bg: "rgba(166, 124, 107, 0.04)",
    icon: `${ASSET_BASE}pages/chatResponsePage/markdownRenderer/common_mistakes.svg`
  },
  important_takeaways: {
    label: "Important Takeaways",
    accent: "#5A8A9A",
    bg: "rgba(90, 138, 154, 0.04)",
    icon: `${ASSET_BASE}pages/chatResponsePage/markdownRenderer/important_takeaways.svg`
  },
  proof: {
    label: "Proof",
    accent: "#7A7A9A",
    bg: "rgba(122, 122, 154, 0.04)",
    icon: `${ASSET_BASE}pages/chatResponsePage/markdownRenderer/proof.svg`
  }
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const renderCustomComponents = () => {
    const diagramRegex = /<diagram\s+([^>]*?)>(?:([\s\S]*?)<\/diagram>)?/gi;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    const fullText = content;

    const renderMarkdownBlock = (mdText: string, keyPrefix: string) => (
      <ReactMarkdown
        key={keyPrefix}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          div({ node, className, children, ...props }: any) {
            const sectionType = props['content-section'];
            if (sectionType) {
              const cfg = SECTION_CONFIGS[sectionType] || {
                label: sectionType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                accent: "#888888",
                bg: "rgba(0, 0, 0, 0.02)"
              };
              const isEquations = sectionType === 'core_equations';

              return (
                <div style={{
                  margin: "0.9em 0 1.0em 0",
                  overflow: "visible",
                  position: "relative",
                  borderRadius: "8px"
                }}>
                  {cfg.accent !== "transparent" && (
                    <div style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: "3px",
                      backgroundColor: cfg.accent,
                      borderTopLeftRadius: "8px",
                      borderBottomLeftRadius: "8px"
                    }} />
                  )}
                  <div style={{
                    padding: isEquations ? "18px 20px 20px 20px" : "14px 18px 8px 20px",
                    backgroundColor: cfg.bg,
                    borderRadius: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: cfg.label ? "8px" : "0"
                  }}>
                    {cfg.label && (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "0.75em",
                        fontWeight: 600,
                        color: cfg.accent,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        userSelect: "none",
                        opacity: 0.85
                      }}>
                        {cfg.icon && <img src={cfg.icon} alt="" style={{ width: 16, height: 16, flexShrink: 0 }} />}
                        <span>{cfg.label}</span>
                      </div>
                    )}
                    <div style={{ color: isEquations ? "#374151" : "#444444", width: "100%", overflow: "visible", lineHeight: 1.65 }}>
                      {children}
                    </div>
                  </div>
                </div>
              );
            }
            return <div className={className} {...props}>{children}</div>;
          },
          h1: ({ children }) => <h1 style={{ fontSize: '1.5em', fontWeight: 700, margin: '0.8em 0 0.4em' }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: '1.3em', fontWeight: 700, margin: '0.7em 0 0.35em' }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: '1.15em', fontWeight: 700, margin: '0.6em 0 0.3em' }}>{children}</h3>,
          p: ({ children }) => <p style={{ margin: '0 0 0.8em', lineHeight: 1.7 }}>{children}</p>,
          ul: ({ children }) => <ul style={{ paddingLeft: '1.5em', margin: '0 0 0.8em' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: '1.5em', margin: '0 0 0.8em' }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '0.2em 0' }}>{children}</li>,
          code: ({ children }) => {
            return (
              <code style={{
                background: '#f4f5f7',
                padding: '2px 5px',
                borderRadius: '4px',
                fontSize: '0.9em',
                fontFamily: 'Monaco, Consolas, monospace'
              }}>
                {children}
              </code>
            );
          }
        }}
      >
        {mdText}
      </ReactMarkdown>
    );

    while ((match = diagramRegex.exec(fullText)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(renderMarkdownBlock(fullText.substring(lastIndex, matchIndex), `md-${lastIndex}`));
      }

      const attrStr = match[1];
      const innerContent = match[2] || '';
      const getAttr = (name: string) => {
        const m = attrStr.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
        return m ? m[1] : undefined;
      };

      const subtype = getAttr('data-subtype') || getAttr('type') || 'mermaid';
      const layout = getAttr('data-layout') || 'block';
      const status = getAttr('data-status') || 'ready';
      const caption = getAttr('data-caption');

      parts.push(
        <DiagramRenderer
          key={`diagram-${matchIndex}`}
          subtype={subtype}
          layout={layout}
          status={status}
          caption={caption}
          content={innerContent}
        />
      );

      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < fullText.length) {
      parts.push(renderMarkdownBlock(fullText.substring(lastIndex), `md-${lastIndex}`));
    }

    return parts;
  };

  return (
    <div className="markdown-body" style={{ lineHeight: '1.7', fontSize: '15px', color: '#1f2937' }}>
      {renderCustomComponents()}
    </div>
  );
};
