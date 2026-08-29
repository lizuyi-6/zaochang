// scripts/builder-system/part6.mjs
// 《Hello System · 图解软件系统》第六部分：重新走完那几百毫秒 (第 56 ~ 60 章)（全量教材化深度扩写版本）

const part6Docs = [];

// 顶层部分节点
part6Docs.push({
  id: "doc:hello-system-part-6",
  slug: "part-6",
  parentId: "'doc:book-hello-system'",
  title: "第六部分: 重新走完那几百毫秒 (56~60)",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 8,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第六部分: 重新走完那几百毫秒 (56~60)

本部分聚焦于**全书知识体系的大回环、全景闭环复盘与跨技术栈通用心智模型提炼**。

我们将以学生李雷（studentId=1001）选修课程《计算机系统导论》（courseId=2048）为主线，全景展开全书最核心的旗舰章节——从控制流、跨层数据形态演变与状态机生命周期跃迁三重视角，彻底看透一次点击背后的系统齿轮。随后，我们将深入探讨架构权衡、反过度设计哲学、跨技术栈框架迁移能力，并最终回到那个看似平凡的“选课”按钮，完成对整个软件系统认知的闭环升华。
`
});

// 第 56 章（全书最核心旗舰深度章节：8000+ 字三重视角全景透视）
part6Docs.push({
  id: "doc:hello-system-56-full-request-journey",
  slug: "56-full-request-journey",
  parentId: "'doc:hello-system-part-6'",
  title: "第56章 从浏览器到数据库：一次选课调用的全景复盘",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 56,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第56章 从浏览器到数据库：一次选课调用的全景复盘

## 1. 目标与场景设定

在本书的序章中，我们曾目睹学生李雷（学号：1001）在浏览器中点击选课按钮，选修课程代码为 \`CS-101\`（数据库主键 ID：2048，容量：100，当前已选：99）的《计算机系统导论》。

在经历了前 55 章在面向对象设计、分层架构、响应式前端、关系理论、SQL 索引、ACID 事务、网络协议与容灾可观测性等领域的探索后，现在，我们将**汇聚全书所有的理论与实践，运用三套截然不同却高度互补的分析透镜，对这一次选课调用进行全方位的终局透视**。

---

## 2. 第一视角：端到端全景控制流（Control Flow）

控制流透镜回答的核心问题是：**“计算的主动权在何时、由谁、通过何种契约传递给了下一层？”**

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor User as 用户李雷
    participant DOM as 浏览器 DOM 树
    participant Vue as 前端 Vue 3 响应式上下文
    participant Network as 网络协议栈 (HTTP over TCP)
    participant Ctrl as 后端 Controller (表现层)
    participant Svc as 后端 Service (业务逻辑层)
    participant Repo as 后端 Repository (持久化抽象)
    participant DB as 数据库存储引擎 (MySQL InnoDB)

    User->>DOM: 1. 鼠标点击屏幕坐标 (触发原生 click 事件)
    DOM->>Vue: 2. 事件分发至 @click="handleEnroll" 监听器
    Note over Vue: 3. 前端交互状态跃迁: isSubmitting = true (按钮立即置灰防重)<br/>构造请求载荷对象 { courseId: 2048 }<br/>调用 JSON.stringify() 完成序列化
    Vue->>Network: 4. window.fetch() 发起 HTTP POST /api/enrollments
    Note over Network: 5. 协议栈组装 TCP 报文段，经 IP 路由寻址传输到达云端服务器
    Network->>Ctrl: 6. Web 容器接收字节流，解析 HTTP 请求行、头与体
    Note over Ctrl: 7. 执行安全认证过滤器：从 Token 解析当前合法登录学生 studentId=1001<br/>调用 Bean Validation (@Valid) 校验 courseId > 0
    Ctrl->>Svc: 8. 调用业务用例 enrollmentService.enroll(1001, 2048)
    Note over Svc: 9. 触发 Spring @Transactional AOP 代理切面<br/>从数据源连接池获取数据库连接，开启事务 (START TRANSACTION)
    Svc->>Repo: 10. 检查防重: existsByStudentIdAndCourseId(1001, 2048)
    Repo->>DB: 11. 执行 SELECT count(*) FROM enrollments WHERE ...
    DB-->>Repo: 12. 返回 0 (尚未选修)
    Svc->>Repo: 13. 调度原子扣减: incrementEnrolledIfAvailable(2048)
    Repo->>DB: 14. 执行 UPDATE courses SET enrolled = enrolled + 1 WHERE id = 2048 AND enrolled < capacity;
    Note over DB: 15. B+ 树主键索引定位到 id=2048 所在数据页<br/>获取行级排他锁 (X Lock)，判定 99 < 100 满足条件<br/>在 Buffer Pool 中修改数据页 (enrolled 变为 100)<br/>生成重做日志记录写入 Redo Log Buffer
    DB-->>Repo: 16. 返回受影响行数 affected_rows = 1
    Repo-->>Svc: 17. 扣减名额成功确认
    Svc->>Repo: 18. 调度流水记录: save(new Enrollment(1001, 2048))
    Repo->>DB: 19. 执行 INSERT INTO enrollments (student_id, course_id) VALUES (1001, 2048);
    Note over DB: 20. 插入唯一索引 UK(student_id, course_id) 并写入 Undo/Redo 日志
    DB-->>Repo: 21. 插入成功，生成自增主键 enrollmentId = 9821
    Repo-->>Svc: 22. 流水落库成功
    Note over Svc: 23. 业务方法正常结束退出<br/>AOP 代理拦截器调用 commit()<br/>数据库执行 COMMIT，按持久化配置要求确保 Redo Log 达到相应持久化级别 (WAL 保障提交持久性)
    Svc-->>Ctrl: 24. 返回业务成功领域对象 EnrollResult.success()
    Note over Ctrl: 25. 将领域对象转换为 EnrollmentResponseDto<br/>包装为 HTTP 201 Created 响应实体
    Ctrl-->>Network: 26. Web 容器将响应 DTO 序列化为 JSON 字符串，写入 HTTP 响应流
    Network-->>Vue: 27. 响应报文跨越网络回传浏览器，fetch Promise 决议 (Resolve)
    Note over Vue: 28. 解析响应 JSON 数据<br/>更新前端响应式课程状态: course.enrolled = 100, isSubmitting = false<br/>响应式系统自动触发依赖该属性的 Computed 与 RenderEffect
    Vue->>DOM: 29. 虚拟 DOM 协调比对差异，精准补丁更新局部真实 DOM (修改文本与按钮类名)
    DOM-->>User: 30. 浏览器渲染流水线完成绘制合成，用户看到“选课成功！当前已选: 100/100 (名额已满)”确定性反馈
\`\`\`

> **本示例的技术前提**：上图假设使用 HTTP/1.1 或 HTTP/2 over TCP（HTTP/3 则使用基于 UDP 的 QUIC）；数据库以 MySQL InnoDB 常见的持久化配置为例——提交时需要确保 Redo Log 达到配置所要求的持久化级别，具体刷盘时机还受 \`innodb_flush_log_at_trx_commit\`、组提交（Group Commit）、操作系统与存储栈的影响，并非“每次 COMMIT 都必然立即单独执行一次 fsync”。

---

## 3. 第二视角：跨层数据形态演变（Data Metamorphosis）

数据形态透镜回答的核心问题是：**“同一个业务事实（李雷选修 2048 号课程），在跨越系统不同的层次与边界时，其表示形式经历了怎样的转换？”**

我们从**用户交互事件**开始追踪（而不是从硬件电信号开始——那已经超出了软件系统的讨论边界）：

\`\`\`mermaid
flowchart TD
    D1["1. 用户交互事件\n浏览器向按钮派发 DOM click 事件对象"]
    D2["2. 浏览器内存状态\nJavaScript 响应式 Proxy 对象: course = reactive({ id: 2048, enrolled: 99 })"]
    D3["3. JS 请求对象\n内存普通对象: { courseId: 2048 }"]
    D4["4. JSON 文本表示\n序列化纯文本: '{\"courseId\":2048}'"]
    D5["5. HTTP 报文载荷\n按 UTF-8 编码的字节流，作为 HTTP 请求体内容传输"]
    D6["6. 表现层请求 DTO\n反序列化为 Java 强类型不可变对象: EnrollRequest[courseId=2048]"]
    D7["7. 领域业务值\nJava 领域聚合根实例: Course{id=2048, capacity=100, enrolled=99}"]
    D8["8. SQL 绑定参数\n预编译参数化语句: UPDATE courses SET enrolled=enrolled+1 WHERE id=? AND enrolled<capacity"]
    D9["9. 关系状态\n存储引擎数据页上的关系元组记录 + Redo Log 缓冲区日志记录"]
    D10["10. 响应 DTO 与 JSON\nEnrollmentResponseDto -> JSON 响应体"]
    D11["11. 前端响应式状态\ncourse.enrolled = 100 (响应式更新)"]
    D12["12. 渲染后的 DOM\n真实 HTML DOM 文本节点: TextNode('已选: 100/100')"]

    D1 --> D2 --> D3 --> D4 --> D5 --> D6 --> D7 --> D8 --> D9 --> D10 --> D11 --> D12
\`\`\`

---

## 4. 第三视角：状态机生命周期跃迁（State Lifecycle Transitions）

状态机透镜回答的核心问题是：**“整个系统在各个维度的状态，是如何沿调用链依次推进，并最终形成一致的业务结果？”**

| 系统观察维度 | 初始状态（$T_0$） | 中间过程状态（$T_{\\text{mid}}$） | 终态（$T_{\\text{final}}$） | 状态跃迁保障机制 |
| :--- | :--- | :--- | :--- | :--- |
| **前端交互状态** | \`isSubmitting = false\` (可点击) | \`isSubmitting = true\` (置灰等待) | \`isSubmitting = false\` (呈现结果) | Vue 响应式数据绑定与 Promise 状态钩子 (\`finally\`) |
| **网络请求状态** | 未发起请求 | HTTP Request In-Flight (传输中) | HTTP 201 Created (已决议) | TCP 可靠连接与 HTTP 协议状态码语义 |
| **课程实体名额** | \`enrolled = 99\` | 内存修改为 100 (持有行锁) | \`enrolled = 100\` (持久化落库) | 数据库行级排他锁 + 原子条件判断 (\`enrolled < capacity\`) |
| **选课流水关联** | 不存在 | 准备插入临时行 | 唯一索引记录生成 (\`id=9821\`) | 数据库复合唯一约束 \`UNIQUE(student_id, course_id)\` |
| **数据库事务** | 无活跃事务 | \`Transaction Status: ACTIVE\` | \`Transaction Status: COMMITTED\` | Spring \`@Transactional\` AOP 切面与底层连接事务管理 |
| **持久化日志** | 无新增日志记录 | Redo Log 缓冲区追加日志条目 | 日志达到配置所要求的持久化级别 | 数据库预写日志（WAL）与崩溃恢复协议 |

> **原子性边界说明**：数据库事务的原子性（Atomicity）只覆盖**数据库事务边界之内**的操作——上表中的 \`UPDATE courses\` 与 \`INSERT enrollments\` 要么一起提交、要么一起回滚。它**不覆盖**浏览器状态、客户端网络请求、HTTP 传输、响应返回与前端 UI 更新：整个端到端链路并不存在一个统一的单一原子事务。一个关键反例是：数据库已经 COMMIT 成功，但返回客户端的 HTTP 响应丢失——此时服务端状态已经成功改变，客户端却不知道操作是否成功。这正是第50章讨论网络重试与幂等性的原因之一。

---

## 5. 实现与架构层面的客观说明

> **技术实现声明**：
> 上述链路以现代工业界非常经典的 **Vue 3 + Spring Boot + MySQL (InnoDB)** 技术组合为例展示了一条典型的端到端全链路。
> 在实际工程中，具体的细节会因技术选型不同而有所差异（例如前端换用 React/Svelte、后端换用 Go/Rust/Node.js、存储换用 PostgreSQL/Redis）。
> 但值得记住的是：**无论具体技术栈如何更迭，控制流的分层流转、跨边界的数据格式转换、并发一致性与状态确定性等问题，会在大量软件系统中反复出现——它们是具有高迁移价值的设计维度。**
`
});

