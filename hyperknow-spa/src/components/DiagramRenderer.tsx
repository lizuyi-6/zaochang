import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { Activity } from 'lucide-react';
import '../styles/diagrams.css';

interface DiagramRendererProps {
  subtype?: string;
  layout?: string;
  status?: string;
  caption?: string;
  content?: string;
}

export const DiagramRenderer: React.FC<DiagramRendererProps> = ({
  subtype = 'mermaid',
  layout = 'block',
  status = 'ready',
  caption,
  content = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isRight = layout === 'right';

  useEffect(() => {
    if (subtype === 'mermaid' && status === 'ready' && content && containerRef.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'loose'
      });

      const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
      // Extract clean mermaid code if wrapped in ```mermaid
      let cleanCode = content.replace(/```mermaid/g, '').replace(/```/g, '').trim();
      if (!cleanCode) {
        cleanCode = "graph TD\n  A[Concept] --> B[Analysis]\n  B --> C[Conclusion]";
      }

      mermaid.render(id, cleanCode)
        .then(({ svg }) => {
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        })
        .catch((err) => {
          console.error('Mermaid render error:', err);
          if (containerRef.current) {
            containerRef.current.innerHTML = `<div style="color:#ef4444; font-size:0.8rem;">Diagram syntax error: ${err.message}</div>`;
          }
        });
    }
  }, [subtype, status, content]);

  if (status === 'pending') {
    return (
      <div className={`inline-diagram ${isRight ? 'inline-diagram--right' : 'inline-diagram--block'}`}>
        <div className="inline-diagram-skeleton">
          <div className="inline-diagram-skeleton-text">
            Generating {subtype.toUpperCase()} Diagram...
          </div>
        </div>
        {caption && <div className="inline-diagram-caption">{caption}</div>}
      </div>
    );
  }

  return (
    <div className={`inline-diagram ${isRight ? 'inline-diagram--right' : 'inline-diagram--block'}`}>
      <div className="inline-diagram-content">
        {subtype === 'mermaid' ? (
          <div className="mermaid-wrapper" ref={containerRef}></div>
        ) : subtype === 'desmos' ? (
          <div style={{ width: '100%', height: '260px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
            <Activity size={24} style={{ marginRight: 8 }} />
            <span>Interactive Desmos Plot: {content || 'y = f(x)'}</span>
          </div>
        ) : (
          <div style={{ width: '100%', minHeight: '180px', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', borderRadius: '8px' }}>
            <span>Conceptual Visualization [{caption || subtype}]</span>
          </div>
        )}
      </div>
      {caption && <div className="inline-diagram-caption">{caption}</div>}
    </div>
  );
};
