// scripts/builder-system/part3.mjs
// 《Hello System · 图解软件系统》第三部分：数据需要一个真正的家 (第 25 ~ 37 章)（全量教材化深度扩写版本）

const part3Docs = [];

// 顶层部分节点
part3Docs.push({
  id: "doc:hello-system-part-3",
  slug: "part-3",
  parentId: "'doc:book-hello-system'",
  title: "第三部分: 数据需要一个真正的家 (25~37)",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 5,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第三部分: 数据需要一个真正的家 (25~37)

本部分聚焦于**关系数据库理论与现代存储引擎的底层基石**。

我们将从 Excel 样式的大宽表出发，亲历插入、更新与删除三大异常灾难。我们将严密推导关系代数、候选键、函数依赖、Armstrong 公理系统以及 1NF $\\to$ 2NF $\\to$ 3NF $\\to$ BCNF 的全流程无损规范化分解。随后，我们将深入 B+ 树索引的内部结构与 EXPLAIN 优化器原理，并最终建立起包含 ACID 事务、行级锁、WAL 预写日志与并发控制的坚固数据心智模型。
`
});

// 第 25 章
part3Docs.push({
  id: "doc:hello-system-25-big-wide-table",
  slug: "25-big-wide-table",
  parentId: "'doc:hello-system-part-3'",
  title: "第25章 单大宽表的诱惑与灾难：从 Excel 到数据库",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 25,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第25章 单大宽表的诱惑与灾难：从 Excel 到数据库

## 1. 最直观的存储：把所有字段堆在一张 Excel 大表里

当我们最初设计数据库时，最符合非专业直觉的方法是：**将所有可能用到的数据全部塞在一张巨大的表里**。

假设我们创建了如下名为 \`all_enrollments\` 的“大宽表”：

| student_id | student_name | major_name | course_id | course_name | teacher_name | teacher_title | grade |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1001 | 李雷 | 软件工程 | 2048 | 计算机系统导论 | 严教授 | 正高级 | 92 |
| 1002 | 韩梅梅 | 软件工程 | 2048 | 计算机系统导论 | 严教授 | 正高级 | 95 |
| 1001 | 李雷 | 软件工程 | 2049 | 数据结构与算法 | 严教授 | 正高级 | 88 |
| 1003 | 张三 | 计算机科学 | 2048 | 计算机系统导论 | 严教授 | 正高级 | 85 |

在系统最初只有十几条记录时，这张表查询起来非常方便，完全不需要写任何 \`JOIN\` 语句。

---

## 2. 关系大宽表的三大结构性异常（Structural Anomalies）

随着业务的运行，这张看似方便的大宽表很快就会引发三场灾难：

\`\`\`mermaid
flowchart TD
    subgraph Anomalies["大宽表引发的三大结构性灾难"]
        A1["1. 插入异常 (Insertion Anomaly)\n新聘请了王老师，但他本学期尚未开课。\n由于没有学生选课，无法在表中插入一条合法记录 (除非 student_id 填 NULL)"]
        A2["2. 删除异常 (Deletion Anomaly)\n选修《量子计算》的唯一一名学生申请退学。\n一旦删除该学生的选课行，整门《量子计算》课程的名称、学分及教师信息在系统中彻底失踪！"]
        A3["3. 更新异常 (Update Anomaly)\n严教授晋升为特聘教授。\n系统必须在 500 条学生选课行中逐一修改 teacher_title。\n一旦因断电或网络超时漏改了 1 行，系统立刻产生数据不一致！"]
    end
\`\`\`

核心矛盾在于：**我们在同一张表里强行揉杂了多个不同生命周期的独立实体（学生、专业、课程、教师）。**

要彻底根除这些异常，我们必须借助数学武器——**关系模型与规范化理论**。
`
});

