// scripts/builder-system/part1.mjs
// 第一部分：程序开始变大 (01 ~ 12)
// 深度教科书级高密度完整版本 (全 12 章完整深度展开)

export const part1Docs = [
  {
    id: "doc:hello-system-part-1",
    slug: "part-1",
    parentId: "'doc:book-hello-system'",
    title: "第一部分 · 程序开始变大",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-system-01-why-architecture",
    slug: "01-why-architecture",
    parentId: "'doc:hello-system-part-1'",
    title: "第01章 如果程序只有一百行，我们为什么需要架构？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第01章 如果程序只有一百行，我们为什么需要架构？

## 1. 最初情境：一个极其直接的选课程序

让我们暂时忘记浏览器、忘记网络通信、忘记数据库、忘记所有高深莫测的设计模式。

退回到计算机程序设计的最原点：假设我们现在只需要在控制台环境里模拟一次最基本的选课操作。此时没有几十毫秒的网络延迟，没有数以万计并发请求的冲撞，只有一个正在执行的操作系统进程，以及一块由该进程独占的连续内存空间。

在这样的前提下，一个程序员最自然、最符合直觉的代码只需要十来行：

\`\`\`java
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
\`\`\`

请仔细阅读上面这段代码。

它能正常工作吗？

答案是：**它不仅完全能够工作，而且在当前尺度下，它是近乎完美的。**

从机器运行的物理视角来看：
- 所有的局部变量（\`studentId\`, \`courseCapacity\`, \`courseEnrolled\`）都紧凑地分配在当前线程执行栈帧的局部变量表中；
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

1. **认知负荷几乎为零**：人类的大脑工作记忆容量通常只能同时维持 $7 \\pm 2$ 个离散信息块。当程序只有十行时，你的眼睛可以在一秒钟内扫过整个控制流，大脑可以在单核状态下精确推演出每一行代码执行前后的全部内存状态变化。
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

\`\`\`java
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
\`\`\`

请停下来观察这段代码。

它依然能精确运行并输出正确结果。代码行数从 15 行增加到了大约 45 行。对于一个具有基本编程能力的读者来说，阅读它依然没有任何难度。

但请注意：**系统的地基在这一刻已经悄悄出现了第一道裂缝。**

---

## 4. 第一次撞墙：业务规则的微小变动

我们来做一个极其真实的推演。

就在上面的代码写完的第二天，教务处突然下发了一份紧急红头文件：

> “为了保障教学质量与重修补考通道，从即日起，所有课程的实际可选名额不得使用全部原始容量，必须严格预留 $10\\%$ 的名额给重修学生。即实际允许选课的最大上限为 $\\lfloor \\text{capacity} \\times 0.9 \\rfloor$。”

现在，请思考：为了让现有系统满足这个新规则，你需要做什么？

你必须在代码中，**手动寻找到所有的选课判断分支**，并将原有的条件逐一替换：

$$\\text{旧条件: } \\text{enrolled} < \\text{capacity} \\quad \\implies \\quad \\text{新条件: } \\text{enrolled} < (\\text{int})(\\text{capacity} \\times 0.9)$$

在当前 45 行的小程序里，你只需要修改 3 个地方。你花了一分钟完成了修改，觉得这完全不是问题。

现在，我们将系统尺度放大到一所普通大学的真实规模：
- 全校开设 **500 门课程**；
- 全校共有 **12,000 名学生**；
- 在整个教务系统的各个功能模块中（网上自主选课、管理员后台补选、辅修专业选课、跨院系选课），类似的选课判断逻辑被复制粘贴了 **1,200 次**。

现在，灾难降临了：

1. **修改成本的线性爆炸**：你需要打开几十个文件，肉眼定位这 1,200 处 \`if\` 语句，重复进行 1,200 次手工修改；
2. **静默且无法检测的人为失误**：在这 1,200 次枯燥的手工修改中，只要有一次手误，比如在第 843 处把 \`c32_capacity\` 不小心写成了 \`c31_capacity\`，或者漏乘了 \`0.9\`——**编译器绝对不会报出任何语法错误**。

因为变量类型完全合法，算术表达式完全有效。

这个 Bug 将如同一枚深水炸弹，静静潜伏在代码库深处，直到正式选课当天，某位同学选了一门已经满员的课程并导致系统数据冲突时，才轰然引爆。

\`\`\`mermaid
flowchart TD
    Req["现实世界概念扩张\n(学生数 + 课程数增加)"] --> Copy["朴素应对手段: 复制粘贴逻辑片段"]
    Copy --> Spread["同一条业务判断规则到处扩散\n(1200 处重复的 if 判断)"]
    Spread --> Change["外部需求微小调整\n(容量需预留 10% 重修名额)"]
    Change --> HumanError["大规模手工修改导致不可避免的疏漏\n(某处漏改或变量名敲错)"]
    HumanError --> Crash["系统在没有语法报错的情况下\n陷入无声的逻辑崩溃"]
\`\`\`

---

## 5. 尝试修补：过程式函数的登场

面对上述灾难，任何一个有经验的过程式程序员都会立刻做出第一轮自发重构：

> “我们不应该到处复制那个 \`if\` 判断，我们应该把它提取成一个独立的函数（Function）！”

我们尝试编写一个全局选课函数：

\`\`\`java
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
\`\`\`

这个修补方案有效吗？

它确实解决了一半的问题：关于“名额上限计算规则”的逻辑现在只存在于 \`tryEnroll\` 函数这一个地方。如果未来教务处要把预留比例从 $10\\%$ 改成 $15\\%$，我们只需要修改该函数内部的一行代码。

但是，**另一半更致命的问题依然毫无着落**：

请仔细观察 \`if (tryEnroll(...))\` 内部的代码：
\`tryEnroll\` 仅仅返回了一个布尔值 \`true\`，而真正改变系统状态的动作——\`c1_enrolled++\`，依然赤裸裸地暴露在外部的主流程里！

如果外部调用者写出了这样的代码：
\`\`\`java
// 某位疲惫的程序员在熬夜赶工时写下的逻辑：
if (tryEnroll(c1_capacity, c1_enrolled)) {
    c2_enrolled++; // 致命手误：判断了课程 1，却把课程 2 的已选人数增加了！
}
\`\`\`
编译器依然保持沉默。

问题不仅没有彻底解决，反而变得更加隐晦：**判断逻辑被抽离到了函数里，但数据状态的物理修改依然散落在各个角落。两者在时空上是脱节的。**

---

## 6. 横向验证：相同困境在其他领域的重现

为了验证这并不是校园选课系统独有的偶然现象，我们迅速将视线投向两个完全不同的软件场景：

### 场景 A：银行账户转账系统
在最原始的脚本中：
\`\`\`java
double account1_balance = 1000.0;
double account2_balance = 500.0;

// 转账 200 元
if (account1_balance >= 200.0) {
    account1_balance -= 200.0;
    account2_balance += 200.0;
}
\`\`\`
当全行拥有 100 万个账户、涉及活期、定期、理财、外汇多种转账规则时，如果每次扣减余额与增加余额都作为裸露的代码行散落在各处，哪怕某处漏写了一行 \`account2_balance += ...\`，系统就会凭空蒸发资金。

### 场景 B：简易文件下载管理器
\`\`\`java
String task1_url = "https://example.com/file1.zip";
int task1_totalBytes = 10485760;
int task1_downloadedBytes = 0;
boolean task1_isPaused = false;
\`\`\`
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
当 $n = 30$ 时，$S = 2^{30} \\approx 10^9$，系统的状态组合已经超越了任何单个程序员的认知极限；  
当 $n = 1000$ 时，没有任何人能断言某一行赋值语句是否会在某种极端输入下引发全局雪崩。

\`\`\`mermaid
flowchart LR
    subgraph ZeroArch ["无架构状态 (全连通图)"]
        V1["变量 1"] <--> V2["变量 2"]
        V2 <--> V3["变量 3"]
        V3 <--> V1
        V1 <--> V4["变量 4"]
        V2 <--> V4
        V3 <--> V4
        note1["依赖连线数 = n(n-1)/2\n复杂度呈平方级爆炸"]
    end

    subgraph Structured ["结构化架构状态 (分块自治)"]
        subgraph BoxA ["模块 A"]
            BA1["变量 1"] <--> BA2["变量 2"]
        end
        subgraph BoxB ["模块 B"]
            BB1["变量 3"] <--> BB2["变量 4"]
        end
        BoxA <==>|定义清晰的极简通道| BoxB
        note2["内部高度自洽\n对外暴露极少交互通道"]
    end
\`\`\`

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
`
  },
  {
    id: "doc:hello-system-02-variables-out-of-control",
    slug: "02-variables-out-of-control",
    parentId: "'doc:hello-system-part-1'",
    title: "第02章 变量为什么开始失控？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 2,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第02章 变量为什么开始失控？

## 1. 真实问题切入：隐式关联（Implicit Association）

在上一章中，为了描述两门课程，我们写下了这样的变量声明：

\`\`\`java
String c1_name = "计算机系统导论";
int c1_capacity = 100;
int c1_enrolled = 0;

String c2_name = "离散数学基础";
int c2_capacity = 60;
int c2_enrolled = 0;
\`\`\`

现在，请闭上眼睛，从底层计算机硬件与编译器的视角，思考一个极其本质的问题：

**计算机到底通过什么机制知道，\`c1_name\`、\`c1_capacity\` 和 \`c1_enrolled\` 描述的是同一个现实实体？**

答案可能会让你震惊：**计算机根本不知道，也不在乎。**

在编译器生成的符号表与底层虚拟内存的物理布局中，这三个变量完全平权、完全孤立：

\`\`\`text
线程执行栈 / 局部变量表内存视图:
[ 栈帧偏移 Slot 0 ] -> 存放引用，指向字符串常量池中的 "计算机系统导论" (变量名: c1_name)
[ 栈帧偏移 Slot 1 ] -> 存放 32 位整型数值 100 (变量名: c1_capacity)
[ 栈帧偏移 Slot 2 ] -> 存放 32 位整型数值 0   (变量名: c1_enrolled)
[ 栈帧偏移 Slot 3 ] -> 存放引用，指向字符串常量池中的 "离散数学基础" (变量名: c2_name)
[ 栈帧偏移 Slot 4 ] -> 存放 32 位整型数值 60  (变量名: c2_capacity)
[ 栈帧偏移 Slot 5 ] -> 存放 32 位整型数值 0   (变量名: c2_enrolled)
\`\`\`

在物理层面上，Slot 0、Slot 1 和 Slot 2 之间没有任何指针互相连接，没有任何锁链把它们拴在一起。

它们之所以在人类的思维中属于“同一门课程”，**纯粹是因为程序员在键盘上敲代码时，一厢情愿地在它们的名字前面统一加上了 \`c1_\` 这个前缀字符串。**

这种完全依赖人类命名习惯和记忆力维持的关联，被称为**隐式关联（Implicit Association）**。

隐式关联是脆弱的代名词。只要程序稍微经历几次数据重排、交换或函数调用，这种虚幻的关联就会立刻被撕得粉碎。

---

## 2. 破坏性实验：撕裂隐式关联

让我们编写一个最小可运行实验，亲眼见证隐式关联是如何在一次看似平常的“数据交换”操作中引发数据错位的。

假设我们的教务系统需要根据教室排期，临时调换两门课程在展示列表中的顺序：

\`\`\`java
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

        System.out.println("\n=== 交换后当前状态 ===");
        printCourse("课程 1", c1_name, c1_capacity, c1_enrolled);
        printCourse("课程 2", c2_name, c2_capacity, c2_enrolled);
    }
}
\`\`\`

### 运行输出结果：
\`\`\`text
=== 交换前初始状态 ===
课程 1 -> 名称: 计算机系统导论, 容量: 100, 已选人数: 95
课程 2 -> 名称: 古希腊哲学史, 容量: 30, 已选人数: 5

=== 交换后当前状态 ===
课程 1 -> 名称: 古希腊哲学史, 容量: 30, 已选人数: 95
课程 2 -> 名称: 计算机系统导论, 容量: 100, 已选人数: 5
\`\`\`

### 深度剖析：
看！荒诞而致命的事故发生了：
- 《古希腊哲学史》原本只有 30 个名额，经历了一次残缺的交换之后，它的名字和容量被搬到了 \`c1\` 对应的变量中，但它的已选人数没有动。结果变成了：**容量 30 人的课程，已选人数居然高达 95 人（严重穿透不变量）！**
- 而原本火爆的《计算机系统导论》，其已选人数莫名其妙变成了 5 人。

最恐怖的是：**整个编译期没有任何警告，运行期没有任何报错抛出。**

因为对于计算机而言，它只是执行了几次普通的整数和字符串赋值。计算机没有任何物理手段能够理解：当你移动 \`c1_name\` 时，内存中遥远的 \`c1_enrolled\` 必须寸步不离地跟着一起移动。

\`\`\`mermaid
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
\`\`\`

---

## 3. 第一次尝试修补：并行数组（Parallel Arrays）

很多初学者在经历过上述前缀变量的痛苦后，会很自然地想到第二个方案：

> “既然为每一门课单独声明变量会导致变量数量爆炸，那我们为什么不用数组呢？我们可以创建 3 个平行的数组，分别存放全校所有课程的名字、容量和已选人数！”

这就是在早期的 FORTRAN 和基础 BASIC 程序设计中极具代表性的**并行数组模式（Parallel Arrays）**：

\`\`\`java
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
\`\`\`

在最初的 10 分钟里，并行数组看起来非常优雅：
无论全校有 3 门课还是 3000 门课，我们的变量数量永远固定只有 3 个（\`names\`, \`capacities\`, \`enrolleds\`）。我们似乎用数组完美压制了变量的膨胀。

然而，一旦系统进入真实的业务交互，并行数组将迅速演变成一场噩梦。

---

## 4. 并行数组的三重绝境

### 绝境一：排序错位（Sorting Desynchronization）
教务处要求：“请在页面上按照课程容量从大到小对所有课程进行排序。”

在 Java 中，如果你调用现成的排序函数：
\`\`\`java
// 错误尝试：直接排序容量数组
java.util.Arrays.sort(capacities);
\`\`\`
结果是：\`capacities\` 数组内部的数字被重新排列了，但 \`names\` 和 \`enrolleds\` 留在原地没有动！
整个学校的课程名称与容量瞬间全部张冠李戴。

为了正确排序，你必须手写一个极其别扭的冒泡排序或双重交换算法，在比较容量时，**强迫手动同步交换另外两个数组对应的元素**：

\`\`\`java
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
\`\`\`

如果未来一门课程增加了“任课教师”、“学分”、“上课教室”、“上课时间”等另外 10 个属性，你就必须在内层循环里连续写 **13 组手工交换代码**。

### 绝境二：删除空洞与错位塌陷（Deletion Hole Compression）
如果某门课程被教务处停开需要删除：
你不能简单地将 \`names[1] = null\`，因为这会在数组中间留下空洞，导致后续遍历中断。

你必须把索引 1 之后的所有元素向前平移一位。这意味着：**你必须在 13 个平行的数组中同时执行数组拷贝平移！**

只要任何一个数组平移时偏移量算错一位，从那一项开始，全校后续所有课程的数据将发生不可逆的错行。

### 绝境三：跨函数传递的参数地狱
当你想编写一个帮助函数来处理选课时，你的函数签名必须把所有的平行数组全部接过来：

\`\`\`java
public static boolean enrollCourse(int courseIndex, String[] names, int[] capacities, int[] enrolleds, String[] teachers, int[] credits) {
    // 冗长不堪且极易传错顺序的参数列表
    if (enrolleds[courseIndex] < capacities[courseIndex]) {
        enrolleds[courseIndex]++;
        return true;
    }
    return false;
}
\`\`\`

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

在 C 语言中，它被称为 \`struct\`；在现代 Java 中，我们可以使用只包含公开字段的数据载体类（或者现代 Java 16+ 的 \`record\`）：

\`\`\`java
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
\`\`\`

现在，见证结构化带来的巨大威力：

\`\`\`java
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
\`\`\`

### 为什么这次不会再错位？
因为在物理内存中，\`courses[0]\` 保存的是一个指向堆内存中完整 \`CourseRecord\` 实例的单一指针（引用）。

当我们交换 \`courses[0]\` 和 \`courses[1]\` 时，我们仅仅交换了两个指针的指向。
位于堆内存中的那个由 \`name\`、\`capacity\` 和 \`enrolled\` 紧密咬合在一起的内存块，**其内部结构毫发无损**。

你再也不可能在不小心的情况下，把《古希腊哲学史》的名字换走了，却把《计算机系统导论》的已选人数留在了原地。

\`\`\`mermaid
flowchart LR
    subgraph ArrayArea ["数组引用区 (一维线性指针)"]
        A0["courses[0]"]
        A1["courses[1]"]
    end

    subgraph HeapArea ["堆内存复合实体区 (牢不可破的整体)"]
        ObjA["CourseRecord 实例 A\n[name: '古希腊哲学史']\n[capacity: 30]\n[enrolled: 5]"]
        ObjB["CourseRecord 实例 B\n[name: '计算机系统导论']\n[capacity: 100]\n[enrolled: 95]"]
    end

    A0 --> ObjA
    A1 --> ObjB
\`\`\`

---

## 7. 横向场景验证：银行客户账户建模

我们再次用银行场景检验这个新概念：

如果用并行数组管理客户：
\`\`\`java
String[] clientNames = new String[] { "张三", "李四" };
String[] clientCardNos = new String[] { "62220201", "62220202" };
double[] clientBalances = new double[] { 50000.0, 120.0 };
String[] clientPasswordHashes = new String[] { "hash_abc", "hash_xyz" };
\`\`\`
只要某次删除操作中漏删了 \`clientPasswordHashes\`，李四就会瞬间继承张三的银行卡密码。

而一旦定义了复合结构：
\`\`\`java
public class BankAccountRecord {
    public String clientName;
    public String cardNo;
    public double balance;
    public String passwordHash;
}
\`\`\`
无论数据如何在队列、网络、缓存中穿梭，属于张三的密码和余额永远与其身份死死绑定在一起。

---

## 8. 概念与具体语言实现的边界

必须向读者严正指出：**“将数据结构化聚合”是计算机科学中独立于任何具体编程语言的普适思想。**

不同语言为了提供这种能力，采用了不同的语法设施和底层内存排布策略：

| 语言 | 语法设施 | 底层内存排布机制与特性 |
| :--- | :--- | :--- |
| **C 语言** | \`struct Course { ... };\` | 纯连续物理字节块，字段按字节对齐（Padding）紧凑排列，无任何额外运行时对象头开销。支持直接进行内存拷贝（\`memcpy\`）。 |
| **C++** | \`struct\` / \`class\` | 默认值语义，可在栈上直接分配连续结构体数组，具有极高的缓存命中率（Cache Locality）。 |
| **Java** | \`class CourseRecord\` | 引用语义。对象分配在堆上，带有 8~16 字节的对象头（Mark Word 与 Klass 指针）。数组内部存放的是引用的指针数组。 |
| **TypeScript** | \`interface Course { ... }\` | 纯编译期静态类型契约，在编译为 JavaScript 后被彻底擦除，运行时退化为普通的 V8 动态 Hash 字典/隐藏类对象。 |
| **Python** | \`@dataclass\` | 运行时通过类字典（\`__dict__\`）组织属性的动态结构载体。 |

> **关键认知**：
> 不要把 Java 的 \`new Class\` 当作结构化数据的唯一形式。面向对象只是这一思想在特定工程历史时期的延伸。

---

## 9. 边界与反例：纯数据结构依然没有解决什么？

在欢庆我们解决了数据错位问题的同时，我们必须保持工程师的清醒：

**把数据打包成 \`CourseRecord\`，真的能让我们高枕无忧吗？**

请看下面这段完全合法的代码：

\`\`\`java
public class BrokenInvariantWithStruct {
    public static void main(String[] args) {
        CourseRecord os = new CourseRecord("操作系统", 50, 50); // 已经满员

        // 在系统某个阴暗的角落，某个刚入职的实习生写下了这行代码：
        os.enrolled = -100; // 灾难：直接越权赋值为负数！

        // 另一个模块写下了：
        os.enrolled = 9999; // 灾难：直接突破容量上限！
    }
}
\`\`\`

由于 \`CourseRecord\` 内部的字段全部是公开裸露的（\`public\`），它本质上依然是一个**被动的、毫无防御能力的木桶**。

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
`
  },
  {
    id: "doc:hello-system-03-cohesion-and-objects",
    slug: "03-cohesion-and-objects",
    parentId: "'doc:hello-system-part-1'",
    title: "第03章 为什么数据和操作数据的代码应该靠近？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第03章 为什么数据和操作数据的代码应该靠近？

## 1. 现实危机：贫血数据结构的悲剧

在上一章的结尾，我们成功使用复合结构 \`CourseRecord\` 战胜了隐式关联与并行数组的错位噩梦：

\`\`\`java
public class CourseRecord {
    public String name;
    public int capacity;
    public int enrolled;
}
\`\`\`

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

按照过程式思维，开发者 A 编写了一个工具类 \`CourseManager\`：

\`\`\`java
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
\`\`\`

这看起来非常干净。

然而，一周之后，负责退课功能的开发者 B 在另一个文件 \`StudentActionService.java\` 里写下了退课代码：

\`\`\`java
public class StudentActionService {
    public static void dropCourse(CourseRecord course) {
        // 开发者 B 以为退课只是简单减 1，完全忘记了检查 enrolled 是否已经为 0！
        course.enrolled--; 
    }
}
\`\`\`

如果某位调皮的学生在已经退选的情况下，通过抓包工具连续重放 5 次退课请求：
\`course.enrolled\` 将直接被扣减成 **-5**！一门容量为 50 人的课程，已选人数变成了负数，系统的不变量被彻底击碎。

更具毁灭性的是开发者 C。他在编写管理员后台批量导入功能时，觉得调用 \`CourseManager.enrollStudent\` 每次只能加 1 太麻烦。他在自己的 \`AdminImportTask.java\` 里直接写下了：

\`\`\`java
public class AdminImportTask {
    public static void importStudents(CourseRecord course, int count) {
        // 开发者 C 甚至根本没有检查容量上限，直接暴力加法！
        course.enrolled += count;
        System.out.println("管理员批量导入成功，当前人数: " + course.enrolled);
    }
}
\`\`\`

如果管理员一次性导入了 80 名学生到一间只能坐 50 人的教室，\`course.enrolled\` 瞬间暴涨至 80。

现在，请停下来审视我们的系统：

\`\`\`mermaid
flowchart TD
    subgraph FragmentedWorld ["过程式代码下的数据失控悲剧"]
        direction LR
        subgraph LogicSpace ["散落全系统的业务代码"]
            A["开发者 A: enrollStudent()\n有容量上限检查"]
            B["开发者 B: dropCourse()\n漏掉了下限检查 (产生负数)"]
            C["开发者 C: importStudents()\n直接暴力加法 (产生超卖)"]
            D["恶意代码 / 脚本\n直接 os.enrolled = 99999"]
        end

        subgraph PassiveData ["裸露的木桶 (CourseRecord)"]
            Target["course.enrolled 字段\n(public 谁都能改)"]
        end

        A -->|修改| Target
        B -->|修改| Target
        C -->|修改| Target
        D -->|修改| Target
    end
\`\`\`

关于 \`CourseRecord.enrolled\` 这个变量的状态流转规则，**已经分裂成了 3 份各自为政的代码**。

如果明天教务处要求“选课名额必须预留 10%”，你不仅要修改开发者 A 的代码，你还必须像侦探一样，全盘搜索整个项目的每一个角落，找出所有直接伸手去摸 \`course.enrolled\` 字段的代码行！

只要漏掉一个，系统的数据完整性就宣告破产。

---

## 3. 为什么靠“程序员的道德自律”无法拯救系统？

很多崇尚过程式编程的初学者常说：
> “这只是开发者 B 和 C 的水平不行、粗心大意。我们只要在团队开发规范里写明：‘所有人必须统一调用 CourseManager’，不就能解决了吗？”

软件工程六十年的历史给出的残酷答复是：**凡是依赖人类自律来保证的系统安全，最终必定以崩溃收场。**

因为：
1. **认知不可知**：新加入团队的成员根本不可能在一万个函数里准确知道哪一个是“合法修改途径”；
2. **物理通路未被切断**：只要 \`course.enrolled\` 字段在语法上依然是公开的（\`public\`），只要外部代码在物理上依然能够写出 \`course.enrolled = ...\`，在工期压力和偷懒心理的驱使下，绕过规范的后门就一定会层出不穷。

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

\`\`\`mermaid
flowchart LR
    subgraph LowCohesion ["低内聚高耦合 (过程式分离)"]
        F1["函数 A"] -->|直接读写| Struct["裸露数据结构"]
        F2["函数 B"] -->|直接读写| Struct
        F3["函数 C"] -->|直接读写| Struct
    end

    subgraph HighCohesion ["高内聚低耦合 (面向对象合体)"]
        CallerA["外部调用者 A"] -->|发送意图 enroll()| Object["自治对象\n[ 内部私有状态 + 守卫方法 ]"]
        CallerB["外部调用者 B"] -->|发送意图 drop()| Object
    end
\`\`\`

---

## 5. 新概念诞生：面向对象与“自治状态机”

面向对象程序设计（Object-Oriented Programming, OOP）之所以在 20 世纪 80 年代席卷整个软件工业界，从来不是因为它可以用来模拟动物园里的猫和狗。

它是为了解决一个极其血腥的工程灾难：**防止被动的数据结构在大型软件系统中被随意践踏。**

我们现在把 \`CourseRecord\` 升级为一个真正拥有自我意识的“自治实体”：

\`\`\`java
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
\`\`\`

---

## 6. 验证实验：坚不可摧的防线

现在，让我们再次模拟开发者 B、开发者 C 以及外部恶意调用的场景，看看新代码展现出的防御力：

\`\`\`java
public class ObjectDefenseExperiment {
    public static void main(String[] args) {
        // 创建一门只有 2 个名额的课程
        Course course = new Course("高阶计算机图形学", 2);

        System.out.println("=== 1. 尝试正常选课 ===");
        System.out.println("第 1 次选课: " + course.enroll() + ", 当前已选: " + course.getEnrolled());
        System.out.println("第 2 次选课: " + course.enroll() + ", 当前已选: " + course.getEnrolled());

        System.out.println("\n=== 2. 尝试超额选课 (模拟开发者 C 的超卖) ===");
        boolean result3 = course.enroll();
        System.out.println("第 3 次选课结果: " + result3 + ", 当前已选: " + course.getEnrolled());

        System.out.println("\n=== 3. 尝试恶意连续退课 (模拟开发者 B 的下限穿透) ===");
        course.drop(); // 2 -> 1
        course.drop(); // 1 -> 0
        boolean dropResult3 = course.drop(); // 尝试扣减成负数
        System.out.println("在已选为 0 时再次退课: " + dropResult3 + ", 当前已选: " + course.getEnrolled());
    }
}
\`\`\`

### 运行输出结果：
\`\`\`text
=== 1. 尝试正常选课 ===
第 1 次选课: true, 当前已选: 1
第 2 次选课: true, 当前已选: 2

=== 2. 尝试超额选课 (模拟开发者 C 的超卖) ===
第 3 次选课结果: false, 当前已选: 2

=== 3. 尝试恶意连续退课 (模拟开发者 B 的下限穿透) ===
在已选为 0 时再次退课: false, 当前已选: 0
\`\`\`

### 关键结论：
无论外部的调用者写得多么粗心，无论团队扩张到 100 人还是 1000 人：
- **没有任何人**能够将 \`enrolled\` 改成负数；
- **没有任何人**能够直接跳过容量检查让已选人数突破上限。

因为修改数据的物理通路，在全宇宙中**只有 \`enroll()\` 和 \`drop()\` 这两条受法律保护的狭窄通道**。

---

## 7. 横向场景验证：银行账户与透支防御

我们再次将该模型迁移到银行账户体系：

\`\`\`java
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
\`\`\`
如果外部世界想扣钱，必须调用 \`withdraw()\`。银行账户自身捍卫了 $balance \\ge 0$ 的神圣不变量。

---

## 8. 概念与语言实现的边界：OOP 不是唯一解

必须向读者坦诚说明：**“将数据与操作数据的代码锁在一起”并不等同于“面向对象”。**

在计算机科学的发展史上，不同的范式提出了不同的实现方案：

1. **过程式语言中的不透明指针（Opaque Pointer）**：在 C 语言中，通过在头文件中隐藏结构体定义，只暴露 \`void* \` 句柄和操作函数（如 \`FILE* fopen()\` / \`fread()\`），实现了相同级别的数据防护。
2. **函数式编程（Functional Programming）**：函数式范式拒绝可变状态。它通过**不可变数据结构（Immutable Data）**与纯函数转换：$State_{new} = f(State_{old}, Action)$，从根本上消除了“状态被非法篡改”的物理可能性。
3. **闭包（Closures）**：在 JavaScript / Scheme 中，通过函数作用域内的局部变量与返回的闭包函数，也可以实现完美的状态私有化与行为绑定。

本书之所以选择面向对象（OOP）作为主要推导路线，是因为在当前企业级大型 Web 系统的主流基础设施中，基于类与对象的组织模型依然是最通用、最易于与关系数据库及分层架构对齐的工程载体。

---

## 9. 本章心智模型复盘与下一章起点

> **此时，你脑中的模型应该变成：**
> 1. **数据与逻辑分离（贫血模型）是脆弱的**：裸露的公开字段使得状态流转规则四分五裂；
> 2. **对象是一个自治的状态机**：它一手紧紧攥着自己的私有数据，一手拿着严格的守卫手册；
> 3. **方法是状态跃迁的唯一大门**。

然而，我们刚才在代码里写下了 \`class Course\`，又用 \`new Course(...)\` 创建了实例。

在计算机物理内存中，“类”和“对象”到底是如何分别存储的？执行 \`course.enroll()\` 时底层究竟是如何寻址的？

下一章，我们将撕开浮于表面的通俗隐喻，直击**第04章《类不是“对象的模板”这么简单》**。
`
  },
  {
    id: "doc:hello-system-04-class-and-object-mental-model",
    slug: "04-class-and-object-mental-model",
    parentId: "'doc:hello-system-part-1'",
    title: "第04章 类不是“对象的模板”这么简单",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 4,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第04章 类不是“对象的模板”这么简单

## 1. 传统通俗隐喻的破产与认知陷阱

几乎所有初学者在刚刚接触面向对象程序设计时，都会在教科书上读到以下两个极其著名的类比：

> “类（Class）是盖房子的蓝图图纸，对象（Object）是根据图纸施工盖出来的真实房子。”  
> “类是做月饼的金属模具，对象是用模具印出来的具体月饼。”

这两个隐喻在第一天向没有任何编程经验的门外汉解释“抽象与具象”时，确实能够起到某种通俗的启发作用。

然而，当你的学习目标是理解一个真实、精密、高并发的现代软件系统时，**这两个隐喻会迅速退化为毒害你底层心智模型的巨大障碍。**

因为它们在物理事实上是完全错误的：

1. **图纸盖完房子后可以烧掉，但“类”在运行时始终永恒占据着内存**：你从没见过房子的墙壁里死死嵌着一张图纸，但在计算机内存中，**每一个对象实例的头部都必须有一个物理指针，永远指向常驻内存的类元数据**。
2. **月饼模具不会替月饼承受咀嚼，但“类”掌握着全部的方法机器指令**：当你调用 \`c1.enroll()\` 时，对象 \`c1\` 内部根本没有一行关于选课的代码，**真正执行计算的机器指令全部存放在只属于“类”的代码段中**！

如果我们不撕碎这些轻佻的隐喻，我们就永远无法理解什么是“虚方法表”、什么是“内存泄漏”、什么是“反射”，更无法理解为什么一个微小的类定义会对整个系统的内存布局产生深远的影响。

现在，让我们戴上虚拟内存的透视镜，看一看当我们在代码中写下 \`new\` 时，物理世界到底发生了什么。

---

## 2. 真实物理世界的内存全景布局

假设我们在程序中创建了两门不同的课程：

\`\`\`java
Course c1 = new Course("计算机系统导论", 100);
Course c2 = new Course("离散数学基础", 60);

c1.enroll();
c2.enroll();
\`\`\`

许多初学者脑海中想象的图景是：内存里完整复制了两个独立的庞大结构，每个结构里面既有一份变量，又复制了一份完整的 \`enroll()\` 和 \`drop()\` 代码。

这在工程上是不可接受的荒谬设计。如果一个类有 200 个复杂方法（占用 100KB 机器指令），系统实例化了 10 万个对象，如果每个对象都复制一份方法代码，系统将瞬间白白烧毁 10GB 的内存！

真实的物理内存布局如下图所示：

\`\`\`mermaid
flowchart LR
    subgraph MetaSpace ["元空间 / 代码段 (Metaspace / Code Segment)"]
        Klass["Course 类元信息 (Klass 结构体)\n----------------------------------\n- 类型标识: com.campus.Course\n- 字段描述表: name(offset 16), capacity(offset 24), enrolled(offset 28)\n- 虚方法表 (vtable):\n  [Slot 0] enroll() 指令入口 -> 0x0040A100\n  [Slot 1] drop() 指令入口   -> 0x0040A200\n  [Slot 2] getName() 指令入口 -> 0x0040A300\n----------------------------------\n(全进程中只有唯一一份物理内存副本)"]
    end

    subgraph ThreadStack ["当前线程执行栈 (Thread Stack)"]
        Frame["main() 函数栈帧\n-------------------------\n局部变量 c1: 存放指针 0x700010\n局部变量 c2: 存放指针 0x700030"]
    end

    subgraph HeapArea ["堆内存空间 (Heap Space)"]
        Obj1["c1 实例 (起始地址: 0x700010)\n----------------------------------------\n[对象头 Mark Word: 8 字节锁/GC状态]\n[对象头 Klass Pointer: 8 字节 -> 指向 Klass]\n[字段 name 引用: 8 字节 -> 指向 '计算机系统导论']\n[字段 capacity: 4 字节整数 100]\n[字段 enrolled: 4 字节整数 1]\n----------------------------------------\n(总物理大小: 仅 32 字节)"]
        
        Obj2["c2 实例 (起始地址: 0x700030)\n----------------------------------------\n[对象头 Mark Word: 8 字节锁/GC状态]\n[对象头 Klass Pointer: 8 字节 -> 指向 Klass]\n[字段 name 引用: 8 字节 -> 指向 '离散数学基础']\n[字段 capacity: 4 字节整数 60]\n[字段 enrolled: 4 字节整数 1]\n----------------------------------------\n(总物理大小: 仅 32 字节)"]
    end

    Frame -->|引用指针 0x700010| Obj1
    Frame -->|引用指针 0x700030| Obj2
    Obj1 -.->|对象头 Klass 指针| Klass
    Obj2 -.->|对象头 Klass 指针| Klass
\`\`\`

### 深度解构物理细节：
1. **类（Klass 元数据）存放在只读/共享区**：当 JVM 或操作系统加载程序时，它解析字节码/可执行文件，在共享的元数据区生成一份唯一的类结构体。这里记录了类的名字、字段偏移量、以及**方法的全部机器指令**。无论你 \`new\` 1 个对象还是 100 万个对象，**方法的机器代码全系统永远只有一份**。
2. **对象（Object 实例）在堆上只存纯数据**：在堆中分配的每个对象，本质上只是一块极其紧凑的字节切片（在 64 位系统上通常只有 32~48 字节）。它内部只包含：
   - **对象头（Object Header）**：记录垃圾回收年龄、偏向锁标记，以及一个**指向元空间类信息的指针**；
   - **实例字段的物理数据**：\`capacity\` 的 4 字节整数、\`enrolled\` 的 4 字节整数、以及指向字符串的 8 字节引用指针。
3. **栈上的局部变量只是一个遥控器**：\`c1\` 自身占用的内存仅仅是 8 个字节的指针地址，它只是静静记录着堆中对象的起始内存编号（\`0x700010\`）。

---

## 3. 深入机制：\`c1.enroll()\` 底层究竟是如何执行的？

既然堆内存中的对象 \`c1\` 内部根本没有一行指令，那么当 CPU 执行到 \`c1.enroll()\` 时，计算机底层到底是如何精准修改 \`c1\` 内部的数据的？

在底层（无论是 C++ 编译生成的 x86-64 汇编，还是 Java 虚拟机的 \`invokevirtual\` 字节码指令），面向对象的方法调用语法：

\`\`\`java
c1.enroll();
\`\`\`

在语义和机器级执行上，都被无情地还原为了一个极其纯粹的、带有隐藏参数的全局过程调用：

$$\\text{Course\\_enroll}(\\&c1)$$

编译器在幕后默默完成了一项至关重要的转换：

**它将调用者对象的内存地址 \`0x700010\`（即引用变量 \`c1\`），作为第一个隐藏参数塞进了传参寄存器中！**

在面向对象方法内部，这个隐藏参数的名字就叫做：**\`this\`**（在 Python 中被显式写为 \`self\`，在 C++ / Java 中被隐式保留）。

\`\`\`text
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
\`\`\`

看！所有的神秘感在这一刻彻底烟消云散：
方法之所以能够精准修改 \`c1\` 的已选人数而不是 \`c2\` 的已选人数，**完全是因为方法在执行时，寄存器里保存着 \`c1\` 的物理内存地址。**

---

## 4. 最小实验：证明 \`this\` 就是一个普通指针

让我们设计一个最小可运行实验，通过打印对象的内存身份特征，亲眼证实多对象共享同一套代码、全凭 \`this\` 寻址的真相：

\`\`\`java
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
\`\`\`

### 运行输出结果：
\`\`\`text
外部引用的物理 Hash objA = 1808253012
外部引用的物理 Hash objB = 589431969
--------------------------------------------------
方法正在执行！当前隐式参数 this 指向的物理实例 Hash: 1808253012, 读取到的实例名称: [课程 A], 数值: 100
方法正在执行！当前隐式参数 this 指向的物理实例 Hash: 589431969, 读取到的实例名称: [课程 B], 数值: 200
\`\`\`

---

## 5. 横向场景与语言对照：Python、C++ 与 C 的诚实性

不同编程语言在暴露底层这一机制时采取了不同的语法策略：

### Python 的坦荡
在 Python 中，定义方法时必须显式写出 \`self\` 作为第一个参数：
\`\`\`python
class Course:
    def __init__(self, name):
        self.name = name

    def enroll(self): # 必须显式声明 self！
        print(f"当前操作的实例地址: {id(self)}")
\`\`\`
很多从 Java 转过来的初学者觉得 Python 很啰嗦：“为什么调用时写 \`c.enroll()\` 不需要传参，定义时却非要写一个 \`self\`？”  
现在你看懂了底层机制就会明白：**Python 是诚实的，它直接把底层寄存器传参的物理真相暴露在了语法表面；而 Java 和 C++ 选择用 \`this\` 关键字把这个传参过程隐藏了起来。**

### C 语言的面向对象模拟
在纯 C 语言中，Linux 内核以及大量经典开源项目就是通过完全显式的结构体指针传参来实现面向对象的：
\`\`\`c
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
\`\`\`

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
> 3. **面向对象的方法调用**，本质上是：**“寻找到类中的指令，将对象的内存地址塞入 \`this\` 指针寄存器，对该对象进行定向内存手术。”**

现在，我们彻底看清了对象的物理本质：它不过是堆内存上一块包含若干字段的连续字节。

那么，一个极其严峻的问题浮出水面：

既然对象只是一块脆弱的内存，我们凭什么保证其他代码不会绕过 \`enroll()\` 方法，直接拿着指针去篡改这块内存里的字节？
语言究竟是如何在编译器和运行时层面，为对象建立起绝对防御的？

下一章，我们将正式进入面向对象的第一大支柱：**第05章《对象为什么应该保护自己的状态？》**。
`
  },
  {
    id: "doc:hello-system-05-encapsulation-and-invariants",
    slug: "05-encapsulation-and-invariants",
    parentId: "'doc:hello-system-part-1'",
    title: "第05章 对象为什么应该保护自己的状态？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第05章 对象为什么应该保护自己的状态？

## 1. 所谓“封装”，绝不是把字段改成 private 然后无脑生成 Getter/Setter

在几乎所有的初级面向对象教学中，最常见也最具误导性的教学套路是：
1. 告诉学生面向对象第一大特性是“封装”；
2. 然后展示一段把属性全改成 \`private\`，紧接着通过 IDE 一键生成全套 \`getXXX()\` 和 \`setXXX()\` 的模板代码。

请仔细审视下面这个反面教材：

\`\`\`java
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
\`\`\`

请问：这和把字段全部写成 \`public\` 有任何物理区别吗？

**毫无区别。**

外部调用者依然可以写出 \`course.setEnrolled(-50)\`，依然可以写出 \`course.setEnrolled(course.getCapacity() + 9999)\`。

这种无脑暴露 Setter 的做法，不仅没有起到任何保护作用，反而平白增加了调用者的击键次数，并在团队中营造出一种“我们已经规范封装了”的虚假安全感。

---

## 2. 核心概念：不变量（Invariant）

真正的封装，不是为了对程序员保密，而是为了在运行时死死捍卫一个核心概念：**不变量（Invariant）**。

#### 形式化定义：
> **不变量**是指在对象的整个生命周期中，无论经历了何种合法的外部方法调用，都**必须在任何可观察时刻恒为真（True）的业务谓词条件**。

在 Mini Campus 的 \`Course\` 实体中，存在三个绝对不可动摇的不变量：

$$\\text{Invariant 1: } \\text{capacity} > 0$$

$$\\text{Invariant 2: } 0 \\le \\text{enrolled} \\le \\text{capacity}$$

$$\\text{Invariant 3: } \\text{name} \\ne \\text{null} \\land \\text{length}(\\text{trim}(\\text{name})) > 0$$

如果在系统运行的某一瞬间，堆内存中的某个 \`Course\` 实例的 \`enrolled\` 变成了 -1 或者突破了 \`capacity\`，那么在系统模型中，该对象就进入了**“损坏状态（Corrupted State）”**。

损坏状态就像核辐射，会迅速沿着调用链路污染下游的成绩统计、排课算法与财务结算系统，引发全局性雪崩。

\`\`\`mermaid
stateDiagram-v2
    [*] --> 合法初始状态: new Course("CS-101", 100)\n满足 0 <= 0 <= 100
    
    合法初始状态 --> 选课后合法状态: enroll()\nenrolled 从 0 跃迁到 1\n依然满足 0 <= 1 <= 100
    选课后合法状态 --> 退课后合法状态: drop()\nenrolled 从 1 跃迁到 0\n依然满足 0 <= 0 <= 100
    
    选课后合法状态 --> 拒绝跃迁_保持原状: enroll() 当已满员\n条件不满足, 拦截并拒绝
    
    合法初始状态 --> 状态崩溃_死锁或非法: 外部调用 setEnrolled(-5)\n不变量被击碎!
\`\`\`

---

## 3. 双重防线：出生守卫与状态跃迁守卫

为了保证不变量在任何时候都坚不可摧，对象必须建立起两道铁门：

### 第一道防线：出生时的合法性守卫（Constructor Validation）
对象绝不能以非法状态在堆内存中诞生。如果有人传入 \`capacity = -10\` 或 \`name = null\`，构造函数必须直接抛出异常，在源头拒绝畸形对象的生成：

\`\`\`java
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
\`\`\`

### 第二道防线：生命周期中的状态跃迁守卫（State Transition Methods）
彻底消灭无脑的 \`setEnrolled()\`。外部世界只被允许请求具有明确业务语义的“动作”，而动作内部负责校验不变量：

\`\`\`java
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
\`\`\`

---

## 4. 破坏性实验：不变量防御实战

\`\`\`java
public class InvariantAttackExperiment {
    public static void main(String[] args) {
        System.out.println("=== 实验 1: 尝试制造非法出生的畸形对象 ===");
        try {
            Course badCourse = new Course("非法课程", -10);
        } catch (IllegalArgumentException e) {
            System.out.println("成功拦截畸形对象创建: " + e.getMessage());
        }

        System.out.println("\n=== 实验 2: 尝试对合法对象进行超额跃迁攻击 ===");
        Course tinyCourse = new Course("迷你讨论班", 1);
        System.out.println("第 1 次选课: " + tinyCourse.enroll()); // true
        System.out.println("第 2 次选课: " + tinyCourse.enroll()); // false, 被拦截

        System.out.println("最终内部状态已选人数: " + tinyCourse.getEnrolled() + "/" + tinyCourse.getCapacity());
    }
}
\`\`\`

---

## 5. 本章心智模型复盘

> **此时，你脑中的模型应该变成：**
> 1. 封装不是写 Getter 和 Setter，封装是**对不变量的绝对武装捍卫**；
> 2. \`private\` 是保险箱的锁，业务方法是保险箱的武装守卫；
> 3. 对象一旦出生，它的内部状态在任何微秒都必须满足业务完整性。
`
  },
  {
    id: "doc:hello-system-06-lifecycle-and-references",
    slug: "06-lifecycle-and-references",
    parentId: "'doc:hello-system-part-1'",
    title: "第06章 一个对象是怎样出生和死亡的？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 6,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第06章 一个对象是怎样出生和死亡的？

## 1. 生存的舞台：栈帧的剧烈伸缩与堆的平静大陆

要理解对象的完整生命周期，必须在脑海中建立现代计算机运行时的两块核心内存空间：

\`\`\`mermaid
flowchart TD
    subgraph Memory ["进程虚拟地址空间"]
        direction LR
        subgraph StackArea ["栈区 (Stack Frame)"]
            Frame1["main() 栈帧\n局部变量 c1 (指针)"]
            Frame2["doEnroll() 栈帧\n局部变量 courseRef, studentId"]
        end

        subgraph HeapArea ["堆区 (Heap Space)"]
            ObjA["Course 实例 0x5001\n['计算机系统导论', cap: 100, enr: 1]"]
            ObjB["Student 实例 0x6001\n['李雷', id: 1001]"]
        end
    end

    Frame1 -->|持有引用 0x5001| ObjA
    Frame2 -->|持有引用 0x5001| ObjA
    Frame2 -->|持有引用 0x6001| ObjB
\`\`\`

- **栈（Stack）**：与线程执行绑定。每进入一个函数，系统就在栈顶压入一个**栈帧（Stack Frame）**；函数执行完毕返回，栈帧瞬间弹出销毁。它的分配和释放极快（仅需调整栈指针寄存器 ESP/RSP），但寿命受限于作用域。
- **堆（Heap）**：全进程共享的动态内存池。通过 \`new\` 分配的对象都安居在堆中。它们的寿命与创建它们的作用域无关，只要全系统中还有任何一个活着的“遥控器”指向它们，它们就会一直活着。

---

## 2. 诞生全流程：当 \`new\` 执行时

执行 \`Course c = new Course("操作系统", 100);\` 的底层完整物理步长：
1. **计算内存字节尺寸**：JVM 解析 \`Course\` 类元数据，计算出实例所需的准确字节数（对象头 16 字节 + 引用 8 字节 + 整型 8 字节 + 对齐填充 = 32 字节）；
2. **堆空间分配与零值初始化**：在堆中划出 32 字节连续空间，将所有比特位置零（字段瞬间拥有默认初始值 \`null\`, \`0\`）；
3. **写入对象头元数据**：将对象头部的 Klass Pointer 指向元空间的 \`Course\` 类元数据；
4. **执行构造函数**：传入参数执行校验与赋值，不变量正式确立；
5. **返回地址并绑定引用**：将堆内存首地址（\`0x5001\`）赋值给栈上的局部变量 \`c\`。

---

## 3. 羁绊与死亡：可达性分析（Reachability Analysis）

在带垃圾回收的现代语言（Java/Go/JS/Python）中，对象的死亡是由**可达性分析算法**裁决的。

系统从一组绝对可信的活起点——**GC Roots** 出发（包括活跃线程栈帧中的局部变量、全局静态变量、JNI 句柄），沿着引用连线向下深度优先搜索：
- **可达（Reachable）**：能从 GC Roots 顺着引用链触达的对象，判定为“存活”；
- **不可达（Unreachable）**：从所有 GC Roots 均无法寻找到的对象，判定为“死亡”，沦为内存垃圾。

\`\`\`mermaid
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
\`\`\`

注意上图中的 \`O2\` 和 \`O3\`：即使它们彼此紧紧互相引用，但由于从 GC Roots 已经无法触达它们，垃圾回收器会毫不犹豫地将它们占用的堆内存回收。

---

## 4. 本章心智模型复盘

> **此时，你脑中的模型应该变成：**
> 1. **变量是遥控器，对象是电视机**：复制变量只是多了一个遥控器，电视机依然只有一个；
> 2. **引线全断即死亡**：只要所有指向堆内存的引用线断裂，对象在逻辑上就已进入坟墓。
`
  },
  {
    id: "doc:hello-system-07-object-collaboration",
    slug: "07-object-collaboration",
    parentId: "'doc:hello-system-part-1'",
    title: "第07章 程序里的对象怎样彼此认识？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 7,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第07章 程序里的对象怎样彼此认识？

## 1. 对象社会的两大基石：拥有（has-a）与使用（uses-a）

初学者在学完类之后，往往急于寻找“高级特性”，一头扎进继承的泥潭。

然而在工业级软件设计中，$90\\%$ 以上的对象协作关系根本不是继承，而是两类最质朴的关联：

1. **关联/组合（Composition / Aggregation）——“拥有（has-a）”**
2. **依赖（Dependency）——“使用（uses-a）”**

\`\`\`mermaid
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
\`\`\`

---

## 2. Mini Campus 中的学生实体协作实战

\`\`\`java
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
\`\`\`

---

## 3. 协作实验：职责划分的优雅性

\`\`\`java
public class CollaborationExperiment {
    public static void main(String[] args) {
        Course aiCourse = new Course("人工智能导论", 1);
        Student leilei = new Student(1001, "李雷");
        Student meimei = new Student(1002, "韩梅梅");

        System.out.println("=== 第一轮：李雷选课 ===");
        leilei.enrollCourse(aiCourse);

        System.out.println("\n=== 第二轮：李雷尝试重复选课 ===");
        leilei.enrollCourse(aiCourse);

        System.out.println("\n=== 第三轮：韩梅梅争抢名额 ===");
        meimei.enrollCourse(aiCourse);
    }
}
\`\`\`

### 运行输出结果：
\`\`\`text
=== 第一轮：李雷选课 ===
李雷 成功选修课程: 人工智能导论

=== 第二轮：李雷尝试重复选课 ===
李雷 已经选过 人工智能导论，不可重复选择！

=== 第三轮：韩梅梅争抢名额 ===
韩梅梅 选课失败，课程名额已满: 人工智能导论
\`\`\`

### 深度复盘：
- **防重复选课**的规则由 \`Student\` 负责（因为只有学生知道自己的选课历史）；
- **防超卖**的规则由 \`Course\` 负责（因为只有课程知道自己的剩余名额）；
- 两者没有越权，通过传递参数与持有引用，极其优雅地完成了业务闭环。
`
  },
  {
    id: "doc:hello-system-08-when-inheritance-is-valid",
    slug: "08-when-inheritance-is-valid",
    parentId: "'doc:hello-system-part-1'",
    title: "第08章 什么时候继承是合理的？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 8,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第08章 什么时候继承是合理的？

## 1. 继承的诱惑与灾难：为了复用代码而继承

继承（\`extends\`）是面向对象中最容易被滥用的武器。初学者滥用继承往往源于一个简单的动机：“我想少写几行代码，我想直接复用父类的字段。”

让我们看一个经典的错误继承反例：

教务处提出新需求：“系统中需要加入‘教室（Classroom）’的概念。教室有容纳人数（capacity），也需要记录当前坐了多少人（enrolled）。”

某位程序员看到了写好的 \`Course\` 类，心想：“太巧了！\`Course\` 里面刚好有 \`capacity\`、\`enrolled\` 和 \`enroll()\`，我直接继承它！”

\`\`\`java
// 灾难：教室继承了课程！
public class Classroom extends Course {
    private String buildingName;

    public Classroom(String buildingName, String roomNo, int capacity) {
        super(roomNo, capacity);
        this.buildingName = buildingName;
    }
}
\`\`\`

这导致了系统在概念上严重精神分裂：外部代码可以合法写出：
\`\`\`java
student.enrollCourse(new Classroom("第一教学楼", "101", 50));
\`\`\`
**“学生成功选修了一间教室”！**

\`\`\`mermaid
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
\`\`\`

---

## 2. 继承的唯一合法准则：严格的 is-a

> **只有当子类在逻辑、行为和契约上无条件属于父类的一种（is-a），且子类能够透明替换父类出现的任何场合时，继承才是合法的。**

在 Mini Campus 中，**实验课（LabCourse）** 是一种合理的继承：
- 实验课就是一种课程（LabCourse is-a Course）；
- 实验课在普通课程的基础上，额外增加了助教（Tutor）和实验机时（Lab Hours）。

\`\`\`java
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
\`\`\`

---

## 3. 组合优于继承（Composition Over Inheritance）

现代软件工程普遍遵循：**优先使用组合，谨慎使用继承。**

因为继承是**白盒复用**。父类内部的任何细微实现变动，都会像地震波一样向下传导给所有子类，打破子类的封装性。

面对类似功能，先问自己：“能否作为属性组合进来（has-a）？”如果能，坚决放弃继承。
`
  },
  {
    id: "doc:hello-system-09-polymorphism-and-dynamic-dispatch",
    slug: "09-polymorphism-and-dynamic-dispatch",
    parentId: "'doc:hello-system-part-1'",
    title: "第09章 为什么同一句代码能够产生不同的行为？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 9,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第09章 为什么同一句代码能够产生不同的行为？

## 1. 场景：不同类型课程的凭证打印

教务处要求：当学生选课成功后，系统需要针对不同课程打印不同的选课凭证：
1. **讲授课（Lecture）**：打印“请按时前往指定大教室听课”；
2. **实验课（LabCourse）**：打印“请联系助教【XXX】”；
3. **网课（OnlineCourse）**：打印“请登录平台【URL】在线学习”。

不理解多态的程序员会写出脆弱的类型分支判断：

\`\`\`java
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
\`\`\`

每当学校增加一种新课程，全系统所有写了 \`instanceof\` 的地方都必须被翻出来修改一遍。

---

## 2. 多态破局：动态分派（Dynamic Dispatch）

多态的核心思想是：**调用者只负责发出意图，具体怎么做，由接收消息的对象自己决定。**

\`\`\`java
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
\`\`\`

现在，调用者的代码变成了极其优雅的一行：

\`\`\`java
public static void notifyStudent(Course course) {
    course.printInstruction(); // 同一行代码，根据传入的实际对象自动执行不同逻辑！
}
\`\`\`

---

## 3. 底层机制：虚方法表（Virtual Method Table / vtable）

CPU 执行 \`course.printInstruction()\` 时是如何寻址的？

\`\`\`mermaid
flowchart LR
    subgraph HeapObjects ["堆上的具体对象"]
        ObjA["LabCourse 实例\n[对象头] -> 指向 Klass_LabCourse"]
        ObjB["OnlineCourse 实例\n[对象头] -> 指向 Klass_OnlineCourse"]
    end

    subgraph KlassArea ["元空间类元信息中的虚方法表 (vtable)"]
        VT_Lab["Klass_LabCourse 的 vtable\n[Slot 1] printInstruction() -> 0x3050 (Lab 实现)"]
        VT_Online["Klass_OnlineCourse 的 vtable\n[Slot 1] printInstruction() -> 0x4080 (Online 实现)"]
    end

    ObjA -.-> VT_Lab
    ObjB -.-> VT_Online
\`\`\`

1. 从引用中获取对象堆内存地址；
2. 读取对象头部的类型指针，找到具体类的虚方法表（vtable）；
3. 在虚方法表固定槽位读取函数指针，CPU 跳转执行。
`
  },
  {
    id: "doc:hello-system-10-interfaces-and-dependency-inversion",
    slug: "10-interfaces-and-dependency-inversion",
    parentId: "'doc:hello-system-part-1'",
    title: "第10章 接口真正隔开的是什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 10,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第10章 接口真正隔开的是什么？

## 1. 现实痛点：硬编码外部依赖

当选课成功时，系统需要发送即时通知。如果我们直接硬编码短信服务：

\`\`\`java
public class EnrollmentCoordinator {
    private AliyunSmsSender smsSender = new AliyunSmsSender(); // 致命硬编码紧耦合
}
\`\`\`

当学校决定换用腾讯短信、邮件通知，或者在单元测试中不想产生真实短信费用时，核心选课代码被迫全盘推倒重写。

---

## 2. 接口是一份法律契约

接口（Interface）只规定“做什么（What）”，绝不规定“怎么做（How）”。

\`\`\`mermaid
flowchart TD
    subgraph Decoupled ["通过接口隔开 (依赖倒置 DIP)"]
        Core["核心选课业务 (EnrollmentCoordinator)"] -->|只依赖协议契约| Interface["NotificationSender 接口"]
        SMS1["AliyunSmsSender"] -.->|实现| Interface
        SMS2["EmailNotificationSender"] -.->|实现| Interface
        SMS3["MockTestSender (测试桩)"] -.->|实现| Interface
    end
\`\`\`

\`\`\`java
public interface NotificationSender {
    void sendNotification(String target, String content);
}
\`\`\`

---

## 3. 依赖注入（Dependency Injection）实战

\`\`\`java
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
\`\`\`
`
  },
  {
    id: "doc:hello-system-11-break-god-class",
    slug: "11-break-god-class",
    parentId: "'doc:hello-system-part-1'",
    title: "第11章 为什么一个类最终又会变成几十个类？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 11,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第11章 为什么一个类最终又会变成几十个类？

## 1. 上帝类（God Class）的膨胀与危害

当一个 5000 行的 \`CampusManager\` 既懂网络参数解析，又管 SQL 拼装，既管选课规则，又管发短信和生成 HTML 时：
- **合并冲突地狱**：全团队每天都在改同一个文件；
- **牵一发而动全身**：改了导出格式，意外搞崩了选课 SQL；
- **无法编写单测**：想测业务规则必须把真实数据库和短信网关全部配齐。

\`\`\`mermaid
flowchart TD
    God["CampusManager (上帝类)\n承担全宇宙所有的责任"]
    
    R1["修改 SQL 查询方式"] -->|被迫修改| God
    R2["修改选课防冲突规则"] -->|被迫修改| God
    R3["修改短信服务商"] -->|被迫修改| God
    R4["修改网页 UI 模板"] -->|被迫修改| God
\`\`\`

---

## 2. 单一职责原则（SRP）：按变化维度解构

> **一个模块应该有且仅有一个引起它变化的原因。**

我们将上帝类解构为各司其职的自治专家：

\`\`\`mermaid
flowchart LR
    Ctrl["CourseController\n负责请求接收与格式转换"] --> Svc["EnrollmentService\n负责核心业务规则编排"]
    Svc --> Repo["CourseRepository\n负责数据持久化存取"]
    Svc --> Notify["NotificationService\n负责消息发送"]
\`\`\`
`
  },
  {
    id: "doc:hello-system-12-emergence-of-layers",
    slug: "12-emergence-of-layers",
    parentId: "'doc:hello-system-part-1'",
    title: "第12章 软件第一次出现“层”",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 12,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第12章 软件第一次出现“层”

## 1. 经典三层架构的自然涌现

回顾前十二章的演进，拆分出的类自然构成了清晰的水平分层：
- **Controller（控制器 / 表现层）**
- **Service（业务逻辑层）**
- **Repository（数据访问 / 持久层）**

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor Caller as 外部调用者 (UI / 终端 / 网络)
    participant Ctrl as 1. Controller 层
    participant Svc as 2. Service 业务层
    participant Repo as 3. Repository 持久层
    participant Store as 底层物理存储 (DB / File)

    Caller->>Ctrl: 传入纯文本 / 请求参数 ("studentId=1001", "courseId=2048")
    Note over Ctrl: 负责: 格式解析、参数清洗\n绝不负责: 核心业务规则
    Ctrl->>Svc: 调用业务方法: enroll(1001, 2048)
    Note over Svc: 负责: 核心规则 (名额/冲突校验)\n绝不负责: SQL 拼装或 HTTP 响应
    Svc->>Repo: 请求数据: findCourseById(2048)
    Repo->>Store: 执行物理查询
    Store-->>Repo: 返回原始记录
    Repo-->>Svc: 组装并返回 Course 领域实体
    Svc->>Repo: 保存修改: save(course)
    Repo->>Store: 执行持久化更新
    Svc-->>Ctrl: 返回业务执行结果
    Ctrl-->>Caller: 封装成用户可见的格式 (JSON / 提示文字)
\`\`\`

---

## 2. 职责边界矩阵

| 层次 | 核心职责 | 它应该知道什么 | 它绝对不应该知道什么 |
| :--- | :--- | :--- | :--- |
| **Controller** | 协议转换、参数提取、输入格式清洗、分发调用 | 知道 HTTP / 路由 / 视图格式，知道该调哪个 Service | 绝不知道 SQL 怎么写，绝不知道核心业务规则 |
| **Service** | 业务不变量编排、跨实体逻辑协调、事务边界 | 知道完整的业务规则，知道需要调哪些 Repository 和 Notifier | 绝不知道当前是 HTTP 请求还是控制台调用，绝不直接写底层 SQL |
| **Repository** | 屏蔽底层存储介质差异，提供类似内存集合一样的存取接口 | 知道数据库表结构、SQL 语句、连接池、缓存 | 绝不知道“选课满了能不能选”这种业务规则 |

---

## 3. Mini Campus 经典三层可运行实现

\`\`\`java
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
            return ok ? "{\"status\": 200, \"msg\": \"选课成功\"}" : "{\"status\": 409, \"msg\": \"选课失败\"}";
        } catch (NumberFormatException e) {
            return "{\"status\": 400, \"msg\": \"参数非法\"}";
        }
    }
}
\`\`\`

---

## 4. 第一部分总结

我们完成了后端的骨架演进。在网线的另一端，用户面对的是一个由 DOM 和事件组成的浏览器世界。

接下来，我们将跨过网线，进入第二部分：**页面开始变复杂**。
`
  }
];
