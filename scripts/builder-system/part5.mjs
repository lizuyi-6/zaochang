// scripts/builder-system/part5.mjs
// 《Hello System · 图解软件系统》第五部分：真实系统开始反抗 (第 47 ~ 55 章)（全量教材化深度扩写版本）

const part5Docs = [];

// 顶层部分节点
part5Docs.push({
  id: "doc:hello-system-part-5",
  slug: "part-5",
  parentId: "'doc:book-hello-system'",
  title: "第五部分: 真实系统开始反抗 (47~55)",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 7,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第五部分: 真实系统开始反抗 (47~55)

本部分聚焦于**分布式网络与企业级生产环境中的高可靠性与防御性设计**。

真实世界的软件系统绝非运行在风平浪静的理想实验室内。我们将直面客户端恶意篡改、高并发争抢名额、网络丢包超时重试、服务器突然断电崩溃以及多环境部署差异等现实挑战。我们将深入推导信任边界校验、事务异常传播与回滚机制、防抖/节流/幂等性治理、原子条件更新、WAL 崩溃恢复算法、结构化日志可观测性与测试金字塔质量防护网。
`
});

// 第 47 章
part5Docs.push({
  id: "doc:hello-system-47-defensive-validation",
  slug: "47-defensive-validation",
  parentId: "'doc:hello-system-part-5'",
  title: "第47章 信任边界：为什么服务器必须重新验证请求？",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 47,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第47章 信任边界：为什么服务器必须重新验证请求？

## 1. 客户端与服务端的信任边界（Trust Boundary）

在 Web 应用中，运行在用户浏览器上的前端 JavaScript 代码处于**完全不可控的外部不安全环境**中。

任何一个懂一点基础技术的用户，都可以打开浏览器的“开发者工具（F12）”，或者使用 Postman、curl 等命令行工具，完全绕过前端 UI 上的所有按钮置灰和表单校验逻辑，直接向后端端点发送恶意构造的 HTTP 报文：

\`\`\`bash
# 恶意攻击者直接用 curl 伪造请求，强行选修非法课程
curl -X POST https://www.aetherstudio.top/api/enrollments \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <stolen_token>" \\
  -d '{"courseId": -9999}'
\`\`\`

\`\`\`mermaid
flowchart LR
    subgraph Untrusted["不可信区域 (Untrusted Zone)"]
        Browser["用户浏览器 / 爬虫脚本 / Postman"]
    end

    subgraph Boundary["信任边界 (Trust Boundary)"]
        Gateway["API 网关 / 身份认证过滤器 / 参数校验切面"]
    end

    subgraph Trusted["可信受保护区域 (Protected Core)"]
        Service["后端业务服务 (Service)"]
        DB[("核心数据库")]
    end

    Browser -->|跨越公网发送请求| Gateway
    Gateway -->|校验失败 (400/401/403)| Reject["直接拦截并拒绝"]
    Gateway -->|校验通过| Service
    Service --> DB
\`\`\`

---

## 2. 前端校验与后端校验的本质分工

| 校验层级 | 核心目标与定位 | 典型场景 |
| :--- | :--- | :--- |
| **前端校验（Client-side Validation）** | **优化用户体验（UX）**：在用户输入时提供毫秒级的即时视觉反馈，减少不必要的无效网络往返 | 检查手机号格式、必填项高亮、密码强度提示 |
| **后端校验（Server-side Validation）** | **捍卫系统安全与数据完整性**：绝对不信任任何客户端输入，构筑不可逾越的安全底线 | 校验业务实体是否存在、权限范围审查、业务不变量判别 |

---

## 3. 声明式参数校验规范（Bean Validation / JSR-380）

在 Java 后端中，我们使用标准的 Bean Validation 注解对 Request DTO 进行声明式约束：

\`\`\`java
public record EnrollRequest(
    @NotNull(message = "课程 ID 不能为空")
    @Positive(message = "课程 ID 必须为正整数")
    Integer courseId
) {}
\`\`\`

在 Controller 中通过 \`@Valid\` 注解激活校验，非法参数在进入业务 Service 之前将被框架自动拦截并返回 \`400 Bad Request\`。

---

## 4. 概念小贴士：这和“零信任（Zero Trust）”是一回事吗？

> **说明**：这里讨论的是客户端与服务端之间的基础信任边界与输入验证。零信任架构（Zero Trust Architecture, 如 NIST SP 800-207 所定义）是一个更为广泛的企业安全战略体系，包含“持续验证、永不信任”的动态访问控制与微隔离。二者不应混淆。
`
});

