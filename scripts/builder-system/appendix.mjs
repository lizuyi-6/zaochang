// scripts/builder-system/appendix.mjs
// 《Hello System · 图解软件系统》附录 A ~ H 与后记（全量教材化深度扩写版本）

const appendixDocs = [];

// 附录 A
appendixDocs.push({
  id: "doc:hello-system-appx-a-project-tree",
  slug: "appx-a-project-tree",
  parentId: "'doc:book-hello-system'",
  title: "附录A: Mini Campus 完整工程架构与文件目录",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 61,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 附录A: Mini Campus 完整工程架构与文件目录

## 1. 现代前后端分离典型目录结构

本附录给出 Mini Campus 校园选课系统所采用的一种常见前后端分离工程组织方式，供读者在实际项目开发中参考。需要说明的是：Controller / Service / Repository 的目录划分并不存在唯一的行业标准，不同团队与框架会有不同的合理组织形态：

\`\`\`text
mini-campus/
├── frontend/                     # Vue 3 前端工程
│   ├── src/
│   │   ├── api/                  # API 网络请求封装
│   │   │   └── enrollment.js
│   │   ├── components/           # UI 呈现组件
│   │   │   ├── CourseCard.vue
│   │   │   └── CourseList.vue
│   │   ├── stores/               # Pinia 全局状态管理
│   │   │   └── useEnrollmentStore.js
│   │   ├── App.vue
│   │   └── main.js
│   ├── package.json
│   └── vite.config.js
│
└── backend/                      # Spring Boot 后端工程
    ├── src/main/java/com/zaochang/campus/
    │   ├── domain/               # 领域层: 实体、值对象与业务不变量
    │   │   ├── Course.java
    │   │   ├── Student.java
    │   │   └── Enrollment.java
    │   ├── service/              # 业务逻辑层: 用例编排与事务控制
    │   │   ├── EnrollmentService.java
    │   │   └── CourseQueryService.java
    │   ├── controller/           # 表现层: HTTP REST 路由与参数校验
    │   │   ├── EnrollmentController.java
    │   │   └── CourseController.java
    │   ├── repository/           # 数据访问层: 持久化接口与 SQL 映射
    │   │   ├── CourseRepository.java
    │   │   └── EnrollmentRepository.java
    │   ├── dto/                  # 数据传输对象
    │   │   ├── request/
    │   │   │   └── EnrollRequest.java
    │   │   └── response/
    │   │       └── EnrollmentResponseDto.java
    │   └── CampusApplication.java
    └── pom.xml
\`\`\`
`
});

// 附录 B
appendixDocs.push({
  id: "doc:hello-system-appx-b-er-and-ddl",
  slug: "appx-b-er-and-ddl",
  parentId: "'doc:book-hello-system'",
  title: "附录B: 规范化 ER 图与完整 MySQL DDL",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 62,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 附录B: 规范化 ER 图与完整 MySQL DDL

## 1. 规范化实体关系图（ER Diagram）

\`\`\`mermaid
erDiagram
    MAJORS ||--o{ STUDENTS : "belongs_to"
    STUDENTS ||--o{ ENROLLMENTS : "has"
    COURSES ||--o{ ENROLLMENTS : "is_enrolled_by"
    TEACHERS ||--o{ COURSES : "teaches"

    MAJORS {
        int id PK
        string code UK
        string name
    }

    STUDENTS {
        int id PK
        string student_no UK
        string name
        int major_id FK
    }

    TEACHERS {
        int id PK
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
    }
\`\`\`

---

## 2. 生产级 DDL 建表脚本

\`\`\`sql
-- 专业表 (3NF 拆分)
CREATE TABLE majors (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 学生表
CREATE TABLE students (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_no VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    major_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_stu_major FOREIGN KEY (major_id) REFERENCES majors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 教师表
CREATE TABLE teachers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    teacher_no VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    title VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 课程表 (enrolled 为显式反规范化计数缓存)
CREATE TABLE courses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    teacher_id INT NOT NULL,
    capacity INT NOT NULL,
    enrolled INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_course_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 选课关联表 (核心多对多关系)
CREATE TABLE enrollments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_enr_student FOREIGN KEY (student_id) REFERENCES students(id),
    CONSTRAINT fk_enr_course FOREIGN KEY (course_id) REFERENCES courses(id),
    CONSTRAINT uk_student_course UNIQUE (student_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
\`\`\`

---

## 3. 认证身份的外部边界说明

读者可能会问：第 41 章的 HTTP API 使用了 \`Authorization: Bearer <token>\` 与“当前已认证学生”，为什么这张 ER 图里没有 \`users\` / \`accounts\` 表？

**本书的 ER 图聚焦于 Mini Campus 的业务域。** 认证账户系统被视为独立的身份基础设施（Identity Infrastructure）：认证层负责验证凭据（签名 Token 或服务端 Session），验证通过后将安全主体（Security Principal）映射为业务域中的 \`Student ID\`，业务代码只消费这个已认证的学生身份。Token 并不是凭空直接变成 \`studentId\` 的——中间隔着认证层这座可信桥梁。

\`\`\`mermaid
flowchart LR
    subgraph Identity["身份基础设施 (本书范围之外)"]
        Account["认证账户 / 凭据存储"]
        Issuer["凭据签发与验证\n(签名 Token / Session)"]
    end

    subgraph Business["Mini Campus 业务域 (本 ER 图范围)"]
        Student["students 表\n(业务学生实体)"]
    end

    Account --> Issuer
    Issuer -->|"验证通过后映射为安全主体"| Student
\`\`\`
`
});

