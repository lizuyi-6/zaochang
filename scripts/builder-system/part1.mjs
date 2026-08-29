// scripts/builder-system/part1.mjs
// 《Hello System · 图解软件系统》第一部分：程序开始变大 (第 01 ~ 12 章)（全量教材化深度扩写版本）

const part1Docs = [];

// 顶层部分节点
part1Docs.push({
  id: "doc:hello-system-part-1",
  slug: "part-1",
  parentId: "'doc:book-hello-system'",
  title: "第一部分: 程序开始变大 (01~12)",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 1,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第一部分: 程序开始变大 (01~12)

本部分聚焦于**单机内存程序的演化规律与面向对象架构的自然涌现**。

我们将从最简单的几十行平铺脚本出发，亲历系统规模扩张带来的变量失控、数据撕裂与状态被肆意篡改的灾难。以此为契机，我们亲手推导并构建复合类型、自治对象、封装边界、里氏替换原则、多态动态分派以及经典后端三层架构（Controller-Service-Repository），建立起扎实的第一层软件心智模型。
`
});

// 第 01 章
part1Docs.push({
  id: "doc:hello-system-01-why-architecture-matters",
  slug: "01-why-architecture-matters",
  parentId: "'doc:hello-system-part-1'",
  title: "第01章 从单行脚本到复杂系统：为什么我们需要架构？",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 1,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第01章 从单行脚本到复杂系统：为什么我们需要架构？

## 1. 一个能够工作的简单脚本

几乎所有程序员的职业生涯，都是从一个极度简单的控制台脚本开始的。

假设学校教务处需要一个极其微型的自动化工具，用于帮助一位老师统计某一门课的选课情况。在初学编程的阶段，我们通常会写出类似下面的代码：

\`\`\`java
import java.util.Scanner;

public class MiniEnroll {
    public static void main(String[] args) {
        String courseName = "计算机系统导论";
        int capacity = 100;
        int enrolled = 0;

        Scanner scanner = new Scanner(System.in);
        System.out.println("欢迎使用选课工具。输入 1 选课，输入 0 退出：");

        while (scanner.hasNextInt()) {
            int action = scanner.nextInt();
            if (action == 1) {
                if (enrolled < capacity) {
                    enrolled++;
                    System.out.println("选课成功！当前已选人数: " + enrolled + "/" + capacity);
                } else {
                    System.out.println("选课失败：名额已满！");
                }
            } else if (action == 0) {
                System.out.println("退出程序。最终选课人数: " + enrolled);
                break;
            }
        }
        scanner.close();
    }
}
\`\`\`

请停下来想一想：**这段代码写得好吗？**

答案是：**在当前的规模和约束下，这段代码非常优秀！**

它只有二十几行，逻辑一目了然，不需要定义复杂的类，没有引入任何外部框架，内存开销几乎为零，运行速度极快。任何懂一点基础语法的人都能在 10 秒钟内完全看懂它。

此时，如果我们向这位开发者大谈“面向对象设计模式”、“SOLID 原则”、“Controller-Service 分层”或“领域驱动设计（DDD）”，那不仅不是好的工程实践，反而是典型的**过度设计（Over-Engineering）**。

---

## 2. 状态空间爆炸：软件复杂度的数学本质

然而，软件系统最残酷的现实在于：**需求永远在变化，规模永远在扩张。**

随着业务的发展，教务处提出了新的需求：
1. 不仅有一门课，现在全校有 500 门课同时开放选课；
2. 课程有了分类：通识课、专业必修课、实验课；
3. 增加了学生资格校验：有些课程要求修过前置先修课，有些课程限制大一新生不能选；
4. 增加了重修退选保护：重修学生只占用特定配额；
5. 增加了操作审计要求：每一次选课必须记录是谁在什么时间操作的。

让我们从数学的角度审视这个变化过程。

一个软件系统的状态空间大小，取决于系统内独立变量的组合可能性。如果一个系统有 $n$ 个相互独立的布尔标志位或离散状态变量，系统的理论状态总数将达到：

$$S = 2^n$$

在最初的 20 行脚本中，$n \\approx 2$（是否满员、用户输入动作），人类大脑可以轻松在大脑的工作记忆（Working Memory）中穷举所有的状态流转分支。

但是，当 $n$ 增加到 20 时，$2^{20} \\approx 1,048,576$。没有任何一个人类工程师能够仅凭肉眼或直觉，预判一个包含 20 个自由变量的全局脚本在所有可能路径下的行为。

这就是**认知负荷超载（Cognitive Overload）**。

---

## 3. 为什么“打补丁”式的修改最终会崩溃？

面对需求的增加，如果不改变代码的组织形式，而是继续在原有的过程式结构中“打补丁”，系统会经历以下三个典型的腐化阶段：

### 阶段一：深层嵌套的 \`if-else\` 迷宫
为了处理各种业务特例，代码中开始出现 5 层甚至 10 层的条件嵌套：

\`\`\`java
if (action == 1) {
    if (isStudentEligible) {
        if (!isCourseFull) {
            if (isPrerequisitePassed) {
                if (isTimeConflictFree) {
                    // 真正的业务逻辑终于在这里露出一角
                    enrolled++;
                } else {
                    // 处理冲突 A
                }
            } else {
                // 处理冲突 B
            }
        }
    }
}
\`\`\`

此时，任何一个分支的微小修改，都极有可能意外破坏相邻分支的隐含前置条件。

### 阶段二：隐式依赖与幽灵联动（Spooky Action at a Distance）
当所有逻辑都在一个大函数或全局作用域中操作同一批变量时，修改变量 \`enrolled\` 的地方可能散落在文件的第 30 行、第 150 行和第 420 行。

当某个开发者在第 420 行为了修复退课 Bug 把 \`enrolled--\` 加了一个条件时，他根本不知道第 30 行的某处统计逻辑正隐式假定 \`enrolled\` 始终单调递增。

### 阶段三：测试与维护的彻底瘫痪
当你想测试“名额已满”这一边界情况时，你必须在测试环境里先构造出合法的学生身份、前置先修课成绩单、无冲突的时间表以及合法的终端输入。整个系统变成了一个**不可分割的巨大泥球（Big Ball of Mud）**。

---

## 4. 软件架构的真正定义：管理复杂度的边界与契约

面对规模膨胀带来的混乱，计算机科学给出的解法从来不是“期待程序员拥有超级大脑”，而是**架构（Architecture）与抽象（Abstraction）**。

> **软件架构的核心目标**：
> 通过划分清晰的**职责边界（Boundaries）**与**通信契约（Contracts）**，将一个庞大不可控的全局状态空间，分解为若干个互相独立、局部自治且易于理解的小子系统。

\`\`\`mermaid
flowchart TD
    subgraph Bad["混乱的泥球架构 (状态相互纠缠)"]
        V1["全局变量 courseName"] <--> F1["函数 calc()"]
        V2["全局变量 enrolled"] <--> F2["函数 print()"]
        V3["全局变量 capacity"] <--> F3["函数 validate()"]
        F1 <--> F3
        F2 <--> F1
    end

    subgraph Good["清晰的边界与契约 (分而治之)"]
        subgraph Domain["自治对象 / 领域核心"]
            C["Course (维护自身不变量)"]
        end
        subgraph Storage["持久化抽象"]
            R["Repository (专职读写)"]
        end
        subgraph API["表现层契约"]
            Ctrl["Controller (处理网络与参数)"]
        end

        Ctrl -->|调用业务用例| C
        Ctrl -->|请求持久化| R
        C -.->|遵循接口契约| R
    end
\`\`\`

在接下来的第一部分中，我们将亲手完成这一重构过程：
- 在第 02 ~ 05 章中，我们将看到如何用**复合类型与对象封装**，将散落的变量约束在自治的实体内部；
- 在第 07 ~ 11 章中，我们将看到如何用**多态与接口契约**，消除冗长的类型分支并解耦系统依赖；
- 在第 12 章中，我们将看到经典的**Controller-Service-Repository 三层架构**是如何自然成型的。

此时你的心智模型应当明确：**架构不是用来炫技的花哨名词，而是在系统规模扩张时，人类唯一能够保护自身代码不被复杂度吞噬的理性防线。**
`
});