// 第 48 章
part5Docs.push({
  id: "doc:hello-system-48-exceptions-and-transactions",
  slug: "48-exceptions-and-transactions",
  parentId: "'doc:hello-system-part-5'",
  title: "第48章 异常与事务回滚：当事情开始出错",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 48,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第48章 异常与事务回滚：当事情开始出错

## 1. 检查型异常与非检查型异常的哲学

在 Java 异常体系中，异常被划分为两大阵营：

\`\`\`mermaid
flowchart TD
    Throwable["Throwable"] --> Error["Error (严重系统错误，如 OutOfMemoryError)"]
    Throwable --> Exception["Exception"]
    Exception --> Checked["检查型异常 (Checked Exception, 如 IOException, SQLException)\n强制要求显式 try-catch 或 throws 声明"]
    Exception --> RuntimeException["非检查型运行时异常 (Unchecked RuntimeException)\n例如: NullPointerException, BusinessException"]
\`\`\`

---

## 2. Spring 声明式事务（\`@Transactional\`）的回滚机制

在 Spring 框架**默认的代理模式（proxy-based transaction management）**下，\`@Transactional\` 由 **AOP 动态代理（AOP Proxy）** 驱动：

\`\`\`mermaid
flowchart TD
    Invoke["Controller 调用 Service 方法"] --> Proxy["TransactionInterceptor (事务拦截器切面)"]
    Proxy --> Begin["1. 开启底层数据库连接事务 (setAutoCommit(false))"]
    Begin --> Target["2. 执行目标业务方法 enrollmentService.enroll()"]
    Target --> CheckEx{"业务执行过程中是否抛出异常 ?"}
    CheckEx -->|正常无异常| Commit["3. 拦截器调用 transactionManager.commit() 提交事务"]
    CheckEx -->|抛出 RuntimeException| Rollback["4. 捕获异常，调用 transactionManager.rollback() 执行回滚！"]
\`\`\`

> **重要避坑指南**：
> 1. Spring 的 \`@Transactional\` 默认**仅对 \`RuntimeException\` 和 \`Error\` 自动触发回滚**。若抛出检查型异常（如 \`SQLException\`），必须显式配置 \`@Transactional(rollbackFor = Exception.class)\`。需要注意：Spring 的数据访问组件（如 JdbcTemplate、JPA 仓储）通常会把底层 checked 的 SQL 异常转换为 \`DataAccessException\` 等 unchecked 异常，因此在实际工程中 checked 异常直接穿透到业务层的情况并不常见；
> 2. **自调用陷阱**：在默认代理模式中，同一个类内部通过 \`this.method()\` 调用带有 \`@Transactional\` 的方法属于 self-invocation，调用不经过外部代理对象，事务拦截器因此不会重新生效。Spring 也存在其他配置与织入方式（如 AspectJ weaving），其行为与默认代理模式不同。
`
});

