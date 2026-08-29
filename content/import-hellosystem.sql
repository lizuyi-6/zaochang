-- Hello System · 图解软件系统
-- 从一次点击开始，理解一个完整软件系统如何运行
-- 全书 60 章、6 个顶层部分、序言、序章、附录与后记完整节点。

BEGIN TRANSACTION;
DELETE FROM reading_progress WHERE book_id LIKE 'doc:hello-system-%' OR book_id = 'doc:book-hello-system' OR last_chapter_id LIKE 'doc:hello-system-%' OR last_chapter_id = 'doc:book-hello-system';
DELETE FROM docs WHERE id LIKE 'doc:hello-system-%' OR id = 'doc:book-hello-system';

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:book-hello-system', 'hello-system', NULL, 'Hello System · 图解软件系统', '# Hello System · 图解软件系统

### 从一次用户点击开始，理解一个完整软件系统如何运行

> 一套将面向对象设计、分层架构、前端响应式、关系数据模型、事务并发控制与端到端 HTTP 调用贯通的软件系统教材。

---

## 这本书为什么存在？

在大学计算机专业的课程体系中，核心知识点通常分布在不同的专业课中：
- 程序设计与面向对象方法
- 数据库系统原理
- Web 前端开发与框架
- 软件工程与系统设计

然而，当读者开始尝试构建一个真实的软件项目时，常会遇到跨领域的认知断层：
- 浏览器内存中的前端状态，究竟是如何经过序列化与网络通信，最终转化为数据库中的持久化状态的？
- 为什么要在前端维护组件状态，在后端划分表现层、业务逻辑层与数据访问层，再去数据库设计规范化表结构？直接在交互事件里执行数据操作会有什么结构性缺陷？
- 什么是“状态”？为什么进程内存中的对象具有瞬态性，而数据库系统能够提供持久化保证？
- 当多个用户在同一时间争抢有限资源（例如选课名额）时，系统是如何在前端、后端与数据库协同保证数据一致性的？

《Hello System》的目标是：**建立统一的心智模型，帮助读者理清从前端用户交互到后端业务规则裁决、数据库事务持久化，再原路返回界面反馈的完整数据与控制流。**

```mermaid
flowchart LR
    User["用户操作"] --> Browser["浏览器 / DOM 事件"]
    Browser --> Vue["前端响应式组件状态"]
    Vue --> HTTP["HTTP 请求报文 (JSON)"]
    HTTP --> Backend["后端服务 (Controller / Service / Repository)"]
    Backend --> DB["数据库管理系统 (事务 / 索引 / 存储)"]
    DB --> Backend
    Backend --> HTTP
    HTTP --> Vue
    Vue --> Browser
    Browser --> User["界面呈现更新"]
```

---

## 贯穿全书的主线项目：Mini Campus

全书以一个具备典型 Web 架构特征的教学级项目——**Mini Campus 校园选课系统** 为主线演进。

读者将跟随需求扩张，观察系统如何一步步演变：
1. 从最初只有几十行的简单控制台逻辑出发，体会无架构阶段的直接与局限；
2. 面对数据组织与业务规则的混乱，逐步推导对象封装、不变量保护与分层设计；
3. 面对界面交互的复杂度，理解原生 DOM 操作的维护瓶颈与声明式响应式前端的诞生；
4. 面对数据存储与完整性要求，建立关系模型、规范化设计、索引与 ACID 事务心智；
5. 面对网络边界与并发竞争，理解信任边界输入验证、错误处理、幂等机制与并发控制；
6. 最终完成一次涵盖前端、网络、后端与数据库的端到端调用全景梳理。

---

## 全书架构导航

- **序章：一次点击** —— 鸟瞰一次典型交互背后的端到端协作全貌
- **第一部分：程序开始变大 (01 ~ 12)** —— 从单函数脚本演化到面向对象设计与经典三层分层
- **第二部分：页面开始变复杂 (13 ~ 24)** —— 原生 DOM 操作的维护困境与现代声明式响应式前端
- **第三部分：数据需要一个真正的家 (25 ~ 37)** —— 关系模型、SQL 声明式查询、规范化理论、索引与事务并发
- **第四部分：前端第一次遇见后端 (38 ~ 46)** —— 网络边界、HTTP 协议语义、API 契约设计与分层对象隔离
- **第五部分：真实系统开始反抗 (47 ~ 55)** —— 信任边界验证、异常传播、并发条件更新、幂等机制与测试保障
- **第六部分：重新走完那几百毫秒 (56 ~ 60)** —— 端到端请求链路全景复盘、架构设计反思与系统核心问题提炼
- **附录 (A ~ H) 与后记** —— 项目工程结构、ER 关系图、核心 SQL、概念速查与进阶路线
', 'public', '2251213429@qq.com', 1, 1, 215, '从一次用户点击开始，理解一个完整软件系统如何运行——以校园选课系统 Mini Campus 为主线，图解面向对象、分层设计、前端响应式、关系数据模型与事务并发全链路。');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-preface', 'preface', 'doc:book-hello-system', '序言: 还原软件系统的本来面目', '# 序言: 还原软件系统的本来面目

## 计算机专业学生的典型困惑

在计算机专业的课程学习中，各个模块往往是分门别类展开的：

在面向对象课程中，我们学习类、对象、封装与继承；在数据库课程中，我们学习关系代数、范式理论与 SQL；在前端课程中，我们学习组件、响应式状态与虚拟 DOM；在网络课程中，我们学习协议报文与状态码。

然而，当这些模块独立存在时，学习者常常难以在脑海中将它们拼接为一个协调运转的有机整体：

- 为什么在前端修改了某个变量，界面却没有按预期更新？
- 为什么业务方法抛出了异常，数据库中却留下了部分不一致的数据？
- 为什么在前端按钮设置了禁用状态，后端仍然可能发生名额超卖？
- 控制器、业务服务与数据访问对象之间到底是如何分工的？为什么每一层都需要有明确的边界？

这些问题往往横跨了多个知识领域，需要我们建立起系统级的视角。

---

## 教学路径：问题驱动与模型演进

本书采用**问题驱动**的教学方式：

$$\text{初始需求} \to \text{直觉方案} \to \text{规模扩张 / 条件变化} \to \text{旧方案面临瓶颈} \to \text{提炼核心矛盾} \to \text{引入新抽象} \to \text{建立心智模型}$$

我们不会在一开始就罗列所有抽象概念与设计规范，而是从最基础的代码形态出发，随着业务规模的扩大，亲身体验数据错位、状态失控与边界不清所带来的维护代价。

当旧方案的局限性充分暴露时，新的抽象概念（如封装、组件、范式、事务）就会成为解决具体问题的自然选择。

---

## 概念分层与边界声明

为了避免混淆抽象概念与具体实现，本书在阐述技术问题时严格区分以下知识层次：

1. **概念与数学模型（Level A）**：如对象状态、不变量、关系代数、函数依赖、事务 ACID 性质。这些思想独立于具体语言与框架。
2. **语言与协议规范（Level B）**：如 Java 语言规范（JLS）、ECMAScript 标准、HTTP 协议规范（RFC 9110）、ANSI SQL 语义。
3. **框架与 API 契约（Level C）**：如 Vue 3 组合式 API、Spring 声明式事务。
4. **具体软件实现（Level D）**：如 OpenJDK HotSpot 虚拟机的内存管理、MySQL InnoDB 存储引擎的锁实现。
5. **底层硬件与系统支持（Level E）**：如操作系统文件系统、CPU 缓存与网络介质。

本书在讲解核心机制时，首先立足于标准语义与心智模型。当需要讨论具体实现（如 HotSpot 或 InnoDB）时，会明确注明其属于特定软件的具体策略，而非通用法则。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-prologue', 'prologue', 'doc:book-hello-system', '序章: 一次点击', '# 序章: 一次点击

在一个典型的 Web 选课场景中：

学生李雷登录进入校园选课系统（Mini Campus），屏幕上显示出一张课程卡片：

```text
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
```

李雷点击了蓝色的“选课”按钮。

经过一次短暂的网络交互与后台处理，屏幕上的按钮更新为已选状态，提示文案更新为：

**“选课成功。您已成功选修本课程，当前课程剩余名额：0。”**

---

## 典型交互背后的协作链路

从用户触发点击到界面完成渲染，整个交互过程跨越了前端应用、网络通信、后端服务与数据库存储：

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户 (李雷)
    participant Browser as 浏览器 / DOM
    participant Vue as 前端组件状态 (Vue 3)
    participant Net as 网络传输 (HTTP / JSON)
    participant Ctrl as 表现层 (Controller)
    participant Svc as 业务逻辑层 (Service)
    participant Repo as 数据持久层 (Repository)
    participant DB as 数据库管理系统 (DBMS)

    User->>Browser: 1. 用户触发选课按钮点击事件
    Browser->>Vue: 2. 派发 DOM click 事件
    Note over Vue: 3. 更新前端交互状态 (设置 submitting 标志)<br/>构造请求载荷 {"courseId": 2048}
    Vue->>Net: 4. 发起 HTTP POST /api/enrollments 请求
    Note over Net: 5. 报文通过网络协议栈传输到达服务器
    Net->>Ctrl: 6. Web 服务器解析 HTTP 报文，路由至 Controller
    Note over Ctrl: 7. 从已认证上下文中获取当前学生身份 (studentId=1001)<br/>执行请求参数基本校验
    Ctrl->>Svc: 8. 调用业务逻辑层 enroll(studentId, courseId)
    Note over Svc: 9. 开启事务边界<br/>执行业务规则编排 (检查选课资格与名额)
    Svc->>Repo: 10. 请求执行选课数据更新
    Repo->>DB: 11. 执行带有条件限制的更新 SQL 与选课记录插入
    Note over DB: 12. 数据库执行并发控制与事务日志记录<br/>保证原子性与持久性
    DB-->>Repo: 13. 返回更新结果 (影响行数: 1)
    Repo-->>Svc: 14. 返回持久化操作成功
    Svc-->>Ctrl: 15. 业务处理完成，返回成功结果
    Ctrl-->>Net: 16. 构造 HTTP 201 Created 响应报文 (JSON)
    Net-->>Vue: 17. 响应报文回传浏览器，Promise 状态决议 (Resolve)
    Note over Vue: 18. 更新前端响应式选课状态数据<br/>触发视图重新计算与更新
    Vue->>Browser: 19. 更新真实 DOM 节点内容与属性
    Browser-->>User: 20. 界面呈现“选课成功”反馈
```

> **说明**：
> 上述时序图展示了一个标准且成功的端到端调用主路径。在真实工业环境中，耗时会受到网络往返、服务器排队、数据库锁竞争以及客户端渲染性能的综合影响；同时链路中还包含异常处理、重试、超时与鉴权等分支流程。

---

## 本书探索路线

在接下来的篇章中，我们将逐步拆解这条调用链路中的每一个环节：

1. **第一部分**：从最简单的单文件代码出发，探讨数据如何聚合，面向对象为什么需要封装与多态，以及后端三层架构是如何涌现的；
2. **第二部分**：探讨浏览器前端的渲染机制、原生 DOM 操作的局限，以及声明式响应式系统的运作原理；
3. **第三部分**：探讨关系模型数学基础、规范化设计、索引寻址机制以及事务与并发控制；
4. **第四部分**：探讨 HTTP 协议、API 契约、前后端通信以及不同层次对象（Entity、DTO、ViewModel）的职责划分；
5. **第五部分**：探讨信任边界输入验证、异常传播、条件更新并发控制与自动化测试；
6. **第六部分**：重走端到端请求全流程，总结系统演化中的权衡与核心规律。

现在，让我们从最朴素的代码形态开始，进入第一部分：**程序开始变大**。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-1', 'part-1', 'doc:book-hello-system', '第一部分 · 程序开始变大', '', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-01-why-architecture', '01-why-architecture', 'doc:hello-system-part-1', '第01章 如果程序只有一百行，我们为什么需要架构？', '# 第01章 如果程序只有一百行，我们为什么需要架构？

## 1. 最初情境：一个极其直接的选课程序

让我们暂时搁置浏览器渲染、网络协议与数据库系统等后续主题，退回到程序设计的最基础形态。

假设我们需要编写一个简易的控制台选课逻辑：记录当前课程容量与已选人数，并在用户触发选课时判断是否允许加入。

在最小规模下，一段最直接的 Java 代码如下：

```java
public class MiniCampus {
    public static void main(String[] args) {
        String studentName = "李雷";
        int studentId = 1001;

        String courseName = "计算机系统导论";
        int courseCapacity = 1;
        int courseEnrolled = 0;

        // 模拟用户发起选课
        System.out.println("学生 [" + studentName + "] 尝试选择课程: " + courseName);

        if (courseEnrolled < courseCapacity) {
            courseEnrolled++;
            System.out.println("选课成功！当前课程已选人数: " + courseEnrolled);
        } else {
            System.out.println("选课失败：该课程名额已满。");
        }
    }
}
```

在这段代码中：
- 逻辑线性展开，执行流清晰直观；
- 变量直接声明在局部作用域内；
- 没有任何额外的类封装、接口抽象与分层设计。

对于一个只有十余行、生命周期极短的脚本而言，这种写法是高效且合理的。此时强行引入复杂的抽象结构反而会增加不必要的心智负担。

---

## 2. 规模扩张与代码复用问题

当业务需求开始增加时，朴素方案的局限性便会逐渐显现。

假设教务系统提出以下扩张要求：
1. 增加多门课程（如《离散数学基础》）；
2. 增加多个学生（如韩梅梅）；
3. 多个学生需要分别尝试选修不同课程。

若继续沿用直接复制粘贴变量的方式：

```java
public class MiniCampusExpansion {
    public static void main(String[] args) {
        String s1_name = "李雷";
        int s1_id = 1001;

        String s2_name = "韩梅梅";
        int s2_id = 1002;

        String c1_name = "计算机系统导论";
        int c1_capacity = 100;
        int c1_enrolled = 0;

        String c2_name = "离散数学基础";
        int c2_capacity = 60;
        int c2_enrolled = 0;

        // 场景 1: 李雷选课程 1
        if (c1_enrolled < c1_capacity) {
            c1_enrolled++;
            System.out.println(s1_name + " 选课成功: " + c1_name);
        }

        // 场景 2: 韩梅梅选课程 1
        if (c1_enrolled < c1_capacity) {
            c1_enrolled++;
            System.out.println(s2_name + " 选课成功: " + c1_name);
        }

        // 场景 3: 李雷选课程 2
        if (c2_enrolled < c2_capacity) {
            c2_enrolled++;
            System.out.println(s1_name + " 选课成功: " + c2_name);
        }
    }
}
```

此时代码行数开始成倍增长。

---

## 3. 业务规则变更引发的维护挑战

假设教务规则发生调整：
> “所有课程需预留 $10\%$ 名额给重修学生，实际可选上限为 $\lfloor \text{capacity} \times 0.9 \rfloor$。”

在上述代码中，开发者必须在所有出现 `if (enrolled < capacity)` 的位置逐处手动修改为：

```java
if (c1_enrolled < (int)(c1_capacity * 0.9)) { ... }
```

如果类似逻辑分散在系统各处，手工逐一修改将面临两个主要问题：
1. **修改成本随调用点数量线性上升**；
2. **存在漏改或误改其他变量的风险**，例如将 `c1_capacity` 误写为 `c2_capacity`，编译器无法在语法层面发现此类逻辑失误。

---

## 4. 过程式函数的尝试与状态脱节

面对重复逻辑，自然的重构手段是提取出公共函数：

```java
public class ProceduralMiniCampus {
    public static boolean tryEnroll(int capacity, int enrolled) {
        int actualLimit = (int)(capacity * 0.9);
        return enrolled < actualLimit;
    }

