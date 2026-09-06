import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { VoiceSettingsModal } from './components/VoiceSettingsModal';
import { Home } from './pages/Home';
import { ChatResponse } from './pages/ChatResponse';
import { WhiteboardPage } from './pages/WhiteboardPage';
import { CoursesPage } from './pages/CoursesPage';
import { api } from './services/api';
import type { UserInfo } from './services/api';
import './styles/variables.css';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeQuery, setActiveQuery] = useState<string>('');
  const [whiteboardTopic, setWhiteboardTopic] = useState<string>('');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [voiceId, setVoiceId] = useState<string>('warm');
  const [speed, setSpeed] = useState<number>(1.0);

  useEffect(() => {
    api.getUserInfo().then(setUser).catch(console.error);
    api.getConversations().then(setConversations).catch(console.error);
  }, []);

  const handleStartChat = (query: string) => {
    setActiveQuery(query);
    setCurrentTab('chatResponse');
    setTimeout(() => {
      api.getConversations().then(setConversations).catch(console.error);
    }, 2000);
  };

  const handleOpenWhiteboard = (topic: string) => {
    setWhiteboardTopic(topic);
    setCurrentTab('whiteboard');
  };

  const handleGenerateCourse = () => {
    setCurrentTab('courses');
  };

  if (currentTab === 'whiteboard') {
    return (
      <WhiteboardPage
        topic={whiteboardTopic || "Interactive Study Session"}
        onExit={() => setCurrentTab('home')}
        voiceId={voiceId}
        speed={speed}
      />
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        conversations={conversations}
        onSelectConversation={(conv) => {
          setActiveQuery(conv.title);
          setCurrentTab('chatResponse');
        }}
      />

      <div className="main-content" style={{ position: 'relative', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Header
          user={user}
          onOpenVoiceSettings={() => setIsVoiceModalOpen(true)}
        />

        <main style={{ flex: 1, width: '100%' }}>
          {currentTab === 'home' && (
            <Home
              onStartChat={handleStartChat}
              onGenerateCourse={handleGenerateCourse}
              onOpenWhiteboard={handleOpenWhiteboard}
            />
          )}

          {currentTab === 'chatResponse' && (
            <ChatResponse
              initialQuery={activeQuery}
              onBack={() => setCurrentTab('home')}
              onSelectPrompt={(prompt) => handleStartChat(prompt)}
            />
          )}

          {(currentTab === 'courses' || currentTab === 'marketplace') && (
            <CoursesPage
              onStartSession={(session) => handleOpenWhiteboard(session.title)}
            />
          )}

          {currentTab === 'history' && (
            <div style={{ maxWidth: 860, margin: '40px auto', padding: '0 24px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16 }}>Study History</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {conversations.map((c, i) => (
                  <div
                    key={i}
                    onClick={() => { setActiveQuery(c.title); setCurrentTab('chatResponse'); }}
                    style={{
                      padding: '14px 18px',
                      background: '#ffffff',
                      borderRadius: 12,
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{c.title}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <VoiceSettingsModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        voiceId={voiceId}
        speed={speed}
        onVoiceChange={setVoiceId}
        onSpeedChange={setSpeed}
      />
    </div>
  );
};

export default App;