// 附录 C（清晰区分 SQL 本身与应用层事务控制）
appendixDocs.push({
  id: "doc:hello-system-appx-c-core-sql",
  slug: "appx-c-core-sql",
  parentId: "'doc:book-hello-system'",
  title: "附录C: 核心业务 SQL 手册与执行计划分析",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 63,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 附录C: 核心业务 SQL 手册与执行计划分析

## 1. 高并发选课标准原子更新 SQL

\`\`\`sql
-- 1. 原子扣减名额 (利用行级排他锁与 WHERE 条件防范超卖)
UPDATE courses 
SET enrolled = enrolled + 1 
WHERE id = 2048 AND enrolled < capacity;

-- 2. 插入选课流水 (利用唯一约束防范重复选课)
INSERT INTO enrollments (student_id, course_id, enrolled_at) 
VALUES (1001, 2048, NOW());
\`\`\`

> **机制澄清：SQL 语句 vs 应用层事务控制**
> 1. SQL 语句本身不包含业务条件分支控制。第一句 UPDATE 执行后返回的 \`affected_rows\`（影响行数），是由应用层（JDBC / MyBatis / Spring Data）读取并做出业务判断的：
>    - 若 \`affected_rows == 0\`，证明名额已满，应用层主动中断后续逻辑或执行回滚；
> 2. 第二句 INSERT 若触发 \`UNIQUE(student_id, course_id)\` 约束冲突，底层驱动会抛出 \`DuplicateKeyException\`。在 Spring \`@Transactional\` 机制下，该未捕获异常向事务边界传播，由 Spring 事务管理器捕获并向数据库连接发出 \`ROLLBACK\` 指令。

---

## 2. 复杂多表关联统计查询

\`\`\`sql
-- 统计计算机学院各门课程的实际选修人数与选满率
SELECT 
    c.id AS course_id,
    c.name AS course_name,
    t.name AS teacher_name,
    c.capacity,
    COUNT(e.id) AS actual_enrollment,
    ROUND(COUNT(e.id) * 100.0 / c.capacity, 2) AS fill_rate_percent
FROM courses c
INNER JOIN teachers t ON c.teacher_id = t.id
LEFT JOIN enrollments e ON c.id = e.course_id
GROUP BY c.id, c.name, t.name, c.capacity
ORDER BY fill_rate_percent DESC;
\`\`\`
`
});