// 第 02 章（全书教学样板章节：11 阶段推导）
part1Docs.push({
  id: "doc:hello-system-02-variables-out-of-control",
  slug: "02-variables-out-of-control",
  parentId: "'doc:hello-system-part-1'",
  title: "第02章 变量为什么开始失控？——从平铺变量到复合数据类型",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 2,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第02章 变量为什么开始失控？——从平铺变量到复合数据类型

## 1. 第一阶段：只有一门课程（一切都很美好）

让我们从最真实的工程演进开始。

在最初的选课系统中，我们只需要管理一门课程。代码中定义了三个独立的原始变量：

\`\`\`java
String courseName = "计算机系统导论";
int capacity = 100;
int enrolled = 0;
\`\`\`

此时代码非常清爽。变量名直观反映了业务含义，内存中只有三个紧凑的基础变量：

\`\`\`text
内存栈帧局部变量表：
[ courseName ] ---> "计算机系统导论" (String 引用)
[ capacity   ] ---> 100 (int 整数)
[ enrolled   ] ---> 0   (int 整数)
\`\`\`

我们必须明确承认：**这个设计在当前阶段没有任何毛病。**

---

## 2. 第二阶段：出现第二门课程（命名前缀的妥协）

第二天，教务处要求系统支持第二门课程《数据结构与算法》。

面对这个新需求，初学者最自然、改动最小的直觉是：**复制一套变量，并加上前缀加以区分**：

\`\`\`java
// 第一门课程
String c1_name = "计算机系统导论";
int c1_capacity = 100;
int c1_enrolled = 0;

// 第二门课程
String c2_name = "数据结构与算法";
int c2_capacity = 80;
int c2_enrolled = 0;
\`\`\`

请思考一个深层次的问题：**在编程语言的类型系统眼中，真的存在一个叫做“c1 课程”的独立实体吗？**

答案是：**完全不存在。**

在编译器看来，内存里只有 6 个孤立的变量：两个字符串引用和四个整型数字。所谓“\`c1_name\` 和 \`c1_capacity\` 属于同一门课程”，完全只是程序员依靠**命名规则（前缀 c1_）在脑海中建立的脆弱暗示**。

编译器既不知道、也无法协助你保证这种关联关系。

---

## 3. 第三阶段：当课程增加到十门（认知误区的澄清）

如果课程增加到 10 门，代码中就会出现 30 个平铺变量：\`c1_name\` 到 \`c10_enrolled\`。

> **常见误区**：
> “平铺变量的设计不好，是因为变量太多了，计算机处理不过来。”

这个结论是**完全错误的**。

从计算机体系结构和运行时的角度来看，现代 CPU 和内存管理几万甚至上百万个局部变量没有任何物理性能困难。

真正的矛盾在于：**人类大脑无法通过离散的命名前缀来编写通用的处理逻辑。**

如果你想写一个打印课程信息的函数，你不得不写出如下极其丑陋的代码：

\`\`\`java
if (courseId == 1) {
    System.out.println(c1_name + ": " + c1_enrolled + "/" + c1_capacity);
} else if (courseId == 2) {
    System.out.println(c2_name + ": " + c2_enrolled + "/" + c2_capacity);
} // ... 一直写到 else if (courseId == 10)
\`\`\`

每增加一门课，你就必须在所有包含分支判断的地方手动加一段代码。这种代码不仅冗长，而且极易遗漏。

---

## 4. 第四阶段：并行数组（Parallel Arrays）的引入

为了能够用循环统一处理多门课程，开发者自然会想到引入**数组**：

\`\`\`java
String[] names = {"计算机系统导论", "数据结构与算法", "操作系统原理"};
int[] capacities = {100, 80, 60};
int[] enrolled = {0, 0, 0};
\`\`\`

现在，代码终于可以用索引下标 \`i\` 来遍历所有课程了：

\`\`\`java
for (int i = 0; i < names.length; i++) {
    System.out.println(names[i] + ": " + enrolled[i] + "/" + capacities[i]);
}
\`\`\`

这比前缀变量前进了一大步。但它依然隐藏着致命的隐患。

---

## 5. 第五阶段：破坏性实验——排序导致的数据撕裂（Data Tearing）

让我们做一个真实的破坏性实验。

假设教务处要求：“请按照当前选课人数从高到低，对所有课程进行排序展示。”

一位新手程序员编写了如下常见的冒泡排序代码，对 \`enrolled\` 数组进行降序排序：

\`\`\`java
// 错误示范：只对 enrolled 数组进行排序
for (int i = 0; i < enrolled.length - 1; i++) {
    for (int j = 0; j < enrolled.length - 1 - i; j++) {
        if (enrolled[j] < enrolled[j + 1]) {
            // 交换已选人数
            int temp = enrolled[j];
            enrolled[j] = enrolled[j + 1];
            enrolled[j + 1] = temp;
        }
    }
}
\`\`\`

### 实验现象与输出结果：
假设初始状态为：
- 课程 0: 计算机系统导论, 容量 100, 已选 10
- 课程 1: 数据结构与算法, 容量 80, 已选 50

执行上述排序后：
- \`enrolled\` 数组变成了：\`{50, 10}\`；
- 但 \`names\` 数组依然是：\`{"计算机系统导论", "数据结构与算法"}\`；
- \`capacities\` 数组依然是：\`{100, 80}\`。

系统最终输出的结果变成了：
> **计算机系统导论: 50 / 100**  
> **数据结构与算法: 10 / 80**

### 核心矛盾分析：
**数据发生了极其严重的逻辑撕裂！**

原本属于《数据结构与算法》的 50 个学生，被错误地挂到了《计算机系统导论》名下！

为了修复这个 Bug，程序员必须在每一次发生交换时，**手动同步交换所有关联数组的相同下标元素**：

\`\`\`java
// 修补方案：三组数组必须严格同步交换
int tempEnrolled = enrolled[j];
enrolled[j] = enrolled[j + 1];
enrolled[j + 1] = tempEnrolled;

String tempName = names[j];
names[j] = names[j + 1];
names[j + 1] = tempName;

int tempCap = capacities[j];
capacities[j] = capacities[j + 1];
capacities[j + 1] = tempCap;
\`\`\`

只要未来系统为课程增加一个属性（例如 \`int[] credits\` 学分），而某个开发者在排序时少写了一句 \`credits\` 的交换语句，整个系统的数据就会再次发生静默撕裂。

---

## 6. 第六阶段：元素删除与移动的连锁灾难

除了排序，**删除一门课程**同样是一场灾难。

如果要从系统中删除下标为 $k$ 的课程，我们必须把所有数组在 $k$ 之后的所有元素同时向前移动一位：

\`\`\`mermaid
flowchart TD
    subgraph Arr["并行数组的同步移动 (极度脆弱)"]
        N["names 数组: [C0] [C1] [C2] -> 移动"]
        C["capacities 数组: [100] [80] [60] -> 移动"]
        E["enrolled 数组: [10] [50] [0] -> 移动"]
    end
\`\`\`

三个数组的长度必须随时保持完全一致。一旦其中一个数组因为某处异常未能同步移动，整个系统在后续按索引访问时，就会彻底陷入“张冠李戴”的混乱状态。

---

## 7. 第七阶段：函数调用的参数膨胀（Parameter Clump）

随着业务的发展，课程的属性不断增加：代码（code）、名称（name）、任课教师（teacher）、容量（capacity）、已选人数（enrolled）、学分（credits）、上课教室（room）、上课学期（semester）。

此时，如果你想编写一个打印或校验课程的函数，你的函数签名会变成这样：

\`\`\`java
public static void printCourse(
    String code, 
    String name, 
    String teacher, 
    int capacity, 
    int enrolled, 
    int credits, 
    String room, 
    String semester
) {
    // 打印逻辑
}
\`\`\`

在软件工程中，这种坏味道被称为**数据泥团（Data Clump）**：
一组本属于同一概念的属性，总是以长长的一串参数形式在代码中结伴出现、到处传递。

---

## 8. 第八阶段：核心哲学追问

经历了上面的 7 轮折磨，我们必须停下来，提出那个最核心的哲学问题：

> **“在现实世界中，我们明明一直在操作一门完整的‘课程’；为什么在我们的程序代码里，却从来没有一个能够被整体引用的‘Course’实体？”**

我们之所以痛苦，是因为**我们在现实世界中的心智模型，与代码中的数据表示发生了严重的割裂**。

现实中是一个不可分割的实体，而在代码中却被强行拆解成了 8 个毫无血缘关系的孤立数组和参数。

---

## 9. 第九阶段：复合数据类型（Composite Type / Record）的诞生

为了在代码中正式确立实体的地位，现代编程语言引入了**复合数据类型**（C 语言中的 \`struct\`，Java 16+ 中的 \`record\`，或传统的数据类）：

\`\`\`java
// 使用 Java Record 定义一个纯粹的复合数据类型
public record CourseRecord(
    String code,
    String name,
    int capacity,
    int enrolled
) {}
\`\`\`

引入复合类型后，内存结构发生了根本性的改变：

\`\`\`mermaid
classDiagram
    class CourseRecord {
        +String code
        +String name
        +int capacity
        +int enrolled
    }
\`\`\`

现在，我们可以定义一个统一的数组或列表：

\`\`\`java
List<CourseRecord> courses = new ArrayList<>();
courses.add(new CourseRecord("CS-101", "计算机系统导论", 100, 0));
courses.add(new CourseRecord("CS-102", "数据结构与算法", 80, 0));
\`\`\`

再次执行排序操作：

\`\`\`java
// 排序时移动的是 CourseRecord 对象的引用整体，绝无数据撕裂风险！
courses.sort((c1, c2) -> Integer.compare(c2.enrolled(), c1.enrolled()));
\`\`\`

当发生元素交换或传递时，**移动的是包含了该课程全部属性的整体引用**。《计算机系统导论》的名称、容量与已选人数永远被牢牢绑定在一起，彻底根除了数据撕裂的可能！

---

## 10. 第十阶段：横向验证——在其他领域体会复合类型

为了验证你是否真正理解了复合类型的核心价值，让我们看看其他领域的通用场景：

### 银行账户系统（BankAccount）
- **旧方案**：\`String[] accountNos\`, \`String[] ownerNames\`, \`BigDecimal[] balances\`, \`String[] currencyTypes\`
- **复合类型**：\`public record Account(String accountNo, String owner, BigDecimal balance, Currency currency) {}\`

### 文件下载任务（DownloadTask）
- **旧方案**：\`String[] urls\`, \`long[] totalBytes\`, \`long[] downloadedBytes\`, \`int[] statusCodes\`
- **复合类型**：\`public record DownloadTask(String url, long totalBytes, long downloadedBytes, TaskStatus status) {}\`

---

## 11. 第十一阶段：新的危机——聚合不等于封装

复合类型的引入，完美解决了**数据的聚合、整体传递与实体身份表达**问题。

但是，请观察下面的代码：

\`\`\`java
public class CourseData {
    public String code;
    public String name;
    public int capacity;
    public int enrolled;
}

// 外部任意代码均可执行如下操作：
CourseData c = new CourseData();
c.name = "计算机系统导论";
c.capacity = 100;
c.enrolled = -10; // 灾难：已选人数变成了负数！
c.capacity = 0;   // 灾难：容量变成了 0！
\`\`\`

复合类型把数据打包在了一起，但**它没有对数据的合法性提供任何保护**！任何外部代码都可以随意修改内部字段，将对象置于逻辑上荒谬的非法状态。

这引出了我们下一章的核心主题：**如何将数据与操作数据的行为绑定在一起，实现真正的自治对象与状态封装？**

---

### 此时你的心智模型应当变成：
1. **原始平铺变量**：只适合单一、小规模且极度简单的脚本；
2. **并行数组**：是过程式代码在缺乏抽象工具时的权宜之计，极易在排序与移动中发生数据撕裂；
3. **复合数据类型（Record/Struct）**：提供了实体的结构聚合与整体引用能力；
4. **聚合 $\\neq$ 封装**：聚合解决了数据绑定问题，但状态的一致性保护需要更高级的面向对象抽象。
`
});