// 第 26 章
part3Docs.push({
  id: "doc:hello-system-26-relational-model-foundations",
  slug: "26-relational-model-foundations",
  parentId: "'doc:hello-system-part-3'",
  title: "第26章 关系模型的数学美感：元组、属性与笛卡尔积",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 26,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第26章 关系模型的数学美感：元组、属性与笛卡尔积

## 1. 埃德加·科德（E. F. Codd）的伟大创举

1970 年，IBM 计算机科学家 E. F. Codd 发表了划时代论文 *A Relational Model of Data for Large Shared Data Banks*，正式奠定了现代关系数据库的数学基础。

在关系模型之前，早期的网状数据库（Network）和层次数据库（Hierarchical）要求程序员在代码中直接操作底层物理指针来遍历数据，一旦数据结构变动，所有程序代码必须全部重写。

Codd 提出：**数据应当以严密的数学集合论进行抽象，将逻辑数据模型与底层物理存储彻底解耦。**

---

## 2. 关系模型的形式化数学定义

给定 $n$ 个属性域（Domain）$D_1, D_2, \\dots, D_n$（域是具有相同数据类型的值的集合，例如整数集、字符串集）。

这些域的**笛卡尔积（Cartesian Product）**定义为所有可能的有序 $n$ 元组的集合：

$$D_1 \\times D_2 \\times \\dots \\times D_n = \\{ (d_1, d_2, \\dots, d_n) \\mid d_i \\in D_i, 1 \\le i \\le n \\}$$

> **关系（Relation）的数学定义**：
> 域 $D_1 \\times D_2 \\times \\dots \\times D_n$ 的任意一个**有限子集（Subset）**，称为定义在这些域上的一个**关系**。

在关系模型中：
- **关系（Relation）**：对应我们日常所说的“二维表”；
- **元组（Tuple）**：对应表中的“一行记录”；
- **属性（Attribute）**：对应表中的“一列”；
- **分量（Component）**：元组在某个属性上的具体取值。

\`\`\`text
数学概念              数据库术语
Relation (关系)   <--->  Table (数据表)
Tuple (元组)      <--->  Row / Record (行/记录)
Attribute (属性)  <--->  Column / Field (列/字段)
Domain (域)       <--->  Data Type & Constraint (数据类型与取值范围)
\`\`\`

由于关系在数学上是一个**纯粹的集合（Set）**，它天然具备两大数学性质：
1. **元素唯一性**：集合中绝不存在完全相同的重复元组；
2. **无序性**：元组之间没有先后顺序之分，属性之间也没有左右顺序之分。
`
});

// 第 27 章
part3Docs.push({
  id: "doc:hello-system-27-keys-and-identity",
  slug: "27-keys-and-identity",
  parentId: "'doc:hello-system-part-3'",
  title: "第27章 主键与候选键：在数据的海洋中唯一定位",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 27,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第27章 主键与候选键：在数据的海洋中唯一定位

## 1. 形式化定义：超键、候选键与主键

在关系的海洋中，我们如何从数学上确保能够唯一识别某一个特定的元组？

\`\`\`mermaid
flowchart TD
    SK["超键 (Superkey)\n能够唯一标识元组的属性集合 (可能包含冗余属性)\n例如: {id, name}, {code, capacity}"]
    CK["候选键 (Candidate Key)\n极小化超键 (Minimal Superkey)\n不含任何多余属性的唯一标识符\n例如: {id}, {code}"]
    PK["主键 (Primary Key)\n从所有候选键中人为选定的一个主要唯一标识符\n例如: id"]

    SK -->|消除冗余属性| CK
    CK -->|选定一个作为官方标识| PK
\`\`\`

1. **超键（Superkey）**：在关系模式 $R$ 中，如果属性集 $K$ 能够唯一确定一个元组，则 $K$ 为超键；
2. **候选键（Candidate Key）**：若超键 $K$ 的任意真子集都不能成为超键，则称 $K$ 为候选键（即最小超键）；
3. **主键（Primary Key）**：当一个关系存在多个候选键时，数据库设计者挑选其中一个作为主键；
4. **主属性（Prime Attribute）**：包含在任何一个候选键中的属性；
5. **非主属性（Non-Prime Attribute）**：不包含在任何候选键中的属性。

---

## 2. 自然业务键（Natural Key）vs 代理主键（Surrogate Key）

对于课程表 \`courses\`，我们有两个候选键：
- **业务自然键**：\`code\`（如 \`"CS-101"\`），具有直观的业务含义；
- **代理自增键**：\`id\`（如整数 \`2048\`），无实际业务语义。

在工程实践中，**不可变的整型代理主键（Surrogate Key）** 是一种非常常见的选择，本书的 Mini Campus 也采用它。它的优点包括：
1. **与可变业务标识解耦**：业务代码（如课程编号）在学校教务改革时可能发生变更，如果使用自然键作为主键并在其他表中作为外键关联，级联修改代价极高；
2. **长度固定且通常较紧凑**：整型键在索引中占用的空间通常小于变长业务字符串，外键引用也更方便。

但这并不意味着“现代系统都应该使用整型代理键”。自然键、UUID、ULID 与各类分布式 ID 都有各自合理的使用场景（例如跨库合并、离线生成、分库分表）。主键选择对性能的实际影响，取决于键宽、索引结构、访问模式、数据规模、缓存与具体 DBMS 实现等综合因素，不存在脱离场景的普适结论。
`
});

