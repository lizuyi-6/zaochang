// 「今日值得学」动态资讯源纯函数契约(feed.ts):按日+轮次选词、合并去重。
import test from 'node:test';
import assert from 'node:assert/strict';

import { beijingDayKey, feedQueries, mergeFeedItems } from '../app/api/_lib/hyperknow/feed.ts';

test('beijingDayKey: UTC+8 日期锚(UTC 16:00 后仍算当日北京日期)', () => {
  // 2026-10-01T17:00:00Z = 北京 2026-10-02 01:00
  assert.equal(beijingDayKey(Date.UTC(2026, 9, 1, 17, 0, 0)), '2026-10-02');
  // 2026-10-01T15:00:00Z = 北京 2026-10-01 23:00
  assert.equal(beijingDayKey(Date.UTC(2026, 9, 1, 15, 0, 0)), '2026-10-01');
});

test('feedQueries:同日同轮恒定,换轮/换日出新,恒 3 词且不重复', () => {
  const a = feedQueries('2026-10-01', 0);
  const a2 = feedQueries('2026-10-01', 0);
  const b = feedQueries('2026-10-01', 1);
  const c = feedQueries('2026-10-02', 0);
  assert.deepEqual(a, a2, '同日同轮必须确定性一致');
  assert.notDeepEqual(a, b, '换一批(轮次+1)必须换词');
  assert.notDeepEqual(a, c, '换日必须换词');
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3, '同批检索词不得重复');
  // 连续轮次覆盖不重复词(池 12 词,4 轮恰好铺满一轮)
  const all = new Set([0, 1, 2, 3].flatMap((r) => feedQueries('2026-10-01', r)));
  assert.equal(all.size, 12);
  // 坏输入不抛
  assert.equal(feedQueries('bad-input', 0).length, 3);
});

test('mergeFeedItems:去重/仅 http(s)/短标题剔除/截断 12/域名提取', () => {
  const g1 = [
    { title: '人工智能新进展报告', url: 'https://example.com/a?x=1' },
    { title: '航天任务再传捷报', url: 'http://news.org/b' },
    { title: '人工智能新进展报告续篇', url: 'https://example.com/a' }, // 同去协议 URL,去重
    { title: '短标题', url: 'https://short.cn/s' }, // 有效字符不足 6,栏目页剔除
    { title: 'ftp://example.com/f', url: 'ftp://example.com/f' }, // 非 http(s) 过滤
  ];
  const g2 = [
    { title: '', url: 'https://bare.io/c' }, // 空标题回退 URL
  ];
  const items = mergeFeedItems([g1, g2]);
  assert.equal(items.length, 3);
  assert.equal(items[0].source, 'example.com');
  assert.equal(items[1].source, 'news.org');
  assert.equal(items[2].title, 'https://bare.io/c');
  // 截断:两组共 20 条只留 12
  const big = mergeFeedItems([
    Array.from({ length: 15 }, (_, i) => ({ title: `新闻标题第${i}号`, url: `https://x.com/${i}` })),
    Array.from({ length: 15 }, (_, i) => ({ title: `另一批新闻第${i}篇`, url: `https://y.com/${i}` })),
  ]);
  assert.equal(big.length, 12);
  assert.equal(big.every((it) => it.source.includes('.')), true);
});

test('mergeFeedItems:新鲜优先(带时间倒序,无时间按原序垫后)+脏标题剔除', () => {
  const items = mergeFeedItems([
    [
      { title: '两年前的旧闻报道一则', url: 'https://old.com/a', time: '2022-01-30 00:00:00' },
      { title: '无时间戳的正常报道', url: 'https://bare.io/d' },
      { title: '昨日的最新研究进展', url: 'https://fresh.com/b', time: '2026-09-30T08:00:00' },
      { title: '时间字段异常的报道', url: 'https://weird.com/e', time: 'not-a-date' },
      { title: 'FEATURE ![](images/x.jpg)', url: 'https://junk.com/f' }, // 图链脏数据剔除
    ],
  ]);
  assert.deepEqual(items.map((it) => it.title), ['昨日的最新研究进展', '两年前的旧闻报道一则', '无时间戳的正常报道', '时间字段异常的报道']);
});
