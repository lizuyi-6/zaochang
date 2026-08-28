// scripts/builder-system/appendix.mjs
// 附录与后记 (A ~ H)

export const appendixDocs = [
  {
    id: "doc:hello-system-appendix",
    slug: "appendix",
    parentId: "'doc:book-hello-system'",
    title: "附录 · Mini Campus 全景参考与速查",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 9,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-system-appendix-a",
    slug: "appendix-a",
    parentId: "'doc:hello-system-appendix'",
    title: "附录A Mini Campus 最终项目工程结构",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录A Mini Campus 最终项目工程结构

\`\`\`text
mini-campus/
├── frontend/                     # Vue 3 前端工程
│   ├── src/
│   │   ├── api/                  # HTTP 网络请求客户端
│   │   │   ├── client.js         # Axios / Fetch 封装与拦截器
│   │   │   └── courses.js        # 课程相关 API 契约
│   │   ├── components/           # 细粒度可复用组件
│   │   │   ├── CourseCard.vue    # 课程展示卡片
│   │   │   └── EnrollmentDrawer.vue # 已选抽屉栏
│   │   ├── router/               # 客户端路由 (Vue Router)
│   │   │   └── index.js
│   │   ├── stores/               # 全局状态管理 (Pinia)
│   │   │   └── user.js
│   │   ├── views/                # 页面级视图组件
│   │   │   ├── CourseListView.vue
│   │   │   └── MyEnrollmentsView.vue
│   │   ├── App.vue               # 根组件
│   │   └── main.js               # 前端应用入口
│   └── package.json
│
├── backend/                      # Java / Spring Boot 后端工程
│   ├── src/main/java/com/campus/
│   │   ├── controller/           # 表现层 (REST API / 参数解析)
│   │   │   ├── CourseController.java
│   │   │   └── EnrollmentController.java
│   │   ├── service/              # 业务逻辑层 (业务规则与不变量编排)
│   │   │   ├── CourseService.java
│   │   │   └── EnrollmentService.java
│   │   ├── repository/           # 数据持久化层 (数据库访问)
│   │   │   ├── CourseRepository.java
│   │   │   └── EnrollmentRepository.java
│   │   ├── domain/               # 领域实体与聚合 (核心状态机)
│   │   │   ├── Course.java
│   │   │   └── Student.java
│   │   ├── dto/                  # 数据传输对象 (边界隔离)
│   │   │   ├── request/EnrollRequestDTO.java
│   │   │   └── response/CourseResponseDTO.java
│   │   ├── exception/            # 全局异常与错误处理
│   │   │   ├── GlobalExceptionHandler.java
│   │   │   └── BusinessException.java
│   │   └── MiniCampusApplication.java
│   └── pom.xml
│
└── database/                     # 数据库 DDL 与迁移脚本
    ├── 01_init_schema.sql
    └── 02_seed_data.sql
\`\`\`
`
  },
  {
    id: "doc:hello-system-appendix-b",
    slug: "appendix-b",
    parentId: "'doc:hello-system-appendix'",
    title: "附录B Mini Campus 数据库设计与完整 ER 图",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 2,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录B Mini Campus 数据库设计与完整 ER 图

\`\`\`mermaid
erDiagram
    USERS ||--|| STUDENTS : "1 对 1 归属"
    USERS ||--|| TEACHERS : "1 对 1 归属"
    TEACHERS ||--o{ COURSES : "1 对 多 讲授"
    STUDENTS ||--o{ ENROLLMENTS : "1 对 多 选课"
    COURSES ||--o{ ENROLLMENTS : "1 对 多 选课"

    USERS {
        int id PK
        string email UK
        string password_hash
        string role "STUDENT / TEACHER / ADMIN"
        datetime created_at
    }

    STUDENTS {
        int id PK
        int user_id FK,UK
        string student_no UK
        string name
        string major
    }

    TEACHERS {
        int id PK
        int user_id FK,UK
        string teacher_no UK
        string name
        string title
    }

    COURSES {
        int id PK
        string code UK
        string name
        int teacher_id FK
        int capacity
        int enrolled
    }

    ENROLLMENTS {
        int id PK
        int student_id FK
        int course_id FK
        datetime enrolled_at
        string status "ACTIVE / DROPPED"
    }
\`\`\`
`
  },
  {
    id: "doc:hello-system-appendix-c",
    slug: "appendix-c",
    parentId: "'doc:hello-system-appendix'",
    title: "附录C 核心 SQL 速查手册",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录C 核心 SQL 速查手册

## 1. DDL 基础建表与约束

\`\`\`sql
-- 课程表
CREATE TABLE courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    teacher_id INT NOT NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    enrolled INT NOT NULL DEFAULT 0 CHECK (enrolled >= 0 AND enrolled <= capacity),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 选课表
CREATE TABLE enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    UNIQUE KEY uk_student_course (student_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
\`\`\`

---

## 2. 高并发高安全名额扣减操作

\`\`\`sql
-- 方式 A: 悲观排他锁
START TRANSACTION;
SELECT enrolled, capacity FROM courses WHERE id = ? FOR UPDATE;
UPDATE courses SET enrolled = enrolled + 1 WHERE id = ?;
INSERT INTO enrollments (student_id, course_id) VALUES (?, ?);
COMMIT;

-- 方式 B: 原子条件更新 (CAS 乐观控制)
UPDATE courses 
SET enrolled = enrolled + 1 
WHERE id = ? AND enrolled < capacity;
\`\`\`
`
  },
  {
    id: "doc:hello-system-appendix-d",
    slug: "appendix-d",
    parentId: "'doc:hello-system-appendix'",
    title: "附录D Vue 3 核心概念与心智速查",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 4,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录D Vue 3 核心概念与心智速查

| 概念 | 核心定位 | 典型使用场景 | 常见误区 |
| :--- | :--- | :--- | :--- |
| **ref** | 基础类型/对象的响应式包装 | 声明单个变量、计数器、表单值 | 忘记在 JS 中通过 \`.value\` 读写 |
| **reactive** | 对象的 Proxy 深层代理 | 聚合表单对象 | 解构赋值后会丢失响应式 |
| **computed** | 具有缓存特性的派生状态 | 根据列表计算过滤结果、统计总额 | 试图在 computed 内部发起异步网络请求 |
| **watch** | 状态变化触发的副作用 | 数据改变后同步到网络、LocalStorage | 滥用 watch 代替 computed 计算派生数据 |
| **Props** | 父组件向子组件单向传递的入参 | 传递数据、配置项 | 子组件尝试直接修改 props 属性 |
| **Emit** | 子组件向父组件汇报的事件 | 按钮点击、状态变更通知 | 跨多层组件时层层 emit 导致链路脆弱 |
| **Pinia** | 全局单一真相来源状态树 | 登录用户信息、购物车、全局通知 | 把局部简单表单数据也塞入全局 store |
`
  },
  {
    id: "doc:hello-system-appendix-e",
    slug: "appendix-e",
    parentId: "'doc:hello-system-appendix'",
    title: "附录E 面向对象核心思想速查",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录E 面向对象核心思想速查

- **不变量（Invariant）**：对象在任何时刻都必须为真的业务契约（如 $0 \\le \\text{enrolled} \\le \\text{capacity}$）；
- **封装（Encapsulation）**：隐藏数据物理布局，仅暴露受保护的状态跃迁行为；
- **组合（has-a）**：一个类持有另一个类的实例，优先于继承使用；
- **依赖（uses-a）**：方法入参临时使用外部对象；
- **继承（is-a）**：严格的子类型替代关系（里氏替换）；
- **多态（Polymorphism）**：同一抽象调用在运行时通过虚方法表动态分派到具体实现；
- **接口（Interface）**：完全脱离实现细节的纯粹契约与插座。
`
  },
  {
    id: "doc:hello-system-appendix-f",
    slug: "appendix-f",
    parentId: "'doc:hello-system-appendix'",
    title: "附录F HTTP 状态码与 REST API 规范速查",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 6,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录F HTTP 状态码与 REST API 规范速查

## 1. 核心状态码速查

- **200 OK**：请求成功，并在响应体中返回目标数据；
- **201 Created**：资源创建成功（如选课成功新增记录）；
- **204 No Content**：操作成功，但响应体为空（如成功退课或删除）；
- **400 Bad Request**：客户端传参格式错误；
- **401 Unauthorized**：未登录或身份凭证无效；
- **403 Forbidden**：已登录但无权限访问该资源；
- **404 Not Found**：请求的资源 URI 不存在；
- **409 Conflict**：业务状态冲突（如名额已满或重复提交）；
- **500 Internal Server Error**：服务器内部未捕获的严重异常。

---

## 2. HTTP 方法语义

- **GET**：只读安全且幂等，获取资源；
- **POST**：非幂等，创建新资源或执行非标准化动作；
- **PUT**：幂等，全量替换目标资源；
- **DELETE**：幂等，删除目标资源。
`
  },
  {
    id: "doc:hello-system-appendix-g",
    slug: "appendix-g",
    parentId: "'doc:hello-system-appendix'",
    title: "附录G 计算机专业进阶学习路线图",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 7,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录G 计算机专业进阶学习路线图

读完《Hello System》，你已经建立了软件系统的全景骨架。接下来，你可以向各个方向深入探索：

\`\`\`mermaid
flowchart TD
    Core["《Hello System》全景图解"] --> Hard["底层硬件与系统方向\n- 计算机组成原理 (408)\n- 操作系统与 Linux 内核\n- 计算机网络协议栈"]
    Core --> Arch["软件工程与架构方向\n- 设计模式与重构\n- 领域驱动设计 (DDD)\n- 分布式系统与微服务"]
    Core --> Data["数据与算法方向\n- 数据库内核实现 (CMU 15-445)\n- 高级数据结构与算法\n- 搜索引擎与流计算"]
\`\`\`
`
  },
  {
    id: "doc:hello-system-appendix-h",
    slug: "appendix-h",
    parentId: "'doc:hello-system-appendix'",
    title: "附录H 核心技术术语中英对照表",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 8,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录H 核心技术术语中英对照表

| 中文术语 | 英文对照 | 核心含义简释 |
| :--- | :--- | :--- |
| **不变量** | Invariant | 实体生命周期中必须恒为真的业务完整性规则 |
| **内聚性** | Cohesion | 模块内部元素关联的紧密程度 |
| **耦合度** | Coupling | 模块之间相互纠缠与依赖的程度 |
| **动态分派** | Dynamic Dispatch | 运行时根据实际对象类型解析方法入口的机制 |
| **单页面应用** | SPA (Single Page Application) | 客户端拦截路由、无需整页刷新的现代 Web 架构 |
| **响应式** | Reactivity | 状态变更自动驱动视图更新的机制 |
| **实体** | Entity | 具有唯一标识且拥有独立生命周期的领域模型 |
| **数据传输对象** | DTO (Data Transfer Object) | 纯粹用于在不同系统/进程边界传递数据的扁平结构 |
| **预写日志** | WAL (Write-Ahead Logging) | 数据修改前先顺序持久化落盘日志的容灾机制 |
| **幂等性** | Idempotency | 操作多次执行对系统状态产生的影响与执行一次相同的性质 |
| **竞态条件** | Race Condition | 多个并发操作执行先后顺序不可控导致的数据不一致灾难 |
`
  },
  {
    id: "doc:hello-system-epilogue",
    slug: "epilogue",
    parentId: "'doc:book-hello-system'",
    title: "后记: 愿你建造出坚固而优美的系统",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 10,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 后记: 愿你建造出坚固而优美的系统

计算机科学是一门年轻而神奇的工程学科。

物理学家需要受限于宇宙的基本粒子与引力常数，土木工程师需要受限于钢筋混凝土的材料极限。

而在软件的世界里，除了 CPU 的时钟节拍、内存的寻址边界和光纤在物理介质中的传播速度，**我们构建一切逻辑大厦的材料，纯粹是人类思想本身的抽象能力。**

当你看到无数个状态在内存与磁盘间穿梭，看到不同模块通过协议严丝合缝地咬合，看到一个历经千万人并发冲撞的系统依然稳如泰山时，你会感受到一种属于工程师的、极度纯粹的智力美感。

愿《Hello System》成为你计算机探索之旅上的一块坚实基石。

去写代码吧，去直面现实世界的混乱与挑战，去建造属于你的坚固而优美的系统！
`
  }
];
