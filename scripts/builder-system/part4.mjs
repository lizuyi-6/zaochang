// scripts/builder-system/part4.mjs
// 《Hello System · 图解软件系统》第四部分：前端第一次遇见后端 (第 38 ~ 46 章)（全量教材化深度扩写版本）

const part4Docs = [];

// 顶层部分节点
part4Docs.push({
  id: "doc:hello-system-part-4",
  slug: "part-4",
  parentId: "'doc:book-hello-system'",
  title: "第四部分: 前端第一次遇见后端 (38~46)",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 6,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第四部分: 前端第一次遇见后端 (38~46)

本部分聚焦于**跨越网络边界的前后端通信契约与对象边界划分**。

我们将从套接字与 TCP/IP 分层模型出发，深入解构 HTTP 报文结构与现代 RESTful 资源语义设计。随后，我们将以“李雷点击选课”为主线，完整追踪从 Vue \`fetch()\` 请求发起、跨语言 JSON 序列化、Spring WebMVC 请求分发，到 Controller、Service、Repository 以及 Entity/DTO/Value Object 对象的严格职责隔离。
`
});

// 第 38 章
part4Docs.push({
  id: "doc:hello-system-38-networking-foundations-ip-tcp",
  slug: "38-networking-foundations-ip-tcp",
  parentId: "'doc:hello-system-part-4'",
  title: "第38章 机器之间如何通信：从 Socket 到 IP/TCP",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 38,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第38章 机器之间如何通信：从 Socket 到 IP/TCP

## 1. 跨越机器边界的鸿沟

在前面的章节中，无论是 Vue 前端还是 Java 后端，代码操作的都是**本机物理内存中的数据指针**。

然而，当用户的浏览器运行在客户端笔记本上，而服务端程序运行在千里之外的数据中心服务器上时，两台机器之间没有任何共享内存，唯一的连接纽带就是**不可靠的物理网络链路**。

\`\`\`mermaid
flowchart LR
    Client["客户端计算机\n(浏览器进程)"] <== "不可靠的物理网络\n(可能丢包、乱序、延迟、抖动)" ==> Server["服务端计算机\n(后端应用进程)"]
\`\`\`

---

## 2. 经典 TCP/IP 分层模型

现代网络通信通过分层协议栈实现了对底层复杂物理传输的高效抽象：

\`\`\`mermaid
flowchart TD
    App["1. 应用层 (Application Layer: HTTP/1.1, HTTP/2, WebSocket)\n定义业务报文格式与交互语义 (如 GET, POST, JSON 载荷)"]
    Transport["2. 传输层 (Transport Layer: TCP, UDP)\n提供端到端的进程级通信 (TCP 提供可靠字节流、三次握手、丢包重传与拥塞控制)"]
    Network["3. 网络层 (Network Layer: IP)\n负责跨网络路由寻址与主机间数据包转发 (IP 地址)"]
    Link["4. 数据链路与物理层 (Link & Physical Layer: Ethernet, Wi-Fi, 光纤)\n负责在相邻物理节点间传输二进制电信号与光脉冲"]

    App --> Transport --> Network --> Link
\`\`\`

- **套接字（Socket）**：操作系统向应用程序暴露的抽象通信端点。一个已建立的 TCP 网络流通常可以使用（源 IP、源端口、目标 IP、目标端口、传输层协议）组成的五元组来区分；监听套接字、UDP 套接字等情形与该模型并不完全等价；
- **流式传输的本质**：TCP 向上层应用提供的是一个**无边界的连续字节流（Byte Stream）**。应用层协议（如 HTTP）必须自行定义报文边界解析规则。
`
});

