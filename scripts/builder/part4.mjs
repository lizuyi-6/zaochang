// 第四部分 · 速度的极点: 高速缓冲存储器 Cache (14 ~ 19)
export const part4Docs = [
  {
    id: "doc:hello-computer-part-4",
    slug: "part-4",
    parentId: "'doc:book-hello-computer'",
    title: "第四部分 · 速度的极点: 高速缓冲存储器 Cache",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-computer-14-cache-mapping",
    slug: "14-cache-mapping",
    parentId: "'doc:hello-computer-part-4'",
    title: "14 Cache 映射机制与 32 位地址黄金切分法",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 14,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 14 Cache 映射机制与 32 位地址黄金切分法

## 1. 408 必考大题原型

> **【408 典型真题】**：设某计算机主存地址空间大小为 4GB（32 位地址），按字节编址。数据 Cache 容量为 32KB，Cache 块大小（Cache Line）为 64 字节，采用 4 路组相联映射方式。
> 问：CPU 发出的 32 位主存地址如何划分为 Tag（主存标记）、Index（组号）和 Offset（块内偏移）？各占多少位？

这是历年 408 试卷中每年必考的固定大题。很多同学背了一堆公式，考场上一紧张，位长算错 1 位，整道 15 分的大题直接扣光。

---

## 2. 硬件脑内模型：黄金三刀切分法

把 32 位主存物理地址想象成一根完整的木棍，**从右向左切两刀**，精准切成三段：

\`\`\`
+--------------------------+-----------------------+-------------------------+
|    主存标记 (Tag)         |   Cache 组号 (Index)   |   块内偏移 (Offset)      |
+--------------------------+-----------------------+-------------------------+
\`\`\`

### 第一刀（最右边）：切出【块内偏移 Offset】
- **物理目的**：在一个已经装入 Cache 的数据块（Block，共 64 字节）中，精确定位你要读取的那个特定字节。
- **计算法则**：块大小 $B = 64 \text{ 字节} = 2^6 \implies$ **Offset 占 6 位**。
- **铁律原则**：**Offset 只与“块大小”相关**，与 Cache 总容量、组相联度完全无关！

### 第二刀（中间）：切出【Cache 组号 Index】
- **物理目的**：硬件拿着这几个比特，直接作为索引驱动译码器选中 Cache 的某一组。
- **计算法则**：
  1. $\text{Cache 总行数} = \frac{\text{Cache 总容量}}{\text{块大小}} = \frac{32\text{KB}}{64\text{B}} = 512 \text{ 行}$；
  2. $\text{Cache 组数 } S = \frac{\text{总行数}}{\text{相联度 } W} = \frac{512}{4} = 128 \text{ 组}$；
  3. $128 = 2^7 \implies$ **Index 占 7 位**。

### 第三刀（剩余最左边）：切出【主存标记 Tag】
- **物理目的**：挂在 Cache 行的元数据里，用来比对当前 Cache 存的到底是不是你要的那块主存数据。
- **计算法则**：**总地址位数 - Index 位数 - Offset 位数**：
  $$\text{Tag 位数} = 32 - 7 - 6 = 19 \text{ 位}$$

---

## 3. 硬件数据通路与比较器判定结构

\`\`\`mermaid
flowchart TD
    ADDR["32 位 CPU 物理地址"]
    ADDR --> TAG_FIELD["Tag [31:13] (19 位)"]
    ADDR --> SET_FIELD["组号 Index [12:6] (7 位)"]
    ADDR --> OFF_FIELD["块内偏移 Offset [5:0] (6 位)"]

    SET_FIELD ==>|7位索引| DECODER["128 选 1 译码器"]
    DECODER ==> TARGET_SET["选中 Cache 第 Index 组 (共 4 个 Way)"]

    TARGET_SET --> LINE0["Way 0: [Valid][Dirty][Tag 0][64B Data]"]
    TARGET_SET --> LINE1["Way 1: [Valid][Dirty][Tag 1][64B Data]"]
    TARGET_SET --> LINE2["Way 2: [Valid][Dirty][Tag 2][64B Data]"]
    TARGET_SET --> LINE3["Way 3: [Valid][Dirty][Tag 3][64B Data]"]

    TAG_FIELD ==> COMP0["19 位硬件比较器 0"]
    TAG_FIELD ==> COMP1["19 位硬件比较器 1"]
    TAG_FIELD ==> COMP2["19 位硬件比较器 2"]
    TAG_FIELD ==> COMP3["19 位硬件比较器 3"]

    LINE0 -.Tag 0.-> COMP0
    LINE1 -.Tag 1.-> COMP1
    LINE2 -.Tag 2.-> COMP2
    LINE3 -.Tag 3.-> COMP3

    COMP0 & COMP1 & COMP2 & COMP3 --> OR_GATE["或门 (HIT 判定)"]
    OR_GATE -->|HIT 命中| MUX["多路选择器 -> 依据 Offset 读出字节送 CPU"]
    OR_GATE -->|MISS 缺失| MEM_FETCH["向主存 DRAM 发起读块请求"]
\`\`\`

---

## 4. 跑一个具体地址访问追踪：\`0x00401020\`

将物理地址 \`0x00401020\` 转换为二进制并切分：
- 32 位二进制：\`0000 0000 0100 0000 0001 0000 0010 0000\`
- **Tag 标记（高 19 位）**：\`0000 0000 0100 0000 000\`（十六进制 \`0x00200\`）；
- **Index 组号（中间 7 位）**：\`1000000\`（十进制第 64 组）；
- **Offset 偏移（低 6 位）**：\`100000\`（十进制第 32 字节）。

硬件流程：
1. 提取中间 7 位 \`64\`，直接选中第 64 组；
2. 4 个比较器同时比对该组 4 行中的 Tag 是否等于 \`0x00200\` 且 Valid=1；
3. 若命中，根据 Offset \`32\` 读出第 32 号字节送 CPU！

---

## 5. 本章小结

- 右一刀 Offset（看块大小），中间一刀 Index（看组数），剩余全归 Tag；
- 比较器数量严格等于相联度（Way 数），比较器宽度等于 Tag 位数。
`
  },
  {
    id: "doc:hello-computer-15-direct-fully-assoc",
    slug: "15-direct-fully-assoc",
    parentId: "'doc:hello-computer-part-4'",
    title: "15 直接映射与全相联映射",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 15,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 15 直接映射与全相联映射

## 1. 映射机制的两极对比

| 映射方式 | 映射规则 | 硬件比较器数量 | 冲突缺失率 | 硬件开销 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **直接映射 (Direct Mapped)** | 每个主存块**只能放入 Cache 固定的某一行** ($j = i \pmod C$) | 只需要 **1 个**比较器 | **最高**（极易发生抖动 Thrashing） | 极低 | 极大容量 L3 Cache |
| **全相联映射 (Fully Associative)** | 主存块**可以放入 Cache 任意一行** | 需要 **$N$ 个**比较器（$N$ 为总行数） | **最低** | 极高（面积与功耗巨大） | 极小容量硬件（如 TLB 快表） |
| **组相联映射 (Set Associative)** | 折中：主存块映射到固定组，组内任意放 | **$k$ 个**比较器 | 介于二者之间 | 适中 | 现代 CPU L1/L2 Cache |

\`\`\`mermaid
flowchart TD
    MAP["Cache 映射的三种模式"]
    MAP --> D["直接映射 (相联度 k = 1) <br/> 地址: [Tag][Line Index][Offset]"]
    MAP --> SA["组相联映射 (1 < k < N) <br/> 地址: [Tag][Set Index][Offset]"]
    MAP --> FA["全相联映射 (k = N) <br/> 地址: [Tag][Offset] (无组号段)"]
\`\`\`

## 2. 本章小结

- 直接映射相联度为 1，冲突率高但硬件极简；
- 全相联相联度为总行数，地址中没有组号字段，所有行并行比较。
`
  },
  {
    id: "doc:hello-computer-16-set-associative",
    slug: "16-set-associative",
    parentId: "'doc:hello-computer-part-4'",
    title: "16 组相联映射与 408 核心大题深度剖析",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 16,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 16 组相联映射与 408 核心大题深度剖析

## 1. 408 杀手级考点：Cache 总容量（总比特数）计算

408 最喜欢在选择题和大题中提问：**“该 Cache 的总存储容量（含数据和标记元数据）是多少位/字节？”**

### 必背元数据字段构成
每个 Cache 行物理上包含：
1. **数据区（Data Field）**：$\text{块大小 } B \times 8 \text{ 位}$；
2. **有效位（Valid Bit）**：固定 **1 位**（1 表示已缓存有效数据，0 表示无效）；
3. **脏位（Dirty Bit）**：采用写回法（Write-Back）时为 **1 位**（全写法无脏位）；
4. **替换标记位（LRU / FIFO）**：$k$ 路组相联采用 LRU 时，每行需 $\log_2 k \text{ 位}$（或每组整体分配）；
5. **主存标记（Tag）**：$\text{Tag 位数}$。

$$\text{单个 Cache 行的总比特数} = \text{数据位数} + 1(\text{Valid}) + 1(\text{Dirty}) + \log_2 k(\text{LRU}) + \text{Tag 位数}$$
$$\text{Cache 总开销容量} = \text{总行数} \times \text{单个 Cache 行的总比特数}$$

---

## 2. 跑一个具体大题计算案例

### 题目：
32 位物理地址，Cache 容量 64KB，块大小 32 字节，采用 8 路组相联，写策略采用写回法，替换策略采用 LRU。
求：该 Cache 的总容量是多少比特？

### 计算步骤：
1. 块大小 $32\text{B} = 2^5 \implies \text{Offset} = 5 \text{ 位}$；
2. 总行数 $= \frac{64\text{KB}}{32\text{B}} = 2048 \text{ 行}$；
3. 组数 $S = \frac{2048}{8} = 256 \text{ 组} = 2^8 \implies \text{Index} = 8 \text{ 位}$；
4. $\text{Tag 位数} = 32 - 8 - 5 = 19 \text{ 位}$；
5. 元数据位：
   - $\text{Valid} = 1 \text{ 位}$；
   - $\text{Dirty} = 1 \text{ 位}$（写回法）；
   - $\text{LRU} = \log_2 8 = 3 \text{ 位}$；
   - $\text{Tag} = 19 \text{ 位}$；
   - 元数据合计 $= 1 + 1 + 3 + 19 = 24 \text{ 位}$；
6. 单行总位数 $= 32 \times 8 + 24 = 256 + 24 = 280 \text{ 比特}$；
7. **Cache 总容量** $= 2048 \times 280 = 573,440 \text{ 比特} = 71.68 \text{ KB}$！

---

## 3. 本章小结

- 计算 Cache 总容量时，绝不能只算数据区，必须把 Valid、Dirty、LRU、Tag 全部累加！
`
  },
  {
    id: "doc:hello-computer-17-lru-replacement",
    slug: "17-lru-replacement",
    parentId: "'doc:hello-computer-part-4'",
    title: "17 Cache 替换算法: LRU 计数器硬件实现与 FIFO",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 17,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 17 Cache 替换算法: LRU 计数器硬件实现与 FIFO

## 1. 四大替换算法对比

1. **LRU (Least Recently Used, 最近最少使用)**：
   - 依据时间局部性，淘汰最久未被访问的行，命中率最高；
   - 硬件使用 2 位计数器或堆栈实现。
2. **FIFO (First In First Out, 先进先出)**：
   - 淘汰最早装入的行，未考虑局部性，可能出现 Belady 异常。
3. **LFU (Least Frequently Used, 最不经常使用)**：
   - 淘汰访问计数值最小的行。
4. **RAND (Random, 随机替换)**：
   - 硬件最简单，但可能淘汰刚装入的高频行。

---

## 2. LRU 计数器硬件动态更新规则（408 核心）

以 4 路组相联（每组 4 行，计数器占 2 位，取值 0~3）为例：
- **命中时**：被命中的行计数器**清零**，组内比它原来计数器值小的所有行**计数器加 1**，其余不变；
- **缺失换入时**：淘汰计数器值为 3 的行，新行装入并**清零**，其余所有行**计数器加 1**。

---

## 3. 本章小结

- LRU 计数器值越大代表越久未被访问；
- 替换永远挑计数器达到最大值 $(k-1)$ 的行。
`
  },
  {
    id: "doc:hello-computer-18-cache-write-policy",
    slug: "18-cache-write-policy",
    parentId: "'doc:hello-computer-part-4'",
    title: "18 Cache 写策略: 写回法、全写法、写分配与 Dirty 脏位",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 18,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 18 Cache 写策略: 写回法、全写法、写分配与 Dirty 脏位

## 1. 写命中的两种策略

\`\`\`mermaid
flowchart TD
    HIT["写操作命中 Cache"] --> WB["1. 写回法 (Write-Back)<br/>只修改 Cache 中的行, 将 Dirty 脏位置 1<br/>直到该行被替换时才写回主存 (访存次数极少)"]
    HIT --> WT["2. 全写法 / 直写 (Write-Through)<br/>同时写入 Cache 和主存<br/>常配有 Write Buffer 写缓冲"]
\`\`\`

---

## 2. 写缺失的两种策略

\`\`\`mermaid
flowchart TD
    MISS["写操作未命中 Cache"] --> WA["1. 写分配法 (Write-Allocate)<br/>先从主存把对应块调入 Cache, 然后在 Cache 中写入<br/>(通常与【写回法】搭配使用)"]
    MISS --> NWA["2. 非写分配法 (Not-Write-Allocate)<br/>直接向主存写入, 不把块调入 Cache<br/>(通常与【全写法】搭配使用)"]
\`\`\`

---

## 3. 408 黄金搭配（必背）

- **写回法 + 写分配法 (Write-Back + Write-Allocate)**：当代 CPU L1/L2 Cache 最主流方案；
- **全写法 + 非写分配法 (Write-Through + No-Write-Allocate)**。

---

## 4. 本章小结

- 写回法必须配 Dirty 脏位；
- 脏位为 1 且被淘汰时才触发写回主存操作。
`
  },
  {
    id: "doc:hello-computer-19-multi-level-cache",
    slug: "19-multi-level-cache",
    parentId: "'doc:hello-computer-part-4'",
    title: "19 多级 Cache 架构与指令/数据 Cache 分离",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 19,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 19 多级 Cache 架构与指令/数据 Cache 分离

## 1. 平均访存时间 (AMAT) 计算公式

$$\text{AMAT} = T_{\text{L1}} + \text{MissRate}_{\text{L1}} \times (T_{\text{L2}} + \text{MissRate}_{\text{L2}} \times T_{\text{Mem}})$$

---

## 2. 为什么 L1 Cache 要将指令与数据分离？

在 CPU 流水线中：
- 取指阶段（IF）需要读指令；
- 访存阶段（MEM）需要读写数据。

若采用单一统一 Cache，IF 和 MEM 将在同一个时钟周期争抢 Cache 端口，产生**结构冒险（Structural Hazard）**！
**将 L1 分离为 L1 I-Cache（指令）和 L1 D-Cache（数据）**，从物理上消除了结构冲突。

---

## 3. 本章小结

- 多级 Cache 逐级过滤访存缺失；
- L1 分离设计是为了满足 5 级流水线单周期并发存取。
`
  }
];
