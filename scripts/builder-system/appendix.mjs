// scripts/builder-system/appendix.mjs
// 附录与后记 (A ~ H)
// 全量技术修订与规范化完整版本

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
    title: "附录A Mini Campus 参考工程目录结构",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录A Mini Campus 参考工程目录结构

> **说明**：以下展示的是 Mini Campus 项目的一种典型工程组织结构，用于教学参考，不同团队和项目可根据实际规模进行剪裁。

\`\`\`text
mini-campus/
├── frontend/                         # Vue 3 前端工程
│   ├── src/
│   │   ├── api/                      # 网络请求模块
│   │   │   ├── client.js             # HTTP 客户端封装与拦截器
│   │   │   └── courses.js            # 课程相关 API 调用契约
│   │   ├── components/               # 可复用 UI 组件
│   │   │   ├── CourseCard.vue        # 单门课程卡片
│   │   │   └── EnrollmentDrawer.vue  # 已选课程抽屉
│   │   ├── router/                   # 客户端路由配置 (Vue Router)
│   │   │   └── index.js
│   │   ├── stores/                   # 应用级状态管理 (Pinia)
│   │   │   ├── user.js               # 用户登录会话 Store
│   │   │   └── course.js             # 选课数据 Store
│   │   ├── views/                    # 页面级视图组件
│   │   │   ├── CourseListView.vue
│   │   │   └── MyEnrollmentsView.vue
│   │   ├── App.vue                   # 应用根组件
│   │   └── main.js                   # 前端入口
│   └── package.json
│
├── backend/                          # Java / Spring Boot 后端工程
│   ├── src/main/java/com/campus/
│   │   ├── controller/               # 表现层 (REST API 路由与输入校验)
│   │   │   ├── CourseController.java
│   │   │   └── EnrollmentController.java
│   │   ├── service/                  # 业务逻辑层 (业务用例编排与事务边界)
│   │   │   ├── CourseService.java
│   │   │   └── EnrollmentService.java
│   │   ├── repository/               # 数据持久层 (仓储接口与数据访问)
│   │   │   ├── CourseRepository.java
│   │   │   └── EnrollmentRepository.java
│   │   ├── domain/                   # 领域实体 (核心业务状态与不变量)
│   │   │   ├── Course.java
│   │   │   └── Student.java
│   │   ├── dto/                      # 数据传输对象 (边界隔离与数据脱敏)
│   │   │   ├── request/EnrollRequestDto.java
│   │   │   └── response/CourseResponseDto.java
│   │   ├── exception/                # 业务异常与全局异常处理
│   │   │   ├── GlobalExceptionHandler.java
│   │   │   └── BusinessException.java
│   │   └── MiniCampusApplication.java
│   └── pom.xml
│
└── database/                         # 数据库结构与初始化脚本
    ├── 01_schema.sql                 # DDL 表结构与约束
    └── 02_seed_data.sql              # 基础测试数据
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

## 1. 概念模型 ER 图

\`\`\`mermaid
erDiagram
    USERS ||--o| STUDENTS : "0..1 对应"
    USERS ||--o| TEACHERS : "0..1 对应"
    TEACHERS ||--o{ COURSES : "1 对 多 讲授"
    STUDENTS ||--o{ ENROLLMENTS : "1 对 多 选课"
    COURSES ||--o{ ENROLLMENTS : "1 对 多 选课"

    USERS {
        int id PK "用户ID"
        string email UK "登录邮箱"
        string password_hash "密码哈希"
        string role "角色 (STUDENT / TEACHER / ADMIN)"
        datetime created_at "注册时间"
    }

    STUDENTS {
        int id PK "学生档案ID"
        int user_id FK,UK "关联用户ID"
        string student_no UK "学号"
        string name "姓名"
        string major "专业院系"
    }

    TEACHERS {
        int id PK "教师档案ID"
        int user_id FK,UK "关联用户ID"
        string teacher_no UK "工号"
        string name "姓名"
        string title "职称"
    }

    COURSES {
        int id PK "课程ID"
        string code UK "课程代码 (如 CS-101)"
        string name "课程名称"
        int teacher_id FK "任课教师ID"
        int capacity "课程总容量"
        int enrolled "已选人数(反规范化计数)"
    }

    ENROLLMENTS {
        int id PK "选课流水ID"
        int student_id FK "学生ID"
        int course_id FK "课程ID"
        datetime enrolled_at "选课时间"
    }
\`\`\`

> **数据模型设计说明**：
> 1. \`users\` 与 \`students\` / \`teachers\` 采用基于角色的多态档案关联，每个 User 根据其 \`role\` 关联对应的档案表；
> 2. \`enrollments\` 表中通过复合唯一索引 \`UNIQUE(student_id, course_id)\` 保证同一学生不可重复选修同一门课程；
> 3. \`courses.enrolled\` 作为有意识的反规范化冗余计数，通过业务事务与 \`enrollments\` 表的增删操作严格保持同步。
`
  },
  {
    id: "doc:hello-system-appendix-c",
    slug: "appendix-c",
    parentId: "'doc:hello-system-appendix'",
    title: "附录C 核心 SQL 参考手册",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录C 核心 SQL 参考手册

## 1. DDL 基础表结构与约束定义

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

-- 选课关联表 (仅记录当前有效选课，退课时执行物理删除或归档至历史表)
CREATE TABLE enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    UNIQUE KEY uk_student_course (student_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
\`\`\`

---

## 2. 高并发选课的事务实现对比

### 方案 A：原子条件更新（推荐主线方案）
\`\`\`sql
START TRANSACTION;

-- 1. 执行原子条件更新
UPDATE courses 
SET enrolled = enrolled + 1 
WHERE id = ? AND enrolled < capacity;

-- 2. 若上一步 affected_rows == 1，插入选课关联记录
INSERT INTO enrollments (student_id, course_id) VALUES (?, ?);

-- 3. 提交事务 (若唯一索引冲突则回滚)
COMMIT;
\`\`\`

### 方案 B：显式排他锁（SELECT ... FOR UPDATE 方案）
\`\`\`sql
START TRANSACTION;

-- 1. 申请行级排他锁并读取当前名额
SELECT capacity, enrolled FROM courses WHERE id = ? FOR UPDATE;

-- 2. 在应用层重新检查 (enrolled < capacity) 满足后执行更新与插入
UPDATE courses SET enrolled = enrolled + 1 WHERE id = ?;
INSERT INTO enrollments (student_id, course_id) VALUES (?, ?);

-- 3. 提交事务并释放行锁
COMMIT;
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

| 概念 | 核心机制与定位 | 典型使用场景 | 常见误区 |
| :--- | :--- | :--- | :--- |
| **ref** | 带有 \`.value\` 访问器属性的响应式包装对象 | 基础类型（数字、字符串、布尔值）或重新分配引用的对象 | 在 JS 逻辑中遗漏 \`.value\` 访问 |
| **reactive** | 基于 ES6 \`Proxy\` 的深层响应式代理 | 聚合表单对象 | 解构赋值后丢失响应式追踪 |
| **computed** | 具有依赖自动收集与缓存特性的派生状态 | 过滤列表、计算总学分、判定按钮禁用状态 | 在 computed 中执行异步请求或修改其他状态 |
| **watch** | 监听状态变化并执行副作用的观察者 | 数据变化时调用外部 API、写本地存储 | 用 watch 监听源数据并手动同步派生状态 |
| **Props** | 父组件向子组件单向传递的入参 | 传递只读数据与配置项 | 子组件尝试直接修改 Prop 变量的引用 |
| **Emit** | 子组件向父组件抛出的自定义事件 | 按钮点击、状态变更通知 | 跨多层嵌套组件过度层层透传 |
| **Pinia** | 模块化的应用级状态管理库 | 用户会话状态、全局通知、跨视图共享数据 | 将仅在局部组件使用的临时状态放入全局 Store |
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

- **不变量（Invariant）**：对象在其整个生命周期中任何可观察时刻都必须恒为真的业务完整性规则；
- **封装（Encapsulation）**：隐藏内部表示细节，将状态流转收敛于受控的行为方法中；
- **组合（has-a）**：一个类持有另一个类的引用以复用功能，耦合度低于继承；
- **依赖（uses-a）**：一个类在方法参数或执行过程中临时使用另一个类的功能；
- **继承（is-a）**：子类型对父类型的严格扩展，必须满足里氏替换原则（LSP）；
- **多态（Polymorphism）**：同一抽象调用在运行期根据接收对象的实际类型动态执行对应行为；
- **接口（Interface）**：脱离具体实现的抽象行为契约，是实现依赖倒置原则（DIP）的重要工具。
`
  },
  {
    id: "doc:hello-system-appendix-f",
    slug: "appendix-f",
    parentId: "'doc:hello-system-appendix'",
    title: "附录F HTTP 语义与 RESTful API 设计速查",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 6,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录F HTTP 语义与 RESTful API 设计速查

## 1. 常用 HTTP 状态码语义 (RFC 9110)

- **200 OK**：请求成功处理并返回预期内容；
- **201 Created**：请求成功且服务器已创建新资源；
- **204 No Content**：请求成功处理，无响应体返回；
- **400 Bad Request**：客户端请求报文格式或参数非法；
- **401 Unauthorized**：请求缺乏有效身份认证凭据；
- **403 Forbidden**：服务器理解请求但拒绝执行（无对应权限）；
- **404 Not Found**：请求的目标资源在服务端未找到；
- **409 Conflict**：请求与当前资源的状态发生冲突（如名额已满或重复提交）；
- **422 Unprocessable Content**：请求语法正确但包含业务语义错误；
- **500 Internal Server Error**：服务器内部发生未处理的故障。

---

## 2. 常用 HTTP 方法语义

- **GET**：安全且幂等，用于检索资源，不应产生持久化副作用；
- **POST**：非幂等，用于创建从属资源或执行非标准化业务操作；
- **PUT**：幂等，用于全量替换指定 URI 的目标资源；
- **DELETE**：幂等，用于删除指定 URI 的目标资源。
`
  },
  {
    id: "doc:hello-system-appendix-g",
    slug: "appendix-g",
    parentId: "'doc:hello-system-appendix'",
    title: "附录G 计算机专业核心课程图谱与进阶路线",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 7,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 附录G 计算机专业核心课程图谱与进阶路线

《Hello System》帮助你建立了软件系统的横向连接。在后续学习中，建议结合本科核心基础课程进行纵向深入：

\`\`\`mermaid
flowchart TD
    System["《Hello System》软件系统全景"]
    
    CS1["计算机组成原理\n深入 CPU 指令集、流水线、缓存一致性与底层硬件交互"]
    CS2["操作系统\n深入进程线程调度、虚拟内存管理、文件系统与系统调用"]
    CS3["计算机网络\n深入 TCP/IP 协议栈、拥塞控制、DNS、TLS 与路由算法"]
    CS4["数据库系统原理\n深入 查询优化器内核、B+树物理存储引擎、Aries 恢复算法与分布式事务"]
    CS5["软件工程与架构\n深入 领域驱动设计 (DDD)、微服务拆分、设计模式与大型系统重构"]

    System --> CS1
    System --> CS2
    System --> CS3
    System --> CS4
    System --> CS5
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
| **不变量** | Invariant | 实体生命周期中在任何稳定状态下必须恒为真的业务完整性规则 |
| **内聚性** | Cohesion | 模块内部元素关联的紧密程度 |
| **耦合度** | Coupling | 模块之间相互依赖与纠缠的程度 |
| **动态分派** | Dynamic Dispatch | 运行期根据实际对象类型解析并调用对应方法实现的机制 |
| **单页面应用** | SPA (Single-Page Application) | 客户端拦截路由切换、避免全屏白屏刷新的 Web 应用架构 |
| **响应式系统** | Reactivity System | 状态变更自动追踪并触发对应视图与副作用更新的机制 |
| **领域实体** | Entity | 具有唯一业务标识且在其生命周期中保持身份连续性的领域模型 |
| **数据传输对象** | DTO (Data Transfer Object) | 纯粹用于在不同系统或进程边界传递数据的结构载体 |
| **值对象** | Value Object | 通过其包含的所有属性值来判定等价性且无独立生命周期的不可变对象 |
| **预写日志** | WAL (Write-Ahead Logging) | 数据页刷盘前先将日志顺序持久化落盘以支持崩溃恢复的存储机制 |
| **幂等性** | Idempotency | 同一操作被重复执行多次所产生的状态结果与执行一次相同的性质 |
| **竞态条件** | Race Condition | 多个并发操作执行的时序交错导致系统产生不确定状态的并发异常 |
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

计算机软件工程是一门充满创造力与理性之美的学科。

在微观层面，软件系统受制于物理硬件的客观规律——时钟周期、内存寻址、网络延迟与介质故障；  
在宏观层面，软件工程师通过一层又一层的抽象与封装，将纷繁复杂的现实需求组织为高内聚、低耦合的模块与服务。

软件工程的独特魅力，不在于彻底摆脱物理世界，而在于**我们能够运用严密的心智模型隐藏不必要的细节，同时在抽象发生泄漏时，能够自如地看清每一层齿轮是如何精密咬合的**。

愿《Hello System》成为你探索计算机系统世界的一块踏脚石。

在未来的学习与工程实践中，保持对系统本质的好奇，不断雕琢你的设计，建造出坚固、严谨而优美的软件系统！
`
  }
];
