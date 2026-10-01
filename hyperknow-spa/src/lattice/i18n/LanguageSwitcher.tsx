import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LANGUAGES, useI18n } from './index';

/* 1:1 移植原站语言下拉(rx):portal 到 body、按按钮矩形定位、
   外部 mousedown 关闭;样式复用原站 vendored CSS。 */
export const LanguageSwitcher: React.FC = () => {
  const { lng, entry, t, setLng } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !boxRef.current) return;
    const update = () => {
      const rect = boxRef.current!.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!boxRef.current?.contains(target) && !dropRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const dropdown = open ? (
    <div
      ref={dropRef}
      className="language-dropdown language-dropdown--portal"
      style={{ top: pos.top, right: pos.right }}
      role="listbox"
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          role="option"
          aria-selected={l.code === lng}
          className={`language-option${l.code === lng ? ' active' : ''}`}
          onClick={() => {
            setLng(l.code);
            setOpen(false);
          }}
        >
          <span className="language-option-badge">{l.shortLabel}</span>
          <span>{l.nativeLabel}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="language-switcher-container" ref={boxRef}>
      <button
        type="button"
        className="language-switcher"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('common.switchLanguage')}
        aria-expanded={open}
        title={entry.nativeLabel}
      >
        <span className="language-icon-box">
          <img src={`${import.meta.env.BASE_URL}translate.svg`} alt="" className="language-icon" />
        </span>
      </button>
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
};
