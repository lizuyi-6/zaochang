import { ASSET_BASE } from '../services/baseUrl';
import React, { useState } from 'react';

interface HomeProps {
  onStartChat: (prompt: string, mode?: string) => void;
  onGenerateCourse: (topic: string) => void;
  onOpenWhiteboard: (topic: string) => void;
}

export const Home: React.FC<HomeProps> = ({
  onStartChat,
  onGenerateCourse,
  onOpenWhiteboard
}) => {
  const [mode, setMode] = useState<'craftCourses' | 'instantAssistance'>('craftCourses');
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    if (mode === 'craftCourses') {
      onGenerateCourse(prompt.trim());
    } else {
      onStartChat(prompt.trim());
    }
  };

  const recommendations = [
    {
      icon: '/pages/mainPages/home/recommendations/explain_concept.svg',
      title: 'Explain complex concepts in simple terms with analogies',
      prompt: 'Can you break down quantum entanglement with an intuitive analogy?'
    },
    {
      icon: '/pages/mainPages/home/recommendations/study_materials.svg',
      title: 'Create active recall flashcards and practice quizzes',
      prompt: 'Create 3 active recall flashcards and a quiz on Bayes Theorem.'
    },
    {
      icon: '/pages/mainPages/home/recommendations/visual_learning.svg',
      title: 'Visualize data structures and algorithm flowcharts with Mermaid',
      prompt: 'Draw a complete Mermaid flowchart showing how OAuth2 Authorization Code flow works.'
    },
    {
      icon: '/pages/mainPages/home/recommendations/solve_problem.svg',
      title: 'Step-by-step mathematical derivations and proofs',
      prompt: 'Walk through the step-by-step mathematical derivation of Gradient Descent.'
    }
  ];

  return (
    <div className="home-scroll-body">
      <div className="chatbot-section">
        {/* Home Mode Tabs */}
        <div className="home-mode-tabs" role="tablist" aria-label="Home mode">
          <button
            type="button"
            role="tab"
            className={`home-mode-tab ${mode === 'craftCourses' ? 'active' : ''}`}
            onClick={() => setMode('craftCourses')}
          >
            Craft Courses
          </button>
          <button
            type="button"
            role="tab"
            className={`home-mode-tab ${mode === 'instantAssistance' ? 'active' : ''}`}
            onClick={() => setMode('instantAssistance')}
          >
            Instant Agent
          </button>
        </div>

        {/* Tab 1: Craft Courses Panel */}
        {mode === 'craftCourses' && (
          <div className="craft-courses-panel">
            <div className="craft-courses-copy">
              <h2 className="craft-courses-title">
                Craft your own course from{' '}
                <span className="craft-courses-brush-highlight">slides, syllabus</span>
                , or any idea.
              </h2>
              <p className="craft-courses-description">
                Turn course materials, research topics, or study guides into interactive, step-by-step masterclasses with structured lectures, whiteboard deep dives, and active recall practice.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="craft-course-input-stack" style={{ marginTop: '20px' }}>
              <div className="craft-course-input-box">
                <div className="craft-course-input-area">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter a topic or paste a syllabus (e.g., 'Modern Cryptography and Zero Knowledge Proofs')..."
                    className="craft-course-input-field"
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                </div>

                <div className="button-row">
                  <div className="left-button-group">
                    <button
                      type="button"
                      onClick={() => onOpenWhiteboard(prompt || 'Whiteboard Lesson')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: '1px solid #E5E5E5',
                        background: '#f8f8f8',
                        fontSize: '12px',
                        color: '#555',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                      title="Launch Whiteboard Session"
                    >
                      <img src={`${ASSET_BASE}pages/mainPages/home/board-session.svg`} alt="" style={{ width: 14, height: 14 }} />
                      <span>Whiteboard</span>
                    </button>

                    <button
                      type="button"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: '1px solid #E5E5E5',
                        background: '#f8f8f8',
                        fontSize: '12px',
                        color: '#555',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                      title="Attach Notes or PDF"
                    >
                      <img src={`${ASSET_BASE}pages/mainPages/home/attach.svg`} alt="" style={{ width: 14, height: 14 }} />
                      <span>Attach File</span>
                    </button>
                  </div>

                  <div className="composer-right-group">
                    <button
                      type="submit"
                      disabled={!prompt.trim()}
                      className={`send-button ${prompt.trim() ? 'enabled' : 'disabled'}`}
                      title="Build Course"
                    >
                      <img src={`${ASSET_BASE}pages/mainPages/home/arrow.svg`} alt="Send" />
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Instant Agent Panel */}
        {mode === 'instantAssistance' && (
          <div className="craft-courses-panel">
            <div className="greeting-line" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
              <video
                src={`${ASSET_BASE}pages/mainPages/home/orbie-greeting.mp4`}
                poster={`${ASSET_BASE}pages/mainPages/home/orbie-greeting.webp`}
                autoPlay
                loop
                muted
                playsInline
                style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }}
              />
              <span style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937' }}>
                What do you want to learn today?
              </span>
            </div>

            <form onSubmit={handleSubmit} className="craft-course-input-stack">
              <div className="craft-course-input-box">
                <div className="craft-course-input-area">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ask anything you want to master (e.g., 'Explain the mathematical intuition of Backpropagation')..."
                    className="craft-course-input-field"
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                </div>

                <div className="button-row">
                  <div className="left-button-group">
                    <button
                      type="button"
                      onClick={() => onOpenWhiteboard(prompt || 'Whiteboard Lesson')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: '1px solid #E5E5E5',
                        background: '#f8f8f8',
                        fontSize: '12px',
                        color: '#555',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                    >
                      <img src={`${ASSET_BASE}pages/mainPages/home/board-session.svg`} alt="" style={{ width: 14, height: 14 }} />
                      <span>Whiteboard</span>
                    </button>
                  </div>

                  <div className="composer-right-group">
                    <button
                      type="submit"
                      disabled={!prompt.trim()}
                      className={`send-button ${prompt.trim() ? 'enabled' : 'disabled'}`}
                    >
                      <img src={`${ASSET_BASE}pages/mainPages/home/arrow.svg`} alt="Send" />
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Recommendations Section */}
        <div className="recommendations-section">
          <div className="recommendations-list">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className="recommendation-item"
                onClick={() => onStartChat(rec.prompt)}
              >
                <div className="recommendation-icon-container">
                  <img src={rec.icon} alt="" style={{ width: 16, height: 16 }} />
                </div>
                <span style={{ fontSize: '13px', color: '#333', fontWeight: 500 }}>
                  {rec.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
