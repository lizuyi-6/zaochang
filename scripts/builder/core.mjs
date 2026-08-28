// 构建全书 42 章完整正文的生成器脚本 (纯学术严谨风格，禁止一切 AI Emoji)

// 字符串转义工具：SQL 单引号转为双单引号
const esc = (str) => (str ? str.replace(/'/g, "''") : "");

const docs = [];

// 1. 书根节点
docs.push({
  id: "doc:book-hello-computer",
  slug: "hello-computer",
  parentId: "NULL",
  title: "Hello Computer · 图解计算机组成原理",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 0,
  isBook: 1,
  coverHue: 160,
  summary: "像解释算法一样解释计算机组成原理——用图解、数据通路与微实验，攻克考研408计组数据表示、Cache、虚拟内存、CPU数据通路、指令流水线与中断DMA所有硬核考点。",
  bodyMd: `# Hello Computer · 图解计算机组成原理

> 像解释算法一样解释计算机组成原理——用图解、数据通路时空图和微实验，攻克考研 408 计组所有硬核考点与综合大题。

本套教程只有一个核心目标：**让你脑中形成一台“可以单步运行的物理与逻辑计算机”**。

读完之后，你应该能用自己的话、自己画的数据通路图，彻底回答这个问题——

> 一条指令从内存取出来到执行完毕写回，在 CPU、总线、Cache 和寄存器之间到底经历了什么？

---

## 解决 408 考生的三大痛点

市面上的计组教材与网课常陷入三个极端：

1. **死记硬背派**：硬背“原补反移、微指令格式、中断屏蔽字”，一遇到综合大题（如流水线与 Cache 联动大题）就完全懵掉。
2. **抽象公式派**：教材上满是门电路逻辑和微操作代号（PC -> MAR, M(MAR) -> MDR），缺少直观的动态数据流向图。
3. **软硬件割裂**：不知道写下的 C 语言指针和数组访问，如何在底层的 TLB、页表、L1 Cache、行波进位加法器上一步步被计算。

《Hello Computer》走直觉与图解之路：

\`\`\`mermaid
flowchart LR
    A[408 真题痛点] --> B[建立硬件直觉]
    B --> C[动态数据通路图]
    C --> D[微架构实验验证]
    D --> E[数学公式与位长计算]
    E --> F[大题避坑与秒杀技巧]
\`\`\`

---

## 贯穿全书的三张核心地图

### 地图一 · CPU 内部数据通路（一条指令的生命周期）

\`\`\`mermaid
flowchart TD
    PC[程序计数器 PC] --> IF[取指 Fetch]
    IF --> ID[译码 Decode / 读寄存器堆]
    ID --> EX[执行 Execute / ALU 运算 / 地址计算]
    EX --> MEM[访存 Memory / 读写主存数据]
    MEM --> WB[写回 Writeback / 写入目的寄存器]
    WB -.流水线转发 Forwarding.-> EX
\`\`\`

### 地图二 · 存储层次协同流图（一次访存经历的惊涛骇浪）

\`\`\`mermaid
flowchart TD
    VA[虚拟地址 VA] --> TLB{TLB 快表命中?}
    TLB -- 命中 --> PA[获得物理地址 PA]
    TLB -- 缺失 --> PT[访问内存页表]
    PT -->|有效| PA
    PT -->|无效| PF[触发缺页中断 Page Fault]
    PA --> CACHE{Cache 命中?}
    CACHE -- 命中 --> DATA[高速送达 CPU 寄存器]
    CACHE -- 缺失 --> DRAM[主存 DRAM 读块并载入 Cache]
    DRAM --> DATA
\`\`\`

### 地图三 · 整机 I/O 与总线交互

\`\`\`mermaid
flowchart TD
    CPU[CPU 核心] <--> BUS[系统总线 / 仲裁]
    BUS <--> DEV[I/O 接口 / 控制器]
    DEV --> INTR[中断控制器 / 中断屏蔽字]
    DEV --> DMA[DMA 控制器 / 周期挪用]
    DMA <--> MEMORY[主存直接传输]
\`\`\`

---

## 配套动手实验

全书提供 8 个纯原生 Python 编写的可运行微实验与一个 5 级流水线 CPU 仿真器：

- experiments/computer/01_radix_complement.py：双符号位溢出判断
- experiments/computer/02_ieee754_parser.py：IEEE 754 浮点转换与对阶
- experiments/computer/03_interleaved_mem.py：多模块低位交叉编址流水线
- experiments/computer/04_cache_simulator.py：直接映射与组相联 Cache 模拟
- experiments/computer/05_tlb_page_walk.py：TLB 快表与两级页表地址翻译
- experiments/computer/06_expanding_opcode.py：扩展操作码前缀推导
- experiments/computer/07_pipeline_hazard.py：5 级流水线 RAW 冲突与转发
- experiments/computer/08_interrupt_mask.py：多重中断屏蔽字嵌套时序
- mini_cpu/run_demo.py：Level 2 Mini RISC-V 5级流水线 CPU 仿真
`
});

// 2. 序言
docs.push({
  id: "doc:hello-computer-preface",
  slug: "preface",
  parentId: "'doc:book-hello-computer'",
  title: "序言: 为什么需要图解计组",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 1,
  isBook: 0,
  coverHue: 160,
  summary: "",
  bodyMd: `# 序言: 为什么需要图解计组

## 考研 408 考生的典型困境

在计算机考研 408 的四门课程里，计算机组成原理是公认最硬核、最容易拉开分差的一门。

很多同学学完一遍之后，脑子里留下的只是一堆零散的碎片：
- 会算补码，但不知道 ALU 为什么用加法器就能做减法；
- 记住了 IEEE 754 偏置值是 127，但不知道为什么偏置值不选 128；
- 背得出直接映射、组相联映射的公式，但面对 408 真题中给出的 32 位地址十六进制字符串，不知道怎么用手指把它精准切成 Tag、Index、Offset 三段；
- 看得懂五级流水线的表格，但一旦加入数据转发（Forwarding）和分支预测失败，整个时钟周期数就算得一团糟。

## 本书的第三条路

《Hello Computer》的目标是：建立物理和硬件层面的直觉模型，再配合严密数学与真题考法，彻底拆掉你和硬件之间的黑盒。

每一章遵循固定结构：
1. 一个真实/考研高频问题
2. 初学者的错误直觉与做题陷阱
3. 为什么这个直觉会撞墙
4. 正确的硬件/物理脑内模型
5. 动态数据通路图（Mermaid）
6. 数学公式与位长计算
7. Python 最小微实验验证
8. 408 常见命题陷阱拆解
9. 本章小结
10. 下一章为什么自然出现
`
});

export { docs, esc };