    public static void main(String[] args) {
        int c1_capacity = 100;
        int c1_enrolled = 0;

        if (tryEnroll(c1_capacity, c1_enrolled)) {
            c1_enrolled++; // 数据变更仍在外部执行
            System.out.println("选课成功！");
        }
    }
}
```

提取函数解决了“计算规则集中”的问题。然而，**判断逻辑与数据修改依然处于分离状态**。调用方仍有可能在判断通过后，错误地修改了无关变量的值。

---

## 5. 软件复杂度的本质探讨

软件工程中对复杂度的控制，本质上是为了适应人类有限的大脑工作记忆。

当系统由大量相互独立的散落变量构成时，变量之间的依赖与状态组合可能随着系统规模的扩张呈现非线性增长。

架构设计的核心目的，**在于通过设立边界将系统划分为相对自治、内聚的子模块**，使得开发者在关注某一局部时，只需理解该局部内部有限的状态流转，从而有效控制心智负担。

---

## 6. 本章小结与思考

1. 在极小代码规模下，过程式脚本具有直接、开销小的优点；
2. 当系统规模扩大、规则频繁演化时，散落的变量与重复逻辑会导致维护风险激增；
3. 过程式函数能够复用判断规则，但尚未解决数据与操作在结构上的统一管理问题。

下一章我们将探讨：当多个变量共同描述同一个现实实体时，散落的表示方式会引发哪些具体问题？
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-02-variables-out-of-control', '02-variables-out-of-control', 'doc:hello-system-part-1', '第02章 变量为什么开始失控？', '# 第02章 变量为什么开始失控？

## 1. 隐式关联（Implicit Association）的脆弱性

在前面的示例中，我们使用前缀变量来表示一门课程的各个属性：

```java
String c1_name = "计算机系统导论";
int c1_capacity = 100;
int c1_enrolled = 0;

String c2_name = "离散数学基础";
int c2_capacity = 60;
int c2_enrolled = 0;
```

从编程语言的类型系统视角来看：
- `c1_name`、`c1_capacity` 和 `c1_enrolled` 是三个平权的独立局部变量；
- 它们之间的关联纯粹依赖程序员的命名前缀约定（`c1_`），在语言语义层面并没有建立起统一的实体约束。

这种仅靠人为约定维系的关联被称为**隐式关联（Implicit Association）**。

---

## 2. 实验验证：数据交换中的错位风险

【实验目标】观察在对散落变量执行交换操作时，疏漏某一字段可能产生的逻辑异常。

```java
public class ImplicitAssociationExperiment {
    public static void main(String[] args) {
        String c1_name = "计算机系统导论";
        int c1_capacity = 100;
        int c1_enrolled = 95;

        String c2_name = "古希腊哲学史";
        int c2_capacity = 30;
        int c2_enrolled = 5;

        // 需求：交换课程 1 与课程 2 的数据
        String tempName = c1_name;
        c1_name = c2_name;
        c2_name = tempName;

        int tempCapacity = c1_capacity;
        c1_capacity = c2_capacity;
        c2_capacity = tempCapacity;

        // 假设此处疏漏了对 enrolled 的交换操作：
        // int tempEnrolled = c1_enrolled;
        // c1_enrolled = c2_enrolled;
        // c2_enrolled = tempEnrolled;

        System.out.println("课程 1 -> " + c1_name + ", 容量: " + c1_capacity + ", 已选: " + c1_enrolled);
        System.out.println("课程 2 -> " + c2_name + ", 容量: " + c2_capacity + ", 已选: " + c2_enrolled);
    }
}
```

### 输出结果：
```text
课程 1 -> 古希腊哲学史, 容量: 30, 已选: 95
课程 2 -> 计算机系统导论, 容量: 100, 已选: 5
```

### 现象分析：
由于疏漏了 `enrolled` 字段的交换，《古希腊哲学史》在容量仅为 30 的情况下已选人数变成了 95。编译器无法识别这种逻辑层面的实体撕裂，因为每个变量的赋值语法都是完全合法的。

---

## 3. 并行数组（Parallel Arrays）与维护瓶颈

为了管理多门课程，初学者常会尝试使用并行数组：

```java
String[] names = new String[] { "计算机系统导论", "离散数学基础" };
int[] capacities = new int[] { 100, 60 };
int[] enrolleds = new int[] { 95, 10 };
```

并行数组在处理数据重排、元素删除与跨函数传参时会引入显著的同步开销：
1. **排序同步**：如果按照容量对课程进行排序，必须同时手动同步交换 `names` 和 `enrolleds` 中的对应项；
2. **元素删除**：在某一数组中移除元素并移动后续项时，所有关联数组必须严格以相同的偏移量执行平移；
3. **参数膨胀**：处理课程的函数签名需要接收所有平行数组作为入参。

---

## 4. 复合数据类型与实体身份

解决上述问题的核心思路，是在类型系统层面将属于同一个实体的属性组合在一起，形成**记录（Record）**或**复合数据类型（Composite Type）**。

在 Java 中，我们可以定义一个包含相关属性的数据类：

```java
public class CourseRecord {
    public String name;
    public int capacity;
    public int enrolled;

    public CourseRecord(String name, int capacity, int enrolled) {
        this.name = name;
        this.capacity = capacity;
        this.enrolled = enrolled;
    }
}
```

现在，整个实体的属性被组合为一个统一的引用类型：

```java
CourseRecord[] courses = new CourseRecord[] {
    new CourseRecord("计算机系统导论", 100, 95),
    new CourseRecord("古希腊哲学史", 30, 5)
};

