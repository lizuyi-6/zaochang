// 第七部分 · 大脑中枢: 中央处理器 CPU (26 ~ 30)
export const part7Docs = [
  {
    id: "doc:hello-computer-part-7",
    slug: "part-7",
    parentId: "'doc:book-hello-computer'",
    title: "第七部分 · 大脑中枢: 中央处理器 CPU",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 8,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-computer-26-cpu-registers",
    slug: "26-cpu-registers",
    parentId: "'doc:hello-computer-part-7'",
    title: "26 CPU 内部寄存器架构与功能划分",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 26,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 26 CPU 内部寄存器架构与功能划分

## 1. 408 核心分类：用户可见 vs 用户透明寄存器

| 分类标准 | 包含的寄存器 | 为什么这样设计？ |
| :--- | :--- | :--- |
| **用户可见寄存器**<br/>(汇编程序员可以直接用指令读取或修改) | 1. **通用寄存器堆 (GPR - R0~R31)**<br/>2. **程序计数器 (PC)**（可通过跳转指令修改）<br/>3. **程序状态字寄存器 (PSW / Flags)**（条件码）<br/>4. **基址寄存器 (BR) / 变址寄存器 (IX)**<br/>5. **堆栈指针 (SP)** | 支撑编译器的变量分配、循环计数、条件分支与函数调用栈。 |
| **用户透明寄存器**<br/>(汇编程序员绝对无法直接指名访问，纯硬件专用) | 1. **指令寄存器 (IR)**（保存正在执行的机器码）<br/>2. **存储器地址寄存器 (MAR)**（锁存总线地址）<br/>3. **存储器数据寄存器 (MDR)**（双向数据缓冲水闸）<br/>4. **内部暂存器 (Y, Z)**（单总线架构下暂存 ALU 输入与输出） | 防止程序破坏底层微操作执行时序与数据通路硬件锁存状态。 |

---

## 2. 本章小结

- 用户可见寄存器是 ISA 规范的一部分；
- 用户透明寄存器是微体系结构的物理实现细节。
`
  },
  {
    id: "doc:hello-computer-27-instruction-cycle",
    slug: "27-instruction-cycle",
    parentId: "'doc:hello-computer-part-7'",
    title: "27 指令周期与四个周期的微操作时序",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 27,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 27 指令周期与四个周期的微操作时序

## 1. 指令周期的四个经典阶段

一条指令从开始执行到结束所经过的全部时间称为**指令周期**。它可以包含 1 到 4 个不同的工作周期：

\`\`\`mermaid
flowchart TD
    FETCH["1. 取指周期 (Fetch Cycle - FE)<br/>所有指令必经！从内存读指令到 IR, PC 自动加 1"]
    FETCH --> IND{"是否含间接寻址?"}
    
    IND -->|是| INDIRECT["2. 间址周期 (Indirect Cycle - IND)<br/>根据形式地址 A 访存读出真实有效地址 EA"] --> EXEC
    IND -->|否| EXEC["3. 执行周期 (Execute Cycle - EX)<br/>ALU 运算、访存或控制跳转"]
    
    EXEC --> INT_CHECK{"是否有未屏蔽的中断请求?"}
    INT_CHECK -->|是| INTERRUPT["4. 中断周期 (Interrupt Cycle - INT)<br/>硬件自动保存断点 PC, 关中断, 跳入中断服务程序"]
    INT_CHECK -->|否| NEXT_FETCH["进入下一条指令的取指周期..."]
    INTERRUPT --> NEXT_FETCH
\`\`\`

---

## 2. 硬件触发器标志状态

CPU 内部使用 4 个触发器记录当前处于哪个周期：
- $\text{FE} = 1$：当前处于取指周期；
- $\text{IND} = 1$：当前处于间址周期；
- $\text{EX} = 1$：当前处于执行周期；
- $\text{INT} = 1$：当前处于中断周期。

---

## 3. 本章小结

- 取指周期微操作对所有指令完全相同；
- 中断周期本质是硬件自动完成断点压栈与 PC 更新。
`
  },
  {
    id: "doc:hello-computer-28-datapath-control",
    slug: "28-datapath-control",
    parentId: "'doc:hello-computer-part-7'",
    title: "28 数据通路结构与控制信号设计",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 28,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 28 数据通路结构与控制信号设计

## 1. CPU 内部单总线数据通路模型（408 大题核心图解）

在单总线结构中，所有内部寄存器和 ALU 都挂接在同一组公共数据总线上。
**铁律约束：在同一个时钟周期内，只允许一个部件向总线输出数据，但允许多个部件同时从总线接收数据！**

\`\`\`mermaid
flowchart TD
    subgraph Single_Bus["CPU 内部单总线 (Internal Bus)"]
        BUS["公共内部数据总线"]
    end

    PC["PC"] <==>|PC_out / PC_in| BUS
    MAR["MAR"] <==|MAR_in| BUS
    MDR["MDR"] <==>|MDR_in / MDR_out| BUS
    IR["IR"] <==|IR_in| BUS
    GPR["通用寄存器堆 R0~R3"] <==>|R_out / R_in| BUS
    
    Y["暂存器 Y"] <==|Y_in| BUS
    Y --> ALU_IN_A["ALU 左输入端"]
    BUS --> ALU_IN_B["ALU 右输入端"]
    
    ALU_CORE["ALU 运算核心"] --> Z["暂存器 Z (锁存计算结果)"]
    Z ==>|Z_out| BUS
\`\`\`

---

## 2. 跑一个完整微操作案例：加法指令 \`ADD (R0), R1\`

该指令含义：将 R0 指向的主存单元内容与 R1 相加，结果写回 R0 指向的主存单元。

### 阶段一：取指周期（公共时序）
1. $T_1$: $\text{PC} \to \text{Bus} \to \text{MAR}$（控制信号：$PC_{\text{out}}, MAR_{\text{in}}$）
2. $T_2$: $M[\text{MAR}] \to \text{DB} \to \text{MDR}, \text{PC}+1 \to \text{PC}$（控制信号：$\text{MemRead}, MDR_{\text{inE}}, PC_{\text{inc}}$）
3. $T_3$: $\text{MDR} \to \text{Bus} \to \text{IR}$（控制信号：$MDR_{\text{out}}, IR_{\text{in}}$）

### 阶段二：执行周期
1. $T_4$: $\text{R0} \to \text{Bus} \to \text{MAR}$（获取源操作数内存地址，控制信号：$R0_{\text{out}}, MAR_{\text{in}}$）
2. $T_5$: $M[\text{MAR}] \to \text{DB} \to \text{MDR}$（从内存读出操作数，控制信号：$\text{MemRead}, MDR_{\text{inE}}$）
3. $T_6$: $\text{MDR} \to \text{Bus} \to \text{Y}$（将内存操作数送入暂存器 Y 锁存，控制信号：$MDR_{\text{out}}, Y_{\text{in}}$）
4. $T_7$: $\text{R1} \to \text{Bus}$, $\text{ALU}(Y + \text{Bus}) \to \text{Z}$（ALU 计算并将结果送入暂存器 Z，控制信号：$R1_{\text{out}}, ALU_{\text{add}}, Z_{\text{in}}$）
5. $T_8$: $\text{Z} \to \text{Bus} \to \text{MDR}$（将结果送入 MDR 准备写入，控制信号：$Z_{\text{out}}, MDR_{\text{in}}$）
6. $T_9$: $\text{MDR} \to \text{DB} \to M[\text{MAR}]$（写入主存，控制信号：$\text{MemWrite}, MDR_{\text{outE}}$）

---

## 3. 本章小结

- 单总线必须配暂存器 Y 和 Z 来防止输入输出闭环震荡与总线冲突；
- 每个时钟周期严格对应一组微操作控制信号。
`
  },
  {
    id: "doc:hello-computer-29-hardwired-cu",
    slug: "29-hardwired-cu",
    parentId: "'doc:hello-computer-part-7'",
    title: "29 硬布线控制器: 状态机与微操作布尔逻辑综合",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 29,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 29 硬布线控制器: 状态机与微操作布尔逻辑综合

## 1. 硬布线控制器（组合逻辑控制器）架构

硬布线控制器是利用纯数字逻辑门（与门、或门、非门）构成的庞大组合逻辑网络。

\`\`\`mermaid
flowchart TD
    IR["指令寄存器 IR"] -->|操作码译码| OP_SIGNALS["指令译码信号 (如 I_ADD, I_SUB, I_MOV)"]
    CLK["主频时钟源"] -->|节拍发生器| T_SIGNALS["节拍脉冲信号 (T1, T2, T3, T4...)"]
    PSW["状态标志位"] -->|标志条件| COND_SIGNALS["条件信号 (ZF, SF, CF, OF)"]

    OP_SIGNALS & T_SIGNALS & COND_SIGNALS ==> LOGIC_MATRIX["庞大的组合逻辑门电路阵列 (与或逻辑树)"]
    LOGIC_MATRIX ==> OUTPUT_SIGNALS["产生所有的微操作控制信号 (PC_out, MAR_in, RegWrite...)"]
\`\`\`

---

## 2. 布尔代数综合实例

以控制信号 $MAR_{\text{in}}$ 为例，在哪些时刻它必须输出高电平？
- 在所有指令的取指周期 $T_1$ 时刻：$C_{\text{fetch}} \cdot T_1$；
- 在 LDA 指令的执行周期 $T_4$ 时刻：$I_{\text{LDA}} \cdot T_4$；
- 在 ADD 指令的执行周期 $T_4$ 时刻：$I_{\text{ADD}} \cdot T_4$。

因此，驱动 $MAR_{\text{in}}$ 的布尔逻辑表达式为：
$$MAR_{\text{in}} = C_{\text{fetch}} \cdot T_1 + (I_{\text{LDA}} + I_{\text{ADD}}) \cdot T_4 + \dots$$
将这个布尔公式直接用逻辑门连接出来，就是硬布线控制器的硬件实体！

---

## 3. 本章小结

- 硬布线速度极快（纳秒级门延迟），是 RISC 架构处理器的首选；
- 缺点是线路复杂、极难修改扩展，一旦指令格式改动就必须重新流片。
`
  },
  {
    id: "doc:hello-computer-30-microprogrammed-cu",
    slug: "30-microprogrammed-cu",
    parentId: "'doc:hello-computer-part-7'",
    title: "30 微程序控制器: 控制存储器 CS、微指令格式与断定法",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 30,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 30 微程序控制器: 控制存储器 CS、微指令格式与断定法

## 1. 核心思想：用软件思想设计硬件

莫里斯·威尔克斯（Maurice Wilkes）在 1951 年提出：
**既然一条机器指令是由若干微操作时序组成的，何不把每个时钟节拍所需的控制电平编码成一条“微指令（Microinstruction）”，保存在只读存储器（控制存储器 CS）中？**

- **微操作**：硬件执行的最小动作（如 $PC_{\text{out}}$）；
- **微指令**：控制一个时钟节拍内所有微操作的二进制字；
- **微程序**：实现一条机器指令的微指令序列；
- **控制存储器 (CS)**：位于 CPU 内部的高速 ROM/SRAM，存放全部微程序。

\`\`\`mermaid
flowchart TD
    IR["机器指令 (IR)"] --> MAP["微程序入口地址映射逻辑"]
    MAP --> uPC["微程序计数器 (uPC / uMAR)"]
    uPC ==> CS["控制存储器 (Control Store CS)"]
    CS ==> uIR["微指令寄存器 (uIR / uMDR)"]
    
    uIR --> OP_FIELD["操作控制字段 -> 输出控制信号点亮数据通路"]
    uIR --> ADDR_FIELD["顺序控制 / 下地址字段 (断定法) -> 驱动下一条微指令地址"]
    ADDR_FIELD --> uPC
\`\`\`

---

## 2. 水平型微指令 vs 垂直型微指令

| 维度 | 水平型微指令 | 垂直型微指令 |
| :--- | :--- | :--- |
| **编码方式** | 直接控制（一位对应一个微操作）或字段编码 | 类似机器码，高度压缩编码 |
| **微指令字长** | **长**（数十位到上百位） | **短**（十几位） |
| **并行控制能力** | **极强**（单拍可同时发出十几个控制信号） | **弱**（单拍通常只能发出 1~2 个控制信号） |
| **执行速度** | **快**（单拍直接执行） | **慢**（需要额外的微操作译码器） |

---

## 3. 本章小结

- 硬布线靠纯电路（快/难改/RISC），微程序靠微指令查表（慢/灵活/CISC）；
- 控制存储器 CS 在 CPU 片内，掉电不丢失。
`
  }
];
