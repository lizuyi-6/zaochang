// scripts/builder-system/part3.mjs
// 第三部分：数据需要一个真正的家 (25 ~ 37)
// 深度教科书级高密度完整版本 (全 13 章完整深度展开)

export const part3Docs = [
  {
    id: "doc:hello-system-part-3",
    slug: "part-3",
    parentId: "'doc:book-hello-system'",
    title: "第三部分 · 数据需要一个真正的家",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-system-25-why-not-excel-super-table",
    slug: "25-why-not-excel-super-table",
    parentId: "'doc:hello-system-part-3'",
    title: "第25章 为什么不能把所有东西写进一个Excel一样的大表？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第25章 为什么不能把所有东西写进一个Excel一样的大表？

## 1. 朴素直觉方案：一张超级大宽表

当一个初学者刚开始设计选课系统的持久化存储时，最直观的方案就是建一张如同 Excel 般包罗万象的超级大宽表：

\`\`\`text
超级宽表: mega_enrollment_sheet
┌──────┬────────┬────────┬──────────┬──────────────────┬──────────┬──────────┬──────────┬──────────┐
│ 学号 │ 姓名   │ 院系   │ 课程代码 │ 课程名称         │ 任课教师 │ 教师电话 │ 教室地点 │ 成绩     │
├──────┼────────┼────────┼──────────┼──────────────────┼──────────┼──────────┼──────────┼──────────┤
│ 1001 │ 李雷   │ 计科系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │ 92       │
│ 1001 │ 李雷   │ 计科系 │ CS-102   │ 离散数学基础     │ 赵教授   │ 13800002 │ 教一102  │ NULL     │
│ 1002 │ 韩梅梅 │ 计科系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │ 88       │
│ 1003 │ 张三   │ 软件系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │ NULL     │
└──────┴────────┴────────┴──────────┴──────────────────┴──────────┴──────────┴──────────┴──────────┘
\`\`\`

在最初的 10 条数据里，这张表看起来非常直观：所有信息一目了然，不需要做任何跨表拼接。

然而，随着真实业务的展开，超级大宽表将立刻爆发“三大灾难”。

---

## 2. 超级大宽表的三大破坏性灾难

### 灾难一：插入异常（Insertion Anomaly）
学校新开设了一门高阶课程《量子计算前沿》，分配了任课教师和教室，但此时选课尚未开放，**没有任何学生选修这门课**。

请问：你能把这门新课存进上面的表里吗？

**不能！** 因为这张表的每一行都以“学号”作为起点。如果没有学生选课，“学号”、“姓名”字段就必须填 \`NULL\`。而很多系统强制要求学号为主键非空，导致**新课程在没有学生选课前根本无法存入系统**！

### 灾难二：更新异常（Update Anomaly）
严教授更换了新的手机号码。

在这张超级宽表里，全校有 300 名学生选了严教授的课，严教授的名字和电话被重复复制了 300 遍。如果更新时不小心只修改了其中的 299 行，系统就会陷入**同一位教授在不同行拥有两个不同手机号的荒谬分裂**！

### 灾难三：删除异常（Deletion Anomaly）
《离散数学基础》这门课全校只有李雷一个人选修。

后来李雷退选了这门课。系统删除了李雷选修该课的那一行记录。结果：**这门课程的名字、赵教授的信息、教室地点随着李雷退选的这一行记录，在全系统中被连根拔起、彻底抹除蒸发！**

\`\`\`mermaid
flowchart TD
    Table["超级大宽表 (全部混在一起)"]
    
    A1["插入异常: 没学生选课时，新课程无法录入"] --> Table
    A2["更新异常: 教师改电话需修改 300 行，极易数据不一致"] --> Table
    A3["删除异常: 最后一个学生退课，导致课程本身数据被彻底抹除"] --> Table
\`\`\`
`
  },
  {
    id: "doc:hello-system-26-relational-model-math",
    slug: "26-relational-model-math",
    parentId: "'doc:hello-system-part-3'",
    title: "第26章 一张关系表到底是什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 2,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第26章 一张关系表到底是什么？

## 1. 关系模型的数学本质

1970 年，埃德加·科德（Edgar F. Codd）提出了**关系模型（Relational Model）**，彻底改写了人类数据存储的历史。

在严格的数学定义中：
- **域（Domain）**：一组具有相同数据类型的原子值的集合（如所有合法学号的集合 $D_1$、所有合法姓名的集合 $D_2$）；
- **笛卡尔积（Cartesian Product）**：$D_1 \\times D_2 \\times \\dots \\times D_n$ 是所有可能组合构成的庞大空间；
- **关系（Relation）**：是笛卡尔积的一个**有意义的子集**，在二维表现上就是一张**表（Table）**；
- **元组（Tuple）**：表中的一行记录，代表一个具体的现实实体或关联；
- **属性（Attribute）**：表中的一列，代表实体的一个特定特征维度。

\`\`\`mermaid
flowchart LR
    Domain["数学域 Domain\n(合法值的取值范围)"] --> Product["笛卡尔积空间 D1 x D2 x ... x Dn"]
    Product --> SubSet["关系 Relation (笛卡尔积的有效子集)"]
    SubSet --> Table["物理表现: 二维关系数据表"]
\`\`\`
`
  },
  {
    id: "doc:hello-system-27-primary-keys-and-identity",
    slug: "27-primary-keys-and-identity",
    parentId: "'doc:hello-system-part-3'",
    title: "第27章 数据库如何知道“这个人就是这个人”？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第27章 数据库如何知道“这个人就是这个人”？

## 1. 键（Key）的层级推导

在一张包含 10 万名学生的表中，如果存在两个同名同姓同班级的“张伟”，数据库如何从物理上绝对区分他们？

1. **超键（Super Key）**：能够唯一标识一行元组的属性集（如 \`{学号, 姓名}\`）；
2. **候选键（Candidate Key）**：没有多余冗余属性的**最小超键**（如 \`{学号}\` 或 \`{身份证号}\`）；
3. **主键（Primary Key, PK）**：从候选键中钦定的、代表实体核心身份的唯一标识符。

\`\`\`mermaid
flowchart TD
    SK["超键 Super Key\n(能够区分实体的任意属性组合)"]
    CK["候选键 Candidate Key\n(剔除冗余属性后的最小超键)"]
    PK["主键 Primary Key\n(钦定的唯一物理/逻辑身份)"]

    SK -->|最小化精炼| CK
    CK -->|选拔核心代表| PK
\`\`\`

#### 实体完整性约束（Entity Integrity）：
> **主键属性绝对不得为 NULL，且在整张表中必须全局唯一。**
`
  },
  {
    id: "doc:hello-system-28-foreign-keys-and-junction-tables",
    slug: "28-foreign-keys-and-junction-tables",
    parentId: "'doc:hello-system-part-3'",
    title: "第28章 两张表怎样重新认识彼此？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 4,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第28章 两张表怎样重新认识彼此？

## 1. 破解大宽表：拆分为自治实体表

为了彻底消除第 25 章的大宽表三大灾难，我们必须将实体拆分为独立表：
- **学生表（students）**
- **课程表（courses）**

此时，一个学生可以选多门课，一门课可以被多个学生选，两者构成了**多对多（Many-to-Many, N:M）**关系。

---

## 2. 选课关联表（Junction Table）的诞生

在关系模型中，多对多关系必须通过引入第三张**关联中间表（Junction Table / Association Table）**拆解为两个一对多关系：

\`\`\`mermaid
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
\`\`\`

#### 参照完整性（Referential Integrity）：
> 外键列的值必须要么是目标表主键中真实存在的值，要么为 NULL。数据库引擎将在物理底层阻止向不存在的课程插入选课记录。
`
  },
  {
    id: "doc:hello-system-29-sql-declarative-nature",
    slug: "29-sql-declarative-nature",
    parentId: "'doc:hello-system-part-3'",
    title: "第29章 SQL究竟是一种什么语言？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第29章 SQL究竟是一种什么语言？

## 1. 声明式语言（Declarative）vs 过程式语言

在 Java / C++ 中，你必须告诉计算机**“怎么做（How）”**（先初始化循环变量、再比较、再指针移动）。

而在 SQL 中，你只需要告诉数据库引擎**“我要什么（What）”**：

\`\`\`sql
SELECT c.name, COUNT(e.id) AS enrolled_count
FROM courses c
LEFT JOIN enrollments e ON c.id = e.course_id
WHERE c.capacity > 50
GROUP BY c.id, c.name
HAVING enrolled_count > 10
ORDER BY enrolled_count DESC
LIMIT 5;
\`\`\`

---

## 2. SQL 底层真实的物理执行顺序

很多初学者误以为 SQL 是从第一行的 \`SELECT\` 开始执行的，这是完全错误的！

数据库查询优化器（Query Optimizer）的实际物理执行顺序为：

\`\`\`mermaid
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
\`\`\`
`
  },
  {
    id: "doc:hello-system-30-join-magic",
    slug: "30-join-magic",
    parentId: "'doc:hello-system-part-3'",
    title: "第30章 JOIN为什么能把被拆开的世界重新拼起来？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 6,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第30章 JOIN为什么能把被拆开的世界重新拼起来？

## 1. 关系拼合的四种集合形态

我们在第 28 章把大宽表拆成了多张表，当我们查询“李雷选了哪些课”时，\`JOIN\` 负责在内存中重新将碎片拼合：

\`\`\`mermaid
flowchart LR
    subgraph INNER ["INNER JOIN (交集)"]
        direction TB
        I_Desc["只保留两边外键均匹配成功的记录\n(既有学生信息又有选课记录)"]
    end

    subgraph LEFT ["LEFT JOIN (左外连接)"]
        direction TB
        L_Desc["保留左表全部记录\n即使某课程 0 人选修，右侧字段补 NULL 显示"]
    end
\`\`\`

\`\`\`sql
-- 查询所有课程及其当前选修学生（即使无人选修也列出课程）
SELECT c.name AS course_name, s.name AS student_name
FROM courses c
LEFT JOIN enrollments e ON c.id = e.course_id
LEFT JOIN students s ON e.student_id = s.id;
\`\`\`
`
  },
  {
    id: "doc:hello-system-31-group-by-and-aggregation",
    slug: "31-group-by-and-aggregation",
    parentId: "'doc:hello-system-part-3'",
    title: "第31章 GROUP BY到底改变了什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 7,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第31章 GROUP BY到底改变了什么？

## 1. 空间维度的坍缩（Dimensional Collapse）

\`GROUP BY\` 是 SQL 中最容易让初学者产生语法报错的关键字。

它的本质是：**将多行细粒度的元组，按照指定的维度字段，坍缩成单个宏观的“分组桶（Bucket）”。**

\`\`\`mermaid
flowchart TD
    subgraph RawRows ["原始细粒度行 (每行代表一次选课)"]
        R1["CS-101, 李雷"]
        R2["CS-101, 韩梅梅"]
        R3["CS-102, 李雷"]
    end

    subgraph GroupedBuckets ["GROUP BY course_code 坍缩分组"]
        B1["桶: CS-101\n包含 2 条原始记录 -> COUNT() = 2"]
        B2["桶: CS-102\n包含 1 条原始记录 -> COUNT() = 1"]
    end

    RawRows --> GroupedBuckets
\`\`\`

#### 铁律：
> 一旦执行了 \`GROUP BY\`，\`SELECT\` 列表中只能出现**分组维度字段**以及**聚合函数（\`COUNT\`, \`SUM\`, \`AVG\`, \`MAX\`）**。绝对不能直接写未经聚合的普通字段（因为一个桶里有多条不同的值，数据库无法决定选哪一个）。
`
  },
  {
    id: "doc:hello-system-32-lossless-decomposition",
    slug: "32-lossless-decomposition",
    parentId: "'doc:hello-system-part-3'",
    title: "第32章 为什么“把数据拆开”也会拆错？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 8,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第32章 为什么“把数据拆开”也会拆错？

## 1. 有损拆分与虚假元组（Spurious Tuples）

拆分表并不是随意切两刀就行。如果拆分不当，在重新 \`JOIN\` 时会凭空捏造出原本不存在的虚假数据：

\`\`\`mermaid
flowchart TD
    Original["原始表 (学生, 课程, 教师)"] --> BadSplit["错误拆分方式:\n表A (学生, 教师) + 表B (课程, 教师)"]
    BadSplit --> BadJoin["重新执行 NATURAL JOIN"]
    BadJoin --> Ghost["产生虚假元组 (Spurious Tuples)!\n李雷被错误关联到了他根本没选的赵教授课程中"]
\`\`\`

#### 无损连接分解（Lossless Join Decomposition）准则：
> 两个子表的公共属性集，必须至少是其中一个子表的**超键（Super Key）**。
`
  },
  {
    id: "doc:hello-system-33-functional-dependencies",
    slug: "33-functional-dependencies",
    parentId: "'doc:hello-system-part-3'",
    title: "第33章 函数依赖到底在描述什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 9,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第33章 函数依赖到底在描述什么？

## 1. 现实业务约束的数学形式化：$X \\to Y$

> **函数依赖（Functional Dependency, FD）**：若在属性集 $X$ 上的取值一旦确定，属性集 $Y$ 的取值就唯一确定，记作 $X \\to Y$（$X$ 函数决定 $Y$）。

在 Mini Campus 业务中：
1. $\\text{学号} \\to \\text{姓名, 院系}$
2. $\\text{课程代码} \\to \\text{课程名称, 学分, 教室}$
3. $\\text{\\{学号, 课程代码\\}} \\to \\text{成绩}$

理解函数依赖，是推导数据库范式（Normal Forms）的唯一数学工具。
`
  },
  {
    id: "doc:hello-system-34-normalization-in-practice",
    slug: "34-normalization-in-practice",
    parentId: "'doc:hello-system-part-3'",
    title: "第34章 范式不是考试规则，而是在修复数据结构",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 10,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第34章 范式不是考试规则，而是在修复数据结构

## 1. 经典范式逐级进化路线

\`\`\`mermaid
flowchart TD
    N0["原始非规范化表"] -->|1NF: 消除非原子字段, 确保列不可再分| N1["第一范式 (1NF)"]
    N1 -->|2NF: 消除非主属性对主键的部分函数依赖| N2["第二范式 (2NF)"]
    N2 -->|3NF: 消除非主属性对主键的传递函数依赖| N3["第三范式 (3NF)"]
    N3 -->|BCNF: 消除主属性对非候选键的决定依赖| NBC["BCNF 范式"]
\`\`\`

- **1NF**：每一个列的值都必须是原子的（不得在一个字段里存用逗号隔开的多个电话）；
- **2NF**：一张表如果有复合主键（如 \`{学号, 课程代码}\`），表里的每一个字段都必须依赖整个复合主键，不能只依赖其中一半（把“课程名称”从选课记录表中剔除出去）；
- **3NF**：非主键属性之间不能形成传递依赖（把“系主任名字”从学生表中剔除，建立独立的院系表）。
`
  },
  {
    id: "doc:hello-system-35-bplus-tree-index",
    slug: "35-bplus-tree-index",
    parentId: "'doc:hello-system-part-3'",
    title: "第35章 数据库为什么不需要每次从头找？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 11,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第35章 数据库为什么不需要每次从头找？

## 1. 全表扫描的绝望 vs B+ 树的毫秒奇迹

当 \`students\` 表增长到 1000 万行记录时：
- **无索引（全表扫描 $O(N)$）**：数据库必须从磁盘顺序读取 1000 万行数据，产生数十万次磁盘 I/O，查询耗时高达 15 秒；
- **B+ 树索引（$O(\\log N)$）**：B+ 树是一种拥有极高扇出比（Fanout $\\ge 1000$）的“矮胖多路平衡搜索树”。一棵 3 层的 B+ 树即可索引超过 10 亿行数据！定位任意一条学号只需 **3 次内存/磁盘寻址**，耗时不到 1 毫秒。

\`\`\`mermaid
flowchart TD
    Root["B+ 树根节点 (驻留内存)\n[1000, 2000, 3000]"]
    L1_1["中间层节点\n[1001, 1300, 1700]"]
    L1_2["中间层节点\n[2001, 2500, 2800]"]
    
    Leaf1["叶子数据页 (Page 0x10)\n[1001, 李雷] <-> [1002, 韩梅梅]"]
    Leaf2["叶子数据页 (Page 0x20)\n[1301, 张三] <-> [1302, 李四]"]

    Root --> L1_1
    Root --> L1_2
    L1_1 --> Leaf1
    L1_1 --> Leaf2
    Leaf1 <==>|双向有序链表| Leaf2
\`\`\`
`
  },
  {
    id: "doc:hello-system-36-acid-transactions",
    slug: "36-acid-transactions",
    parentId: "'doc:hello-system-part-3'",
    title: "第36章 为什么一次修改不能只成功一半？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 12,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第36章 为什么一次修改不能只成功一半？

## 1. 事务（Transaction）与 ACID 四大堡垒

一次选课操作包含两步核心 SQL：
\`\`\`sql
UPDATE courses SET enrolled = enrolled + 1 WHERE id = 101; -- 步骤 1
INSERT INTO enrollments (student_id, course_id) VALUES (1001, 101); -- 步骤 2
\`\`\`

如果在步骤 1 执行完后机房突然断电：
名额少了一个，学生列表里却没有李雷的名字。数据陷入了毁灭性的撕裂。

事务通过 **ACID** 捍卫系统：
- **A (Atomicity, 原子性)**：两步操作要么全部成功，要么全部回滚（通过 **Undo Log** 实现）；
- **C (Consistency, 一致性)**：系统状态从一个合法状态跃迁到另一个合法状态，不变量绝不打破；
- **I (Isolation, 隔离性)**：并发事务互不干扰（通过锁与 **MVCC** 实现）；
- **D (Durability, 持久性)**：事务一旦提交，数据永不丢失（通过 **Redo Log WAL** 预写日志物理落盘）。
`
  },
  {
    id: "doc:hello-system-37-concurrency-and-locking",
    slug: "37-concurrency-and-locking",
    parentId: "'doc:hello-system-part-3'",
    title: "第37章 两个人同时点击最后一个名额会发生什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 13,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第37章 两个人同时点击最后一个名额会发生什么？

## 1. 争抢最后一个名额的物理时序

假设课程只剩 1 个名额，李雷和韩梅梅在完全相同的时刻点击了“选课”：

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor L as 李雷的事务 T1
    participant DB as 数据库引擎 (InnoDB)
    actor M as 韩梅梅的事务 T2

    L->>DB: 1. SELECT capacity, enrolled FROM courses WHERE id=101; (查到 100/99, 还有1个名额)
    M->>DB: 2. SELECT capacity, enrolled FROM courses WHERE id=101; (同样查到 100/99, 还有1个名额!)
    L->>DB: 3. UPDATE courses SET enrolled = enrolled + 1 WHERE id=101; (更新为 100/100)
    M->>DB: 4. UPDATE courses SET enrolled = enrolled + 1 WHERE id=101; (更新为 100/101, 严重超卖!)
\`\`\`

---

## 2. 数据库级防御：行级排他锁（X-Lock）

解决超卖的根本手段，是在读取时直接锁定该行记录：

\`\`\`sql
-- 开启显式排他锁
BEGIN;
SELECT capacity, enrolled FROM courses WHERE id = 101 FOR UPDATE;
-- 此时其他事务如果也执行 FOR UPDATE，将被数据库挂起阻塞，直到本事务 COMMIT!
UPDATE courses SET enrolled = enrolled + 1 WHERE id = 101;
INSERT INTO enrollments (student_id, course_id) VALUES (1001, 101);
COMMIT;
\`\`\`

现在，数据在数据库的堡垒中安然无恙。

接下来，我们将进入全书的枢纽——**第四部分：前端第一次遇见后端**。
`
  }
];
