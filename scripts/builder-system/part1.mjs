// scripts/builder-system/part1.mjs
// 第一部分：程序开始变大 (01 ~ 12)
// 全量技术修订与规范化完整版本 (全 12 章高密度深度正文)

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

让我们暂时搁置浏览器渲染、网络协议与数据库系统等后续主题，退回到程序设计的最基础形态。

假设我们需要编写一个简易的控制台选课逻辑：记录当前课程容量与已选人数，并在用户触发选课时判断是否允许加入。

在最小规模下，一段最直接的 Java 代码如下：

\`\`\`java
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
\`\`\`

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

\`\`\`java
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
\`\`\`

此时代码行数开始成倍增长。

---

## 3. 业务规则变更引发的维护挑战

假设教务规则发生调整：
> “所有课程需预留 $10\\%$ 名额给重修学生，实际可选上限为 $\\lfloor \\text{capacity} \\times 0.9 \\rfloor$。”

在上述代码中，开发者必须在所有出现 \`if (enrolled < capacity)\` 的位置逐处手动修改为：

\`\`\`java
if (c1_enrolled < (int)(c1_capacity * 0.9)) { ... }
\`\`\`

如果类似逻辑分散在系统各处，手工逐一修改将面临两个主要问题：
1. **修改成本随调用点数量线性上升**；
2. **存在漏改或误改其他变量的风险**，例如将 \`c1_capacity\` 误写为 \`c2_capacity\`，编译器无法在语法层面发现此类逻辑失误。

---

## 4. 过程式函数的尝试与状态脱节

面对重复逻辑，自然的重构手段是提取出公共函数：

\`\`\`java
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
\`\`\`

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

## 1. 隐式关联（Implicit Association）的脆弱性

在前面的示例中，我们使用前缀变量来表示一门课程的各个属性：

\`\`\`java
String c1_name = "计算机系统导论";
int c1_capacity = 100;
int c1_enrolled = 0;

String c2_name = "离散数学基础";
int c2_capacity = 60;
int c2_enrolled = 0;
\`\`\`

从编程语言的类型系统视角来看：
- \`c1_name\`、\`c1_capacity\` 和 \`c1_enrolled\` 是三个平权的独立局部变量；
- 它们之间的关联纯粹依赖程序员的命名前缀约定（\`c1_\`），在语言语义层面并没有建立起统一的实体约束。

这种仅靠人为约定维系的关联被称为**隐式关联（Implicit Association）**。

---

## 2. 实验验证：数据交换中的错位风险

【实验目标】观察在对散落变量执行交换操作时，疏漏某一字段可能产生的逻辑异常。

\`\`\`java
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
\`\`\`

### 输出结果：
\`\`\`text
课程 1 -> 古希腊哲学史, 容量: 30, 已选: 95
课程 2 -> 计算机系统导论, 容量: 100, 已选: 5
\`\`\`

### 现象分析：
由于疏漏了 \`enrolled\` 字段的交换，《古希腊哲学史》在容量仅为 30 的情况下已选人数变成了 95。编译器无法识别这种逻辑层面的实体撕裂，因为每个变量的赋值语法都是完全合法的。

---

## 3. 并行数组（Parallel Arrays）与维护瓶颈

为了管理多门课程，初学者常会尝试使用并行数组：

\`\`\`java
String[] names = new String[] { "计算机系统导论", "离散数学基础" };
int[] capacities = new int[] { 100, 60 };
int[] enrolleds = new int[] { 95, 10 };
\`\`\`

并行数组在处理数据重排、元素删除与跨函数传参时会引入显著的同步开销：
1. **排序同步**：如果按照容量对课程进行排序，必须同时手动同步交换 \`names\` 和 \`enrolleds\` 中的对应项；
2. **元素删除**：在某一数组中移除元素并移动后续项时，所有关联数组必须严格以相同的偏移量执行平移；
3. **参数膨胀**：处理课程的函数签名需要接收所有平行数组作为入参。

---

## 4. 复合数据类型与实体身份

解决上述问题的核心思路，是在类型系统层面将属于同一个实体的属性组合在一起，形成**记录（Record）**或**复合数据类型（Composite Type）**。

在 Java 中，我们可以定义一个包含相关属性的数据类：

\`\`\`java
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
\`\`\`

现在，整个实体的属性被组合为一个统一的引用类型：

\`\`\`java
CourseRecord[] courses = new CourseRecord[] {
    new CourseRecord("计算机系统导论", 100, 95),
    new CourseRecord("古希腊哲学史", 30, 5)
};

// 交换时只需交换单个引用
CourseRecord temp = courses[0];
courses[0] = courses[1];
courses[1] = temp;
\`\`\`

此时无论课程包含多少个字段，排序、交换与移动操作均以整个实体为单位进行，消除了字段间错位的可能性。

\`\`\`mermaid
flowchart LR
    A0["courses[0] 引用"] --> ObjA["CourseRecord 实例\n{ name: '古希腊哲学史', capacity: 30, enrolled: 5 }"]
    A1["courses[1] 引用"] --> ObjB["CourseRecord 实例\n{ name: '计算机系统导论', capacity: 100, enrolled: 95 }"]
\`\`\`

---

## 5. 语言实现的边界说明

将数据结构化聚合是计算机科学的通用思想，不同编程语言提供了不同的语法和实现机制：

- **C 语言**：使用 \`struct\` 定义连续的内存布局；
- **Java**：使用 \`class\` 或 Java 16+ 的 \`record\` 定义堆上分配的对象类型；
- **TypeScript**：使用 \`interface\` 或 \`type\` 提供静态类型检查；
- **Python**：使用 \`@dataclass\` 或普通的类。

---

## 6. 本章小结

1. 隐式命名约定无法在类型系统层面保证数据的一致性；
2. 复合数据类型（Record/Struct）赋予了实体明确的身份，保证了属性在移动和传递时的聚合性；
3. 纯数据结构虽然组织了数据，但所有字段若全部公开，外部代码依然可以直接修改内部状态。这引出了下一章的主题：数据与行为的内聚。
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

## 1. 贫血数据结构的维护挑战

在上一章中，我们将课程数据聚合为了 \`CourseRecord\`。

如果该数据类的所有字段依然是公开的（\`public\`），并且业务操作由散落在外部的各类函数完成，这种结构在领域建模中常被称为**贫血模型（Anemic Model）**。

当项目由多位开发者共同维护时，散落的外部修改可能带来状态不一致：
- 选课模块可能进行了容量检查：\`if (c.enrolled < c.capacity) c.enrolled++;\`
- 退课模块可能遗漏了下限检查：直接执行 \`c.enrolled--;\`，导致在已选人数为 0 时产生负数；
- 批量导入模块可能直接进行累加：\`c.enrolled += count;\`，绕过了容量上限。

\`\`\`mermaid
flowchart LR
    A["模块 A: 编写了上限校验"] -->|直接修改| Target["CourseRecord.enrolled 字段"]
    B["模块 B: 遗漏了下限校验"] -->|直接修改| Target
    C["模块 C: 绕过了规则直接累加"] -->|直接修改| Target
\`\`\`

---

## 2. 内聚性（Cohesion）与自治实体

为了降低外部代码误操作的风险，软件设计中提出了**高内聚（High Cohesion）**原则：

> **将相关的数据与操作该数据的规则集中在同一边界之内。**

通过将数据设置为私有，仅通过受控的方法暴露状态变更接口，对象能够主动维护自身的状态合法性：

\`\`\`java
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
\`\`\`

---

## 3. 面向对象之外的实现范式

需要强调的是，**数据与操作的内聚并不局限于面向对象编程**：
- **过程式语言中的抽象数据类型（ADT）**：例如在 C 语言中，可以通过在头文件中声明不透明指针（Opaque Pointer，如 \`typedef struct Course Course;\`），并只提供操作函数（如 \`Course_enroll(Course* c)\`）来实现数据隐藏与状态保护；
- **函数式编程（FP）**：通过不可变数据结构与纯函数，每次状态跃迁产生新的数据快照：$State_{new} = f(State_{old}, Action)$，从模型上避免原位篡改；
- **模块化机制**：许多现代语言（如 Rust、Go）通过包/模块级可见性控制来实现类似的数据保护。

本书沿着面向对象路线展开，是因为在许多主流企业级开发体系中，类与对象是表达领域概念的常见载体。

---

## 4. 本章小结

1. 仅仅将数据聚合成结构体，若不限制访问权限，仍难以防止非法状态变更；
2. 面向对象通过将字段私有化、提供守卫方法，使对象成为负责自身状态一致性的自治单元；
3. 数据与行为内聚是通用的软件工程原则，在不同编程范式中有不同的实现方式。
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

## 1. 区分概念模型与运行期表示

在初学面向对象时，“类是图纸，对象是房子”这一比喻有助于建立抽象与具体的直觉。

但在深入理解系统运行时，需要进一步理清类型定义与实例数据在内存中的分工：
- **类定义**：包含了字段规格、方法字节码指令与元数据信息；
- **对象实例**：保存了属于该实例特有的字段取值以及指向其类型元数据的关联。

无论创建多少个 \`Course\` 实例，方法的指令代码在进程中通常只有一份共享副本，而每个实例在堆中分配独立的空间存放各自的属性值。

\`\`\`mermaid
flowchart LR
    subgraph ClassMetadata ["类型元数据 (共享区)"]
        Klass["Course 类信息\n- 方法字节码: enroll(), drop()\n- 字段描述表"]
    end

    subgraph HeapInstances ["堆内存实例数据"]
        Obj1["Course 实例 1\n{ name: 'CS-101', capacity: 100, enrolled: 1 }"]
        Obj2["Course 实例 2\n{ name: 'MATH-201', capacity: 60, enrolled: 0 }"]
    end

    Obj1 -.->|类型关联| Klass
    Obj2 -.->|类型关联| Klass
\`\`\`

---

## 2. 方法调用的语义与隐式参数 \`this\`

当执行 \`c1.enroll()\` 时，方法是如何知道该修改 \`c1\` 还是 \`c2\` 的？

在面向对象语言语义中，实例方法调用在逻辑上等价于将当前操作的目标对象作为**第一个参数**传入方法：

$$\\text{enroll}(c1)$$

在方法体内部，这个隐式参数即为 \`this\`（在 Python 中被显式写作 \`self\`）。方法通过 \`this\` 访问并修改当前实例的具体字段。

---

## 3. 规范与实现的边界说明

需要说明的是：
- **Java 虚拟机规范（JVMS）** 描述的是虚拟机的抽象执行模型，并不强制规定具体的物理内存布局、对象头格式或栈帧具体排布；
- 像 **OpenJDK HotSpot** 这样的具体 JVM 实现，会使用特定的对象头结构（如 Mark Word、Klass Pointer）以及 JIT 编译器优化（如方法内联、逃逸分析与标量替换）；
- 开发者应当首先理解语言的类型系统与语义规范，具体 JVM 实现细节属于下层技术选择。

---

## 4. 本章小结

1. 类承载了行为逻辑与类型元信息，对象承载了具体的实例状态；
2. 实例方法通过隐式传递的 \`this\` 引用定位并修改目标对象的数据；
3. 理解语义模型比记忆特定运行时的底层字节排布更为根本。
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

## 1. 封装的本质：捍卫不变量（Invariants）

在面向对象教学中，常见的误区是将封装等同于“将字段声明为 \`private\`，然后提供一整套 \`getter\` 和 \`setter\`”。

如果直接提供 \`setEnrolled(int n)\`，外部依然可以直接传入负数或超过容量的值，封装的效果便荡然无存。

#### 不变量（Invariant）定义：
> **不变量**是指对象在整个生命周期内，处于任何可观察的稳定状态时都必须恒为真的业务谓词。

在 \`Course\` 实体中，核心不变量包括：
$$0 \\le \\text{enrolled} \\le \\text{capacity}$$
$$\\text{capacity} > 0$$

---

## 2. 状态保护的双重边界

为了维护不变量，对象需要在两个阶段建立校验：

1. **构造阶段（Creation Validation）**：构造函数必须拒绝不合法的初始参数，确保对象在被创建的那一刻就处于合法状态；
2. **状态跃迁阶段（State Transition Validation）**：只暴露有明确业务语义的方法（如 \`enroll()\`, \`drop()\`），在方法内部执行条件判断，拒绝会导致不变量破裂的请求。

\`\`\`mermaid
stateDiagram-v2
    [*] --> 合法初始状态: 构造函数校验 (capacity > 0)
    合法初始状态 --> 选课成功状态: enroll() [enrolled + 1 <= capacity]
    选课成功状态 --> 退课成功状态: drop() [enrolled - 1 >= 0]
    选课成功状态 --> 保持原状_拒绝变更: enroll() [名额已满]
\`\`\`

---

## 3. 本章小结

1. 封装的核心目的在于保护业务不变量，而非单纯的形式化语法修饰；
2. 消除破坏不变量的公开 setter，将状态变更收敛到具有业务语义的方法中；
3. 对象在生命周期的每一个稳定状态下都必须维持其内部一致性。
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

\`\`\`mermaid
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
\`\`\`

---

## 3. 内存管理范式对比

- **垃圾回收（GC）**：运行时自动追踪引用关系，降低了手动释放内存导致悬垂指针（Dangling Pointer）或双重释放（Double Free）的风险；
- **RAII 与显式所有权**：在 C++ 或 Rust 中，对象的销毁与作用域或所有权严格绑定，在离开作用域时由析构函数确定性释放，避免了垃圾回收停顿。

---

## 4. 本章小结

1. 引用变量是访问对象的句柄，对象的生存取决于是否存在从活跃根节点出发的可达路径；
2. 垃圾回收机制通过可达性分析处理不再使用的对象；
3. 了解生命周期机制有助于避免意外保留长生命周期引用而导致的内存占用问题。
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

## 1. 对象关系的层次：拥有与使用

在面向对象系统中，对象之间最主要的协作形式包括：

1. **关联 / 组合（has-a）**：一个对象将另一个对象作为自身的属性长期持有；
2. **依赖（uses-a）**：一个对象在方法执行过程中，通过参数传入或局部变量临时使用另一个对象。

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
    }

    Student "1" o-- "0..*" Course : has-a (持有已选课程列表)
    Student ..> Course : uses-a (方法参数临时协作)
\`\`\`

---

## 2. Mini Campus 实体协作与职责分配

在选课场景中，\`Student\` 与 \`Course\` 各自维护不同的业务不变量：
- **\`Student\` 的职责**：维护学生的个人选课清单，保证“同一学生不重复选修同一门课”；
- **\`Course\` 的职责**：维护课程自身的容量约束，保证“总选课人数不超过容量上限”。

\`\`\`java
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
\`\`\`

---

## 3. 本章小结

1. 对象通过属性持有（has-a）与参数依赖（uses-a）建立协作；
2. 职责应当分配给拥有相关信息的对象，避免出现单个对象越权管理所有规则的情况；
3. 在暴露集合属性时，应注意通过不可变包装或防御性复制保护内部状态。
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

## 1. 继承的适用条件与常见误区

继承是面向对象中常被误用的机制之一。常见的错误出发点是为了单纯的代码复用而强行继承。

例如：因为“教室（Classroom）”也有容纳人数（capacity）和当前人数（enrolled），便让 \`Classroom\` 继承 \`Course\`。这会导致概念混乱，使得系统允许出现“学生选修了一间教室”这种违背业务逻辑的操作。

#### 里氏替换原则（LSP, Liskov Substitution Principle）：
> **如果对于每一个类型为 $S$ 的对象 $o_1$，都存在类型为 $T$ 的对象 $o_2$，使得以 $T$ 定义的所有程序 $P$ 在用 $o_1$ 替换 $o_2$ 时，程序 $P$ 的行为保持不变，那么类型 $S$ 是类型 $T$ 的子类型。**

---

## 2. 合理的继承示例：实验课程

在 Mini Campus 中，**实验课（LabCourse）** 是一种符合 is-a 关系的子类型：
- 实验课在行为与语义上完全是一种课程；
- 实验课在继承基础课程属性的同时，增加了实验机时与助教信息。

\`\`\`java
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
\`\`\`

---

## 3. 组合优于继承的设计经验

在软件工程实践中，“**组合优于继承（Composition over Inheritance）**”是一条广为人知的经验法则：
- 继承属于**白盒复用**，父类的内部实现细节往往对子类可见，父类修改可能对子类产生意料之外的影响；
- 组合属于**黑盒复用**，通过引用接口或对象来协作，耦合度更低，也更易于在运行时动态替换。

---

## 4. 本章小结

1. 继承应严格满足 is-a 关系与里氏替换原则，不应单纯为了复用局部字段而继承；
2. 继承建立了较强的耦合关系，在面对复杂或多变的关系时，应优先考虑使用对象组合。
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

## 1. 类型分支语句的扩展瓶颈

假设选课成功后，系统需要根据不同课程类型打印对应的指引信息。如果不使用多态，代码通常会充斥着类型判断：

\`\`\`java
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
\`\`\`

每当新增一种课程类型时，所有包含类型判断分支的代码都需要被找到并修改。

---

## 2. 多态与动态分派（Dynamic Dispatch）

**子类型多态（Subtype Polymorphism）** 允许调用方统一面向父类型或接口编程，具体的行为由实际接收消息的运行时对象决定：

\`\`\`java
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
\`\`\`

调用方代码精简为：

\`\`\`java
public static void notifyStudent(Course course) {
    course.printInstruction(); // 运行时根据实际对象动态分派
}
\`\`\`

---

## 3. 动态分派的一种经典实现：虚方法表（vtable）

【说明：以下讨论的是许多编译器和虚拟机（如 C++ 编译器、JVM）中常见的一种实现机制，用于辅助理解运行期寻址，而非语言规范的唯一约束。】

\`\`\`mermaid
flowchart LR
    subgraph Instances ["堆上的具体实例"]
        ObjA["LabCourse 实例\n[类型元数据指针]"]
        ObjB["Course 实例\n[类型元数据指针]"]
    end

    subgraph Tables ["虚方法表 (vtable) 示意"]
        VT_Lab["LabCourse vtable\n[Slot 0] printInstruction -> LabCourse.printInstruction()"]
        VT_Base["Course vtable\n[Slot 0] printInstruction -> Course.printInstruction()"]
    end

    ObjA -.-> VT_Lab
    ObjB -.-> VT_Base
\`\`\`

1. 编译器在编译阶段为每个包含虚方法的类生成一张方法表，子类重写的方法会覆盖对应槽位中的函数指针；
2. 当执行方法调用指令时，运行时根据对象的实际类型指针定位到对应的虚方法表，并从固定槽位获取目标方法入口执行。

---

## 4. 本章小结

1. 多态将“做什么”与“怎么做”解耦，调用方无需感知具体的子类分支；
2. 动态分派是在运行时决定方法实现的语义机制，虚方法表（vtable）是其经典实现手段之一。
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

## 1. 硬编码依赖带来的耦合痛点

当选课成功后，系统需要发送即时通知。如果业务逻辑直接硬编码具体实现：

\`\`\`java
public class EnrollmentCoordinator {
    private AliyunSmsSender smsSender = new AliyunSmsSender(); // 直接依赖具体类
}
\`\`\`

这会导致：
- 当更换服务提供商或切换为邮件通知时，核心选课代码必须修改；
- 在运行单元测试时，无法轻松替换为不产生真实通信开销的测试桩（Mock）。

---

## 2. 接口作为纯粹的契约

在面向对象设计中，**接口（Interface）** 定义了一组行为契约，声明“做什么（What）”而不约束“如何做（How）”。

> **语言特性说明**：
> 在抽象概念上，接口表达纯粹的契约；在具体语言语法上，例如 Java 8 之后引入了 \`default\` 和 \`static\` 方法，Java 9 引入了 \`private\` 方法，用于在不破坏既有实现的前提下提供契约扩展与代码复用。

\`\`\`java
public interface NotificationSender {
    void sendNotification(String target, String content);
}
\`\`\`

---

## 3. 依赖倒置原则（DIP）与依赖注入（DI）

必须准确区分以下两个概念：

- **依赖倒置原则（DIP, Dependency Inversion Principle）**：一条设计原则。高层模块不应该依赖低层模块，两者都应该依赖抽象；抽象不应该依赖细节，细节应该依赖抽象。
- **依赖注入（DI, Dependency Injection）**：一种实现依赖解耦的结构型手段。通过构造函数、Setter 方法或框架容器将具体依赖传递给对象，而不是由对象内部自行 \`new\` 创建。

\`\`\`mermaid
flowchart TD
    subgraph DIP ["依赖倒置原则 (DIP)"]
        Coordinator["核心选课业务 (高层模块)"] -->|依赖抽象| Interface["NotificationSender 接口"]
        Aliyun["AliyunSmsSender (低层模块)"] -.->|实现契约| Interface
        Email["EmailSender (低层模块)"] -.->|实现契约| Interface
        Mock["MockNotificationSender (测试桩)"] -.->|实现契约| Interface
    end
\`\`\`

\`\`\`java
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
\`\`\`

---

## 4. 本章小结

1. 接口建立了模块之间的抽象契约，隔离了易变实现对核心业务的影响；
2. 依赖倒置原则（DIP）强调面向抽象编程，依赖注入（DI）是装配具体实现的有效手段。
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

## 1. 上帝类（God Class）的产生与危害

随着功能的累加，如果开发者习惯性地将所有逻辑追加到一个庞大的管理类（如 \`CampusManager\`）中，该类将逐渐演化为涵盖参数校验、业务编排、SQL 访问与通知发送的“上帝类”。

上帝类会带来以下维护问题：
- **变更冲突**：不同职责的修改均集中在同一个文件，增加代码合并冲突的概率；
- **理解困难**：单文件行数庞大，内部逻辑错综复杂；
- **测试困难**：无法对单个业务规则进行隔离测试。

---

## 2. 单一职责原则（SRP）：寻找变化的轴线

#### 单一职责原则（Single Responsibility Principle）：
> **一个模块应该有且仅有一个引起它变化的原因。**

我们将臃肿的管理类解构为关注点各异的独立模块：

\`\`\`mermaid
flowchart LR
    Ctrl["CourseController\n关注网络传输与参数转换"] --> Svc["EnrollmentService\n关注业务规则编排"]
    Svc --> Repo["CourseRepository\n关注数据持久化存取"]
    Svc --> Notify["NotificationSender\n关注外部消息发送"]
\`\`\`

- 当协议格式或 URL 路由改变时，只需修改 Controller；
- 当选课业务规则改变时，只需修改 Service；
- 当存储介质或 SQL 改变时，只需修改 Repository。

---

## 3. 本章小结

1. 上帝类承担了过多的职责，违背了单一职责原则；
2. 按照变化的原因和关注点拆分模块，有助于提高系统的可维护性与可测试性。
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

## 1. 经典三层架构的职责分工

在现代 Web 后端开发中，**Controller-Service-Repository** 是一种广泛使用的教学与工业参考分层方案：

\`\`\`mermaid
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
\`\`\`

---

## 2. 层次职责矩阵

| 层次 | 核心职责 | 它应该关注什么 | 它应该避免什么 |
| :--- | :--- | :--- | :--- |
| **表现层 (Controller)** | 协议转换、参数提取、基础格式校验、响应包装 | HTTP 语义、路由匹配、状态码 | 直接执行底层 SQL、包含核心业务规则 |
| **业务逻辑层 (Service)** | 业务用例编排、跨实体协作、事务边界管理 | 完整的业务规则与执行流程 | 直接处理底层 HTTP 会话、硬编码特定数据库细节 |
| **数据持久层 (Repository)** | 屏蔽底层存储细节，提供集合风格的数据存取接口 | 数据查询、持久化映射、缓存交互 | 参与上层业务规则决策 |

---

## 3. Mini Campus 三层结构的最小实现

\`\`\`java
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
            return ok ? "{\"status\": 200, \"msg\": \"选课成功\"}" : "{\"status\": 409, \"msg\": \"选课失败\"}";
        } catch (NumberFormatException e) {
            return "{\"status\": 400, \"msg\": \"参数格式非法\"}";
        }
    }
}
\`\`\`

---

## 4. 第一部分总结

至此，我们完成了后端单机程序从散落变量到面向对象封装、再到三层分层设计的演进。

接下来，我们将视角转移到浏览器端，进入第二部分：**页面开始变复杂**。
`
  }
];
