// 第八部分 · 工业流水线: 指令流水线 (31 ~ 34)
export const part8Docs = [
  {
    id: "doc:hello-computer-part-8",
    slug: "part-8",
    parentId: "'doc:book-hello-computer'",
    title: "第八部分 · 工业流水线: 指令流水线",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 9,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-computer-31-classic-pipeline",
    slug: "31-classic-pipeline",
    parentId: "'doc:hello-computer-part-8'",
    title: "31 经典五级流水线模型与吞吐率加速比",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 31,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 31 经典五级流水线模型与吞吐率加速比

## 1. 经典五级流水线划分（RISC-V / MIPS 标准）

将一条指令的生命周期严格均等切分为 5 个时钟阶段：

\`\`\`mermaid
flowchart LR
    IF["1. 取指 (IF)<br/>从 I-Cache 读指令, PC+4"] --> ID["2. 译码 (ID)<br/>读通用寄存器堆 (GPR)"]
    ID --> EX["3. 执行 (EX)<br/>ALU 算术逻辑计算 / 计算访存地址"]
    EX --> MEM["4. 访存 (MEM)<br/>读写 D-Cache (LW/SW)"]
    MEM --> WB["5. 写回 (WB)<br/>结果写入目标寄存器"]
\`\`\`

每个阶段之间由**流水线寄存器（Pipeline Registers: IF/ID, ID/EX, EX/MEM, MEM/WB）**进行物理锁存隔离，保证前后阶段互不干扰。

---

## 2. 吞吐率、加速比与效率的数学推导

设流水线级数为 $k = 5$，每个时钟周期耗时 $\tau$，连续执行 $n$ 条指令：

### 1. 执行总耗时比较
- 顺序非流水线耗时：$T_{\text{seq}} = n \times k \times \tau$
- 理想流水线耗时：$T_k = (k + n - 1) \times \tau$
  （第一条指令耗时 $k\tau$ 填满流水线，后续每过 $1\tau$ 稳定流出一条指令）

### 2. 吞吐率 (Throughput, TP)
$$\text{TP} = \frac{n}{T_k} = \frac{n}{(k + n - 1) \times \tau} \\\\\\\\xightarrow{n \to \infty} \frac{1}{\tau}$$

### 3. 加速比 (Speedup, S)
$$S = \frac{T_{\text{seq}}}{T_k} = \frac{n \times k \times \tau}{(k + n - 1) \times \tau} = \frac{n \times k}{k + n - 1} \\\\\\\\xightarrow{n \to \infty} k$$

---

## 3. 本章小结

- 流水线并没有缩短单条指令的延迟（仍需 5 周期），但将系统的指令流出吞吐率提升了近 $k$ 倍。
`
  },
  {
    id: "doc:hello-computer-32-pipeline-hazards",
    slug: "32-pipeline-hazards",
    parentId: "'doc:hello-computer-part-8'",
    title: "32 流水线三大冒险: 结构、数据与控制冒险",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 32,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 32 流水线三大冒险: 结构、数据与控制冒险

## 1. 流水线三大冒险全景图

\`\`\`mermaid
flowchart TD
    HAZARDS["流水线三大冲突 (Hazards)"]
    HAZARDS --> H1["1. 结构冒险 (Structural Hazard)<br/>硬件资源争用: 如 IF 取指与 MEM 访存同时争抢单端口 Cache"]
    HAZARDS --> H2["2. 数据冒险 (Data Hazard)<br/>指令间数据依赖: RAW (写后读真相关), WAR (读后写), WAW (写后写)"]
    HAZARDS --> H3["3. 控制冒险 (Control Hazard)<br/>条件跳转指令 (BEQ/BNE): 分支跳转未判定前, 无法确定下一条取指地址"]
\`\`\`

---

## 2. 数据相关三大类型（408 必考）

1. **写后读 (RAW - Read After Write, 真相关)**：
   - 指令 $I_1$ 正在计算写回 $R_1$；
   - 指令 $I_2$ 紧接着就要读取 $R_1$ 作为输入；
   - 若直接执行，$I_2$ 会读出旧的错误数据！
2. **读后写 (WAR - Write After Read, 反相关)**：
   - $I_2$ 试图在 $I_1$ 读出旧值之前就把新值写入（在顺序流水线中天然不发生，主要出现在乱序执行中）。
3. **写后写 (WAW - Write After Write, 输出相关)**：
   - $I_2$ 试图在 $I_1$ 写入之前提前写入（在乱序超标量中需要通过寄存器重命名消除）。

---

## 3. 本章小结

- 结构冒险靠复制硬件（I/D Cache 分离）；
- 数据冒险的核心是 RAW 写后读；
- 控制冒险源于分支跳转目标未知。
`
  },
  {
    id: "doc:hello-computer-33-hazard-resolution",
    slug: "33-hazard-resolution",
    parentId: "'doc:hello-computer-part-8'",
    title: "33 冒险化解: Stall 气泡、Forwarding 转发与分支预测",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 33,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 33 冒险化解: Stall 气泡、Forwarding 转发与分支预测

## 1. RAW 冒险的终极杀手锏：Forwarding 旁路转发技术

观察下面的两行汇编：
\`\`\`assembly
ADD R1, R2, R3    # R1 = R2 + R3 (在 EX 阶段末尾 ALU 已经算出了结果！)
SUB R4, R1, R5    # R4 = R1 - R5 (在 EX 阶段才真正需要 R1 的值)
\`\`\`

- 常规流程中，\`ADD\` 必须等到第 5 周期（WB）才写入寄存器堆；
- 但事实上，\`ADD\` 在第 3 周期（EX 结束）时，ALU 输出端就已经产生了正确的数值！
- **旁路转发技术（Forwarding）**：直接在硬件上拉一根物理导线，将 \`EX/MEM\` 寄存器中的最新值直接接到下一条指令的 ALU 输入端！
- **效果**：**无需插入任何 Stall 气泡，0 周期损失直接化解 ALU-ALU 型 RAW 冒险！**

\`\`\`mermaid
flowchart LR
    ALU1["ADD 指令 EX 阶段 ALU 输出 (结果已产生)"] ==>|Forwarding 专用旁路导线 (0 周期延迟)| ALU2["SUB 指令 EX 阶段 ALU 输入端"]
\`\`\`

---

## 2. Load-Use 冒险（无法被完全转发消除的硬延迟）

\`\`\`assembly
LW  R1, 0(R2)     # R1 的值必须等到第 4 周期 (MEM) 从内存读出后才存在！
ADD R3, R1, R4    # ADD 在第 3 周期 (EX) 就要用 R1
\`\`\`

此时，即使有 Forwarding，\`ADD\` 的 EX 阶段也早于 \`LW\` 的 MEM 阶段。
**铁律法则：对于 Load-Use 冲突，硬件必须强制插入 1 个周期的 Stall 气泡，然后再进行 Forwarding 转发！**

---

## 3. 本章小结

- ALU 相关靠 Forwarding 实现 0 周期完美转发；
- Load-Use 必须插入 1 周期流水线气泡；
- 编译器可通过指令重排（调度无依赖指令填补气泡）彻底消除延迟。
`
  },
  {
    id: "doc:hello-computer-34-advanced-pipeline",
    slug: "34-advanced-pipeline",
    parentId: "'doc:hello-computer-part-8'",
    title: "34 高级流水线技术: 超标量、超流水与动态调度",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 34,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 34 高级流水线技术: 超标量、超流水与动态调度

## 1. 三大高级流水线架构对比

\`\`\`mermaid
flowchart TD
    PIPELINE_TYPES["高级流水线并行技术"]
    PIPELINE_TYPES --> SS["1. 超标量处理 (Superscalar - 多发射)<br/>每个时钟周期同时取指并执行多条独立指令 (IPC > 1)<br/>依靠空间并行 (多套 ALU/访存单元)"]
    PIPELINE_TYPES --> SP["2. 超流水线 (Superpipelined)<br/>将流水线切得更细 (如 15~20 级), 极致压缩时钟周期, 飙升主频"]
    PIPELINE_TYPES --> VLIW["3. 超长指令字 (VLIW)<br/>由编译器在编译期将多个独立操作打包成一条超长指令"]
\`\`\`

---

## 2. 本章小结

- 超标量靠硬件多发射（空间并行）；
- 超流水线靠深切周期（时间细分）；
- 乱序执行靠保留站（RS）和重排序缓存（ROB）化解假相关。
`
  }
];
