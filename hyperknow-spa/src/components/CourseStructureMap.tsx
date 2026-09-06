import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Play } from 'lucide-react';
import '../styles/courseMindmap.css';

interface CourseStructureMapProps {
  course: any;
  onStartSession?: (session: any) => void;
}

export const CourseStructureMap: React.FC<CourseStructureMapProps> = ({
  course,
  onStartSession
}) => {
  const [zoom, setZoom] = useState(1);

  if (!course) return null;

  return (
    <div className="csm-card">
      <div className="csm-header">
        <div className="csm-eyebrow">COURSE BLUEPRINT</div>
        <div className="csm-title-row">
          <h2 className="csm-title">{course.courseTitle}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setZoom(Math.max(0.7, zoom - 0.15))}
              style={{ padding: 4, borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff' }}
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={() => setZoom(Math.min(1.4, zoom + 0.15))}
              style={{ padding: 4, borderRadius: 6, border: '1px solid var(--border-color)', background: '#fff' }}
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        </div>
        {course.courseDescription && (
          <p className="csm-subtitle">{course.courseDescription}</p>
        )}

        {/* 认知深度图例 */}
        <div className="csm-legend">
          <span className="csm-chip csm-chip--intuition">Intuition</span>
          <span className="csm-chip csm-chip--definition">Definition</span>
          <span className="csm-chip csm-chip--derivation">Derivation</span>
          <span className="csm-chip csm-chip--application">Application</span>
          <span className="csm-chip csm-chip--advanced">Advanced</span>
        </div>
      </div>

      <div className="csm-canvas">
        <div
          className="csm-tree"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.2s ease' }}
        >
          {course.units?.map((unit: any, uIdx: number) => (
            <div key={unit.unitId || uIdx} className="csm-unit-group">
              <div className="csm-unit-title">
                {unit.title}
              </div>

              <div className="csm-lectures-list">
                {unit.lectures?.map((lecture: any, lIdx: number) => (
                  <div key={lecture.lectureId || lIdx}>
                    <div className="csm-lecture-title">{lecture.title}</div>

                    <div className="csm-sessions-list">
                      {lecture.sessions?.map((sess: any, sIdx: number) => (
                        <div key={sess.sessionId || sIdx} className="csm-session-node">
                          <span style={{ fontWeight: 600 }}>{sess.title}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {sess.depthTags?.map((tag: string) => (
                              <span key={tag} className={`csm-chip csm-chip--${tag}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          {onStartSession && (
                            <button
                              onClick={() => onStartSession(sess)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                marginLeft: 8,
                                padding: '3px 8px',
                                background: 'var(--color-primary)',
                                color: '#ffffff',
                                borderRadius: 6,
                                fontSize: '0.75rem',
                                fontWeight: 600
                              }}
                            >
                              <Play size={10} />
                              <span>Learn</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
