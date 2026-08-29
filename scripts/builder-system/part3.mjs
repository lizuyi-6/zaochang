// scripts/builder-system/part3.mjs
// 第三部分：数据需要一个真正的家 (25 ~ 37)
// 全量技术修订与规范化完整版本 (全 13 章高密度深度正文)

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

## 1. 朴素直觉方案：非规范化宽表

在初学数据库设计时，最直观的想法往往是将所有关联信息放置在单张大宽表中：

\`\`\`text
大宽表示例: mega_enrollment_sheet
┌──────┬────────┬────────┬──────────┬──────────────────┬──────────┬──────────┬──────────┐
│ 学号 │ 姓名   │ 院系   │ 课程代码 │ 课程名称         │ 任课教师 │ 教师电话 │ 教室地点 │
├──────┼────────┼────────┼──────────┼──────────────────┼──────────┼──────────┼──────────┤
│ 1001 │ 李雷   │ 计科系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │
│ 1001 │ 李雷   │ 计科系 │ CS-102   │ 离散数学基础     │ 赵教授   │ 13800002 │ 教一102  │
│ 1002 │ 韩梅梅 │ 计科系 │ CS-101   │ 计算机系统导论   │ 严教授   │ 13800001 │ 教一101  │
└──────┴────────┴────────┴──────────┴──────────────────┴──────────┴──────────┴──────────┘
\`\`\`

这种设计在数据量极少时查询直接，但随着数据修改，会引发关系数据库理论中经典的**三大操作异常**。

---

## 2. 关系设计的三大操作异常

### 1. 插入异常（Insertion Anomaly）
如果学校新开设了一门课程《人工智能前沿》，已确定任课教师与教室，但尚未开始选课（即暂无学生选修）。  
若表以“学号+课程代码”作为复合标识，在没有学生选课时，学号字段必须置为 \`NULL\`。而若主键约束禁止 \`NULL\`，**新课程在有学生选修前将无法被记录到系统中**。

### 2. 更新异常（Update Anomaly）
严教授更换了办公电话。在上述宽表中，全校有数百名学生选修该课程，严教授的电话被重复记录了数百次。  
若更新操作未能完整覆盖所有行，将导致**同一位教师在不同行中存在互相矛盾的信息**。

### 3. 删除异常（Deletion Anomaly）
若《离散数学基础》当前仅有李雷一名学生选修。当李雷退选该课程时，删除该行记录将导致**该课程本身的基本信息（课程名称、教师、教室）一同被意外删除**。

\`\`\`mermaid
flowchart TD
    Table["非规范化大宽表"]
    A1["插入异常: 无学生选修时无法独立录入新课程"] --> Table
    A2["更新异常: 修改教师电话需更新大量冗余行，易产生不一致"] --> Table
    A3["删除异常: 删除最后一名选课学生导致课程基本信息丢失"] --> Table
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

## 1. 概念层级澄清

在深入数据库前，必须严格区分以下概念：
- **关系模型（Relational Model）**：埃德加·科德（E. F. Codd）提出的数据组织数学理论模型；
- **SQL 语言**：基于关系代数与元组演算发展出的声明式查询标准；
- **数据库管理系统（DBMS）**：实现数据存储、管理与查询执行的软件系统（如 MySQL, PostgreSQL）；
- **存储引擎（Storage Engine）**：DBMS 中负责具体物理文件组织与索引存取的子系统（如 InnoDB）。

---

## 2. 关系模型的数学定义

- **域（Domain）**：一组具有相同数据类型的原子值的集合（如所有合法学号的集合 $D_1$）；
- **笛卡尔积（Cartesian Product）**：$D_1 \\times D_2 \\times \\dots \\times D_n$ 表示所有可能的值组合构成的全集；
- **关系（Relation）**：笛卡尔积的一个**有限子集**，在逻辑上表现为一张二维表；
- **元组（Tuple）**：关系中的一个元素，对应表中的一行记录；
- **属性（Attribute）**：元组中的一个分量，对应表中的一列。

> **关系模型与 SQL 的语义差异**：
> 在纯关系模型中，Relation 是数学集合，**严格不允许存在重复元组**；而在标准 SQL 中，查询结果默认具有 **多重集（Multiset / Bag）** 语义，允许重复行（除非显式指定 \`DISTINCT\`）。
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

## 1. 键（Key）的层级体系

在关系模型中，为了在逻辑上唯一标识每个元组，建立了键的概念层次：

1. **超键（Superkey）**：能够在关系中唯一标识一个元组的属性集（例如 \`{学号, 姓名}\`）；
2. **候选键（Candidate Key）**：不包含多余属性的**最小超键**（例如 \`{学号}\` 或 \`{身份证号}\`）；
3. **主键（Primary Key）**：从候选键中选定的一个作为元组的核心逻辑标识。

\`\`\`mermaid
flowchart TD
    SK["超键 (Superkey)\n能唯一定位元组的属性集合"]
    CK["候选键 (Candidate Key)\n无多余属性的最小超键"]
    PK["主键 (Primary Key)\n选拔出的唯一逻辑标识符"]

    SK -->|消除冗余属性| CK
    CK -->|选定主要代表| PK
\`\`\`

#### 实体完整性（Entity Integrity）规则：
> **主键中的任何属性都不能取 NULL 值，且在关系内必须唯一。**

主键首先是一种**逻辑完整性约束**。具体 DBMS 实现中是否为主键自动创建聚集索引属于实现范畴。
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

## 1. 实体表拆分与多对多关系

为了消除大宽表的异常，我们将实体拆分为独立表：
- \`students\`（学生表）
- \`courses\`（课程表）

学生与课程之间是**多对多（Many-to-Many）**关系：一个学生可以选修多门课程，一门课程可以被多名学生选修。

---

## 2. 选课关联表（Junction Table）的设计

在关系数据库中，多对多关系通过引入**关联表（Junction Table / Association Table）**拆解为两个一对多关系：

\`\`\`mermaid
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
\`\`\`

#### 参照完整性（Referential Integrity）：
> 外键约束确保 \`enrollments.course_id\` 的取值必须在 \`courses.id\` 中真实存在（或为 NULL），防止产生悬垂引用。

> **关于 \`Course.enrolled\` 的架构说明**：
> \`courses.enrolled\` 字段在理论上可以通过 \`COUNT(enrollments)\` 动态计算。在工程实践中，为了避免高频列表查询时全表扫关联表，常将其作为**有意识的反规范化（Denormalization）冗余计数**保留，但这要求系统必须在业务事务中严格保证计数与关联记录的同步更新。
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

## 1. 声明式查询与逻辑执行顺序

SQL 是声明式语言（Declarative Language），用户指定需要的数据集特征，由数据库引擎决定具体的检索算法。

在概念上，标准 SQL 查询遵循特定的**逻辑查询处理顺序（Logical Query Processing Order）**：

\`\`\`mermaid
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
\`\`\`

---

## 2. 逻辑顺序与物理执行计划的严格区分

必须强调：**逻辑处理顺序并不等于查询优化器实际的物理执行计划（Physical Execution Plan）**。

现代数据库的基于代价的优化器（CBO, Cost-Based Optimizer）在生成执行计划时可能：
- **谓词下推（Predicate Pushdown）**：提前在扫描阶段执行 \`WHERE\` 过滤，减少后续处理的数据量；
- **重排 JOIN 顺序**：优先连接结果集较小的表；
- **选择物理连接算子**：根据数据量和索引选择 Hash Join、Merge Join 或 Index Nested Loop。
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

## 1. 连接操作的集合论模型

连接操作在逻辑上是**笛卡尔乘积结合连接谓词过滤**的结果：

- **INNER JOIN（内连接）**：仅返回同时满足连接条件的左右表匹配元组组合；
- **LEFT OUTER JOIN（左外连接）**：保留左表所有元组，若右表无匹配记录，右表相关字段填充 \`NULL\`。

\`\`\`sql
-- 查询所有课程及其实际选课学生（即使课程当前 0 人选修，也保留课程行）
SELECT c.code AS course_code, c.name AS course_name, s.name AS student_name
FROM courses c
LEFT JOIN enrollments e ON c.id = e.course_id
LEFT JOIN students s ON e.student_id = s.id;
\`\`\`

> **注意**：
> 不要简单将 JOIN 理解为集合论中的 Venn 图交集。当左表单行匹配到右表多行时，输出结果将产生多重扩展行，输出行数取决于连接条件匹配的多重性。
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

## 1. 维度聚合与投影规则

\`GROUP BY\` 将输入数据集按照指定的属性分组，使每个分组坍缩为一个代表行：

\`\`\`mermaid
flowchart TD
    Rows["细粒度记录行 (多行选课记录)"] --> Group["GROUP BY c.id, c.code, c.name"]
    Group --> Agg["聚合计算 COUNT(e.id)"]
    Agg --> Result["分组摘要输出"]
\`\`\`

#### SQL 标准投影约束：
在开启标准 SQL 检查（如 MySQL \`ONLY_FULL_GROUP_BY\` 模式）的环境下：
- \`SELECT\` 列表中出现的非聚合列，**必须包含在 \`GROUP BY\` 子句中，或在函数依赖上完全由分组列决定**；
- 避免在分组查询中书写未明确聚合规则的随意字段。

\`\`\`sql
SELECT c.code, c.name, COUNT(e.id) AS student_count
FROM courses c
LEFT JOIN enrollments e ON c.id = e.course_id
GROUP BY c.id, c.code, c.name
HAVING COUNT(e.id) > 0;
\`\`\`
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

## 1. 有损分解与虚假元组（Spurious Tuples）

拆分关系表必须遵循严格准则。若随意拆分，在后续重新连接时可能产生原本不存在的**虚假元组**：

\`\`\`mermaid
flowchart TD
    Orig["原关系 (学生, 教师, 课程)"] --> BadSplit["不当拆分:\nR1(学生, 教师) + R2(教师, 课程)"]
    BadSplit --> ReJoin["重新 NATURAL JOIN"]
    BadJoin --> Ghost["产生虚假元组!\n(某个教师教多门课时，学生被错误关联到未选修的课程)"]
\`\`\`

#### 无损连接分解（Lossless Join Decomposition）充分必要条件：
> 关系模式 $R$ 分解为 $R_1$ 和 $R_2$ 具有无损连接性的充要条件是：$R_1 \\cap R_2 \\to (R_1 - R_2)$ 或 $R_1 \\cap R_2 \\to (R_2 - R_1)$ 属于原依赖闭包。即公共属性集必须至少是其中一个子关系的超键。
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

## 1. 函数依赖（Functional Dependency）的形式化定义

> **定义**：设 $R(U)$ 是属性集 $U$ 上的关系模式，$X, Y \\subseteq U$。若对于 $R$ 的任何合法关系状态 $r$，在 $r$ 中不存在两个元组在 $X$ 上的属性值相等而在 $Y$ 上的属性值不等，则称 **$X$ 函数决定 $Y$**，记作：
> $$X \\to Y$$

在 Mini Campus 业务模型中：
- $\\text{student\\_no} \\to \\text{name}$
- $\\text{course\\_code} \\to \\text{name, capacity}$
- $\\text{\\{student\\_id, course\\_id\\}} \\to \\text{enrolled\\_at}$

---

## 2. 函数依赖的类型

1. **完全函数依赖（Full FD）**：$Y$ 依赖于 $X$，且不依赖于 $X$ 的任何真子集；
2. **部分函数依赖（Partial FD）**：$Y$ 依赖于 $X$，但同时依赖于 $X$ 的某个真子集；
3. **传递函数依赖（Transitive FD）**：$X \\to Y, Y \\to Z$，且 $Y \\not\\to X$ 时，$Z$ 传递依赖于 $X$。
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

## 1. 规范化范式的正式定义

规范化理论通过逐步消除不当的函数依赖来避免数据冗余与操作异常：

\`\`\`mermaid
flowchart TD
    N1["第一范式 (1NF)\n每个属性域都是不可分的原语原子值"] --> N2["第二范式 (2NF)\n满足 1NF，且消除非主属性对候选键的部分函数依赖"]
    N2 --> N3["第三范式 (3NF)\n满足 2NF，且消除非主属性对候选键的传递函数依赖"]
    N3 --> NBC["BCNF 范式\n对于每一个非平凡函数依赖 X -> Y，X 均必须是超键"]
\`\`\`

- **主属性（Prime Attribute）**：包含在任何一个候选键中的属性；
- **非主属性（Non-prime Attribute）**：不包含在任何候选键中的属性。

---

## 2. 反规范化（Denormalization）的工程权衡

规范化有助于保证数据完整性并消除异常，但过度的拆分会导致复杂的跨表多路 JOIN。在实际系统设计中，通常规范化到 3NF/BCNF，并根据查询性能瓶颈进行适度的、受控的反规范化设计。
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

## 1. B+ 树索引的结构特征

在关系数据库存储引擎（如 MySQL InnoDB）中，**B+ 树（B+ Tree）** 是最核心的磁盘索引结构：
- **多路平衡树**：具有极高的扇出（Fanout），树高度通常较小（一般为 3~4 层）；
- **所有数据存放于叶子节点**：非叶子节点仅存放键值与指针作为目录索引；
- **叶子节点双向链表连接**：支持高效的范围扫描与顺序遍历。

\`\`\`mermaid
flowchart TD
    Root["B+ 树根节点 (驻留内存 Buffer Pool)\n[ 1000 | 2000 | 3000 ]"]
    L1["中间目录页\n[ 1000 | 1500 ]"]
    L2["中间目录页\n[ 2000 | 2500 ]"]
    Leaf1["叶子数据页 Page 0x01\n[1001: 李雷] <-> [1002: 韩梅梅]"]
    Leaf2["叶子数据页 Page 0x02\n[1501: 张三] <-> [1502: 李四]"]

    Root --> L1
    Root --> L2
    L1 --> Leaf1
    L1 --> Leaf2
    Leaf1 <==>|双向链表| Leaf2
\`\`\`

---

## 2. 聚集索引与二级索引（以 InnoDB 为例）

- **聚集索引（Clustered Index）**：叶子节点直接存放完整的行记录数据，通常基于主键构建；
- **二级索引（Secondary Index）**：叶子节点存放索引列值与对应的主键值。通过二级索引查找非索引列数据时，通常需要根据主键进行“回表查询”（除非查询列已全部被索引覆盖，即覆盖索引 Covering Index）。
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

## 1. 事务的 ACID 性质

在执行选课时，系统需要同时执行两步持久化操作：
1. 更新课程已选人数：\`UPDATE courses ...\`;
2. 插入选课关联流水：\`INSERT INTO enrollments ...\`。

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

## 1. 并发争抢下的超卖风险

当课程仅剩 1 个名额时，若李雷与韩梅梅同时并发执行选课：
若业务逻辑在应用层先无锁读取名额、再分别执行增加，极易导致两个人均判定有余量，最终已选人数突破容量上限（超卖）。

---

## 2. 并发控制方案对比

### 方案 A：原子条件更新（推荐主线方案）
利用数据库行级更新的原子性，在 SQL \`WHERE\` 条件中加入不变量约束：

\`\`\`sql
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
\`\`\`

### 方案 B：悲观锁方案（SELECT ... FOR UPDATE）
在读取数据时显式申请行级排他锁（X-Lock），阻塞其他并发事务的读取与修改：

\`\`\`sql
START TRANSACTION;
-- 读取并锁定目标行记录
SELECT capacity, enrolled FROM courses WHERE id = 2048 FOR UPDATE;
-- 必须在应用层重新判断 capacity 与 enrolled
-- 确认有名额后再执行 UPDATE 与 INSERT
UPDATE courses SET enrolled = enrolled + 1 WHERE id = 2048;
INSERT INTO enrollments (student_id, course_id) VALUES (1001, 2048);
COMMIT;
\`\`\`

---

## 3. 本章小结

1. 并发控制的关键在于防止多个事务基于过期的状态进行并发决策；
2. 原子条件更新通过数据库行锁与条件判断实现了高效且防超卖的并发控制；
3. 数据库唯一索引约束（如 \`UNIQUE(student_id, course_id)\`）与事务机制共同构成了数据完整性防线。
`
  }
];