// 第 39 章（删除手工未经计算的 Content-Length，聚焦纯粹语义）
part4Docs.push({
  id: "doc:hello-system-39-http-message-anatomy",
  slug: "39-http-message-anatomy",
  parentId: "'doc:hello-system-part-4'",
  title: "第39章 HTTP 报文解构：请求行、头部与状态码",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 39,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第39章 HTTP 报文解构：请求行、头部与状态码

## 1. HTTP 请求报文的标准文本结构

HTTP/1.1 的起始行（start-line）与头部字段（header fields）采用文本语法，因此非常适合直接展示与调试。一次选课请求的真实报文结构如下：

\`\`\`http
POST /api/enrollments HTTP/1.1
Host: www.aetherstudio.top
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)
Content-Type: application/json; charset=utf-8
Authorization: Bearer eyJhbGciOi...

{"courseId":2048}
\`\`\`

### 报文核心要素拆解：
1. **请求行（Request Line）**：
   - **请求方法（Method）**：\`POST\`（表达在目标资源集合上创建新实体的业务意图）；
   - **请求路径（Request URI）**：\`/api/enrollments\`；
   - **协议版本（Protocol Version）**：\`HTTP/1.1\`。
2. **请求头（Headers）**：包含主机名、客户端类型、载荷编码格式及认证凭证；
3. **空行（CRLF, \\r\\n）**：协议规定的关键分隔符，用于告知接收方头部结束、正文开始；
4. **请求体（Body）**：传输的具体业务载荷数据。

> **边界说明**：说“HTTP/1.1 基于文本”仅指其起始行与头部字段的语法；HTTP 报文主体可以承载任意媒体类型与二进制数据（如图片、压缩包、Protobuf）。此外，HTTP 并非永远运行在 TCP 之上：HTTP/1.1 与 HTTP/2 通常运行于 TCP，而 HTTP/3 使用基于 UDP 的 QUIC 协议。

---

## 2. 常见 HTTP 状态码的精准语义分类

服务端通过状态码向客户端传达请求的最终处理结果：

| 状态码 | 英文名称 | 业务场景精准语义 |
| :--- | :--- | :--- |
| **200 OK** | 成功 | 请求处理成功，响应体包含目标数据 |
| **201 Created** | 已创建 | 成功在服务器上创建了新资源（如选课成功生成了选课流水） |
| **204 No Content** | 无内容 | 成功执行了操作（如退课成功），且无需向客户端返回任何数据体 |
| **400 Bad Request** | 格式错误 | 客户端发送的 JSON 格式损坏或参数类型不匹配 |
| **401 Unauthorized** | 未认证 | 客户端未携带身份凭据（Token/Cookie）或凭据已过期 |
| **403 Forbidden** | 拒绝访问 | 客户端已登录，但无权操作该资源（如学生尝试修改全校课表） |
| **404 Not Found** | 未找到 | 目标资源不存在（如请求的 courseId 不在数据库中） |
| **409 Conflict** | 业务冲突 | 发生业务规则冲突（如该课程名额已满，或学生已选过该课程） |
| **500 Internal Server Error** | 服务端错误 | 服务器遇到了意外情况，无法完成请求（未捕获异常只是产生 500 的常见原因之一，如数据库连接中断） |
`
});

// 第 40 章
part4Docs.push({
  id: "doc:hello-system-40-json-serialization",
  slug: "40-json-serialization",
  parentId: "'doc:hello-system-part-4'",
  title: "第40章 跨语言的契约：JSON 序列化与反序列化",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 40,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第40章 跨语言的契约：JSON 序列化与反序列化

## 1. 为什么选择 JSON？

前端使用 JavaScript 语言，后端可能使用 Java、Go、Python 或 Rust。

由于不同编程语言在内存中的对象结构与类型系统完全不同，两端无法直接传递内存指针，必须选择一种**语言无关的通用中立数据格式**：

\`\`\`mermaid
flowchart LR
    JS["浏览器端 JavaScript 对象\n{ courseId: 2048 }"] -->|JSON.stringify()| JSON["跨平台纯文本 (JSON 字符串)\n'{\"courseId\":2048}'"]
    JSON -->|Jackson / Gson 反序列化| Java["后端 Java 强类型对象 (DTO)\nnew EnrollRequest(2048)"]
\`\`\`

---

## 2. 常见序列化陷阱：数值精度与时间格式

1. **JavaScript 64 位浮点数（IEEE 754）精度丢失**：
   - JavaScript 中的 \`Number.MAX_SAFE_INTEGER\` 为 $2^{53} - 1$（9007199254740991）；
   - 如果 Java 后端使用 64 位自增长整型（\`Long\`）或雪花算法 ID（如 \`1787932800123456789L\`），当它以 JSON 数字格式传输给前端时，由于超过安全整数范围后 JavaScript \`Number\` 不能保证逐整数精确表示，反序列化后可能发生舍入，从而得到与后端原整数不同的值；
   - **常见工程方案**：如果整数 ID 可能超过 $2^{53} - 1$ 并要求前端精确保持其值，通常将 ID 序列化为**字符串类型（String）**进行传输。
2. **时区与日期格式标准化**：
   - 严禁传输本地时间字符串（如 \`"2026-08-29 08:00:00"\`，因为缺少时区信息）；
   - 推荐使用 ISO-8601 标准 UTC 格式字符串：\`"2026-08-29T00:00:00.000Z"\`。
`
});

