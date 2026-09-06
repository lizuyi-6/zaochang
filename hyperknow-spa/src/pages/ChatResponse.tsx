import React, { useEffect, useState, useRef } from 'react';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { ChatWsClient } from '../services/wsClient';
import { ArrowLeft, Sparkles, Brain, CheckCircle, RefreshCw } from 'lucide-react';

interface ChatResponseProps {
  initialQuery: string;
  onBack: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export const ChatResponse: React.FC<ChatResponseProps> = ({
  initialQuery,
  onBack,
  onSelectPrompt
}) => {
  const [content, setContent] = useState('');
  const [thinkingMessage, setThinkingMessage] = useState<string | null>('Director Agent analyzing pedagogical intent...');
  const [isThinking, setIsThinking] = useState(true);
  const [nextSteps, setNextSteps] = useState<any[]>([]);
  const wsClientRef = useRef<ChatWsClient | null>(null);

  useEffect(() => {
    setContent('');
    setIsThinking(true);
    setNextSteps([]);

    const client = new ChatWsClient((data) => {
      if (data.type === 'tool_execution' && data.tool_name === 'directorAgent') {
        if (data.tool_status === 'thinking') {
          setThinkingMessage(data.data?.message || 'Structuring pedagogical scaffolding...');
          setIsThinking(true);
        } else if (data.tool_status === 'completed') {
          setIsThinking(false);
          setThinkingMessage(null);
        }
      }

      if (data.type === 'content_chunk' && data.chunk) {
        setIsThinking(false);
        setContent((prev) => prev + data.chunk);
      }

      if (data.type === 'tool_execution' && data.tool_name === 'recommend_next_step') {
        if (data.data?.next_steps) {
          setNextSteps(data.data.next_steps);
        }
      }

      if (data.type === 'complete') {
        setIsThinking(false);
      }

      // SSE 版新增:服务端错误帧(鉴权失效/上游故障)也要解除思考态,避免无限转圈。
      if (data.type === 'error') {
        setIsThinking(false);
        setThinkingMessage(null);
      }
    }, () => {
      client.sendMessage(initialQuery);
    });

    client.connect();
    wsClientRef.current = client;

    return () => {
      client.close();
    };
  }, [initialQuery]);

  return (
    <div style={{
      maxWidth: '860px',
      margin: '0 auto',
      padding: '30px 24px 60px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      {/* Top back bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.88rem',
            fontWeight: 600,
            color: 'var(--text-muted)'
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </button>
      </div>

      {/* User Query Banner */}
      <div style={{
        padding: '18px 24px',
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)'
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em', marginBottom: 4 }}>
          STUDY INQUIRY
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {initialQuery}
        </h2>
      </div>

      {/* Agent Thinking Status Indicator */}
      {isThinking && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 18px',
          background: 'var(--color-primary-light)',
          borderRadius: '12px',
          color: 'var(--color-primary)',
          fontSize: '0.88rem',
          fontWeight: 600
        }}>
          <Brain size={18} className="animate-pulse" />
          <span>{thinkingMessage || 'Director Agent is thinking...'}</span>
        </div>
      )}

      {/* Content Stream Box */}
      <div style={{
        background: '#ffffff',
        borderRadius: '20px',
        padding: '32px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)',
        minHeight: '260px'
      }}>
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          !isThinking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
              <RefreshCw size={16} className="animate-spin" />
              <span>Generating tailored response...</span>
            </div>
          )
        )}
      </div>

      {/* Next Step Recommendations (Active Recall) */}
      {nextSteps.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          marginTop: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.82rem',
            fontWeight: 700,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.05em'
          }}>
            <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
            <span>RECOMMENDED NEXT STEPS (ACTIVE RECALL)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {nextSteps.map((step, index) => (
              <button
                key={index}
                onClick={() => onSelectPrompt(step.step_prompt || step.display_step)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: '#ffffff',
                  border: '1px solid var(--border-color)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
              >
                <CheckCircle size={16} style={{ color: 'var(--color-primary)', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {step.display_step}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {step.step_prompt}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