// 第 03 章
part1Docs.push({
  id: "doc:hello-system-03-data-and-behavior",
  slug: "03-data-and-behavior",
  parentId: "'doc:hello-system-part-1'",
  title: "第03章 数据与行为的割裂：为什么需要自治对象？",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 3,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第03章 数据与行为的割裂：为什么需要自治对象？

## 1. 贫血数据结构的困境

在上一章中，我们通过复合数据类型将课程的属性聚合在了一起。

但在很多初学者的工程代码中，常见的设计依然是将数据结构与操作逻辑完全割裂开来。这种结构通常被称为**贫血模型（Anemic Model）**：

\`\`\`java
public class Course {
    public int id;
    public String code;
    public String name;
    public int capacity;
    public int enrolled;
}
\`\`\`

数据类中没有任何业务方法。当系统中需要执行“选课”操作时，业务逻辑通常散落在外部的各种工具类或过程函数中：

\`\`\`java
// 外部业务函数 A
public void handleStudentEnroll(Course course) {
    if (course.enrolled < course.capacity) {
        course.enrolled++;
        System.out.println("选课成功");
    } else {
        System.out.println("名额已满");
    }
}

// 外部业务函数 B (另一个同事编写的批量选课逻辑)
public void handleBatchEnroll(Course course, int studentCount) {
    // 疏忽：这位同事忘记了检查 capacity 上限！
    course.enrolled += studentCount; 
}
\`\`\`

这种设计导致了一个致命问题：**数据的完整性（Integrity）完全寄托在每一个外部调用者的细心程度上。**

一旦系统中存在几十个地方修改 \`course.enrolled\`，只要其中任何一个地方遗漏了 \`enrolled < capacity\` 的校验，整个系统的课程数据就会遭到破坏。

---

## 2. 核心概念：不变量（Invariant）

在严谨的软件工程中，每一个核心业务实体都拥有属于自己的**业务不变量（Business Invariant）**。

> **不变量（Invariant）**：
> 一个在实体的整个生命周期中，无论经历何种操作与状态跃迁，都必须始终保持为“真（True）”的逻辑命题。

对于课程实体 \`Course\`，其核心不变量至少包括：
1. **容量有效性**：$\\text{capacity} > 0$
2. **选课人数边界**：$0 \\le \\text{enrolled} \\le \\text{capacity}$
3. **名称与代码非空**：$\\text{code} \\neq \\text{null} \\land \\text{name} \\neq \\text{null}$

如果一个对象在内存中存在，但它的 \`enrolled\` 变成了 \`-5\` 或 \`150\`（超过 capacity 100），那么这个对象在概念上就已经**损坏（Corrupted）**了。

---

## 3. 自治对象（Autonomous Object）的诞生

为了捍卫业务不变量，面向对象编程提出了一个核心原则：**让数据与操作数据的行为紧密内聚在一起，形成自治对象。**

外部代码不应该直接伸手去拨动对象的内部零件（字段），而是应该向对象发送意图明确的消息（调用业务方法）：

\`\`\`mermaid
flowchart LR
    subgraph Bad["贫血模型 (外部随意篡改内部零件)"]
        Ext1["外部代码 1"] -->|直接修改| E1["course.enrolled++"]
        Ext2["外部代码 2"] -->|直接赋值| E2["course.enrolled = -10"]
    end

    subgraph Good["自治对象 (通过受控方法守护不变量)"]
        Client["外部客户端"] -->|发送业务请求| Method["course.enroll()"]
        subgraph CourseObject["Course 对象内部"]
            Method --> Guard{"守卫检查:\nenrolled < capacity ?"}
            Guard -->|满足| Update["enrolled++"]
            Guard -->|不满足| Reject["拒绝并抛出异常"]
        end
    end
\`\`\`

让我们用 Java 编写一个真正的自治对象：

\`\`\`java
public class Course {
    private final int id;
    private final String code;
    private final String name;
    private final int capacity;
    private int enrolled;

    public Course(int id, String code, String name, int capacity) {
        if (capacity <= 0) {
            throw new IllegalArgumentException("课程容量必须大于 0");
        }
        if (code == null || code.isBlank() || name == null || name.isBlank()) {
            throw new IllegalArgumentException("课程代码与名称不能为空");
        }
        this.id = id;
        this.code = code;
        this.name = name;
        this.capacity = capacity;
        this.enrolled = 0;
    }

    // 表达明确业务意图的方法，内部严密捍卫不变量
    public boolean enroll() {
        if (this.enrolled >= this.capacity) {
            return false; // 名额已满，拒绝操作
        }
        this.enrolled++;
        return true;
    }

    public boolean drop() {
        if (this.enrolled <= 0) {
            return false; // 已经为 0，不能继续扣减
        }
        this.enrolled--;
        return true;
    }

    // 只提供只读访问器，绝不提供外部自由修改的 setEnrolled()
    public int getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public int getCapacity() { return capacity; }
    public int getEnrolled() { return enrolled; }
}
\`\`\`

---

## 4. 多范式横向对比：其他编程范式如何解决相同问题？

面向对象并非解决数据与行为绑定的唯一途径。让我们看看其他编程范式是如何实现相同目标的：

### 1. 过程式抽象数据类型（Procedural ADT，以 C 语言为例）
在现代 C 语言中，通常利用**不透明指针（Opaque Pointer）**在头文件与源文件之间建立封装边界：
\`\`\`c
// course.h (对外头文件，只暴露类型声明与操作函数)
typedef struct Course Course;
Course* Course_create(int id, const char* code, const char* name, int capacity);
bool Course_enroll(Course* c);

// course.c (实现文件，结构体具体字段对外部不可见)
struct Course {
    int id;
    int capacity;
    int enrolled;
};
\`\`\`

### 2. 函数式编程（Functional Programming）
在函数式范式中，数据通常是**不可变值（Immutable Value）**。每次操作不修改旧状态，而是通过纯函数产生一个验证通过的新状态快照：
$$\\text{Course}_{new} = \\text{enroll}(\\text{Course}_{old})$$

无论哪种范式，其背后的核心思想是完全相通的：**绝不允许未经校验的外部代码破坏系统的合法状态。**
`
});