// 第 57 章
part6Docs.push({
  id: "doc:hello-system-57-architectural-tradeoffs",
  slug: "57-architectural-tradeoffs",
  parentId: "'doc:hello-system-part-6'",
  title: "第57章 架构没有银弹：权衡的艺术",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 57,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第57章 架构没有银弹：权衡的艺术

## 1. 一切皆是权衡（Trade-offs）

“一切皆是权衡”是工程师们在长期实践中总结出的经验共识（而非某条正式的学术定律）。计算机图灵奖得主 Fred Brooks 曾在著名论文 *No Silver Bullet* 中断言：**没有任何一项单一的技术或管理革新，能承诺在十年内将软件的生产率和可靠性提高一个数量级。**

在软件架构的世界里，**根本不存在绝对完美的“最佳方案”，只存在针对特定场景的“最佳权衡”**：

\`\`\`mermaid
flowchart LR
    subgraph Tradeoff1["权衡一：规范化 vs 查询性能"]
        T1A["高度规范化 (3NF/BCNF)\n消除数据冗余与更新异常\n代价: 复杂查询需要高频 JOIN，吞吐下降"] <==> T1B["反规范化 (冗余冗余字段/宽表)\n单表查询极快，吞吐极高\n代价: 写入时必须多处同步更新，存在不一致风险"]
    end
\`\`\`

\`\`\`mermaid
flowchart LR
    subgraph Tradeoff2["权衡二：强一致性 vs 极致吞吐"]
        T2A["悲观锁 / 强事务 (ACID)\n可靠防止名额超卖\n代价: 高并发下大量线程排队与锁等待"] <==> T2B["最终一致性 / 异步队列排队\n极高并发吞吐，瞬时响应\n代价: 业务逻辑复杂，需异步轮询与补偿退款"]
    end
\`\`\`

作为一名优秀的软件工程师，评价你的标准从来不是“知道多少时髦的名词”，而是**能否准确评估业务当前所处的阶段与规模，并做出最恰当的工程妥协**。
`
});

