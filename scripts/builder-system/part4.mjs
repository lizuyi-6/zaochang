// scripts/builder-system/part4.mjs
// 第四部分：前端第一次遇见后端 (38 ~ 46)
// 全量技术修订与规范化完整版本 (全 9 章高密度深度正文)

export const part4Docs = [
  {
    id: "doc:hello-system-part-4",
    slug: "part-4",
    parentId: "'doc:book-hello-system'",
    title: "第四部分 · 前端第一次遇见后端",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 6,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-system-38-browser-cannot-touch-db-directly",
    slug: "38-browser-cannot-touch-db-directly",
    parentId: "'doc:hello-system-part-4'",
    title: "第38章 浏览器为什么不能直接操作数据库？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第38章 浏览器为什么不能直接操作数据库？

## 1. 为什么不能让客户端直接连接数据库？

在初学 Web 开发时，有人可能会提出疑问：“既然前端运行 JavaScript，数据库支持网络连接，为什么不直接在前端编写数据库查询语句？”

如果在生产架构中允许客户端直连数据库，将面临以下严重的系统与安全风险：

\`\`\`mermaid
flowchart TD
    Client["运行在用户终端的浏览器\n(不可信环境，代码对用户完全透明)"]
    DB["核心数据库管理系统 (DBMS)"]

    Client -->|1. 凭据泄露: 数据库连接账号与密码直接暴露在前端源码中| DB
    Client -->|2. 越权与注入: 用户可通过修改客户端逻辑直接执行任意 SQL| DB
    Client -->|3. 连接耗尽: 大量客户端同时直连将迅速耗尽数据库连接池资源| DB
    Client -->|4. 业务逻辑旁路: 前端校验可被直接绕过，服务端无法统一执行业务规则| DB
\`\`\`

---

## 2. 后端服务的核心定位

后端应用服务器作为系统的**信任边界守门人**与**业务仲裁中心**：
1. **安全与权限控制**：集中保管数据库认证凭据，对所有外部请求执行身份鉴权与权限校验；
2. **连接池复用**：通过内部连接池复用有限的数据库连接，支撑海量前端并发访问；
3. **权威业务规则执行**：无论前端如何修改，所有核心业务不变量均由后端统一判定与持久化。
`
  },
  {
    id: "doc:hello-system-39-http-protocol-agreement",
    slug: "39-http-protocol-agreement",
    parentId: "'doc:hello-system-part-4'",
    title: "第39章 HTTP到底帮我们约定了什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 2,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第39章 HTTP到底帮我们约定了什么？

## 1. HTTP 协议的核心定位（RFC 9110）

**超文本传输协议（HTTP）** 是一种定义在应用层的无状态请求/响应协议，用于在分布式超媒体系统中操作资源。

- **HTTP/1.1**：基于纯文本格式组织报文（便于阅读与调试）；
- **HTTP/2**：采用二进制分帧层，支持单个 TCP 连接上的多路复用（Multiplexing）；
- **HTTP/3**：基于底层的 QUIC 协议（基于 UDP），解决了传输层的队头阻塞问题。

无论底层传输机制如何演进，HTTP 所表达的**资源操作语义（Methods, Status Codes, Headers）**保持一致。

---

## 2. 报文结构示例（HTTP/1.1 文本表现）

### 请求报文（Request）：
\`\`\`http
POST /api/enrollments HTTP/1.1
Host: campus.example.edu
Content-Type: application/json
Authorization: Bearer <access_token>

{"courseId": 2048}
\`\`\`

### 响应报文（Response）：
\`\`\`http
HTTP/1.1 201 Created
Content-Type: application/json
Content-Length: 48

{"status":"SUCCESS","message":"选课成功"}
\`\`\`

> **关于“无状态”的准确理解**：
> HTTP 协议的“无状态（Stateless）”是指服务器原则上无需保留跨请求的协议上下文即可理解单个请求的语义。这并不意味着应用层不能通过 Cookie、Session 或 Token 在业务层面维护用户会话状态。
`
  },
  {
    id: "doc:hello-system-40-json-the-lingua-franca",
    slug: "40-json-the-lingua-franca",
    parentId: "'doc:hello-system-part-4'",
    title: "第40章 JSON为什么总出现在前后端之间？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第40章 JSON为什么总出现在前后端之间？

## 1. 跨异构语言的数据交换格式

前端运行在 JavaScript 引擎中，后端服务可能采用 Java、Go 或 Python。它们在内存中的对象结构完全不同。

**JSON（JavaScript Object Notation）** 是一种轻量级的纯文本数据交换格式，充当了跨语言的通用中介：

\`\`\`mermaid
flowchart LR
    JS["前端 JS 内存对象\n{ courseId: 2048 }"] -->|JSON.stringify() 序列化| JSONText["JSON 文本表示\n'{\"courseId\":2048}'"]
    JSONText -->|UTF-8 编码为字节流| Net["HTTP 网络传输"]
    Net --> ByteStream["后端接收字节流"]
    ByteStream -->|JSON 解析库反序列化| JavaObj["Java 堆内存 DTO 对象\nEnrollRequestDto 实例"]
\`\`\`

---

## 2. 数据格式的多样性

需要说明的是，JSON 并非前后端通信的唯一选择：
- **Protocol Buffers (Protobuf)**：二进制高效编码，广泛用于内部微服务 RPC；
- **Form Data**：用于传统表单提交与文件上传；
- **CBOR / MessagePack**：二进制 JSON 替代方案。

在开放 Web API 中，JSON 因其人类可读性与良好的生态支持成为了最通用的选择。
`
  },
  {
    id: "doc:hello-system-41-the-first-real-api",
    slug: "41-the-first-real-api",
    parentId: "'doc:hello-system-part-4'",
    title: "第41章 第一条真正的API",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 4,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第41章 第一条真正的API

## 1. 查询课程列表 API：GET /api/courses

当用户打开选课页面时，前端通过 API 获取当前开放的课程列表：

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Frontend as 前端 (Vue 3)
    participant Ctrl as CourseController
    participant Svc as CourseService
    participant Repo as CourseRepository
    participant DB as MySQL 数据库

    Frontend->>Ctrl: GET /api/courses
    Ctrl->>Svc: listAvailableCourses()
    Svc->>Repo: findAllActive()
    Repo->>DB: SELECT id, code, name, capacity, enrolled FROM courses WHERE status = 'ACTIVE'
    DB-->>Repo: 返回结果集
    Repo-->>Svc: 映射为 List<Course> 领域实体
    Svc-->>Ctrl: 转换为 List<CourseResponseDto>
    Ctrl-->>Frontend: 返回 HTTP 200 OK (JSON 数组)
    Note over Frontend: 前端更新响应式状态，渲染课程卡片
\`\`\`
`
  },
  {
    id: "doc:hello-system-42-the-click-moment",
    slug: "42-the-click-moment",
    parentId: "'doc:hello-system-part-4'",
    title: "第42章 点击“选课”",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第42章 点击“选课”

## 1. 提交选课请求：POST /api/enrollments

前端触发选课交互时的调用示例：

\`\`\`javascript
async function handleEnroll(courseId) {
    submitting.value = true;
    try {
        const response = await fetch('/api/enrollments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': \`Bearer \${userToken.value}\`
            },
            // 注意：客户端只传递目标课程 ID，当前操作学生身份由服务端从 Token 中解析！
            body: JSON.stringify({ courseId: courseId })
        });
        
        if (response.status === 201) {
            alert('选课成功！');
        } else if (response.status === 409) {
            alert('选课失败：名额已满或已选过该课程。');
        }
    } finally {
        submitting.value = false;
    }
}
\`\`\`
`
  },
  {
    id: "doc:hello-system-43-skinny-controller",
    slug: "43-skinny-controller",
    parentId: "'doc:hello-system-part-4'",
    title: "第43章 Controller为什么不能自己完成一切？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 6,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第43章 Controller为什么不能自己完成一切？

## 1. 表现层的边界与“瘦 Controller”

在分层架构中，Controller 的职责是**处理传输与协议层面的适配**：
- 解析 HTTP 请求头与请求体；
- 执行参数基本格式清洗与校验（如 ID 是否为正整数）；
- 从安全上下文中提取已认证用户身份；
- 调用业务逻辑层，并将业务执行结果包装为对应的 HTTP 响应。

\`\`\`java
@RestController
@RequestMapping("/api/enrollments")
public class EnrollmentController {
    private final EnrollmentService enrollmentService;

    public EnrollmentController(EnrollmentService enrollmentService) {
        this.enrollmentService = enrollmentService;
    }

    @PostMapping
    public ResponseEntity<?> enroll(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody EnrollRequestDto requestDto) {
        
        // 从认证上下文中获取当前学生 ID，防止前端伪造
        int studentId = user.getStudentId();
        
        EnrollResult result = enrollmentService.enroll(studentId, requestDto.getCourseId());
        
        if (result.isSuccess()) {
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } else {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(result);
        }
    }
}
\`\`\`

Controller **不应当包含核心业务规则，也不应当直接执行持久化查询**。
`
  },
  {
    id: "doc:hello-system-44-service-the-rule-sanctuary",
    slug: "44-service-the-rule-sanctuary",
    parentId: "'doc:hello-system-part-4'",
    title: "第44章 Service到底是什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 7,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第44章 Service到底是什么？

## 1. 业务用例编排与事务边界

**Service 层（应用服务层）** 承载具体的业务用例流程：
1. **跨实体流程编排**：协调多个实体与数据访问对象完成用例；
2. **事务边界控制**：定义事务的开启、提交与回滚范围（例如通过 Spring 的 \`@Transactional\` 注解）；
3. **安全与审计集成**：记录业务操作流水。

\`\`\`java
@Service
public class EnrollmentService {
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;

    public EnrollmentService(CourseRepository courseRepo, EnrollmentRepository enrollRepo) {
        this.courseRepository = courseRepo;
        this.enrollmentRepository = enrollRepo;
    }

    @Transactional
    public EnrollResult enroll(int studentId, int courseId) {
        // 1. 执行原子条件更新尝试扣减名额
        boolean updated = courseRepository.incrementEnrolledIfAvailable(courseId);
        if (!updated) {
            return EnrollResult.failure("名额已满或课程不存在");
        }

        // 2. 插入选课关联记录 (由数据库唯一键防止重复选课)
        try {
            enrollmentRepository.insertEnrollment(studentId, courseId);
            return EnrollResult.success();
        } catch (DuplicateKeyException e) {
            // 触发事务回滚，还原扣减的名额
            throw new BusinessException("不可重复选修同一门课程");
        }
    }
}
\`\`\`
`
  },
  {
    id: "doc:hello-system-45-repository-persistence-abstraction",
    slug: "45-repository-persistence-abstraction",
    parentId: "'doc:hello-system-part-4'",
    title: "第45章 Repository为什么存在？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 8,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第45章 Repository为什么存在？

## 1. 数据访问抽象的价值

**Repository（仓储层）** 为领域模型提供类似内存集合风格的数据访问接口，将上层业务与底层存储技术解耦：

\`\`\`java
public interface CourseRepository {
    Optional<Course> findById(int id);
    boolean incrementEnrolledIfAvailable(int courseId);
}
\`\`\`

- **提升可测试性**：在编写 Service 单元测试时，可以使用内存实现快速验证业务逻辑，无需启动真实数据库；
- **集中管理数据访问**：SQL 语句与数据映射规则收敛在仓储实现类中。

> **架构认知提示**：
> 仓储抽象能够隔离部分 SQL 细节，但并不能完全消除底层数据库的特性差异（抽象泄漏，Leaky Abstraction）。不同的数据库在事务隔离级别、方言语法和性能特性上仍存在客观差异。
`
  },
  {
    id: "doc:hello-system-46-entity-dto-vo-boundary",
    slug: "46-entity-dto-vo-boundary",
    parentId: "'doc:hello-system-part-4'",
    title: "第46章 为什么系统里有这么多“长得差不多”的对象？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 9,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第46章 为什么系统里有这么多“长得差不多”的对象？

## 1. 统一术语体系与边界隔离

在实际分层工程中，不同层次的对象承担着不同的职责：

\`\`\`mermaid
flowchart LR
    Client["客户端 (浏览器)"] <-->|Request / Response DTO| Ctrl["表现层 (Controller)"]
    Ctrl <-->|领域实体 Entity / 值对象 Value Object| Svc["业务逻辑层 (Service)"]
    Svc <-->|数据映射| DB[(数据库存储)]
\`\`\`

- **领域实体（Entity）**：具有唯一业务标识（如 Course ID）并封装业务不变量的核心领域对象；
- **数据传输对象（DTO, Data Transfer Object）**：
  - **Request DTO**：封装客户端提交的请求载荷，用于输入校验；
  - **Response DTO**：封装返回给客户端的数据，实现敏感数据脱敏（如隐藏密码哈希、内部配置等）；
- **值对象（Value Object, DDD 语境）**：通过其包含的属性值来定义其等价性且无独立标识的不可变对象（如 \`Money\`, \`Address\`）。

---

## 2. 为什么不直接复用 Entity？

若直接将与数据库表映射的 \`Student\` Entity 暴露给外部接口：
1. **敏感信息泄露**：可能意外将 \`password_hash\` 或身份证号直接序列化返回给前端；
2. **批量赋值安全漏洞（Mass Assignment Vulnerability）**：恶意用户可能在请求中夹带 \`role: "ADMIN"\` 等私有字段，若框架直接将 JSON 绑定到 Entity，将造成越权漏洞。
`
  }
];