// 第 04 章
part1Docs.push({
  id: "doc:hello-system-04-classes-and-objects",
  slug: "04-classes-and-objects",
  parentId: "'doc:hello-system-part-1'",
  title: "第04章 类与对象：类型契约与运行时实例的脑内模型",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 4,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第04章 类与对象：类型契约与运行时实例的脑内模型

## 1. 区分两个世界：静态代码与运行时内存

初学者在学习面向对象时，最常犯的错误之一就是混淆了**类（Class）**与**对象（Object / Instance）**。

- **类（Class）**：属于**编译期与元数据世界**。它是类型契约的蓝图，定义了该类型拥有哪些字段布局、哪些可执行指令（字节码），以及向外界提供哪些方法签名；
- **对象（Object）**：属于**运行期内存世界**。它是根据类的蓝图在堆内存中动态开辟的一块具体内存区域，保存了该特定实例的独立状态数据。

\`\`\`mermaid
flowchart TD
    subgraph Meta["方法区 / 元空间 (Metaspace / Bytecode)"]
        ClassMeta["Course.class 元数据\n- 字段描述符: id, name, capacity, enrolled\n- 方法字节码: enroll(), drop()"]
    end

    subgraph Heap["堆内存 (JVM Heap)"]
        Obj1["Course 实例 1\n- id: 2048\n- name: '计算机系统导论'\n- capacity: 100\n- enrolled: 1"]
        Obj2["Course 实例 2\n- id: 2049\n- name: '数据结构与算法'\n- capacity: 80\n- enrolled: 0"]
    end

    Obj1 -.->|类型指针指向| ClassMeta
    Obj2 -.->|类型指针指向| ClassMeta
\`\`\`

---

## 2. 方法调用的本质：隐藏的 \`this\` 指针

请思考一个经典问题：
如果在系统中实例化了 10,000 个 \`Course\` 对象，内存中会存在 10,000 份 \`enroll()\` 方法的代码吗？

答案是：**绝对不会。**

无论创建多少个对象，\`enroll()\` 方法的编译后指令在内存中**永远只有一份**，存放在方法区/代码段中。

当我们在 Java 中调用 \`c1.enroll()\` 时，编译器在底层实际上将该调用转换为了类似如下形式：

\`\`\`text
Course.enroll(this = c1);
\`\`\`

在 JVM 字节码层级，非静态方法的第 0 号局部变量槽位（Slot 0）永远被保留用于传递当前对象的引用，这就是著名的 \`this\`。

通过隐式传入的 \`this\` 引用，同一段 \`enroll()\` 方法字节码才能准确找到堆内存中对应 \`c1\` 对象的 \`enrolled\` 字段并进行递增。

---

## 3. 内存视角示例：JVM 中的对象布局参考

为了建立直观的底层心智模型，我们以主流的 OpenJDK HotSpot 64位虚拟机（开启指针压缩）为例，观察一个对象在堆中的典型物理构成：

> **实现边界声明**：
> 下面的对象头构成属于 HotSpot JVM 的具体工程实现策略，并非 Java 语言规范（JLS）的硬性规定。不同的 JVM（如 Eclipse OpenJ9 或 GraalVM Native Image）可能有不同的内存布局。

\`\`\`text
┌─────────────────────────────────────────────────────────────┐
│  HotSpot JVM 对象典型堆内存布局 (以 64 位系统开启压缩指针为例)  │
├─────────────────────────────────────────────────────────────┤
│ 1. 对象头 (Header):                                         │
│    - 标记字 (Mark Word, 8 字节): 哈希码、GC 分代年龄、锁状态标志 │
│    - 类元指针 (Klass Word, 4 字节): 指向方法区 Course.class 元数据│
│ 2. 实例数据 (Instance Data):                                │
│    - int id (4 字节)                                        │
│    - 引用 name (4 字节, 压缩指针指向字符串常量/堆对象)            │
│    - int capacity (4 字节)                                  │
│    - int enrolled (4 字节)                                  │
│ 3. 对齐填充 (Padding): 补齐至 8 字节对齐整数倍                  │
└─────────────────────────────────────────────────────────────┘
\`\`\`

通过这个模型，你可以清晰看到：
对象本身只在堆中占用存放其自身字段所需的极小空间，而类型所共享的方法逻辑与元数据则安全驻留在独立的元空间中。
`
});

