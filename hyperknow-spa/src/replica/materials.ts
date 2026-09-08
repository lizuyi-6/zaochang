/**
 * 课程材料:走主站真实上传端点(/api/uploads,purpose=general,私有),
 * 上传成功后把 {name,url,size} 记在本课程(按账户+课程名隔离)的本地清单里,
 * 供课程页"资料"标签展示。清单只存引用,文件本体在 R2/uploaded_files。
 */

export interface CourseMaterial {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  addedAt: number;
}

const storageKey = (scope: string): string => `hk_materials:${scope}`;

export function loadMaterials(scope: string): CourseMaterial[] {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CourseMaterial[];
    return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.name === 'string') : [];
  } catch {
    return [];
  }
}

function persist(scope: string, list: CourseMaterial[]): void {
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(list));
  } catch {
    /* 存储不可用 → 材料仅本次会话可见 */
  }
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 上传失败返回 null(调用方 toast);成功返回材料行并已写入清单。 */
export async function uploadMaterial(scope: string, file: File): Promise<CourseMaterial | null> {
  const material = await uploadFile(file);
  if (!material) return null;
  persist(scope, [material, ...loadMaterials(scope)]);
  return material;
}

/** 只上传、不记账(白板"加图片"这类一次性附件用)。失败返回 null。 */
export async function uploadFile(file: File): Promise<CourseMaterial | null> {
  const form = new FormData();
  form.append('file', file);
  form.append('visibility', 'private');
  form.append('purpose', 'general');
  let res: Response;
  try {
    res = await fetch('/api/uploads', { method: 'POST', body: form });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    key?: string;
    name?: string;
    type?: string;
    size?: number;
    url?: string;
  };
  return {
    id: data.key ?? `${Date.now()}`,
    name: data.name ?? file.name,
    size: data.size ?? file.size,
    type: data.type ?? file.type,
    url: data.url ?? '',
    addedAt: Date.now(),
  };
}

export function removeMaterial(scope: string, id: string): CourseMaterial[] {
  const next = loadMaterials(scope).filter((m) => m.id !== id);
  persist(scope, next);
  return next;
}