// 第 28 章
part3Docs.push({
  id: "doc:hello-system-28-foreign-keys-and-associations",
  slug: "28-foreign-keys-and-associations",
  parentId: "'doc:hello-system-part-3'",
  title: "第28章 外键与关联表：一堆孤立表如何连接？",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 28,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第28章 外键与关联表：一堆孤立表如何连接？

## 1. 实体间的基数关系（Cardinality）

现实世界中的实体关联分为三种类型：

\`\`\`mermaid
flowchart LR
    OneToOne["1 : 1 关系\n(学生 <-> 学籍档案)\n外键放置在任何一方均可"]
    OneToMany["1 : N 关系\n(教师 <-> 课程)\n外键必须放置在 '多 (N)' 的一方 (courses.teacher_id)"]
    ManyToMany["M : N 多对多关系\n(学生 <-> 课程)\n必须引入独立的中间关联表 (enrollments)"]
\`\`\`

---

## 2. 多对多关联表（Junction Table）的设计标准

学生与课程是典型的多对多关系。我们引入专门的关联表 \`enrollments\`：

\`\`\`sql
CREATE TABLE enrollments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_enr_student FOREIGN KEY (student_id) REFERENCES students(id),
    CONSTRAINT fk_enr_course FOREIGN KEY (course_id) REFERENCES courses(id),
    -- 核心防线：同一个学生对同一门课绝不能重复选修
    CONSTRAINT uk_student_course UNIQUE (student_id, course_id)
);
\`\`\`

注意 \`UNIQUE (student_id, course_id)\` 复合唯一键：它在数据库约束层面捍卫了“杜绝重复选课”的业务不变量。
`
});

// 第 29 章
part3Docs.push({
  id: "doc:hello-system-29-declarative-sql",
  slug: "29-declarative-sql",
  parentId: "'doc:hello-system-part-3'",
  title: "第29章 声明式 SQL：告诉数据库“要什么”，而非“怎么做”",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 29,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第29章 声明式 SQL：告诉数据库“要什么”，而非“怎么做”

## 1. 声明式查询与过程式循环的本质区别

在面向对象编程中，我们查询“容量大于 80 的课程”需要编写过程式循环：

\`\`\`java
List<Course> result = new ArrayList<>();
for (Course c : allCourses) {
    if (c.getCapacity() > 80) {
        result.add(c);
    }
}
\`\`\`

而在 SQL 中，我们只需要声明目标结果集的数学特征：

\`\`\`sql
SELECT id, code, name, capacity
FROM courses
WHERE capacity > 80;
\`\`\`

---

## 2. 关系代数到物理执行计划的转换

数据库在收到一条 SQL 时，执行引擎会经历以下转化阶段：

\`\`\`mermaid
flowchart LR
    SQL["声明式 SQL 文本"] --> Parser["词法/语法解析器\n生成抽象语法树 AST"]
    Parser --> Opt["基于代价的优化器 (Cost-Based Optimizer, CBO)\n探索多种关系代数等价树\n选择最优执行路径"]
    Opt --> Engine["存储引擎执行算子\n(Index Scan / Table Scan)"]
\`\`\`

优化器会根据索引统计信息、数据分布直方图与磁盘 I/O 成本，自动决定是走全表扫描还是走 B+ 树索引查找。程序员只需要关心业务逻辑的正确表达。
`
});

