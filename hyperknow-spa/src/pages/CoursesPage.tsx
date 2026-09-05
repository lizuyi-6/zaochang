import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import type { Course } from '../services/api';
import { CourseGenWsClient } from '../services/wsClient';
import { CourseStructureMap } from '../components/CourseStructureMap';
import { BookOpen, Users, RefreshCw } from 'lucide-react';

interface CoursesPageProps {
  onStartSession?: (session: any) => void;
}

export const CoursesPage: React.FC<CoursesPageProps> = ({ onStartSession }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [customTopic, setCustomTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genLogs, setGenLogs] = useState<string[]>([]);

  const wsClientRef = useRef<CourseGenWsClient | null>(null);

  useEffect(() => {
    api.getMarketplaceCourses()
      .then((data) => {
        setCourses(data);
        if (data.length > 0) setSelectedCourse(data[0]);
      })
      .catch(console.error);
  }, []);

  const handleStartCourseGen = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTopic.trim()) return;

    setIsGenerating(true);
    setGenLogs(['Connecting to Course Generation Agent...']);

    const client = new CourseGenWsClient((msg) => {
      if (msg.type === 'course_generation_step') {
        setGenLogs((prev) => [...prev, `${msg.status === 'completed' ? '✓' : '•'} ${msg.title || msg.placeholder}`]);
      }
      if (msg.type === 'course_generation_progress') {
        setGenLogs((prev) => [...prev, `  ${msg.message}`]);
      }
      if (msg.type === 'course_structure_ready' && msg.course) {
        setIsGenerating(false);
        setSelectedCourse(msg.course);
        setCourses((prev) => [msg.course, ...prev]);
      }
    });

    client.connect(customTopic.trim());
    wsClientRef.current = client;
  };

  return (
    <div style={{
      maxWidth: '1000px',
      margin: '0 auto',
      padding: '36px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '28px'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
          Curriculum & Course Studio
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Explore structured interactive courses or design a custom syllabus from scratch.
        </p>
      </div>

      {/* Quick Creator Box */}
      <form onSubmit={handleStartCourseGen} style={{
        display: 'flex',
        gap: '12px',
        padding: '16px 20px',
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)'
      }}>
        <input
          type="text"
          placeholder="Topic to craft into a complete syllabus (e.g., 'Modern Cryptography')..."
          value={customTopic}
          onChange={(e) => setCustomTopic(e.target.value)}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: '0.95rem',
            fontFamily: 'inherit'
          }}
        />
        <button
          type="submit"
          disabled={isGenerating || !customTopic.trim()}
          style={{
            padding: '8px 18px',
            borderRadius: '10px',
            background: 'var(--color-primary)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          {isGenerating ? <RefreshCw size={14} className="animate-spin" /> : <BookOpen size={14} />}
          <span>{isGenerating ? "Crafting..." : "Generate Syllabus"}</span>
        </button>
      </form>

      {/* Generation Log Stream */}
      {isGenerating && (
        <div style={{
          background: '#1e293b',
          color: '#e2e8f0',
          padding: '16px 20px',
          borderRadius: '12px',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          maxHeight: '180px',
          overflowY: 'auto'
        }}>
          {genLogs.map((log, i) => (
            <div key={i} style={{ marginBottom: 4 }}>{log}</div>
          ))}
        </div>
      )}

      {/* Course List & Current Blueprint */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
            AVAILABLE COURSES
          </div>
          {courses.map((c, i) => (
            <div
              key={c.courseUuid || c.marketplaceId || i}
              onClick={() => setSelectedCourse(c)}
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                border: `1.5px solid ${selectedCourse?.courseTitle === c.courseTitle ? 'var(--color-primary)' : 'var(--border-color)'}`,
                background: selectedCourse?.courseTitle === c.courseTitle ? 'var(--color-primary-light)' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {c.courseTitle}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <Users size={12} />
                <span>{c.joinCount || 100}+ enrolled</span>
              </div>
            </div>
          ))}
        </div>

        <div>
          {selectedCourse ? (
            <CourseStructureMap course={selectedCourse} onStartSession={onStartSession} />
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a course on the left to inspect its structure.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