// 第 41 章（Canonical Mini Campus 模式完全一致，移除无意义的 status 字段）
part4Docs.push({
  id: "doc:hello-system-41-first-api-design",
  slug: "41-first-api-design",
  parentId: "'doc:hello-system-part-4'",
  title: "第41章 设计第一条 RESTful API：资源、动作与路径",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 41,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第41章 设计第一条 RESTful API：资源、动作与路径

## 1. RESTful 面向资源架构（Resource-Oriented Architecture）

在初学者的 API 设计中，经常出现如下充满动词的 RPC 风格 URL：
- \`POST /api/doEnrollCourse\`
- \`GET /api/queryCourseList\`
- \`POST /api/cancelStudentCourse\`

REST 架构风格提倡：**URL 只定位“名词资源”，操作类型由标准的“HTTP Method 动词”表达**。

\`\`\`text
HTTP Method   URL 资源路径            业务语义
GET           /api/courses           获取开放选课的课程列表
GET           /api/courses/{id}      获取指定课程的详细信息
POST          /api/enrollments       创建一条新的选课关联记录 (选课)
DELETE        /api/enrollments/{id}  删除指定的选课记录 (退课)
\`\`\`

---

## 2. 选课 API 契约的标准化定义

根据 Mini Campus 的 Canonical 数据模型，选课 API 的规范契约如下：

### 请求规范（Request）：
- **URL**：\`POST /api/enrollments\`
- **Headers**：\`Content-Type: application/json\`, \`Authorization: Bearer <token>\`
- **Body**：
  \`\`\`json
  {
    "courseId": 2048
  }
  \`\`\`
  > **安全设计注意**：
  > 请求体中**严禁包含 \`studentId\`**！当前学生的身份必须由后端从**可信的认证上下文**中解析——即由服务端验证过的认证凭据，例如签名 Token 或服务端 Session（以常见的 JWT 为例，它通常是经过**签名**以保证不可篡改，但载荷本身并未加密）。后端绝不信任前端传入的任意用户 ID。

### 成功响应（Response - 201 Created）：
\`\`\`json
{
  "code": "SUCCESS",
  "message": "选课成功",
  "data": {
    "enrollmentId": 9821,
    "courseId": 2048,
    "courseName": "计算机系统导论",
    "enrolledAt": "2026-08-29T08:00:00.000Z"
  }
}
\`\`\`
`
});

// 第 42 章
part4Docs.push({
  id: "doc:hello-system-42-clicking-enroll-frontend-backend-meet",
  slug: "42-clicking-enroll-frontend-backend-meet",
  parentId: "'doc:hello-system-part-4'",
  title: "第42章 点击选课：从 Vue fetch 到 Spring Controller",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 42,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第42章 点击选课：从 Vue fetch 到 Spring Controller

## 1. 前端网络调用闭环

让我们在 Vue 3 组件中实现真实的选课交互：

\`\`\`javascript
// CourseCard.vue
import { ref } from 'vue';

export default {
  props: { course: Object },
  setup(props, { emit }) {
    const isSubmitting = ref(false);
    const errorMessage = ref('');

    async function handleEnrollClick() {
      isSubmitting.value = true;
      errorMessage.value = '';

      try {
        const response = await fetch('/api/enrollments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ courseId: props.course.id })
        });

        if (response.ok) {
          const result = await response.json();
          emit('enrolled-success', result.data);
        } else {
          const errorData = await response.json();
          errorMessage.value = errorData.message || '选课失败';
        }
      } catch (err) {
        errorMessage.value = '网络异常，请检查连接';
      } finally {
        isSubmitting.value = false;
      }
    }

    return { isSubmitting, errorMessage, handleEnrollClick };
  }
}
\`\`\`

---

## 2. 后端表现层路由分发（Spring MVC DispatcherServlet）

当该请求到达后端 Web 服务器后，Spring 框架的中心分发器将请求精准路由至控制器：

\`\`\`mermaid
flowchart LR
    Req["HTTP POST /api/enrollments"] --> Dispatcher["DispatcherServlet (前端控制器)"]
    Dispatcher --> Mapping["HandlerMapping (路由映射表)"]
    Mapping --> TargetCtrl["EnrollmentController.enroll() 方法"]
    TargetCtrl --> ReturnResp["ResponseEntity<EnrollResult>"]
    ReturnResp --> ViewResolver["HttpMessageConverter (Jackson 序列化)"]
    ViewResolver --> HTTPResp["HTTP 201 Created 响应报文"]
\`\`\`
`
});