// 第 30 章
part3Docs.push({
  id: "doc:hello-system-30-inner-and-outer-joins",
  slug: "30-inner-and-outer-joins",
  parentId: "'doc:hello-system-part-3'",
  title: "第30章 JOIN 的本质：笛卡尔积上的条件过滤",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 30,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第30章 JOIN 的本质：笛卡尔积上的条件过滤

## 1. 揭开黑魔法：JOIN 的物理推演

初学者常把 \`JOIN\` 想象成一种“魔法拼接”。

在关系代数中，\`JOIN\` 的数学本质是：**先求两张表的笛卡尔积，再应用 \`ON\` 谓词逐行过滤（$\\sigma_{\\text{condition}}(R_1 \\times R_2)$）**。

假设我们有两张微型表：

**学生表 (students)**：
- (1001, "李雷")
- (1002, "韩梅梅")

**选课表 (enrollments)**：
- (e1, 1001, 2048)

### 第一步：展开完整的笛卡尔积（$2 \\times 1 = 2$ 行）
1. (1001, "李雷", e1, 1001, 2048)
2. (1002, "韩梅梅", e1, 1001, 2048)

### 第二步：执行 \`ON students.id = enrollments.student_id\` 过滤
- 第 1 行：\`1001 == 1001\`（满足条件，**保留**）；
- 第 2 行：\`1002 == 1001\`（不满足条件，**剔除**）。

---

## 2. INNER JOIN vs LEFT JOIN 输出行数预测

\`\`\`mermaid
flowchart TD
    subgraph Inner["INNER JOIN (内连接)"]
        I1["只返回同时在两张表中满足 ON 条件的交集行"]
    end
    subgraph Left["LEFT OUTER JOIN (左外连接)"]
        L1["以左表为主：无论右表是否存在匹配，左表所有行全部保留。\n右表不匹配处字段自动填充 NULL"]
    end
\`\`\`

> **预测实验**：
> 如果全校有 1000 名学生，其中 800 人选了课，200 人未选课。
> - \`SELECT count(*) FROM students INNER JOIN enrollments ON ...\` $\to$ 结果必然等于选课记录总数；
> - \`SELECT count(DISTINCT students.id) FROM students LEFT JOIN enrollments ON ...\` $\to$ 结果严格等于 **1000**。
`
});

// 第 31 章
part3Docs.push({
  id: "doc:hello-system-31-aggregation-and-group-by",
  slug: "31-aggregation-and-group-by",
  parentId: "'doc:hello-system-part-3'",
  title: "第31章 聚合与分组：GROUP BY 与 HAVING 的执行时序",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 31,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第31章 聚合与分组：GROUP BY 与 HAVING 的执行时序

## 1. SQL 逻辑执行时序（Logical Processing Order）

初学者写 SQL 最常犯的语法错误（例如在 \`WHERE\` 里写 \`count(*) > 10\`），根源在于混淆了 SQL 的书写顺序与**底层逻辑执行顺序**：

\`\`\`mermaid
flowchart TD
    Step1["1. FROM & JOIN (加载数据源，完成表关联笛卡尔积与过滤)"] --> Step2["2. WHERE (行级前置过滤：逐行排除不满足条件的原始记录)"]
    Step2 --> Step3["3. GROUP BY (将剩余行按照指定分组键划分为各个数据桶)"]
    Step3 --> Step4["4. 聚合计算 (在每个组内执行 COUNT, SUM, AVG, MAX, MIN)"]
    Step4 --> Step5["5. HAVING (组级后置过滤：对聚合统计结果进行条件筛选)"]
    Step5 --> Step6["6. SELECT (计算投影列与表达式别名)"]
    Step6 --> Step7["7. DISTINCT (对最终投影结果集去重)"]
    Step7 --> Step8["8. ORDER BY (按指定列进行最终排序)"]
    Step8 --> Step9["9. LIMIT / OFFSET (分页截取最终返回行)"]
\`\`\`

---

## 2. 经典问答：为什么 \`WHERE\` 里不能用聚合函数？

根据上述时序图，\`WHERE\`（第 2 步）发生在 \`GROUP BY\` 与聚合计算（第 3~4 步）**之前**！

在 \`WHERE\` 执行的时刻，数据还没有被分组，聚合值根本尚未诞生，因此在语法上直接禁止在 \`WHERE\` 子句中使用聚合函数。如果需要对聚合后的结果进行筛选，必须使用在第 5 步执行的 \`HAVING\` 子句。
`
});

