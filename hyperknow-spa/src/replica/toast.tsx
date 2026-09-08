import React, { useEffect, useState } from 'react';

/**
 * 全局轻提示:任何交互都必须有可见反馈。
 * 用模块级订阅而不是 AppState——toast 是纯 UI 副作用,不该参与路由/状态快照。
 */

interface ToastItem {
  id: number;
  text: string;
}

let seq = 0;
let items: ToastItem[] = [];
const listeners = new Set<(list: ToastItem[]) => void>();

const emit = () => listeners.forEach((l) => l([...items]));

export function toast(text: string): void {
  const id = ++seq;
  items = [...items, { id, text }];
  emit();
  window.setTimeout(() => {
    items = items.filter((i) => i.id !== id);
    emit();
  }, 2800);
}

export const ToastHost: React.FC = () => {
  const [list, setList] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.add(setList);
    setList([...items]);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  if (list.length === 0) return null;
  return (
    <div className="hk-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="hk-toast">
          {t.text}
        </div>
      ))}
    </div>
  );
};
