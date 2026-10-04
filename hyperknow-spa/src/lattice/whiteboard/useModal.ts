import { useEffect, useRef } from 'react';

/** W4(2026-10 审计):弹窗可访问性三件套——role="dialog" + aria-modal、Tab 焦点陷阱、
 * Esc 关闭与关闭后焦点还原到触发元素。用法:
 *   const modal = useModal(onClose);
 *   <div {...modal.containerProps} ref={modal.cardRef} className="wb-…-card">…
 * 关闭回调经 ref 持有,父组件重渲染不会重跑焦点逻辑(输入框中打字不被打断)。 */
export function useModal(onRequestClose: () => void) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;

  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusables = cardRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      restoreRef.current?.focus?.();
    };
  }, []);

  return {
    cardRef,
    containerProps: { role: 'dialog' as const, 'aria-modal': true as const, tabIndex: -1 },
  };
}
