'use client';

// 取自 X:/myui 组件库 react-bits/src/ts-default/Micro/ElasticTabs(本地原创资产,柔
// 和极简风:弹簧驱动共享指示条 + roving 键盘焦点 + 完整 tablist ARIA)。
// 宿主适配:
//  1. motion/react → framer-motion(本项目锁定 framer-motion@12,API 同源);
//  2. content 可选 + renderPanels 开关:探索页等内容渲染在共享网格里的场景只用
//     tab 条不用 panel(此时不输出 aria-controls,避免指向不存在的节点)。
import { useState, useRef, useId, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import './elastic-tabs.css';

const c = {
  root: 'lc-elastic-tabs-root',
  track: 'lc-elastic-tabs-track',
  tab: 'lc-elastic-tabs-tab',
  indicator: 'lc-elastic-tabs-indicator',
  label: 'lc-elastic-tabs-label',
  panel: 'lc-elastic-tabs-panel'
};

export interface ElasticTab {
  id: string;
  label: ReactNode;
  content?: ReactNode;
}

export interface ElasticTabsProps {
  items: ElasticTab[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  ariaLabel?: string;
  accent?: string;
  surface?: string;
  ink?: string;
  className?: string;
  /** false 时只渲染 tab 条(内容由宿主自己排版);默认 true 渲染 tabpanel。 */
  renderPanels?: boolean;
}

const motionQuery = '(prefers-reduced-motion: reduce)';
const motionSnapshot = () => typeof window !== 'undefined' && window.matchMedia(motionQuery).matches;
const motionSubscribe = (listener: () => void) => {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
function useMotionPreference() {
  return useSyncExternalStore(motionSubscribe, motionSnapshot, () => false);
}

export default function ElasticTabs({
  items,
  value,
  defaultValue,
  onChange,
  ariaLabel = 'Explore',
  accent = '#d97745',
  surface = '#fff8f1',
  ink = '#3b2d24',
  className = '',
  renderPanels = true
}: ElasticTabsProps) {
  const id = useId();
  const reduce = useMotionPreference();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id);
  const active = items.some((item) => item.id === (value ?? inner)) ? (value ?? inner) : items[0]?.id;
  const choose = (next: string) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    choose(items[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div
      className={[c.root, className].filter(Boolean).join(' ')}
      style={{ '--lc-accent': accent, '--lc-surface': surface, '--lc-ink': ink } as CSSProperties}
    >
      <div role="tablist" aria-label={ariaLabel} className={c.track}>
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={id + '-tab-' + index}
            aria-controls={renderPanels ? id + '-panel-' + index : undefined}
            aria-selected={active === item.id}
            tabIndex={active === item.id ? 0 : -1}
            onClick={() => choose(item.id)}
            onKeyDown={(event) => navigate(event, index)}
            className={c.tab}
          >
            {active === item.id && (
              <motion.span
                aria-hidden="true"
                layoutId={id + '-indicator'}
                className={c.indicator}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 27 }}
              />
            )}
            <span className={c.label}>{item.label}</span>
          </button>
        ))}
      </div>
      {renderPanels && items.map((item, index) => (
        <div
          key={item.id}
          role="tabpanel"
          id={id + '-panel-' + index}
          aria-labelledby={id + '-tab-' + index}
          hidden={active !== item.id}
          tabIndex={0}
          className={c.panel}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
