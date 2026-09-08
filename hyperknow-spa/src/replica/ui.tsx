import React from 'react';
import type { ModalProps } from './types';

/** Centered overlay modal. */
export const Modal: React.FC<ModalProps> = ({ onClose, children, scrim = 'white', width }) => (
  <div
    className={`hk-overlay ${scrim}`}
    onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div className="hk-modal" style={width ? { width } : undefined}>
      {children}
    </div>
  </div>
);

export const DarkPill: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  style?: React.CSSProperties;
}> = ({ children, onClick, disabled, small, style }) => (
  <button className={`hk-btn-dark${small ? ' small' : ''}`} onClick={onClick} disabled={disabled} style={style}>
    {children}
  </button>
);

export const GhostPill: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}> = ({ children, onClick, style }) => (
  <button className="hk-btn-ghost" onClick={onClick} style={style}>
    {children}
  </button>
);

/** iOS-style toggle with optional literal state label. */
export const Toggle: React.FC<{ on: boolean; onChange?: (v: boolean) => void; label?: boolean }> = ({
  on,
  onChange,
  label,
}) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span
      role="switch"
      aria-checked={on}
      onClick={() => onChange?.(!on)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: on ? '#4C6696' : '#D8DCE3',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.15s',
        display: 'inline-block',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.15s',
        }}
      />
    </span>
    {label && <span style={{ fontSize: 13, color: '#1F2937' }}>{on ? 'On' : 'Off'}</span>}
  </span>
);
