/** 讲稿 focus → 白板世界坐标矩形;纯数据计算,不访问 DOM。 */
import type { LiveFocus, LiveLecturePlan } from '../backend';
import type { BoardAnnot, BoardItem } from './lessonScript';
import { diagramBox, renderDiagram } from './diagram';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TextLineBox extends Rect {
  key: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function compact(text: string): string {
  return decodeEntities(text).replace(/\s+/gu, '');
}

function bulletRects(content: string, bodyItems: BoardItem[], bullet: number): Rect[] {
  const bulletNodes = [...content.matchAll(/<li(?:\s[^>]*)?>([\s\S]*?)<\/li\s*>/gi)];
  const bulletNode = bulletNodes[bullet - 1];
  const target = bulletNode ? compact((bulletNode[1] ?? '').replace(/<[^>]*>/g, '')) : '';
  if (!target) return [];

  const lines: TextLineBox[] = [];
  const chars: string[] = [];
  const owners: TextLineBox[] = [];
  for (const item of bodyItems) {
    const lineHeight = item.mono ? 25 : item.size * 1.24;
    item.lines.forEach((line, lineIndex) => {
      const box: TextLineBox = {
        key: `${item.id}:${lineIndex}`,
        x: item.x,
        y: item.y + lineIndex * lineHeight,
        w: item.w ?? 320,
        h: lineHeight,
      };
      lines.push(box);
      const text = compact(line.map((segment) => segment.t).join(''));
      for (let index = 0; index < text.length; index++) {
        chars.push(text[index]);
        owners.push(box);
      }
    });
  }

  const renderedText = chars.join('');
  // 用 HTML 中该 <li> 前的可见文字长度定位,避免前言含同词时把要点聚光到前言上。
  const visiblePrefix = compact(content.slice(0, bulletNode.index).replace(/<[^>]*>/g, ''));
  const start = renderedText.indexOf(target, visiblePrefix.length);
  if (start < 0) return [];
  const touched = new Map<string, TextLineBox>();
  for (const line of owners.slice(start, start + target.length)) touched.set(line.key, line);
  const selected = lines.filter((line) => touched.has(line.key));
  if (!selected.length) return [];

  const groups: TextLineBox[][] = [];
  for (const line of selected) {
    const prevGroup = groups.at(-1);
    const prevLine = prevGroup?.at(-1);
    if (prevLine && prevLine.x === line.x && line.y <= prevLine.y + prevLine.h + 0.5) prevGroup!.push(line);
    else groups.push([line]);
  }
  return groups.map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    return { x: first.x, y: first.y, w: first.w, h: last.y + last.h - first.y };
  });
}

function targetRects(
  focus: LiveFocus,
  targetIndex: number,
  plan: LiveLecturePlan,
  items: BoardItem[],
): Rect[] {
  const action = plan.steps[targetIndex]?.board_action;
  if (!action) return [];
  const stepNumber = targetIndex + 1;

  if (focus.bullet !== undefined) {
    if (action.type !== 'card' || typeof action.content !== 'string') return [];
    const bodyPrefix = `c${stepNumber}b`;
    const bodyItems = items.filter((item) => item.step === stepNumber && item.id.startsWith(bodyPrefix));
    return bulletRects(action.content, bodyItems, focus.bullet);
  }

  if (focus.node !== undefined) {
    if (action.type !== 'diagram') return [];
    const item = items.find((candidate) => candidate.step === stepNumber && candidate.diagram);
    if (!item?.diagram) return [];
    const rendered = renderDiagram(item.diagram);
    if (!rendered) return [];
    const node = rendered.nodeBoxes.find((box) => box.id === focus.node || box.label === focus.node);
    if (!node) return [];
    const displayed = diagramBox(rendered, item.w ?? 360);
    const scaleX = displayed.w / rendered.w;
    const scaleY = displayed.h / rendered.h;
    return [{
      x: item.x + node.x * scaleX,
      y: item.y + node.y * scaleY,
      w: node.w * scaleX,
      h: node.h * scaleY,
    }];
  }

  if (action.type === 'formula') {
    const item = items.find((candidate) => candidate.step === stepNumber && candidate.formula);
    return item ? [{ x: item.x, y: item.y, w: item.w ?? 320, h: item.h ?? 120 }] : [];
  }
  if (action.type === 'image') {
    const item = items.find((candidate) => candidate.step === stepNumber && candidate.image);
    if (!item) return [];
    const w = item.image?.width ?? item.w ?? 320;
    return [{ x: item.x, y: item.y, w, h: item.h ?? 260 }];
  }
  return [];
}

/**
 * 一步聚光关联讲解步(step),矩形来自目标板书元素(step 可回指旧步)。
 * 无法解析或找不到目标时返回空,不向播放器抛错。
 */
export function focusAnnotationsForPlan(plan: LiveLecturePlan, items: BoardItem[]): BoardAnnot[] {
  const annotations: BoardAnnot[] = [];
  const indexes = new Map<string, number>();
  plan.steps.forEach((step, index) => {
    if (!indexes.has(step.step_id)) indexes.set(step.step_id, index);
  });

  plan.steps.forEach((step, currentIndex) => {
    const focus = step.focus;
    if (!focus || !['circle', 'highlight', 'underline'].includes(focus.kind)) return;
    const targetIndex = indexes.get(focus.step);
    if (targetIndex === undefined || targetIndex > currentIndex) return;
    const rects = targetRects(focus, targetIndex, plan, items);
    rects.forEach((rect, rectIndex) => {
      annotations.push({
        id: `focus-${currentIndex + 1}-${targetIndex + 1}-${rectIndex + 1}`,
        step: currentIndex + 1,
        kind: focus.kind,
        ...rect,
        transient: true,
      });
    });
  });
  return annotations;
}