// 第 49 章
part5Docs.push({
  id: "doc:hello-system-49-http-status-codes-and-errors",
  slug: "49-http-status-codes-and-errors",
  parentId: "'doc:hello-system-part-5'",
  title: "第49章 统一错误处理与 HTTP 语义映射",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 49,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第49章 统一错误处理与 HTTP 语义映射

## 1. 为什么不能向前端直接抛出堆栈跟踪？

当后端发生异常时，如果不加捕获，默认会向客户端返回一个包含数百行 Java 类名与代码行号的 \`500 Internal Server Error\` HTML 错误页。

这具有极大的危害：
1. **安全信息泄露**：向攻击者暴露了服务器内部的操作系统路径、类库版本与数据库表结构；
2. **破坏前端解析**：前端原本期望接收 JSON，收到 HTML 页面后会导致前端 JavaScript JSON 解析抛出语法错误。

---

## 2. 全局异常处理器（\`@RestControllerAdvice\`）

通过全局切面将业务异常统一映射为结构化的 JSON 错误响应。这种“机器可读的错误结构”思想与 Problem Details for HTTP APIs 一致——该规范最初由 RFC 7807 定义，当前版本为 RFC 9457。下面示例中的 \`ErrorResponse\` 是 Mini Campus 的自定义精简结构，并未完整实现 RFC 9457 的全部字段：

\`\`\`java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(new ErrorResponse("BUSINESS_CONFLICT", e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getAllErrors().get(0).getDefaultMessage();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(new ErrorResponse("INVALID_ARGUMENT", msg));
    }
}
\`\`\`
`
});

// 第 50 章（严格区分 In-Flight Guard、Debounce、Throttle 与 Idempotency）
part5Docs.push({
  id: "doc:hello-system-50-idempotency-and-repeated-clicks",
  slug: "50-idempotency-and-repeated-clicks",
  parentId: "'doc:hello-system-part-5'",
  title: "第50章 如果用户连续点十次按钮呢？——防抖、节流与幂等性",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 50,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第50章 如果用户连续点十次按钮呢？——防抖、节流与幂等性

## 1. 概念澄清：四大防御机制的精准辨析

面对高频点击与重复请求，必须清晰区分四个不同层级的防御手段：

\`\`\`mermaid
flowchart TD
    subgraph Frontend["前端交互层"]
        Guard["1. 防重复提交保护 (In-Flight Guard)\n用户点击后立即将按钮置灰 (disabled)，并在网络请求完成 (Promise 决议) 前阻止一切二次点击"]
        Debounce["2. 防抖 (Debounce)\n在事件被触发后等待 N 毫秒，若期间再次触发则重新计时 (常用于搜索输入框联想)"]
        Throttle["3. 节流 (Throttle)\n在固定的时间窗口内，无论事件触发多少次，只允许执行一次处理 (常用于页面滚动监听)"]
    end

    subgraph Backend["后端协议与业务层"]
        Idempotency["4. 服务端幂等性 (Idempotency)\n同一个请求不论在服务端执行 1 次还是连续重试 10 次，对系统状态产生的最终副作用完全相同"]
    end
\`\`\`

---

## 2. 为什么仅靠前端按钮置灰远远不够？

前端把按钮置灰（In-Flight Guard）只能防范普通用户的误触。

在不可靠的现实网络中，当客户端发起 POST 请求后，由于网络抖动，服务端的响应未能按时返回，导致前端发生超时（Timeout）。

此时客户端不知道服务端的选课操作到底是成功了还是失败了。如果客户端自动发起网络重试，就会导致同一个操作向服务端发送了两次！

---

## 3. 服务端幂等性（Idempotency Token）设计

对于非幂等操作（如创建选课流水），客户端在发起请求前先获取或生成一个全局唯一的 **幂等令牌（\`Idempotency-Key\`）**：

\`\`\`http
POST /api/enrollments HTTP/1.1
Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
Content-Type: application/json

{"courseId": 2048}
\`\`\`

服务端处理流程：
1. 服务端收到请求后，先将 \`Idempotency-Key\` 存入具有原子性的去重存储（如 Redis 分布式锁或数据库唯一键表）；
2. 若该 Key 已存在，直接返回上一次的处理结果或拒绝重复执行；
3. 处理完成后缓存响应结果，确保无论重试多少次，最终都只产生一次选课流水。
`
});