// 第 32 章（修复 Mermaid 语法节点定义）
part3Docs.push({
  id: "doc:hello-system-32-lossless-decomposition",
  slug: "32-lossless-decomposition",
  parentId: "'doc:hello-system-part-3'",
  title: "第32章 无损分解与函数依赖：拆分表的科学方法",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 32,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第32章 无损分解与函数依赖：拆分表的科学方法

## 1. 拆表的风险：有损分解与伪元组（Spurious Tuples）

把大宽表拆分成多张小表，不能凭感觉瞎拆。

如果拆分不当，在后续执行 \`NATURAL JOIN\` 还原数据时，会凭空产生原本不存在的**伪元组（Spurious Tuples）**，导致严重的数据失真。

\`\`\`mermaid
flowchart TD
    Raw["原始关系 R(A, B, C)"] --> Decomp["分解为 R1(A, B) 与 R2(B, C)"]
    Decomp --> JoinCheck["执行自然连接 R1 ⋈ R2"]
    JoinCheck --> ResultCheck{"连接结果是否严格等于 R ?"}
    ResultCheck -->|严格相等| Lossless["无损连接分解 (Lossless Decomposition)"]
    ResultCheck -->|产生了额外伪元组| Lossy["有损分解 (Lossy Decomposition - 严禁发生)"]
\`\`\`

---

## 2. 无损连接分解定理（Heath's Theorem）

设关系模式 $R(U)$，函数依赖集为 $F$。将其分解为两个子关系模式 $R_1(U_1)$ 和 $R_2(U_2)$（满足 $U_1 \\cup U_2 = U$）。

> **无损分解判定定理**：
> 分解具有无损连接性的**充分必要条件**是：
> $$(U_1 \\cap U_2) \\to (U_1 - U_2) \\in F^+ \\quad \\text{或} \\quad (U_1 \\cap U_2) \\to (U_2 - U_1) \\in F^+$$

也就是说：**两张子表的公共属性集，必须至少是其中某一个子表的超键！** 只有这样，两表在重新 JOIN 时才绝不会出现多对多的交叉发散。
`
});

