// isolate 级 TTL 文档缓存的纯核心:不依赖 Cloudflare/Next/React,可在 Node 契约
// 测试中直接覆盖命中/过期/失效/竞争语义。env 门控与 D1 接线留在 docs.ts。
//
// generation 机制防并发陈旧回填:读侧在发起异步 D1 查询前记下 generation,
// 写回时若 generation 已变(查询期间发生过 invalidate),则丢弃本次结果——
// 否则"读 miss → 写方更新并失效 → 旧查询返回后把旧值重新写回"会让写入
// isolate 再陈旧一个完整 TTL。
export type DocDataCache<Meta> = {
  generation: () => number;
  getMetas: (now: number) => Meta[] | null;
  setMetas: (rows: Meta[], atGeneration: number, now: number) => void;
  getBody: (id: string, now: number) => string | null;
  setBody: (id: string, body: string, atGeneration: number, now: number) => void;
  invalidate: () => void;
};

export function createDocDataCache<Meta>(ttlMs: number): DocDataCache<Meta> {
  let generation = 0;
  let metas: { at: number; rows: Meta[] } | null = null;
  // 正文按文档 id 缓存,规模被文档总数自然约束,不设独立淘汰。
  const bodies = new Map<string, { at: number; body: string }>();

  const fresh = (at: number, now: number) => now - at < ttlMs;

  return {
    generation: () => generation,
    getMetas: (now) => (metas && fresh(metas.at, now) ? metas.rows : null),
    setMetas: (rows, atGeneration, now) => {
      if (atGeneration !== generation) return; // 失效前发起的旧查询,结果不得回填
      metas = { at: now, rows };
    },
    getBody: (id, now) => {
      const hit = bodies.get(id);
      return hit && fresh(hit.at, now) ? hit.body : null;
    },
    setBody: (id, body, atGeneration, now) => {
      if (atGeneration !== generation) return;
      bodies.set(id, { at: now, body });
    },
    invalidate: () => {
      generation += 1;
      metas = null;
      bodies.clear();
    },
  };
}