// 第 51 章（原子条件更新主线与 OCC 对比）
part5Docs.push({
  id: "doc:hello-system-51-cas-and-optimistic-locking",
  slug: "51-cas-and-optimistic-locking",
  parentId: "'doc:hello-system-part-5'",
  title: "第51章 如果两个人争抢最后一个名额呢？——原子条件更新与乐观并发控制",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 51,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第51章 如果两个人争抢最后一个名额呢？——原子条件更新与乐观并发控制

## 1. 高并发选课的原子条件更新

在高并发场景下，使用行级排他锁（\`SELECT ... FOR UPDATE\`）可能在高争用时产生锁等待与排队开销。

一种常用且极高吞吐的方案是利用数据库 Update 语句自身的行级原子性执行**条件更新（Atomic Conditional Update）**：

\`\`\`sql
-- 在数据库引擎内部原子执行判别与递增
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
        throw new BusinessException("您已选修该课程");
    }
}
\`\`\`

---

## 2. 关于基于版本号的乐观并发控制（OCC）

> **说明**：
> 若采用标准的**基于版本号的乐观并发控制（Optimistic Concurrency Control, OCC）**，实体表中需包含 \`version\` 字段：
> \`UPDATE courses SET enrolled = ?, version = version + 1 WHERE id = ? AND version = ?;\`
> 若更新失败（影响行数为 0），应用层需捕获冲突并在循环中决定是否重试。
> 在选课这种高争用计数器场景中，直接使用带业务约束（\`enrolled < capacity\`）的原子 Update 往往更加简洁、高效。
`
});

// 第 52 章（WAL 崩溃恢复与 ARIES 算法心智模型）
part5Docs.push({
  id: "doc:hello-system-52-wal-and-crash-recovery",
  slug: "52-wal-and-crash-recovery",
  parentId: "'doc:hello-system-part-5'",
  title: "第52章 如果服务器在写入时突然断电呢？——WAL 与崩溃恢复",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 52,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第52章 如果服务器在写入时突然断电呢？——WAL 与崩溃恢复

## 1. 缓冲池策略与数据持久化矛盾

现代数据库为了实现每秒数万次的读写性能，采用 **STEAL + NO-FORCE** 缓冲池管理策略：
- **NO-FORCE**：事务提交时，**不需要**强制将内存中的脏数据页刷回磁盘数据文件；
- **STEAL**：未提交事务修改的脏页，在内存紧张时**允许**被后台线程提前刷入磁盘数据文件。

这带来了两大崩溃风险：
1. 事务已 COMMIT，但数据页尚在内存中未来得及刷盘，服务器断电导致数据丢失；
2. 事务尚未 COMMIT，但其脏页已被提前刷入磁盘，服务器断电导致未完成的数据残留在数据文件中。

---

## 2. 经典的 ARIES 崩溃恢复三大阶段

数据库重启时，存储引擎依据 **WAL（预写日志）** 执行经典的 ARIES 恢复流程（ARIES 是数据库恢复领域的经典算法框架，其日志记录同时支持重做与回滚）：

\`\`\`mermaid
flowchart TD
    Crash["服务器突然断电崩溃并重启"] --> Phase1["1. 分析阶段 (Analysis Phase)\n从最近的检查点 (Checkpoint) 开始正向扫描日志，识别出崩溃发生时处于活跃状态的未提交事务列表 (Active Trx Table) 与脏页表"]
    Phase1 --> Phase2["2. 重做阶段 (Redo Phase - 重放历史)\n从最早的未落盘脏页日志序列号 (LSN) 开始，单向重放所有日志 (包含已提交与未提交事务的操作)，将数据页重放恢复至崩溃发生时的状态"]
    Phase2 --> Phase3["3. 回滚阶段 (Undo Phase - 撤销未竟事务)\n反向扫描日志，对崩溃前所有处于活跃状态但未 COMMIT 的事务执行 Undo 回滚操作，消除其对数据文件的部分写入"]
\`\`\`

通过 Redo（重放历史）与 Undo（撤销脏写），数据库在不稳定的物理硬件上实现了原子性与持久性保障。与第 36 章一致：持久性的含义是——**在数据库所承诺的故障模型与持久化配置下，成功提交事务的效果应在系统恢复后保留**，而不是“数据在任何灾难下都绝对永存”。
`
});