// 第 05 章
part1Docs.push({
  id: "doc:hello-system-05-encapsulation-and-invariants",
  slug: "05-encapsulation-and-invariants",
  parentId: "'doc:hello-system-part-1'",
  title: "第05章 封装与不变量：绝不让无效状态诞生",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 5,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第05章 封装与不变量：绝不让无效状态诞生

## 1. 为什么“一键生成所有 Getter/Setter”是对封装的背叛？

在许多大学课堂与初级教程中，老师常常会教学生使用 IDE 的快捷键 \`Alt + Insert\`，然后给实体类中的所有私有字段“一键生成全套 Getter 和 Setter”。

让我们认真审视这种做法：

\`\`\`java
public class Course {
    private int capacity;
    private int enrolled;

    // 机械生成的 Setter
    public void setCapacity(int capacity) {
        this.capacity = capacity;
    }
    public void setEnrolled(int enrolled) {
        this.enrolled = enrolled;
    }
}
\`\`\`

请问：**把字段设为 \`private\`，然后紧接着提供一个完全无保护的 \`public setEnrolled(int)\`，这和直接把字段定义为 \`public int enrolled\` 有任何本质区别吗？**

答案是：**没有任何区别！**

外部代码依然可以随心所欲地执行 \`course.setEnrolled(-999)\`。这种做法只是披着面向对象外衣的伪封装。

---

## 2. 真正的封装：双阶段不变量守护

真正的封装由两个互不可分的防御阶段构成：

\`\`\`mermaid
flowchart TD
    subgraph Phase1["阶段一：构造期严格校验 (防范非法初始状态)"]
        NewReq["new Course(id, code, name, capacity)"] --> Check{"capacity > 0 且 code/name 非空 ?"}
        Check -->|是| Init["成功初始化对象"]
        Check -->|否| Ex["抛出 IllegalArgumentException 阻止创建"]
    end

    subgraph Phase2["阶段二：状态跃迁受控 (防范运行期破坏)"]
        MethodCall["调用 enroll() / drop()"] --> TransCheck{"跃迁后是否仍满足 0 <= enrolled <= capacity ?"}
        TransCheck -->|满足| Apply["修改状态并返回成功"]
        TransCheck -->|不满足| Reject["拒绝状态跃迁并报错"]
    end

    Init --> MethodCall
\`\`\`

### 阶段一：构造函数守卫（Construction Guard）
确保对象从诞生的那一微秒开始，就处于绝对合法的健康状态。绝不允许一个非法对象在内存中成型。

### 阶段二：状态跃迁守卫（Transition Guard）
对象的所有状态变化，必须由带有业务语义的方法驱动。方法内部必须前置判断该次跃迁是否会破坏不变量。

---

## 3. 实战测试：使用单元测试验证不变量

一个真正完成良好封装的类，应该经得起各种破坏性测试的检验：

\`\`\`java
public class CourseTest {
    @Test
    public void should_reject_invalid_capacity_on_creation() {
        // 尝试用负数容量创建课程，必须抛出异常
        assertThrows(IllegalArgumentException.class, () -> {
            new Course(2048, "CS-101", "计算机系统导论", -10);
        });
    }

    @Test
    public void should_not_allow_enrolling_beyond_capacity() {
        Course course = new Course(2048, "CS-101", "计算机系统导论", 1);
        assertTrue(course.enroll()); // 第一次选课成功，enrolled 变为 1
        assertFalse(course.enroll()); // 第二次选课被拒绝，enrolled 依然为 1
        assertEquals(1, course.getEnrolled());
    }
}
\`\`\`

只有当你的类无论面对多么恶意的外部调用，都能自发保持内部状态的确定性与一致性时，你才算真正掌握了面向对象的核心灵魂——**封装**。
`
});

// 第 06 章
part1Docs.push({
  id: "doc:hello-system-06-object-lifecycle-and-memory",
  slug: "06-object-lifecycle-and-memory",
  parentId: "'doc:hello-system-part-1'",
  title: "第06章 对象的生与死：作用域、生命周期与内存回收",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 6,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第06章 对象的生与死：作用域、生命周期与内存回收

## 1. 作用域（Scope）与生命周期（Lifetime）的辨析

在理解内存管理时，必须清晰区分两个核心概念：

- **作用域（Scope）**：属于**静态编译期概念**。指一段变量名在源代码中可以被直接访问的代码文本范围（例如局部变量在其所在的大括号 \`{}\` 内可见）；
- **生命周期（Lifetime）**：属于**动态运行期概念**。指一块内存在物理堆空间中从分配被占用，到最终被垃圾收集器（GC）回收释放的真实时间跨度。

\`\`\`java
public void processBatch() {
    // 局部变量 ref 作用域仅限于 processBatch 方法内部
    Course ref = new Course(2048, "CS-101", "计算机系统导论", 100);
    globalCache.put(2048, ref); // 将引用存入全局长周期缓存
} // processBatch 栈帧弹出，局部变量 ref 作用域结束
\`\`\`

在上面的代码中，虽然 \`ref\` 的作用域随着方法结束而终结，但由于其指向的对象被全局对象 \`globalCache\` 引用，该 \`Course\` 对象在堆内存中的**生命周期依然在延续**。

---

## 2. 垃圾回收的本质：可达性分析算法（Reachability Analysis）

在现代高级语言运行环境（如 JVM）中，判断一个对象是否应该被回收，采用的是**可达性分析算法**。

算法以一组被称为 **GC Roots** 的根对象为起点，向下遍历搜索所有可引用的对象图。如果一个对象到任何 GC Roots 之间没有任何引用链相连，则证明该对象已经不可达，属于垃圾内存。

\`\`\`mermaid
flowchart TD
    subgraph Roots["GC Roots 根集合 (活跃栈帧局部变量 / 类的静态属性 / JNI 句柄)"]
        R1["当前线程栈帧局部变量: activeCourse"]
        R2["静态全局变量: appRegistry"]
    end

    subgraph Alive["可达对象 (存活，不被回收)"]
        ObjA["Course 实例 (CS-101)"]
        ObjB["Teacher 实例 (严教授)"]
    end

    subgraph Dead["不可达孤岛 (已被废弃，将在下一次 GC 中回收)"]
        ObjC["旧临时 Course 对象 (容量为 0 的草稿)"]
        ObjD["临时日志 String 对象"]
    end

    R1 --> ObjA
    ObjA --> ObjB
    R2 --> ObjA

    ObjC -.-> ObjD
\`\`\`

常见的 GC Roots 包括：
1. 当前正在执行的线程栈帧中的局部变量与参数引用；
2. 类中由 \`static\` 修饰的全局静态引用变量；
3. JNI（Java Native Interface）本地代码持有的全局与局部指针。
`
});