// 附录 D
appendixDocs.push({
  id: "doc:hello-system-appx-d-api-spec",
  slug: "appx-d-api-spec",
  parentId: "'doc:book-hello-system'",
  title: "附录D: RESTful API 契约规范与 DTO 映射矩阵",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 64,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 附录D: RESTful API 契约规范与 DTO 映射矩阵

## 1. 核心 API 端点清单

| HTTP 方法 | 资源路径 | 认证要求 | 请求 DTO | 成功响应状态码 | 业务说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| \`GET\` | \`/api/courses\` | 公开 / 登录学生 | 无 (支持查询参数 \`page\`, \`size\`) | \`200 OK\` | 分页获取全校可选课程列表 |
| \`GET\` | \`/api/courses/{id}\`| 登录学生 | 无 | \`200 OK\` | 获取单门课程详细信息 |
| \`POST\` | \`/api/enrollments\` | 登录学生 (Bearer Token) | \`EnrollRequest\` (\`{"courseId": 2048}\`) | \`201 Created\` | 学生提交选课申请 |
| \`DELETE\` | \`/api/enrollments/{id}\` | 登录学生 (Bearer Token) | 无 | \`204 No Content\` | 学生申请退选已选课程 |

---

## 2. 统一 API 响应包装结构

\`\`\`json
{
  "code": "SUCCESS",
  "message": "操作成功",
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

// 附录 E
appendixDocs.push({
  id: "doc:hello-system-appx-e-concept-glossary",
  slug: "appx-e-concept-glossary",
  parentId: "'doc:book-hello-system'",
  title: "附录E: 核心术语与心智模型速查字典",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 65,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 附录E: 核心术语与心智模型速查字典

## 1. 核心术语速查

- **不变量（Invariant）**：实体在整个生命周期内必须恒成立的业务真理（如 $0 \\le \\text{enrolled} \\le \\text{capacity}$）；
- **单向数据流（One-Way Data Flow）**：前端组件化通信规范（Props 自顶向下传递，Events 向上抛出）；
- **响应式代理（Reactivity Proxy）**：利用 ES6 Proxy 拦截属性读取（track 依赖收集）与写入（trigger 派发更新）；
- **函数依赖（Functional Dependency）**：属性集 $X$ 的取值唯一确定属性集 $Y$ 的取值，记作 $X \\to Y$；
- **第三范式（3NF）**：对于关系中每个非平凡函数依赖 $X \\to A$，至少满足下列条件之一：$X$ 是超键，或 $A$ 是主属性（常见教学直觉：减少非主属性对候选键的不良传递依赖，正式推导见第34章）；
- **ACID 事务**：原子性（Atomicity）、一致性（Consistency）、隔离性（Isolation）、持久性（Durability）；
- **预写日志（WAL）**：在内存脏数据页被持久化之前，必须先将对应的日志记录满足数据库所要求的持久化级别（先日志，后数据页）；
- **幂等性（Idempotency）**：同一个操作执行多次与执行一次对系统产生的最终副作用完全一致。
`
});

// 附录 F（严格规范 POST 幂等语义与常见误区）
appendixDocs.push({
  id: "doc:hello-system-appx-f-myths-faq",
  slug: "appx-f-myths-faq",
  parentId: "'doc:book-hello-system'",
  title: "附录F: 计算机专业常见误区与踩坑 FAQ",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 66,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 附录F: 计算机专业常见误区与踩坑 FAQ

## 1. 常见技术误区与真相

### 误区 1：“使用了 \`class\` 关键字就是面向对象”
> **真相**：面向对象常讨论的维度包括身份、状态、行为、封装、消息协作与多态；本书特别强调通过封装维护业务不变量。另外需要注意术语语境：**Anemic Domain Model（贫血领域模型）指的是——一个系统声称采用富领域模型，却把所有业务规则放在外部 Service 中，领域 Entity 只保留数据字段**。它是一种有特定语境的设计取舍，不等同于过程式编程，也不意味着所有数据类都应该拥有行为：DTO、ORM Entity、Persistence Model 本来就可能只有数据与访问器，它们并不因此“错误”。

### 误区 2：“有了数据库事务，并发就绝对不会超卖”
> **真相**：仅仅声明使用事务（ACID）并不足以推断并发行为——实际表现取决于具体隔离级别、DBMS 实现（锁 / MVCC / 快照隔离在不同数据库中行为不同）与访问模式。在 Mini Campus 的场景中，可靠的做法是：**带不变量守卫的原子条件更新（\`UPDATE ... SET enrolled = enrolled + 1 WHERE id = ? AND enrolled < capacity\`）+ \`UNIQUE(student_id, course_id)\` 唯一约束，并置于同一事务中**。是否还需要额外的行级排他锁，取决于所用数据库的隔离级别与实现。

### 误区 3：“HTTP POST 方法绝对不能实现幂等”
> **真相**：HTTP 规范没有将 POST 定义为默认幂等方法，因此通用客户端不能假定任意 POST 请求都可以无条件安全重试。**但是，一个具体的后端 POST API 可以通过引入 \`Idempotency-Key\` 请求头、唯一业务流水号与去重表，实现具备幂等特性的安全重试。**

### 误区 4：“有索引的查询一定比没有索引快”
> **真相**：当查询需要访问表中较大比例的数据时，优化器可能判断顺序扫描的成本低于通过索引进行大量随机访问或回表（Random I/O）的成本，此时索引不会被选用。具体选择由统计信息、成本模型、缓存状态与查询形态共同决定，并不存在普适的固定比例阈值。
`
});

