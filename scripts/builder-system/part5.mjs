// scripts/builder-system/part5.mjs
// 第五部分：真实系统开始反抗 (47 ~ 55)
// 深度教科书级高密度完整版本 (全 9 章完整深度展开)

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
    title: "第47章 如果用户提交了一份错误的数据呢？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第47章 如果用户提交了一份错误的数据呢？

## 1. 零信任架构（Zero Trust）：前端防君子，后端防小人

在真实网络环境中，攻击者可以绕过前端页面的任何表单校验规则，直接使用 Postman 或 Python 脚本向后端发送恶意 JSON：
- \`{"studentId": -999, "courseId": "null"}\`
- \`{"studentId": 1001, "courseId": 2048, "adminPrivilege": true}\`

#### 铁律：
> **前端校验只是为了提升正常用户的交互体验（减少无谓的网络往返），后端校验才是捍卫系统安全的真正铁门。**
> 后端必须假设所有从网络流入的字节流都是充满敌意和污染的。
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

## 1. 异常调用栈穿透与事务自动回滚

当选课过程中抛出业务异常（如 \`CourseFullException\`）时：

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Ctrl as Controller
    participant Svc as Service (@Transactional)
    participant DB as 数据库事务

    Ctrl->>Svc: enroll()
    Note over Svc: 开启数据库事务 BEGIN
    Svc->>DB: 扣减名额成功
    Note over Svc: 业务检查发现学生已被处分，抛出 StudentSuspendedException!
    Note over Svc: Spring 捕获 RuntimeException，触发自动 ROLLBACK
    Svc->>DB: 发送 ROLLBACK 回滚指令，撤销扣减名额
    Svc-->>Ctrl: 异常穿透向上抛出
    Note over Ctrl: 全局异常处理器 @ControllerAdvice 捕获，转换为 HTTP 403 JSON
\`\`\`
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

## 1. 状态码的精准语义矩阵

许多低质量系统喜欢无论发生什么都返回 \`HTTP 200 OK\`，然后在 Body 里塞 \`{"code": -1, "msg": "密码错误"}\`。

这违背了 HTTP 协议标准，会导致反向代理、网关缓存和监控系统完全失效。

| 状态码 | 英文含义 | 选课系统中的精确使用场景 |
| :--- | :--- | :--- |
| **200** | OK | 成功获取课程列表 (GET) |
| **201** | Created | 成功创建选课记录 (POST) |
| **400** | Bad Request | 请求参数格式错误 (学号传入了字母) |
| **401** | Unauthorized | 未登录或 Token 已过期 |
| **403** | Forbidden | 登录了但无权限 (非本专业学生选修限定课程) |
| **404** | Not Found | 请求的课程代码在系统中不存在 |
| **409** | Conflict | 业务状态冲突 (名额已被抢光、重复选课) |
| **500** | Internal Error | 服务器内部不可预期崩溃 (数据库断开) |
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

## 1. 幂等性（Idempotency）与防重防抖

当网络出现几秒钟卡顿时，急躁的学生往往会在 1 秒内疯狂点击 10 次“选课”按钮。

- **前端防抖（Debounce）**：点击瞬间将按钮置为 \`disabled\`，展示 loading 转圈；
- **后端幂等 Token 机制**：进入选课页面时预先生成一个唯一的 \`requestToken\`，后端使用 Redis 或数据库唯一索引记录该 Token。后续携带相同 Token 的重复请求直接被拦截或返回相同结果，**绝不重复扣减名额**。
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

## 1. CAS 条件更新与乐观并发控制（OCC）

悲观排他锁（\`FOR UPDATE\`）在高并发下会导致大量数据库连接排队阻塞。

工业级秒杀选课常采用基于 **CAS（Compare And Swap）** 的无锁条件更新：

\`\`\`sql
-- 一行 SQL 实现原子扣减防超卖
UPDATE courses 
SET enrolled = enrolled + 1, version = version + 1
WHERE id = 2048 
  AND enrolled < capacity; -- 核心防线：只有当前已选人数小于容量时才允许更新！
\`\`\`

数据库通过行级原子的 Update 锁裁决：
- 李雷的请求命中，更新成功（影响行数 1）；
- 韩梅梅的请求在同一微秒执行时，由于条件 \`enrolled < capacity\` 已不再满足，更新失败（影响行数 0）。
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

## 1. 预写重做日志（WAL, Write-Ahead Logging）

在传统机械硬盘或 SSD 上，随机写入一个数据页（16KB）极其缓慢。

数据库为了保证高性能同时不丢失数据，采用了 **WAL 机制**：

\`\`\`mermaid
flowchart TD
    Update["事务提交 COMMIT"] --> WAL["1. 顺序追加写入 Redo Log (WAL 日志)\n极速顺序 I/O (微秒级)"]
    WAL --> DiskWAL["WAL 刷盘成功 (fsync)"]
    DiskWAL --> Resp["立刻向客户端返回选课成功！"]
    
    Resp -.-> BufferPool["2. 内存 Buffer Pool 中的数据页标记为脏页 (Dirty)"]
    BufferPool -.->|后台异步排队| LazyFlush["3. Checkpoint 检查点后台刷入物理数据文件 (慢速随机 I/O)"]
\`\`\`

如果在步骤 3 之前突然停电：
系统重启时，数据库引擎自动重放 WAL 日志中的全部操作，将丢失的内存修改**物理重做（Redo Recovery）**回来！
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

## 1. 工业级日志（Logging）四大核心要素

严禁在生产代码中写 \`System.out.println()\` 或 \`e.printStackTrace()\`。

一份合格的结构化日志必须包含：
1. **精确物理时间戳（Timestamp）**
2. **日志级别（Log Level）**：\`DEBUG\`, \`INFO\`, \`WARN\`, \`ERROR\`
3. **全链路追踪标识（Trace ID / Request ID）**：跨前后端全链路串联单次请求
4. **上下文结构化实体（Context）**：学号、课程代码、当前耗时

\`\`\`json
{"timestamp":"2026-08-28T10:00:00.123Z","level":"INFO","traceId":"req-a8f9-4b12","service":"EnrollmentService","action":"ENROLL_SUCCESS","studentId":1001,"courseId":2048,"costMs":42}
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

## 1. 环境隔离与 12-Factor 原则

- **开发环境（DEV）**：本地轻量 SQLite / H2 数据库，日志输出详细 DEBUG；
- **测试环境（TEST）**：用于自动化测试与 QA 验收；
- **生产环境（PROD）**：高可用 MySQL 集群，严格安全审计。

#### 核心原则：
> **配置与代码严格分离（Config via Environment Variables）**。
> 数据库连接串、秘钥、外部服务地址必须通过环境变量注入，严禁硬编码在任何源码文件中。
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

\`\`\`mermaid
flowchart TD
    E2E["端到端测试 (E2E Tests)\n数量极少, 运行慢, 模拟真实浏览器点击"]
    Integration["集成测试 (Integration Tests)\n测试 Controller -> Service -> DB 整体链路"]
    Unit["单元测试 (Unit Tests)\n数量庞大, 毫秒级执行, 针对领域实体与算法规则"]

    E2E --> Integration
    Integration --> Unit
\`\`\`

单元测试是保护重构的唯一救生索。当业务规则变更时，成百上千个自动化测试用例在几秒钟内全部跑通，是工程师对系统拥有绝对信心的唯一来源。
`
  }
];