// 第 58 章
part6Docs.push({
  id: "doc:hello-system-58-anti-over-engineering",
  slug: "58-anti-over-engineering",
  parentId: "'doc:hello-system-part-6'",
  title: "第58章 警惕过度设计：从简单出发，伴随复杂度演进",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 58,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第58章 警惕过度设计：从简单出发，伴随复杂度演进

## 1. 常见的新手过度设计陷阱

在系统最初只有 3 个人访问、业务逻辑只有 50 行时，强行套用复杂的工业级架构，是造成系统开发延期与维护噩梦的最主要元凶：

- **陷阱一：过早引入微服务（Premature Microservices）**：一个只有几个页面由两人维护的系统，被强行拆分成 10 个独立微服务，结果大部分时间都浪费在了处理网络调用、分布式事务与部署链路上；
- **陷阱二：为不存在的未来设计扩展（YAGNI - You Aren't Gonna Need It）**：为了一句“未来可能换数据库”，硬生生写了 5 层抽象适配器，而这个所谓的“未来”在产品生命周期内从未发生。

---

## 2. 演进式架构黄金法则

\`\`\`mermaid
flowchart TD
    Stage1["阶段一：单一脚本 / 简单单体 (KISS 原则)\n关注核心业务闭环，最快速度交付验证"] --> ScaleCheck{"业务规模与复杂度\n是否真的撞墙？"}
    ScaleCheck -->|否| Keep["保持当前最简架构，拒绝不必要的设计"]
    ScaleCheck -->|是 (规模扩张)| Stage2["阶段二：引入模块化分层与面向对象抽象\n划定清晰职责边界"]
    Stage2 --> Stage3["阶段三：读写分离、缓存优化与分布式拆分\n针对性解决具体性能与可靠性瓶颈"]
\`\`\`

**优秀的架构是随着业务痛苦“自然生长”出来的，而不是预先臆想出来的。**
`
});

