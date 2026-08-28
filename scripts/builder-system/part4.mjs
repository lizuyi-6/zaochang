// scripts/builder-system/part4.mjs
// 第四部分：前端第一次遇见后端 (38 ~ 46)
// 深度教科书级高密度完整版本 (全 9 章完整深度展开)

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

## 1. 致命设想：让前端直接连数据库执行 SQL

很多刚学完 SQL 和前端的同学常问一个问题：
> “既然浏览器里有 JavaScript，数据库可以用 TCP 连接，为什么我们不能直接在前端写：\`db.query('UPDATE courses SET enrolled = enrolled + 1 ...')\`，为什么非要折腾一个中间的后端服务器？”

如果在生产环境中让浏览器直连数据库，系统将在 5 分钟内彻底毁灭：

\`\`\`mermaid
flowchart TD
    Browser["不可信的用户浏览器 (任何人按 F12 均可查看修改)"]
    DB["核心数据库 (MySQL / PostgreSQL)"]

    Browser -->|1. 账号密码泄露: 数据库 root 密码直接写在前端 JS 中| DB
    Browser -->|2. SQL 注入灭顶之灾: 用户可直接执行 DROP TABLE| DB
    Browser -->|3. 连接池瞬间枯竭: 1 万个学生直接把 200 个最大连接数撑爆| DB
    Browser -->|4. 业务守门员缺失: 前端代码可被随意篡改绕过名额检查| DB
\`\`\`

---

## 2. 后端的核心定位：不可逾越的安全与信任边界

**前端是不可信的荒野，后端是可信的堡垒。**

后端服务器是整个系统的：
1. **安全守门人**：保管数据库账号密码，拦截所有未鉴权请求；
2. **连接池管家**：用几十个复用的物理连接服务全校上万名用户；
3. **业务裁判官**：无论前端如何篡改，业务规则的最终裁决权永远在后端。
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

## 1. 纯文本报文的结构解剖

HTTP 是一种基于 TCP 的、无状态的、纯文本应用层协议。

### 请求报文（Request）：
\`\`\`http
POST /api/enrollments HTTP/1.1
Host: campus.university.edu
Content-Type: application/json
Authorization: Bearer token_student_1001

{"studentId": 1001, "courseId": 2048}
\`\`\`

### 响应报文（Response）：
\`\`\`http
HTTP/1.1 201 Created
Content-Type: application/json
Content-Length: 48

{"status": "SUCCESS", "message": "选课成功"}
\`\`\`

\`\`\`mermaid
flowchart LR
    Req["HTTP 请求报文\n[请求行: POST /api/enrollments]\n[请求头: Content-Type, Auth]\n[空行: CRLF]\n[请求体: JSON Payload]"]
    Resp["HTTP 响应报文\n[状态行: HTTP/1.1 201 Created]\n[响应头: Content-Type]\n[空行: CRLF]\n[响应体: 返回结果 JSON]"]
    
    Req -->|跨网络传输| Resp
\`\`\`
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

## 1. 跨异构语言的普通话

前端运行的是 JavaScript 引擎，后端可能是 Java、Go 或 Python。它们在内存中的对象布局完全不同。

**JSON（JavaScript Object Notation）** 充当了跨语言的“通用普通话”：

\`\`\`mermaid
flowchart LR
    JS["浏览器 JS 内存对象\n{ courseId: 101, name: 'CS' }"] -->|JSON.stringify() 序列化| ByteStream["纯文本字节流\n'{\"courseId\":101}'"]
    ByteStream -->|网络传输| Net["TCP / IP 传输"]
    Net --> ByteStream2["服务器接收字节流"]
    ByteStream2 -->|Jackson / Gson 反序列化| Java["Java 堆内存 DTO 对象\nEnrollRequestDto 实例"]
\`\`\`
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

## 1. 案例追踪：GET /api/courses

当用户打开页面时，前端发起获取课程列表的请求：

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Vue as 前端 Vue 组件
    participant Ctrl as CourseController
    participant Svc as CourseService
    participant Repo as CourseRepository
    participant DB as MySQL 数据库

    Vue->>Ctrl: GET /api/courses
    Ctrl->>Svc: listAvailableCourses()
    Svc->>Repo: findAll()
    Repo->>DB: SELECT * FROM courses WHERE status = 'ACTIVE'
    DB-->>Repo: 返回结果集
    Repo-->>Svc: 封装为 List<Course>
    Svc-->>Ctrl: 转换为 List<CourseVO>
    Ctrl-->>Vue: 返回 JSON 数组 HTTP 200 OK
    Note over Vue: Vue 响应式状态更新，页面渲染卡片列表
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

## 1. 第一次完整前后端闭环：POST /api/enrollments

前端代码：
\`\`\`javascript
async function handleEnroll(courseId) {
    loading.value = true;
    try {
        const response = await fetch('/api/enrollments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: currentUser.id, courseId: courseId })
        });
        if (response.ok) {
            alert('选课成功！');
        }
    } finally {
        loading.value = false;
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

## 1. 瘦 Controller 原则（Skinny Controller）

Controller 是纯粹的**协议接待员**：
- 负责提取 HTTP Body、Query 参数；
- 负责校验参数基本格式（非空、邮箱格式）；
- **绝不包含任何核心业务逻辑，绝不直接碰 SQL**。

\`\`\`java
@RestController
@RequestMapping("/api/enrollments")
public class EnrollmentController {
    private final EnrollmentService enrollmentService;

    public EnrollmentController(EnrollmentService service) {
        this.enrollmentService = service;
    }

    @PostMapping
    public ResponseEntity<?> enroll(@Valid @RequestBody EnrollRequestDto dto) {
        // 仅作参数清洗与分发，核心交由 Service 裁决
        EnrollResult result = enrollmentService.enroll(dto.getStudentId(), dto.getCourseId());
        return ResponseEntity.status(result.isSuccess() ? 201 : 409).body(result);
    }
}
\`\`\`
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

## 1. 业务不变量编排圣殿

Service 承载系统的灵魂：
1. **跨实体业务规则编排**：检查学生是否存在 $\to$ 检查是否重复选课 $\to$ 检查先修课是否通过 $\to$ 扣减课程名额；
2. **事务边界控制（\`@Transactional\`）**：保证多步持久化操作同生共死。

\`\`\`java
@Service
public class EnrollmentService {
    @Transactional
    public EnrollResult enroll(int studentId, int courseId) {
        // 编排业务流程，守卫核心不变量
        // 自动开启与提交数据库事务
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

## 1. 屏蔽底层存储介质差异

Repository 将数据库伪装成一个**内存集合**：

\`\`\`java
public interface CourseRepository {
    Optional<Course> findById(int id);
    void save(Course course);
}
\`\`\`

- 在单元测试时，可以使用 \`InMemoryCourseRepository\`（极速执行，无需启动数据库）；
- 在生产环境时，切换为 \`MyBatisCourseRepository\` 或 \`JpaCourseRepository\`。Service 层代码一行都不需要修改！
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

## 1. 隔离边界：Entity vs DTO vs VO

很多初学者觉得系统里既有 \`Course\`，又有 \`CourseDTO\`，还有 \`CourseVO\`，是在脱裤子放屁。

请看如果不做隔离的灾难：
如果你直接把数据库实体 \`Student\`（包含密码哈希、身份证号、银行卡号）直接当作 JSON 返回给前端：**用户的敏感隐私数据将瞬间全部泄露给全世界！**

\`\`\`mermaid
flowchart LR
    DB[(数据库存储)] <-->|1. 映射| Entity["Entity 领域实体\n(包含 passwordHash, 完整字段)"]
    Entity <-->|2. 转换| DTO["DTO 传输对象\n(跨网络传输最小必要字段)"]
    DTO <-->|3. 封装| VO["VO 视图对象\n(对前端脱敏、格式化展示)"]
    VO <--> Client["前端视图展示"]
\`\`\`
`
  }
];