// 第 07 章
part1Docs.push({
  id: "doc:hello-system-07-object-collaboration",
  slug: "07-object-collaboration",
  parentId: "'doc:hello-system-part-1'",
  title: "第07章 对象如何协同：关联、组合与职责划分",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 7,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第07章 对象如何协同：关联、组合与职责划分

## 1. 单个对象无法构成系统

在真实业务中，单一的 \`Course\` 对象无法完成整个选课流程。

系统中必然存在另一类核心实体——**学生（Student）**。

那么，当学生李雷选择课程 CS-101 时，这两个对象之间应该如何协同？

\`\`\`mermaid
classDiagram
    class Student {
        -int id
        -String studentNo
        -String name
        -List~Integer~ enrolledCourseIds
        +enrollInCourse(int courseId) boolean
        +hasEnrolled(int courseId) boolean
    }
    class Course {
        -int id
        -String code
        -String name
        -int capacity
        -int enrolled
        +enroll() boolean
        +drop() boolean
    }
    Student "1" ..> "*" Course : 业务协作
\`\`\`

---

## 2. 职责的严密划分：谁该负责什么？

在面向对象协作设计中，最核心的原则是：**信息专家原则（Information Expert Pattern）——拥有该信息的对象，才负责维护对应的业务约束。**

请分析以下两个约束分别应该由谁来负责检查：

1. **约束一：一门课程的总选课人数不能超过其最大容量。**
   - **信息拥有者**：\`Course\`（它拥有 \`capacity\` 与 \`enrolled\` 字段）；
   - **责任归属**：由 \`Course.enroll()\` 方法负责捍卫。
2. **约束二：同一个学生不能重复选修同一门课程两次。**
   - **信息拥有者**：\`Student\`（或者学生个人的已选课程列表）；
   - **责任归属**：由 \`Student\` 或专门的选课服务负责捍卫。

如果把“检查学生是否已选”的逻辑塞进 \`Course\` 内部，会导致 \`Course\` 必须了解全校所有学生的选课详情，从而引发严重的耦合。

---

## 3. 防御性拷贝（Defensive Copying）

当一个对象需要向外界暴露其内部维护的集合属性时，必须防范外部代码恶意绕过其业务方法直接修改集合：

\`\`\`java
public class Student {
    private final int id;
    private final String name;
    private final List<Integer> enrolledCourseIds = new ArrayList<>();

    public Student(int id, String name) {
        this.id = id;
        this.name = name;
    }

    public boolean enrollIn(int courseId) {
        if (enrolledCourseIds.contains(courseId)) {
            return false; // 防范重复选课
        }
        enrolledCourseIds.add(courseId);
        return true;
    }

    // 危险做法：直接返回内部列表引用
    // public List<Integer> getEnrolledCourseIds() { return enrolledCourseIds; }

    // 正确做法：返回不可修改的视图 (Defensive View / Copy)
    public List<Integer> getEnrolledCourseIds() {
        return Collections.unmodifiableList(enrolledCourseIds);
    }
}
\`\`\`
`
});

// 第 08 章
part1Docs.push({
  id: "doc:hello-system-08-when-to-inherit",
  slug: "08-when-to-inherit",
  parentId: "'doc:hello-system-part-1'",
  title: "第08章 继承的诱惑与陷阱：里氏替换原则（LSP）",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 8,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第08章 继承的诱惑与陷阱：里氏替换原则（LSP）

## 1. 继承的滥用：为了代码复用而继承

继承是面向对象三大特性之一，但它也是最容易被滥用、引发灾难的机制。

假设系统中需要管理“上课教室（Classroom）”。一些初学者发现教室也有 \`capacity\`（座位数）和 \`name\`（教室名称），于是为了少写几行代码，写出了如下代码：

\`\`\`java
// 错误反模式：教室继承课程？！
public class Classroom extends Course {
    private String building;
    // ...
}
\`\`\`

这种设计是荒谬的。在概念上，教室显然不是一种特殊的课程。把教室当成课程会导致 \`Classroom\` 继承了诸如 \`enroll()\` 等完全不符合其物理含义的方法。

---

## 2. 里氏替换原则（Liskov Substitution Principle, LSP）

如何判断继承关系是否合理？计算机科学家 Barbara Liskov 给出了严格的定义：

> **里氏替换原则（LSP）**：
> 如果对于每一个类型为 $S$ 的对象 $o_1$，都存在一个类型为 $T$ 的对象 $o_2$，使得在所有针对 $T$ 编写的程序 $P$ 中，用 $o_1$ 替换 $o_2$ 后，程序 $P$ 的行为均不发生改变，则 $S$ 是 $T$ 的子类型。

简而言之：**子类必须能够无缝替换父类，且绝不能削弱父类在契约中承诺的前置条件与后置条件。**

\`\`\`mermaid
flowchart TD
    subgraph ValidInheritance["合法的 LSP 子类型关系"]
        Course["Base: Course (标准理论课)\n- capacity >= 1\n- enroll(): enrolled++"]
        LabCourse["Sub: LabCourse (实验课)\n- 增加了实验台设备编号要求\n- enroll(): 依然严格遵守容量不变量，完全兼容父类"]
        Course --> LabCourse
    end
\`\`\`

### 合法的子类扩展案例：\`LabCourse\`（实验课）
\`\`\`java
public class LabCourse extends Course {
    private final int labWorkstations;

    public LabCourse(int id, String code, String name, int capacity, int labWorkstations) {
        super(id, code, name, capacity);
        if (labWorkstations <= 0) {
            throw new IllegalArgumentException("实验工位数必须大于 0");
        }
        this.labWorkstations = labWorkstations;
    }

    public int getLabWorkstations() {
        return labWorkstations;
    }
}
\`\`\`

---

## 3. 组合优于继承（Composition over Inheritance）

在现代软件工程中，有一条广为人知的黄金准则：**优先使用对象组合，而非类继承。**

继承建立了编译期的**强耦合白盒复用**，父类的任何内部改动都会直接穿透影响所有子类（脆弱基类问题）。而组合建立了运行期的**黑盒协作**，具有更高的灵活性与扩展性。
`
});

