import React, { useEffect, useRef, useState } from 'react';
import { X, Play } from 'lucide-react';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceId: string;
  speed: number;
  onVoiceChange: (voice: string) => void;
  onSpeedChange: (speed: number) => void;
}

const VOICES = [
  { id: "warm", label: "Warm", colors: ["#F0997B", "#ED93B1"] },
  { id: "calm", label: "Calm", colors: ["#85B7EB", "#9AA0A6"] },
  { id: "bright", label: "Bright", colors: ["#EF9F27", "#F0997B"] },
  { id: "gentle", label: "Gentle", colors: ["#AFA9EC", "#ED93B1"] },
  { id: "firm", label: "Firm", colors: ["#5DCAA5", "#85B7EB"] },
  { id: "lively", label: "Lively", colors: ["#97C459", "#5DCAA5"] }
];

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  voiceId,
  speed,
  onVoiceChange,
  onSpeedChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [boardFont, setBoardFont] = useState<'handwriting' | 'standard'>('handwriting');

  const selectedVoice = VOICES.find(v => v.id === voiceId) || VOICES[0];

  const handlePlayPreview = () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      return;
    }

    const sampleText = `Hi, this is how I sound. 欢迎来到 Hyperknow 学习平台。`;
    const url = `/api/hyperknow/tts/stream?text=${encodeURIComponent(sampleText)}&voice=${selectedVoice.id}&speed=${speed}&_t=${Date.now()}`;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setIsPlaying(true);

    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
    audio.play().catch(() => setIsPlaying(false));
  };

  // 绘制 32 边形动态频率彩色 Blob 粒子动效
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let angleOffset = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 38;
      const points = 32;

      ctx.save();
      ctx.beginPath();

      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const wave = isPlaying
          ? Math.sin(angle * 4 + angleOffset) * 6 + Math.cos(angle * 2 - angleOffset) * 4
          : Math.sin(angle * 3 + angleOffset) * 2;
        const r = baseRadius + wave;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();

      // 创建径向渐变
      const gradient = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, baseRadius + 10);
      gradient.addColorStop(0, selectedVoice.colors[0]);
      gradient.addColorStop(1, selectedVoice.colors[1]);

      ctx.fillStyle = gradient;
      ctx.shadowColor = selectedVoice.colors[0];
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();

      angleOffset += 0.04;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isOpen, isPlaying, selectedVoice]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        width: 'min(440px, 92%)',
        background: '#ffffff',
        borderRadius: '24px',
        padding: '24px 28px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Voice & Session Settings
          </h3>
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
              }
              setIsPlaying(false);
              onClose();
            }}
            style={{ color: 'var(--text-tertiary)', padding: '4px', borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Section 1: Current Voice Blob Preview */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 0',
          borderBottom: '1px solid var(--border-muted)'
        }}>
          <canvas ref={canvasRef} width={100} height={100} style={{ width: 100, height: 100 }} />
          <button
            onClick={handlePlayPreview}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--color-primary)',
              background: 'var(--color-primary-light)',
              padding: '6px 14px',
              borderRadius: '20px'
            }}
          >
            <Play size={14} />
            <span>{isPlaying ? "Playing sample..." : `${selectedVoice.label} · Preview Voice`}</span>
          </button>
        </div>

        {/* Section 2: Voice Options Grid */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 10, letterSpacing: '0.05em' }}>
            VOICE OPTIONS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {VOICES.map(v => (
              <button
                key={v.id}
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                  }
                  setIsPlaying(false);
                  onVoiceChange(v.id);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px',
                  borderRadius: '12px',
                  border: `2px solid ${v.id === voiceId ? 'var(--color-primary)' : 'var(--border-muted)'}`,
                  background: v.id === voiceId ? 'var(--color-primary-light)' : '#ffffff',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${v.colors[0]}, ${v.colors[1]})`
                }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {v.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Section 3: Speed Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
              VOICE SPEED
            </span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary-light)', padding: '2px 8px', borderRadius: '10px' }}>
              {speed.toFixed(2)}×
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.25"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--color-primary)' }}
          />
        </div>

        {/* Section 4: Whiteboard Font */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 8, letterSpacing: '0.05em' }}>
            BOARD FONT
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              onClick={() => setBoardFont('handwriting')}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: `2px solid ${boardFont === 'handwriting' ? 'var(--color-primary)' : 'var(--border-muted)'}`,
                background: boardFont === 'handwriting' ? 'var(--color-primary-light)' : '#ffffff',
                fontFamily: 'Virgil, sans-serif',
                fontSize: '0.9rem'
              }}
            >
              Handwriting
            </button>
            <button
              onClick={() => setBoardFont('standard')}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: `2px solid ${boardFont === 'standard' ? 'var(--color-primary)' : 'var(--border-muted)'}`,
                background: boardFont === 'standard' ? 'var(--color-primary-light)' : '#ffffff',
                fontSize: '0.9rem'
              }}
            >
              Standard
            </button>
          </div>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
          Saved — new voice and speed will take effect from your next study round.
        </p>
      </div>
    </div>
  );
};