// 第 33 章
part3Docs.push({
  id: "doc:hello-system-33-functional-dependency-algebra",
  slug: "33-functional-dependency-algebra",
  parentId: "'doc:hello-system-part-3'",
  title: "第33章 函数依赖代数：Armstrong 公理系统",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 33,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第33章 函数依赖代数：Armstrong 公理系统

## 1. 函数依赖（Functional Dependency）的形式化定义

设关系模式 $R(U)$，$X$ 和 $Y$ 是属性集 $U$ 的子集。

> **函数依赖（$X \\to Y$）**：
> 如果对于 $R$ 中的任意一个合法关系实例 $r$，不可能存在两个元组 $t_1, t_2 \\in r$，满足：
> $$t_1[X] = t_2[X] \\quad \\text{但} \\quad t_1[Y] \\neq t_2[Y]$$
> 则称“$X$ 函数决定 $Y$”，记作 $X \\to Y$。

---

## 2. Armstrong 公理系统（Armstrong's Axioms）

W. W. Armstrong 于 1974 年提出了一套严密的推理规则，被证明是**正确且完备的（Sound and Complete）**：

1. **自反律（Reflexivity）**：若 $Y \\subseteq X \\subseteq U$，则 $X \\to Y$ 恒成立（平凡函数依赖）；
2. **增广律（Augmentation）**：若 $X \\to Y$，且 $Z \\subseteq U$，则 $XZ \\to YZ$；
3. **传递律（Transitivity）**：若 $X \\to Y$ 且 $Y \\to Z$，则 $X \\to Z$。

### 由三大公理导出的重要推论：
- **合并规则（Union Rule）**：若 $X \\to Y$ 且 $X \\to Z$，则 $X \\to YZ$；
- **分解规则（Decomposition Rule）**：若 $X \\to YZ$，则 $X \\to Y$ 且 $X \\to Z$；
- **伪传递规则（Pseudo-transitivity）**：若 $X \\to Y$ 且 $WY \\to Z$，则 $WX \\to Z$。

利用属性闭包算法 $X^+$，我们可以在多项式时间内自动推导并验证任意候选键与超键。
`
});

// 第 34 章（范式全流程深度推导实战）
part3Docs.push({
  id: "doc:hello-system-34-normalization-1nf-2nf-3nf-bcnf",
  slug: "34-normalization-1nf-2nf-3nf-bcnf",
  parentId: "'doc:hello-system-part-3'",
  title: "第34章 范式实战演进：1NF、2NF、3NF 到 BCNF 的全景推导",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 34,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第34章 范式实战演进：1NF、2NF、3NF 到 BCNF 的全景推导

## 1. 案例起点：未规范化的大宽表模式

让我们以 Mini Campus 中的一张真实业务选课宽表为案例，完成从 1NF 到 BCNF 的完整数学推导：

\`\`\`text
EnrollmentInfo(
    student_id, student_name, 
    major_id, major_name, 
    course_id, course_name, 
    teacher_id, teacher_name, 
    grade
)
\`\`\`

### 该模式中存在的全部函数依赖集 $F$：
1. \`student_id -> student_name, major_id\`
2. \`major_id -> major_name\`
3. \`course_id -> course_name, teacher_id\`
4. \`teacher_id -> teacher_name\`
5. \`(student_id, course_id) -> grade\`

---

## 2. 第一范式（1NF）：属性域的原子性

> **第一范式（1NF）标准定义**：
> 一个关系模式 $R$ 属于 1NF，当且仅当其所有属性的域都是不可再分的原子值。

- **规范要求**：在关系模型中，原子性的含义取决于关系模式对属性域的具体定义。严禁在单个字段中存放逗号分隔的多值列表（如将多门课程代码存为 \`"CS-101,CS-102"\`）或未解构的嵌套记录。

---

## 3. 第二范式（2NF）：消除非主属性对候选键的部分依赖

### 候选键判定：
通过计算属性闭包，该模式的唯一候选键为复合键：\`(student_id, course_id)\`。
- **主属性**：\`student_id\`, \`course_id\`
- **非主属性**：\`student_name\`, \`major_id\`, \`major_name\`, \`course_name\`, \`teacher_id\`, \`teacher_name\`, \`grade\`

### 发现部分函数依赖（Partial Functional Dependency）：
- \`student_id -> student_name\`（非主属性 \`student_name\` 仅依赖候选键的真子集 \`student_id\`）；
- \`course_id -> course_name\`（非主属性 \`course_name\` 仅依赖候选键的真子集 \`course_id\`）。

> **第二范式（2NF）标准定义**：
> 关系模式 $R \\in \\text{1NF}$，且每一个非主属性都**完全函数依赖（Full Functional Dependency）**于 $R$ 的每一个候选键，不存在对任何候选键真子集的部分依赖。

### 2NF 分解动作：
拆除部分依赖，得到三张子表：
1. \`Students(student_id, student_name, major_id, major_name)\`
2. \`Courses(course_id, course_name, teacher_id, teacher_name)\`
3. \`Enrollments(student_id, course_id, grade)\`

---

## 4. 第三范式（3NF）：消除传递函数依赖

在分解后的 \`Students\` 表中：
- 候选键为 \`student_id\`；
- 存在依赖链：\`student_id -> major_id\` 且 \`major_id -> major_name\`；
- 导致非主属性 \`major_name\` 经由 \`major_id\` 传递依赖于主键。

同理，在 \`Courses\` 表中，\`teacher_name\` 经由 \`teacher_id\` 传递依赖于 \`course_id\`。

> **第三范式（3NF）形式化定义**：
> 对于关系模式 $R$ 的每一个非平凡函数依赖 $X \\to A$，以下条件至少满足一个：
> 1. $X$ 是 $R$ 的超键；
> 2. $A$ 是 $R$ 的主属性（候选键的一部分）。

### 3NF 分解动作：
将传递依赖拆解为独立实体表：
- \`Students(student_id, student_name, major_id)\`
- \`Majors(major_id, major_name)\`
- \`Courses(course_id, course_name, teacher_id)\`
- \`Teachers(teacher_id, teacher_name)\`
- \`Enrollments(student_id, course_id, grade)\`

至此，系统彻底消除了插入、更新与删除异常！

---

## 5. 鲍伊斯-科德范式（BCNF）：更严格的超键约束

> **BCNF 形式化定义**：
> 关系模式 $R \\in \\text{1NF}$，对于 $R$ 上的每一个非平凡函数依赖 $X \\to Y$，$X$ 都**必须是 $R$ 的超键**。

BCNF 进一步消除了主属性对其他非键属性的依赖（3NF 允许右侧 $A$ 是主属性，而 BCNF 强制左侧 $X$ 必须是超键）。在绝大多数常规企业级建模中，达到 3NF/BCNF 即可保证极高的数据严密性与健壮性。
`
});