// 第 43 章
part4Docs.push({
  id: "doc:hello-system-43-controller-layer-responsibilities",
  slug: "43-controller-layer-responsibilities",
  parentId: "'doc:hello-system-part-4'",
  title: "第43章 表现层 Controller 的纯粹职责：防线还是中转站？",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 43,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第43章 表现层 Controller 的纯粹职责：防线还是中转站？

## 1. Controller 应该做什么？

表现层控制器是整个后端系统的“守门人”。它的核心职责极为纯粹：

\`\`\`java
@RestController
@RequestMapping("/api/enrollments")
public class EnrollmentController {

    private final EnrollmentService enrollmentService;

    public EnrollmentController(EnrollmentService enrollmentService) {
        this.enrollmentService = enrollmentService;
    }

    @PostMapping
    public ResponseEntity<ApiResponse<EnrollmentDto>> enroll(
        @Valid @RequestBody EnrollRequest request,
        @AuthenticationPrincipal AuthenticatedUser user // 从安全上下文获取认证学生
    ) {
        // 1. 调用业务用例
        EnrollResult result = enrollmentService.enroll(user.getStudentId(), request.getCourseId());

        // 2. 根据业务结果包装对应的 HTTP 状态码
        if (result.isSuccess()) {
            return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(result.getEnrollmentDto()));
        } else {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.fail(result.getErrorMessage()));
        }
    }
}
\`\`\`

---

## 2. Controller 的三大设计禁忌

1. **严禁在 Controller 中编写 SQL 或直接调用数据库连接**：这会导致表现层与底层数据库紧密耦合；
2. **严禁在 Controller 中执行复杂的业务规则判定**（如“检查先修课是否及格”）：这会导致业务逻辑无法在其他入口（如批处理定时任务、MQ 消费者）中复用；
3. **严禁直接向客户端返回数据库 Entity 实体对象**：这会导致底层数据库表结构直接暴露给公网。
`
});

// 第 44 章
part4Docs.push({
  id: "doc:hello-system-44-service-layer-domain-orchestration",
  slug: "44-service-layer-domain-orchestration",
  parentId: "'doc:hello-system-part-4'",
  title: "第44章 业务逻辑层 Service：用例编排与不变量守护",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 44,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第44章 业务逻辑层 Service：用例编排与不变量守护

## 1. 业务用例的指挥官

业务逻辑层（Service）不应该只是一个“简单的中转传话筒”，而是整个业务用例的**总编排者与事务一致性边界的捍卫者**：

\`\`\`java
@Service
public class EnrollmentService {

    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;

    public EnrollmentService(CourseRepository courseRepository, EnrollmentRepository enrollmentRepository) {
        this.courseRepository = courseRepository;
        this.enrollmentRepository = enrollmentRepository;
    }

    @Transactional // 声明事务边界：以下全部操作必须具备原子性
    public EnrollResult enroll(int studentId, int courseId) {
        // 1. 检查是否重复选课
        if (enrollmentRepository.existsByStudentIdAndCourseId(studentId, courseId)) {
            return EnrollResult.failure("您已选修过该课程，不可重复选课");
        }

        // 2. 执行原子条件更新扣减名额 (防范高并发超卖)
        int updated = courseRepository.incrementEnrolledIfAvailable(courseId);
        if (updated == 0) {
            return EnrollResult.failure("课程名额已满");
        }

        // 3. 插入选课流水记录
        Enrollment enrollment = new Enrollment(studentId, courseId, LocalDateTime.now());
        enrollmentRepository.save(enrollment);

        return EnrollResult.success(enrollment);
    }
}
\`\`\`
`
});