// 第 53 章（大幅深度扩写：结构化日志、MDC、Request-ID 与真实排障演练）
part5Docs.push({
  id: "doc:hello-system-53-logging-and-observability",
  slug: "53-logging-and-observability",
  parentId: "'doc:hello-system-part-5'",
  title: "第53章 可观测性：从 println 到结构化日志与链路追踪",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 53,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第53章 可观测性：从 println 到结构化日志与链路追踪

## 1. 为什么 \`System.out.println\` 在生产环境中是灾难？

许多初学者习惯在代码中到处写 \`System.out.println("选课成功: " + courseId)\` 来调试程序。

但在高并发的企业级生产环境中，这种做法存在严重的缺陷：
1. **同步阻塞 I/O**：\`System.out.println\` 内部带有一个全局锁（\`synchronized\`），多线程并发打印时会导致所有请求线程严重挂起等待；
2. **缺乏日志级别控制**：无法在不修改代码的情况下动态关闭低优先级的调试日志；
3. **缺乏结构化上下文**：没有时间戳、线程号、类名和请求关联 ID，数十个线程的输出交错在一起，根本无法分辨哪一行日志属于哪一次用户请求。

---

## 2. 现代可观测性的三大支柱（Three Pillars of Observability）

\`\`\`mermaid
flowchart TD
    subgraph Observability["现代系统可观测性三大支柱"]
        Logs["1. 结构化日志 (Logs)\n离散的文本与结构化事件记录，记录'系统在何时发生了什么事情'"]
        Metrics["2. 指标度量 (Metrics)\n聚合的数值统计时间序列，监控'系统当前的宏观健康状态' (如 QPS, CPU利用率, 99分位响应延迟)"]
        Traces["3. 分布式链路追踪 (Traces)\n以 Trace ID 与 Span ID 记录单个请求跨越网关、微服务与数据库的完整调用拓扑与耗时"]
    end
\`\`\`

---

## 3. 请求关联追踪（Correlation ID / Request ID）实战

为了在成千上万的并发日志中瞬间定位单次请求，我们在表现层入口拦截器中为每个 HTTP 请求生成唯一的 \`X-Request-ID\`，并将其注入日志框架的 **MDC（Mapped Diagnostic Context，基于 ThreadLocal）** 中：

\`\`\`java
public class RequestTracingFilter implements Filter {
    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest request = (HttpServletRequest) req;
        String requestId = request.getHeader("X-Request-ID");
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString().replace("-", "");
        }

        // 存入当前线程的 MDC 上下文
        MDC.put("requestId", requestId);
        try {
            chain.doFilter(req, res);
        } finally {
            MDC.clear(); // 线程池复用，必须彻底清理上下文
        }
    }
}
\`\`\`

在输出 JSON 结构化日志时，所有该请求产生的日志都会自动附带该 ID：

\`\`\`json
{
  "timestamp": "2026-08-29T08:00:00.123Z",
  "level": "INFO",
  "thread": "http-nio-8080-exec-4",
  "requestId": "9b1deb4d3b7d4bad",
  "logger": "c.z.s.EnrollmentService",
  "message": "执行选课操作",
  "context": { "studentId": 1001, "courseId": 2048 }
}
\`\`\`

---

## 4. 真实排障演练：30 秒精准定位线上死锁

### 故障现象：
学生李雷反馈：“我在 10:03 分点击选课，页面一直转圈，最后提示选课失败！”

### 排查过程：
1. 运维工程师在前端监控系统中拿到李雷该次请求报错返回的 \`requestId = 9b1deb4d3b7d4bad\`；
2. 在日志中心（如 Elasticsearch / Loki）输入查询条件：\`requestId: "9b1deb4d3b7d4bad"\`；
3. 系统瞬间筛出该请求产生的全部 5 行日志：
   - 10:03:01.100 [INFO] Controller 收到选课请求: studentId=1001, courseId=2048
   - 10:03:01.105 [INFO] Service 开始扣减名额...
   - 10:03:06.110 [ERROR] 捕获数据库异常: Deadlock found when trying to get lock; try restarting transaction
4. 工程师在 30 秒内精准定位问题：并发更新顺序引发了数据库行锁死锁，并迅速安排针对性重试策略！
`
});