// 第 35 章（B+ 树索引原理与 EXPLAIN 实践）
part3Docs.push({
  id: "doc:hello-system-35-bplus-tree-indexes",
  slug: "35-bplus-tree-indexes",
  parentId: "'doc:hello-system-part-3'",
  title: "第35章 B+ 树索引原理：从全表扫描到对数级查找",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 35,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第35章 B+ 树索引原理：从全表扫描到对数级查找

## 1. 为什么不能用二叉查找树或 Hash 表？

当数据库表记录达到千万级规模（教学示例：1000 万行）时，如果我们执行 \`SELECT * FROM courses WHERE code = 'CS-101'\`：
- **全表扫描（Full Table Scan）**：需要从头到尾读取全部数据行，产生极大的 I/O 开销；
- **为什么不用二叉平衡树（AVL/红黑树）**：二叉树每个节点只存一个键，扇出极低，同样数据量下树高明显更高（按 1000 万行的示例估算，$\\log_2(10^7) \\approx 24$ 层）。树越高，搜索路径上的跨页访问越多；如果页面访问未命中缓存，每次跨页都可能带来额外的存储 I/O；
- **为什么不用 Hash 表**：Hash 索引无法高效支持范围查询（如 \`WHERE capacity BETWEEN 60 AND 100\`）与排序操作。

---

## 2. B+ 树的结构特征与多路扇出（Fanout）

B+ 树通过**极大的页面扇出（Fanout）**将树的高度压缩到了极低的层数：

\`\`\`mermaid
flowchart TD
    subgraph Root["根节点页 (Root Page - 驻留内存缓存池)"]
        RKey["[ 1000 | 2000 | 3000 ]\n包含子节点页物理指针"]
    end

    subgraph Internal["非叶子节点页 (Internal Pages)"]
        P1["[ 100 | 500 ]"]
        P2["[ 1200 | 1800 ]"]
    end

    subgraph Leaf["叶子节点页 (Leaf Pages - 包含真实整行数据或主键，双向链表相连)"]
        L1["[ Tuple 1001 <-> Tuple 1002 ]"]
        L2["[ Tuple 2048 <-> Tuple 2049 ]"]
    end

    RKey --> P1 & P2
    P1 --> L1
    P2 --> L2
    L1 <== 双向链表指针 ==> L2
\`\`\`

> **工程实现客观说明**：
> 以 MySQL InnoDB 为例，其常见默认页面大小为 16 KiB（这是 InnoDB 的具体实现与可配置项，并非 B+ 树的定义）。较大的页面扇出使 B+ 树在工程实践中通常保持较低的树高（常见观察为 3~4 层左右）。但必须注意：**具体树高取决于页面大小、键长度、行记录规模以及页面填充率等综合因素，"3~4 层"只是常见情况而非固定规律。根节点与高层页面通常很容易被 Buffer Pool 缓存，因此"每层一次物理磁盘访问"并不成立——命中缓存的页面访问不会产生磁盘 I/O。**

---

## 3. EXPLAIN 执行计划分析实战

让我们使用 MySQL \`EXPLAIN\` 分析索引对查询性能的决定性改变：

\`\`\`sql
-- 1. 无索引状态下的查询分析
EXPLAIN SELECT * FROM courses WHERE code = 'CS-101';
\`\`\`
| type | possible_keys | key | rows | Extra |
| :--- | :--- | :--- | :--- | :--- |
| **ALL** | NULL | NULL | **1000000** | Using where (全表扫描 100 万行) |

\`\`\`sql
-- 2. 创建唯一索引
CREATE UNIQUE INDEX idx_courses_code ON courses(code);

-- 3. 再次执行分析
EXPLAIN SELECT * FROM courses WHERE code = 'CS-101';
\`\`\`
| type | possible_keys | key | rows | Extra |
| :--- | :--- | :--- | :--- | :--- |
| **const** | idx_courses_code | **idx_courses_code** | **1** | NULL (常数级精准命中) |
`
});

