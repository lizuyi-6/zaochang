-- Hello System · 图解软件系统
-- 从一次点击开始，理解一个完整软件系统如何运行
-- 全书 60 章、6 个顶层部分、序言、序章、附录与后记完整节点。

BEGIN TRANSACTION;
DELETE FROM reading_progress WHERE book_id LIKE 'doc:hello-system-%' OR book_id = 'doc:book-hello-system' OR last_chapter_id LIKE 'doc:hello-system-%' OR last_chapter_id = 'doc:book-hello-system';
DELETE FROM docs WHERE id LIKE 'doc:hello-system-%' OR id = 'doc:book-hello-system';

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:book-hello-system', 'hello-system', NULL, 'Hello System · 图解软件系统', '# Hello System · 图解软件系统

### 从一次点击开始，理解一个完整软件系统如何运行

> 一套真正将面向对象、分层架构、Vue 响应式前端、关系数据库范式、事务并发控制与全链路 HTTP 调用贯通的图解软件系统教材。

---

## 这本书为什么存在？

在大学计算机专业的课程表上，我们通常会看到一组彼此割裂的核心课程：
- 编程语言与面向对象（Java / C++）
- 数据结构与算法
- 数据库原理与 SQL
- 前端 Web 开发（HTML / CSS / JavaScript / Vue）
- 软件工程与系统架构

然而，当读者即将走出校门或着手构建一个真正具有工业特性的软件系统时，最强烈的困惑往往不是某一个语法细节，而是**系统全貌的缺失**：
- 浏览器里的 JavaScript 变量究竟是怎样跨越网线变成数据库里的物理磁盘记录的？
- 为什么要在前端写一个组件，在后端写 Controller、Service、Repository 三个类，再去数据库建一张表？把 SQL 直接写在前端点击事件里不行吗？
- 什么是“状态”？为什么内存里的对象会丢失，而数据库里的表不会？
- 当两个用户在同一瞬间点击选课系统的最后一个名额时，到底是谁在决定谁能选上？是前端的代码、后端的代码，还是数据库的锁？

《Hello System》的使命是：**打破课程之间的壁垒，让你在脑海中建立一条从鼠标点击到磁盘物理扇区写入、再原路返回屏幕像素重绘的、完整可单步运行的软件系统全景链路。**

```mermaid
flowchart LR
    User["用户点击"] --> Browser["浏览器 / DOM"]
    Browser --> Vue["Vue 响应式组件"]
    Vue --> HTTP["HTTP / JSON 报文"]
    HTTP --> Backend["Controller / Service / Repository"]
    Backend --> DB["关系数据库 / 事务 / 磁盘"]
    DB --> Backend
    Backend --> HTTP
    HTTP --> Vue
    Vue --> Browser
    Browser --> User["呈现：选课成功"]
```

---

## 贯穿全书的主线项目：Mini Campus

全书拒绝碎片化、彼此无关的玩具示例，只专注打磨一个真实、微型但具备全套工业级特征的系统——**Mini Campus 校园选课系统**。

你将见证它：
1. 从 10 行散落变量的控制台脚本开始；
2. 遭遇数据撕裂与业务混乱，被迫演化出类、封装与分层（Controller / Service / Repository）；
3. 遭遇 DOM 泥潭，被迫演化出响应式、组件化与单向数据流；
4. 遭遇数据冗余与更新异常，被迫演化出关系范式、B+ 树索引与 ACID 事务；
5. 遭遇网络延迟、并发争抢与重放攻击，被迫演化出幂等性、行级锁、异常流水线与统一契约；
6. 最终完成 320 毫秒内全链路的高速闭环。

---

## 全书架构全景导航

- **序章：一次点击**
- **第一部分：程序开始变大 (01 ~ 12)** —— 从十行脚本到面向对象与三层架构演进
- **第二部分：页面开始变复杂 (13 ~ 24)** —— 原生 DOM 的泥潭与现代响应式前端的诞生
- **第三部分：数据需要一个真正的家 (25 ~ 37)** —— 关系模型、SQL 声明式、范式修复、索引与事务并发
- **第四部分：前端第一次遇见后端 (38 ~ 46)** —— HTTP 协议约定、REST API 设计、Service 边界与 DTO 演变
- **第五部分：真实系统开始反抗 (47 ~ 55)** —— 非法数据防御、异常传播、并发超卖、幂等重放与测试防线
- **第六部分：重新走完那几百毫秒 (56 ~ 60)** —— 完整请求全景穿透、架构演进反思与系统本质提炼
- **附录 (A ~ H)** —— 项目结构、ER 关系图、核心 SQL、概念速查与演进路线图
', 'public', '2251213429@qq.com', 1, 1, 215, '从一次点击开始，理解一个完整软件系统如何运行——以校园选课系统 Mini Campus 为主线，图解面向对象、分层架构、Vue 响应式、关系数据库与事务并发全链路。');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-preface', 'preface', 'doc:book-hello-system', '序言: 还原软件系统的本来面目', '# 序言: 还原软件系统的本来面目

## 计算机专业学生的典型困境

在计算机专业的经典教学体系中，知识点通常是沿着学科分支纵向深入的：

在面向对象课上，你学习了继承、虚函数表和设计模式；在数据库课上，你推导了关系代数、第三范式和 B+ 树分裂；在前端课上，你练习了虚拟 DOM、响应式拦截和组件生命周期；在网络课上，你背诵了三次握手、滑动窗口和状态码。

然而，当这些知识独立存在时，它们就像散落在车间地面上的齿轮、活塞和轴承。很多同学即便在每门课上都取得了优异的成绩，但当面对一个真实的系统需求时，仍然会产生强烈的无力感：

- 为什么在这个地方修改变量不会引起界面的刷新？
- 为什么后端的 Service 已经抛出了异常，数据库里却依然插入了半条记录？
- 为什么两个人同时点击按钮会产生名额超卖，明明前端已经写了 `disabled` 禁用？
- 为什么 Controller 不能直接写 SQL？每一层之间倒腾对象的意义到底是什么？

这些问题往往落在了课程体系的缝隙之中。没有任何一门单一的学科会专门负责把这些碎片组装成一个活着的、正在运行的现代 Web 软件系统。

---

## 教学哲学：让知识像是被你重新发明的

本书彻底摒弃“定义 $\to$ 特点 $\to$ API $\to$ 示例”的枯燥灌输模式。

如果一上来就告诉你“面向对象有三大特性”、“三层架构分为 Controller/Service/Repository”、“数据库必须满足范式”、“前端必须使用响应式”，这实际上是在强迫你死记硬背前人花了数十年才摸索出来的工程沉淀。

在本书中，我们遵循一条截然不同的**认知冲突演进路线**：

$$\text{现实需求} \to \text{最自然的直觉方案} \to \text{系统规模扩张} \to \text{直觉方案彻底撞墙} \to \text{明确根本矛盾} \to \text{新概念/新架构破土而出} \to \text{建立脑内运行模型}$$

我们将从一个任何人都能看懂的十行脚本开始。随着业务的扩大，我们将亲手制造混乱、亲身体会失控、亲眼见证数据被撕裂。

当旧的方案在复杂性的重压下彻底崩溃时，新的抽象概念将不再是考试大纲里的冷冰冰条目，而是化身为解决当前危机的不可或缺的解药。

---

## 写作原则与边界声明

1. **坚持真实的演进感**：系统架构不是被神圣规定的，而是为了解决具体工程问题演化出来的。在只有十行代码时，架构是纯粹的累赘；在十万行代码时，架构是唯一的救生索。
2. **区分概念、语言与具体实现**：我们必须严格区分什么是计算机科学与软件工程的通用思想（如不变量、抽象数据类型、声明式查询、协议契约），什么是某种语言的特有语法（如 Java 的 `interface`、C++ 的纯虚类），什么是特定运行时或数据库的私有实现（如 V8 的 Hidden Class、InnoDB 的页分裂、Vue 3 的 Proxy 拦截）。
3. **零装饰性网络流行语与表情符号**：保持清晰、严谨、具有结构感与推导感的教科书质感。
4. **贯穿始终的可运行模型**：全书围绕唯一的项目 **Mini Campus** 持续演进，拒绝每次更换玩具案例，让读者完整体验一个系统从小苗成长为工业巨木的全生命历程。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-prologue', 'prologue', 'doc:book-hello-system', '序章: 一次点击', '# 序章: 一次点击

这是一个极其普通的星期一上午。

在大学宿舍里，学生李雷打开浏览器，登录进校园选课系统（Mini Campus）。屏幕中央展现出一个极度简洁的卡片界面：

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

李雷移动鼠标光标，对准那个蓝色的“选课”按钮，轻轻按下了左键。

鼠标微动开关闭合，产生了一次微秒级的硬件电气中断。

大约 320 毫秒之后。

屏幕上的“选课”按钮变为了灰色的不可点击状态，旁边亮起了一行字迹清晰的绿色文本：

**“选课成功。您已成功选修本课程，当前课程剩余名额：0。”**

---

## 几百毫秒背后的时空折跃

对于坐在屏幕前的用户而言，这仅仅是一次短暂的视觉等待。

然而，如果我们将这 320 毫秒放大数亿倍，在微观的计算机逻辑世界里，一场跨越操作系统、内存状态、网络协议栈、分布式边界、关系代数与图形渲染树的宏大接力刚刚完成了一次完美的闭环。

让我们将这一瞬间发生的全部交互以一张完整的时序图展现出来：

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户 (李雷)
    participant DOM as 浏览器渲染引擎 (DOM)
    participant Vue as 前端框架运行时 (Vue 3)
    participant Net as 操作系统网络栈 (HTTP / TCP)
    participant Ctrl as 后端接入控制器 (Controller)
    participant Svc as 业务逻辑层 (Service)
    participant Repo as 数据持久层 (Repository)
    participant DB as 关系型数据库 (Database)

    User->>DOM: 1. 鼠标物理点击
    DOM->>Vue: 2. 浏览器事件循环捕获 click 事件
    Note over Vue: 3. 前端响应式状态更新，设置 loading 锁<br/>打包内存对象为 JSON 格式字节流
    Vue->>Net: 4. 发起 HTTP POST /api/enrollments
    Note over Net: 5. 封装 TCP 段与 IP 数据报<br/>电信号跨越校园网路由器与物理网线 (40ms)
    Net->>Ctrl: 6. Web 服务器接收字节流，反序列化为后端 DTO
    Note over Ctrl: 7. 执行基础参数校验与身份鉴权
    Ctrl->>Svc: 8. 调用选课业务方法 enroll(studentId, courseId)
    Note over Svc: 9. 开启 ACID 数据库事务<br/>编排业务规则 (名额校验、防重复选课)
    Svc->>Repo: 10. 请求带有排他锁的课程数据
    Repo->>DB: 11. 执行 SELECT ... FOR UPDATE (SQL)
    Note over DB: 12. B+ 树索引寻址定位数据页<br/>申请行级排他锁 (X-Lock)
    DB-->>Repo: 13. 返回当前课程实体数据
    Repo-->>Svc: 14. 映射为领域实体对象
    Note over Svc: 15. 实体执行业务状态跃迁 (enrolled 0 -> 1)
    Svc->>Repo: 16. 请求持久化修改与新增选课记录
    Repo->>DB: 17. 执行 UPDATE courses 与 INSERT enrollments
    Note over DB: 18. 顺序追加写入重做日志 WAL<br/>执行 COMMIT 事务提交，释放行锁
    DB-->>Repo: 19. 确认事务已物理落盘
    Repo-->>Svc: 20. 持久化成功
    Svc-->>Ctrl: 21. 业务流程执行成功
    Ctrl-->>Net: 22. 封装 HTTP 201 Created 响应报文 (JSON)
    Net-->>Vue: 23. 响应报文穿越网络回传，Promise 状态决议 (Resolve)
    Note over Vue: 24. 响应式依赖追踪系统被触发<br/>虚拟 DOM 树重新计算 Diff 并生成 Patch 补丁
    Vue->>DOM: 25. 最小化修改真实 DOM 节点属性与文本
    DOM-->>User: 26. 显卡光栅化重新绘制屏幕像素，呈现“选课成功”
