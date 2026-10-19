// 服务端拼 HTML 时的最小转义。状态页等公开页面要把用户/运营提供的文本
// (评审阶段、备注)插进 HTML,必须过这里;宁可重复也不要在各路由里各写一份 replace。
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

// 属性值场景(带引号包裹)与 escapeHtml 同语义,单引号也转,可安全用于 alt/href/title。
export { escapeHtml as escapeHtmlAttribute };