// 第 54 章（大幅深度扩写：多环境隔离、12-Factor、配置与密文管理、Testcontainers）
part5Docs.push({
  id: "doc:hello-system-54-environments-and-configuration",
  slug: "54-environments-and-configuration",
  parentId: "'doc:hello-system-part-5'",
  title: "第54章 环境与配置：开发、测试与生产的隔离之道",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 54,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第54章 环境与配置：开发、测试与生产的隔离之道

## 1. 为什么“在我的电脑上明明能跑”？

在软件工程中，最著名的借口莫过于：“这行代码在我的笔记本上明明跑得好好的，怎么部署到生产服务器上就崩溃了？”

深入分析底层，导致环境差异的根本原因通常包括：
1. **操作系统与文件系统差异**：Windows 文件路径不区分大小写，而 Linux 服务器严格区分大小写；换行符差异（CRLF vs LF）；
2. **时区与编码差异**：本地电脑使用 \`Asia/Shanghai\`，生产服务器容器默认为 \`UTC\`；本地数据库默认字符集为 \`GBK\`，生产为 \`utf8mb4\`；
3. **隐式外部依赖与版本漂移**：本地安装了全局 MySQL 8.0.32，生产机上运行的是旧版 MySQL 5.7，导致某条窗口函数 SQL 语法报错；
4. **硬编码配置**：把数据库密码写死在 Java 代码中。

---

## 2. 云原生 12-Factor 方法论与配置隔离

现代软件工程严格遵循 **The Twelve-Factor App** 的配置原则：**将配置与代码严格分离（Store config in the environment）。**

\`\`\`mermaid
flowchart LR
    Code["同一套不可变的应用构建镜像 / Jar 包\n(Single Immutable Artifact)"]
    
    EnvDev["开发环境 (.env.local)\n- 本地 SQLite / H2 内存库\n- DEBUG 日志级别"]
    EnvTest["CI 测试环境 (GitHub Actions)\n- Testcontainers 临时 MySQL\n- 自动化测试覆盖"]
    EnvProd["生产环境 (Cloudflare D1 / K8s Secret)\n- 生产级高可用数据库\n- 密文通过环境变量注入"]

    Code --> EnvDev
    Code --> EnvTest
    Code --> EnvProd
\`\`\`

---

## 3. 生产密文安全：严禁将密钥提交至版本控制库

在真实工程中，数据库密码、JWT 签名私钥与第三方 API Token **绝对严禁直接写在 Git 跟踪的文件中**！

### 规范做法：
1. 建立 \`.env.example\` 模板文件提交至 Git（只包含变量名，不含真实密码）；
2. 将 \`.env\` 加入 \`.gitignore\`；
3. 在生产服务器中，通过环境变量（Environment Variables）或专用的密钥管理器（如 AWS Secrets Manager / Vault / Cloudflare Secrets）在容器启动时动态注入。

---

## 4. 可重现的集成测试环境：Testcontainers

为了避免在 CI 测试中使用与生产完全不同的内存伪数据库（如 H2，它无法测试 MySQL 专有的事务并发锁行为），现代工程采用 **Testcontainers** 技术：

在**集成测试（Integration Test）**启动时（注意：拉起真实数据库容器的测试已不属于单元测试范畴），由代码自动拉起一个临时的真实 MySQL Docker 容器，测试完成后自动销毁。

使用与生产相同数据库产品和接近版本的 Testcontainers，可以显著减少 H2 等替代数据库造成的语义差异，**但仍不能保证测试环境与生产环境完全一致**。生产差异仍可能来自：数据库小版本、参数配置、时区（timezone）、字符集与排序规则（charset / collation）、数据规模、存储设备、网络拓扑、主从/集群架构与操作系统等。
`
});