// 第 59 章（框架消失以后：跨技术栈通用心智模型提炼）
part6Docs.push({
  id: "doc:hello-system-59-after-frameworks-disappear",
  slug: "59-after-frameworks-disappear",
  parentId: "'doc:hello-system-part-6'",
  title: "第59章 框架消失以后：留在脑海中的核心问题",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 59,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第59章 框架消失以后：留在脑海中的核心问题

## 1. 一个思维实验：如果明天所有框架全部消失？

让我们做一个深刻的思想实验：

假设明天太阳升起时，Vue 被废弃了，Spring Boot 消失了，MySQL 不复存在了。

**作为一名计算机专业的学生，读完这本书后，你的脑海中还能剩下什么？**

如果你记住的仅仅是 \`v-model\`、\`@Transactional\` 和 \`SELECT ... JOIN\` 的语法参数，那么面对一个全新的技术栈（如 React、Svelte、Go、Rust、PostgreSQL、Flutter），你将不得不再次经历痛苦的死记硬背。

但如果你真正理解了隐藏在这些框架背后的**软件系统中反复出现的十二个核心问题**，你将拥有一种非常具有迁移价值的分析维度，在面对新技术栈时迅速定位“它正在解决哪一类问题”：

---

## 2. 软件系统中反复出现的十二个核心问题

\`\`\`mermaid
flowchart TD
    subgraph Core["软件系统反复出现的 12 个核心问题"]
        C1["1. 状态 (State) 与身份 (Identity)"]
        C2["2. 不变量 (Invariants) 与状态受控跃迁"]
        C3["3. 职责边界 (Boundaries) 与抽象契约 (Contracts)"]
        C4["4. 跨边界表示与序列化 (Representation & Serialization)"]
        C5["5. 声明式状态映射 (Declarative Mapping: UI = f(state))"]
        C6["6. 数据模型与规范化 (Data Modeling & Normalization)"]
        C7["7. 持久化与日志 (Persistence & WAL)"]
        C8["8. 并发竞争控制 (Concurrency Control)"]
        C9["9. 故障与恢复 (Faults & Recovery)"]
        C10["10. 信任边界与防御性输入验证 (Trust Boundary & Validation)"]
        C11["11. 不可靠通信与幂等性保障 (Communication & Idempotency)"]
        C12["12. 系统可观测性与自动化分层测试防护 (Observability & Testing)"]
    end
\`\`\`

需要明确：这十二条**不是永恒的宇宙定律**，而是在大量软件系统中反复出现、被工程实践反复验证过的核心问题与设计维度。

---

## 3. 跨技术栈无缝迁移映射表

| 核心抽象原理 | 本书所用主线栈 (Vue + Spring + MySQL) | 前端 React 生态 | 后端 Go / Rust 生态 | 跨平台移动端 (Flutter) |
| :--- | :--- | :--- | :--- | :--- |
| **声明式 UI 映射** | Vue 3 模板 + \`reactive\` Proxy | React JSX + \`useState\` 状态对比 | WebAssembly / SSR 模板 | Flutter \`Widget\` 树状态重建 |
| **单向数据流** | Props Down, Events Up | Props + State 提升 (Redux) | Channel 通信与不可变消息 | Bloc / Riverpod 状态流 |
| **业务与持久化解耦** | Spring Service + Repository | BFF 逻辑层 + Data Mapper | Go Clean Architecture Domain 接口 | Repository 接口 + SQLite 驱动 |
| **关系规范化与索引** | MySQL InnoDB + B+ Tree | PostgreSQL + B-Tree / GIN | SQLite / TiDB 存储引擎 | Drift / Room ORM 规范化表 |
| **并发名额防超卖** | \`WHERE enrolled < capacity\` 原子更新 | 相同 SQL 条件更新 | Go CAS / SQL 原子条件更新 | 乐观锁版本号重试 |
| **跨网络通信幂等** | HTTP Header: \`Idempotency-Key\` | 幂等请求头拦截器 | gRPC 幂等元数据拦截 | 客户端去重缓存令牌 |

你看，**语言和框架在变，但解决问题的思想从未改变。**
`
});