```

---

## 这张图里藏着什么？

请先不要被图中密密麻麻的专业名词吓退。

仔细审视这条链路，你会发现它穿透了现代软件工程的六大核心领地：

1. **事件与渲染的世界（第 1 ~ 3 步，第 24 ~ 26 步）**：
   操作系统如何将硬件物理信号转化为浏览器的异步事件？JavaScript 引擎是如何感知数据变化的？为什么现代 Web 应用不再直接拼接 HTML 字符串，而是引入了响应式系统和组件化树？
2. **跨越机器边界的通信协议（第 4 ~ 6 步，第 22 ~ 23 步）**：
   运行在李雷笔记本电脑上的前端程序，与运行在学校机房机柜里的后端程序，存在于完全不同的内存地址空间中。它们之间是如何通过统一的 HTTP 协议与 JSON 数据格式达成默契的？
3. **后端的秩序与边界（第 7 ~ 10 步，第 14 ~ 16 步，第 20 ~ 21 步）**：
   面对数以万计涌入的请求，后端程序是如何避免沦为意大利面条式混乱代码的？Controller、Service、Repository 这些经典结构到底是在抵御什么风险？为什么同一份数据在不同的边界需要被包装成不同形状的对象？
4. **关系代数与存储的堡垒（第 11 ~ 13 步，第 17 ~ 19 步）**：
   数据为什么不能像 Excel 一样全部堆在一张表里？主键、外键和关系范式到底在修复什么结构性缺陷？面对海量数据，B+ 树索引是如何将全表扫描的绝望降低为几次毫秒级寻址的？
5. **并发与不变量的捍卫（第 12 步，第 18 步）**：
   如果此时有另一名学生韩梅梅在完全相同的毫秒点击了同一个按钮，系统凭什么保证这仅剩的 1 个名额绝不会被两个人同时选走？事务的原子性（Atomicity）与隔离性（Isolation）在底层到底是如何通过锁与日志来实现的？
6. **故障、异常与容灾（隐藏在每一步的支线中）**：
   如果在第 17 步执行完后机房突然断电，系统会不会陷入“名额少了一个，学生列表里却没有名字”的灾难？软件系统是如何在不确定的物理硬件世界中维持确定性的？

---

## 我们的探索旅程

在这本书中，我们只做一件事：

**把上面这张时序图中的每一个黑盒，一个一个拆开，看清它们内部的机械齿轮。**

我们不会在第一章就将完美的“标准答案”强塞给你。相反，我们将从没有框架、没有分层、没有数据库、只有几行散落代码的荒原出发。我们将亲手经历失控，亲手重构系统，直到上面所有的机制像自然法则一样，不可避免地从你的指尖诞生。

现在，深吸一口气。让我们忘记所有的框架和协议，退回到一切程序的起点。

开启第一部分：**程序开始变大**。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-1', 'part-1', 'doc:book-hello-system', '第一部分 · 程序开始变大', '', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-01-why-architecture', '01-why-architecture', 'doc:hello-system-part-1', '第01章 如果程序只有一百行，我们为什么需要架构？', '# 第01章 如果程序只有一百行，我们为什么需要架构？

## 1. 最初情境：一个极其直接的选课程序

让我们暂时忘记浏览器、忘记网络通信、忘记数据库、忘记所有高深莫测的设计模式。

退回到计算机程序设计的最原点：假设我们现在只需要在控制台环境里模拟一次最基本的选课操作。此时没有几十毫秒的网络延迟，没有数以万计并发请求的冲撞，只有一个正在执行的操作系统进程，以及一块由该进程独占的连续内存空间。

在这样的前提下，一个程序员最自然、最符合直觉的代码只需要十来行：

```java
public class MiniCampus {
    public static void main(String[] args) {
        String studentName = "李雷";
        int studentId = 1001;

        String courseName = "计算机系统导论";
        int courseCapacity = 1;
        int courseEnrolled = 0;

        // 模拟用户点击选课
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

请仔细阅读上面这段代码。

它能正常工作吗？

答案是：**它不仅完全能够工作，而且在当前尺度下，它是近乎完美的。**

从机器运行的物理视角来看：
- 所有的局部变量（`studentId`, `courseCapacity`, `courseEnrolled`）都紧凑地分配在当前线程执行栈帧的局部变量表中；
- 没有多余的方法调用跳转，没有跨对象的间接指针寻址，没有动态分派的虚方法表开销；
- CPU 只需要顺序读取指令，执行极少数几次寄存器加载、比较分支跳转与算术自增，在短短几个纳秒之内就能彻底完成全部计算并输出结果。

此时，如果有一个资深工程师走过来对你说：
> “你这段代码太简陋了。它没有分层，没有接口，没有依赖注入，没有将领域对象与持久化操作解耦，严重违背了高内聚低耦合原则。”

你应该毫不犹豫地拒绝他的建议。

因为在十行代码的微观尺度上，**任何架构设计都是纯粹的浪费与自作聪明**。

---

## 2. 为什么无架构时代如此美好？

软件工程领域有一条容易被忽视的基本常识：**架构不是免费的午餐，抽象是有物理代价和心智成本的。**

在十行代码的小程序里，无架构方案拥有三大不可替代的压倒性优势：

1. **认知负荷几乎为零**：人类的大脑工作记忆容量通常只能同时维持 $7 \pm 2$ 个离散信息块。当程序只有十行时，你的眼睛可以在一秒钟内扫过整个控制流，大脑可以在单核状态下精确推演出每一行代码执行前后的全部内存状态变化。
2. **极短的修改路径**：如果你想把选课提示文案改掉，你只需要在第 14 行直接修改字符串字面量；如果你想把容量初始值改成 10，你只需直接修改第 7 行的数字。你不需要跨越 4 个文件、修改 2 个接口定义、再去更新 3 个测试用例。
3. **零间接寻址与编译摩擦**：代码结构与底层机器的物理执行模型高度贴近，编译器和解释器能够做出最直接、最高效的寄存器分配与内联优化。

如果一个软件系统的生命周期只持续一天，如果一个程序的需求永远固定在一张纸上，那么“最快、最直接、把所有逻辑写在一个 main 函数里”就是最具工程合理性的最优解。

然而，软件世界的残酷之处恰恰在于：**软件从来不会停在第一天。**

---

## 3. 第一次规模扩张：第二门课与第二个学生

现实世界的需求总是像潮水一样不断涌来。

教务处在看到你的演示后非常满意，随即提出了第一轮需求扩张：
1. 系统中不再只有一门课程，现在新增了一门《离散数学基础》，限选 60 人；
2. 系统中不再只有李雷一个学生，新加入了一个学生韩梅梅；
3. 李雷需要先选《计算机系统导论》，再选《离散数学基础》；
4. 韩梅梅也需要选《计算机系统导论》。

沿着我们原有的直觉路线，最轻车熟路、最不费脑子的实现方式是什么？

复制、粘贴、声明新变量：

```java
public class MiniCampusExpansion {
    public static void main(String[] args) {
        // 学生 1 的信息
        String s1_name = "李雷";
        int s1_id = 1001;

        // 学生 2 的信息
        String s2_name = "韩梅梅";
        int s2_id = 1002;

        // 课程 1 的信息
        String c1_name = "计算机系统导论";
        int c1_capacity = 100;
        int c1_enrolled = 0;

        // 课程 2 的信息
        String c2_name = "离散数学基础";
        int c2_capacity = 60;
        int c2_enrolled = 0;

        // 场景 1: 李雷选课程 1
        System.out.println("学生 [" + s1_name + "] 尝试选择: " + c1_name);
        if (c1_enrolled < c1_capacity) {
            c1_enrolled++;
            System.out.println("选课成功！" + c1_name + " 当前人数: " + c1_enrolled);
        } else {
            System.out.println("选课失败：名额已满。");
        }

        // 场景 2: 韩梅梅选课程 1
        System.out.println("学生 [" + s2_name + "] 尝试选择: " + c1_name);
        if (c1_enrolled < c1_capacity) {
            c1_enrolled++;
            System.out.println("选课成功！" + c1_name + " 当前人数: " + c1_enrolled);
        } else {
            System.out.println("选课失败：名额已满。");
        }

        // 场景 3: 李雷选课程 2
        System.out.println("学生 [" + s1_name + "] 尝试选择: " + c2_name);
        if (c2_enrolled < c2_capacity) {
            c2_enrolled++;
            System.out.println("选课成功！" + c2_name + " 当前人数: " + c2_enrolled);
        } else {
            System.out.println("选课失败：名额已满。");
        }
    }
}
```

请停下来观察这段代码。

它依然能精确运行并输出正确结果。代码行数从 15 行增加到了大约 45 行。对于一个具有基本编程能力的读者来说，阅读它依然没有任何难度。

但请注意：**系统的地基在这一刻已经悄悄出现了第一道裂缝。**

---

## 4. 第一次撞墙：业务规则的微小变动

我们来做一个极其真实的推演。

就在上面的代码写完的第二天，教务处突然下发了一份紧急红头文件：

> “为了保障教学质量与重修补考通道，从即日起，所有课程的实际可选名额不得使用全部原始容量，必须严格预留 $10\%$ 的名额给重修学生。即实际允许选课的最大上限为 $\lfloor \text{capacity} \times 0.9 \rfloor$。”

现在，请思考：为了让现有系统满足这个新规则，你需要做什么？

你必须在代码中，**手动寻找到所有的选课判断分支**，并将原有的条件逐一替换：

$$\text{旧条件: } \text{enrolled} < \text{capacity} \quad \implies \quad \text{新条件: } \text{enrolled} < (\text{int})(\text{capacity} \times 0.9)$$

在当前 45 行的小程序里，你只需要修改 3 个地方。你花了一分钟完成了修改，觉得这完全不是问题。

现在，我们将系统尺度放大到一所普通大学的真实规模：
- 全校开设 **500 门课程**；
- 全校共有 **12,000 名学生**；
- 在整个教务系统的各个功能模块中（网上自主选课、管理员后台补选、辅修专业选课、跨院系选课），类似的选课判断逻辑被复制粘贴了 **1,200 次**。

现在，灾难降临了：

1. **修改成本的线性爆炸**：你需要打开几十个文件，肉眼定位这 1,200 处 `if` 语句，重复进行 1,200 次手工修改；
2. **静默且无法检测的人为失误**：在这 1,200 次枯燥的手工修改中，只要有一次手误，比如在第 843 处把 `c32_capacity` 不小心写成了 `c31_capacity`，或者漏乘了 `0.9`——**编译器绝对不会报出任何语法错误**。

因为变量类型完全合法，算术表达式完全有效。

这个 Bug 将如同一枚深水炸弹，静静潜伏在代码库深处，直到正式选课当天，某位同学选了一门已经满员的课程并导致系统数据冲突时，才轰然引爆。

```mermaid
flowchart TD
    Req["现实世界概念扩张
(学生数 + 课程数增加)"] --> Copy["朴素应对手段: 复制粘贴逻辑片段"]
    Copy --> Spread["同一条业务判断规则到处扩散
(1200 处重复的 if 判断)"]
    Spread --> Change["外部需求微小调整
(容量需预留 10% 重修名额)"]
    Change --> HumanError["大规模手工修改导致不可避免的疏漏
(某处漏改或变量名敲错)"]
    HumanError --> Crash["系统在没有语法报错的情况下
陷入无声的逻辑崩溃"]
```

---

## 5. 尝试修补：过程式函数的登场

面对上述灾难，任何一个有经验的过程式程序员都会立刻做出第一轮自发重构：

> “我们不应该到处复制那个 `if` 判断，我们应该把它提取成一个独立的函数（Function）！”

我们尝试编写一个全局选课函数：

```java
public class ProceduralMiniCampus {

    // 将选课规则集中封装为一个纯过程函数
    public static boolean tryEnroll(int capacity, int enrolled) {
        int actualLimit = (int)(capacity * 0.9);
        return enrolled < actualLimit;
    }

    public static void main(String[] args) {
        String c1_name = "计算机系统导论";
        int c1_capacity = 100;
        int c1_enrolled = 0;

        // 使用函数进行判断
        if (tryEnroll(c1_capacity, c1_enrolled)) {
            c1_enrolled++; // 注意：数据自增仍然在外部手动执行！
            System.out.println("选课成功！");
        } else {
            System.out.println("选课失败！");
        }
    }
}
```

这个修补方案有效吗？

它确实解决了一半的问题：关于“名额上限计算规则”的逻辑现在只存在于 `tryEnroll` 函数这一个地方。如果未来教务处要把预留比例从 $10\%$ 改成 $15\%$，我们只需要修改该函数内部的一行代码。

但是，**另一半更致命的问题依然毫无着落**：

请仔细观察 `if (tryEnroll(...))` 内部的代码：
`tryEnroll` 仅仅返回了一个布尔值 `true`，而真正改变系统状态的动作——`c1_enrolled++`，依然赤裸裸地暴露在外部的主流程里！

如果外部调用者写出了这样的代码：
```java
// 某位疲惫的程序员在熬夜赶工时写下的逻辑：
if (tryEnroll(c1_capacity, c1_enrolled)) {
    c2_enrolled++; // 致命手误：判断了课程 1，却把课程 2 的已选人数增加了！
}
```
编译器依然保持沉默。

问题不仅没有彻底解决，反而变得更加隐晦：**判断逻辑被抽离到了函数里，但数据状态的物理修改依然散落在各个角落。两者在时空上是脱节的。**

---

## 6. 横向验证：相同困境在其他领域的重现

为了验证这并不是校园选课系统独有的偶然现象，我们迅速将视线投向两个完全不同的软件场景：

### 场景 A：银行账户转账系统
在最原始的脚本中：
```java
double account1_balance = 1000.0;
double account2_balance = 500.0;

// 转账 200 元
if (account1_balance >= 200.0) {
    account1_balance -= 200.0;
    account2_balance += 200.0;
}
```
当全行拥有 100 万个账户、涉及活期、定期、理财、外汇多种转账规则时，如果每次扣减余额与增加余额都作为裸露的代码行散落在各处，哪怕某处漏写了一行 `account2_balance += ...`，系统就会凭空蒸发资金。

### 场景 B：简易文件下载管理器
```java
String task1_url = "https://example.com/file1.zip";
int task1_totalBytes = 10485760;
int task1_downloadedBytes = 0;
boolean task1_isPaused = false;
```
当同时存在 50 个下载任务、支持暂停、恢复、重试、限速时，状态判断与字节累加的逻辑如果散落在各个定时器回调中，极易出现“把任务 A 的下载进度累加到任务 B 头上”的离奇 Bug。

---

## 7. 深入机制：复杂度的本质是什么？

至此，我们终于有资格给出一个严肃的软件工程命题：

**软件系统的复杂度，究竟是如何随规模增长的？**

认知心理学与计算机科学的研究表明，软件复杂度的根源在于**状态组合与依赖关系的非线性爆炸**。

假设一个系统中有 $n$ 个相互独立的散落变量：
如果每个变量只有 2 种可能的状态，整个系统在理论上可以陷入的状态空间大小是：

$$S = 2^n$$

当 $n = 3$ 时，$S = 8$，人类的大脑可以轻松枚举全部可能；  
当 $n = 30$ 时，$S = 2^{30} \approx 10^9$，系统的状态组合已经超越了任何单个程序员的认知极限；  
当 $n = 1000$ 时，没有任何人能断言某一行赋值语句是否会在某种极端输入下引发全局雪崩。

```mermaid
flowchart LR
    subgraph ZeroArch ["无架构状态 (全连通图)"]
        V1["变量 1"] <--> V2["变量 2"]
        V2 <--> V3["变量 3"]
        V3 <--> V1
        V1 <--> V4["变量 4"]
        V2 <--> V4
        V3 <--> V4
        note1["依赖连线数 = n(n-1)/2
复杂度呈平方级爆炸"]
    end

    subgraph Structured ["结构化架构状态 (分块自治)"]
        subgraph BoxA ["模块 A"]
            BA1["变量 1"] <--> BA2["变量 2"]
        end
        subgraph BoxB ["模块 B"]
            BB1["变量 3"] <--> BB2["变量 4"]
        end
        BoxA <==>|定义清晰的极简通道| BoxB
        note2["内部高度自洽
对外暴露极少交互通道"]
    end
```

架构的真正使命，**绝不是为了让机器把这 $2^n$ 种状态运行得更快**，而是通过在代码中构筑一道道坚固的“防火墙”，把庞大的系统强行切分成若干个孤立、自治的微型子空间。

让每一个子空间内部只有 3~5 个变量（状态空间控制在人类大脑可完全掌控的极小范围内），并严格限制子空间之间的相互作用通路。

---

## 8. 误区澄清

> 误区：
> “优秀的架构师写出的程序，性能一定比直接写面向过程的脚本更高。”
> 
> 事实是：
> 在绝大多数情况下，引入架构不仅不能提升纯运行性能，反而会带来微小的性能损耗（如栈帧开销、虚函数间接跳转、对象内存对齐与引用寻址）。
> 
> **架构是用可接受的微小运行性能损耗，去购买人类在面对超大规模系统时的生存能力与系统可维护性。**

---

## 9. 本章心智模型复盘

在这一章结束时，请在脑海中建立以下稳固的认知模型：

1. **尺度的重要性**：在十行代码的尺度下，追求架构是愚蠢的过度设计；但在大型团队和持续演化的真实系统中，没有架构就是自杀。
2. **过程式提取的局限**：仅仅把判断规则提取为全局函数，并没有解决“数据与状态变更逻辑在空间上脱节”的根本问题。
3. **架构的终极目标**：压制状态组合爆炸，保护人类极其有限的大脑工作记忆。

那么，既然散落的变量是造成状态组合失控的罪魁祸首，我们究竟该如何组织这些数据？计算机底层又是如何看待这些变量的？

下一章，我们将深入观察那些散落一地的变量，亲手推导数据组织方式的演进。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-02-variables-out-of-control', '02-variables-out-of-control', 'doc:hello-system-part-1', '第02章 变量为什么开始失控？', '# 第02章 变量为什么开始失控？

## 1. 真实问题切入：隐式关联（Implicit Association）

在上一章中，为了描述两门课程，我们写下了这样的变量声明：

```java
String c1_name = "计算机系统导论";
int c1_capacity = 100;
int c1_enrolled = 0;

String c2_name = "离散数学基础";
int c2_capacity = 60;
int c2_enrolled = 0;
```

现在，请闭上眼睛，从底层计算机硬件与编译器的视角，思考一个极其本质的问题：

**计算机到底通过什么机制知道，`c1_name`、`c1_capacity` 和 `c1_enrolled` 描述的是同一个现实实体？**

答案可能会让你震惊：**计算机根本不知道，也不在乎。**

在编译器生成的符号表与底层虚拟内存的物理布局中，这三个变量完全平权、完全孤立：

```text
线程执行栈 / 局部变量表内存视图:
[ 栈帧偏移 Slot 0 ] -> 存放引用，指向字符串常量池中的 "计算机系统导论" (变量名: c1_name)
[ 栈帧偏移 Slot 1 ] -> 存放 32 位整型数值 100 (变量名: c1_capacity)
[ 栈帧偏移 Slot 2 ] -> 存放 32 位整型数值 0   (变量名: c1_enrolled)
[ 栈帧偏移 Slot 3 ] -> 存放引用，指向字符串常量池中的 "离散数学基础" (变量名: c2_name)
[ 栈帧偏移 Slot 4 ] -> 存放 32 位整型数值 60  (变量名: c2_capacity)
[ 栈帧偏移 Slot 5 ] -> 存放 32 位整型数值 0   (变量名: c2_enrolled)
```

在物理层面上，Slot 0、Slot 1 和 Slot 2 之间没有任何指针互相连接，没有任何锁链把它们拴在一起。

它们之所以在人类的思维中属于“同一门课程”，**纯粹是因为程序员在键盘上敲代码时，一厢情愿地在它们的名字前面统一加上了 `c1_` 这个前缀字符串。**

这种完全依赖人类命名习惯和记忆力维持的关联，被称为**隐式关联（Implicit Association）**。

隐式关联是脆弱的代名词。只要程序稍微经历几次数据重排、交换或函数调用，这种虚幻的关联就会立刻被撕得粉碎。

---

## 2. 破坏性实验：撕裂隐式关联

让我们编写一个最小可运行实验，亲眼见证隐式关联是如何在一次看似平常的“数据交换”操作中引发数据错位的。

假设我们的教务系统需要根据教室排期，临时调换两门课程在展示列表中的顺序：

```java
public class ImplicitAssociationDisaster {

    public static void printCourse(String label, String name, int cap, int enrolled) {
        System.out.println(label + " -> 名称: " + name + ", 容量: " + cap + ", 已选人数: " + enrolled);
    }

    public static void main(String[] args) {
        // 初始状态：课程 1 是热门大课，已选 95 人；课程 2 是冷门小课，已选 5 人
        String c1_name = "计算机系统导论";
        int c1_capacity = 100;
        int c1_enrolled = 95;

        String c2_name = "古希腊哲学史";
        int c2_capacity = 30;
        int c2_enrolled = 5;

        System.out.println("=== 交换前初始状态 ===");
        printCourse("课程 1", c1_name, c1_capacity, c1_enrolled);
        printCourse("课程 2", c2_name, c2_capacity, c2_enrolled);

        // 业务需求：交换课程 1 和课程 2 的数据
        // 某位程序员在编写经典的三步交换逻辑时，不小心遗漏了最后一行：
        String tempName = c1_name;
        c1_name = c2_name;
        c2_name = tempName;

        int tempCapacity = c1_capacity;
        c1_capacity = c2_capacity;
        c2_capacity = tempCapacity;

        // 【致命遗漏】：程序员忘记了交换 enrolled 变量！
        // int tempEnrolled = c1_enrolled;
        // c1_enrolled = c2_enrolled;
        // c2_enrolled = tempEnrolled;

        System.out.println("
=== 交换后当前状态 ===");
        printCourse("课程 1", c1_name, c1_capacity, c1_enrolled);
        printCourse("课程 2", c2_name, c2_capacity, c2_enrolled);
    }
}
```

### 运行输出结果：
```text
=== 交换前初始状态 ===
课程 1 -> 名称: 计算机系统导论, 容量: 100, 已选人数: 95
课程 2 -> 名称: 古希腊哲学史, 容量: 30, 已选人数: 5

=== 交换后当前状态 ===
课程 1 -> 名称: 古希腊哲学史, 容量: 30, 已选人数: 95
课程 2 -> 名称: 计算机系统导论, 容量: 100, 已选人数: 5
```

### 深度剖析：
看！荒诞而致命的事故发生了：
- 《古希腊哲学史》原本只有 30 个名额，经历了一次残缺的交换之后，它的名字和容量被搬到了 `c1` 对应的变量中，但它的已选人数没有动。结果变成了：**容量 30 人的课程，已选人数居然高达 95 人（严重穿透不变量）！**
- 而原本火爆的《计算机系统导论》，其已选人数莫名其妙变成了 5 人。

最恐怖的是：**整个编译期没有任何警告，运行期没有任何报错抛出。**

因为对于计算机而言，它只是执行了几次普通的整数和字符串赋值。计算机没有任何物理手段能够理解：当你移动 `c1_name` 时，内存中遥远的 `c1_enrolled` 必须寸步不离地跟着一起移动。

```mermaid
classDiagram
    note "现实世界中：三者是一个具有统一生命周期的物理整体"
    class RealWorldEntity {
        +String name
        +int capacity
        +int enrolled
    }

    note "初级程序中的内存状态：完全离散，随时发生局部脱轨"
    class BrokenMemoryState {
        String c1_name -> "古希腊哲学史" (已换走)
        int c1_capacity -> 30 (已换走)
        int c1_enrolled -> 95 (未换走, 产生致命撕裂!)
    }
```

---

## 3. 第一次尝试修补：并行数组（Parallel Arrays）

很多初学者在经历过上述前缀变量的痛苦后，会很自然地想到第二个方案：

> “既然为每一门课单独声明变量会导致变量数量爆炸，那我们为什么不用数组呢？我们可以创建 3 个平行的数组，分别存放全校所有课程的名字、容量和已选人数！”

这就是在早期的 FORTRAN 和基础 BASIC 程序设计中极具代表性的**并行数组模式（Parallel Arrays）**：

```java
public class ParallelArrayCampus {
    public static void main(String[] args) {
        // 索引 i 处的元素，共同构成第 i 门课程的数据
        String[] names = new String[] { "计算机系统导论", "离散数学基础", "数据结构与算法" };
        int[] capacities = new int[] { 100, 60, 80 };
        int[] enrolleds = new int[] { 95, 60, 10 };

        // 打印第 1 门课程 (索引 0)
        System.out.println("课程 0: " + names[0] + ", 余量: " + (capacities[0] - enrolleds[0]));
    }
}
```

在最初的 10 分钟里，并行数组看起来非常优雅：
无论全校有 3 门课还是 3000 门课，我们的变量数量永远固定只有 3 个（`names`, `capacities`, `enrolleds`）。我们似乎用数组完美压制了变量的膨胀。

然而，一旦系统进入真实的业务交互，并行数组将迅速演变成一场噩梦。

---

## 4. 并行数组的三重绝境

### 绝境一：排序错位（Sorting Desynchronization）
教务处要求：“请在页面上按照课程容量从大到小对所有课程进行排序。”

在 Java 中，如果你调用现成的排序函数：
```java
// 错误尝试：直接排序容量数组
java.util.Arrays.sort(capacities);
```
结果是：`capacities` 数组内部的数字被重新排列了，但 `names` 和 `enrolleds` 留在原地没有动！
整个学校的课程名称与容量瞬间全部张冠李戴。

为了正确排序，你必须手写一个极其别扭的冒泡排序或双重交换算法，在比较容量时，**强迫手动同步交换另外两个数组对应的元素**：

```java
// 痛苦的手工联动排序
for (int i = 0; i < capacities.length - 1; i++) {
    for (int j = 0; j < capacities.length - 1 - i; j++) {
        if (capacities[j] < capacities[j + 1]) {
            // 必须连环交换 3 个数组，漏掉一个就全盘崩溃
            int tempCap = capacities[j];
            capacities[j] = capacities[j + 1];
            capacities[j + 1] = tempCap;

            String tempName = names[j];
            names[j] = names[j + 1];
            names[j + 1] = tempName;

            int tempEnr = enrolleds[j];
            enrolleds[j] = enrolleds[j + 1];
            enrolleds[j + 1] = tempEnr;
        }
    }
}
```

如果未来一门课程增加了“任课教师”、“学分”、“上课教室”、“上课时间”等另外 10 个属性，你就必须在内层循环里连续写 **13 组手工交换代码**。

### 绝境二：删除空洞与错位塌陷（Deletion Hole Compression）
如果某门课程被教务处停开需要删除：
你不能简单地将 `names[1] = null`，因为这会在数组中间留下空洞，导致后续遍历中断。

你必须把索引 1 之后的所有元素向前平移一位。这意味着：**你必须在 13 个平行的数组中同时执行数组拷贝平移！**

只要任何一个数组平移时偏移量算错一位，从那一项开始，全校后续所有课程的数据将发生不可逆的错行。

### 绝境三：跨函数传递的参数地狱
当你想编写一个帮助函数来处理选课时，你的函数签名必须把所有的平行数组全部接过来：

```java
public static boolean enrollCourse(int courseIndex, String[] names, int[] capacities, int[] enrolleds, String[] teachers, int[] credits) {
    // 冗长不堪且极易传错顺序的参数列表
    if (enrolleds[courseIndex] < capacities[courseIndex]) {
        enrolleds[courseIndex]++;
        return true;
    }
    return false;
}
```

---

## 5. 根本矛盾：从“变量数量”到“聚合身份”的认知跃迁

经历过上面两次惨痛的撞墙之后，我们终于可以推翻最初的幼稚判断：

> **初学者的直觉误判**：“系统混乱是因为变量的名字太多了。”  
> **深入后的本质真相**：“系统混乱的根本原因，不在于变量有多少个，而在于**原本逻辑上紧密捆绑为一个整体的数据，在物理存储上没有共同的身份（Identity），缺乏聚合约束。**”

计算机语言必须提供一种机制，允许程序员在代码中宣告：

> **“从现在起，这一个字符串和这两个整数，不再是三个散落的原子。它们是一个不可分割的分子，它们拥有共同的生命周期，它们在任何时候都必须被当成一个整体来寻址、传递、交换和销毁！”**

---

## 6. 引入新概念：复合数据类型与记录（Record / Struct）

在计算机科学中，这个能够将多个异构数据字段聚合为一个单一体的机制，被称为**记录（Record）**或**复合数据结构（Composite Data Type）**。

在 C 语言中，它被称为 `struct`；在现代 Java 中，我们可以使用只包含公开字段的数据载体类（或者现代 Java 16+ 的 `record`）：

```java
// 宣告一个全新的复合类型：CourseRecord
public class CourseRecord {
    public String name;
    public int capacity;
    public int enrolled;

    // 构造函数：诞生时强制捆绑所有组成字段
    public CourseRecord(String name, int capacity, int enrolled) {
        this.name = name;
        this.capacity = capacity;
        this.enrolled = enrolled;
    }
}
```

现在，见证结构化带来的巨大威力：

```java
public class StructuredCampus {
    public static void main(String[] args) {
        // 现在，我们拥有一个单一的 CourseRecord 数组，而不是 3 个分散的平行数组！
        CourseRecord[] courses = new CourseRecord[] {
            new CourseRecord("计算机系统导论", 100, 95),
            new CourseRecord("古希腊哲学史", 30, 5),
            new CourseRecord("数据结构与算法", 80, 10)
        };

        // 如果需要交换第 0 门课和第 1 门课：
        CourseRecord temp = courses[0];
        courses[0] = courses[1];
        courses[1] = temp;

        // 如果需要按容量排序：
        java.util.Arrays.sort(courses, (a, b) -> Integer.compare(b.capacity, a.capacity));

        // 打印验证
        for (CourseRecord c : courses) {
            System.out.println("课程: " + c.name + ", 容量: " + c.capacity + ", 已选: " + c.enrolled);
        }
    }
}
```

### 为什么这次不会再错位？
因为在物理内存中，`courses[0]` 保存的是一个指向堆内存中完整 `CourseRecord` 实例的单一指针（引用）。

当我们交换 `courses[0]` 和 `courses[1]` 时，我们仅仅交换了两个指针的指向。
位于堆内存中的那个由 `name`、`capacity` 和 `enrolled` 紧密咬合在一起的内存块，**其内部结构毫发无损**。

你再也不可能在不小心的情况下，把《古希腊哲学史》的名字换走了，却把《计算机系统导论》的已选人数留在了原地。

```mermaid
flowchart LR
    subgraph ArrayArea ["数组引用区 (一维线性指针)"]
        A0["courses[0]"]
        A1["courses[1]"]
    end

    subgraph HeapArea ["堆内存复合实体区 (牢不可破的整体)"]
        ObjA["CourseRecord 实例 A
[name: ''古希腊哲学史'']
[capacity: 30]
[enrolled: 5]"]
        ObjB["CourseRecord 实例 B
[name: ''计算机系统导论'']
[capacity: 100]
[enrolled: 95]"]
    end

    A0 --> ObjA
    A1 --> ObjB
```

---

## 7. 横向场景验证：银行客户账户建模

我们再次用银行场景检验这个新概念：

如果用并行数组管理客户：
```java
String[] clientNames = new String[] { "张三", "李四" };
String[] clientCardNos = new String[] { "62220201", "62220202" };
double[] clientBalances = new double[] { 50000.0, 120.0 };
String[] clientPasswordHashes = new String[] { "hash_abc", "hash_xyz" };
```
只要某次删除操作中漏删了 `clientPasswordHashes`，李四就会瞬间继承张三的银行卡密码。

而一旦定义了复合结构：
```java
public class BankAccountRecord {
    public String clientName;
    public String cardNo;
    public double balance;
    public String passwordHash;
}
```
无论数据如何在队列、网络、缓存中穿梭，属于张三的密码和余额永远与其身份死死绑定在一起。

---

## 8. 概念与具体语言实现的边界

必须向读者严正指出：**“将数据结构化聚合”是计算机科学中独立于任何具体编程语言的普适思想。**

不同语言为了提供这种能力，采用了不同的语法设施和底层内存排布策略：

| 语言 | 语法设施 | 底层内存排布机制与特性 |
| :--- | :--- | :--- |
| **C 语言** | `struct Course { ... };` | 纯连续物理字节块，字段按字节对齐（Padding）紧凑排列，无任何额外运行时对象头开销。支持直接进行内存拷贝（`memcpy`）。 |
| **C++** | `struct` / `class` | 默认值语义，可在栈上直接分配连续结构体数组，具有极高的缓存命中率（Cache Locality）。 |
| **Java** | `class CourseRecord` | 引用语义。对象分配在堆上，带有 8~16 字节的对象头（Mark Word 与 Klass 指针）。数组内部存放的是引用的指针数组。 |
| **TypeScript** | `interface Course { ... }` | 纯编译期静态类型契约，在编译为 JavaScript 后被彻底擦除，运行时退化为普通的 V8 动态 Hash 字典/隐藏类对象。 |
| **Python** | `@dataclass` | 运行时通过类字典（`__dict__`）组织属性的动态结构载体。 |

> **关键认知**：
> 不要把 Java 的 `new Class` 当作结构化数据的唯一形式。面向对象只是这一思想在特定工程历史时期的延伸。

---

## 9. 边界与反例：纯数据结构依然没有解决什么？

在欢庆我们解决了数据错位问题的同时，我们必须保持工程师的清醒：

**把数据打包成 `CourseRecord`，真的能让我们高枕无忧吗？**

请看下面这段完全合法的代码：

```java
public class BrokenInvariantWithStruct {
    public static void main(String[] args) {
        CourseRecord os = new CourseRecord("操作系统", 50, 50); // 已经满员

        // 在系统某个阴暗的角落，某个刚入职的实习生写下了这行代码：
        os.enrolled = -100; // 灾难：直接越权赋值为负数！

        // 另一个模块写下了：
        os.enrolled = 9999; // 灾难：直接突破容量上限！
    }
}
```

由于 `CourseRecord` 内部的字段全部是公开裸露的（`public`），它本质上依然是一个**被动的、毫无防御能力的木桶**。

任何人都可以从任何地方伸手把木桶里的水倒掉，或者往木桶里倒进剧毒的脏数据。

---

## 10. 本章心智模型复盘与下一章起点

> **此时，你脑中的模型应该变成：**
> 1. **隐式关联是脆弱的**：绝不要使用前缀变量或并行数组来管理具有共同生命周期的数据；
> 2. **记录结构建立了实体的聚合身份**：它保证了数据在移动、交换、传递时永远作为整体行动；
> 3. **新危机的浮现**：纯粹的数据聚合只解决了**数据空间形态**的问题，但对**数据的修改规则**毫无防御力。

我们把数据关进了一个盒子里，但谁来阻止外部代码随意往盒子里扔垃圾？
我们该如何将“修改数据的规则”与“数据本身”真正融为一体？

下一章，我们将正式推导出面向对象的核心概念：**第03章《为什么数据和操作数据的代码应该靠近？》**。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-03-cohesion-and-objects', '03-cohesion-and-objects', 'doc:hello-system-part-1', '第03章 为什么数据和操作数据的代码应该靠近？', '# 第03章 为什么数据和操作数据的代码应该靠近？

## 1. 现实危机：贫血数据结构的悲剧

在上一章的结尾，我们成功使用复合结构 `CourseRecord` 战胜了隐式关联与并行数组的错位噩梦：

```java
public class CourseRecord {
    public String name;
    public int capacity;
    public int enrolled;
}
```

此时，我们的数据在物理内存中已经紧密聚拢为一个整体。

然而，在传统结构化/过程式程序设计中，系统依然被严格划分为两个截然不同的阵营：
- **被动的数据载体（Data Structs）**：只包含公开字段，没有任何逻辑；
- **主动的全局函数（Procedures / Functions）**：在系统各处游荡，将数据载体作为原料吃进去，加工后写回。

这种“数据与行为彻底剥离”的架构形态，在现代软件工程中被称为**贫血模型（Anemic Model）**。

现在，让我们伴随 Mini Campus 系统的成长，亲眼见证贫血模型是如何在多人协作的真实项目中分崩离析的。

---

## 2. 现实演进：规则的碎片化与暗度陈仓

假设 Mini Campus 系统上线两个月，团队扩充到了 4 名开发者，系统需要支持以下 3 个业务场景：

1. **学生前台自主选课**（由开发者 A 负责）；
2. **学生前台自主退课**（由开发者 B 负责）；
3. **教务管理员后台批量导入名单**（由开发者 C 负责）。

按照过程式思维，开发者 A 编写了一个工具类 `CourseManager`：

```java
public class CourseManager {
    // 开发者 A 编写的标准选课逻辑
    public static boolean enrollStudent(CourseRecord course) {
        if (course.enrolled < course.capacity) {
            course.enrolled++;
            return true;
        }
        return false;
    }
}
```

这看起来非常干净。

然而，一周之后，负责退课功能的开发者 B 在另一个文件 `StudentActionService.java` 里写下了退课代码：

```java
public class StudentActionService {
    public static void dropCourse(CourseRecord course) {
        // 开发者 B 以为退课只是简单减 1，完全忘记了检查 enrolled 是否已经为 0！
        course.enrolled--; 
    }
}
```

如果某位调皮的学生在已经退选的情况下，通过抓包工具连续重放 5 次退课请求：
`course.enrolled` 将直接被扣减成 **-5**！一门容量为 50 人的课程，已选人数变成了负数，系统的不变量被彻底击碎。

更具毁灭性的是开发者 C。他在编写管理员后台批量导入功能时，觉得调用 `CourseManager.enrollStudent` 每次只能加 1 太麻烦。他在自己的 `AdminImportTask.java` 里直接写下了：

```java
public class AdminImportTask {
    public static void importStudents(CourseRecord course, int count) {
        // 开发者 C 甚至根本没有检查容量上限，直接暴力加法！
        course.enrolled += count;
        System.out.println("管理员批量导入成功，当前人数: " + course.enrolled);
    }
}
```

如果管理员一次性导入了 80 名学生到一间只能坐 50 人的教室，`course.enrolled` 瞬间暴涨至 80。

现在，请停下来审视我们的系统：

```mermaid
flowchart TD
    subgraph FragmentedWorld ["过程式代码下的数据失控悲剧"]
        direction LR
        subgraph LogicSpace ["散落全系统的业务代码"]
            A["开发者 A: enrollStudent()
有容量上限检查"]
            B["开发者 B: dropCourse()
漏掉了下限检查 (产生负数)"]
            C["开发者 C: importStudents()
直接暴力加法 (产生超卖)"]
            D["恶意代码 / 脚本
直接 os.enrolled = 99999"]
        end

        subgraph PassiveData ["裸露的木桶 (CourseRecord)"]
            Target["course.enrolled 字段
(public 谁都能改)"]
        end

        A -->|修改| Target
        B -->|修改| Target
        C -->|修改| Target
        D -->|修改| Target
    end
```

关于 `CourseRecord.enrolled` 这个变量的状态流转规则，**已经分裂成了 3 份各自为政的代码**。

如果明天教务处要求“选课名额必须预留 10%”，你不仅要修改开发者 A 的代码，你还必须像侦探一样，全盘搜索整个项目的每一个角落，找出所有直接伸手去摸 `course.enrolled` 字段的代码行！

只要漏掉一个，系统的数据完整性就宣告破产。

---

## 3. 为什么靠“程序员的道德自律”无法拯救系统？

很多崇尚过程式编程的初学者常说：
> “这只是开发者 B 和 C 的水平不行、粗心大意。我们只要在团队开发规范里写明：‘所有人必须统一调用 CourseManager’，不就能解决了吗？”

软件工程六十年的历史给出的残酷答复是：**凡是依赖人类自律来保证的系统安全，最终必定以崩溃收场。**

因为：
1. **认知不可知**：新加入团队的成员根本不可能在一万个函数里准确知道哪一个是“合法修改途径”；
2. **物理通路未被切断**：只要 `course.enrolled` 字段在语法上依然是公开的（`public`），只要外部代码在物理上依然能够写出 `course.enrolled = ...`，在工期压力和偷懒心理的驱使下，绕过规范的后门就一定会层出不穷。

要从根本上杜绝灾难，必须从**制度约束**跃迁为**物理定律约束**。

---

## 4. 软件物理学：内聚性（Cohesion）与耦合度（Coupling）

在软件体系中，衡量代码结构质量有两个经典的物理学度量衡：

- **内聚性（Cohesion）**：描述同一个模块内部各个元素结合的紧密程度。
- **耦合度（Coupling）**：描述不同模块之间相互依赖和相互纠缠的程度。

当数据与操作数据的代码分离时：
- **内聚性极低**：关于课程状态的所有判断逻辑散落在整个系统的几十个文件里；
- **耦合度极高**：整个系统的每一个文件都可以直接读写课程的内部变量，外部世界与课程内部的物理表示深度纠缠。

要扭转这一局面，必须在软件世界里确立一道根本物理铁律：

> **谁拥有数据，谁就拥有修改该数据的唯一权力！**  
> **外部世界绝对不得直接伸出手指拨动内部状态，外部世界只能向其发送请求！**

```mermaid
flowchart LR
    subgraph LowCohesion ["低内聚高耦合 (过程式分离)"]
        F1["函数 A"] -->|直接读写| Struct["裸露数据结构"]
        F2["函数 B"] -->|直接读写| Struct
        F3["函数 C"] -->|直接读写| Struct
    end

    subgraph HighCohesion ["高内聚低耦合 (面向对象合体)"]
        CallerA["外部调用者 A"] -->|发送意图 enroll()| Object["自治对象
[ 内部私有状态 + 守卫方法 ]"]
        CallerB["外部调用者 B"] -->|发送意图 drop()| Object
    end
```

---

## 5. 新概念诞生：面向对象与“自治状态机”

面向对象程序设计（Object-Oriented Programming, OOP）之所以在 20 世纪 80 年代席卷整个软件工业界，从来不是因为它可以用来模拟动物园里的猫和狗。

它是为了解决一个极其血腥的工程灾难：**防止被动的数据结构在大型软件系统中被随意践踏。**

我们现在把 `CourseRecord` 升级为一个真正拥有自我意识的“自治实体”：

```java
public class Course {
    // 1. 将数据锁在保险箱里：外部绝对无法直接读写！
    private String name;
    private int capacity;
    private int enrolled;

    // 2. 构造函数：确保对象出生时即处于合法状态
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

    // 3. 唯一的选课大门：内部亲自守卫容量不变量
    public boolean enroll() {
        if (this.enrolled >= this.capacity) {
            return false; // 拒绝非法跃迁
        }
        this.enrolled++;
        return true;
    }

    // 4. 唯一的退课大门：内部亲自守卫下限不变量
    public boolean drop() {
        if (this.enrolled <= 0) {
            return false;
        }
        this.enrolled--;
        return true;
    }

    // 5. 只读查询通道：绝不提供 setEnrolled() 这种自杀式后门
    public String getName() { return this.name; }
    public int getCapacity() { return this.capacity; }
    public int getEnrolled() { return this.enrolled; }
}
```

---

## 6. 验证实验：坚不可摧的防线

现在，让我们再次模拟开发者 B、开发者 C 以及外部恶意调用的场景，看看新代码展现出的防御力：

```java
public class ObjectDefenseExperiment {
    public static void main(String[] args) {
        // 创建一门只有 2 个名额的课程
        Course course = new Course("高阶计算机图形学", 2);

        System.out.println("=== 1. 尝试正常选课 ===");
        System.out.println("第 1 次选课: " + course.enroll() + ", 当前已选: " + course.getEnrolled());
        System.out.println("第 2 次选课: " + course.enroll() + ", 当前已选: " + course.getEnrolled());

        System.out.println("
=== 2. 尝试超额选课 (模拟开发者 C 的超卖) ===");
        boolean result3 = course.enroll();
        System.out.println("第 3 次选课结果: " + result3 + ", 当前已选: " + course.getEnrolled());

        System.out.println("
=== 3. 尝试恶意连续退课 (模拟开发者 B 的下限穿透) ===");
        course.drop(); // 2 -> 1
        course.drop(); // 1 -> 0
        boolean dropResult3 = course.drop(); // 尝试扣减成负数
        System.out.println("在已选为 0 时再次退课: " + dropResult3 + ", 当前已选: " + course.getEnrolled());
    }
}
```

### 运行输出结果：
```text
=== 1. 尝试正常选课 ===
第 1 次选课: true, 当前已选: 1
第 2 次选课: true, 当前已选: 2

=== 2. 尝试超额选课 (模拟开发者 C 的超卖) ===
第 3 次选课结果: false, 当前已选: 2

=== 3. 尝试恶意连续退课 (模拟开发者 B 的下限穿透) ===
在已选为 0 时再次退课: false, 当前已选: 0
```

### 关键结论：
无论外部的调用者写得多么粗心，无论团队扩张到 100 人还是 1000 人：
- **没有任何人**能够将 `enrolled` 改成负数；
- **没有任何人**能够直接跳过容量检查让已选人数突破上限。

因为修改数据的物理通路，在全宇宙中**只有 `enroll()` 和 `drop()` 这两条受法律保护的狭窄通道**。

---

## 7. 横向场景验证：银行账户与透支防御

我们再次将该模型迁移到银行账户体系：

```java
public class BankAccount {
    private final String accountNo;
    private double balance;

    public BankAccount(String accountNo, double initialBalance) {
        if (initialBalance < 0) throw new IllegalArgumentException("初始余额不能为负");
        this.accountNo = accountNo;
        this.balance = initialBalance;
    }

    // 核心守卫：取款必须检验余额充足，绝不允许透支
    public boolean withdraw(double amount) {
        if (amount <= 0 || amount > this.balance) {
            return false;
        }
        this.balance -= amount;
        return true;
    }

    public void deposit(double amount) {
        if (amount > 0) {
            this.balance += amount;
        }
    }

    public double getBalance() { return balance; }
}
```
如果外部世界想扣钱，必须调用 `withdraw()`。银行账户自身捍卫了 $balance \ge 0$ 的神圣不变量。

---

## 8. 概念与语言实现的边界：OOP 不是唯一解

必须向读者坦诚说明：**“将数据与操作数据的代码锁在一起”并不等同于“面向对象”。**

在计算机科学的发展史上，不同的范式提出了不同的实现方案：

1. **过程式语言中的不透明指针（Opaque Pointer）**：在 C 语言中，通过在头文件中隐藏结构体定义，只暴露 `void* ` 句柄和操作函数（如 `FILE* fopen()` / `fread()`），实现了相同级别的数据防护。
2. **函数式编程（Functional Programming）**：函数式范式拒绝可变状态。它通过**不可变数据结构（Immutable Data）**与纯函数转换：$State_{new} = f(State_{old}, Action)$，从根本上消除了“状态被非法篡改”的物理可能性。
3. **闭包（Closures）**：在 JavaScript / Scheme 中，通过函数作用域内的局部变量与返回的闭包函数，也可以实现完美的状态私有化与行为绑定。

本书之所以选择面向对象（OOP）作为主要推导路线，是因为在当前企业级大型 Web 系统的主流基础设施中，基于类与对象的组织模型依然是最通用、最易于与关系数据库及分层架构对齐的工程载体。

---

## 9. 本章心智模型复盘与下一章起点

> **此时，你脑中的模型应该变成：**
> 1. **数据与逻辑分离（贫血模型）是脆弱的**：裸露的公开字段使得状态流转规则四分五裂；
> 2. **对象是一个自治的状态机**：它一手紧紧攥着自己的私有数据，一手拿着严格的守卫手册；
> 3. **方法是状态跃迁的唯一大门**。

然而，我们刚才在代码里写下了 `class Course`，又用 `new Course(...)` 创建了实例。

在计算机物理内存中，“类”和“对象”到底是如何分别存储的？执行 `course.enroll()` 时底层究竟是如何寻址的？

下一章，我们将撕开浮于表面的通俗隐喻，直击**第04章《类不是“对象的模板”这么简单》**。
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-04-class-and-object-mental-model', '04-class-and-object-mental-model', 'doc:hello-system-part-1', '第04章 类不是“对象的模板”这么简单', '# 第04章 类不是“对象的模板”这么简单

## 1. 传统通俗隐喻的破产与认知陷阱

几乎所有初学者在刚刚接触面向对象程序设计时，都会在教科书上读到以下两个极其著名的类比：

> “类（Class）是盖房子的蓝图图纸，对象（Object）是根据图纸施工盖出来的真实房子。”  
> “类是做月饼的金属模具，对象是用模具印出来的具体月饼。”

这两个隐喻在第一天向没有任何编程经验的门外汉解释“抽象与具象”时，确实能够起到某种通俗的启发作用。

然而，当你的学习目标是理解一个真实、精密、高并发的现代软件系统时，**这两个隐喻会迅速退化为毒害你底层心智模型的巨大障碍。**

因为它们在物理事实上是完全错误的：

1. **图纸盖完房子后可以烧掉，但“类”在运行时始终永恒占据着内存**：你从没见过房子的墙壁里死死嵌着一张图纸，但在计算机内存中，**每一个对象实例的头部都必须有一个物理指针，永远指向常驻内存的类元数据**。
2. **月饼模具不会替月饼承受咀嚼，但“类”掌握着全部的方法机器指令**：当你调用 `c1.enroll()` 时，对象 `c1` 内部根本没有一行关于选课的代码，**真正执行计算的机器指令全部存放在只属于“类”的代码段中**！

如果我们不撕碎这些轻佻的隐喻，我们就永远无法理解什么是“虚方法表”、什么是“内存泄漏”、什么是“反射”，更无法理解为什么一个微小的类定义会对整个系统的内存布局产生深远的影响。

现在，让我们戴上虚拟内存的透视镜，看一看当我们在代码中写下 `new` 时，物理世界到底发生了什么。

---

## 2. 真实物理世界的内存全景布局

假设我们在程序中创建了两门不同的课程：

```java
Course c1 = new Course("计算机系统导论", 100);
Course c2 = new Course("离散数学基础", 60);

c1.enroll();
c2.enroll();
```

许多初学者脑海中想象的图景是：内存里完整复制了两个独立的庞大结构，每个结构里面既有一份变量，又复制了一份完整的 `enroll()` 和 `drop()` 代码。

这在工程上是不可接受的荒谬设计。如果一个类有 200 个复杂方法（占用 100KB 机器指令），系统实例化了 10 万个对象，如果每个对象都复制一份方法代码，系统将瞬间白白烧毁 10GB 的内存！

真实的物理内存布局如下图所示：

```mermaid
flowchart LR
    subgraph MetaSpace ["元空间 / 代码段 (Metaspace / Code Segment)"]
        Klass["Course 类元信息 (Klass 结构体)
----------------------------------
- 类型标识: com.campus.Course
- 字段描述表: name(offset 16), capacity(offset 24), enrolled(offset 28)
- 虚方法表 (vtable):
  [Slot 0] enroll() 指令入口 -> 0x0040A100
  [Slot 1] drop() 指令入口   -> 0x0040A200
  [Slot 2] getName() 指令入口 -> 0x0040A300
----------------------------------
(全进程中只有唯一一份物理内存副本)"]
    end

    subgraph ThreadStack ["当前线程执行栈 (Thread Stack)"]
        Frame["main() 函数栈帧
-------------------------
局部变量 c1: 存放指针 0x700010
局部变量 c2: 存放指针 0x700030"]
    end

    subgraph HeapArea ["堆内存空间 (Heap Space)"]
        Obj1["c1 实例 (起始地址: 0x700010)
----------------------------------------
[对象头 Mark Word: 8 字节锁/GC状态]
[对象头 Klass Pointer: 8 字节 -> 指向 Klass]
[字段 name 引用: 8 字节 -> 指向 ''计算机系统导论'']
[字段 capacity: 4 字节整数 100]
[字段 enrolled: 4 字节整数 1]
----------------------------------------
(总物理大小: 仅 32 字节)"]
        
        Obj2["c2 实例 (起始地址: 0x700030)
----------------------------------------
[对象头 Mark Word: 8 字节锁/GC状态]
[对象头 Klass Pointer: 8 字节 -> 指向 Klass]
[字段 name 引用: 8 字节 -> 指向 ''离散数学基础'']
[字段 capacity: 4 字节整数 60]
[字段 enrolled: 4 字节整数 1]
----------------------------------------
(总物理大小: 仅 32 字节)"]
    end

    Frame -->|引用指针 0x700010| Obj1
    Frame -->|引用指针 0x700030| Obj2
    Obj1 -.->|对象头 Klass 指针| Klass
    Obj2 -.->|对象头 Klass 指针| Klass
```

### 深度解构物理细节：
1. **类（Klass 元数据）存放在只读/共享区**：当 JVM 或操作系统加载程序时，它解析字节码/可执行文件，在共享的元数据区生成一份唯一的类结构体。这里记录了类的名字、字段偏移量、以及**方法的全部机器指令**。无论你 `new` 1 个对象还是 100 万个对象，**方法的机器代码全系统永远只有一份**。
2. **对象（Object 实例）在堆上只存纯数据**：在堆中分配的每个对象，本质上只是一块极其紧凑的字节切片（在 64 位系统上通常只有 32~48 字节）。它内部只包含：
   - **对象头（Object Header）**：记录垃圾回收年龄、偏向锁标记，以及一个**指向元空间类信息的指针**；
   - **实例字段的物理数据**：`capacity` 的 4 字节整数、`enrolled` 的 4 字节整数、以及指向字符串的 8 字节引用指针。
3. **栈上的局部变量只是一个遥控器**：`c1` 自身占用的内存仅仅是 8 个字节的指针地址，它只是静静记录着堆中对象的起始内存编号（`0x700010`）。

---

## 3. 深入机制：`c1.enroll()` 底层究竟是如何执行的？

既然堆内存中的对象 `c1` 内部根本没有一行指令，那么当 CPU 执行到 `c1.enroll()` 时，计算机底层到底是如何精准修改 `c1` 内部的数据的？

在底层（无论是 C++ 编译生成的 x86-64 汇编，还是 Java 虚拟机的 `invokevirtual` 字节码指令），面向对象的方法调用语法：

```java
c1.enroll();
```

在语义和机器级执行上，都被无情地还原为了一个极其纯粹的、带有隐藏参数的全局过程调用：

$$\text{Course\_enroll}(\&c1)$$

编译器在幕后默默完成了一项至关重要的转换：

**它将调用者对象的内存地址 `0x700010`（即引用变量 `c1`），作为第一个隐藏参数塞进了传参寄存器中！**

在面向对象方法内部，这个隐藏参数的名字就叫做：**`this`**（在 Python 中被显式写为 `self`，在 C++ / Java 中被隐式保留）。

```text
机器级 CPU 指令追踪推演 (x86-64 汇编抽象):
1. MOV RDI, [RBP - 8]       ; 将局部变量 c1 的内存地址 (0x700010) 放入第一个传参寄存器 RDI (即 this 指针)
2. CALL 0x0040A100         ; 跳转到元空间中 Course::enroll 的机器指令起始地址
3. [进入 enroll 方法内部]:
   MOV EAX, [RDI + 28]     ; 读取 [this 指针 + 偏移量 28] 处的 4 字节数据 (即 enrolled 字段)
   MOV EDX, [RDI + 24]     ; 读取 [this 指针 + 偏移量 24] 处的 4 字节数据 (即 capacity 字段)
   CMP EAX, EDX            ; 比较 enrolled 与 capacity
   JGE 0x0040A150          ; 如果 enrolled >= capacity，跳转到返回 false 的分支
   INC EAX                 ; enrolled 自增 1
   MOV [RDI + 28], EAX     ; 将计算结果写回 [this 指针 + 偏移量 28] 处内存！
   MOV EAX, 1              ; 返回 true (1)
   RET                     ; 函数返回
```

看！所有的神秘感在这一刻彻底烟消云散：
方法之所以能够精准修改 `c1` 的已选人数而不是 `c2` 的已选人数，**完全是因为方法在执行时，寄存器里保存着 `c1` 的物理内存地址。**

---

## 4. 最小实验：证明 `this` 就是一个普通指针

让我们设计一个最小可运行实验，通过打印对象的内存身份特征，亲眼证实多对象共享同一套代码、全凭 `this` 寻址的真相：

```java
public class ThisPointerExperiment {
    private String courseName;
    private int value;

    public ThisPointerExperiment(String name, int value) {
        this.courseName = name;
        this.value = value;
    }

    public void demonstrateThis() {
        // System.identityHashCode 返回对象在堆中的物理内存 Hash 标识
        int instanceAddressHash = System.identityHashCode(this);
        System.out.println("方法正在执行！当前隐式参数 this 指向的物理实例 Hash: " + instanceAddressHash + 
                           ", 读取到的实例名称: [" + this.courseName + "], 数值: " + this.value);
    }

    public static void main(String[] args) {
        ThisPointerExperiment objA = new ThisPointerExperiment("课程 A", 100);
        ThisPointerExperiment objB = new ThisPointerExperiment("课程 B", 200);

        System.out.println("外部引用的物理 Hash objA = " + System.identityHashCode(objA));
        System.out.println("外部引用的物理 Hash objB = " + System.identityHashCode(objB));
        System.out.println("--------------------------------------------------");

        // 相同的两行方法调用指令
        objA.demonstrateThis();
        objB.demonstrateThis();
    }
}
```

### 运行输出结果：
```text
外部引用的物理 Hash objA = 1808253012
外部引用的物理 Hash objB = 589431969
--------------------------------------------------
方法正在执行！当前隐式参数 this 指向的物理实例 Hash: 1808253012, 读取到的实例名称: [课程 A], 数值: 100
方法正在执行！当前隐式参数 this 指向的物理实例 Hash: 589431969, 读取到的实例名称: [课程 B], 数值: 200
```

---

## 5. 横向场景与语言对照：Python、C++ 与 C 的诚实性

不同编程语言在暴露底层这一机制时采取了不同的语法策略：

### Python 的坦荡
在 Python 中，定义方法时必须显式写出 `self` 作为第一个参数：
```python
class Course:
    def __init__(self, name):
        self.name = name

    def enroll(self): # 必须显式声明 self！
        print(f"当前操作的实例地址: {id(self)}")
```
很多从 Java 转过来的初学者觉得 Python 很啰嗦：“为什么调用时写 `c.enroll()` 不需要传参，定义时却非要写一个 `self`？”  
现在你看懂了底层机制就会明白：**Python 是诚实的，它直接把底层寄存器传参的物理真相暴露在了语法表面；而 Java 和 C++ 选择用 `this` 关键字把这个传参过程隐藏了起来。**

### C 语言的面向对象模拟
在纯 C 语言中，Linux 内核以及大量经典开源项目就是通过完全显式的结构体指针传参来实现面向对象的：
```c
struct Course {
    char name[64];
    int capacity;
    int enrolled;
};

// 显式将 struct 指针作为第一个参数传入
bool Course_enroll(struct Course* this) {
    if (this->enrolled >= this->capacity) return false;
    this->enrolled++;
    return true;
}
```

---

## 6. 误区澄清

> 误区：
> “类（Class）只是编译期的概念，编译成二进制或者字节码之后类就不存在了。”
> 
> 事实是：
> 在 Java、C# 等现代托管运行时中，**类是运行期真实存在的活对象（Class Metadata Object）**。
> 类元数据常驻在元空间（Metaspace）中。只有当加载该类的类加载器（ClassLoader）被整体垃圾回收时，类才会经历“类卸载（Class Unloading）”。
> 运行时反射（Reflection）、动态代理以及虚方法查找，每时每刻都在读取元空间中的类元数据。

---

## 7. 本章心智模型复盘与下一章起点

> **此时，你脑中的模型应该变成：**
> 1. **类**是全系统常驻的一套只读行为指令集与字段规格说明书，存放在共享元数据空间；
> 2. **对象**是堆内存上一块极度紧凑的纯数据切片，头部嵌着指向类的指针；
> 3. **面向对象的方法调用**，本质上是：**“寻找到类中的指令，将对象的内存地址塞入 `this` 指针寄存器，对该对象进行定向内存手术。”**

现在，我们彻底看清了对象的物理本质：它不过是堆内存上一块包含若干字段的连续字节。

那么，一个极其严峻的问题浮出水面：

既然对象只是一块脆弱的内存，我们凭什么保证其他代码不会绕过 `enroll()` 方法，直接拿着指针去篡改这块内存里的字节？
语言究竟是如何在编译器和运行时层面，为对象建立起绝对防御的？

下一章，我们将正式进入面向对象的第一大支柱：**第05章《对象为什么应该保护自己的状态？》**。
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-05-encapsulation-and-invariants', '05-encapsulation-and-invariants', 'doc:hello-system-part-1', '第05章 对象为什么应该保护自己的状态？', '# 第05章 对象为什么应该保护自己的状态？

## 1. 所谓“封装”，绝不是把字段改成 private 然后无脑生成 Getter/Setter

在几乎所有的初级面向对象教学中，最常见也最具误导性的教学套路是：
1. 告诉学生面向对象第一大特性是“封装”；
2. 然后展示一段把属性全改成 `private`，紧接着通过 IDE 一键生成全套 `getXXX()` 和 `setXXX()` 的模板代码。

请仔细审视下面这个反面教材：

```java
// 这是一个伪装成面向对象的“假封装”
public class FakeEncapsulatedCourse {
    private String name;
    private int capacity;
    private int enrolled;

    public void setName(String name) { this.name = name; }
    public String getName() { return this.name; }

    public void setCapacity(int capacity) { this.capacity = capacity; }
    public int getCapacity() { return this.capacity; }

    public void setEnrolled(int enrolled) { this.enrolled = enrolled; }
    public int getEnrolled() { return this.enrolled; }
}
```

请问：这和把字段全部写成 `public` 有任何物理区别吗？

**毫无区别。**

外部调用者依然可以写出 `course.setEnrolled(-50)`，依然可以写出 `course.setEnrolled(course.getCapacity() + 9999)`。

这种无脑暴露 Setter 的做法，不仅没有起到任何保护作用，反而平白增加了调用者的击键次数，并在团队中营造出一种“我们已经规范封装了”的虚假安全感。

---

## 2. 核心概念：不变量（Invariant）

真正的封装，不是为了对程序员保密，而是为了在运行时死死捍卫一个核心概念：**不变量（Invariant）**。

#### 形式化定义：
> **不变量**是指在对象的整个生命周期中，无论经历了何种合法的外部方法调用，都**必须在任何可观察时刻恒为真（True）的业务谓词条件**。

在 Mini Campus 的 `Course` 实体中，存在三个绝对不可动摇的不变量：

$$\text{Invariant 1: } \text{capacity} > 0$$

$$\text{Invariant 2: } 0 \le \text{enrolled} \le \text{capacity}$$

$$\text{Invariant 3: } \text{name} \ne \text{null} \land \text{length}(\text{trim}(\text{name})) > 0$$

如果在系统运行的某一瞬间，堆内存中的某个 `Course` 实例的 `enrolled` 变成了 -1 或者突破了 `capacity`，那么在系统模型中，该对象就进入了**“损坏状态（Corrupted State）”**。

损坏状态就像核辐射，会迅速沿着调用链路污染下游的成绩统计、排课算法与财务结算系统，引发全局性雪崩。

```mermaid
stateDiagram-v2
    [*] --> 合法初始状态: new Course("CS-101", 100)
满足 0 <= 0 <= 100
    
    合法初始状态 --> 选课后合法状态: enroll()
enrolled 从 0 跃迁到 1
依然满足 0 <= 1 <= 100
    选课后合法状态 --> 退课后合法状态: drop()
enrolled 从 1 跃迁到 0
依然满足 0 <= 0 <= 100
    
    选课后合法状态 --> 拒绝跃迁_保持原状: enroll() 当已满员
条件不满足, 拦截并拒绝
    
    合法初始状态 --> 状态崩溃_死锁或非法: 外部调用 setEnrolled(-5)
不变量被击碎!
```

---

## 3. 双重防线：出生守卫与状态跃迁守卫

为了保证不变量在任何时候都坚不可摧，对象必须建立起两道铁门：

### 第一道防线：出生时的合法性守卫（Constructor Validation）
对象绝不能以非法状态在堆内存中诞生。如果有人传入 `capacity = -10` 或 `name = null`，构造函数必须直接抛出异常，在源头拒绝畸形对象的生成：

```java
public Course(String name, int capacity) {
    if (name == null || name.trim().isEmpty()) {
        throw new IllegalArgumentException("课程名称不可为空");
    }
    if (capacity <= 0) {
        throw new IllegalArgumentException("课程容量必须大于0，当前传入: " + capacity);
    }
    this.name = name;
    this.capacity = capacity;
    this.enrolled = 0; // 初始状态必定合法
}
```

### 第二道防线：生命周期中的状态跃迁守卫（State Transition Methods）
彻底消灭无脑的 `setEnrolled()`。外部世界只被允许请求具有明确业务语义的“动作”，而动作内部负责校验不变量：

```java
public boolean enroll() {
    // 守卫不变量: enrolled + 1 <= capacity
    if (this.enrolled >= this.capacity) {
        return false; // 拒绝非法跃迁
    }
    this.enrolled++;
    return true;
}

public boolean drop() {
    // 守卫不变量: enrolled - 1 >= 0
    if (this.enrolled <= 0) {
        return false;
    }
    this.enrolled--;
    return true;
}
```

---

## 4. 破坏性实验：不变量防御实战

```java
public class InvariantAttackExperiment {
    public static void main(String[] args) {
        System.out.println("=== 实验 1: 尝试制造非法出生的畸形对象 ===");
        try {
            Course badCourse = new Course("非法课程", -10);
        } catch (IllegalArgumentException e) {
            System.out.println("成功拦截畸形对象创建: " + e.getMessage());
        }

        System.out.println("
=== 实验 2: 尝试对合法对象进行超额跃迁攻击 ===");
        Course tinyCourse = new Course("迷你讨论班", 1);
        System.out.println("第 1 次选课: " + tinyCourse.enroll()); // true
        System.out.println("第 2 次选课: " + tinyCourse.enroll()); // false, 被拦截

        System.out.println("最终内部状态已选人数: " + tinyCourse.getEnrolled() + "/" + tinyCourse.getCapacity());
    }
}
```

---

## 5. 本章心智模型复盘

> **此时，你脑中的模型应该变成：**
> 1. 封装不是写 Getter 和 Setter，封装是**对不变量的绝对武装捍卫**；
> 2. `private` 是保险箱的锁，业务方法是保险箱的武装守卫；
> 3. 对象一旦出生，它的内部状态在任何微秒都必须满足业务完整性。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-06-lifecycle-and-references', '06-lifecycle-and-references', 'doc:hello-system-part-1', '第06章 一个对象是怎样出生和死亡的？', '# 第06章 一个对象是怎样出生和死亡的？

## 1. 生存的舞台：栈帧的剧烈伸缩与堆的平静大陆

要理解对象的完整生命周期，必须在脑海中建立现代计算机运行时的两块核心内存空间：

```mermaid
flowchart TD
    subgraph Memory ["进程虚拟地址空间"]
        direction LR
        subgraph StackArea ["栈区 (Stack Frame)"]
            Frame1["main() 栈帧
局部变量 c1 (指针)"]
            Frame2["doEnroll() 栈帧
局部变量 courseRef, studentId"]
        end

        subgraph HeapArea ["堆区 (Heap Space)"]
            ObjA["Course 实例 0x5001
[''计算机系统导论'', cap: 100, enr: 1]"]
            ObjB["Student 实例 0x6001
[''李雷'', id: 1001]"]
        end
    end

    Frame1 -->|持有引用 0x5001| ObjA
    Frame2 -->|持有引用 0x5001| ObjA
    Frame2 -->|持有引用 0x6001| ObjB
```

- **栈（Stack）**：与线程执行绑定。每进入一个函数，系统就在栈顶压入一个**栈帧（Stack Frame）**；函数执行完毕返回，栈帧瞬间弹出销毁。它的分配和释放极快（仅需调整栈指针寄存器 ESP/RSP），但寿命受限于作用域。
- **堆（Heap）**：全进程共享的动态内存池。通过 `new` 分配的对象都安居在堆中。它们的寿命与创建它们的作用域无关，只要全系统中还有任何一个活着的“遥控器”指向它们，它们就会一直活着。

---

## 2. 诞生全流程：当 `new` 执行时

执行 `Course c = new Course("操作系统", 100);` 的底层完整物理步长：
1. **计算内存字节尺寸**：JVM 解析 `Course` 类元数据，计算出实例所需的准确字节数（对象头 16 字节 + 引用 8 字节 + 整型 8 字节 + 对齐填充 = 32 字节）；
2. **堆空间分配与零值初始化**：在堆中划出 32 字节连续空间，将所有比特位置零（字段瞬间拥有默认初始值 `null`, `0`）；
3. **写入对象头元数据**：将对象头部的 Klass Pointer 指向元空间的 `Course` 类元数据；
4. **执行构造函数**：传入参数执行校验与赋值，不变量正式确立；
5. **返回地址并绑定引用**：将堆内存首地址（`0x5001`）赋值给栈上的局部变量 `c`。

---

## 3. 羁绊与死亡：可达性分析（Reachability Analysis）

在带垃圾回收的现代语言（Java/Go/JS/Python）中，对象的死亡是由**可达性分析算法**裁决的。

系统从一组绝对可信的活起点——**GC Roots** 出发（包括活跃线程栈帧中的局部变量、全局静态变量、JNI 句柄），沿着引用连线向下深度优先搜索：
- **可达（Reachable）**：能从 GC Roots 顺着引用链触达的对象，判定为“存活”；
- **不可达（Unreachable）**：从所有 GC Roots 均无法寻找到的对象，判定为“死亡”，沦为内存垃圾。

```mermaid
flowchart TD
    subgraph Roots ["GC Roots (活跃栈变量)"]
        R1["main() 栈中的 c1"]
    end

    subgraph ActiveHeap ["存活对象 (保留)"]
        O1["Course: 操作系统 (0x5001)"]
    end

    subgraph Garbage ["孤立循环引用群 (即将被 GC 抹除)"]
        O2["Course: 旧课程 A (0x7001)"]
        O3["Student: 临时学生 B (0x8001)"]
        O2 <-->|互相引用但脱离 Root| O3
    end

    R1 --> O1
```

注意上图中的 `O2` 和 `O3`：即使它们彼此紧紧互相引用，但由于从 GC Roots 已经无法触达它们，垃圾回收器会毫不犹豫地将它们占用的堆内存回收。

---

## 4. 本章心智模型复盘

> **此时，你脑中的模型应该变成：**
> 1. **变量是遥控器，对象是电视机**：复制变量只是多了一个遥控器，电视机依然只有一个；
> 2. **引线全断即死亡**：只要所有指向堆内存的引用线断裂，对象在逻辑上就已进入坟墓。
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-07-object-collaboration', '07-object-collaboration', 'doc:hello-system-part-1', '第07章 程序里的对象怎样彼此认识？', '# 第07章 程序里的对象怎样彼此认识？

## 1. 对象社会的两大基石：拥有（has-a）与使用（uses-a）

初学者在学完类之后，往往急于寻找“高级特性”，一头扎进继承的泥潭。

然而在工业级软件设计中，$90\%$ 以上的对象协作关系根本不是继承，而是两类最质朴的关联：

1. **关联/组合（Composition / Aggregation）——“拥有（has-a）”**
2. **依赖（Dependency）——“使用（uses-a）”**

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
        +getName() String
    }