// 交换时只需交换单个引用
CourseRecord temp = courses[0];
courses[0] = courses[1];
courses[1] = temp;
```

此时无论课程包含多少个字段，排序、交换与移动操作均以整个实体为单位进行，消除了字段间错位的可能性。

```mermaid
flowchart LR
    A0["courses[0] 引用"] --> ObjA["CourseRecord 实例
{ name: ''古希腊哲学史'', capacity: 30, enrolled: 5 }"]
    A1["courses[1] 引用"] --> ObjB["CourseRecord 实例
{ name: ''计算机系统导论'', capacity: 100, enrolled: 95 }"]
```

---

## 5. 语言实现的边界说明

将数据结构化聚合是计算机科学的通用思想，不同编程语言提供了不同的语法和实现机制：

- **C 语言**：使用 `struct` 定义连续的内存布局；
- **Java**：使用 `class` 或 Java 16+ 的 `record` 定义堆上分配的对象类型；
- **TypeScript**：使用 `interface` 或 `type` 提供静态类型检查；
- **Python**：使用 `@dataclass` 或普通的类。

---

## 6. 本章小结

1. 隐式命名约定无法在类型系统层面保证数据的一致性；
2. 复合数据类型（Record/Struct）赋予了实体明确的身份，保证了属性在移动和传递时的聚合性；
3. 纯数据结构虽然组织了数据，但所有字段若全部公开，外部代码依然可以直接修改内部状态。这引出了下一章的主题：数据与行为的内聚。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-03-cohesion-and-objects', '03-cohesion-and-objects', 'doc:hello-system-part-1', '第03章 为什么数据和操作数据的代码应该靠近？', '# 第03章 为什么数据和操作数据的代码应该靠近？

## 1. 贫血数据结构的维护挑战

在上一章中，我们将课程数据聚合为了 `CourseRecord`。

如果该数据类的所有字段依然是公开的（`public`），并且业务操作由散落在外部的各类函数完成，这种结构在领域建模中常被称为**贫血模型（Anemic Model）**。

当项目由多位开发者共同维护时，散落的外部修改可能带来状态不一致：
- 选课模块可能进行了容量检查：`if (c.enrolled < c.capacity) c.enrolled++;`
- 退课模块可能遗漏了下限检查：直接执行 `c.enrolled--;`，导致在已选人数为 0 时产生负数；
- 批量导入模块可能直接进行累加：`c.enrolled += count;`，绕过了容量上限。

```mermaid
flowchart LR
    A["模块 A: 编写了上限校验"] -->|直接修改| Target["CourseRecord.enrolled 字段"]
    B["模块 B: 遗漏了下限校验"] -->|直接修改| Target
    C["模块 C: 绕过了规则直接累加"] -->|直接修改| Target
```

---

## 2. 内聚性（Cohesion）与自治实体

为了降低外部代码误操作的风险，软件设计中提出了**高内聚（High Cohesion）**原则：

> **将相关的数据与操作该数据的规则集中在同一边界之内。**

通过将数据设置为私有，仅通过受控的方法暴露状态变更接口，对象能够主动维护自身的状态合法性：

```java
public class Course {
    private final String name;
    private final int capacity;
    private int enrolled;

    public Course(String name, int capacity) {
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("课程名称不可为空");
        }
        if (capacity <= 0) {
            throw new IllegalArgumentException("课程容量必须大于 0");
        }
        this.name = name;
        this.capacity = capacity;
        this.enrolled = 0;
    }

    // 受控的状态变更入口
    public boolean enroll() {
        if (this.enrolled >= this.capacity) {
            return false;
        }
        this.enrolled++;
        return true;
    }

    public boolean drop() {
        if (this.enrolled <= 0) {
            return false;
        }
        this.enrolled--;
        return true;
    }

    public String getName() { return name; }
    public int getCapacity() { return capacity; }
    public int getEnrolled() { return enrolled; }
}
```

---

## 3. 面向对象之外的实现范式

需要强调的是，**数据与操作的内聚并不局限于面向对象编程**：
- **过程式语言中的抽象数据类型（ADT）**：例如在 C 语言中，可以通过在头文件中声明不透明指针（Opaque Pointer，如 `typedef struct Course Course;`），并只提供操作函数（如 `Course_enroll(Course* c)`）来实现数据隐藏与状态保护；
- **函数式编程（FP）**：通过不可变数据结构与纯函数，每次状态跃迁产生新的数据快照：$State_{new} = f(State_{old}, Action)$，从模型上避免原位篡改；
- **模块化机制**：许多现代语言（如 Rust、Go）通过包/模块级可见性控制来实现类似的数据保护。

本书沿着面向对象路线展开，是因为在许多主流企业级开发体系中，类与对象是表达领域概念的常见载体。

---

## 4. 本章小结

1. 仅仅将数据聚合成结构体，若不限制访问权限，仍难以防止非法状态变更；
2. 面向对象通过将字段私有化、提供守卫方法，使对象成为负责自身状态一致性的自治单元；
3. 数据与行为内聚是通用的软件工程原则，在不同编程范式中有不同的实现方式。
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-04-class-and-object-mental-model', '04-class-and-object-mental-model', 'doc:hello-system-part-1', '第04章 类不是“对象的模板”这么简单', '# 第04章 类不是“对象的模板”这么简单

## 1. 区分概念模型与运行期表示

在初学面向对象时，“类是图纸，对象是房子”这一比喻有助于建立抽象与具体的直觉。

但在深入理解系统运行时，需要进一步理清类型定义与实例数据在内存中的分工：
- **类定义**：包含了字段规格、方法字节码指令与元数据信息；
- **对象实例**：保存了属于该实例特有的字段取值以及指向其类型元数据的关联。

无论创建多少个 `Course` 实例，方法的指令代码在进程中通常只有一份共享副本，而每个实例在堆中分配独立的空间存放各自的属性值。

```mermaid
flowchart LR
    subgraph ClassMetadata ["类型元数据 (共享区)"]
        Klass["Course 类信息
- 方法字节码: enroll(), drop()
- 字段描述表"]
    end

    subgraph HeapInstances ["堆内存实例数据"]
        Obj1["Course 实例 1
{ name: ''CS-101'', capacity: 100, enrolled: 1 }"]
        Obj2["Course 实例 2
{ name: ''MATH-201'', capacity: 60, enrolled: 0 }"]
    end

    Obj1 -.->|类型关联| Klass
    Obj2 -.->|类型关联| Klass
```

---

## 2. 方法调用的语义与隐式参数 `this`

当执行 `c1.enroll()` 时，方法是如何知道该修改 `c1` 还是 `c2` 的？

在面向对象语言语义中，实例方法调用在逻辑上等价于将当前操作的目标对象作为**第一个参数**传入方法：

$$\text{enroll}(c1)$$

在方法体内部，这个隐式参数即为 `this`（在 Python 中被显式写作 `self`）。方法通过 `this` 访问并修改当前实例的具体字段。

---

## 3. 规范与实现的边界说明

需要说明的是：
- **Java 虚拟机规范（JVMS）** 描述的是虚拟机的抽象执行模型，并不强制规定具体的物理内存布局、对象头格式或栈帧具体排布；
- 像 **OpenJDK HotSpot** 这样的具体 JVM 实现，会使用特定的对象头结构（如 Mark Word、Klass Pointer）以及 JIT 编译器优化（如方法内联、逃逸分析与标量替换）；
- 开发者应当首先理解语言的类型系统与语义规范，具体 JVM 实现细节属于下层技术选择。

---

## 4. 本章小结

1. 类承载了行为逻辑与类型元信息，对象承载了具体的实例状态；
2. 实例方法通过隐式传递的 `this` 引用定位并修改目标对象的数据；
3. 理解语义模型比记忆特定运行时的底层字节排布更为根本。
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-05-encapsulation-and-invariants', '05-encapsulation-and-invariants', 'doc:hello-system-part-1', '第05章 对象为什么应该保护自己的状态？', '# 第05章 对象为什么应该保护自己的状态？

## 1. 封装的本质：捍卫不变量（Invariants）

在面向对象教学中，常见的误区是将封装等同于“将字段声明为 `private`，然后提供一整套 `getter` 和 `setter`”。

如果直接提供 `setEnrolled(int n)`，外部依然可以直接传入负数或超过容量的值，封装的效果便荡然无存。

#### 不变量（Invariant）定义：
> **不变量**是指对象在整个生命周期内，处于任何可观察的稳定状态时都必须恒为真的业务谓词。

在 `Course` 实体中，核心不变量包括：
$$0 \le \text{enrolled} \le \text{capacity}$$
$$\text{capacity} > 0$$

---

## 2. 状态保护的双重边界

为了维护不变量，对象需要在两个阶段建立校验：

1. **构造阶段（Creation Validation）**：构造函数必须拒绝不合法的初始参数，确保对象在被创建的那一刻就处于合法状态；
2. **状态跃迁阶段（State Transition Validation）**：只暴露有明确业务语义的方法（如 `enroll()`, `drop()`），在方法内部执行条件判断，拒绝会导致不变量破裂的请求。

```mermaid
stateDiagram-v2
    [*] --> 合法初始状态: 构造函数校验 (capacity > 0)
    合法初始状态 --> 选课成功状态: enroll() [enrolled + 1 <= capacity]
    选课成功状态 --> 退课成功状态: drop() [enrolled - 1 >= 0]
    选课成功状态 --> 保持原状_拒绝变更: enroll() [名额已满]
```

---

## 3. 本章小结

1. 封装的核心目的在于保护业务不变量，而非单纯的形式化语法修饰；
2. 消除破坏不变量的公开 setter，将状态变更收敛到具有业务语义的方法中；
3. 对象在生命周期的每一个稳定状态下都必须维持其内部一致性。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-06-lifecycle-and-references', '06-lifecycle-and-references', 'doc:hello-system-part-1', '第06章 一个对象是怎样出生和死亡的？', '# 第06章 一个对象是怎样出生和死亡的？

## 1. 作用域与生命周期的区分

在理解对象的生命周期时，必须区分两个基本概念：
- **变量的作用域（Scope）**：源码中能够通过变量名访问该引用的代码范围（例如方法体内部）；
- **对象的生命周期（Lifetime）**：堆上分配的对象从被创建到占用的内存被回收的整个时间跨度。

当方法执行结束、局部变量退出作用域时，它所引用的堆对象并不一定会立即消失。只要系统中仍有其他活跃的引用指向该对象，它就依然存活。

---

## 2. 可达性分析（Reachability Analysis）

在具有自动垃圾回收机制的语言（如 Java、Go、JavaScript）中，对象的回收通常基于**可达性分析算法**：

1. 系统定义一组 **GC Roots**（如当前线程执行栈中的局部变量、静态变量等）；
2. 从 GC Roots 出发，顺着引用链遍历所有可到达的对象；
3. 无法从任何 GC Root 遍历到的孤立对象（即使它们之间存在循环引用），将被标记为可回收对象。

```mermaid
flowchart TD
    subgraph Roots ["GC Roots (活跃调用栈引用)"]
        R1["局部变量 c1"]
    end

    subgraph ReachableObj ["可达对象 (存活)"]
        O1["Course 实例 (CS-101)"]
    end

    subgraph UnreachableObj ["不可达对象群 (待回收)"]
        O2["Course 实例 (旧课程 A)"]
        O3["Student 实例 (临时对象 B)"]
        O2 <-->|彼此循环引用，但脱离 Root| O3
    end

    R1 --> O1
```

---

## 3. 内存管理范式对比

- **垃圾回收（GC）**：运行时自动追踪引用关系，降低了手动释放内存导致悬垂指针（Dangling Pointer）或双重释放（Double Free）的风险；
- **RAII 与显式所有权**：在 C++ 或 Rust 中，对象的销毁与作用域或所有权严格绑定，在离开作用域时由析构函数确定性释放，避免了垃圾回收停顿。

---

## 4. 本章小结

1. 引用变量是访问对象的句柄，对象的生存取决于是否存在从活跃根节点出发的可达路径；
2. 垃圾回收机制通过可达性分析处理不再使用的对象；
3. 了解生命周期机制有助于避免意外保留长生命周期引用而导致的内存占用问题。
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-07-object-collaboration', '07-object-collaboration', 'doc:hello-system-part-1', '第07章 程序里的对象怎样彼此认识？', '# 第07章 程序里的对象怎样彼此认识？

## 1. 对象关系的层次：拥有与使用

在面向对象系统中，对象之间最主要的协作形式包括：

1. **关联 / 组合（has-a）**：一个对象将另一个对象作为自身的属性长期持有；
2. **依赖（uses-a）**：一个对象在方法执行过程中，通过参数传入或局部变量临时使用另一个对象。

```mermaid
classDiagram
    class Student {
        -int id
        -String name
        -List~Course~ enrolledCourses
        +enrollCourse(Course course) boolean
        +getEnrolledCourses() List~Course~
    }

    class Course {
        -String name
        -int capacity
        -int enrolled
        +enroll() boolean
        +drop() boolean
    }

    Student "1" o-- "0..*" Course : has-a (持有已选课程列表)
    Student ..> Course : uses-a (方法参数临时协作)
```

---

## 2. Mini Campus 实体协作与职责分配

在选课场景中，`Student` 与 `Course` 各自维护不同的业务不变量：
- **`Student` 的职责**：维护学生的个人选课清单，保证“同一学生不重复选修同一门课”；
- **`Course` 的职责**：维护课程自身的容量约束，保证“总选课人数不超过容量上限”。

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Student {
    private final int id;
    private final String name;
    private final List<Course> enrolledCourses;

    public Student(int id, String name) {
        if (id <= 0 || name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("非法学生信息");
        }
        this.id = id;
        this.name = name;
        this.enrolledCourses = new ArrayList<>();
    }

    public boolean enrollCourse(Course course) {
        if (course == null) return false;

        // 1. 学生自身校验不变量：防重复选课
        if (this.enrolledCourses.contains(course)) {
            return false;
        }

        // 2. 委托 Course 校验其自身不变量：防超卖
        boolean success = course.enroll();
        if (success) {
            this.enrolledCourses.add(course);
            return true;
        }
        return false;
    }

    // 防御性封装：返回不可修改视图，避免外部代码直接修改内部集合
    public List<Course> getEnrolledCourses() {
        return Collections.unmodifiableList(this.enrolledCourses);
    }

    public int getId() { return id; }
    public String getName() { return name; }
}
```

---

## 3. 本章小结

1. 对象通过属性持有（has-a）与参数依赖（uses-a）建立协作；
2. 职责应当分配给拥有相关信息的对象，避免出现单个对象越权管理所有规则的情况；
3. 在暴露集合属性时，应注意通过不可变包装或防御性复制保护内部状态。
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-08-when-inheritance-is-valid', '08-when-inheritance-is-valid', 'doc:hello-system-part-1', '第08章 什么时候继承是合理的？', '# 第08章 什么时候继承是合理的？

## 1. 继承的适用条件与常见误区

继承是面向对象中常被误用的机制之一。常见的错误出发点是为了单纯的代码复用而强行继承。

例如：因为“教室（Classroom）”也有容纳人数（capacity）和当前人数（enrolled），便让 `Classroom` 继承 `Course`。这会导致概念混乱，使得系统允许出现“学生选修了一间教室”这种违背业务逻辑的操作。

#### 里氏替换原则（LSP, Liskov Substitution Principle）：
> **如果对于每一个类型为 $S$ 的对象 $o_1$，都存在类型为 $T$ 的对象 $o_2$，使得以 $T$ 定义的所有程序 $P$ 在用 $o_1$ 替换 $o_2$ 时，程序 $P$ 的行为保持不变，那么类型 $S$ 是类型 $T$ 的子类型。**

---

## 2. 合理的继承示例：实验课程

在 Mini Campus 中，**实验课（LabCourse）** 是一种符合 is-a 关系的子类型：
- 实验课在行为与语义上完全是一种课程；
- 实验课在继承基础课程属性的同时，增加了实验机时与助教信息。

```java
public class LabCourse extends Course {
    private final String tutorName;
    private final int labHours;

    public LabCourse(String name, int capacity, String tutorName, int labHours) {
        super(name, capacity);
        if (tutorName == null || labHours <= 0) {
            throw new IllegalArgumentException("实验课参数非法");
        }
        this.tutorName = tutorName;
        this.labHours = labHours;
    }

    public String getTutorName() { return tutorName; }
    public int getLabHours() { return labHours; }
}
```

---

## 3. 组合优于继承的设计经验

在软件工程实践中，“**组合优于继承（Composition over Inheritance）**”是一条广为人知的经验法则：
- 继承属于**白盒复用**，父类的内部实现细节往往对子类可见，父类修改可能对子类产生意料之外的影响；
- 组合属于**黑盒复用**，通过引用接口或对象来协作，耦合度更低，也更易于在运行时动态替换。

---

## 4. 本章小结

1. 继承应严格满足 is-a 关系与里氏替换原则，不应单纯为了复用局部字段而继承；
2. 继承建立了较强的耦合关系，在面对复杂或多变的关系时，应优先考虑使用对象组合。
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-09-polymorphism-and-dynamic-dispatch', '09-polymorphism-and-dynamic-dispatch', 'doc:hello-system-part-1', '第09章 为什么同一句代码能够产生不同的行为？', '# 第09章 为什么同一句代码能够产生不同的行为？

## 1. 类型分支语句的扩展瓶颈

假设选课成功后，系统需要根据不同课程类型打印对应的指引信息。如果不使用多态，代码通常会充斥着类型判断：

```java
public static void printInstruction(Course course) {
    if (course instanceof LabCourse) {
        LabCourse lab = (LabCourse) course;
        System.out.println("【实验课】请联系助教: " + lab.getTutorName());
    } else if (course instanceof OnlineCourse) {
        OnlineCourse online = (OnlineCourse) course;
        System.out.println("【网课】请登录平台: " + online.getUrl());
    } else {
        System.out.println("【讲授课】请前往指定大教室听课。");
    }
}
```

每当新增一种课程类型时，所有包含类型判断分支的代码都需要被找到并修改。

---

## 2. 多态与动态分派（Dynamic Dispatch）

**子类型多态（Subtype Polymorphism）** 允许调用方统一面向父类型或接口编程，具体的行为由实际接收消息的运行时对象决定：

```java
public class Course {
    // 基础定义略
    public void printInstruction() {
        System.out.println("【讲授课】请前往指定大教室听课。");
    }
}

public class LabCourse extends Course {
    private final String tutorName;
    public LabCourse(String name, int capacity, String tutorName) {
        super(name, capacity);
        this.tutorName = tutorName;
    }

    @Override
    public void printInstruction() {
        System.out.println("【实验课】请联系助教: " + this.tutorName);
    }
}
```

调用方代码精简为：

```java
public static void notifyStudent(Course course) {
    course.printInstruction(); // 运行时根据实际对象动态分派
}
```

---

## 3. 动态分派的一种经典实现：虚方法表（vtable）

【说明：以下讨论的是许多编译器和虚拟机（如 C++ 编译器、JVM）中常见的一种实现机制，用于辅助理解运行期寻址，而非语言规范的唯一约束。】

```mermaid
flowchart LR
    subgraph Instances ["堆上的具体实例"]
        ObjA["LabCourse 实例
[类型元数据指针]"]
        ObjB["Course 实例
[类型元数据指针]"]
    end

    subgraph Tables ["虚方法表 (vtable) 示意"]
        VT_Lab["LabCourse vtable
[Slot 0] printInstruction -> LabCourse.printInstruction()"]
        VT_Base["Course vtable
[Slot 0] printInstruction -> Course.printInstruction()"]
    end

    ObjA -.-> VT_Lab
    ObjB -.-> VT_Base
```

1. 编译器在编译阶段为每个包含虚方法的类生成一张方法表，子类重写的方法会覆盖对应槽位中的函数指针；
2. 当执行方法调用指令时，运行时根据对象的实际类型指针定位到对应的虚方法表，并从固定槽位获取目标方法入口执行。

---

## 4. 本章小结

1. 多态将“做什么”与“怎么做”解耦，调用方无需感知具体的子类分支；
2. 动态分派是在运行时决定方法实现的语义机制，虚方法表（vtable）是其经典实现手段之一。
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-10-interfaces-and-dependency-inversion', '10-interfaces-and-dependency-inversion', 'doc:hello-system-part-1', '第10章 接口真正隔开的是什么？', '# 第10章 接口真正隔开的是什么？

## 1. 硬编码依赖带来的耦合痛点

当选课成功后，系统需要发送即时通知。如果业务逻辑直接硬编码具体实现：

```java
public class EnrollmentCoordinator {
    private AliyunSmsSender smsSender = new AliyunSmsSender(); // 直接依赖具体类
}
```

这会导致：
- 当更换服务提供商或切换为邮件通知时，核心选课代码必须修改；
- 在运行单元测试时，无法轻松替换为不产生真实通信开销的测试桩（Mock）。

---

## 2. 接口作为纯粹的契约

在面向对象设计中，**接口（Interface）** 定义了一组行为契约，声明“做什么（What）”而不约束“如何做（How）”。

> **语言特性说明**：
> 在抽象概念上，接口表达纯粹的契约；在具体语言语法上，例如 Java 8 之后引入了 `default` 和 `static` 方法，Java 9 引入了 `private` 方法，用于在不破坏既有实现的前提下提供契约扩展与代码复用。

```java
public interface NotificationSender {
    void sendNotification(String target, String content);
}
```

---

## 3. 依赖倒置原则（DIP）与依赖注入（DI）

必须准确区分以下两个概念：

- **依赖倒置原则（DIP, Dependency Inversion Principle）**：一条设计原则。高层模块不应该依赖低层模块，两者都应该依赖抽象；抽象不应该依赖细节，细节应该依赖抽象。
- **依赖注入（DI, Dependency Injection）**：一种实现依赖解耦的结构型手段。通过构造函数、Setter 方法或框架容器将具体依赖传递给对象，而不是由对象内部自行 `new` 创建。

```mermaid
flowchart TD
    subgraph DIP ["依赖倒置原则 (DIP)"]
        Coordinator["核心选课业务 (高层模块)"] -->|依赖抽象| Interface["NotificationSender 接口"]
        Aliyun["AliyunSmsSender (低层模块)"] -.->|实现契约| Interface
        Email["EmailSender (低层模块)"] -.->|实现契约| Interface
        Mock["MockNotificationSender (测试桩)"] -.->|实现契约| Interface
    end
```

```java
public class EnrollmentCoordinator {
    private final NotificationSender notifier;

    // 通过构造函数进行依赖注入 (DI)
    public EnrollmentCoordinator(NotificationSender notifier) {
        this.notifier = notifier;
    }

    public void process(Student student, Course course) {
        boolean ok = student.enrollCourse(course);
        if (ok) {
            notifier.sendNotification(student.getName(), "选课成功: " + course.getName());
        }
    }
}
```

---

## 4. 本章小结

1. 接口建立了模块之间的抽象契约，隔离了易变实现对核心业务的影响；
2. 依赖倒置原则（DIP）强调面向抽象编程，依赖注入（DI）是装配具体实现的有效手段。
', 'public', '2251213429@qq.com', 10, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-11-break-god-class', '11-break-god-class', 'doc:hello-system-part-1', '第11章 为什么一个类最终又会变成几十个类？', '# 第11章 为什么一个类最终又会变成几十个类？

## 1. 上帝类（God Class）的产生与危害

随着功能的累加，如果开发者习惯性地将所有逻辑追加到一个庞大的管理类（如 `CampusManager`）中，该类将逐渐演化为涵盖参数校验、业务编排、SQL 访问与通知发送的“上帝类”。

上帝类会带来以下维护问题：
- **变更冲突**：不同职责的修改均集中在同一个文件，增加代码合并冲突的概率；
- **理解困难**：单文件行数庞大，内部逻辑错综复杂；
- **测试困难**：无法对单个业务规则进行隔离测试。

---

## 2. 单一职责原则（SRP）：寻找变化的轴线

#### 单一职责原则（Single Responsibility Principle）：
> **一个模块应该有且仅有一个引起它变化的原因。**

我们将臃肿的管理类解构为关注点各异的独立模块：

```mermaid
flowchart LR
    Ctrl["CourseController
关注网络传输与参数转换"] --> Svc["EnrollmentService
关注业务规则编排"]
    Svc --> Repo["CourseRepository
关注数据持久化存取"]
    Svc --> Notify["NotificationSender
关注外部消息发送"]
```

- 当协议格式或 URL 路由改变时，只需修改 Controller；
- 当选课业务规则改变时，只需修改 Service；
- 当存储介质或 SQL 改变时，只需修改 Repository。

---

## 3. 本章小结

1. 上帝类承担了过多的职责，违背了单一职责原则；
2. 按照变化的原因和关注点拆分模块，有助于提高系统的可维护性与可测试性。
', 'public', '2251213429@qq.com', 11, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-12-emergence-of-layers', '12-emergence-of-layers', 'doc:hello-system-part-1', '第12章 软件第一次出现“层”', '# 第12章 软件第一次出现“层”

## 1. 经典三层架构的职责分工

在现代 Web 后端开发中，**Controller-Service-Repository** 是一种广泛使用的教学与工业参考分层方案：

```mermaid
sequenceDiagram
    autonumber
    actor Caller as 外部调用方 (HTTP 客户端)
    participant Ctrl as 1. Controller 表现层
    participant Svc as 2. Service 业务逻辑层
    participant Repo as 3. Repository 数据持久层
    participant DB as 存储介质 / 数据库

    Caller->>Ctrl: 发起选课请求 (传入参数)
    Note over Ctrl: 负责: 协议解析、参数清洗<br/>不承担核心业务规则
    Ctrl->>Svc: 调用业务服务 enroll(student, courseId)
    Note over Svc: 负责: 业务不变量编排、事务边界
    Svc->>Repo: 查询课程实体 findById(courseId)
    Repo->>DB: 执行数据查询
    DB-->>Repo: 返回记录
    Repo-->>Svc: 组装为领域实体 Course
    Note over Svc: 执行实体选课状态跃迁
    Svc->>Repo: 保存更新 save(course)
    Repo->>DB: 执行持久化操作
    Svc-->>Ctrl: 返回操作结果
    Ctrl-->>Caller: 封装响应数据 (如 JSON)
```

---

## 2. 层次职责矩阵

| 层次 | 核心职责 | 它应该关注什么 | 它应该避免什么 |
| :--- | :--- | :--- | :--- |
| **表现层 (Controller)** | 协议转换、参数提取、基础格式校验、响应包装 | HTTP 语义、路由匹配、状态码 | 直接执行底层 SQL、包含核心业务规则 |
| **业务逻辑层 (Service)** | 业务用例编排、跨实体协作、事务边界管理 | 完整的业务规则与执行流程 | 直接处理底层 HTTP 会话、硬编码特定数据库细节 |
| **数据持久层 (Repository)** | 屏蔽底层存储细节，提供集合风格的数据存取接口 | 数据查询、持久化映射、缓存交互 | 参与上层业务规则决策 |

---

## 3. Mini Campus 三层结构的最小实现

```java
import java.util.HashMap;
import java.util.Map;

// 1. Repository: 提供存取抽象
public class InMemoryCourseRepository {
    private final Map<Integer, Course> store = new HashMap<>();

    public Course findById(int id) { return store.get(id); }
    public void save(Course course) { store.put(course.getId(), course); }
}

// 2. Service: 业务编排
public class EnrollmentService {
    private final InMemoryCourseRepository courseRepo;
    private final NotificationSender notifier;

    public EnrollmentService(InMemoryCourseRepository courseRepo, NotificationSender notifier) {
        this.courseRepo = courseRepo;
        this.notifier = notifier;
    }

    public boolean enroll(Student student, int courseId) {
        Course course = courseRepo.findById(courseId);
        if (course == null) return false;

        boolean success = student.enrollCourse(course);
        if (success) {
            courseRepo.save(course);
            notifier.sendNotification(student.getName(), "选课成功: " + course.getName());
            return true;
        }
        return false;
    }
}

// 3. Controller: 协议与参数处理
public class CourseController {
    private final EnrollmentService enrollmentService;

    public CourseController(EnrollmentService service) {
        this.enrollmentService = service;
    }

    public String handleEnrollRequest(Student student, String courseIdStr) {
        try {
            int courseId = Integer.parseInt(courseIdStr);
            boolean ok = enrollmentService.enroll(student, courseId);
            return ok ? "{"status": 200, "msg": "选课成功"}" : "{"status": 409, "msg": "选课失败"}";
        } catch (NumberFormatException e) {
            return "{"status": 400, "msg": "参数格式非法"}";
        }
    }
}
```

---

## 4. 第一部分总结

至此，我们完成了后端单机程序从散落变量到面向对象封装、再到三层分层设计的演进。

接下来，我们将视角转移到浏览器端，进入第二部分：**页面开始变复杂**。
', 'public', '2251213429@qq.com', 12, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-2', 'part-2', 'doc:book-hello-system', '第二部分 · 页面开始变复杂', '', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-13-html-css-dom', '13-html-css-dom', 'doc:hello-system-part-2', '第13章 网页最开始根本不需要框架', '# 第13章 网页最开始根本不需要框架

## 1. 最初情境：Web 标准三剑客

在现代前端框架普及之前，Web 应用依靠三项基础技术构建：
- **HTML（结构）**：使用标签定义文档的内容层级与语义；
- **CSS（表现）**：定义元素的布局、颜色与字体等视觉样式；
- **JavaScript（行为）**：通过浏览器提供的 API 实现事件监听与动态交互。

早期 Mini Campus 选课系统的一个最小页面如下：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Mini Campus 选课系统</title>
    <style>
        .card { border: 1px solid #ddd; padding: 16px; width: 280px; border-radius: 6px; }
        .disabled { color: #888; }
    </style>
</head>
<body>
    <div class="card">
        <h2>计算机系统导论</h2>
        <p>剩余名额: <span id="remaining-count">1</span></p>
        <button id="enroll-btn">选课</button>
    </div>

    <script>
        let remaining = 1;
        const btn = document.getElementById(''enroll-btn'');
        const countSpan = document.getElementById(''remaining-count'');

        btn.addEventListener(''click'', function() {
            if (remaining > 0) {
                remaining--;
                countSpan.innerText = remaining;
                if (remaining === 0) {
                    btn.disabled = true;
                    btn.innerText = ''名额已满'';
                }
            }
        });
    </script>
</body>
</html>
```

---

## 2. 浏览器的渲染流程概览

当浏览器加载 HTML 时，底层渲染引擎大致经历以下阶段：

```mermaid
flowchart TD
    HTML["HTML 字符流"] --> DOM["DOM 树 (Document Object Model)"]
    CSS["CSS 字符流"] --> CSSOM["CSSOM 树 (CSS Object Model)"]
    DOM --> RenderTree["渲染树 (Render Tree)"]
    CSSOM --> RenderTree
    RenderTree --> Layout["布局排版 (Layout / Reflow)
计算盒模型的几何坐标与尺寸"]
    Layout --> Paint["绘制 (Paint)
生成绘制指令与图层"]
    Paint --> Composite["图层合成 (Compositing)
交付 GPU 最终显示"]
```

> **注意**：
> 现代浏览器的渲染流水线并非严格单向的一次性过程，而是随着异步资源加载、脚本执行与样式变化动态交替进行的。

在简单交互场景下，原生 HTML/CSS/JS 具有零构建配置、无运行时框架体积开销的显著优势。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-14-dom-manipulation-mess', '14-dom-manipulation-mess', 'doc:hello-system-part-2', '第14章 直接操作DOM为什么迟早会出问题？', '# 第14章 直接操作DOM为什么迟早会出问题？

## 1. 复杂交互下的命令式 DOM 联动

随着功能扩展，选课页面增加了多个相互关联的 UI 区域：
1. 课程卡片中的剩余名额与按钮状态；
2. 顶部导航栏中的已选课程数量徽章；
3. 右侧侧边栏中的已选课程清单与总学分统计；
4. 筛选搜索框。

如果使用原生 JavaScript 采用命令式（Imperative）方式逐一更新 DOM：

```javascript
function handleEnrollSuccess(course) {
    // 1. 手动修改卡片内文本
    const countEl = document.querySelector(''#card-'' + course.id + '' .count'');
    countEl.innerText = parseInt(countEl.innerText) - 1;

    // 2. 手动修改按钮
    const btn = document.querySelector(''#card-'' + course.id + '' button'');
    btn.disabled = true;
    btn.innerText = ''已选修'';

    // 3. 手动修改顶部徽章
    const badge = document.getElementById(''enrolled-badge'');
    badge.innerText = parseInt(badge.innerText) + 1;

    // 4. 手动向侧边栏追加 DOM 节点
    const list = document.getElementById(''sidebar-list'');
    const item = document.createElement(''li'');
    item.id = ''sidebar-item-'' + course.id;
    item.innerText = course.name;
    list.appendChild(item);

    // 5. 手动更新总学分
    const creditEl = document.getElementById(''total-credits'');
    creditEl.innerText = parseInt(creditEl.innerText) + course.credits;
}
```

---

## 2. 核心问题：状态分散在 DOM 中

```mermaid
flowchart LR
    Event["选课事件触发"] -->|命令式逐一修改| DOM1["卡片剩余数字"]
    Event -->|命令式逐一修改| DOM2["卡片按钮 disabled 属性"]
    Event -->|命令式逐一修改| DOM3["顶部徽章计数"]
    Event -->|命令式逐一修改| DOM4["侧边栏 li 列表"]
    Event -->|命令式逐一修改| DOM5["总学分展示元素"]
```

在命令式编程模式下：
1. **状态被隐式保存在 DOM 节点的文本与属性中**，缺乏单一明确的数据来源；
2. **多处修改容易产生不一致**：如果在退课或搜索重置逻辑中漏改了某一个 DOM 节点，界面各处的显示将产生冲突；
3. **事件与 DOM 呈现高度耦合的网状依赖**，维护成本随交互复杂度快速上升。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-15-state-driven-ui', '15-state-driven-ui', 'doc:hello-system-part-2', '第15章 究竟应该让页面保存数据，还是让数据决定页面？', '# 第15章 究竟应该让页面保存数据，还是让数据决定页面？

## 1. 范式转换：声明式（Declarative）编程

为了解决命令式 DOM 操作的维护困境，现代前端引入了**声明式 UI（Declarative UI）**范式：

> **开发者不再手动编写“如何操作 DOM”的每一步指令，而是维护一份纯内存状态（State），并声明“在特定状态下，UI 应该呈现出什么结构”。**

#### 核心抽象公式：
$$UI = f(State)$$

```mermaid
flowchart LR
    State["内存状态 State
{ courses: [...], enrolledIds: [101] }"] -->|声明式映射 f(State)| UI["渲染后的真实页面 UI"]
```

---

## 2. 声明式 UI 的实现机制说明

需要说明的是，**虚拟 DOM（Virtual DOM）只是实现声明式 UI 的常见手段之一，而非唯一途径**：
- **React / Vue**：通过在内存中比对新旧虚拟 DOM 树（Diffing），计算出最小更新补丁（Patch）并批量应用到真实 DOM；
- **Svelte / SolidJS**：通过编译期分析或细粒度响应式订阅，直接在状态改变时精准更新对应的真实 DOM 节点，不依赖虚拟 DOM。

无论底层采用哪种技术，**以状态为中心（State-Driven）的心智模型**是现代前端开发的共同基石。
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-16-vue-reactivity-under-the-hood', '16-vue-reactivity-under-the-hood', 'doc:hello-system-part-2', '第16章 “数据变了，页面自己变”到底是什么意思？', '# 第16章 “数据变了，页面自己变”到底是什么意思？

## 1. Vue 3 响应式的核心机制

Vue 3 的响应式系统围绕三个核心行为展开：
1. **拦截属性访问与修改**：
   - `reactive()` 主要使用 ES6 `Proxy` 拦截对象的读取（get）与写入（set）；
   - `ref()` 使用带有 `.value` 访问器属性（getter/setter）的 RefImpl 对象；
2. **依赖收集（Track）**：在执行副作用函数（如组件渲染函数）期间，若读取了响应式属性，系统将当前活跃的副作用函数（Effect）记录为该属性的依赖；
3. **依赖触发（Trigger）**：当响应式属性被修改时，系统查找并重新执行该属性收集到的所有副作用函数。

```mermaid
flowchart TD
    subgraph Read ["读取属性 (Track 阶段)"]
        Render["渲染函数 / 副作用执行"] -->|读取 state.enrolled| ProxyGet["Proxy get() / Ref getter"]
        ProxyGet --> Track["track: 记录当前 Effect 到依赖集合"]
    end

    subgraph Write ["修改属性 (Trigger 阶段)"]
        UserAction["用户操作: state.enrolled++"] --> ProxySet["Proxy set() / Ref setter"]
        ProxySet --> Trigger["trigger: 遍历执行所收集的 Effects"]
        Trigger --> ReRender["组件重新渲染 / 更新视图"]
    end
```

---

## 2. 最小响应式原理代码示例

```javascript
let activeEffect = null;
const targetMap = new WeakMap();

function track(target, key) {
    if (!activeEffect) return;
    let depsMap = targetMap.get(target);
    if (!depsMap) targetMap.set(target, (depsMap = new Map()));
    let dep = depsMap.get(key);
    if (!dep) depsMap.set(key, (dep = new Set()));
    dep.add(activeEffect);
}

function trigger(target, key) {
    const depsMap = targetMap.get(target);
    if (!depsMap) return;
    const dep = depsMap.get(key);
    if (dep) dep.forEach(effect => effect());
}

function reactive(obj) {
    return new Proxy(obj, {
        get(target, key, receiver) {
            track(target, key);
            return Reflect.get(target, key, receiver);
        },
        set(target, key, value, receiver) {
            const result = Reflect.set(target, key, value, receiver);
            trigger(target, key);
            return result;
        }
    });
}
```

---

## 3. 本章小结

1. 响应式系统通过拦截数据的读写操作，实现依赖自动收集与自动通知；
2. Vue 3 中 `reactive` 使用 `Proxy`，`ref` 使用访问器属性，其上层统一遵循 track/trigger 响应式模型。
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-17-computed-and-caching', '17-computed-and-caching', 'doc:hello-system-part-2', '第17章 computed为什么不是一个普通函数？', '# 第17章 computed为什么不是一个普通函数？

## 1. 派生状态与缓存机制

在选课系统中，已选总学分是由已选课程列表计算而来的**派生状态（Derived State）**。

如果将其写为普通方法并在模板中多次调用：
```html
<p>总学分: {{ calculateTotalCredits() }}</p>
<p>总学分: {{ calculateTotalCredits() }}</p>
```
只要组件因任何无关状态改变而重新渲染，普通方法都会被重复执行。

---

## 2. computed 的工作原理

`computed()` 创建一个具有**依赖追踪与缓存特性**的响应式引用：
1. **自动追踪依赖**：`computed` 内部自动收集其所引用的响应式数据（如 `enrolledCourses`）；
2. **基于依赖缓存**：只要所依赖的源数据未发生变化，多次访问 `computed` 属性会直接返回缓存值；
3. **惰性失效**：当源数据变化时，将缓存标记为失效，在下一次被读取时才重新计算。

```mermaid
flowchart TD
    Access["访问 computed.value"] --> CheckDirty{"依赖源数据是否发生过变更?"}
    CheckDirty -->|是| ReCalc["重新执行计算函数并更新缓存"]
    CheckDirty -->|否| ReturnCache["直接返回缓存结果 (零计算开销)"]
```

> **设计原则提示**：
> `computed` 的计算函数应当设计为纯函数，避免在其中执行异步请求或修改其他状态等副作用操作。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-18-watch-and-side-effects', '18-watch-and-side-effects', 'doc:hello-system-part-2', '第18章 watch到底应该什么时候使用？', '# 第18章 watch到底应该什么时候使用？

## 1. 纯计算与副作用（Side Effects）的区分

- **`computed`**：适用于**纯派生数据**。根据状态生成新的数据，不修改外部环境；
- **`watch` / `watchEffect`**：专门用于处理**副作用（Side Effects）**。当状态变化时，执行与外部系统的交互操作（如发起网络请求、修改 LocalStorage、手动操作 DOM 或设置定时器）。

```javascript
import { ref, watch } from ''vue'';

const selectedCourseId = ref(null);
const courseDetail = ref(null);

// 状态变化时触发异步网络请求副作用
watch(selectedCourseId, async (newId, oldId, onCleanup) => {
    if (!newId) return;

    let isCancelled = false;
    onCleanup(() => {
        isCancelled = true; // 处理并发或组件卸载时的清理逻辑
    });

    const res = await fetch(`/api/courses/${newId}`);
    const data = await res.json();
    if (!isCancelled) {
        courseDetail.value = data;
    }
});
```

---

## 2. 避免用 watch 替代 computed

初学者常会使用 `watch` 手动更新另一个 `ref` 来实现派生数据，这会增加不必要的状态管理开销并容易导致循环更新。对于纯数据推导，应优先使用 `computed`。
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-19-component-decomposition', '19-component-decomposition', 'doc:hello-system-part-2', '第19章 为什么页面最终必须被拆开？', '# 第19章 为什么页面最终必须被拆开？

## 1. 单巨石页面的维护瓶颈

当一个页面包含课程搜索、卡片网格、侧边栏、分页器与详情弹窗时，将所有模板、样式与状态都堆在单文件中会导致：
- 状态变量命名空间混杂；
- 单一功能逻辑难以独立复用与测试；
- 团队多人协作容易产生代码冲突。

---

## 2. 组件化（Component-Based Architecture）

组件化将页面拆解为由树形结构组织的独立可复用单元：

```mermaid
flowchart TD
    App["App.vue (根组件)"]
    Header["AppHeader.vue (顶部导航)"]
    CourseList["CourseListView.vue (主内容区)"]
    Card1["CourseCard.vue (课程卡片)"]
    Card2["CourseCard.vue"]
    Sidebar["EnrollmentSidebar.vue (已选侧边栏)"]

    App --> Header
    App --> CourseList
    App --> Sidebar
    CourseList --> Card1
    CourseList --> Card2
```

每个组件封装了自身的结构、样式与局部交互逻辑，通过明确的接口与外部进行数据通信。
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-20-props-events-data-flow', '20-props-events-data-flow', 'doc:hello-system-part-2', '第20章 组件之间怎样传递信息？', '# 第20章 组件之间怎样传递信息？

## 1. 单向数据流（One-Way Data Flow）模式

在父子组件通信中，**Props Down, Events Up** 是最基础且推荐的单向数据流模型：
- **Props Down**：父组件向子组件单向传递只读属性；
- **Events Up**：子组件通过触发自定义事件通知父组件发生状态变更意图。

```mermaid
flowchart TD
    Parent["父组件 (CourseListView)"]
    Child["子组件 (CourseCard)"]

    Parent -->|1. Props 传递只读数据 :course=''item''| Child
    Child -->|2. Emit 抛出事件 @enroll=''handleEnroll''| Parent
```

---

## 2. Props 的单向绑定说明

在 Vue 规范中：
- 子组件**严禁直接对接收到的 Prop 变量进行重新赋值**（如 `props.course = newObj`）；
- 若 Prop 为对象或数组，直接修改其内部嵌套属性虽然在技术上可能影响父组件，但这破坏了单向数据流的可追踪性，属于不推荐的做法。

---

## 3. 多种通信方式的适用场景

除了 Props/Emit 之外，现代前端还提供了其他通信手段：
- **provide / inject**：用于跨多层级的深层依赖传递；
- **全局状态管理（如 Pinia）**：用于跨路由、多视图共享的应用级状态；
- **组合式函数（Composables）**：用于在不同组件间复用有状态的业务逻辑。
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-21-component-lifecycle', '21-component-lifecycle', 'doc:hello-system-part-2', '第21章 组件什么时候出生？', '# 第21章 组件什么时候出生？

## 1. 组件的生命周期过程

组件从被创建到最终销毁经历多个阶段：

```mermaid
stateDiagram-v2
    [*] --> Setup: 初始化阶段 (创建响应式状态与计算属性)
    Setup --> Mounted: onMounted (DOM 节点挂载完成)
    Mounted --> Updated: onUpdated (响应式数据改变触发重新渲染)
    Mounted --> Unmounted: onUnmounted (组件销毁卸载)
    Unmounted --> [*]
```

---

## 2. 数据获取与资源清理

1. **异步数据获取时机**：
   - 可以在 `onMounted()` 中发起初始数据请求，此时 DOM 容器已就绪；
   - 在支持服务端渲染（SSR）或使用路由导航守卫的架构中，数据也可在进入组件前由数据加载层完成预获取。
2. **清理副作用防止内存泄漏**：
   - 若在组件内注册了全局事件监听（如 `window.addEventListener`）或定时器（`setInterval`），必须在 `onUnmounted()` 中进行显式解绑与清理。
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-22-spa-and-client-routing', '22-spa-and-client-routing', 'doc:hello-system-part-2', '第22章 一个网站为什么能有很多“页面”？', '# 第22章 一个网站为什么能有很多“页面”？

## 1. MPA 与 SPA 的架构差异

- **多页面应用（MPA, Multi-Page Application）**：每次页面跳转均向服务器请求全新的 HTML 文件，浏览器执行完整页面刷新；
- **单页面应用（SPA, Single-Page Application）**：初始只加载单个 HTML 入口，后续的“页面切换”由客户端 JavaScript 动态替换视图组件完成，避免了全屏刷新。

---

## 2. 客户端路由（Client-Side Routing）原理

客户端路由器（如 Vue Router）主要利用 **HTML5 History API** 实现无刷新导航：

```mermaid
flowchart LR
    UserNav["用户点击导航链接 /schedule"] --> Router["前端路由器拦截点击"]
    Router --> HistoryAPI["调用 history.pushState() 更新浏览器地址栏 (无网络刷新)"]
    Router --> ComponentSwap["根据路由配置动态渲染对应的视图组件"]
```

- `history.pushState()` 和 `history.replaceState()` 允许在不重新加载页面的前提下修改浏览器地址栏；
- 浏览器前进/后退时触发 `popstate` 事件，路由器捕获后同步更新对应的视图组件。
', 'public', '2251213429@qq.com', 10, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-23-global-state-management', '23-global-state-management', 'doc:hello-system-part-2', '第23章 状态应该放在哪里？', '# 第23章 状态应该放在哪里？

## 1. 跨层级状态共享与 Pinia

当系统中多个不具备直接父子关系的组件（如顶部用户信息与右侧购物车抽屉）都需要访问同一份数据时，若仅靠状态提升（Lifting State Up）和 Props 层层透传（Prop Drilling），会导致中间组件充斥无关参数。

**Pinia** 是 Vue 官方推荐的状态管理库，其核心心智模型包括：
- **Store**：支持按业务模块定义多个独立的 Store（如 `useUserStore`, `useCourseStore`）；
- **State**：保存全局共享的响应式数据；
- **Getters**：基于 State 的派生计算属性；
- **Actions**：包含同步或异步的业务操作方法。

```mermaid
flowchart TD
    subgraph PiniaStore ["Pinia Store (useCourseStore)"]
        State["state: { enrolledList: [] }"]
        Actions["action: enroll(courseId)"]
    end

    CompA["HeaderBadge.vue"] -->|读取已选数量| State
    CompB["CourseCard.vue"] -->|触发选课操作| Actions
```

> **架构提示**：
> Pinia 的 Store 实例与具体的 Vue 应用实例绑定，在服务端渲染（SSR）场景下会为每个请求创建独立的状态实例，避免不同用户之间的状态污染。
', 'public', '2251213429@qq.com', 11, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-24-browser-data-vs-db-data', '24-browser-data-vs-db-data', 'doc:hello-system-part-2', '第24章 浏览器里的数据不是数据库里的数据', '# 第24章 浏览器里的数据不是数据库里的数据

## 1. 数据形态的五层空间演变

在理解完整的软件系统时，开发者需要清晰认识到数据在不同层次中的存在形式：

```mermaid
flowchart LR
    L1["1. DOM 树呈现
(用户可见的视图文字)"] <--> L2["2. 浏览器 JS 内存
(响应式 Proxy / Ref 对象)"]
    L2 <-->|JSON 序列化与反序列化| L3["3. HTTP 报文内容
(网络传输字节流)"]
    L3 <-->|反序列化与映射| L4["4. 后端服务内存
(Java 领域对象 / DTO)"]
    L4 <-->|数据库引擎持久化| L5["5. 数据库存储介质
(关系表 / 索引 / 磁盘页)"]
```

- **瞬态数据（Transient Data）**：浏览器内存中的 JavaScript 变量和 DOM 结构属于瞬态数据，页面刷新或窗口关闭后即被销毁；
- **持久数据（Persistent Data）**：经过网络协议传输至后端、最终写入数据库管理系统的数据，具备事务与持久性保障。

接下来，我们将深入数据持久化的核心领域——**第三部分：数据需要一个真正的家**。
', 'public', '2251213429@qq.com', 12, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-3', 'part-3', 'doc:book-hello-system', '第三部分 · 数据需要一个真正的家', '', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-25-why-not-excel-super-table', '25-why-not-excel-super-table', 'doc:hello-system-part-3', '第25章 为什么不能把所有东西写进一个Excel一样的大表？', '# 第25章 为什么不能把所有东西写进一个Excel一样的大表？

## 1. 朴素直觉方案：非规范化宽表

在初学数据库设计时，最直观的想法往往是将所有关联信息放置在单张大宽表中：

```text
大宽表示例: mega_enrollment_sheet
┌──────┬────────┬────────┬──────────┬──────────────────┬──────────┬──────────┬──────────┐
│ 学号 │ 姓名   │ 院系   │ 课程代码 │ 课程名称         │ 任课教师 │ 教师电话 │ 教室地点 │
├──────┼────────┼────────┼──────────┼──────────────────┼──────────┼──────────┼──────────┤
│ 1001 │ 李雷   │ 计科系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │
│ 1001 │ 李雷   │ 计科系 │ CS-102   │ 离散数学基础     │ 赵教授   │ 13800002 │ 教一102  │
│ 1002 │ 韩梅梅 │ 计科系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │
└──────┴────────┴────────┴──────────┴──────────────────┴──────────┴──────────┴──────────┘
```

这种设计在数据量极少时查询直接，但随着数据修改，会引发关系数据库理论中经典的**三大操作异常**。

---

## 2. 关系设计的三大操作异常

### 1. 插入异常（Insertion Anomaly）
如果学校新开设了一门课程《人工智能前沿》，已确定任课教师与教室，但尚未开始选课（即暂无学生选修）。  
若表以“学号+课程代码”作为复合标识，在没有学生选课时，学号字段必须置为 `NULL`。而若主键约束禁止 `NULL`，**新课程在有学生选修前将无法被记录到系统中**。

### 2. 更新异常（Update Anomaly）
严教授更换了办公电话。在上述宽表中，全校有数百名学生选修该课程，严教授的电话被重复记录了数百次。  
若更新操作未能完整覆盖所有行，将导致**同一位教师在不同行中存在互相矛盾的信息**。

### 3. 删除异常（Deletion Anomaly）
若《离散数学基础》当前仅有李雷一名学生选修。当李雷退选该课程时，删除该行记录将导致**该课程本身的基本信息（课程名称、教师、教室）一同被意外删除**。

```mermaid
flowchart TD
    Table["非规范化大宽表"]
    A1["插入异常: 无学生选修时无法独立录入新课程"] --> Table
    A2["更新异常: 修改教师电话需更新大量冗余行，易产生不一致"] --> Table
    A3["删除异常: 删除最后一名选课学生导致课程基本信息丢失"] --> Table
```
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-26-relational-model-math', '26-relational-model-math', 'doc:hello-system-part-3', '第26章 一张关系表到底是什么？', '# 第26章 一张关系表到底是什么？

## 1. 概念层级澄清

在深入数据库前，必须严格区分以下概念：
- **关系模型（Relational Model）**：埃德加·科德（E. F. Codd）提出的数据组织数学理论模型；
- **SQL 语言**：基于关系代数与元组演算发展出的声明式查询标准；
- **数据库管理系统（DBMS）**：实现数据存储、管理与查询执行的软件系统（如 MySQL, PostgreSQL）；
- **存储引擎（Storage Engine）**：DBMS 中负责具体物理文件组织与索引存取的子系统（如 InnoDB）。

---

## 2. 关系模型的数学定义

- **域（Domain）**：一组具有相同数据类型的原子值的集合（如所有合法学号的集合 $D_1$）；
- **笛卡尔积（Cartesian Product）**：$D_1 \times D_2 \times \dots \times D_n$ 表示所有可能的值组合构成的全集；
- **关系（Relation）**：笛卡尔积的一个**有限子集**，在逻辑上表现为一张二维表；
- **元组（Tuple）**：关系中的一个元素，对应表中的一行记录；
- **属性（Attribute）**：元组中的一个分量，对应表中的一列。

> **关系模型与 SQL 的语义差异**：
> 在纯关系模型中，Relation 是数学集合，**严格不允许存在重复元组**；而在标准 SQL 中，查询结果默认具有 **多重集（Multiset / Bag）** 语义，允许重复行（除非显式指定 `DISTINCT`）。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-27-primary-keys-and-identity', '27-primary-keys-and-identity', 'doc:hello-system-part-3', '第27章 数据库如何知道“这个人就是这个人”？', '# 第27章 数据库如何知道“这个人就是这个人”？

## 1. 键（Key）的层级体系

在关系模型中，为了在逻辑上唯一标识每个元组，建立了键的概念层次：

1. **超键（Superkey）**：能够在关系中唯一标识一个元组的属性集（例如 `{学号, 姓名}`）；
2. **候选键（Candidate Key）**：不包含多余属性的**最小超键**（例如 `{学号}` 或 `{身份证号}`）；
3. **主键（Primary Key）**：从候选键中选定的一个作为元组的核心逻辑标识。

```mermaid
flowchart TD
    SK["超键 (Superkey)
能唯一定位元组的属性集合"]
    CK["候选键 (Candidate Key)
无多余属性的最小超键"]
    PK["主键 (Primary Key)
选拔出的唯一逻辑标识符"]

    SK -->|消除冗余属性| CK
    CK -->|选定主要代表| PK
```

#### 实体完整性（Entity Integrity）规则：
> **主键中的任何属性都不能取 NULL 值，且在关系内必须唯一。**

主键首先是一种**逻辑完整性约束**。具体 DBMS 实现中是否为主键自动创建聚集索引属于实现范畴。
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-28-foreign-keys-and-junction-tables', '28-foreign-keys-and-junction-tables', 'doc:hello-system-part-3', '第28章 两张表怎样重新认识彼此？', '# 第28章 两张表怎样重新认识彼此？

## 1. 实体表拆分与多对多关系

为了消除大宽表的异常，我们将实体拆分为独立表：
- `students`（学生表）
- `courses`（课程表）

学生与课程之间是**多对多（Many-to-Many）**关系：一个学生可以选修多门课程，一门课程可以被多名学生选修。

---

## 2. 选课关联表（Junction Table）的设计

在关系数据库中，多对多关系通过引入**关联表（Junction Table / Association Table）**拆解为两个一对多关系：

```mermaid
erDiagram
    STUDENTS ||--o{ ENROLLMENTS : "1 对 多"
    COURSES ||--o{ ENROLLMENTS : "1 对 多"

    STUDENTS {
        int id PK "学生ID"
        string student_no UK "学号"
        string name "姓名"
    }

    COURSES {
        int id PK "课程ID"
        string code UK "课程代码"
        string name "课程名称"
        int capacity "总容量"
        int enrolled "已选人数(反规范化计数)"
    }

    ENROLLMENTS {
        int id PK "主键ID"
        int student_id FK "外键 -> students.id"
        int course_id FK "外键 -> courses.id"
        datetime enrolled_at "选课时间"
    }
```

#### 参照完整性（Referential Integrity）：
> 外键约束确保 `enrollments.course_id` 的取值必须在 `courses.id` 中真实存在（或为 NULL），防止产生悬垂引用。

> **关于 `Course.enrolled` 的架构说明**：
> `courses.enrolled` 字段在理论上可以通过 `COUNT(enrollments)` 动态计算。在工程实践中，为了避免高频列表查询时全表扫关联表，常将其作为**有意识的反规范化（Denormalization）冗余计数**保留，但这要求系统必须在业务事务中严格保证计数与关联记录的同步更新。
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-29-sql-declarative-nature', '29-sql-declarative-nature', 'doc:hello-system-part-3', '第29章 SQL究竟是一种什么语言？', '# 第29章 SQL究竟是一种什么语言？

## 1. 声明式查询与逻辑执行顺序

SQL 是声明式语言（Declarative Language），用户指定需要的数据集特征，由数据库引擎决定具体的检索算法。

在概念上，标准 SQL 查询遵循特定的**逻辑查询处理顺序（Logical Query Processing Order）**：

```mermaid
flowchart TD
    S1["1. FROM (确定源表)"] --> S2["2. ON (连接谓词过滤)"]
    S2 --> S3["3. JOIN (生成连接结果)"]
    S3 --> S4["4. WHERE (行过滤)"]
    S4 --> S5["5. GROUP BY (分组聚合)"]
    S5 --> S6["6. HAVING (分组后过滤)"]
    S6 --> S7["7. SELECT (投影表达式计算)"]
    S7 --> S8["8. DISTINCT (排重)"]
    S8 --> S9["9. ORDER BY (排序)"]
    S9 --> S10["10. LIMIT / OFFSET (分页截断)"]
```

---

## 2. 逻辑顺序与物理执行计划的严格区分

必须强调：**逻辑处理顺序并不等于查询优化器实际的物理执行计划（Physical Execution Plan）**。

现代数据库的基于代价的优化器（CBO, Cost-Based Optimizer）在生成执行计划时可能：
- **谓词下推（Predicate Pushdown）**：提前在扫描阶段执行 `WHERE` 过滤，减少后续处理的数据量；
- **重排 JOIN 顺序**：优先连接结果集较小的表；
- **选择物理连接算子**：根据数据量和索引选择 Hash Join、Merge Join 或 Index Nested Loop。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-30-join-magic', '30-join-magic', 'doc:hello-system-part-3', '第30章 JOIN为什么能把被拆开的世界重新拼起来？', '# 第30章 JOIN为什么能把被拆开的世界重新拼起来？

## 1. 连接操作的集合论模型

连接操作在逻辑上是**笛卡尔乘积结合连接谓词过滤**的结果：

- **INNER JOIN（内连接）**：仅返回同时满足连接条件的左右表匹配元组组合；
- **LEFT OUTER JOIN（左外连接）**：保留左表所有元组，若右表无匹配记录，右表相关字段填充 `NULL`。

```sql
-- 查询所有课程及其实际选课学生（即使课程当前 0 人选修，也保留课程行）
SELECT c.code AS course_code, c.name AS course_name, s.name AS student_name
FROM courses c
LEFT JOIN enrollments e ON c.id = e.course_id
LEFT JOIN students s ON e.student_id = s.id;
```

> **注意**：
> 不要简单将 JOIN 理解为集合论中的 Venn 图交集。当左表单行匹配到右表多行时，输出结果将产生多重扩展行，输出行数取决于连接条件匹配的多重性。
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-31-group-by-and-aggregation', '31-group-by-and-aggregation', 'doc:hello-system-part-3', '第31章 GROUP BY到底改变了什么？', '# 第31章 GROUP BY到底改变了什么？

## 1. 维度聚合与投影规则

`GROUP BY` 将输入数据集按照指定的属性分组，使每个分组坍缩为一个代表行：

```mermaid
flowchart TD
    Rows["细粒度记录行 (多行选课记录)"] --> Group["GROUP BY c.id, c.code, c.name"]
    Group --> Agg["聚合计算 COUNT(e.id)"]
    Agg --> Result["分组摘要输出"]
```

#### SQL 标准投影约束：
在开启标准 SQL 检查（如 MySQL `ONLY_FULL_GROUP_BY` 模式）的环境下：
- `SELECT` 列表中出现的非聚合列，**必须包含在 `GROUP BY` 子句中，或在函数依赖上完全由分组列决定**；
- 避免在分组查询中书写未明确聚合规则的随意字段。

```sql
SELECT c.code, c.name, COUNT(e.id) AS student_count
FROM courses c
LEFT JOIN enrollments e ON c.id = e.course_id
GROUP BY c.id, c.code, c.name
HAVING COUNT(e.id) > 0;
```
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-32-lossless-decomposition', '32-lossless-decomposition', 'doc:hello-system-part-3', '第32章 为什么“把数据拆开”也会拆错？', '# 第32章 为什么“把数据拆开”也会拆错？

## 1. 有损分解与虚假元组（Spurious Tuples）

拆分关系表必须遵循严格准则。若随意拆分，在后续重新连接时可能产生原本不存在的**虚假元组**：

```mermaid
flowchart TD
    Orig["原关系 (学生, 教师, 课程)"] --> BadSplit["不当拆分:
R1(学生, 教师) + R2(教师, 课程)"]
    BadSplit --> ReJoin["重新 NATURAL JOIN"]
    BadJoin --> Ghost["产生虚假元组!
(某个教师教多门课时，学生被错误关联到未选修的课程)"]
```

#### 无损连接分解（Lossless Join Decomposition）充分必要条件：
> 关系模式 $R$ 分解为 $R_1$ 和 $R_2$ 具有无损连接性的充要条件是：$R_1 \cap R_2 \to (R_1 - R_2)$ 或 $R_1 \cap R_2 \to (R_2 - R_1)$ 属于原依赖闭包。即公共属性集必须至少是其中一个子关系的超键。
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-33-functional-dependencies', '33-functional-dependencies', 'doc:hello-system-part-3', '第33章 函数依赖到底在描述什么？', '# 第33章 函数依赖到底在描述什么？

## 1. 函数依赖（Functional Dependency）的形式化定义

> **定义**：设 $R(U)$ 是属性集 $U$ 上的关系模式，$X, Y \subseteq U$。若对于 $R$ 的任何合法关系状态 $r$，在 $r$ 中不存在两个元组在 $X$ 上的属性值相等而在 $Y$ 上的属性值不等，则称 **$X$ 函数决定 $Y$**，记作：
> $$X \to Y$$

在 Mini Campus 业务模型中：
- $\text{student\_no} \to \text{name}$
- $\text{course\_code} \to \text{name, capacity}$
- $\text{\{student\_id, course\_id\}} \to \text{enrolled\_at}$

---

## 2. 函数依赖的类型

1. **完全函数依赖（Full FD）**：$Y$ 依赖于 $X$，且不依赖于 $X$ 的任何真子集；
2. **部分函数依赖（Partial FD）**：$Y$ 依赖于 $X$，但同时依赖于 $X$ 的某个真子集；
3. **传递函数依赖（Transitive FD）**：$X \to Y, Y \to Z$，且 $Y \not\to X$ 时，$Z$ 传递依赖于 $X$。
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-34-normalization-in-practice', '34-normalization-in-practice', 'doc:hello-system-part-3', '第34章 范式不是考试规则，而是在修复数据结构', '# 第34章 范式不是考试规则，而是在修复数据结构

## 1. 规范化范式的正式定义

规范化理论通过逐步消除不当的函数依赖来避免数据冗余与操作异常：

```mermaid
flowchart TD
    N1["第一范式 (1NF)
每个属性域都是不可分的原语原子值"] --> N2["第二范式 (2NF)
满足 1NF，且消除非主属性对候选键的部分函数依赖"]
    N2 --> N3["第三范式 (3NF)
满足 2NF，且消除非主属性对候选键的传递函数依赖"]
    N3 --> NBC["BCNF 范式
对于每一个非平凡函数依赖 X -> Y，X 均必须是超键"]
```

- **主属性（Prime Attribute）**：包含在任何一个候选键中的属性；
- **非主属性（Non-prime Attribute）**：不包含在任何候选键中的属性。

---

## 2. 反规范化（Denormalization）的工程权衡

规范化有助于保证数据完整性并消除异常，但过度的拆分会导致复杂的跨表多路 JOIN。在实际系统设计中，通常规范化到 3NF/BCNF，并根据查询性能瓶颈进行适度的、受控的反规范化设计。
', 'public', '2251213429@qq.com', 10, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-35-bplus-tree-index', '35-bplus-tree-index', 'doc:hello-system-part-3', '第35章 数据库为什么不需要每次从头找？', '# 第35章 数据库为什么不需要每次从头找？

## 1. B+ 树索引的结构特征

在关系数据库存储引擎（如 MySQL InnoDB）中，**B+ 树（B+ Tree）** 是最核心的磁盘索引结构：
- **多路平衡树**：具有极高的扇出（Fanout），树高度通常较小（一般为 3~4 层）；
- **所有数据存放于叶子节点**：非叶子节点仅存放键值与指针作为目录索引；
- **叶子节点双向链表连接**：支持高效的范围扫描与顺序遍历。

```mermaid
flowchart TD
    Root["B+ 树根节点 (驻留内存 Buffer Pool)
[ 1000 | 2000 | 3000 ]"]
    L1["中间目录页
[ 1000 | 1500 ]"]
    L2["中间目录页
[ 2000 | 2500 ]"]
    Leaf1["叶子数据页 Page 0x01
[1001: 李雷] <-> [1002: 韩梅梅]"]
    Leaf2["叶子数据页 Page 0x02
[1501: 张三] <-> [1502: 李四]"]

    Root --> L1
    Root --> L2
    L1 --> Leaf1
    L1 --> Leaf2
    Leaf1 <==>|双向链表| Leaf2
```

---

## 2. 聚集索引与二级索引（以 InnoDB 为例）

- **聚集索引（Clustered Index）**：叶子节点直接存放完整的行记录数据，通常基于主键构建；
- **二级索引（Secondary Index）**：叶子节点存放索引列值与对应的主键值。通过二级索引查找非索引列数据时，通常需要根据主键进行“回表查询”（除非查询列已全部被索引覆盖，即覆盖索引 Covering Index）。
', 'public', '2251213429@qq.com', 11, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-36-acid-transactions', '36-acid-transactions', 'doc:hello-system-part-3', '第36章 为什么一次修改不能只成功一半？', '# 第36章 为什么一次修改不能只成功一半？

## 1. 事务的 ACID 性质

在执行选课时，系统需要同时执行两步持久化操作：
1. 更新课程已选人数：`UPDATE courses ...`;
2. 插入选课关联流水：`INSERT INTO enrollments ...`。

数据库事务（Transaction）提供四大逻辑保证（ACID）：

- **原子性（Atomicity）**：事务中的全部操作要么全部成功持久化，要么全部回滚撤销；
- **一致性（Consistency）**：事务执行前后，数据库状态必须满足所有预定义的完整性约束与业务不变量；
- **隔离性（Isolation）**：并发执行的事务之间互不干扰，防止脏读、不可重复读等并发异常；
- **持久性（Durability）**：在系统承诺的故障模型下，已成功提交事务对数据的修改在系统恢复后依然保留。

---

## 2. 实现机制概述：WAL 与 Undo

DBMS 通常结合多种底层技术来实现 ACID 特性：
- **Undo Log**：记录修改前的数据镜像，用于支持事务回滚以及 MVCC 多版本并发读取；
- **Redo Log（WAL 预写日志）**：数据修改前先将日志顺序追加落盘，在系统崩溃后用于重放恢复未刷盘的修改。
', 'public', '2251213429@qq.com', 12, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-37-concurrency-and-locking', '37-concurrency-and-locking', 'doc:hello-system-part-3', '第37章 两个人同时点击最后一个名额会发生什么？', '# 第37章 两个人同时点击最后一个名额会发生什么？

## 1. 并发争抢下的超卖风险

当课程仅剩 1 个名额时，若李雷与韩梅梅同时并发执行选课：
若业务逻辑在应用层先无锁读取名额、再分别执行增加，极易导致两个人均判定有余量，最终已选人数突破容量上限（超卖）。

---

## 2. 并发控制方案对比

### 方案 A：原子条件更新（推荐主线方案）
利用数据库行级更新的原子性，在 SQL `WHERE` 条件中加入不变量约束：

```sql
-- 在同一事务中执行
START TRANSACTION;

-- 1. 原子条件更新
UPDATE courses 
SET enrolled = enrolled + 1 
WHERE id = 2048 AND enrolled < capacity;

-- 2. 检查更新影响行数 (affected rows)
-- 若 affected_rows == 0，说明名额已满或课程不存在，回滚并提示选课失败
-- 若 affected_rows == 1，继续执行选课记录插入：
INSERT INTO enrollments (student_id, course_id) VALUES (1001, 2048);

COMMIT;
```

### 方案 B：悲观锁方案（SELECT ... FOR UPDATE）
在读取数据时显式申请行级排他锁（X-Lock），阻塞其他并发事务的读取与修改：

```sql
START TRANSACTION;
-- 读取并锁定目标行记录
SELECT capacity, enrolled FROM courses WHERE id = 2048 FOR UPDATE;
-- 必须在应用层重新判断 capacity 与 enrolled
-- 确认有名额后再执行 UPDATE 与 INSERT
UPDATE courses SET enrolled = enrolled + 1 WHERE id = 2048;
INSERT INTO enrollments (student_id, course_id) VALUES (1001, 2048);
COMMIT;
```

---

## 3. 本章小结

1. 并发控制的关键在于防止多个事务基于过期的状态进行并发决策；
2. 原子条件更新通过数据库行锁与条件判断实现了高效且防超卖的并发控制；
3. 数据库唯一索引约束（如 `UNIQUE(student_id, course_id)`）与事务机制共同构成了数据完整性防线。
', 'public', '2251213429@qq.com', 13, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-4', 'part-4', 'doc:book-hello-system', '第四部分 · 前端第一次遇见后端', '', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-38-browser-cannot-touch-db-directly', '38-browser-cannot-touch-db-directly', 'doc:hello-system-part-4', '第38章 浏览器为什么不能直接操作数据库？', '# 第38章 浏览器为什么不能直接操作数据库？

## 1. 为什么不能让客户端直接连接数据库？

在初学 Web 开发时，有人可能会提出疑问：“既然前端运行 JavaScript，数据库支持网络连接，为什么不直接在前端编写数据库查询语句？”

如果在生产架构中允许客户端直连数据库，将面临以下严重的系统与安全风险：

```mermaid
flowchart TD
    Client["运行在用户终端的浏览器
(不可信环境，代码对用户完全透明)"]
    DB["核心数据库管理系统 (DBMS)"]

    Client -->|1. 凭据泄露: 数据库连接账号与密码直接暴露在前端源码中| DB
    Client -->|2. 越权与注入: 用户可通过修改客户端逻辑直接执行任意 SQL| DB
    Client -->|3. 连接耗尽: 大量客户端同时直连将迅速耗尽数据库连接池资源| DB
    Client -->|4. 业务逻辑旁路: 前端校验可被直接绕过，服务端无法统一执行业务规则| DB
```

---

## 2. 后端服务的核心定位

后端应用服务器作为系统的**信任边界守门人**与**业务仲裁中心**：
1. **安全与权限控制**：集中保管数据库认证凭据，对所有外部请求执行身份鉴权与权限校验；
2. **连接池复用**：通过内部连接池复用有限的数据库连接，支撑海量前端并发访问；
3. **权威业务规则执行**：无论前端如何修改，所有核心业务不变量均由后端统一判定与持久化。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-39-http-protocol-agreement', '39-http-protocol-agreement', 'doc:hello-system-part-4', '第39章 HTTP到底帮我们约定了什么？', '# 第39章 HTTP到底帮我们约定了什么？

## 1. HTTP 协议的核心定位（RFC 9110）

**超文本传输协议（HTTP）** 是一种定义在应用层的无状态请求/响应协议，用于在分布式超媒体系统中操作资源。

- **HTTP/1.1**：基于纯文本格式组织报文（便于阅读与调试）；
- **HTTP/2**：采用二进制分帧层，支持单个 TCP 连接上的多路复用（Multiplexing）；
- **HTTP/3**：基于底层的 QUIC 协议（基于 UDP），解决了传输层的队头阻塞问题。

无论底层传输机制如何演进，HTTP 所表达的**资源操作语义（Methods, Status Codes, Headers）**保持一致。

---

## 2. 报文结构示例（HTTP/1.1 文本表现）

### 请求报文（Request）：
```http
POST /api/enrollments HTTP/1.1
Host: campus.example.edu
Content-Type: application/json
Authorization: Bearer <access_token>

{"courseId": 2048}
```

### 响应报文（Response）：
```http
HTTP/1.1 201 Created
Content-Type: application/json
Content-Length: 48

{"status":"SUCCESS","message":"选课成功"}
```

> **关于“无状态”的准确理解**：
> HTTP 协议的“无状态（Stateless）”是指服务器原则上无需保留跨请求的协议上下文即可理解单个请求的语义。这并不意味着应用层不能通过 Cookie、Session 或 Token 在业务层面维护用户会话状态。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-40-json-the-lingua-franca', '40-json-the-lingua-franca', 'doc:hello-system-part-4', '第40章 JSON为什么总出现在前后端之间？', '# 第40章 JSON为什么总出现在前后端之间？

## 1. 跨异构语言的数据交换格式

前端运行在 JavaScript 引擎中，后端服务可能采用 Java、Go 或 Python。它们在内存中的对象结构完全不同。

**JSON（JavaScript Object Notation）** 是一种轻量级的纯文本数据交换格式，充当了跨语言的通用中介：

```mermaid
flowchart LR
    JS["前端 JS 内存对象
{ courseId: 2048 }"] -->|JSON.stringify() 序列化| JSONText["JSON 文本表示
''{"courseId":2048}''"]
    JSONText -->|UTF-8 编码为字节流| Net["HTTP 网络传输"]
    Net --> ByteStream["后端接收字节流"]
    ByteStream -->|JSON 解析库反序列化| JavaObj["Java 堆内存 DTO 对象
EnrollRequestDto 实例"]
```

---

## 2. 数据格式的多样性

需要说明的是，JSON 并非前后端通信的唯一选择：
- **Protocol Buffers (Protobuf)**：二进制高效编码，广泛用于内部微服务 RPC；
- **Form Data**：用于传统表单提交与文件上传；
- **CBOR / MessagePack**：二进制 JSON 替代方案。

在开放 Web API 中，JSON 因其人类可读性与良好的生态支持成为了最通用的选择。
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-41-the-first-real-api', '41-the-first-real-api', 'doc:hello-system-part-4', '第41章 第一条真正的API', '# 第41章 第一条真正的API

## 1. 查询课程列表 API：GET /api/courses

当用户打开选课页面时，前端通过 API 获取当前开放的课程列表：

```mermaid
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
    Repo->>DB: SELECT id, code, name, capacity, enrolled FROM courses WHERE status = ''ACTIVE''
    DB-->>Repo: 返回结果集
    Repo-->>Svc: 映射为 List<Course> 领域实体
    Svc-->>Ctrl: 转换为 List<CourseResponseDto>
    Ctrl-->>Frontend: 返回 HTTP 200 OK (JSON 数组)
    Note over Frontend: 前端更新响应式状态，渲染课程卡片
```
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-42-the-click-moment', '42-the-click-moment', 'doc:hello-system-part-4', '第42章 点击“选课”', '# 第42章 点击“选课”

## 1. 提交选课请求：POST /api/enrollments

前端触发选课交互时的调用示例：

```javascript
async function handleEnroll(courseId) {
    submitting.value = true;
    try {
        const response = await fetch(''/api/enrollments'', {
            method: ''POST'',
            headers: {
                ''Content-Type'': ''application/json'',
                ''Authorization'': `Bearer ${userToken.value}`
            },
            // 注意：客户端只传递目标课程 ID，当前操作学生身份由服务端从 Token 中解析！
            body: JSON.stringify({ courseId: courseId })
        });
        
        if (response.status === 201) {
            alert(''选课成功！'');
        } else if (response.status === 409) {
            alert(''选课失败：名额已满或已选过该课程。'');
        }
    } finally {
        submitting.value = false;
    }
}
```
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-43-skinny-controller', '43-skinny-controller', 'doc:hello-system-part-4', '第43章 Controller为什么不能自己完成一切？', '# 第43章 Controller为什么不能自己完成一切？

## 1. 表现层的边界与“瘦 Controller”

在分层架构中，Controller 的职责是**处理传输与协议层面的适配**：
- 解析 HTTP 请求头与请求体；
- 执行参数基本格式清洗与校验（如 ID 是否为正整数）；
- 从安全上下文中提取已认证用户身份；
- 调用业务逻辑层，并将业务执行结果包装为对应的 HTTP 响应。

```java
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
```

Controller **不应当包含核心业务规则，也不应当直接执行持久化查询**。
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-44-service-the-rule-sanctuary', '44-service-the-rule-sanctuary', 'doc:hello-system-part-4', '第44章 Service到底是什么？', '# 第44章 Service到底是什么？

## 1. 业务用例编排与事务边界

**Service 层（应用服务层）** 承载具体的业务用例流程：
1. **跨实体流程编排**：协调多个实体与数据访问对象完成用例；
2. **事务边界控制**：定义事务的开启、提交与回滚范围（例如通过 Spring 的 `@Transactional` 注解）；
3. **安全与审计集成**：记录业务操作流水。

```java
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
```
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-45-repository-persistence-abstraction', '45-repository-persistence-abstraction', 'doc:hello-system-part-4', '第45章 Repository为什么存在？', '# 第45章 Repository为什么存在？

## 1. 数据访问抽象的价值

**Repository（仓储层）** 为领域模型提供类似内存集合风格的数据访问接口，将上层业务与底层存储技术解耦：

```java
public interface CourseRepository {
    Optional<Course> findById(int id);
    boolean incrementEnrolledIfAvailable(int courseId);
}
```

- **提升可测试性**：在编写 Service 单元测试时，可以使用内存实现快速验证业务逻辑，无需启动真实数据库；
- **集中管理数据访问**：SQL 语句与数据映射规则收敛在仓储实现类中。

> **架构认知提示**：
> 仓储抽象能够隔离部分 SQL 细节，但并不能完全消除底层数据库的特性差异（抽象泄漏，Leaky Abstraction）。不同的数据库在事务隔离级别、方言语法和性能特性上仍存在客观差异。
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-46-entity-dto-vo-boundary', '46-entity-dto-vo-boundary', 'doc:hello-system-part-4', '第46章 为什么系统里有这么多“长得差不多”的对象？', '# 第46章 为什么系统里有这么多“长得差不多”的对象？

## 1. 统一术语体系与边界隔离

在实际分层工程中，不同层次的对象承担着不同的职责：

```mermaid
flowchart LR
    Client["客户端 (浏览器)"] <-->|Request / Response DTO| Ctrl["表现层 (Controller)"]
    Ctrl <-->|领域实体 Entity / 值对象 Value Object| Svc["业务逻辑层 (Service)"]
    Svc <-->|数据映射| DB[(数据库存储)]
```

- **领域实体（Entity）**：具有唯一业务标识（如 Course ID）并封装业务不变量的核心领域对象；
- **数据传输对象（DTO, Data Transfer Object）**：
  - **Request DTO**：封装客户端提交的请求载荷，用于输入校验；
  - **Response DTO**：封装返回给客户端的数据，实现敏感数据脱敏（如隐藏密码哈希、内部配置等）；
- **值对象（Value Object, DDD 语境）**：通过其包含的属性值来定义其等价性且无独立标识的不可变对象（如 `Money`, `Address`）。

---

## 2. 为什么不直接复用 Entity？

若直接将与数据库表映射的 `Student` Entity 暴露给外部接口：
1. **敏感信息泄露**：可能意外将 `password_hash` 或身份证号直接序列化返回给前端；
2. **批量赋值安全漏洞（Mass Assignment Vulnerability）**：恶意用户可能在请求中夹带 `role: "ADMIN"` 等私有字段，若框架直接将 JSON 绑定到 Entity，将造成越权漏洞。
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-5', 'part-5', 'doc:book-hello-system', '第五部分 · 真实系统开始反抗', '', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-47-defensive-validation', '47-defensive-validation', 'doc:hello-system-part-5', '第47章 信任边界：为什么服务器必须重新验证请求？', '# 第47章 信任边界：为什么服务器必须重新验证请求？

## 1. 客户端与服务端的信任边界

在 Web 应用中，运行在用户浏览器上的前端界面处于不可信环境。攻击者或脚本可以完全绕过前端 UI 逻辑，直接向后端端点发送构造好的 HTTP 报文：

- 提交不合法的负数或格式错误的字段；
- 尝试伪造其他用户的身份 ID；
- 在请求体中附带未经授权的私有字段。

#### 核心原则：
> **前端校验的主要目的在于提升正常用户的交互体验（即时反馈、减少不必要的网络往返），不能作为系统安全的授权依据。**
> 后端服务处于系统的信任边界之内，必须对所有外部传入的数据执行严格的输入验证、身份认证与权限检查。

```mermaid
flowchart LR
    Browser["不可信客户端
(前端表单校验: 仅用于优化用户体验)"] -->|跨越网络边界| Server["可信后端服务
(执行鉴权、格式校验与不变量判定)"]
    Server -->|合法操作| DB[(数据库持久化)]
```

---

## 2. 概念小贴士：这和“零信任（Zero Trust）”是一回事吗？

> **说明**：
> 这里讨论的是**客户端与服务端之间的基础信任边界与输入验证**。
> **零信任架构（Zero Trust Architecture, 如 NIST SP 800-207 所定义）** 是一个更为广泛的企业安全战略体系，其核心原则是“持续验证、永不隐式信任”，涵盖身份微隔离、网络分段、设备合规性持续评估等多维度安全机制，二者不应混淆。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-48-exception-and-rollback', '48-exception-and-rollback', 'doc:hello-system-part-5', '第48章 如果程序运行到一半失败了呢？', '# 第48章 如果程序运行到一半失败了呢？

## 1. 异常传播与事务回滚机制

当业务用例在执行过程中遇到错误时（如学生已被停课处分或数据库唯一键冲突），系统通过抛出异常中断当前流程：

```mermaid
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
```

---

## 2. Spring 声明式事务的回滚规则说明

【以 Spring Framework 为例】：
- 默认情况下，Spring 声明式事务（`@Transactional`）仅在遇到未捕获的 **`RuntimeException`** 和 **`Error`** 时自动触发事务回滚；
- 对于受检异常（Checked Exception，继承自 `Exception`），默认**不会**触发回滚，除非显式指定 `@Transactional(rollbackFor = Exception.class)`；
- 如果业务代码在内部用 `try-catch` 捕获并吞掉了异常，外部事务管理器将感知不到失败，事务可能依然被正常提交。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-49-http-status-codes-in-action', '49-http-status-codes-in-action', 'doc:hello-system-part-5', '第49章 HTTP 200并不代表所有事情都成功', '# 第49章 HTTP 200并不代表所有事情都成功

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
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-50-idempotency-and-repeated-clicks', '50-idempotency-and-repeated-clicks', 'doc:hello-system-part-5', '第50章 如果用户连续点十次按钮呢？', '# 第50章 如果用户连续点十次按钮呢？

## 1. 概念澄清：防抖、节流与幂等性

必须清晰区分前端交互控制与服务端幂等保证：

1. **防重复提交保护（In-Flight Guard）**：用户点击后立即将按钮置为禁用状态，防止用户在等待期间连续触发；
2. **防抖（Debounce）**：在事件被触发后等待特定时间段，若期间再次触发则重新计时（常用于搜索输入框联想）；
3. **节流（Throttle）**：在固定时间间隔内只允许执行一次处理（常用于滚动或窗口尺寸改变事件）；
4. **服务端幂等性（Idempotency）**：同一个操作无论在服务端执行一次还是多次，对系统状态产生的最终影响均保持一致。

```mermaid
flowchart TD
    subgraph ClientProtection ["客户端保护 (改善体验)"]
        Click["用户频繁点击"] --> Guard["按钮 Disabled 状态控制"]
    end

    subgraph ServerIdempotency ["服务端幂等机制 (保障数据一致性)"]
        Req["网络请求 (可能因超时发生重试)"] --> CheckToken{"携带 Idempotency-Key 检查"}
        CheckToken -->|已处理过| CachedResp["直接返回上次成功结果 (不重复扣名额)"]
        CheckToken -->|首次处理| Process["执行选课事务"]
    end
```

---

## 2. 为什么服务端必须具备幂等处理能力？

在不可靠的网络环境中，客户端发起选课后可能因网络抖动未收到响应。客户端或网关发起重试时，服务端若无幂等保护，可能导致重复扣费或状态异常。

通过引入 **Idempotency-Key** 或利用数据库业务唯一索引（`UNIQUE(student_id, course_id)`），系统能够确保重复提交不会导致非预期的副作用。
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-51-cas-and-optimistic-locking', '51-cas-and-optimistic-locking', 'doc:hello-system-part-5', '第51章 如果两个人争抢最后一个名额呢？', '# 第51章 如果两个人争抢最后一个名额呢？

## 1. 高并发选课的原子条件更新

在高并发场景下，使用行级排他锁（`SELECT ... FOR UPDATE`）可能在高争用时产生锁等待开销。

一种常用且高效的方案是利用数据库 Update 语句自身的行级原子性执行**条件更新**：

```sql
-- 在同一事务中执行
UPDATE courses 
SET enrolled = enrolled + 1 
WHERE id = 2048 AND enrolled < capacity;
```

```java
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
```

---

## 2. 关于基于版本号的乐观并发控制（OCC）

> **说明**：
> 若采用标准的**基于版本号的乐观锁（Optimistic Locking）**，实体表中需包含 `version` 字段：
> `UPDATE courses SET enrolled = ?, version = version + 1 WHERE id = ? AND version = ?;`
> 若更新失败（影响行数为 0），应用层需捕获冲突并决定是否重试。在简单的计数器扣减场景中，直接使用带业务条件（`enrolled < capacity`）的原子 Update 往往更为简洁有效。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-52-wal-and-crash-recovery', '52-wal-and-crash-recovery', 'doc:hello-system-part-5', '第52章 如果系统重启，数据为什么还在？', '# 第52章 如果系统重启，数据为什么还在？

## 1. 预写日志（WAL, Write-Ahead Logging）原理

在数据库管理系统中，若每次事务提交都将修改的数据页（通常为 16KB）同步写回磁盘的物理数据文件，将产生大量的随机 I/O，严重制约吞吐量。

**WAL 原则** 规定：**数据页的修改可以在内存中进行，但在这些脏页（Dirty Page）被写入磁盘数据文件之前，相关的重做日志（Redo Log）必须先达到要求的持久化状态。**

---

## 2. 数据更新与恢复流程（以 MySQL InnoDB 为例）

```mermaid
flowchart TD
    Update["1. 事务修改内存 Buffer Pool 中的数据页"] --> Dirty["数据页变为脏页 (Dirty Page)"]
    Update --> RedoLog["2. 生成 Redo Log 记录并写入日志缓冲区"]
    Commit["3. 事务提交 COMMIT"] --> FlushLog["4. 根据配置刷盘 Redo Log (顺序 I/O)"]
    FlushLog --> Ack["向客户端响应成功"]
    
    Dirty -.->|后续异步操作| Checkpoint["5. 检查点机制 (Checkpoint) 后台将脏页刷入数据文件"]
```

#### 崩溃恢复（Crash Recovery）：
若在步骤 5 发生前系统意外断电重启，数据库在启动时通过扫描 Redo Log，将已提交但尚未刷盘的数据页重新应用恢复，从而保障事务的**持久性（Durability）**。
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-53-logging-and-observability', '53-logging-and-observability', 'doc:hello-system-part-5', '第53章 程序出错以后，我们怎么知道发生了什么？', '# 第53章 程序出错以后，我们怎么知道发生了什么？

## 1. 可观察性与结构化日志

在生产环境中，简单的 `System.out.println()` 存在无法格式化、缺乏上下文与不易检索的缺陷。

现代系统依赖**三大可观察性支柱**：
- **日志（Logs）**：记录离散的事件详情；
- **指标（Metrics）**：聚合统计系统的运行状态（如 QPS、错误率、CPU 占用）；
- **追踪（Traces）**：记录跨服务调用的时序路径与耗时。

---

## 2. 生产日志的最佳实践

1. **结构化输出（如 JSON 格式）**：便于日志收集系统（如 ELK、Loki）进行字段索引与解析；
2. **链路追踪标识（Correlation ID / Trace ID）**：在请求入口生成唯一标识并贯穿调用链；
3. **保护敏感信息（PII 脱敏）**：严禁在日志中打印明文密码、银行卡号与个人隐私数据。

```json
{
  "timestamp": "2026-08-28T10:00:00.120Z",
  "level": "INFO",
  "traceId": "req-9b1a-4c22",
  "logger": "com.campus.service.EnrollmentService",
  "event": "ENROLLMENT_SUCCESS",
  "studentId": 1001,
  "courseId": 2048
}
```
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-54-environment-isolation-12factor', '54-environment-isolation-12factor', 'doc:hello-system-part-5', '第54章 “在我的电脑上可以运行”为什么远远不够？', '# 第54章 “在我的电脑上可以运行”为什么远远不够？

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
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-55-test-pyramid', '55-test-pyramid', 'doc:hello-system-part-5', '第55章 怎样证明我们的代码还可以工作？', '# 第55章 怎样证明我们的代码还可以工作？

## 1. 测试金字塔（The Test Pyramid）

测试金字塔是一种指导测试用例配比的经验模型：

```mermaid
flowchart TD
    E2E["端到端测试 (E2E Tests)
数量较少，执行成本高，验证全链路真实交互"]
    Integration["集成测试 (Integration Tests)
验证 Controller -> Service -> Repository 跨组件协同"]
    Unit["单元测试 (Unit Tests)
数量最多，毫秒级快速反馈，覆盖核心业务规则与算法"]

    E2E --> Integration
    Integration --> Unit
```

---

## 2. 多重质量保证体系

自动化测试并不是保证软件质量的唯一手段，工程实践中通常结合多种质量防线：
- **单元测试与集成测试**：提供快速回归验证能力；
- **静态代码分析与类型检查**：在编译前捕获潜在类型错误与代码异味；
- **代码审查（Code Review）**：促进团队知识共享与架构规范落地；
- **生产环境可观察性**：通过告警与指标及时发现线上异常。
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-6', 'part-6', 'doc:book-hello-system', '第六部分 · 重新走完那几百毫秒', '', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-56-full-request-journey', '56-full-request-journey', 'doc:hello-system-part-6', '第56章 从浏览器到数据库', '# 第56章 从浏览器到数据库

## 1. 全链路交互的端到端时序

现在，我们将全书所涉及的技术环节串联为一个完整的端到端调用视图：

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户李雷
    participant DOM as 浏览器 DOM
    participant Vue as 前端 Vue 状态
    participant Net as 网络协议栈
    participant Ctrl as 后端 Controller
    participant Svc as 后端 Service
    participant Repo as 后端 Repository
    participant DB as 数据库 (DBMS)

    User->>DOM: 1. 触发“选课”按钮点击
    DOM->>Vue: 2. 触发 @click 事件监听函数
    Note over Vue: 3. 更新交互状态 (设置 submitting=true)<br/>构造 JSON 请求载荷 {"courseId": 2048}
    Vue->>Net: 4. fetch 发起 HTTP POST /api/enrollments
    Note over Net: 5. 复用已有 TCP/TLS 连接，发送 HTTP 请求报文
    Net->>Ctrl: 6. Web 服务器解析报文，路由至 Controller
    Note over Ctrl: 7. 从安全上下文中解析出已认证的学生身份 (studentId=1001)<br/>执行请求参数校验
    Ctrl->>Svc: 8. 调用业务用例 enroll(1001, 2048)
    Note over Svc: 9. 声明式事务开启 (开启数据库事务 BEGIN)
    Svc->>Repo: 10. incrementEnrolledIfAvailable(2048)
    Repo->>DB: 11. 执行原子条件更新 SQL
    Note over DB: 12. 数据库行级锁控制，执行不变量检查 (enrolled < capacity)<br/>写入 Redo Log 缓冲
    DB-->>Repo: 13. 返回更新结果 (影响行数: 1)
    Repo-->>Svc: 14. 扣减名额成功
    Svc->>Repo: 15. insertEnrollment(1001, 2048)
    Repo->>DB: 16. 执行选课记录 INSERT
    Note over DB: 17. 唯一索引检查防重，事务提交 COMMIT
    DB-->>Repo: 18. 持久化完成
    Repo-->>Svc: 19. 插入成功
    Svc-->>Ctrl: 20. 业务处理完成，返回成功结果
    Ctrl-->>Net: 21. 封装 HTTP 201 Created 响应报文 (JSON)
    Net-->>Vue: 22. 响应报文回传浏览器，Promise 状态决议 (Resolve)
    Note over Vue: 23. 前端响应式状态更新，触发视图差异计算
    Vue->>DOM: 24. 局部更新真实 DOM 节点 (显示“选课成功”)
    DOM-->>User: 25. 浏览器完成渲染重绘，用户看到选课成功反馈
```

---

## 2. 数据形态在调用链中的跨层演变

在上述端到端流程中，同一项选课事实在不同系统边界中以不同的形态存在：

```mermaid
flowchart TD
    D1["1. 前端组件响应式状态 (JavaScript Object)"] -->|JSON 序列化| D2["2. HTTP 消息体 (UTF-8 文本字节流)"]
    D2 -->|反序列化与绑定| D3["3. 后端传输对象 (Request DTO)"]
    D3 -->|业务处理| D4["4. 领域实体与 SQL 参数 (Entity / SQL Bound Parameters)"]
    D4 -->|存储引擎写入| D5["5. 关系表元组与索引数据页 (DBMS Table Rows & B+ Tree Pages)"]
    D5 -->|执行结果映射| D6["6. 业务响应对象 (Response DTO)"]
    D6 -->|JSON 序列化回传| D7["7. HTTP 响应消息体 (JSON)"]
    D7 -->|反序列化更新| D8["8. 前端视图投影 (DOM Nodes)"]
```

---

## 3. 实现与架构层面的说明

【技术实现声明】：
上面以 **Vue 3 + Spring Boot + MySQL (InnoDB)** 为例展示了一条典型的端到端链路。
不同技术选型（如 React / Svelte 前端、Go / Node.js 后端、PostgreSQL / 分布式数据库）在具体的 API 命名、中间件机制和语法上有所不同，但**抽象边界划分、数据形态转换与事务控制的核心逻辑**是普适的。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-57-why-we-have-layers', '57-why-we-have-layers', 'doc:hello-system-part-6', '第57章 我们为什么最终得到了这么多层？', '# 第57章 我们为什么最终得到了这么多层？

## 1. 抽象层次的设计初衷

回顾 Mini Campus 的演进历程，每一层抽象的引入都是为了应对特定的软件工程挑战：

- **面向对象与封装**：将散落的变量聚合成具有明确身份与不变量的自治单元，防止外部代码直接破坏对象状态；
- **声明式前端与响应式**：将开发者从繁琐脆弱的命令式 DOM 同步中解放出来，以状态为中心驱动界面渲染；
- **关系模型与规范化**：通过严格的数学模型消除数据冗余，避免插入、更新与删除异常；
- **索引与事务机制**：在保障查询性能的同时，通过 ACID 特性与并发控制捍卫多用户访问下的数据一致性；
- **表现层（Controller）**：隔离传输协议与序列化细节，使业务逻辑免受外部通信形式变化的干扰；
- **业务逻辑层（Service）**：提供专注的用例编排与事务边界控制；
- **数据持久层（Repository）**：提供面向集合的数据访问抽象，提高代码的可测试性并隔离 SQL 查询细节。

分层设计的核心目的，是在系统的不同关注点之间设立清晰的边界，降低单个模块的复杂度，提升团队协作与长期维护的效率。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-58-anti-overengineering', '58-anti-overengineering', 'doc:hello-system-part-6', '第58章 架构是不是越复杂越好？', '# 第58章 架构是不是越复杂越好？

## 1. 架构复杂度的权衡原则

在软件设计中，“过度设计（Over-Engineering）”与“缺乏设计”同样具有危害性。

系统的架构选型取决于多维度的客观约束：
- **业务规模与并发量**：读写 QPS、数据总量与延迟敏感度；
- **业务复杂度与变更频率**：业务规则的多样性与演进速度；
- **团队结构与运维成本**：团队人员规模、专业分工与基础设施成熟度；
- **容灾与合规要求**：数据安全性与高可用性目标。

---

## 2. 简约与演进式设计

遵循 **YAGNI（You Aren''t Gonna Need It）** 与 **KISS（Keep It Simple, Stupid）** 原则：
- 对于中小型单体应用，清晰的三层分层结构往往是最具生产力与维护性的方案；
- 盲目引入复杂的微服务拆分、分布式事务与多层缓存，不仅会显著增加网络延迟和部署复杂度，还可能引入新的分布式故障模式；
- 优秀的架构师应当根据当前系统的实际约束，选择**适度且具备演进能力的最小必要抽象**。
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-59-eternal-pillars-beyond-frameworks', '59-eternal-pillars-beyond-frameworks', 'doc:hello-system-part-6', '第59章 框架消失以后，还剩下什么？', '# 第59章 框架消失以后，还剩下什么？

## 1. 软件系统反复面对的核心议题

框架与类库在不断更迭，但在各类软件系统中，以下基础问题始终处于核心地位：

```mermaid
flowchart TD
    Root["软件系统反复面对的核心议题"]
    
    P1["1. 状态与生命周期 (State & Lifetime)
瞬态计算与持久化存储的划分与管理"]
    P2["2. 身份与不变量 (Identity & Invariants)
实体唯一标识与业务完整性约束的维护"]
    P3["3. 边界与契约 (Boundaries & Contracts)
模块与服务之间清晰的接口规范与协议"]
    P4["4. 数据表示与转换 (Representations)
数据在视图、网络与存储介质间的形态演变"]
    P5["5. 并发与隔离 (Concurrency & Isolation)
多任务同时执行时的资源竞争与协调"]
    P6["6. 故障模型与恢复 (Faults & Recovery)
在不可靠的物理环境与网络中保证确定性"]
    P7["7. 可观察性 (Observability)
系统运行状态的可度量、可追踪与可定位性"]

    Root --> P1
    Root --> P2
    Root --> P3
    Root --> P4
    Root --> P5
    Root --> P6
    Root --> P7
```

掌握这些通用模型，有助于开发者在面对未来涌现的新框架与新技术时，快速洞察其背后的设计取舍。
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-60-click-again', '60-click-again', 'doc:hello-system-part-6', '第60章 现在，再点击一次“选课”', '# 第60章 现在，再点击一次“选课”

## 1. 重回起点：建立全景心智模型

现在，让我们再次回到那个选课界面。

当用户再次点击“选课”按钮时，在你脑海中展现的将是一幅清晰连贯的系统图景：

- **在浏览器端**：用户交互触发 DOM 事件，前端响应式框架捕获事件并更新交互状态，构造序列化的 JSON 载荷；
- **在网络边界**：HTTP 报文承载着明确的方法与路径跨越网络，服务端在信任边界处对请求进行身份认证与参数清洗；
- **在业务领域**：表现层控制器将请求分发至业务逻辑层，业务服务以数据库事务为边界，编排选课资格与名额约束；
- **在存储引擎**：数据库管理系统利用行级锁与条件判断防范并发超卖，利用重做日志保障事务持久性；
- **在回传链路**：执行结果原路返回，响应式数据驱动前端视图高效更新，向用户呈现确定性的操作反馈。

---

## 2. 结语

软件系统的迷人之处，在于我们通过层层抽象将庞大复杂的现实问题分解为清晰可控的逻辑单元，同时又能在需要深入底层时清晰理解各层之间的协作机理。

希望《Hello System》能够帮助你建立起坚实、严谨的系统视角，伴随你在未来的工程实践中探索并构建出更为优雅、可靠的软件系统。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix', 'appendix', 'doc:book-hello-system', '附录 · Mini Campus 全景参考与速查', '', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-a', 'appendix-a', 'doc:hello-system-appendix', '附录A Mini Campus 参考工程目录结构', '# 附录A Mini Campus 参考工程目录结构

> **说明**：以下展示的是 Mini Campus 项目的一种典型工程组织结构，用于教学参考，不同团队和项目可根据实际规模进行剪裁。

```text
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
```
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-b', 'appendix-b', 'doc:hello-system-appendix', '附录B Mini Campus 数据库设计与完整 ER 图', '# 附录B Mini Campus 数据库设计与完整 ER 图

## 1. 概念模型 ER 图

```mermaid
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
```

> **数据模型设计说明**：
> 1. `users` 与 `students` / `teachers` 采用基于角色的多态档案关联，每个 User 根据其 `role` 关联对应的档案表；
> 2. `enrollments` 表中通过复合唯一索引 `UNIQUE(student_id, course_id)` 保证同一学生不可重复选修同一门课程；
> 3. `courses.enrolled` 作为有意识的反规范化冗余计数，通过业务事务与 `enrollments` 表的增删操作严格保持同步。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-c', 'appendix-c', 'doc:hello-system-appendix', '附录C 核心 SQL 参考手册', '# 附录C 核心 SQL 参考手册

## 1. DDL 基础表结构与约束定义

```sql
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
```

---

## 2. 高并发选课的事务实现对比

### 方案 A：原子条件更新（推荐主线方案）
```sql
START TRANSACTION;

-- 1. 执行原子条件更新
UPDATE courses 
SET enrolled = enrolled + 1 
WHERE id = ? AND enrolled < capacity;

-- 2. 若上一步 affected_rows == 1，插入选课关联记录
INSERT INTO enrollments (student_id, course_id) VALUES (?, ?);

-- 3. 提交事务 (若唯一索引冲突则回滚)
COMMIT;
```

### 方案 B：显式排他锁（SELECT ... FOR UPDATE 方案）
```sql
START TRANSACTION;

-- 1. 申请行级排他锁并读取当前名额
SELECT capacity, enrolled FROM courses WHERE id = ? FOR UPDATE;

-- 2. 在应用层重新检查 (enrolled < capacity) 满足后执行更新与插入
UPDATE courses SET enrolled = enrolled + 1 WHERE id = ?;
INSERT INTO enrollments (student_id, course_id) VALUES (?, ?);

-- 3. 提交事务并释放行锁
COMMIT;
```
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-d', 'appendix-d', 'doc:hello-system-appendix', '附录D Vue 3 核心概念与心智速查', '# 附录D Vue 3 核心概念与心智速查

| 概念 | 核心机制与定位 | 典型使用场景 | 常见误区 |
| :--- | :--- | :--- | :--- |
| **ref** | 带有 `.value` 访问器属性的响应式包装对象 | 基础类型（数字、字符串、布尔值）或重新分配引用的对象 | 在 JS 逻辑中遗漏 `.value` 访问 |
| **reactive** | 基于 ES6 `Proxy` 的深层响应式代理 | 聚合表单对象 | 解构赋值后丢失响应式追踪 |
| **computed** | 具有依赖自动收集与缓存特性的派生状态 | 过滤列表、计算总学分、判定按钮禁用状态 | 在 computed 中执行异步请求或修改其他状态 |
| **watch** | 监听状态变化并执行副作用的观察者 | 数据变化时调用外部 API、写本地存储 | 用 watch 监听源数据并手动同步派生状态 |
| **Props** | 父组件向子组件单向传递的入参 | 传递只读数据与配置项 | 子组件尝试直接修改 Prop 变量的引用 |
| **Emit** | 子组件向父组件抛出的自定义事件 | 按钮点击、状态变更通知 | 跨多层嵌套组件过度层层透传 |
| **Pinia** | 模块化的应用级状态管理库 | 用户会话状态、全局通知、跨视图共享数据 | 将仅在局部组件使用的临时状态放入全局 Store |
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-e', 'appendix-e', 'doc:hello-system-appendix', '附录E 面向对象核心思想速查', '# 附录E 面向对象核心思想速查

- **不变量（Invariant）**：对象在其整个生命周期中任何可观察时刻都必须恒为真的业务完整性规则；
- **封装（Encapsulation）**：隐藏内部表示细节，将状态流转收敛于受控的行为方法中；
- **组合（has-a）**：一个类持有另一个类的引用以复用功能，耦合度低于继承；
- **依赖（uses-a）**：一个类在方法参数或执行过程中临时使用另一个类的功能；
- **继承（is-a）**：子类型对父类型的严格扩展，必须满足里氏替换原则（LSP）；
- **多态（Polymorphism）**：同一抽象调用在运行期根据接收对象的实际类型动态执行对应行为；
- **接口（Interface）**：脱离具体实现的抽象行为契约，是实现依赖倒置原则（DIP）的重要工具。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-f', 'appendix-f', 'doc:hello-system-appendix', '附录F HTTP 语义与 RESTful API 设计速查', '# 附录F HTTP 语义与 RESTful API 设计速查

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
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-g', 'appendix-g', 'doc:hello-system-appendix', '附录G 计算机专业核心课程图谱与进阶路线', '# 附录G 计算机专业核心课程图谱与进阶路线

《Hello System》帮助你建立了软件系统的横向连接。在后续学习中，建议结合本科核心基础课程进行纵向深入：

```mermaid
flowchart TD
    System["《Hello System》软件系统全景"]
    
    CS1["计算机组成原理
深入 CPU 指令集、流水线、缓存一致性与底层硬件交互"]
    CS2["操作系统
深入进程线程调度、虚拟内存管理、文件系统与系统调用"]
    CS3["计算机网络
深入 TCP/IP 协议栈、拥塞控制、DNS、TLS 与路由算法"]
    CS4["数据库系统原理
深入 查询优化器内核、B+树物理存储引擎、Aries 恢复算法与分布式事务"]
    CS5["软件工程与架构
深入 领域驱动设计 (DDD)、微服务拆分、设计模式与大型系统重构"]

    System --> CS1
    System --> CS2
    System --> CS3
    System --> CS4
    System --> CS5
```
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-h', 'appendix-h', 'doc:hello-system-appendix', '附录H 核心技术术语中英对照表', '# 附录H 核心技术术语中英对照表

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
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-epilogue', 'epilogue', 'doc:book-hello-system', '后记: 愿你建造出坚固而优美的系统', '# 后记: 愿你建造出坚固而优美的系统

计算机软件工程是一门充满创造力与理性之美的学科。

在微观层面，软件系统受制于物理硬件的客观规律——时钟周期、内存寻址、网络延迟与介质故障；  
在宏观层面，软件工程师通过一层又一层的抽象与封装，将纷繁复杂的现实需求组织为高内聚、低耦合的模块与服务。

软件工程的独特魅力，不在于彻底摆脱物理世界，而在于**我们能够运用严密的心智模型隐藏不必要的细节，同时在抽象发生泄漏时，能够自如地看清每一层齿轮是如何精密咬合的**。

愿《Hello System》成为你探索计算机系统世界的一块踏脚石。

在未来的学习与工程实践中，保持对系统本质的好奇，不断雕琢你的设计，建造出坚固、严谨而优美的软件系统！
', 'public', '2251213429@qq.com', 10, 0, 215, '');

COMMIT;
