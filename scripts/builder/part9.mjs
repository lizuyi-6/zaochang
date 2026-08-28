// 第九部分 · 沟通桥梁: 总线系统 (35 ~ 37)
export const part9Docs = [
  {
    id: "doc:hello-computer-part-9",
    slug: "part-9",
    parentId: "'doc:book-hello-computer'",
    title: "第九部分 · 沟通桥梁: 总线系统",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 10,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-computer-35-bus-basics",
    slug: "35-bus-basics",
    parentId: "'doc:hello-computer-part-9'",
    title: "35 总线结构、分类与性能指标",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 35,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 35 总线结构、分类与性能指标

## 1. 为什么需要总线？

如果计算机内部每个部件之间都单独拉专线相连，设部件数为 $N$，总线连接线对数将达到 $O(N^2)$，主板走线将彻底瘫痪。
**总线（Bus）**是计算机各功能部件之间传送信息的**公共传输通路（分时共享导线集合）**。

---

## 2. 系统总线的三大物理分类

\`\`\`mermaid
flowchart LR
    CPU["CPU"] <===>|系统总线 (System Bus)| CHIPSET["芯片组 / 主存 / I/O 设备"]
    
    subgraph BUS_INNER["总线的三大物理信号线"]
        DB["1. 数据总线 (Data Bus): 双向, 位宽决定单次传输能力 (如 32/64 位)"]
        AB["2. 地址总线 (Address Bus): 单向 (由 CPU/DMA 发出), 位宽决定最大寻址范围 (如 32 位 -> 4GB)"]
        CB["3. 控制总线 (Control Bus): 传输读写使能、中断请求、时钟与握手信号"]
    end
\`\`\`

---

## 3. 408 核心计算：总线带宽公式

$$\text{总线带宽 } Dr = \text{总线工作频率 } f \times \frac{\text{总线宽度 } W}{8} = \frac{\text{单次传输数据量}}{\text{总线传输周期}}$$

**408 必背单位转换细节**：
- 计算**总线带宽**时：$1\text{MB/s} = 10^6\text{B/s}$（十进制频率换算！）；
- 计算**存储容量**时：$1\text{MB} = 2^{20}\text{B} = 1,048,576\text{B}$（二进制空间换算！）。

---

## 4. 本章小结

- 总线具有分时共享特性；
- 数据总线双向，地址总线单向，控制总线混合。
`
  },
  {
    id: "doc:hello-computer-36-bus-arbitration",
    slug: "36-bus-arbitration",
    parentId: "'doc:hello-computer-part-9'",
    title: "36 总线仲裁机制: 菊花链查询、计数器定时与独立请求",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 36,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 36 总线仲裁机制: 菊花链查询、计数器定时与独立请求

## 1. 集中式总线仲裁三大方案全方位对比

当多个主设备（CPU、DMA、显卡）同时申请总线控制权时，仲裁器必须决定谁能获得总线：

| 仲裁方式 | 控制线数量 (设设备数为 $n$) | 优先级确定机制 | 硬件复杂度与容错性 |
| :--- | :--- | :--- | :--- |
| **菊花链查询 (链式查询)** | 固定为 **3 根** ($BR, BG, BS$)，与设备数无关！ | **固定优先级**（离仲裁器物理距离最近的设备优先级最高） | 极低；对电路故障极其敏感（某节点损坏则后方全瘫痪） |
| **计数器定时查询** | $\lceil \log_2 n \rceil + 2$ 根（设备地址线 + $BR, BS$） | **动态优先级**（可通过设定计数器初始值实现公平轮转） | 适中 |
| **独立请求方式** | **$2n + 1$ 根**（每个设备独立拥有一对 $REQ_i$ 和 $GNT_i$） | **极其灵活**（可由硬件或程序自由设定任意优先级策略） | 高（走线多，但响应速度最快） |

\`\`\`mermaid
flowchart LR
    ARB["集中式仲裁器 (Arbiter)"]
    ARB -->|BG 总线允许信号 (串行穿透)| DEV1["设备 0 (优先级最高)"]
    DEV1 -->|若不用则传递| DEV2["设备 1"]
    DEV2 -->|若不用则传递| DEV3["设备 2 (优先级最低)"]
    
    DEV1 & DEV2 & DEV3 ==>|BR 公共请求线| ARB
    DEV1 & DEV2 & DEV3 ==>|BS 总线忙信号| ARB
\`\`\`

---

## 2. 本章小结

- 菊花链控制线最少（3根）但优先级固定且不可靠；
- 独立请求响应最快、控制线最多（$2n$ 根）。
`
  },
  {
    id: "doc:hello-computer-37-bus-timing",
    slug: "37-bus-timing",
    parentId: "'doc:hello-computer-part-9'",
    title: "37 总线定时方式: 同步定时与异步握手信号",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 37,
    isBook: 0,
    coverHue: 160,
    summary: "",
    bodyMd: `# 37 总线定时方式: 同步定时与异步握手信号

## 1. 同步定时 vs 异步定时

- **同步定时（Synchronous Timing）**：
  - 整个系统由统一的时钟脉冲信号控制；
  - 优点：控制极其简单、传输速率极高；
  - 缺点：必须按**最慢设备的响应速度**设计时钟周期，总线长度受限。
- **异步定时（Asynchronous Timing）**：
  - 没有统一时钟，完全依靠通信双方的“请求（Request）”与“回答（Acknowledge）”握手信号协同；
  - 优点：允许速度差异极大的设备挂在同一总线上。

---

## 2. 异步定时的三种握手协议（408 必考）

\`\`\`mermaid
flowchart TD
    HANDSHAKE["异步握手协议三种类型"]
    HANDSHAKE --> M1["1. 非互锁 (Non-interlocked)<br/>主设备发请求后自行延时撤销; 从设备收到请求后发回答后自行延时撤销<br/>(无确认闭环, 可靠性最差)"]
    HANDSHAKE --> M2["2. 半互锁 (Semi-interlocked)<br/>主设备发请求后必须【等从设备回答到来到才撤销】<br/>但从设备发回答后自行延时撤销 (单向确认)"]
    HANDSHAKE --> M3["3. 全互锁 (Fully-interlocked)<br/>主设备发请求 -> 等从设备回答 -> 主设备撤销请求 -> 从设备感知请求撤销后才撤销回答<br/>(双向双重确认, 可靠性最高, 速度较慢)"]
\`\`\`

---

## 3. 本章小结

- 同步看时钟，异步看握手；
- 全互锁协议四步闭环，是高可靠总线通信的基准。
`
  }
];