// 第 09 章
part1Docs.push({
  id: "doc:hello-system-09-polymorphism-and-dynamic-dispatch",
  slug: "09-polymorphism-and-dynamic-dispatch",
  parentId: "'doc:hello-system-part-1'",
  title: "第09章 多态与动态分派：消除冗长分支的优雅机制",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 9,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第09章 多态与动态分派：消除冗长分支的优雅机制

## 1. 坏味道：类型判断与 \`instanceof\` 迷宫

假设系统中的课程在结算学费时有不同的计费策略：
- 普通理论课：按标准学分收费（每学分 100 元）；
- 实验课：额外加收 200 元实验耗材费；
- 名师公开课：一律免费。

在没有使用多态的代码中，业务处理逻辑通常充斥着大量的类型判断：

\`\`\`java
public BigDecimal calculateFee(Course course) {
    if (course instanceof LabCourse) {
        return course.getCredits().multiply(new BigDecimal("100")).add(new BigDecimal("200"));
    } else if (course instanceof PublicCourse) {
        return BigDecimal.ZERO;
    } else {
        return course.getCredits().multiply(new BigDecimal("100"));
    }
}
\`\`\`

这种写法严重违反了**开闭原则（Open-Closed Principle, OCP）**：
每当学校新增一种课程类型（例如“校企联合课”），你就必须找到所有包含 \`instanceof\` 的地方，手动加一个分支。只要漏改处，就会引发静默计费错误。

---

## 2. 子类型多态与动态分派（Dynamic Dispatch）

多态的核心思想是：**将“如何做”的具体差异下沉到各个子类型内部，外部调用者只面向统一的抽象接口编程。**

\`\`\`java
public abstract class Course {
    // 定义统一的抽象业务方法
    public abstract BigDecimal calculateTuitionFee();
}

public class StandardCourse extends Course {
    @Override
    public BigDecimal calculateTuitionFee() {
        return BigDecimal.valueOf(getCredits() * 100L);
    }
}

public class LabCourse extends Course {
    @Override
    public BigDecimal calculateTuitionFee() {
        return BigDecimal.valueOf(getCredits() * 100L + 200L);
    }
}
\`\`\`

现在，外部结算逻辑变得极度简洁且稳定：

\`\`\`java
// 无论未来新增多少种课程类型，此处的结算逻辑一行代码都不需要修改！
public BigDecimal calculateTotalFee(List<Course> courses) {
    BigDecimal total = BigDecimal.ZERO;
    for (Course c : courses) {
        total = total.add(c.calculateTuitionFee()); // 动态分派
    }
    return total;
}
\`\`\`

---

## 3. 动态分派的底层实现原理：虚方法表（vtable）参考

在 JVM 或 C++ 运行时的具体实现中，动态分派通常借助**虚方法表（Virtual Method Table, vtable）**来高效定位目标方法指令：

\`\`\`mermaid
flowchart LR
    Ref["Course c (类型声明为 Course，实际指向 LabCourse 实例)"] --> Obj["LabCourse 堆对象"]
    Obj --> Klass["LabCourse 类元数据"]
    Klass --> VTable["LabCourse 虚方法表 (vtable)"]
    VTable --> Slot["Slot 3: calculateTuitionFee 指针"]
    Slot --> Code["指向 LabCourse.calculateTuitionFee() 实际字节码指令"]
\`\`\`

通过在编译期固定方法在虚方法表中的偏移量（Offset），运行时只需一次简单的指针寻址，即可在常数时间 $O(1)$ 内精准调用对应子类的实现，兼具了极高的灵活性与运行效率。
`
});

// 第 10 章
part1Docs.push({
  id: "doc:hello-system-10-interfaces-and-contracts",
  slug: "10-interfaces-and-contracts",
  parentId: "'doc:hello-system-part-1'",
  title: "第10章 接口与依赖倒置（DIP）：面向契约设计",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 10,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第10章 接口与依赖倒置（DIP）：面向契约设计

## 1. 强耦合的灾难：硬编码具体实现

在业务开发中，我们常常需要发送选课成功的通知短信。

请看以下初级设计：

\`\`\`java
public class EnrollmentService {
    // 直接硬编码依赖了阿里云短信的具体实现类
    private final AliyunSmsSender smsSender = new AliyunSmsSender("ak-123456");

    public void enroll(int studentId, int courseId) {
        // ... 选课逻辑 ...
        smsSender.send(studentId, "恭喜您成功选修该课程！");
    }
}
\`\`\`

这种设计带来了巨大的麻烦：
1. **无法进行单元测试**：在开发和自动化测试时，你每次运行测试都会真的给学生手机发一条真实短信并扣除企业短信费用；
2. **供应商绑定**：如果学校决定把短信服务商从阿里云切换为腾讯云，或者在本地测试时使用邮件通知，你必须直接修改 \`EnrollmentService\` 的核心业务源码。

---

## 2. 依赖倒置原则（Dependency Inversion Principle, DIP）

为了打破这种强耦合，SOLID 原则提出了著名的**依赖倒置原则**：

> **依赖倒置原则（DIP）**：
> 1. 高层业务模块不应该依赖低层具体实现模块，二者都应该依赖于抽象契约；
> 2. 抽象契约不应该依赖于具体细节，具体细节应该依赖于抽象契约。

\`\`\`mermaid
flowchart TD
    subgraph Bad["传统正向依赖 (高层模块直接依赖底层具体实现)"]
        Svc1["EnrollmentService (高层业务)"] --> Aliyun["AliyunSmsSender (底层具体实现)"]
    end

    subgraph Good["依赖倒置 (双方均依赖抽象接口契约)"]
        Svc2["EnrollmentService (高层业务)"] --> NotificationSender["<<interface>>\nNotificationSender"]
        AliyunImpl["AliyunSmsSender\n(生产环境实现)"] -.->|实现| NotificationSender
        MockImpl["MockNotificationSender\n(单元测试环境实现)"] -.->|实现| NotificationSender
    end
\`\`\`

---

## 3. 契约定义与多环境装配

我们首先定义一个纯粹的抽象接口：

\`\`\`java
public interface NotificationSender {
    void send(int recipientId, String message);
}
\`\`\`

高层业务服务只面向该接口编程：

\`\`\`java
public class EnrollmentService {
    private final NotificationSender notificationSender;

    // 依赖注入 (Dependency Injection)：由外部容器组装具体实现
    public EnrollmentService(NotificationSender notificationSender) {
        this.notificationSender = notificationSender;
    }

    public void enroll(int studentId, int courseId) {
        // ... 核心业务 ...
        notificationSender.send(studentId, "选课成功");
    }
}
\`\`\`

在编写单元测试时，我们可以注入一个静默记录消息的 Mock 实现：

\`\`\`java
public class MockNotificationSender implements NotificationSender {
    public final List<String> sentMessages = new ArrayList<>();

    @Override
    public void send(int recipientId, String message) {
        sentMessages.add(recipientId + ": " + message);
    }
}
\`\`\`

这样，测试可以在毫秒级完成，既不需要联网，也不会产生任何外部副作用。
`
});