    Student "1" o-- "0..*" Course : has-a (聚合: 学生长期持有已选课程列表)
    Student ..> Course : uses-a (依赖: enrollCourse 方法入参临时协作)
```

---

## 2. Mini Campus 中的学生实体协作实战

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Student {
    private final int id;
    private final String name;
    
    // has-a 关系：学生实体长期持有一个已选课程列表
    private final List<Course> enrolledCourses;

    public Student(int id, String name) {
        if (id <= 0 || name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("非法学生信息");
        }
        this.id = id;
        this.name = name;
        this.enrolledCourses = new ArrayList<>();
    }

    // uses-a 关系：选课行为依赖于外部传入的 Course 对象
    public boolean enrollCourse(Course course) {
        if (course == null) return false;

        // 1. 学生自身捍卫“不能重复选修同一门课”的不变量
        if (this.enrolledCourses.contains(course)) {
            System.out.println(this.name + " 已经选过 " + course.getName() + "，不可重复选择！");
            return false;
        }

        // 2. 委托 Course 自身捍卫“不能超过容量上限”的不变量
        boolean success = course.enroll();
        if (success) {
            this.enrolledCourses.add(course);
            System.out.println(this.name + " 成功选修课程: " + course.getName());
            return true;
        } else {
            System.out.println(this.name + " 选课失败，课程名额已满: " + course.getName());
            return false;
        }
    }

    // 防御性包装：防止外部代码直接 clear() 内部列表
    public List<Course> getEnrolledCourses() {
        return Collections.unmodifiableList(this.enrolledCourses);
    }

    public String getName() { return name; }
    public int getId() { return id; }
}
```

---

## 3. 协作实验：职责划分的优雅性

```java
public class CollaborationExperiment {
    public static void main(String[] args) {
        Course aiCourse = new Course("人工智能导论", 1);
        Student leilei = new Student(1001, "李雷");
        Student meimei = new Student(1002, "韩梅梅");

        System.out.println("=== 第一轮：李雷选课 ===");
        leilei.enrollCourse(aiCourse);

        System.out.println("
=== 第二轮：李雷尝试重复选课 ===");
        leilei.enrollCourse(aiCourse);

        System.out.println("
=== 第三轮：韩梅梅争抢名额 ===");
        meimei.enrollCourse(aiCourse);
    }
}
```

### 运行输出结果：
```text
=== 第一轮：李雷选课 ===
李雷 成功选修课程: 人工智能导论

=== 第二轮：李雷尝试重复选课 ===
李雷 已经选过 人工智能导论，不可重复选择！

=== 第三轮：韩梅梅争抢名额 ===
韩梅梅 选课失败，课程名额已满: 人工智能导论
```

### 深度复盘：
- **防重复选课**的规则由 `Student` 负责（因为只有学生知道自己的选课历史）；
- **防超卖**的规则由 `Course` 负责（因为只有课程知道自己的剩余名额）；
- 两者没有越权，通过传递参数与持有引用，极其优雅地完成了业务闭环。
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-08-when-inheritance-is-valid', '08-when-inheritance-is-valid', 'doc:hello-system-part-1', '第08章 什么时候继承是合理的？', '# 第08章 什么时候继承是合理的？

## 1. 继承的诱惑与灾难：为了复用代码而继承

继承（`extends`）是面向对象中最容易被滥用的武器。初学者滥用继承往往源于一个简单的动机：“我想少写几行代码，我想直接复用父类的字段。”

让我们看一个经典的错误继承反例：

教务处提出新需求：“系统中需要加入‘教室（Classroom）’的概念。教室有容纳人数（capacity），也需要记录当前坐了多少人（enrolled）。”

某位程序员看到了写好的 `Course` 类，心想：“太巧了！`Course` 里面刚好有 `capacity`、`enrolled` 和 `enroll()`，我直接继承它！”

```java
// 灾难：教室继承了课程！
public class Classroom extends Course {
    private String buildingName;

    public Classroom(String buildingName, String roomNo, int capacity) {
        super(roomNo, capacity);
        this.buildingName = buildingName;
    }
}
```

这导致了系统在概念上严重精神分裂：外部代码可以合法写出：
```java
student.enrollCourse(new Classroom("第一教学楼", "101", 50));
```
**“学生成功选修了一间教室”！**

```mermaid
classDiagram
    class Course {
        -String name
        -int capacity
        -int enrolled
        +enroll()
    }
    
    class BadClassroom {
        -String buildingName
    }
    
    Course <|-- BadClassroom : 荒谬的继承 (is-a 破裂)
```

---

## 2. 继承的唯一合法准则：严格的 is-a

> **只有当子类在逻辑、行为和契约上无条件属于父类的一种（is-a），且子类能够透明替换父类出现的任何场合时，继承才是合法的。**

在 Mini Campus 中，**实验课（LabCourse）** 是一种合理的继承：
- 实验课就是一种课程（LabCourse is-a Course）；
- 实验课在普通课程的基础上，额外增加了助教（Tutor）和实验机时（Lab Hours）。

```java
public class LabCourse extends Course {
    private String tutorName;
    private int labHours;

    public LabCourse(String name, int capacity, String tutorName, int labHours) {
        super(name, capacity);
        if (tutorName == null || labHours <= 0) {
            throw new IllegalArgumentException("实验课参数非法");
        }
        this.tutorName = tutorName;
        this.labHours = labHours;
    }

    public String getTutorName() { return tutorName; }
}
```

---

## 3. 组合优于继承（Composition Over Inheritance）

现代软件工程普遍遵循：**优先使用组合，谨慎使用继承。**

因为继承是**白盒复用**。父类内部的任何细微实现变动，都会像地震波一样向下传导给所有子类，打破子类的封装性。

面对类似功能，先问自己：“能否作为属性组合进来（has-a）？”如果能，坚决放弃继承。
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-09-polymorphism-and-dynamic-dispatch', '09-polymorphism-and-dynamic-dispatch', 'doc:hello-system-part-1', '第09章 为什么同一句代码能够产生不同的行为？', '# 第09章 为什么同一句代码能够产生不同的行为？

## 1. 场景：不同类型课程的凭证打印

教务处要求：当学生选课成功后，系统需要针对不同课程打印不同的选课凭证：
1. **讲授课（Lecture）**：打印“请按时前往指定大教室听课”；
2. **实验课（LabCourse）**：打印“请联系助教【XXX】”；
3. **网课（OnlineCourse）**：打印“请登录平台【URL】在线学习”。

不理解多态的程序员会写出脆弱的类型分支判断：

```java
public static void printInstruction(Course course) {
    if (course instanceof LabCourse) {
        LabCourse lab = (LabCourse) course;
        System.out.println("【实验课】联系助教: " + lab.getTutorName());
    } else if (course instanceof OnlineCourse) {
        OnlineCourse online = (OnlineCourse) course;
        System.out.println("【网课】登录平台: " + online.getUrl());
    } else {
        System.out.println("【讲授课】前往大教室听课。");
    }
}
```

每当学校增加一种新课程，全系统所有写了 `instanceof` 的地方都必须被翻出来修改一遍。

---

## 2. 多态破局：动态分派（Dynamic Dispatch）

多态的核心思想是：**调用者只负责发出意图，具体怎么做，由接收消息的对象自己决定。**

```java
public class Course {
    // ... 基础属性省略 ...
    public void printInstruction() {
        System.out.println("【讲授课凭证】请前往指定大教室听课。");
    }
}

public class LabCourse extends Course {
    private String tutorName;
    public LabCourse(String name, int capacity, String tutorName) {
        super(name, capacity);
        this.tutorName = tutorName;
    }

    @Override
    public void printInstruction() {
        System.out.println("【实验课凭证】请联系助教: " + this.tutorName);
    }
}

public class OnlineCourse extends Course {
    private String url;
    public OnlineCourse(String name, int capacity, String url) {
        super(name, capacity);
        this.url = url;
    }

    @Override
    public void printInstruction() {
        System.out.println("【网课凭证】请登录平台学习: " + this.url);
    }
}
```

现在，调用者的代码变成了极其优雅的一行：

```java
public static void notifyStudent(Course course) {
    course.printInstruction(); // 同一行代码，根据传入的实际对象自动执行不同逻辑！
}
```

---

## 3. 底层机制：虚方法表（Virtual Method Table / vtable）

CPU 执行 `course.printInstruction()` 时是如何寻址的？

```mermaid
flowchart LR
    subgraph HeapObjects ["堆上的具体对象"]
        ObjA["LabCourse 实例
[对象头] -> 指向 Klass_LabCourse"]
        ObjB["OnlineCourse 实例
[对象头] -> 指向 Klass_OnlineCourse"]
    end

    subgraph KlassArea ["元空间类元信息中的虚方法表 (vtable)"]
        VT_Lab["Klass_LabCourse 的 vtable
[Slot 1] printInstruction() -> 0x3050 (Lab 实现)"]
        VT_Online["Klass_OnlineCourse 的 vtable
[Slot 1] printInstruction() -> 0x4080 (Online 实现)"]
    end

    ObjA -.-> VT_Lab
    ObjB -.-> VT_Online
```

1. 从引用中获取对象堆内存地址；
2. 读取对象头部的类型指针，找到具体类的虚方法表（vtable）；
3. 在虚方法表固定槽位读取函数指针，CPU 跳转执行。
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-10-interfaces-and-dependency-inversion', '10-interfaces-and-dependency-inversion', 'doc:hello-system-part-1', '第10章 接口真正隔开的是什么？', '# 第10章 接口真正隔开的是什么？

## 1. 现实痛点：硬编码外部依赖

当选课成功时，系统需要发送即时通知。如果我们直接硬编码短信服务：

```java
public class EnrollmentCoordinator {
    private AliyunSmsSender smsSender = new AliyunSmsSender(); // 致命硬编码紧耦合
}
```

当学校决定换用腾讯短信、邮件通知，或者在单元测试中不想产生真实短信费用时，核心选课代码被迫全盘推倒重写。

---

## 2. 接口是一份法律契约

接口（Interface）只规定“做什么（What）”，绝不规定“怎么做（How）”。

```mermaid
flowchart TD
    subgraph Decoupled ["通过接口隔开 (依赖倒置 DIP)"]
        Core["核心选课业务 (EnrollmentCoordinator)"] -->|只依赖协议契约| Interface["NotificationSender 接口"]
        SMS1["AliyunSmsSender"] -.->|实现| Interface
        SMS2["EmailNotificationSender"] -.->|实现| Interface
        SMS3["MockTestSender (测试桩)"] -.->|实现| Interface
    end
```

```java
public interface NotificationSender {
    void sendNotification(String target, String content);
}
```

---

## 3. 依赖注入（Dependency Injection）实战

```java
public class EnrollmentCoordinator {
    private final NotificationSender notifier;

    // 依赖注入：只依赖抽象接口，具体实现由外部注入
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
', 'public', '2251213429@qq.com', 10, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-11-break-god-class', '11-break-god-class', 'doc:hello-system-part-1', '第11章 为什么一个类最终又会变成几十个类？', '# 第11章 为什么一个类最终又会变成几十个类？

## 1. 上帝类（God Class）的膨胀与危害

当一个 5000 行的 `CampusManager` 既懂网络参数解析，又管 SQL 拼装，既管选课规则，又管发短信和生成 HTML 时：
- **合并冲突地狱**：全团队每天都在改同一个文件；
- **牵一发而动全身**：改了导出格式，意外搞崩了选课 SQL；
- **无法编写单测**：想测业务规则必须把真实数据库和短信网关全部配齐。

```mermaid
flowchart TD
    God["CampusManager (上帝类)
承担全宇宙所有的责任"]
    
    R1["修改 SQL 查询方式"] -->|被迫修改| God
    R2["修改选课防冲突规则"] -->|被迫修改| God
    R3["修改短信服务商"] -->|被迫修改| God
    R4["修改网页 UI 模板"] -->|被迫修改| God
```

---

## 2. 单一职责原则（SRP）：按变化维度解构

> **一个模块应该有且仅有一个引起它变化的原因。**

我们将上帝类解构为各司其职的自治专家：

```mermaid
flowchart LR
    Ctrl["CourseController
负责请求接收与格式转换"] --> Svc["EnrollmentService
负责核心业务规则编排"]
    Svc --> Repo["CourseRepository
负责数据持久化存取"]
    Svc --> Notify["NotificationService
负责消息发送"]
```
', 'public', '2251213429@qq.com', 11, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-12-emergence-of-layers', '12-emergence-of-layers', 'doc:hello-system-part-1', '第12章 软件第一次出现“层”', '# 第12章 软件第一次出现“层”

## 1. 经典三层架构的自然涌现

回顾前十二章的演进，拆分出的类自然构成了清晰的水平分层：
- **Controller（控制器 / 表现层）**
- **Service（业务逻辑层）**
- **Repository（数据访问 / 持久层）**

```mermaid
sequenceDiagram
    autonumber
    actor Caller as 外部调用者 (UI / 终端 / 网络)
    participant Ctrl as 1. Controller 层
    participant Svc as 2. Service 业务层
    participant Repo as 3. Repository 持久层
    participant Store as 底层物理存储 (DB / File)

    Caller->>Ctrl: 传入纯文本 / 请求参数 ("studentId=1001", "courseId=2048")
    Note over Ctrl: 负责: 格式解析、参数清洗
绝不负责: 核心业务规则
    Ctrl->>Svc: 调用业务方法: enroll(1001, 2048)
    Note over Svc: 负责: 核心规则 (名额/冲突校验)
绝不负责: SQL 拼装或 HTTP 响应
    Svc->>Repo: 请求数据: findCourseById(2048)
    Repo->>Store: 执行物理查询
    Store-->>Repo: 返回原始记录
    Repo-->>Svc: 组装并返回 Course 领域实体
    Svc->>Repo: 保存修改: save(course)
    Repo->>Store: 执行持久化更新
    Svc-->>Ctrl: 返回业务执行结果
    Ctrl-->>Caller: 封装成用户可见的格式 (JSON / 提示文字)
```

---

## 2. 职责边界矩阵

| 层次 | 核心职责 | 它应该知道什么 | 它绝对不应该知道什么 |
| :--- | :--- | :--- | :--- |
| **Controller** | 协议转换、参数提取、输入格式清洗、分发调用 | 知道 HTTP / 路由 / 视图格式，知道该调哪个 Service | 绝不知道 SQL 怎么写，绝不知道核心业务规则 |
| **Service** | 业务不变量编排、跨实体逻辑协调、事务边界 | 知道完整的业务规则，知道需要调哪些 Repository 和 Notifier | 绝不知道当前是 HTTP 请求还是控制台调用，绝不直接写底层 SQL |
| **Repository** | 屏蔽底层存储介质差异，提供类似内存集合一样的存取接口 | 知道数据库表结构、SQL 语句、连接池、缓存 | 绝不知道“选课满了能不能选”这种业务规则 |

---

## 3. Mini Campus 经典三层可运行实现

```java
// 1. Repository: 负责存取
public class InMemoryCourseRepository {
    private final java.util.Map<Integer, Course> database = new java.util.HashMap<>();
    public Course findById(int id) { return database.get(id); }
    public void save(Course course) { database.put(course.getId(), course); }
}

// 2. Service: 负责业务规则编排
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

// 3. Controller: 负责外部接待与协议转换
public class CourseController {
    private final EnrollmentService enrollmentService;
    public CourseController(EnrollmentService service) { this.enrollmentService = service; }

    public String handleEnrollRequest(Student student, String courseIdStr) {
        try {
            int courseId = Integer.parseInt(courseIdStr);
            boolean ok = enrollmentService.enroll(student, courseId);
            return ok ? "{"status": 200, "msg": "选课成功"}" : "{"status": 409, "msg": "选课失败"}";
        } catch (NumberFormatException e) {
            return "{"status": 400, "msg": "参数非法"}";
        }
    }
}
```

---

## 4. 第一部分总结

我们完成了后端的骨架演进。在网线的另一端，用户面对的是一个由 DOM 和事件组成的浏览器世界。

接下来，我们将跨过网线，进入第二部分：**页面开始变复杂**。
', 'public', '2251213429@qq.com', 12, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-2', 'part-2', 'doc:book-hello-system', '第二部分 · 页面开始变复杂', '', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-13-html-css-dom', '13-html-css-dom', 'doc:hello-system-part-2', '第13章 网页最开始根本不需要框架', '# 第13章 网页最开始根本不需要框架

## 1. 最初情境：纯粹的 Web 三剑客

在 React、Vue 等现代庞大框架统治前端开发之前，整个互联网依靠极其纯粹的三大基石运转了二十年：
- **HTML（结构）**：描述页面有哪些信息和层级；
- **CSS（样式）**：描述这些信息呈现的视觉规则；
- **JavaScript（行为）**：赋予页面极少量的局部动态交互。

早期 Mini Campus 选课系统的网页，只需要一个简单的 `index.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>Mini Campus 选课系统</title>
    <style>
        .card { border: 1px solid #ccc; padding: 16px; border-radius: 8px; width: 300px; }
        .full { color: red; }
    </style>
</head>
<body>
    <h1>校园选课系统</h1>
    <div class="card">
        <h2 id="course-name">计算机系统导论</h2>
        <p>剩余名额: <span id="course-remaining">1</span> / 100</p>
        <button id="enroll-btn">选课</button>
    </div>

    <script>
        let remaining = 1;
        document.getElementById(''enroll-btn'').addEventListener(''click'', function() {
            if (remaining > 0) {
                remaining--;
                document.getElementById(''course-remaining'').innerText = remaining;
                alert(''选课成功！'');
                if (remaining === 0) {
                    this.disabled = true;
                    this.innerText = ''已满员'';
                }
            }
        });
    </script>
</body>
</html>
```

---

## 2. 浏览器的物理渲染流水线

当浏览器接收到 HTML 字节流时，底层渲染引擎（如 Chromium Blink / WebKit）会经历以下严格物理流水线：

```mermaid
flowchart TD
    Bytes["HTML / CSS 网络字节流"] --> Tokenizer["分词解析器 (Tokenization)"]
    Tokenizer --> Tree["构建 DOM 树 (Document Object Model)"]
    Tree --> CSSOM["计算 CSSOM 样式树 (Computed Styles)"]
    CSSOM --> Layout["布局排版 (Layout / Reflow)
计算每个盒子的几何坐标与尺寸"]
    Layout --> Paint["绘制图层 (Paint)
将文字、颜色转化为像素填充指令"]
    Paint --> Composite["GPU 光栅化合成 (Raster & Compositing)
最终输出到显卡帧缓冲区"]
```

在页面极其简单时，这种直接编写 HTML 并通过少量原生 JS 事件监听的方式，拥有**零构建耗时、零框架体积消耗、极高首屏加载速度**的绝对优势。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-14-dom-manipulation-mess', '14-dom-manipulation-mess', 'doc:hello-system-part-2', '第14章 直接操作DOM为什么迟早会出问题？', '# 第14章 直接操作DOM为什么迟早会出问题？

## 1. 业务扩张带来的 DOM 操作泥潭

当 Mini Campus 页面不仅有单个按钮，而是增加了：
1. 顶部全局未读通知徽章（需要加 1）；
2. 右侧已选课程总学分悬浮条（需要累加 3 学分）；
3. 课程卡片按钮变为不可点击；
4. 搜索框过滤课程时隐藏已满课程。

采用原生 DOM 操作的 JavaScript 代码会迅速演变成一张极其错综复杂的网状蜘蛛网：

```javascript
// 痛苦的命令式 DOM 联动代码
function handleEnrollSuccess(course) {
    // 1. 手动修改卡片内部名额
    const remainEl = document.querySelector(''#card-'' + course.id + '' .remaining'');
    remainEl.innerText = parseInt(remainEl.innerText) - 1;

    // 2. 手动修改按钮状态
    const btn = document.querySelector(''#card-'' + course.id + '' button'');
    btn.disabled = true;
    btn.innerText = ''已选修'';

    // 3. 手动修改顶部徽章
    const badge = document.getElementById(''global-enrolled-badge'');
    badge.innerText = parseInt(badge.innerText) + 1;

    // 4. 手动向侧边栏插入一个新 li 节点
    const sidebarList = document.getElementById(''sidebar-course-list'');
    const li = document.createElement(''li'');
    li.id = ''sidebar-item-'' + course.id;
    li.innerHTML = course.name + '' <button onclick="handleDrop('' + course.id + '')">退选</button>'';
    sidebarList.appendChild(li);

    // 5. 手动更新总学分
    const creditEl = document.getElementById(''total-credits'');
    creditEl.innerText = parseInt(creditEl.innerText) + course.credits;
}
```

---

## 2. 致命危机：DOM 变成了系统状态的唯一存储器

```mermaid
flowchart LR
    subgraph Mess ["命令式 DOM 泥潭 (多源状态撕裂)"]
        Action1["选课点击"] -->|手动修改| DOM1["卡片剩余名额文本"]
        Action1 -->|手动修改| DOM2["按钮 Disabled 属性"]
        Action1 -->|手动修改| DOM3["侧边栏 li 列表"]
        Action1 -->|手动修改| DOM4["顶部徽章数字"]

        Action2["退课点击"] -->|漏改了某个 DOM| DOM3
        Action3["搜索框筛选"] -->|意外清空重建| DOM1
    end
```

一旦系统稍微复杂：
- 如果某处漏改了某一个 DOM 节点，系统就会陷入：**侧边栏显示已选 2 门课，顶部徽章却显示 1，总学分显示 0 的数据撕裂！**
- DOM 树本应只是**用来展示的像素投影**，但在命令式编程中，它被反客为主当成了**保存系统状态的数据库**。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-15-state-driven-ui', '15-state-driven-ui', 'doc:hello-system-part-2', '第15章 究竟应该让页面保存数据，还是让数据决定页面？', '# 第15章 究竟应该让页面保存数据，还是让数据决定页面？

## 1. 认知范式的大倒转：声明式（Declarative）

解决 DOM 泥潭的根本手段，是彻底颠覆软件的心智模型：

> **传统命令式思维**：页面上有若干 DOM，我发生了一个事件，我一步一步手动去拔动每一个 DOM 节点。  
> **现代声明式思维**：系统内部维护一个纯粹的 JavaScript 内存状态（State）。我只描述“状态长成这样时，页面应该长成什么样”。剩下的 DOM 同步工作，全部由底层框架自动搞定。

#### 核心宇宙公式：
$$UI = f(State)$$

```mermaid
flowchart LR
    State["纯内存状态 State
{ courses: [...], enrolledIds: [101] }"] -->|纯函数计算 f(State)| VirtualDOM["虚拟 DOM 描述结构"]
    VirtualDOM -->|框架自动 Patch 差异| RealDOM["真实页面 DOM"]
```

你只需要修改内存中的数据，页面会自动变成对应状态的准确投影。
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-16-vue-reactivity-under-the-hood', '16-vue-reactivity-under-the-hood', 'doc:hello-system-part-2', '第16章 “数据变了，页面自己变”到底是什么意思？', '# 第16章 “数据变了，页面自己变”到底是什么意思？

## 1. 响应式的核心机制：Proxy 拦截

Vue 3 之所以能在你修改对象属性时自动刷新页面，底层依赖于 JavaScript 的核心机制：**`Proxy` 代理对象**。

系统通过拦截属性的**读操作（Get）**和**写操作（Set）**，实现了两大关键动作：
1. **依赖收集（Track）**：当某个渲染函数在读取 `course.enrolled` 时，Vue 偷偷把这个渲染函数登记在当前属性的“观察者名单”中；
2. **依赖触发（Trigger）**：当你执行 `course.enrolled++` 时，Vue 拦截到赋值，立即遍历“观察者名单”，通知所有依赖该属性的渲染函数重新执行！

```mermaid
flowchart TD
    subgraph Read ["读取属性 (Get)"]
        Render["渲染函数 render()"] -->|读取 state.enrolled| ProxyGet["Proxy get() 拦截"]
        ProxyGet --> Track["Track 依赖收集
将 render 记录到 Set 集合中"]
    end

    subgraph Write ["修改属性 (Set)"]
        UserAction["用户点击: state.enrolled++"] --> ProxySet["Proxy set() 拦截"]
        ProxySet --> Trigger["Trigger 依赖触发
取出 Set 中的全部 render() 重新执行"]
        Trigger --> Patch["重新计算并更新 DOM"]
    end
```

---

## 2. 最小响应式原型的 30 行可运行实现

```javascript
let activeEffect = null;
const targetMap = new WeakMap();

// 收集依赖
function track(target, key) {
    if (!activeEffect) return;
    let depsMap = targetMap.get(target);
    if (!depsMap) targetMap.set(target, (depsMap = new Map()));
    let dep = depsMap.get(key);
    if (!dep) depsMap.set(key, (dep = new Set()));
    dep.add(activeEffect);
}

// 触发更新
function trigger(target, key) {
    const depsMap = targetMap.get(target);
    if (!depsMap) return;
    const dep = depsMap.get(key);
    if (dep) dep.forEach(effect => effect());
}

// 创建响应式对象
function reactive(obj) {
    return new Proxy(obj, {
        get(target, key) {
            track(target, key);
            return target[key];
        },
        set(target, key, value) {
            target[key] = value;
            trigger(target, key);
            return true;
        }
    });
}
```
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-17-computed-and-caching', '17-computed-and-caching', 'doc:hello-system-part-2', '第17章 computed为什么不是一个普通函数？', '# 第17章 computed为什么不是一个普通函数？

## 1. 派生状态与普通函数的性能陷阱

在选课系统中，我们经常需要计算：
- 已选课程的总学分；
- 当前是否还能继续选课（是否达到学分上限）。

如果在模板中直接调用普通函数：
```html
<p>总学分: {{ calculateTotalCredits() }}</p>
<p>总学分: {{ calculateTotalCredits() }}</p>
```
每次页面有任何无关变量发生微小变化引起重绘时，`calculateTotalCredits` 都会被重复调用无数次。

---

## 2. computed 的核心秘密：脏标记（Dirty Flag）与缓存

`computed` 本质上是一个**带有缓存的惰性计算响应式对象**：
1. 只有当它依赖的响应式源数据（如已选课程列表）发生变化时，它才会被打上“脏（`dirty = true`）”的标记；
2. 只要依赖没有变，无论外界读取它多少次，它都会直接从内存缓存中返回上一次计算好的旧值。

```mermaid
flowchart TD
    Read["外部读取 computed 属性"] --> CheckDirty{"_dirty 是否为 true?"}
    CheckDirty -->|是 (数据已变)| Calc["重新执行计算函数
缓存新结果, _dirty = false"]
    CheckDirty -->|否 (数据未变)| Cache["直接返回上次缓存的值 (零计算开销)"]
```
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-18-watch-and-side-effects', '18-watch-and-side-effects', 'doc:hello-system-part-2', '第18章 watch到底应该什么时候使用？', '# 第18章 watch到底应该什么时候使用？

## 1. 纯计算 vs 副作用（Side Effects）

- **`computed`**：适用于**纯派生数据计算**。输入若干响应式数据，输出一个新的值。严禁在 computed 内部发起网络请求或修改其他状态！
- **`watch`**：专门用于处理**副作用（Side Effects）**。当某个状态发生变化时，需要执行某种与外界环境交互的动作（如发起 HTTP 请求、写 LocalStorage、设置定时器）。

```javascript
// 典型的 watch 正确用法：当选课状态变化时，异步持久化到本地存储
watch(enrolledCourseIds, (newIds) => {
    localStorage.setItem(''saved_courses'', JSON.stringify(newIds));
    console.log(''已自动保存选课状态到本地存储'');
}, { deep: true });
```
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-19-component-decomposition', '19-component-decomposition', 'doc:hello-system-part-2', '第19章 为什么页面最终必须被拆开？', '# 第19章 为什么页面最终必须被拆开？

## 1. 单巨石页面的崩溃与组件化（Component）

当选课系统页面包含 50 个功能点时，把所有代码堆在一个 `App.vue` 文件中将造成几千行的巨石灾难。

组件化的本质是：**在前端领域重新运用高内聚低耦合原则，将 HTML 模板、CSS 样式与 JS 逻辑打包成一个自包含的自治砖块。**

```mermaid
flowchart TD
    App["App.vue (顶层根组件)"]
    Nav["CampusHeader.vue (顶部导航与通知)"]
    Main["CourseList.vue (课程列表容器)"]
    Card1["CourseCard.vue (单门课程卡片)"]
    Card2["CourseCard.vue"]
    Side["StudentSidebar.vue (右侧个人课表)"]

    App --> Nav
    App --> Main
    App --> Side
    Main --> Card1
    Main --> Card2
```
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-20-props-events-data-flow', '20-props-events-data-flow', 'doc:hello-system-part-2', '第20章 组件之间怎样传递信息？', '# 第20章 组件之间怎样传递信息？

## 1. 单向数据流（One-Way Data Flow）铁律

现代前端组件树通信遵循严格的单向流动规则：
- **Props Down**：父组件向子组件单向传递只读属性数据；
- **Events Up**：子组件不得擅自修改 Prop，必须通过抛出自定义事件（`emit`）请求父组件修改。

```mermaid
flowchart TD
    Parent["父组件 (CourseList)"]
    Child["子组件 (CourseCard)"]

    Parent -->|1. 传入只读数据 :course=''item'' (Props Down)| Child
    Child -->|2. 用户点击, 向上抛出事件 @enroll=''handleEnroll'' (Events Up)| Parent
```

这样保证了**单一数据源（Single Source of Truth, SSOT）**，任何状态的修改源头都在父级清晰可溯。
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-21-component-lifecycle', '21-component-lifecycle', 'doc:hello-system-part-2', '第21章 组件什么时候出生？', '# 第21章 组件什么时候出生？

## 1. 组件生命周期（Lifecycle Hooks）

组件在浏览器内存和 DOM 树中经历完整的生老病死：

```mermaid
stateDiagram-v2
    [*] --> Setup: 组件实例化 (创建响应式状态)
    Setup --> Mounted: onMounted (真实 DOM 已挂载到页面, 适宜发起异步 API 请求)
    Mounted --> Updated: onUpdated (响应式状态改变, DOM 重新渲染完成)
    Mounted --> Unmounted: onUnmounted (组件被销毁, 必须清理定时器与全局事件监听)
    Unmounted --> [*]
```

### 黄金法则：
- **网络请求发起时机**：通常在 `onMounted()` 中执行，保证数据返回时 DOM 容器已就绪；
- **防止内存泄漏**：在 `onUnmounted()` 中必须显式清理所有未完成的定时器（`clearInterval`）与全局事件监听器（`window.removeEventListener`）。
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-22-spa-and-client-routing', '22-spa-and-client-routing', 'doc:hello-system-part-2', '第22章 一个网站为什么能有很多“页面”？', '# 第22章 一个网站为什么能有很多“页面”？

## 1. 单页面应用（SPA）与客户端路由

在传统网站中，点击链接会导致浏览器向后端请求一个全新的 HTML 文件并触发全屏白屏刷新。

而在现代单页面应用（SPA）中：
1. 整个网站**永远只有一个 HTML 入口**；
2. 当用户点击“查看课表”跳转到 `/my-schedule` 时，前端路由库（如 Vue Router）通过 **HTML5 History API（`pushState`）** 拦截浏览器跳转行为，静默修改地址栏 URL；
3. 根据当前 URL 动态卸载旧组件并挂载新组件，实现**丝滑零刷新的页面切换体验**。

```mermaid
flowchart LR
    URL["用户点击路由链接 /schedule"] --> Router["前端路由器 Vue Router 拦截"]
    Router --> PushState["调用 history.pushState() 修改地址栏 (无网络刷新)"]
    Router --> SwitchComp["根据路由表在 <router-view> 中
动态替换显示 ScheduleView 组件"]
```
', 'public', '2251213429@qq.com', 10, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-23-global-state-management', '23-global-state-management', 'doc:hello-system-part-2', '第23章 状态应该放在哪里？', '# 第23章 状态应该放在哪里？

## 1. 属性钻取（Prop Drilling）的极限与全局 Store

当处于树形结构不同分支的深层组件（如导航栏右侧的个人头像，与主界面右下角的选课结算单）都需要共享当前登录学生信息时，如果一层一层通过 Props 传递，会造成严重的**属性钻取地狱**。

全局状态管理库（如 Pinia）在全应用单例中维护公共状态池：

```mermaid
flowchart TD
    subgraph GlobalPiniaStore ["全局状态仓库 (Pinia Store)"]
        UserState["currentUser: { id: 1001, name: ''李雷'' }"]
        EnrollState["enrolledCourses: [...]"]
    end

    CompA["HeaderAvatar 组件 (深层叶子节点)"] -->|直接订阅读取| UserState
    CompB["EnrollmentCheckout 组件 (深层叶子节点)"] -->|直接调用 Action 修改| EnrollState
```
', 'public', '2251213429@qq.com', 11, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-24-browser-data-vs-db-data', '24-browser-data-vs-db-data', 'doc:hello-system-part-2', '第24章 浏览器里的数据不是数据库里的数据', '# 第24章 浏览器里的数据不是数据库里的数据

## 1. 五层数据形态的全景认知

在走过前端世界之后，每一个工程师必须树立清晰的数据介质分层认知：

```mermaid
flowchart LR
    L1["1. DOM 树
(UI 像素层)"] <--> L2["2. Vue Proxy 状态
(浏览器 JS 堆内存)"]
    L2 <-->|JSON 序列化| L3["3. HTTP 报文
(网络字节流传输层)"]
    L3 <-->|反序列化| L4["4. 后端 Entity/DTO
(服务器堆内存)"]
    L4 <-->|SQL 驱动读写| L5["5. 关系表 / B+ 树 / 扇区
(持久化物理磁盘)"]
```

- 浏览器里的 JavaScript 变量是**脆弱的瞬态数据**，一旦用户按 F5 刷新或者断电，全部化为乌有；
- 只有经过网络协议跨越边界，写入数据库的持久化介质，数据才获得真正的生命。

接下来，我们将离开浏览器的图形世界，深入最坚固的物理数据堡垒——**第三部分：数据需要一个真正的家**。
', 'public', '2251213429@qq.com', 12, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-3', 'part-3', 'doc:book-hello-system', '第三部分 · 数据需要一个真正的家', '', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-25-why-not-excel-super-table', '25-why-not-excel-super-table', 'doc:hello-system-part-3', '第25章 为什么不能把所有东西写进一个Excel一样的大表？', '# 第25章 为什么不能把所有东西写进一个Excel一样的大表？

## 1. 朴素直觉方案：一张超级大宽表

当一个初学者刚开始设计选课系统的持久化存储时，最直观的方案就是建一张如同 Excel 般包罗万象的超级大宽表：

```text
超级宽表: mega_enrollment_sheet
┌──────┬────────┬────────┬──────────┬──────────────────┬──────────┬──────────┬──────────┬──────────┐
│ 学号 │ 姓名   │ 院系   │ 课程代码 │ 课程名称         │ 任课教师 │ 教师电话 │ 教室地点 │ 成绩     │
├──────┼────────┼────────┼──────────┼──────────────────┼──────────┼──────────┼──────────┼──────────┤
│ 1001 │ 李雷   │ 计科系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │ 92       │
│ 1001 │ 李雷   │ 计科系 │ CS-102   │ 离散数学基础     │ 赵教授   │ 13800002 │ 教一102  │ NULL     │
│ 1002 │ 韩梅梅 │ 计科系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │ 88       │
│ 1003 │ 张三   │ 软件系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │ NULL     │
└──────┴────────┴────────┴──────────┴──────────────────┴──────────┴──────────┴──────────┴──────────┘
```

在最初的 10 条数据里，这张表看起来非常直观：所有信息一目了然，不需要做任何跨表拼接。

然而，随着真实业务的展开，超级大宽表将立刻爆发“三大灾难”。

---

## 2. 超级大宽表的三大破坏性灾难

### 灾难一：插入异常（Insertion Anomaly）
学校新开设了一门高阶课程《量子计算前沿》，分配了任课教师和教室，但此时选课尚未开放，**没有任何学生选修这门课**。

请问：你能把这门新课存进上面的表里吗？

**不能！** 因为这张表的每一行都以“学号”作为起点。如果没有学生选课，“学号”、“姓名”字段就必须填 `NULL`。而很多系统强制要求学号为主键非空，导致**新课程在没有学生选课前根本无法存入系统**！

### 灾难二：更新异常（Update Anomaly）
严教授更换了新的手机号码。

在这张超级宽表里，全校有 300 名学生选了严教授的课，严教授的名字和电话被重复复制了 300 遍。如果更新时不小心只修改了其中的 299 行，系统就会陷入**同一位教授在不同行拥有两个不同手机号的荒谬分裂**！

### 灾难三：删除异常（Deletion Anomaly）
《离散数学基础》这门课全校只有李雷一个人选修。

后来李雷退选了这门课。系统删除了李雷选修该课的那一行记录。结果：**这门课程的名字、赵教授的信息、教室地点随着李雷退选的这一行记录，在全系统中被连根拔起、彻底抹除蒸发！**

```mermaid
flowchart TD
    Table["超级大宽表 (全部混在一起)"]
    
    A1["插入异常: 没学生选课时，新课程无法录入"] --> Table
    A2["更新异常: 教师改电话需修改 300 行，极易数据不一致"] --> Table
    A3["删除异常: 最后一个学生退课，导致课程本身数据被彻底抹除"] --> Table
```
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-26-relational-model-math', '26-relational-model-math', 'doc:hello-system-part-3', '第26章 一张关系表到底是什么？', '# 第26章 一张关系表到底是什么？

## 1. 关系模型的数学本质

1970 年，埃德加·科德（Edgar F. Codd）提出了**关系模型（Relational Model）**，彻底改写了人类数据存储的历史。

在严格的数学定义中：
- **域（Domain）**：一组具有相同数据类型的原子值的集合（如所有合法学号的集合 $D_1$、所有合法姓名的集合 $D_2$）；
- **笛卡尔积（Cartesian Product）**：$D_1 \times D_2 \times \dots \times D_n$ 是所有可能组合构成的庞大空间；
- **关系（Relation）**：是笛卡尔积的一个**有意义的子集**，在二维表现上就是一张**表（Table）**；
- **元组（Tuple）**：表中的一行记录，代表一个具体的现实实体或关联；
- **属性（Attribute）**：表中的一列，代表实体的一个特定特征维度。

```mermaid
flowchart LR
    Domain["数学域 Domain
(合法值的取值范围)"] --> Product["笛卡尔积空间 D1 x D2 x ... x Dn"]
    Product --> SubSet["关系 Relation (笛卡尔积的有效子集)"]
    SubSet --> Table["物理表现: 二维关系数据表"]
```
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-27-primary-keys-and-identity', '27-primary-keys-and-identity', 'doc:hello-system-part-3', '第27章 数据库如何知道“这个人就是这个人”？', '# 第27章 数据库如何知道“这个人就是这个人”？

## 1. 键（Key）的层级推导

在一张包含 10 万名学生的表中，如果存在两个同名同姓同班级的“张伟”，数据库如何从物理上绝对区分他们？

1. **超键（Super Key）**：能够唯一标识一行元组的属性集（如 `{学号, 姓名}`）；
2. **候选键（Candidate Key）**：没有多余冗余属性的**最小超键**（如 `{学号}` 或 `{身份证号}`）；
3. **主键（Primary Key, PK）**：从候选键中钦定的、代表实体核心身份的唯一标识符。

```mermaid
flowchart TD
    SK["超键 Super Key
(能够区分实体的任意属性组合)"]
    CK["候选键 Candidate Key
(剔除冗余属性后的最小超键)"]
    PK["主键 Primary Key
(钦定的唯一物理/逻辑身份)"]

    SK -->|最小化精炼| CK
    CK -->|选拔核心代表| PK
```

#### 实体完整性约束（Entity Integrity）：
> **主键属性绝对不得为 NULL，且在整张表中必须全局唯一。**
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-28-foreign-keys-and-junction-tables', '28-foreign-keys-and-junction-tables', 'doc:hello-system-part-3', '第28章 两张表怎样重新认识彼此？', '# 第28章 两张表怎样重新认识彼此？

## 1. 破解大宽表：拆分为自治实体表

为了彻底消除第 25 章的大宽表三大灾难，我们必须将实体拆分为独立表：
- **学生表（students）**
- **课程表（courses）**

此时，一个学生可以选多门课，一门课可以被多个学生选，两者构成了**多对多（Many-to-Many, N:M）**关系。

---

## 2. 选课关联表（Junction Table）的诞生

在关系模型中，多对多关系必须通过引入第三张**关联中间表（Junction Table / Association Table）**拆解为两个一对多关系：

```mermaid
erDiagram
    STUDENTS ||--o{ ENROLLMENTS : "1 对 多"
    COURSES ||--o{ ENROLLMENTS : "1 对 多"

    STUDENTS {
        int id PK "学号"
        string name "姓名"
        string major "院系"
    }

    COURSES {
        int id PK "课程ID"
        string code UK "课程代码 (CS-101)"
        string name "课程名称"
        int capacity "容量"
    }

    ENROLLMENTS {
        int id PK "选课流水号"
        int student_id FK "外键 -> students.id"
        int course_id FK "外键 -> courses.id"
        timestamp created_at "选课时间"
    }
```

#### 参照完整性（Referential Integrity）：
> 外键列的值必须要么是目标表主键中真实存在的值，要么为 NULL。数据库引擎将在物理底层阻止向不存在的课程插入选课记录。
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-29-sql-declarative-nature', '29-sql-declarative-nature', 'doc:hello-system-part-3', '第29章 SQL究竟是一种什么语言？', '# 第29章 SQL究竟是一种什么语言？

## 1. 声明式语言（Declarative）vs 过程式语言

在 Java / C++ 中，你必须告诉计算机**“怎么做（How）”**（先初始化循环变量、再比较、再指针移动）。

而在 SQL 中，你只需要告诉数据库引擎**“我要什么（What）”**：

```sql
SELECT c.name, COUNT(e.id) AS enrolled_count
FROM courses c
LEFT JOIN enrollments e ON c.id = e.course_id
WHERE c.capacity > 50
GROUP BY c.id, c.name
HAVING enrolled_count > 10
ORDER BY enrolled_count DESC
LIMIT 5;
```

---

## 2. SQL 底层真实的物理执行顺序

很多初学者误以为 SQL 是从第一行的 `SELECT` 开始执行的，这是完全错误的！

数据库查询优化器（Query Optimizer）的实际物理执行顺序为：

```mermaid
flowchart TD
    S1["1. FROM (确定数据源表)"] --> S2["2. ON (执行连接条件过滤)"]
    S2 --> S3["3. JOIN (生成连接虚拟表)"]
    S3 --> S4["4. WHERE (行级单条件过滤)"]
    S4 --> S5["5. GROUP BY (维度聚合分组)"]
    S5 --> S6["6. HAVING (聚合后分组过滤)"]
    S6 --> S7["7. SELECT (计算投影列表达式)"]
    S7 --> S8["8. DISTINCT (排重)"]
    S8 --> S9["9. ORDER BY (物理排序)"]
    S9 --> S10["10. LIMIT / OFFSET (分页截断)"]
```
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-30-join-magic', '30-join-magic', 'doc:hello-system-part-3', '第30章 JOIN为什么能把被拆开的世界重新拼起来？', '# 第30章 JOIN为什么能把被拆开的世界重新拼起来？

## 1. 关系拼合的四种集合形态

我们在第 28 章把大宽表拆成了多张表，当我们查询“李雷选了哪些课”时，`JOIN` 负责在内存中重新将碎片拼合：

```mermaid
flowchart LR
    subgraph INNER ["INNER JOIN (交集)"]
        direction TB
        I_Desc["只保留两边外键均匹配成功的记录
(既有学生信息又有选课记录)"]
    end

    subgraph LEFT ["LEFT JOIN (左外连接)"]
        direction TB
        L_Desc["保留左表全部记录
即使某课程 0 人选修，右侧字段补 NULL 显示"]
    end
```

```sql
-- 查询所有课程及其当前选修学生（即使无人选修也列出课程）
SELECT c.name AS course_name, s.name AS student_name
FROM courses c
LEFT JOIN enrollments e ON c.id = e.course_id
LEFT JOIN students s ON e.student_id = s.id;
```
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-31-group-by-and-aggregation', '31-group-by-and-aggregation', 'doc:hello-system-part-3', '第31章 GROUP BY到底改变了什么？', '# 第31章 GROUP BY到底改变了什么？

## 1. 空间维度的坍缩（Dimensional Collapse）

`GROUP BY` 是 SQL 中最容易让初学者产生语法报错的关键字。

它的本质是：**将多行细粒度的元组，按照指定的维度字段，坍缩成单个宏观的“分组桶（Bucket）”。**

```mermaid
flowchart TD
    subgraph RawRows ["原始细粒度行 (每行代表一次选课)"]
        R1["CS-101, 李雷"]
        R2["CS-101, 韩梅梅"]
        R3["CS-102, 李雷"]
    end

    subgraph GroupedBuckets ["GROUP BY course_code 坍缩分组"]
        B1["桶: CS-101
包含 2 条原始记录 -> COUNT() = 2"]
        B2["桶: CS-102
包含 1 条原始记录 -> COUNT() = 1"]
    end

    RawRows --> GroupedBuckets
```

#### 铁律：
> 一旦执行了 `GROUP BY`，`SELECT` 列表中只能出现**分组维度字段**以及**聚合函数（`COUNT`, `SUM`, `AVG`, `MAX`）**。绝对不能直接写未经聚合的普通字段（因为一个桶里有多条不同的值，数据库无法决定选哪一个）。
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-32-lossless-decomposition', '32-lossless-decomposition', 'doc:hello-system-part-3', '第32章 为什么“把数据拆开”也会拆错？', '# 第32章 为什么“把数据拆开”也会拆错？

## 1. 有损拆分与虚假元组（Spurious Tuples）

拆分表并不是随意切两刀就行。如果拆分不当，在重新 `JOIN` 时会凭空捏造出原本不存在的虚假数据：

```mermaid
flowchart TD
    Original["原始表 (学生, 课程, 教师)"] --> BadSplit["错误拆分方式:
表A (学生, 教师) + 表B (课程, 教师)"]
    BadSplit --> BadJoin["重新执行 NATURAL JOIN"]
    BadJoin --> Ghost["产生虚假元组 (Spurious Tuples)!
李雷被错误关联到了他根本没选的赵教授课程中"]
```

#### 无损连接分解（Lossless Join Decomposition）准则：
> 两个子表的公共属性集，必须至少是其中一个子表的**超键（Super Key）**。
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-33-functional-dependencies', '33-functional-dependencies', 'doc:hello-system-part-3', '第33章 函数依赖到底在描述什么？', '# 第33章 函数依赖到底在描述什么？

## 1. 现实业务约束的数学形式化：$X \to Y$

> **函数依赖（Functional Dependency, FD）**：若在属性集 $X$ 上的取值一旦确定，属性集 $Y$ 的取值就唯一确定，记作 $X \to Y$（$X$ 函数决定 $Y$）。

在 Mini Campus 业务中：
1. $\text{学号} \to \text{姓名, 院系}$
2. $\text{课程代码} \to \text{课程名称, 学分, 教室}$
3. $\text{\{学号, 课程代码\}} \to \text{成绩}$

理解函数依赖，是推导数据库范式（Normal Forms）的唯一数学工具。
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-34-normalization-in-practice', '34-normalization-in-practice', 'doc:hello-system-part-3', '第34章 范式不是考试规则，而是在修复数据结构', '# 第34章 范式不是考试规则，而是在修复数据结构

## 1. 经典范式逐级进化路线

```mermaid
flowchart TD
    N0["原始非规范化表"] -->|1NF: 消除非原子字段, 确保列不可再分| N1["第一范式 (1NF)"]
    N1 -->|2NF: 消除非主属性对主键的部分函数依赖| N2["第二范式 (2NF)"]
    N2 -->|3NF: 消除非主属性对主键的传递函数依赖| N3["第三范式 (3NF)"]
    N3 -->|BCNF: 消除主属性对非候选键的决定依赖| NBC["BCNF 范式"]
```

- **1NF**：每一个列的值都必须是原子的（不得在一个字段里存用逗号隔开的多个电话）；
- **2NF**：一张表如果有复合主键（如 `{学号, 课程代码}`），表里的每一个字段都必须依赖整个复合主键，不能只依赖其中一半（把“课程名称”从选课记录表中剔除出去）；
- **3NF**：非主键属性之间不能形成传递依赖（把“系主任名字”从学生表中剔除，建立独立的院系表）。
', 'public', '2251213429@qq.com', 10, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-35-bplus-tree-index', '35-bplus-tree-index', 'doc:hello-system-part-3', '第35章 数据库为什么不需要每次从头找？', '# 第35章 数据库为什么不需要每次从头找？

## 1. 全表扫描的绝望 vs B+ 树的毫秒奇迹

当 `students` 表增长到 1000 万行记录时：
- **无索引（全表扫描 $O(N)$）**：数据库必须从磁盘顺序读取 1000 万行数据，产生数十万次磁盘 I/O，查询耗时高达 15 秒；
- **B+ 树索引（$O(\log N)$）**：B+ 树是一种拥有极高扇出比（Fanout $\ge 1000$）的“矮胖多路平衡搜索树”。一棵 3 层的 B+ 树即可索引超过 10 亿行数据！定位任意一条学号只需 **3 次内存/磁盘寻址**，耗时不到 1 毫秒。

```mermaid
flowchart TD
    Root["B+ 树根节点 (驻留内存)
[1000, 2000, 3000]"]
    L1_1["中间层节点
[1001, 1300, 1700]"]
    L1_2["中间层节点
[2001, 2500, 2800]"]
    
    Leaf1["叶子数据页 (Page 0x10)
[1001, 李雷] <-> [1002, 韩梅梅]"]
    Leaf2["叶子数据页 (Page 0x20)
[1301, 张三] <-> [1302, 李四]"]

    Root --> L1_1
    Root --> L1_2
    L1_1 --> Leaf1
    L1_1 --> Leaf2
    Leaf1 <==>|双向有序链表| Leaf2
```
', 'public', '2251213429@qq.com', 11, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-36-acid-transactions', '36-acid-transactions', 'doc:hello-system-part-3', '第36章 为什么一次修改不能只成功一半？', '# 第36章 为什么一次修改不能只成功一半？

## 1. 事务（Transaction）与 ACID 四大堡垒

一次选课操作包含两步核心 SQL：
```sql
UPDATE courses SET enrolled = enrolled + 1 WHERE id = 101; -- 步骤 1
INSERT INTO enrollments (student_id, course_id) VALUES (1001, 101); -- 步骤 2
```

如果在步骤 1 执行完后机房突然断电：
名额少了一个，学生列表里却没有李雷的名字。数据陷入了毁灭性的撕裂。

事务通过 **ACID** 捍卫系统：
- **A (Atomicity, 原子性)**：两步操作要么全部成功，要么全部回滚（通过 **Undo Log** 实现）；
- **C (Consistency, 一致性)**：系统状态从一个合法状态跃迁到另一个合法状态，不变量绝不打破；
- **I (Isolation, 隔离性)**：并发事务互不干扰（通过锁与 **MVCC** 实现）；
- **D (Durability, 持久性)**：事务一旦提交，数据永不丢失（通过 **Redo Log WAL** 预写日志物理落盘）。
', 'public', '2251213429@qq.com', 12, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-37-concurrency-and-locking', '37-concurrency-and-locking', 'doc:hello-system-part-3', '第37章 两个人同时点击最后一个名额会发生什么？', '# 第37章 两个人同时点击最后一个名额会发生什么？

## 1. 争抢最后一个名额的物理时序

假设课程只剩 1 个名额，李雷和韩梅梅在完全相同的时刻点击了“选课”：

```mermaid
sequenceDiagram
    autonumber
    actor L as 李雷的事务 T1
    participant DB as 数据库引擎 (InnoDB)
    actor M as 韩梅梅的事务 T2

    L->>DB: 1. SELECT capacity, enrolled FROM courses WHERE id=101; (查到 100/99, 还有1个名额)
    M->>DB: 2. SELECT capacity, enrolled FROM courses WHERE id=101; (同样查到 100/99, 还有1个名额!)
    L->>DB: 3. UPDATE courses SET enrolled = enrolled + 1 WHERE id=101; (更新为 100/100)
    M->>DB: 4. UPDATE courses SET enrolled = enrolled + 1 WHERE id=101; (更新为 100/101, 严重超卖!)
```

---

## 2. 数据库级防御：行级排他锁（X-Lock）

解决超卖的根本手段，是在读取时直接锁定该行记录：

```sql
-- 开启显式排他锁
BEGIN;
SELECT capacity, enrolled FROM courses WHERE id = 101 FOR UPDATE;
-- 此时其他事务如果也执行 FOR UPDATE，将被数据库挂起阻塞，直到本事务 COMMIT!
UPDATE courses SET enrolled = enrolled + 1 WHERE id = 101;
INSERT INTO enrollments (student_id, course_id) VALUES (1001, 101);
COMMIT;
```

现在，数据在数据库的堡垒中安然无恙。

接下来，我们将进入全书的枢纽——**第四部分：前端第一次遇见后端**。
', 'public', '2251213429@qq.com', 13, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-4', 'part-4', 'doc:book-hello-system', '第四部分 · 前端第一次遇见后端', '', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-38-browser-cannot-touch-db-directly', '38-browser-cannot-touch-db-directly', 'doc:hello-system-part-4', '第38章 浏览器为什么不能直接操作数据库？', '# 第38章 浏览器为什么不能直接操作数据库？

## 1. 致命设想：让前端直接连数据库执行 SQL

很多刚学完 SQL 和前端的同学常问一个问题：
> “既然浏览器里有 JavaScript，数据库可以用 TCP 连接，为什么我们不能直接在前端写：`db.query(''UPDATE courses SET enrolled = enrolled + 1 ...'')`，为什么非要折腾一个中间的后端服务器？”

如果在生产环境中让浏览器直连数据库，系统将在 5 分钟内彻底毁灭：

```mermaid
flowchart TD
    Browser["不可信的用户浏览器 (任何人按 F12 均可查看修改)"]
    DB["核心数据库 (MySQL / PostgreSQL)"]

    Browser -->|1. 账号密码泄露: 数据库 root 密码直接写在前端 JS 中| DB
    Browser -->|2. SQL 注入灭顶之灾: 用户可直接执行 DROP TABLE| DB
    Browser -->|3. 连接池瞬间枯竭: 1 万个学生直接把 200 个最大连接数撑爆| DB
    Browser -->|4. 业务守门员缺失: 前端代码可被随意篡改绕过名额检查| DB
```

---

## 2. 后端的核心定位：不可逾越的安全与信任边界

**前端是不可信的荒野，后端是可信的堡垒。**

后端服务器是整个系统的：
1. **安全守门人**：保管数据库账号密码，拦截所有未鉴权请求；
2. **连接池管家**：用几十个复用的物理连接服务全校上万名用户；
3. **业务裁判官**：无论前端如何篡改，业务规则的最终裁决权永远在后端。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-39-http-protocol-agreement', '39-http-protocol-agreement', 'doc:hello-system-part-4', '第39章 HTTP到底帮我们约定了什么？', '# 第39章 HTTP到底帮我们约定了什么？

## 1. 纯文本报文的结构解剖

HTTP 是一种基于 TCP 的、无状态的、纯文本应用层协议。

### 请求报文（Request）：
```http
POST /api/enrollments HTTP/1.1
Host: campus.university.edu
Content-Type: application/json
Authorization: Bearer token_student_1001

{"studentId": 1001, "courseId": 2048}
```

### 响应报文（Response）：
```http
HTTP/1.1 201 Created
Content-Type: application/json
Content-Length: 48

{"status": "SUCCESS", "message": "选课成功"}
```

```mermaid
flowchart LR
    Req["HTTP 请求报文
[请求行: POST /api/enrollments]
[请求头: Content-Type, Auth]
[空行: CRLF]
[请求体: JSON Payload]"]
    Resp["HTTP 响应报文
[状态行: HTTP/1.1 201 Created]
[响应头: Content-Type]
[空行: CRLF]
[响应体: 返回结果 JSON]"]
    
    Req -->|跨网络传输| Resp
```
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-40-json-the-lingua-franca', '40-json-the-lingua-franca', 'doc:hello-system-part-4', '第40章 JSON为什么总出现在前后端之间？', '# 第40章 JSON为什么总出现在前后端之间？

## 1. 跨异构语言的普通话

前端运行的是 JavaScript 引擎，后端可能是 Java、Go 或 Python。它们在内存中的对象布局完全不同。

**JSON（JavaScript Object Notation）** 充当了跨语言的“通用普通话”：

```mermaid
flowchart LR
    JS["浏览器 JS 内存对象
{ courseId: 101, name: ''CS'' }"] -->|JSON.stringify() 序列化| ByteStream["纯文本字节流
''{"courseId":101}''"]
    ByteStream -->|网络传输| Net["TCP / IP 传输"]
    Net --> ByteStream2["服务器接收字节流"]
    ByteStream2 -->|Jackson / Gson 反序列化| Java["Java 堆内存 DTO 对象
EnrollRequestDto 实例"]
```
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-41-the-first-real-api', '41-the-first-real-api', 'doc:hello-system-part-4', '第41章 第一条真正的API', '# 第41章 第一条真正的API

## 1. 案例追踪：GET /api/courses

当用户打开页面时，前端发起获取课程列表的请求：

```mermaid
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
    Repo->>DB: SELECT * FROM courses WHERE status = ''ACTIVE''
    DB-->>Repo: 返回结果集
    Repo-->>Svc: 封装为 List<Course>
    Svc-->>Ctrl: 转换为 List<CourseVO>
    Ctrl-->>Vue: 返回 JSON 数组 HTTP 200 OK
    Note over Vue: Vue 响应式状态更新，页面渲染卡片列表
```
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-42-the-click-moment', '42-the-click-moment', 'doc:hello-system-part-4', '第42章 点击“选课”', '# 第42章 点击“选课”

## 1. 第一次完整前后端闭环：POST /api/enrollments

前端代码：
```javascript
async function handleEnroll(courseId) {
    loading.value = true;
    try {
        const response = await fetch(''/api/enrollments'', {
            method: ''POST'',
            headers: { ''Content-Type'': ''application/json'' },
            body: JSON.stringify({ studentId: currentUser.id, courseId: courseId })
        });
        if (response.ok) {
            alert(''选课成功！'');
        }
    } finally {
        loading.value = false;
    }
}
```
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-43-skinny-controller', '43-skinny-controller', 'doc:hello-system-part-4', '第43章 Controller为什么不能自己完成一切？', '# 第43章 Controller为什么不能自己完成一切？

## 1. 瘦 Controller 原则（Skinny Controller）

Controller 是纯粹的**协议接待员**：
- 负责提取 HTTP Body、Query 参数；
- 负责校验参数基本格式（非空、邮箱格式）；
- **绝不包含任何核心业务逻辑，绝不直接碰 SQL**。

```java
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
```
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-44-service-the-rule-sanctuary', '44-service-the-rule-sanctuary', 'doc:hello-system-part-4', '第44章 Service到底是什么？', '# 第44章 Service到底是什么？

## 1. 业务不变量编排圣殿

Service 承载系统的灵魂：
1. **跨实体业务规则编排**：检查学生是否存在 $	o$ 检查是否重复选课 $	o$ 检查先修课是否通过 $	o$ 扣减课程名额；
2. **事务边界控制（`@Transactional`）**：保证多步持久化操作同生共死。

```java
@Service
public class EnrollmentService {
    @Transactional
    public EnrollResult enroll(int studentId, int courseId) {
        // 编排业务流程，守卫核心不变量
        // 自动开启与提交数据库事务
    }
}
```
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-45-repository-persistence-abstraction', '45-repository-persistence-abstraction', 'doc:hello-system-part-4', '第45章 Repository为什么存在？', '# 第45章 Repository为什么存在？

## 1. 屏蔽底层存储介质差异

Repository 将数据库伪装成一个**内存集合**：

```java
public interface CourseRepository {
    Optional<Course> findById(int id);
    void save(Course course);
}
```

- 在单元测试时，可以使用 `InMemoryCourseRepository`（极速执行，无需启动数据库）；
- 在生产环境时，切换为 `MyBatisCourseRepository` 或 `JpaCourseRepository`。Service 层代码一行都不需要修改！
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-46-entity-dto-vo-boundary', '46-entity-dto-vo-boundary', 'doc:hello-system-part-4', '第46章 为什么系统里有这么多“长得差不多”的对象？', '# 第46章 为什么系统里有这么多“长得差不多”的对象？

## 1. 隔离边界：Entity vs DTO vs VO

很多初学者觉得系统里既有 `Course`，又有 `CourseDTO`，还有 `CourseVO`，是在脱裤子放屁。

请看如果不做隔离的灾难：
如果你直接把数据库实体 `Student`（包含密码哈希、身份证号、银行卡号）直接当作 JSON 返回给前端：**用户的敏感隐私数据将瞬间全部泄露给全世界！**

```mermaid
flowchart LR
    DB[(数据库存储)] <-->|1. 映射| Entity["Entity 领域实体
(包含 passwordHash, 完整字段)"]
    Entity <-->|2. 转换| DTO["DTO 传输对象
(跨网络传输最小必要字段)"]
    DTO <-->|3. 封装| VO["VO 视图对象
(对前端脱敏、格式化展示)"]
    VO <--> Client["前端视图展示"]
```
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-5', 'part-5', 'doc:book-hello-system', '第五部分 · 真实系统开始反抗', '', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-47-defensive-validation', '47-defensive-validation', 'doc:hello-system-part-5', '第47章 如果用户提交了一份错误的数据呢？', '# 第47章 如果用户提交了一份错误的数据呢？

## 1. 零信任架构（Zero Trust）：前端防君子，后端防小人

在真实网络环境中，攻击者可以绕过前端页面的任何表单校验规则，直接使用 Postman 或 Python 脚本向后端发送恶意 JSON：
- `{"studentId": -999, "courseId": "null"}`
- `{"studentId": 1001, "courseId": 2048, "adminPrivilege": true}`

#### 铁律：
> **前端校验只是为了提升正常用户的交互体验（减少无谓的网络往返），后端校验才是捍卫系统安全的真正铁门。**
> 后端必须假设所有从网络流入的字节流都是充满敌意和污染的。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-48-exception-and-rollback', '48-exception-and-rollback', 'doc:hello-system-part-5', '第48章 如果程序运行到一半失败了呢？', '# 第48章 如果程序运行到一半失败了呢？

## 1. 异常调用栈穿透与事务自动回滚

当选课过程中抛出业务异常（如 `CourseFullException`）时：

```mermaid
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
```
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-49-http-status-codes-in-action', '49-http-status-codes-in-action', 'doc:hello-system-part-5', '第49章 HTTP 200并不代表所有事情都成功', '# 第49章 HTTP 200并不代表所有事情都成功

## 1. 状态码的精准语义矩阵

许多低质量系统喜欢无论发生什么都返回 `HTTP 200 OK`，然后在 Body 里塞 `{"code": -1, "msg": "密码错误"}`。

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
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-50-idempotency-and-repeated-clicks', '50-idempotency-and-repeated-clicks', 'doc:hello-system-part-5', '第50章 如果用户连续点十次按钮呢？', '# 第50章 如果用户连续点十次按钮呢？

## 1. 幂等性（Idempotency）与防重防抖

当网络出现几秒钟卡顿时，急躁的学生往往会在 1 秒内疯狂点击 10 次“选课”按钮。

- **前端防抖（Debounce）**：点击瞬间将按钮置为 `disabled`，展示 loading 转圈；
- **后端幂等 Token 机制**：进入选课页面时预先生成一个唯一的 `requestToken`，后端使用 Redis 或数据库唯一索引记录该 Token。后续携带相同 Token 的重复请求直接被拦截或返回相同结果，**绝不重复扣减名额**。
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-51-cas-and-optimistic-locking', '51-cas-and-optimistic-locking', 'doc:hello-system-part-5', '第51章 如果两个人争抢最后一个名额呢？', '# 第51章 如果两个人争抢最后一个名额呢？

## 1. CAS 条件更新与乐观并发控制（OCC）

悲观排他锁（`FOR UPDATE`）在高并发下会导致大量数据库连接排队阻塞。

工业级秒杀选课常采用基于 **CAS（Compare And Swap）** 的无锁条件更新：

```sql
-- 一行 SQL 实现原子扣减防超卖
UPDATE courses 
SET enrolled = enrolled + 1, version = version + 1
WHERE id = 2048 
  AND enrolled < capacity; -- 核心防线：只有当前已选人数小于容量时才允许更新！
```

数据库通过行级原子的 Update 锁裁决：
- 李雷的请求命中，更新成功（影响行数 1）；
- 韩梅梅的请求在同一微秒执行时，由于条件 `enrolled < capacity` 已不再满足，更新失败（影响行数 0）。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-52-wal-and-crash-recovery', '52-wal-and-crash-recovery', 'doc:hello-system-part-5', '第52章 如果系统重启，数据为什么还在？', '# 第52章 如果系统重启，数据为什么还在？

## 1. 预写重做日志（WAL, Write-Ahead Logging）

在传统机械硬盘或 SSD 上，随机写入一个数据页（16KB）极其缓慢。

数据库为了保证高性能同时不丢失数据，采用了 **WAL 机制**：

```mermaid
flowchart TD
    Update["事务提交 COMMIT"] --> WAL["1. 顺序追加写入 Redo Log (WAL 日志)
极速顺序 I/O (微秒级)"]
    WAL --> DiskWAL["WAL 刷盘成功 (fsync)"]
    DiskWAL --> Resp["立刻向客户端返回选课成功！"]
    
    Resp -.-> BufferPool["2. 内存 Buffer Pool 中的数据页标记为脏页 (Dirty)"]
    BufferPool -.->|后台异步排队| LazyFlush["3. Checkpoint 检查点后台刷入物理数据文件 (慢速随机 I/O)"]
```

如果在步骤 3 之前突然停电：
系统重启时，数据库引擎自动重放 WAL 日志中的全部操作，将丢失的内存修改**物理重做（Redo Recovery）**回来！
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-53-logging-and-observability', '53-logging-and-observability', 'doc:hello-system-part-5', '第53章 程序出错以后，我们怎么知道发生了什么？', '# 第53章 程序出错以后，我们怎么知道发生了什么？

## 1. 工业级日志（Logging）四大核心要素

严禁在生产代码中写 `System.out.println()` 或 `e.printStackTrace()`。

一份合格的结构化日志必须包含：
1. **精确物理时间戳（Timestamp）**
2. **日志级别（Log Level）**：`DEBUG`, `INFO`, `WARN`, `ERROR`
3. **全链路追踪标识（Trace ID / Request ID）**：跨前后端全链路串联单次请求
4. **上下文结构化实体（Context）**：学号、课程代码、当前耗时

```json
{"timestamp":"2026-08-28T10:00:00.123Z","level":"INFO","traceId":"req-a8f9-4b12","service":"EnrollmentService","action":"ENROLL_SUCCESS","studentId":1001,"courseId":2048,"costMs":42}
```
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-54-environment-isolation-12factor', '54-environment-isolation-12factor', 'doc:hello-system-part-5', '第54章 “在我的电脑上可以运行”为什么远远不够？', '# 第54章 “在我的电脑上可以运行”为什么远远不够？

## 1. 环境隔离与 12-Factor 原则

- **开发环境（DEV）**：本地轻量 SQLite / H2 数据库，日志输出详细 DEBUG；
- **测试环境（TEST）**：用于自动化测试与 QA 验收；
- **生产环境（PROD）**：高可用 MySQL 集群，严格安全审计。

#### 核心原则：
> **配置与代码严格分离（Config via Environment Variables）**。
> 数据库连接串、秘钥、外部服务地址必须通过环境变量注入，严禁硬编码在任何源码文件中。
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-55-test-pyramid', '55-test-pyramid', 'doc:hello-system-part-5', '第55章 怎样证明我们的代码还可以工作？', '# 第55章 怎样证明我们的代码还可以工作？

## 1. 测试金字塔（The Test Pyramid）

```mermaid
flowchart TD
    E2E["端到端测试 (E2E Tests)
数量极少, 运行慢, 模拟真实浏览器点击"]
    Integration["集成测试 (Integration Tests)
测试 Controller -> Service -> DB 整体链路"]
    Unit["单元测试 (Unit Tests)
数量庞大, 毫秒级执行, 针对领域实体与算法规则"]

    E2E --> Integration
    Integration --> Unit
```

单元测试是保护重构的唯一救生索。当业务规则变更时，成百上千个自动化测试用例在几秒钟内全部跑通，是工程师对系统拥有绝对信心的唯一来源。
', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-part-6', 'part-6', 'doc:book-hello-system', '第六部分 · 重新走完那几百毫秒', '', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-56-full-request-journey', '56-full-request-journey', 'doc:hello-system-part-6', '第56章 从浏览器到数据库', '# 第56章 从浏览器到数据库

## 1. 案例追踪：李雷选择 CS-101 (320 毫秒全景透视)

学生 ID：`1001`（李雷）  
课程 ID：`2048`（《计算机系统导论》）

现在，我们将整本书学到的全部知识，串联进这一条 320 毫秒的执行链路中：

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户李雷
    participant DOM as 浏览器 DOM
    participant Vue as Vue 3 运行时
    participant Net as 网络协议栈
    participant Web as Web 容器
    participant Ctrl as CourseController
    participant Svc as BasicEnrollService
    participant Repo as CourseRepository
    participant DB as MySQL 存储引擎

    User->>DOM: 1. 物理点击选课按钮
    DOM->>Vue: 2. 触发 @click 事件监听
    Note over Vue: 3. 按钮变禁用灰色, 设置 submitting 为 true, 打包 JSON 载荷
    Vue->>Net: 4. fetch 发起 HTTP POST 请求
    Note over Net: 5. TCP 三次握手复用, IP 寻址, 网线物理跳跃传播 (40ms)
    Net->>Web: 6. 字节流到达机房 Web 服务器
    Web->>Ctrl: 7. 路由匹配, 反序列化为 DTO, 履行身份鉴权检验
    Ctrl->>Svc: 8. 调用 enroll(studentId=1001, 2048)
    Note over Svc: 9. 开启事务, 设置隔离级别
    Svc->>Repo: 10. findCourseForUpdate(2048)
    Repo->>DB: 11. SELECT 带有排他读锁 (加锁寻址)
    Note over DB: 12. 查找到数据索引记录页, 锁定该数据页行记录 (排他锁)
    DB-->>Repo: 13. 返回当前数据对象 (关联合格)
    Repo-->>Svc: 14. 转换为 Course 领域对象
    Note over Svc: 15. 业务校验通过, 执行 course.enroll() 状态跃迁
    Svc->>Repo: 16. 提交选课记录与记录更新
    Repo->>DB: 17. UPDATE 与新增记录入库 (落盘更新)
    Note over DB: 18. 顺序追加写入 Redo Log WAL, 执行 Commit 事务持久化落盘
    DB-->>Repo: 19. 确认落盘更新成功
    Repo-->>Svc: 20. 持久化成功告知
    Svc-->>Ctrl: 21. 选课业务成功返回 DTO
    Ctrl-->>Web: 22. 包装 HTTP 201 Created JSON 报文
    Web-->>Net: 23. 网卡发送网络数据包 (回传 40ms)
    Net-->>Vue: 24. 异步响应返回, 浏览器接收文本并反序列化 JSON
    Note over Vue: 25. 响应式依赖系统被触发, 重新计算虚拟 DOM 生成补丁 Patch
    Vue->>DOM: 26. 局部刷新文本与属性 (显示“选课成功”)
    DOM-->>User: 27. 屏幕光栅化刷新显示, 流程圆满闭环
```

---

## 2. 空间与介质的跃迁

在这 320 毫秒里，数据完成了一场壮丽的物理跨越：
1. **光学与机械**：鼠标微动开关闭合，光标停留在屏幕对应坐标；
2. **电磁与光纤**：TCP 数据报转化为高频电脉冲与光信号，在数百公里的光缆中以接近光速的速度飞驰；
3. **硅晶片与逻辑门**：CPU 在数十亿个晶体管间完成寄存器加载、分支预测与比较计算；
4. **磁畴与浮栅电荷**：SSD 闪存颗粒上的浮栅捕获电子，将选课事实永久铭刻在物理介质上；
5. **光子与视网膜**：屏幕液晶分子偏转，发出绿色的光子射入李雷的眼睛。
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-57-why-we-have-layers', '57-why-we-have-layers', 'doc:hello-system-part-6', '第57章 我们为什么最终得到了这么多层？', '# 第57章 我们为什么最终得到了这么多层？

## 1. 每一层都是一次危机的遗迹

回望全书，我们没有凭空发明任何一层概念：

- **类与封装**：是为了对抗**散落变量与隐式关联撕裂**的危机；
- **响应式与组件化**：是为了对抗**直接操作 DOM 的命令式泥潭**；
- **关系范式与外键**：是为了对抗**超级大宽表的三大异常**；
- **B+ 树与索引**：是为了对抗**海量数据全表扫描的绝望 I/O**；
- **Controller 层**：是为了对抗**网络协议细节对业务逻辑的侵蚀**；
- **Service 层**：是为了提供一个不受环境干扰的**业务不变量编排圣殿**；
- **Repository 层**：是为了对抗**业务代码与特定物理存储绑死的脆弱性**；
- **ACID 事务与行锁**：是为了对抗**硬件崩溃与高并发争抢**。

每一层架构，都是前人在与系统复杂性搏斗时修筑的防波堤。
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-58-anti-overengineering', '58-anti-overengineering', 'doc:hello-system-part-6', '第58章 架构是不是越复杂越好？', '# 第58章 架构是不是越复杂越好？

## 1. 复杂度的购买力法则

> **架构不是越复杂越好，架构是用可控的静态复杂度，去购买应对动态规模扩张的能力。**

如果一个系统只有 2 个开发者、每天只有 50 次点击：
- 搞微服务集群、分布式事务、消息队列、Kubernetes，就是典型的**过度设计（Over-Engineering）**与自寻烦恼；
- 优秀工程师的标志，不是看他能把系统设计得多复杂，而是看他能否**用最节制、最优雅的最小抽象，精准解决当前尺度的核心矛盾**。
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-59-eternal-pillars-beyond-frameworks', '59-eternal-pillars-beyond-frameworks', 'doc:hello-system-part-6', '第59章 框架消失以后，还剩下什么？', '# 第59章 框架消失以后，还剩下什么？

## 1. 潮水退去后的六大永恒基石

框架会过时，类库会更替，语法糖会消亡。但计算机软件系统的六大底层法则永恒不变：

```mermaid
flowchart TD
    Root["计算机软件系统的六大永恒基石"]
    
    P1["1. 状态 (State)
内存中的变量是瞬态的，磁盘中的数据是持久的"]
    P2["2. 封装与不变量 (Invariants)
谁拥有数据，谁就拥有修改数据的唯一权力"]
    P3["3. 关系与投影 (Relational Model)
现实实体的解构与数学拼合"]
    P4["4. 协议与契约 (Protocols & Interfaces)
跨越物理与抽象边界的通用语言"]
    P5["5. 并发与锁 (Concurrency & Isolation)
在物理时间切片中维持确定性"]
    P6["6. 可靠性与容灾 (WAL & Idempotency)
在充满缺陷与故障的物理硬件上构建确定性"]

    Root --> P1
    Root --> P2
    Root --> P3
    Root --> P4
    Root --> P5
    Root --> P6
```
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-60-click-again', '60-click-again', 'doc:hello-system-part-6', '第60章 现在，再点击一次“选课”', '# 第60章 现在，再点击一次“选课”

## 1. 重回起点：你眼中的世界已经改变

现在，再次回到那个星期一的上午。

李雷再次把鼠标光标移动到那个蓝色的“选课”按钮上。

当你再次看着他按下左键时，在你脑海中浮现的，将不再只是一个简单的按钮变灰和一行提示文字。

你会“看到”：
- 浏览器事件循环捕获微秒级电信号，注入响应式代理系统；
- 状态在虚拟 DOM 树上流淌，触发差异计算；
- JSON 字节流沿着以太网光缆飞驰数十公里；
- 接入层控制器剥去协议外衣，将 DTO 交付给业务服务；
- 业务服务以事务为盾，守卫着“名额不超卖、不重复选课”的神圣不变量；
- 数据库引擎沿着 B+ 树的枝桠迅速降落到物理数据页，申请行级排他锁；
- WAL 顺序日志在毫秒内刷入磁盘，确保即便世界在下一秒断电，这一份承诺也永不磨灭；
- 响应报文逆流而上，穿过网络，解冻 Promise，最终在屏幕上点亮那行绿色的像素。

你已经不再是一个只会写几行代码的初学者。

**你已经看清了一个完整软件系统跳动的脉搏。**

欢迎来到现代软件工程的世界。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix', 'appendix', 'doc:book-hello-system', '附录 · Mini Campus 全景参考与速查', '', 'public', '2251213429@qq.com', 9, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-a', 'appendix-a', 'doc:hello-system-appendix', '附录A Mini Campus 最终项目工程结构', '# 附录A Mini Campus 最终项目工程结构

```text
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
```
', 'public', '2251213429@qq.com', 1, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-b', 'appendix-b', 'doc:hello-system-appendix', '附录B Mini Campus 数据库设计与完整 ER 图', '# 附录B Mini Campus 数据库设计与完整 ER 图

```mermaid
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
```
', 'public', '2251213429@qq.com', 2, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-c', 'appendix-c', 'doc:hello-system-appendix', '附录C 核心 SQL 速查手册', '# 附录C 核心 SQL 速查手册

## 1. DDL 基础建表与约束

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

-- 选课表
CREATE TABLE enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT ''ACTIVE'',
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (course_id) REFERENCES courses(id),
    UNIQUE KEY uk_student_course (student_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 2. 高并发高安全名额扣减操作

```sql
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
```
', 'public', '2251213429@qq.com', 3, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-d', 'appendix-d', 'doc:hello-system-appendix', '附录D Vue 3 核心概念与心智速查', '# 附录D Vue 3 核心概念与心智速查

| 概念 | 核心定位 | 典型使用场景 | 常见误区 |
| :--- | :--- | :--- | :--- |
| **ref** | 基础类型/对象的响应式包装 | 声明单个变量、计数器、表单值 | 忘记在 JS 中通过 `.value` 读写 |
| **reactive** | 对象的 Proxy 深层代理 | 聚合表单对象 | 解构赋值后会丢失响应式 |
| **computed** | 具有缓存特性的派生状态 | 根据列表计算过滤结果、统计总额 | 试图在 computed 内部发起异步网络请求 |
| **watch** | 状态变化触发的副作用 | 数据改变后同步到网络、LocalStorage | 滥用 watch 代替 computed 计算派生数据 |
| **Props** | 父组件向子组件单向传递的入参 | 传递数据、配置项 | 子组件尝试直接修改 props 属性 |
| **Emit** | 子组件向父组件汇报的事件 | 按钮点击、状态变更通知 | 跨多层组件时层层 emit 导致链路脆弱 |
| **Pinia** | 全局单一真相来源状态树 | 登录用户信息、购物车、全局通知 | 把局部简单表单数据也塞入全局 store |
', 'public', '2251213429@qq.com', 4, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-e', 'appendix-e', 'doc:hello-system-appendix', '附录E 面向对象核心思想速查', '# 附录E 面向对象核心思想速查

- **不变量（Invariant）**：对象在任何时刻都必须为真的业务契约（如 $0 \le \text{enrolled} \le \text{capacity}$）；
- **封装（Encapsulation）**：隐藏数据物理布局，仅暴露受保护的状态跃迁行为；
- **组合（has-a）**：一个类持有另一个类的实例，优先于继承使用；
- **依赖（uses-a）**：方法入参临时使用外部对象；
- **继承（is-a）**：严格的子类型替代关系（里氏替换）；
- **多态（Polymorphism）**：同一抽象调用在运行时通过虚方法表动态分派到具体实现；
- **接口（Interface）**：完全脱离实现细节的纯粹契约与插座。
', 'public', '2251213429@qq.com', 5, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-f', 'appendix-f', 'doc:hello-system-appendix', '附录F HTTP 状态码与 REST API 规范速查', '# 附录F HTTP 状态码与 REST API 规范速查

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
', 'public', '2251213429@qq.com', 6, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-g', 'appendix-g', 'doc:hello-system-appendix', '附录G 计算机专业进阶学习路线图', '# 附录G 计算机专业进阶学习路线图

读完《Hello System》，你已经建立了软件系统的全景骨架。接下来，你可以向各个方向深入探索：

```mermaid
flowchart TD
    Core["《Hello System》全景图解"] --> Hard["底层硬件与系统方向
- 计算机组成原理 (408)
- 操作系统与 Linux 内核
- 计算机网络协议栈"]
    Core --> Arch["软件工程与架构方向
- 设计模式与重构
- 领域驱动设计 (DDD)
- 分布式系统与微服务"]
    Core --> Data["数据与算法方向
- 数据库内核实现 (CMU 15-445)
- 高级数据结构与算法
- 搜索引擎与流计算"]
```
', 'public', '2251213429@qq.com', 7, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-appendix-h', 'appendix-h', 'doc:hello-system-appendix', '附录H 核心技术术语中英对照表', '# 附录H 核心技术术语中英对照表

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
', 'public', '2251213429@qq.com', 8, 0, 215, '');

INSERT INTO docs (id, slug, parent_id, title, body_md, visibility, author_email, sort_order, is_book, cover_hue, summary)
VALUES ('doc:hello-system-epilogue', 'epilogue', 'doc:book-hello-system', '后记: 愿你建造出坚固而优美的系统', '# 后记: 愿你建造出坚固而优美的系统

计算机科学是一门年轻而神奇的工程学科。

物理学家需要受限于宇宙的基本粒子与引力常数，土木工程师需要受限于钢筋混凝土的材料极限。

而在软件的世界里，除了 CPU 的时钟节拍、内存的寻址边界和光纤在物理介质中的传播速度，**我们构建一切逻辑大厦的材料，纯粹是人类思想本身的抽象能力。**

当你看到无数个状态在内存与磁盘间穿梭，看到不同模块通过协议严丝合缝地咬合，看到一个历经千万人并发冲撞的系统依然稳如泰山时，你会感受到一种属于工程师的、极度纯粹的智力美感。

愿《Hello System》成为你计算机探索之旅上的一块坚实基石。

去写代码吧，去直面现实世界的混乱与挑战，去建造属于你的坚固而优美的系统！
', 'public', '2251213429@qq.com', 10, 0, 215, '');

COMMIT;
