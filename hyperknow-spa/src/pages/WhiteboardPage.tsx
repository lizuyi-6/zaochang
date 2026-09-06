import React, { useState, useEffect, useRef } from 'react';
import { WhiteboardWsClient } from '../services/wsClient';
import { Hand, Play, Pause, X, Volume2, ArrowLeft, Send } from 'lucide-react';
import '../styles/whiteboard.css';

interface WhiteboardPageProps {
  topic: string;
  onExit: () => void;
  voiceId?: string;
  speed?: number;
}

export const WhiteboardPage: React.FC<WhiteboardPageProps> = ({
  topic,
  onExit,
  voiceId = 'warm',
  speed = 1.0
}) => {
  const [currentStep, setCurrentStep] = useState<any>(null);
  const [subtitles, setSubtitles] = useState<string>('Connecting to whiteboard instructor...');
  const [isPaused, setIsPaused] = useState(false);
  const [isInterjectModalOpen, setIsInterjectModalOpen] = useState(false);
  const [studentQuestion, setStudentQuestion] = useState('');
  const [interjectAnswer, setInterjectAnswer] = useState<string | null>(null);

  const wsClientRef = useRef<WhiteboardWsClient | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const client = new WhiteboardWsClient((data) => {
      if (data.type === 'session_ready') {
        setSubtitles(`Ready. Starting lecture on "${topic}"...`);
        client.startTeaching(data.session_id, voiceId, speed);
      }

      if (data.type === 'whiteboard_action') {
        setCurrentStep({
          step_id: data.step_id,
          action: data.action
        });
      }

      if (data.type === 'narration_chunk') {
        setSubtitles(data.text);
        if (data.audio_meta?.audioUrl && !isPaused) {
          if (audioPlayerRef.current) audioPlayerRef.current.pause();
          const audio = new Audio(data.audio_meta.audioUrl);
          audioPlayerRef.current = audio;
          audio.play().catch(() => {});
        }
      }

      if (data.type === 'narration_pause') {
        setIsPaused(true);
        if (audioPlayerRef.current) audioPlayerRef.current.pause();
      }

      if (data.type === 'narration_resume') {
        setIsPaused(false);
        if (audioPlayerRef.current) audioPlayerRef.current.play().catch(() => {});
      }

      if (data.type === 'interject_thinking') {
        setSubtitles('The instructor is considering your question...');
      }

      if (data.type === 'interject_answer') {
        setInterjectAnswer(data.answer_text);
        setSubtitles(`[Instructor]: ${data.answer_text}`);
        if (audioPlayerRef.current) audioPlayerRef.current.pause();
        const audio = new Audio(`/api/hyperknow/tts/stream?text=${encodeURIComponent(data.answer_text)}&voice=${voiceId}&speed=${speed}`);
        audioPlayerRef.current = audio;
        audio.play().catch(() => {});
      }
    });

    client.connect(topic);
    wsClientRef.current = client;

    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      client.close();
    };
  }, [topic, voiceId, speed]);

  const handleInterjectClick = () => {
    wsClientRef.current?.interjectStart();
    setIsPaused(true);
    setIsInterjectModalOpen(true);
  };

  const handleSendInterjection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentQuestion.trim()) return;

    wsClientRef.current?.interjectQuestion(studentQuestion.trim());
    setStudentQuestion('');
  };

  return (
    <div className="whiteboard-root">
      {/* Top Header */}
      <div className="whiteboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onExit}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.88rem' }}
          >
            <ArrowLeft size={16} />
            <span>Exit Lecture</span>
          </button>
          <div className="whiteboard-title-pill">
            <span className="whiteboard-status-dot"></span>
            <span>{topic}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <Volume2 size={16} style={{ color: 'var(--color-primary)' }} />
          <span>Live Audio Active ({voiceId} · {speed}×)</span>
        </div>
      </div>

      {/* Main Canvas / Blackboard Stage */}
      <div className="whiteboard-stage">
        {currentStep ? (
          <div className="whiteboard-board-card">
            <div className="whiteboard-step-indicator">
              BOARD ACTIVE · {currentStep.step_id?.toUpperCase()}
            </div>

            {currentStep.action?.title && (
              <h2 className="whiteboard-card-title">{currentStep.action.title}</h2>
            )}

            {currentStep.action?.content && (
              <div
                className="whiteboard-card-body"
                dangerouslySetInnerHTML={{ __html: currentStep.action.content }}
              />
            )}

            {currentStep.action?.latex && (
              <div style={{
                background: '#f8fafc',
                padding: '24px',
                borderRadius: '12px',
                textAlign: 'center',
                fontSize: '1.25rem',
                fontFamily: 'KaTeX_Main, serif',
                border: '1px solid var(--border-color)',
                color: 'var(--color-primary)'
              }}>
                {currentStep.action.latex}
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>The instructor is writing on the board...</h3>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="whiteboard-bottom-bar">
        <button
          onClick={() => {
            if (isPaused) {
              setIsPaused(false);
              if ('speechSynthesis' in window) window.speechSynthesis.resume();
            } else {
              setIsPaused(true);
              if ('speechSynthesis' in window) window.speechSynthesis.pause();
            }
          }}
          style={{ padding: 6, borderRadius: '50%', color: 'var(--text-secondary)' }}
          title={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? <Play size={18} /> : <Pause size={18} />}
        </button>

        {/* Live Narration Subtitles */}
        <div className="whiteboard-subtitles-box" title={subtitles}>
          {subtitles}
        </div>

        {/* Raise Hand to Interject (插话打断) Button */}
        <button
          className={`whiteboard-interject-btn ${isPaused ? 'paused' : ''}`}
          onClick={handleInterjectClick}
          title="Raise Hand to Ask Question"
        >
          <Hand size={15} />
          <span>Raise Hand</span>
        </button>
      </div>

      {/* Student Question Dialog (举手提问弹窗) */}
      {isInterjectModalOpen && (
        <div className="interject-modal">
          <div className="interject-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--text-primary)' }}>
                <Hand size={18} style={{ color: '#ef4444' }} />
                <span>Ask the Instructor</span>
              </div>
              <button
                onClick={() => {
                  setIsInterjectModalOpen(false);
                  setIsPaused(false);
                  if ('speechSynthesis' in window) window.speechSynthesis.resume();
                }}
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              The lecture is paused. Ask any question about the current step on the board:
            </p>

            <form onSubmit={handleSendInterjection} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="interject-input"
                placeholder="Type your question here (e.g., 'What does Δx represent?')..."
                value={studentQuestion}
                onChange={(e) => setStudentQuestion(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                style={{
                  background: 'var(--color-primary)',
                  color: '#fff',
                  padding: '0 16px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Send size={16} />
              </button>
            </form>

            {interjectAnswer && (
              <div style={{
                background: 'var(--color-primary-light)',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: '0.9rem',
                color: 'var(--color-primary)',
                lineHeight: 1.5
              }}>
                <strong>Answer: </strong> {interjectAnswer}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