// 第 36 章（WAL 心智模型准确严密校正）
part3Docs.push({
  id: "doc:hello-system-36-acid-transactions",
  slug: "36-acid-transactions",
  parentId: "'doc:hello-system-part-3'",
  title: "第36章 事务与 ACID：在不确定的硬件世界中守护确定性",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 36,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第36章 事务与 ACID：在不确定的硬件世界中守护确定性

## 1. 事务的 ACID 四大支柱

在复杂的选课业务中，扣减名额与插入选课流水必须作为一个不可分割的原子整体：

- **原子性（Atomicity）**：事务中的所有操作要么全部成功持久化，要么全部回滚，绝不允许停留在半成品状态；
- **一致性（Consistency）**：事务执行前后，数据库的完整性约束与业务不变量始终保持合法；
- **隔离性（Isolation）**：并发执行的多个事务之间相互隔离，避免脏读、不可重复读等并发冲突；
- **持久性（Durability）**：在数据库所承诺的故障模型与持久化配置下，成功提交（COMMIT）的事务效果，应在系统崩溃恢复之后依然保留。

需要准确理解持久性的边界：它并不意味着存储介质永远不会损坏、机房永远不会毁坏、数据永远不会被管理员误删，也不意味着在任意配置下 COMMIT 都代表同样强度的刷盘（fsync）保证。持久性是一个**以具体故障模型与配置为前提的承诺**，而不是“数据绝对永存”的物理定律。

---

## 2. 预写日志（Write-Ahead Logging, WAL）的精准心智模型

如果每次事务提交都必须将修改后的整张数据页（以 InnoDB 常见默认配置为例，一页 16 KiB）同步写回磁盘数据文件，频繁的随机 I/O 将严重拖垮数据库吞吐量。

数据库通过 **WAL（预写日志）** 实现了极高的性能与可靠性平衡。以下以 MySQL InnoDB 的重做日志（Redo Log）为例说明这一原则的落地方式：

\`\`\`mermaid
flowchart TD
    Step1["1. 事务在内存 Buffer Pool 中修改数据页 (产生脏页 Dirty Page)"] --> Step2["2. 同时在内存中生成紧凑的重做日志记录 (Redo Log Record)"]
    Step2 --> Step3["3. 事务提交 (COMMIT): 按配置要求将顺序追加的 Redo Log 持久化"]
    Step3 --> Step4["4. 内存脏页由后台检查点线程 (Checkpoint) 异步批量刷回磁盘数据文件"]
\`\`\`

> **WAL 核心原则与心智模型**：
> 数据库**先在内存缓冲池中修改数据页并产生日志记录**。
> WAL 的关键规则是：**在内存中的脏数据页被持久化写入磁盘数据文件之前，其对应的日志记录必须先满足数据库所要求的持久化级别（先日志，后数据页）。**
> 事务 COMMIT 时的日志持久化行为与具体 DBMS 参数（如 MySQL \`innodb_flush_log_at_trx_commit\`）、组提交（Group Commit）、操作系统与存储栈密切相关，并非“每次 COMMIT 都必然立即单独执行一次 fsync”。
>
> 术语边界：WAL 是一种通用日志原则；InnoDB Redo Log 是它在 MySQL 中的一种具体实现；ARIES 是数据库恢复领域的经典算法框架。三者相关但不完全等同，不同数据库的 WAL 实现（如 PostgreSQL 的 WAL 记录格式）各有差异。
`
});

// 第 37 章（并发控制与行级锁）
part3Docs.push({
  id: "doc:hello-system-37-concurrency-and-locking",
  slug: "37-concurrency-and-locking",
  parentId: "'doc:hello-system-part-3'",
  title: "第37章 并发控制：行级锁、排他锁与幻读防范",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 37,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第37章 并发控制：行级锁、排他锁与幻读防范

## 1. 经典并发异常全景

当多个事务并发交错执行时，可能产生四种典型的异常现象：

\`\`\`mermaid
flowchart TD
    A1["1. 丢失更新 (Lost Update)\n事务 A 和 B 同时读取名额为 1，各自加 1 后写回，后写者覆盖前者导致少算一次"]
    A2["2. 脏读 (Dirty Read)\n事务 A 读取到了事务 B 尚未提交且最终被回滚的临时数据"]
    A3["3. 不可重复读 (Non-Repeatable Read)\n事务 A 在同一事务内两次读取同一行数据，得到了不同的值 (被事务 B 修改)"]
    A4["4. 幻读 (Phantom Read)\n事务 A 在同一事务内按范围查询，第二次查询发现多了几行新插入的数据 (被事务 B 插入)"]
\`\`\`

---

## 2. 悲观并发控制：行级排他锁（\`SELECT ... FOR UPDATE\`）

为了防范名额超卖，一种经典方案是在查询名额时立即对目标行施加排他锁（X 锁）：

\`\`\`sql
-- 开启事务
START TRANSACTION;

-- 方案 A: 显式加行级排他锁 (悲观锁)
SELECT id, capacity, enrolled 
FROM courses 
WHERE id = 2048 
FOR UPDATE;

-- 业务判定名额充足后执行更新
UPDATE courses 
SET enrolled = enrolled + 1 
WHERE id = 2048;

-- 插入流水并提交
INSERT INTO enrollments (student_id, course_id) VALUES (1001, 2048);
COMMIT;
\`\`\`

排他锁确保在当前事务提交前，其他并发事务对同一行的加锁读取与更新必须排队等待，从而防止了本场景下的丢失更新。需要注意：不同 DBMS 对行锁、MVCC 与快照隔离的实现存在差异——**仅仅声明“使用了事务”或“数据库是 ACID 的”，并不足以推断并发行为，必须同时明确具体的隔离级别、数据库实现与访问模式**。

在后续第五部分的第 51 章中，我们还将进一步探讨无需锁等待的高性能**原子条件更新**方案！
`
});

export { part3Docs };