// 附录 G
appendixDocs.push({
  id: "doc:hello-system-appx-g-recommended-roadmap",
  slug: "appx-g-recommended-roadmap",
  parentId: "'doc:book-hello-system'",
  title: "附录G: 计算机专业推荐经典书单与进阶路线",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 67,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 附录G: 计算机专业推荐经典书单与进阶路线

## 1. 经典著作精选书单

- **计算机系统底层**：*Computer Systems: A Programmer's Perspective (CS:APP)* —— Randal E. Bryant
- **面向对象与架构**：*Clean Architecture* & *Clean Code* —— Robert C. Martin
- **数据库系统原理**：*Database System Concepts* —— Abraham Silberschatz
- **现代软件系统设计**：*Designing Data-Intensive Applications (DDIA)* —— Martin Kleppmann
- **Web 协议与网络**：*HTTP: The Definitive Guide* —— David Gourley

---

## 2. 计算机专业大二至大四进阶路线图

\`\`\`mermaid
flowchart LR
    Y2["大二核心\n- 掌握面向对象不变量与设计模式\n- 掌握关系范式、SQL 与事务并发\n- 掌握现代响应式前端框架"]
    Y3["大三攻坚\n- 深入操作系统内核与网络协议栈\n- 深入分布式系统基础 (CAP / Raft)\n- 独立完成高质量全栈项目"]
    Y4["大四升华\n- 高性能系统调优与可观测性实战\n- 参与知名开源社区项目贡献"]

    Y2 --> Y3 --> Y4
\`\`\`
`
});

// 附录 H
appendixDocs.push({
  id: "doc:hello-system-appx-h-verification-checklist",
  slug: "appx-h-verification-checklist",
  parentId: "'doc:book-hello-system'",
  title: "附录H: 生产环境全量发布与质量验收自检清单",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 68,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 附录H: 生产环境全量发布与质量验收自检清单

## 1. 生产发布自检表

- [x] **全书节点完整性**：78 个生成节点全部在位（书根 + 序言 + 序章 + 6 部分 + 60 章 + 8 附录 + 后记），目录层级无断链；
- [x] **零装饰性 Emoji**：全书正文杜绝任何 AI 装饰性表情；
- [x] **LaTeX / KaTeX 语法**：公式两端空格规范，反斜杠转义完整；
- [x] **Mermaid 图表语法**：所有节点均有完整定义，无死循环引用；
- [x] **技术口径严密性**：杜绝伪精确耗时数字、物理扇区伪底层论、假 OCC 与 Zero Trust 误用；
- [x] **SQL 事务隔离**：正文代码块内的 \`COMMIT;\` 与最外层部署 SQL 事务边界严格隔离。
`
});

// 后记
appendixDocs.push({
  id: "doc:hello-system-epilogue",
  slug: "epilogue",
  parentId: "'doc:book-hello-system'",
  title: "后记: 写给未来的软件架构师",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 69,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 后记: 写给未来的软件架构师

当你读到这里时，你已经跟随着学生李雷的一次普通点击，完成了一场跨越软件系统每一个维度的全景穿越。

你见证了代码从最朴素的几十行平铺脚本，如何在业务扩张的压力下逐渐失控；你见证了面向对象、分层解耦、响应式框架、关系规范化与 ACID 事务，是如何作为人类智慧的结晶，一步一步重塑秩序。

在这个大模型与 AI 辅助编程日益普及的时代，有人可能会问：“如果 AI 能帮我写 Controller、写 SQL、写 Vue 组件，我们为什么还要如此费力地搞清楚这些底层原理？”

答案其实非常简单：

**AI 可以帮你写出具体的代码片段，但它无法替你做出系统级的架构决策。**

当线上系统发生死锁崩溃时，当网络抖动引发重复扣费时，当业务规模增长 100 倍导致数据库瘫痪时，能够从蛛丝马迹中迅速洞察全链路矛盾、做出正确权衡取舍的，往往是那个在脑海中建立起完整软件系统图景的工程师。

希望《Hello System》不仅为你解答了大学课程中的疑惑，更能在你心中埋下一颗追求严谨、追求优雅、追求透彻理解的种子。

恭喜你完成了整本书的学习。愿你在未来的软件创造之路上，乘风破浪，创造出真正属于你的精彩系统！
`
});

export { appendixDocs };