// 第 45 章
part4Docs.push({
  id: "doc:hello-system-45-repository-persistence-abstraction",
  slug: "45-repository-persistence-abstraction",
  parentId: "'doc:hello-system-part-4'",
  title: "第45章 持久化抽象 Repository：屏蔽 SQL 与对象映射",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 45,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第45章 持久化抽象 Repository：屏蔽 SQL 与对象映射

## 1. 仓储模式（Repository Pattern）的价值

Repository 将数据库系统模拟成一个**运行在内存中的虚拟集合**。

上层的业务 Service 只需要面向 Repository 接口调用 \`findById()\` 或 \`save()\`，完全不需要关心底层到底是通过原生 JDBC、MyBatis 动态 XML，还是 Spring Data JPA / Hibernate 执行的具体 SQL。

\`\`\`java
public interface CourseRepository {
    Optional<Course> findById(int id);
    int incrementEnrolledIfAvailable(int courseId);
    void save(Course course);
}
\`\`\`

这种解耦使得在单元测试时，可以用内存 Map 轻松替代真实数据库，从而实现超快速的业务测试验证。
`
});

// 第 46 章
part4Docs.push({
  id: "doc:hello-system-46-entity-dto-vo-boundaries",
  slug: "46-entity-dto-vo-boundaries",
  parentId: "'doc:hello-system-part-4'",
  title: "第46章 对象边界隔离：Entity、DTO 与 Value Object 的分工",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 46,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第46章 对象边界隔离：Entity、DTO 与 Value Object 的分工

## 1. 为什么不能一个类走天下？

在许多新手项目中，经常出现“一个 \`Course\` 类从数据库表、Service 业务逻辑一路透传到前端 JSON 接口”的现象。

这种“偷懒”会带来极其危险的安全与维护漏洞：
1. **过度暴露敏感字段（Over-Fetching）**：如果不小心在实体类中增加了 \`passwordHash\` 或内部审计字段，直接返回 Entity 会导致敏感数据泄露；
2. **批量赋值漏洞（Mass Assignment Vulnerability）**：如果前端恶意在 JSON 里提交 \`{ "id": 2048, "enrolled": 0 }\`，直接将请求绑定到 Entity 可能会导致非法字段被恶意覆盖。

---

## 2. 三类对象的严密职责划分

\`\`\`mermaid
flowchart LR
    subgraph Client["网络与前端世界"]
        ReqDTO["Request DTO (入参校验)"]
        RespDTO["Response DTO (按需定制输出)"]
    end

    subgraph Domain["领域业务核心世界"]
        VO["Value Object (值对象: 不可变业务量)\n例如: CourseCode, Money"]
        Entity["Entity (实体: 拥有唯一生命周期 ID 与业务方法)\n例如: Course, Student"]
    end

    subgraph Storage["数据存储世界"]
        PO["PO / Data Record (映射数据库表字段)"]
    end

    ReqDTO -->|转换为| Entity
    Entity -->|包含| VO
    Entity -->|转换为| RespDTO
    Entity <==>|映射转换| PO
\`\`\`

| 对象类型 | 核心特征 | 典型应用场景 |
| :--- | :--- | :--- |
| **Entity（实体）** | 拥有跨生命周期的唯一主键 ID，通过业务方法改变内部状态 | \`Course\`, \`Student\`, \`Enrollment\` |
| **Value Object（值对象）** | 没有独立 ID，完全由其属性值定义，具有严格的不可变性 | \`CourseCode\`, \`TuitionFee\` |
| **DTO（数据传输对象）** | 纯扁平数据结构，无业务方法，专职网络序列化传输 | \`EnrollRequest\`, \`EnrollmentResponseDto\` |

至此，前后端的标准协作通道已经完全打通。

但是，真实世界的网络与服务器并不是一个平静的乌托邦。当面对恶意请求、系统崩溃断电、并发冲突与丢包重试时，系统将展现出怎样残酷的挑战？

让我们进入第五部分：**真实系统开始反抗 (47 ~ 55)**！
`
});

export { part4Docs };