// 第 55 章（大幅深度扩写：测试金字塔与测试奖杯，多层测试实践）
part5Docs.push({
  id: "doc:hello-system-55-testing-pyramid",
  slug: "55-testing-pyramid",
  parentId: "'doc:hello-system-part-5'",
  title: "第55章 测试金字塔与质量保障：如何证明系统是正确的？",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 55,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第55章 测试金字塔与质量保障：如何证明系统是正确的？

## 1. 测试金字塔（Testing Pyramid）与测试分层

软件质量不是靠手工点点鼠标测出来的，而是由自动化的分层测试体系捍卫的：

\`\`\`mermaid
flowchart TD
    E2E["1. 端到端测试 (E2E / UI Tests)\n- 模拟真实浏览器点击 (Playwright/Cypress)\n- 运行速度最慢 (秒级)，维护成本最高，数量最少"]
    Integration["2. 集成测试 (Integration Tests)\n- 测试 Spring Controller API、Repository 与真实数据库交互\n- 运行速度较快 (百毫秒级)，确保组件装配正确"]
    Unit["3. 单元测试 (Unit Tests)\n- 测试独立的实体业务逻辑 (Course.enroll()) 与纯算法\n- 运行速度极快 (毫秒级)，数量最多，覆盖度最高"]

    E2E --> Integration --> Unit
\`\`\`

---

## 2. 多层测试实战演练

### 1. 单元测试（Unit Test）：毫秒级检验纯领域逻辑
\`\`\`java
@Test
void course_should_not_exceed_capacity() {
    Course course = new Course(2048, "CS-101", "系统导论", 1);
    assertTrue(course.enroll());
    assertFalse(course.enroll()); // 瞬间验证不变量
}
\`\`\`

### 2. 控制器集成测试（API Test）：验证协议与状态码
\`\`\`java
@WebMvcTest(EnrollmentController.class)
class EnrollmentControllerTest {
    @Autowired private MockMvc mockMvc;

    @Test
    void should_return_400_when_course_id_is_negative() throws Exception {
        mockMvc.perform(post("/api/enrollments")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"courseId\": -1}"))
            .andExpect(status().isBadRequest());
    }
}
\`\`\`

### 3. 仓储层持久化集成测试（Repository Test）：验证真实 SQL
\`\`\`java
@DataJdbcTest
class CourseRepositoryTest {
    @Autowired private CourseRepository repository;

    @Test
    void should_atomically_increment_enrolled_count() {
        int rows = repository.incrementIfAvailable(2048);
        assertEquals(1, rows);
    }
}
\`\`\`

---

## 3. 哪种测试发现什么 Bug？

- **学生传了负数 courseId 报错** $\to$ 由 **API 参数校验测试** 在表现层发现；
- **名额满了还能选进课** $\to$ 由 **领域单元测试** 发现；
- **SQL 语句语法错误/表字段拼错** $\to$ 由 **Repository 集成测试** 发现；
- **前端按钮点击事件没有绑上** $\to$ 由 **E2E 浏览器测试** 发现。

通过构筑全方位的自动化测试防护网，我们才能在频繁迭代与重构时，拥有交付高质量系统的坚实底气！
`
});

export { part5Docs };
