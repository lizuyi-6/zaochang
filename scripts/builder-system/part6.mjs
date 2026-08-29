// scripts/builder-system/part6.mjs
// 第六部分：重新走完那几百毫秒 (56 ~ 60)
// 全量技术修订与规范化完整版本 (全 5 章高密度深度正文)

export const part6Docs = [
  {
    id: "doc:hello-system-part-6",
    slug: "part-6",
    parentId: "'doc:book-hello-system'",
    title: "第六部分 · 重新走完那几百毫秒",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 8,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-system-56-full-request-journey",
    slug: "56-full-request-journey",
    parentId: "'doc:hello-system-part-6'",
    title: "第56章 从浏览器到数据库",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第56章 从浏览器到数据库

## 1. 全链路交互的端到端时序

现在，我们将全书所涉及的技术环节串联为一个完整的端到端调用视图：

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor User as 用户李雷
    participant DOM as 浏览器 DOM
    participant Vue as 前端 Vue 状态
    participant Net as 网络协议栈
    participant Ctrl as 后端 Controller
    participant Svc as 后端 Service
    participant Repo as 后端 Repository
    participant DB as 数据库 (DBMS)

    User->>DOM: 1. 触发“选课”按钮点击
    DOM->>Vue: 2. 触发 @click 事件监听函数
    Note over Vue: 3. 更新交互状态 (设置 submitting=true)<br/>构造 JSON 请求载荷 {"courseId": 2048}
    Vue->>Net: 4. fetch 发起 HTTP POST /api/enrollments
    Note over Net: 5. 复用已有 TCP/TLS 连接，发送 HTTP 请求报文
    Net->>Ctrl: 6. Web 服务器解析报文，路由至 Controller
    Note over Ctrl: 7. 从安全上下文中解析出已认证的学生身份 (studentId=1001)<br/>执行请求参数校验
    Ctrl->>Svc: 8. 调用业务用例 enroll(1001, 2048)
    Note over Svc: 9. 声明式事务开启 (开启数据库事务 BEGIN)
    Svc->>Repo: 10. incrementEnrolledIfAvailable(2048)
    Repo->>DB: 11. 执行原子条件更新 SQL
    Note over DB: 12. 数据库行级锁控制，执行不变量检查 (enrolled < capacity)<br/>写入 Redo Log 缓冲
    DB-->>Repo: 13. 返回更新结果 (影响行数: 1)
    Repo-->>Svc: 14. 扣减名额成功
    Svc->>Repo: 15. insertEnrollment(1001, 2048)
    Repo->>DB: 16. 执行选课记录 INSERT
    Note over DB: 17. 唯一索引检查防重，事务提交 COMMIT
    DB-->>Repo: 18. 持久化完成
    Repo-->>Svc: 19. 插入成功
    Svc-->>Ctrl: 20. 业务处理完成，返回成功结果
    Ctrl-->>Net: 21. 封装 HTTP 201 Created 响应报文 (JSON)
    Net-->>Vue: 22. 响应报文回传浏览器，Promise 状态决议 (Resolve)
    Note over Vue: 23. 前端响应式状态更新，触发视图差异计算
    Vue->>DOM: 24. 局部更新真实 DOM 节点 (显示“选课成功”)
    DOM-->>User: 25. 浏览器完成渲染重绘，用户看到选课成功反馈
\`\`\`

---

## 2. 数据形态在调用链中的跨层演变

在上述端到端流程中，同一项选课事实在不同系统边界中以不同的形态存在：

\`\`\`mermaid
flowchart TD
    D1["1. 前端组件响应式状态 (JavaScript Object)"] -->|JSON 序列化| D2["2. HTTP 消息体 (UTF-8 文本字节流)"]
    D2 -->|反序列化与绑定| D3["3. 后端传输对象 (Request DTO)"]
    D3 -->|业务处理| D4["4. 领域实体与 SQL 参数 (Entity / SQL Bound Parameters)"]
    D4 -->|存储引擎写入| D5["5. 关系表元组与索引数据页 (DBMS Table Rows & B+ Tree Pages)"]
    D5 -->|执行结果映射| D6["6. 业务响应对象 (Response DTO)"]
    D6 -->|JSON 序列化回传| D7["7. HTTP 响应消息体 (JSON)"]
    D7 -->|反序列化更新| D8["8. 前端视图投影 (DOM Nodes)"]
\`\`\`

---

## 3. 实现与架构层面的说明

【技术实现声明】：
上面以 **Vue 3 + Spring Boot + MySQL (InnoDB)** 为例展示了一条典型的端到端链路。
不同技术选型（如 React / Svelte 前端、Go / Node.js 后端、PostgreSQL / 分布式数据库）在具体的 API 命名、中间件机制和语法上有所不同，但**抽象边界划分、数据形态转换与事务控制的核心逻辑**是普适的。
`
  },
  {
    id: "doc:hello-system-57-why-we-have-layers",
    slug: "57-why-we-have-layers",
    parentId: "'doc:hello-system-part-6'",
    title: "第57章 我们为什么最终得到了这么多层？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 2,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第57章 我们为什么最终得到了这么多层？

## 1. 抽象层次的设计初衷

回顾 Mini Campus 的演进历程，每一层抽象的引入都是为了应对特定的软件工程挑战：

- **面向对象与封装**：将散落的变量聚合成具有明确身份与不变量的自治单元，防止外部代码直接破坏对象状态；
- **声明式前端与响应式**：将开发者从繁琐脆弱的命令式 DOM 同步中解放出来，以状态为中心驱动界面渲染；
- **关系模型与规范化**：通过严格的数学模型消除数据冗余，避免插入、更新与删除异常；
- **索引与事务机制**：在保障查询性能的同时，通过 ACID 特性与并发控制捍卫多用户访问下的数据一致性；
- **表现层（Controller）**：隔离传输协议与序列化细节，使业务逻辑免受外部通信形式变化的干扰；
- **业务逻辑层（Service）**：提供专注的用例编排与事务边界控制；
- **数据持久层（Repository）**：提供面向集合的数据访问抽象，提高代码的可测试性并隔离 SQL 查询细节。

分层设计的核心目的，是在系统的不同关注点之间设立清晰的边界，降低单个模块的复杂度，提升团队协作与长期维护的效率。
`
  },
  {
    id: "doc:hello-system-58-anti-overengineering",
    slug: "58-anti-overengineering",
    parentId: "'doc:hello-system-part-6'",
    title: "第58章 架构是不是越复杂越好？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第58章 架构是不是越复杂越好？

## 1. 架构复杂度的权衡原则

在软件设计中，“过度设计（Over-Engineering）”与“缺乏设计”同样具有危害性。

系统的架构选型取决于多维度的客观约束：
- **业务规模与并发量**：读写 QPS、数据总量与延迟敏感度；
- **业务复杂度与变更频率**：业务规则的多样性与演进速度；
- **团队结构与运维成本**：团队人员规模、专业分工与基础设施成熟度；
- **容灾与合规要求**：数据安全性与高可用性目标。

---

## 2. 简约与演进式设计

遵循 **YAGNI（You Aren't Gonna Need It）** 与 **KISS（Keep It Simple, Stupid）** 原则：
- 对于中小型单体应用，清晰的三层分层结构往往是最具生产力与维护性的方案；
- 盲目引入复杂的微服务拆分、分布式事务与多层缓存，不仅会显著增加网络延迟和部署复杂度，还可能引入新的分布式故障模式；
- 优秀的架构师应当根据当前系统的实际约束，选择**适度且具备演进能力的最小必要抽象**。
`
  },
  {
    id: "doc:hello-system-59-eternal-pillars-beyond-frameworks",
    slug: "59-eternal-pillars-beyond-frameworks",
    parentId: "'doc:hello-system-part-6'",
    title: "第59章 框架消失以后，还剩下什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 4,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第59章 框架消失以后，还剩下什么？

## 1. 软件系统反复面对的核心议题

框架与类库在不断更迭，但在各类软件系统中，以下基础问题始终处于核心地位：

\`\`\`mermaid
flowchart TD
    Root["软件系统反复面对的核心议题"]
    
    P1["1. 状态与生命周期 (State & Lifetime)\n瞬态计算与持久化存储的划分与管理"]
    P2["2. 身份与不变量 (Identity & Invariants)\n实体唯一标识与业务完整性约束的维护"]
    P3["3. 边界与契约 (Boundaries & Contracts)\n模块与服务之间清晰的接口规范与协议"]
    P4["4. 数据表示与转换 (Representations)\n数据在视图、网络与存储介质间的形态演变"]
    P5["5. 并发与隔离 (Concurrency & Isolation)\n多任务同时执行时的资源竞争与协调"]
    P6["6. 故障模型与恢复 (Faults & Recovery)\n在不可靠的物理环境与网络中保证确定性"]
    P7["7. 可观察性 (Observability)\n系统运行状态的可度量、可追踪与可定位性"]

    Root --> P1
    Root --> P2
    Root --> P3
    Root --> P4
    Root --> P5
    Root --> P6
    Root --> P7
\`\`\`

掌握这些通用模型，有助于开发者在面对未来涌现的新框架与新技术时，快速洞察其背后的设计取舍。
`
  },
  {
    id: "doc:hello-system-60-click-again",
    slug: "60-click-again",
    parentId: "'doc:hello-system-part-6'",
    title: "第60章 现在，再点击一次“选课”",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第60章 现在，再点击一次“选课”

## 1. 重回起点：建立全景心智模型

现在，让我们再次回到那个选课界面。

当用户再次点击“选课”按钮时，在你脑海中展现的将是一幅清晰连贯的系统图景：

- **在浏览器端**：用户交互触发 DOM 事件，前端响应式框架捕获事件并更新交互状态，构造序列化的 JSON 载荷；
- **在网络边界**：HTTP 报文承载着明确的方法与路径跨越网络，服务端在信任边界处对请求进行身份认证与参数清洗；
- **在业务领域**：表现层控制器将请求分发至业务逻辑层，业务服务以数据库事务为边界，编排选课资格与名额约束；
- **在存储引擎**：数据库管理系统利用行级锁与条件判断防范并发超卖，利用重做日志保障事务持久性；
- **在回传链路**：执行结果原路返回，响应式数据驱动前端视图高效更新，向用户呈现确定性的操作反馈。

---

## 2. 结语

软件系统的迷人之处，在于我们通过层层抽象将庞大复杂的现实问题分解为清晰可控的逻辑单元，同时又能在需要深入底层时清晰理解各层之间的协作机理。

希望《Hello System》能够帮助你建立起坚实、严谨的系统视角，伴随你在未来的工程实践中探索并构建出更为优雅、可靠的软件系统。
`
  }
];
