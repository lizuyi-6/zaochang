// 第五部分 · 空间无限的假象: 虚拟存储系统 (20 ~ 22)
export const part5Docs = [
  {
    id: "doc:hello-computer-part-5",
    slug: "part-5",
    parentId: "'doc:book-hello-computer'",
    title: "第五部分 · 空间无限的假象: 虚拟存储系统",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 6,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-computer-20-virtual-memory",
    slug: "20-virtual-memory",
    parentId: "'doc:hello-computer-part-5'",
    title: "20 虚拟存储器的本质与页式、段式映射",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 20,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 20 虚拟存储器的本质与页式、段式映射

## 1. 一个真实问题

在早期的 DOS 系统中，程序员编写的代码可以直接访问物理内存地址 \`0x00000000\` 到 \`0x000FFFFF\`。
如果程序 A 出现指针越界，写了一句 \`*(0x1000) = 0\`，而 \`0x1000\` 正好是操作系统内核代码所在的位置，整台计算机瞬间蓝屏死机。

更棘手的是：如果物理内存只有 4GB，而用户想同时运行两个各自需要 3GB 内存的大型游戏，物理内存根本装不下。

现代操作系统是如何让每个进程都产生一种**“我独占了整台机器全部 4GB/64TB 连续内存空间”**的完美假象的？

---

## 2. 虚拟内存的三大终极使命

\`\`\`mermaid
flowchart TD
    VM["虚拟内存系统 (Virtual Memory)"]
    VM --> M1["1. 空间扩展: 以廉价硬盘作为后备, 提供远超物理内存的虚拟空间"]
    VM --> M2["2. 进程隔离与安全保护: 进程只能看到自己的虚地址, 无法非法访问他人内存"]
    VM --> M3["3. 离散分配: 物理内存无需连续, 彻底解决外部碎片问题"]
\`\`\`

---

## 3. 页式 vs 段式 vs 段页式存储管理

| 维度 | 分页存储管理 (Paging) | 分段存储管理 (Segmentation) | 段页式存储管理 |
| :--- | :--- | :--- | :--- |
| **划分依据** | **纯物理划分**（固定大小，如 4KB） | **逻辑信息单位**（如代码段、数据段、栈段） | 先按逻辑分段，段内再分页 |
| **对程序员透明度** | **完全透明**（程序员和编译器无感知） | **不透明**（汇编中显式使用段选择子） | 不透明（逻辑分段），页内透明 |
| **碎片类型** | **无外部碎片，只有页内内部碎片** | **无内部碎片，容易产生外部碎片** | 只有页内内部碎片 |
| **地址维度** | **一维地址空间**（虚页号 + 页内偏移） | **二维地址空间**（段号 + 段内偏移） | 二维地址空间（段号 + 段内页号 + 页内偏移） |

---

## 4. 本章小结

- 虚拟内存是软硬件协同的杰作（CPU MMU + 操作系统）；
- 分页按固定大小切分，彻底消除外部碎片。
`
  },
  {
    id: "doc:hello-computer-21-tlb-page-table",
    slug: "21-tlb-page-table",
    parentId: "'doc:hello-computer-part-5'",
    title: "21 快表 TLB 与两级页表硬件转换",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 21,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 21 快表 TLB 与两级页表硬件转换

## 1. 单级页表的内存爆炸难题

在 32 位系统中，页面大小设为 4KB（$2^{12} \text{ B}$）：
- 虚拟地址总共有 $2^{32} / 2^{12} = 2^{20} = 1\text{M}$ 个虚拟页！
- 若每个页表项占 4 字节，单个进程的页表大小为：
  $$10^6 \times 4\text{B} = 4\text{MB}$$
- 操作系统如果有 100 个进程，单单保存页表就要白白消耗 400MB 物理内存！而且页表必须在物理内存中**连续存放**。

---

## 2. 两级页表结构：只为实际使用的虚拟空间分配页表

32 位虚拟地址被切分为：
\`\`\`
+-----------------------+-----------------------+-------------------------+
|   一级页号 (10 位)    |   二级页号 (10 位)    |    页内偏移 (12 位)     |
+-----------------------+-----------------------+-------------------------+
\`\`\`

- **顶级页目录（Page Directory）**：固定只占 1 个页面（$2^{10} \times 4\text{B} = 4\text{KB}$），保存二级页表的基址；
- **按需分配**：如果进程只使用了几兆内存，未使用的顶级页目录项全填 0，根本不需要创建对应的二级页表！

---

## 3. 快表 TLB（Translation Lookaside Buffer）

单级页表访存需要 2 次内存访问（查页表 1 次 + 取数据 1 次）；两级页表需要 3 次内存访问。
为了消除页表查询时延，MMU 内部集成了一个专用的极速全相联/组相联缓存——**快表 TLB**。

\`\`\`mermaid
flowchart TD
    VA["虚拟地址 (VA)"] --> SPLIT["提取虚拟页号 (VPN)"]
    SPLIT --> TLB_LOOKUP["查询 TLB 快表 (硬件全并行匹配)"]
    
    TLB_LOOKUP -->|TLB 命中 HIT| PA_GEN["直接组合出物理页号 (PPN) -> 生成物理地址 (PA)"]
    TLB_LOOKUP -->|TLB 缺失 MISS| PT_WALK["走慢速内存页表 (Page Walk)"]
    
    PT_WALK -->|页表命中 (有效位=1)| UPDATE_TLB["装入 PPN -> 更新 TLB -> 生成 PA"]
    PT_WALK -->|页表缺失 (有效位=0)| PAGE_FAULT["触发【缺页异常 (Page Fault)】<br/>CPU 陷入内核态, 从磁盘调页"]
\`\`\`

---

## 4. 本章小结

- 两级页表解决空间爆炸（按需离散分配）；
- TLB 解决时间延迟（纳秒级地址直译）。
`
  },
  {
    id: "doc:hello-computer-22-full-va-pa-cache",
    slug: "22-full-va-pa-cache",
    parentId: "'doc:hello-computer-part-5'",
    title: "22 408 世纪大题全景链路: 从虚拟地址到 Cache 的惊涛骇浪",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 22,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 22 408 世纪大题全景链路: 从虚拟地址到 Cache 的惊涛骇浪

## 1. 408 综合大题终极大图

当 CPU 发出一个虚拟地址 $VA$，从 TLB 转换到主存和 Cache 的全景时空链路：

\`\`\`mermaid
flowchart TD
    CPU["CPU 发出虚拟地址 VA"] --> TLB_CHECK{"1. 查 TLB 快表?"}
    
    TLB_CHECK -->|命中 TLB Hit| GET_PA["直接获得物理页号 PPN<br/>拼接页内偏移得到物理地址 PA"]
    TLB_CHECK -->|缺失 TLB Miss| PAGE_TABLE{"2. 查内存页表 (MMU Page Walk)?"}
    
    PAGE_TABLE -->|页表命中 (在内存)| LOAD_TLB["回填 TLB -> 拼接得到 PA"]
    PAGE_TABLE -->|页表缺失 (有效位=0)| TRAP["3. 触发【缺页异常 (Page Fault)】<br/>陷入 OS 内核, 阻塞当前进程<br/>从磁盘读取页面写入内存, 更新页表"] --> LOAD_TLB
    
    GET_PA --> CACHE_CHECK{"4. 查 L1 Cache (根据 PA 的 Tag/Index)?"}
    
    CACHE_CHECK -->|Cache 命中| FAST_RETURN["纳秒级将数据返回 CPU 核心！"]
    CACHE_CHECK -->|Cache 缺失| READ_DRAM["从主存 DRAM 读出数据块<br/>回填 Cache -> 返回 CPU 核心"]
\`\`\`

---

## 2. 408 终极因果真值表（死穴必背）

| 组合状态 | TLB 状态 | 页表状态 | Cache 状态 | 是否可能发生？原因深度剖析 |
| :--- | :--- | :--- | :--- | :--- |
| **状态 1** | **命中** | **命中** | **命中** | **可能**（最理想极速全命中路径） |
| **状态 2** | **命中** | **命中** | **缺失** | **可能**（地址成功转换，但数据未入 Cache） |
| **状态 3** | **缺失** | **命中** | **命中** | **可能**（TLB 刚被刷掉，但数据早就缓存在 Cache 中） |
| **状态 4** | **缺失** | **命中** | **缺失** | **可能**（常规慢速查表与访存） |
| **状态 5** | **缺失** | **缺失 (缺页)** | **缺失** | **可能**（页面在磁盘，触发缺页中断） |
| **异常 1** | **命中** | **缺失 (缺页)** | 任意 | **绝对不可能！**（TLB 是页表的子集，TLB 命中意味着页表必然命中！） |
| **异常 2** | 任意 | **缺失 (缺页)** | **命中** | **绝对不可能！**（数据连物理内存都没进，Cache 绝不可能凭空拥有它！） |

---

## 3. 本章小结

- TLB 命中则页表必命中；
- 缺页（页表缺失）则 Cache 必缺失；
- 缺页是异常（软件 OS 处理），Cache 缺失由硬件全自动处理。
`
  }
];