// 第 60 章（全景终章闭环：重回起点）
part6Docs.push({
  id: "doc:hello-system-60-click-again",
  slug: "60-click-again",
  parentId: "'doc:hello-system-part-6'",
  title: "第60章 现在，再点击一次“选课”",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 60,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第60章 现在，再点击一次“选课”

## 1. 重回起点：建立全景心智模型

现在，让我们再次回到那个选课界面。

\`\`\`text
┌────────────────────────────────────────────────────────┐
│  Mini Campus 校园选课系统                               │
│  当前登录学生：李雷 (学号: 1001)                         │
├────────────────────────────────────────────────────────┤
│  课程代码: CS-101                                      │
│  课程名称: 计算机系统导论                               │
│  任课教师: 严教授                                       │
│  当前剩余名额: 1 / 100                                 │
│                                                        │
│                  [   选  课   ]                        │
└────────────────────────────────────────────────────────┘
\`\`\`

当你的手指再次悬停在这个蓝色的“选课”按钮上时，你的眼中不再只是一个孤立的网页像素方块。

在你脑海中展现的，是一幅恢弘、清晰且完全由理性逻辑构筑的系统全景图：

- **在浏览器端**：你清楚地知道，一次鼠标点击触发了 DOM 事件调度，Vue 3 的响应式代理拦截器捕获了交互意图，\`isSubmitting\` 状态的跃迁在微任务队列中触发了虚拟 DOM 补丁重绘，将按钮安全置灰；
- **在网络边界**：你清楚地知道，内存对象被序列化为标准的 JSON 纯文本，封装进符合 RFC 9110 语义的 HTTP POST 报文，携带着安全认证凭证与幂等键跨越网络；
- **在表现层与业务层**：你清楚地知道，Controller 从安全上下文中提取了真实的李雷身份，严防客户端伪造，并将请求分发给编排用例的 Service。Service 在 Spring \`@Transactional\` 的 AOP 代理下开启了数据库事务；
- **在数据库存储引擎**：你清楚地知道，B+ 树主键索引快速定位到了数据页，行级排他锁与原子条件更新（\`enrolled < capacity\`）在数据库内可靠地防止了超卖，修改后的脏页安睡在 Buffer Pool 中，而保障持久性的 Redo Log 已按配置要求完成持久化；
- **在回传链路**：你清楚地知道，HTTP 201 Created 响应报文回传浏览器，Promise 决议解冻了前端状态，响应式数据流自动驱动视图局部更新，将“选课成功”的确定性反馈呈现给用户。

---

## 2. 结语：计算机科学的真正魅力

计算机软件系统的真正魅力，从来不是记住几百个现成的 API 或快速拼凑出一个玩具项目。

它的魅力在于：**我们通过层层抽象，将复杂、多变且充满不确定性的现实世界，分解为一个个清晰、自治且可控的逻辑单元；同时，当系统在任何一个角落发生故障时，我们又拥有能够穿透层层抽象、看清每个齿轮如何咬合运转的深刻洞察力。**

希望《Hello System · 图解软件系统》能够帮助你在大学生涯乃至未来的工程师道路上，建立起这份坚不可摧、通透严谨的系统视角。

愿你在未来的每一次代码架构与系统创造中，胸有成竹，行稳致远。
`
});

export { part6Docs };
