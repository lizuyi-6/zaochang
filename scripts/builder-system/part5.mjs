// scripts/builder-system/part5.mjs
// 第五部分：真实系统开始反抗 (47 ~ 55)
// 全量技术修订与规范化完整版本 (全 9 章高密度深度正文)

export const part5Docs = [
  {
    id: "doc:hello-system-part-5",
    slug: "part-5",
    parentId: "'doc:book-hello-system'",
    title: "第五部分 · 真实系统开始反抗",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 7,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-system-47-defensive-validation",
    slug: "47-defensive-validation",
    parentId: "'doc:hello-system-part-5'",
    title: "第47章 信任边界：为什么服务器必须重新验证请求？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第47章 信任边界：为什么服务器必须重新验证请求？

## 1. 客户端与服务端的信任边界

在 Web 应用中，运行在用户浏览器上的前端界面处于不可信环境。攻击者或脚本可以完全绕过前端 UI 逻辑，直接向后端端点发送构造好的 HTTP 报文：

- 提交不合法的负数或格式错误的字段；
- 尝试伪造其他用户的身份 ID；
- 在请求体中附带未经授权的私有字段。

#### 核心原则：
> **前端校验的主要目的在于提升正常用户的交互体验（即时反馈、减少不必要的网络往返），不能作为系统安全的授权依据。**
> 后端服务处于系统的信任边界之内，必须对所有外部传入的数据执行严格的输入验证、身份认证与权限检查。

\`\`\`mermaid
flowchart LR
    Browser["不可信客户端\n(前端表单校验: 仅用于优化用户体验)"] -->|跨越网络边界| Server["可信后端服务\n(执行鉴权、格式校验与不变量判定)"]
    Server -->|合法操作| DB[(数据库持久化)]
\`\`\`

---

## 2. 概念小贴士：这和“零信任（Zero Trust）”是一回事吗？

> **说明**：
> 这里讨论的是**客户端与服务端之间的基础信任边界与输入验证**。
> **零信任架构（Zero Trust Architecture, 如 NIST SP 800-207 所定义）** 是一个更为广泛的企业安全战略体系，其核心原则是“持续验证、永不隐式信任”，涵盖身份微隔离、网络分段、设备合规性持续评估等多维度安全机制，二者不应混淆。
`
  },
  {
    id: "doc:hello-system-48-exception-and-rollback",
    slug: "48-exception-and-rollback",
    parentId: "'doc:hello-system-part-5'",
    title: "第48章 如果程序运行到一半失败了呢？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 2,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第48章 如果程序运行到一半失败了呢？

## 1. 异常传播与事务回滚机制

当业务用例在执行过程中遇到错误时（如学生已被停课处分或数据库唯一键冲突），系统通过抛出异常中断当前流程：

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Ctrl as Controller
    participant Svc as Service (@Transactional)
    participant DB as 数据库事务

    Ctrl->>Svc: enroll(studentId, courseId)
    Note over Svc: 开启数据库事务 BEGIN
    Svc->>DB: 扣减名额成功
    Note over Svc: 业务规则校验失败，抛出 BusinessException!
    Note over Svc: 事务管理器捕获未处理的运行时异常，发起 ROLLBACK
    Svc->>DB: 发送 ROLLBACK 指令，撤销已执行的更新
    Svc-->>Ctrl: 异常向上抛出
    Note over Ctrl: 全局异常处理器 (@RestControllerAdvice) 捕获并封装为 409 JSON 响应
\`\`\`

---

## 2. Spring 声明式事务的回滚规则说明

【以 Spring Framework 为例】：
- 默认情况下，Spring 声明式事务（\`@Transactional\`）仅在遇到未捕获的 **\`RuntimeException\`** 和 **\`Error\`** 时自动触发事务回滚；
- 对于受检异常（Checked Exception，继承自 \`Exception\`），默认**不会**触发回滚，除非显式指定 \`@Transactional(rollbackFor = Exception.class)\`；
- 如果业务代码在内部用 \`try-catch\` 捕获并吞掉了异常，外部事务管理器将感知不到失败，事务可能依然被正常提交。
`
  },
  {
    id: "doc:hello-system-49-http-status-codes-in-action",
    slug: "49-http-status-codes-in-action",
    parentId: "'doc:hello-system-part-5'",
    title: "第49章 HTTP 200并不代表所有事情都成功",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第49章 HTTP 200并不代表所有事情都成功

## 1. HTTP 状态码的语义化实践

在 REST 风格 API 设计中，准确使用 HTTP 状态码有助于反向代理、API 网关、监控告警和客户端正确理解请求结果。

| 状态码 | 标准定义 (RFC 9110) | Mini Campus 选课系统中的典型使用场景 |
| :--- | :--- | :--- |
| **200 OK** | 请求已成功处理 | 成功查询课程列表或学生课表 |
| **201 Created** | 资源已成功创建 | 成功创建一条新的选课记录 |
| **204 No Content** | 请求成功，无响应体内容 | 成功退选课程或删除资源 |
| **400 Bad Request** | 客户端请求报文存在语法或格式错误 | 请求 Body JSON 格式不合法或必填字段缺失 |
| **401 Unauthorized** | 请求缺乏有效身份认证凭据 | 未携带 Token 或 Token 已失效 |
| **403 Forbidden** | 服务器理解请求但拒绝授权访问 | 学生尝试调用管理员专用的批量导入接口 |
| **404 Not Found** | 目标资源未找到 | 请求的课程 ID 在系统中不存在 |
| **409 Conflict** | 请求与当前资源的状态发生冲突 | 选课时名额已满，或已选过该课程导致冲突 |
| **422 Unprocessable** | 请求语法正确但包含语义错误 | 提交的选课学分超出学期上限约束 |
| **500 Internal Error** | 服务器遇到未预料的情况导致无法完成请求 | 数据库网络断开等未捕获的系统内部故障 |
`
  },
  {
    id: "doc:hello-system-50-idempotency-and-repeated-clicks",
    slug: "50-idempotency-and-repeated-clicks",
    parentId: "'doc:hello-system-part-5'",
    title: "第50章 如果用户连续点十次按钮呢？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 4,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第50章 如果用户连续点十次按钮呢？

## 1. 概念澄清：防抖、节流与幂等性

必须清晰区分前端交互控制与服务端幂等保证：

1. **防重复提交保护（In-Flight Guard）**：用户点击后立即将按钮置为禁用状态，防止用户在等待期间连续触发；
2. **防抖（Debounce）**：在事件被触发后等待特定时间段，若期间再次触发则重新计时（常用于搜索输入框联想）；
3. **节流（Throttle）**：在固定时间间隔内只允许执行一次处理（常用于滚动或窗口尺寸改变事件）；
4. **服务端幂等性（Idempotency）**：同一个操作无论在服务端执行一次还是多次，对系统状态产生的最终影响均保持一致。

\`\`\`mermaid
flowchart TD
    subgraph ClientProtection ["客户端保护 (改善体验)"]
        Click["用户频繁点击"] --> Guard["按钮 Disabled 状态控制"]
    end

    subgraph ServerIdempotency ["服务端幂等机制 (保障数据一致性)"]
        Req["网络请求 (可能因超时发生重试)"] --> CheckToken{"携带 Idempotency-Key 检查"}
        CheckToken -->|已处理过| CachedResp["直接返回上次成功结果 (不重复扣名额)"]
        CheckToken -->|首次处理| Process["执行选课事务"]
    end
\`\`\`

---

## 2. 为什么服务端必须具备幂等处理能力？

在不可靠的网络环境中，客户端发起选课后可能因网络抖动未收到响应。客户端或网关发起重试时，服务端若无幂等保护，可能导致重复扣费或状态异常。

通过引入 **Idempotency-Key** 或利用数据库业务唯一索引（\`UNIQUE(student_id, course_id)\`），系统能够确保重复提交不会导致非预期的副作用。
`
  },
  {
    id: "doc:hello-system-51-cas-and-optimistic-locking",
    slug: "51-cas-and-optimistic-locking",
    parentId: "'doc:hello-system-part-5'",
    title: "第51章 如果两个人争抢最后一个名额呢？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第51章 如果两个人争抢最后一个名额呢？

## 1. 高并发选课的原子条件更新

在高并发场景下，使用行级排他锁（\`SELECT ... FOR UPDATE\`）可能在高争用时产生锁等待开销。

一种常用且高效的方案是利用数据库 Update 语句自身的行级原子性执行**条件更新**：

\`\`\`sql
-- 在同一事务中执行
UPDATE courses 
SET enrolled = enrolled + 1 
WHERE id = 2048 AND enrolled < capacity;
\`\`\`

\`\`\`java
@Transactional
public EnrollResult enroll(int studentId, int courseId) {
    // 1. 执行原子条件更新
    int affectedRows = courseRepository.incrementIfAvailable(courseId);
    if (affectedRows == 0) {
        return EnrollResult.failure("课程名额已满");
    }

    // 2. 插入选课流水
    try {
        enrollmentRepository.insert(studentId, courseId);
        return EnrollResult.success();
    } catch (DuplicateKeyException e) {
        throw new BusinessException("已选修该课程");
    }
}
\`\`\`

---

## 2. 关于基于版本号的乐观并发控制（OCC）

> **说明**：
> 若采用标准的**基于版本号的乐观锁（Optimistic Locking）**，实体表中需包含 \`version\` 字段：
> \`UPDATE courses SET enrolled = ?, version = version + 1 WHERE id = ? AND version = ?;\`
> 若更新失败（影响行数为 0），应用层需捕获冲突并决定是否重试。在简单的计数器扣减场景中，直接使用带业务条件（\`enrolled < capacity\`）的原子 Update 往往更为简洁有效。
`
  },
  {
    id: "doc:hello-system-52-wal-and-crash-recovery",
    slug: "52-wal-and-crash-recovery",
    parentId: "'doc:hello-system-part-5'",
    title: "第52章 如果系统重启，数据为什么还在？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 6,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第52章 如果系统重启，数据为什么还在？

## 1. 预写日志（WAL, Write-Ahead Logging）原理

在数据库管理系统中，若每次事务提交都将修改的数据页（通常为 16KB）同步写回磁盘的物理数据文件，将产生大量的随机 I/O，严重制约吞吐量。

**WAL 原则** 规定：**数据页的修改可以在内存中进行，但在这些脏页（Dirty Page）被写入磁盘数据文件之前，相关的重做日志（Redo Log）必须先达到要求的持久化状态。**

---

## 2. 数据更新与恢复流程（以 MySQL InnoDB 为例）

\`\`\`mermaid
flowchart TD
    Update["1. 事务修改内存 Buffer Pool 中的数据页"] --> Dirty["数据页变为脏页 (Dirty Page)"]
    Update --> RedoLog["2. 生成 Redo Log 记录并写入日志缓冲区"]
    Commit["3. 事务提交 COMMIT"] --> FlushLog["4. 根据配置刷盘 Redo Log (顺序 I/O)"]
    FlushLog --> Ack["向客户端响应成功"]
    
    Dirty -.->|后续异步操作| Checkpoint["5. 检查点机制 (Checkpoint) 后台将脏页刷入数据文件"]
\`\`\`

#### 崩溃恢复（Crash Recovery）：
若在步骤 5 发生前系统意外断电重启，数据库在启动时通过扫描 Redo Log，将已提交但尚未刷盘的数据页重新应用恢复，从而保障事务的**持久性（Durability）**。
`
  },
  {
    id: "doc:hello-system-53-logging-and-observability",
    slug: "53-logging-and-observability",
    parentId: "'doc:hello-system-part-5'",
    title: "第53章 程序出错以后，我们怎么知道发生了什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 7,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第53章 程序出错以后，我们怎么知道发生了什么？

## 1. 可观察性与结构化日志

在生产环境中，简单的 \`System.out.println()\` 存在无法格式化、缺乏上下文与不易检索的缺陷。

现代系统依赖**三大可观察性支柱**：
- **日志（Logs）**：记录离散的事件详情；
- **指标（Metrics）**：聚合统计系统的运行状态（如 QPS、错误率、CPU 占用）；
- **追踪（Traces）**：记录跨服务调用的时序路径与耗时。

---

## 2. 生产日志的最佳实践

1. **结构化输出（如 JSON 格式）**：便于日志收集系统（如 ELK、Loki）进行字段索引与解析；
2. **链路追踪标识（Correlation ID / Trace ID）**：在请求入口生成唯一标识并贯穿调用链；
3. **保护敏感信息（PII 脱敏）**：严禁在日志中打印明文密码、银行卡号与个人隐私数据。

\`\`\`json
{
  "timestamp": "2026-08-28T10:00:00.120Z",
  "level": "INFO",
  "traceId": "req-9b1a-4c22",
  "logger": "com.campus.service.EnrollmentService",
  "event": "ENROLLMENT_SUCCESS",
  "studentId": 1001,
  "courseId": 2048
}
\`\`\`
`
  },
  {
    id: "doc:hello-system-54-environment-isolation-12factor",
    slug: "54-environment-isolation-12factor",
    parentId: "'doc:hello-system-part-5'",
    title: "第54章 “在我的电脑上可以运行”为什么远远不够？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 8,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第54章 “在我的电脑上可以运行”为什么远远不够？

## 1. 环境隔离与环境一致性

软件从开发到上线通常经历多个独立环境：
- **开发环境（DEV）**
- **测试环境（TEST / QA）**
- **预发布环境（STAGING）**
- **生产环境（PROD）**

> **关于测试数据库一致性的重要提示**：
> 过去有些项目习惯在开发环境使用 SQLite 或 H2 内存数据库，而在生产环境使用 MySQL。这会导致部分方言特性、锁行为与事务隔离机制在测试中无法真实复现。
> 现代工程实践推荐通过容器化工具（如 **Testcontainers**）在测试环境中使用与生产环境相同类型的真实数据库。

---

## 2. 配置与代码分离（12-Factor 原则）

**Twelve-Factor App** 是一套构建现代可扩展应用的工程方法论。其核心要求之一是**将配置与代码严格分离**：
- 数据库连接串、API 密钥与服务地址应通过环境变量或专用的配置中心（如 Spring Cloud Config、Consul）注入；
- 严禁将敏感凭据硬编码在代码仓库中。
`
  },
  {
    id: "doc:hello-system-55-test-pyramid",
    slug: "55-test-pyramid",
    parentId: "'doc:hello-system-part-5'",
    title: "第55章 怎样证明我们的代码还可以工作？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 9,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第55章 怎样证明我们的代码还可以工作？

## 1. 测试金字塔（The Test Pyramid）

测试金字塔是一种指导测试用例配比的经验模型：

\`\`\`mermaid
flowchart TD
    E2E["端到端测试 (E2E Tests)\n数量较少，执行成本高，验证全链路真实交互"]
    Integration["集成测试 (Integration Tests)\n验证 Controller -> Service -> Repository 跨组件协同"]
    Unit["单元测试 (Unit Tests)\n数量最多，毫秒级快速反馈，覆盖核心业务规则与算法"]

    E2E --> Integration
    Integration --> Unit
\`\`\`

---

## 2. 多重质量保证体系

自动化测试并不是保证软件质量的唯一手段，工程实践中通常结合多种质量防线：
- **单元测试与集成测试**：提供快速回归验证能力；
- **静态代码分析与类型检查**：在编译前捕获潜在类型错误与代码异味；
- **代码审查（Code Review）**：促进团队知识共享与架构规范落地；
- **生产环境可观察性**：通过告警与指标及时发现线上异常。
`
  }
];
