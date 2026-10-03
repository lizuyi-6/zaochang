/**
 * 旁白文本净化:LLM 偶发违反"纯口语"约定,把 <strong> 等 HTML 标签漏进
 * spoken_text(实测贝叶斯讲"核心术语预教"步)——字幕栏原样显示标签,TTS 更会把
 * "strong"当词读出来。 spoken_text 的契约是纯散文,所以适配层一律剥离标签、
 * 解码实体、收敛空白:字幕/对答面板/TTS 预热同吃这一条数据,源头一处修。
 */

const BASIC_ENTITIES: Array<[RegExp, string]> = [
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;|&apos;/g, "'"],
  [/&nbsp;/g, ' '],
];

export function sanitizeNarration(text: string): string {
  if (!text) return '';
  let out = text;
  // 只剥"像标签"的段:< 后紧跟字母或 /(标签名起始),如 <strong>/</em>/<br/>。
  // 数学比较"x < y 且 y > 0"里的 < 后跟空格,不在此列,正文不被误吞。
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  for (const [re, rep] of BASIC_ENTITIES) out = out.replace(re, rep);
  // 标签剥除后的残留:多余空白收敛(换行/制表 → 单空格;连续空格 → 一个)
  out = out.replace(/\s+/g, ' ').trim();
  // 剥标签造成的粘连空格补正:中文标点前不留空格
  out = out.replace(/\s+([，。！？；：、…）】”’])/g, '$1');
  return out;
}