// 第 11 章
part1Docs.push({
  id: "doc:hello-system-11-breaking-the-god-class",
  slug: "11-breaking-the-god-class",
  parentId: "'doc:hello-system-part-1'",
  title: "第11章 打破上帝类：单一职责原则（SRP）",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 11,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第11章 打破上帝类：单一职责原则（SRP）

## 1. 上帝类（God Class）的反模式

随着 Mini Campus 系统的不断扩充，一个名为 \`CampusManager\` 的类逐渐膨胀到了 3000 行。

让我们看看这个类里都塞满了什么：

\`\`\`java
public class CampusManager {
    // 1. HTTP 请求参数解析与 JSON 序列化
    public void handleHttpRequest(String rawJson) { /* ... */ }

    // 2. 学生身份与权限认证
    public boolean authenticateUser(String token) { /* ... */ }

    // 3. 核心选课资格与名额扣减编排
    public boolean processEnrollment(int sId, int cId) { /* ... */ }

    // 4. 原生 SQL 拼接与 JDBC 数据库连接管理
    public void executeInsertSql(String sql) { /* ... */ }

    // 5. 短信与邮件发送
    public void sendSmsNotification(String phone, String msg) { /* ... */ }
}
\`\`\`

这个类几乎无所不知、无所不为，是典型的**上帝类（God Class）**。

一旦前端修改了请求参数格式，或者数据库更换了连接池驱动，甚至短信服务商升级了 API，所有工程师都必须在同一个 3000 行的庞大文件里进行修改。代码合并冲突不断，Bug 频发。

---

## 2. 单一职责原则（Single Responsibility Principle, SRP）

著名软件大师 Robert C. Martin 将单一职责原则表述为：

> **单一职责原则（SRP）**：
> 一个类应该有且仅有一个引起它变化的原因（A class should have one, and only one, reason to change）。

所谓的“变化原因”，本质上是指**不同的利益相关者（Stakeholders）或不同的系统关注点**：
- **表现层协议变化**（如从 REST JSON 切换为 GraphQL） $\to$ 引起 Controller 变化；
- **业务规则变化**（如选课必须先完成先修课考核） $\to$ 引起 Service 变化；
- **存储介质变化**（如从 MySQL 迁移到 PostgreSQL 或内存缓存） $\to$ 引起 Repository 变化。

---

## 3. 上帝类的优雅拆解

我们将上帝类沿着职责边界彻底解构：

\`\`\`mermaid
flowchart LR
    GodClass["上帝类 CampusManager\n(3000 行庞然大物)"] --> C["EnrollmentController\n(专职协议解析与响应包装)"]
    GodClass --> S["EnrollmentService\n(专职业务规则编排)"]
    GodClass --> R["CourseRepository\n(专职数据持久化)"]
    GodClass --> N["NotificationSender\n(专职消息通知)"]
\`\`\`

每一个拆解后的小类都小巧玲珑，职责高度内聚，系统彻底恢复了健康与秩序。
`
});

// 第 12 章
part1Docs.push({
  id: "doc:hello-system-12-emergence-of-layers",
  slug: "12-emergence-of-layers",
  parentId: "'doc:hello-system-part-1'",
  title: "第12章 经典三层架构的诞生：Controller-Service-Repository",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 12,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第12章 经典三层架构的诞生：Controller-Service-Repository

## 1. 经典三层职责矩阵

经过前 11 章的推导与重构，现代企业级后端最经典的**三层架构（Three-Tier Architecture）**正式成型：

\`\`\`mermaid
flowchart TD
    Client["外部客户端 / 浏览器 HTTP 请求"] --> Controller["表现层: Controller\n- 职责: 路由分发、参数格式反序列化、调用业务用例、封装 HTTP 响应状态码"]
    Controller --> Service["业务逻辑层: Service\n- 职责: 业务规则编排、跨实体协作、事务边界控制 (@Transactional)、领域不变量捍卫"]
    Service --> Repository["数据访问层: Repository\n- 职责: 实体持久化抽象、屏蔽底层数据库具体 SQL 与存储细节"]
    Repository --> DB[("数据库 / 存储引擎")]
\`\`\`

| 架构分层 | 核心职责 | 绝对不能做的事情（禁忌） |
| :--- | :--- | :--- |
| **Controller（表现层）** | 解析 HTTP 报文、校验入参基础格式、调用 Service、组装返回 DTO | **严禁**编写核心业务规则判定；**严禁**直接编写 SQL 操作数据库 |
| **Service（业务逻辑层）** | 编排业务用例、控制事务一致性边界、调度领域对象与持久化接口 | **严禁**出现 \`HttpServletRequest\` 等具体网络协议对象 |
| **Repository（持久化层）** | 将内存对象转换为数据库记录，执行 CRUD 查询 | **严禁**在此处做核心业务决策（如“判断学生是否可以选课”） |

---

## 2. 关于实体身份标识（\`Course.id\`）的时间线说明

随着系统正式引入持久化层与仓储接口，我们需要对实体的身份标识进行一次概念澄清：

> **概念辨析：对象内存身份 vs 数据库持久化主键**
> - **在纯内存阶段（第 01 ~ 05 章）**：对象的身份完全由其在堆内存中的**引用地址（Reference Identity）**唯一确定；
> - **在持久化阶段（第 12 章及以后）**：当系统重启后，内存地址全部重置。为了在数据库与跨机器通信中唯一标识一门课程，我们为 \`Course\` 实体正式确立唯一主键：\`private final int id;\`。

---

## 3. Mini Campus V3 完整运行示例

让我们查看三层协同工作的完整 Java 代码：

\`\`\`java
// 1. 数据访问层接口 (Repository Contract)
public interface CourseRepository {
    Optional<Course> findById(int id);
    void save(Course course);
}

// 2. 业务逻辑层 (Business Service)
public class EnrollmentService {
    private final CourseRepository courseRepository;

    public EnrollmentService(CourseRepository courseRepository) {
        this.courseRepository = courseRepository;
    }

    public boolean enroll(int studentId, int courseId) {
        // 从仓储中加载实体
        Course course = courseRepository.findById(courseId)
            .orElseThrow(() -> new IllegalArgumentException("课程不存在: " + courseId));

        // 实体自主执行业务操作并捍卫不变量
        boolean success = course.enroll();
        if (!success) {
            return false;
        }

        // 保存更新后的状态
        courseRepository.save(course);
        return true;
    }
}

// 3. 表现层控制器 (Web Controller)
public class EnrollmentController {
    private final EnrollmentService enrollmentService;

    public EnrollmentController(EnrollmentService enrollmentService) {
        this.enrollmentService = enrollmentService;
    }

    public Response handleEnroll(int authenticatedStudentId, int targetCourseId) {
        try {
            boolean ok = enrollmentService.enroll(authenticatedStudentId, targetCourseId);
            if (ok) {
                return Response.ok("选课成功");
            } else {
                return Response.badRequest("课程名额已满");
            }
        } catch (IllegalArgumentException e) {
            return Response.badRequest(e.getMessage());
        }
    }
}
\`\`\`

至此，第一部分的探索圆满完成。我们拥有了干净、健壮且结构清晰的后端面向对象业务核心。

接下来，我们将目光转向屏幕前的另一半世界——进入第二部分：**页面开始变复杂 (13 ~ 24)**，探索现代前端框架的诞生与运行机理！
`
});

export { part1Docs };
