// scripts/builder-system/part6.mjs
// 第六部分：重新走完那几百毫秒 (56 ~ 60)
// 深度教科书级高密度完整版本 (全 5 章完整深度展开)

export const part6Docs = [
  {
    id: "doc:hello-system-part-6",
    slug: "part-6",
    parentId: "'doc:book-hello-system'",
    title: "第六部分 · 重新走完那几百毫秒",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 8,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-system-56-full-request-journey",
    slug: "56-full-request-journey",
    parentId: "'doc:hello-system-part-6'",
    title: "第56章 从浏览器到数据库",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第56章 从浏览器到数据库

## 1. 案例追踪：李雷选择 CS-101 (320 毫秒全景透视)

学生 ID：\`1001\`（李雷）  
课程 ID：\`2048\`（《计算机系统导论》）

现在，我们将整本书学到的全部知识，串联进这一条 320 毫秒的执行链路中：

\`\`\`mermaid
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
\`\`\`

---

## 2. 空间与介质的跃迁

在这 320 毫秒里，数据完成了一场壮丽的物理跨越：
1. **光学与机械**：鼠标微动开关闭合，光标停留在屏幕对应坐标；
2. **电磁与光纤**：TCP 数据报转化为高频电脉冲与光信号，在数百公里的光缆中以接近光速的速度飞驰；
3. **硅晶片与逻辑门**：CPU 在数十亿个晶体管间完成寄存器加载、分支预测与比较计算；
4. **磁畴与浮栅电荷**：SSD 闪存颗粒上的浮栅捕获电子，将选课事实永久铭刻在物理介质上；
5. **光子与视网膜**：屏幕液晶分子偏转，发出绿色的光子射入李雷的眼睛。
`
  },
  {
    id: "doc:hello-system-57-why-we-have-layers",
    slug: "57-why-we-have-layers",
    parentId: "'doc:hello-system-part-6'",
    title: "第57章 我们为什么最终得到了这么多层？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 2,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第57章 我们为什么最终得到了这么多层？

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
`
  },
  {
    id: "doc:hello-system-58-anti-overengineering",
    slug: "58-anti-overengineering",
    parentId: "'doc:hello-system-part-6'",
    title: "第58章 架构是不是越复杂越好？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第58章 架构是不是越复杂越好？

## 1. 复杂度的购买力法则

> **架构不是越复杂越好，架构是用可控的静态复杂度，去购买应对动态规模扩张的能力。**

如果一个系统只有 2 个开发者、每天只有 50 次点击：
- 搞微服务集群、分布式事务、消息队列、Kubernetes，就是典型的**过度设计（Over-Engineering）**与自寻烦恼；
- 优秀工程师的标志，不是看他能把系统设计得多复杂，而是看他能否**用最节制、最优雅的最小抽象，精准解决当前尺度的核心矛盾**。
`
  },
  {
    id: "doc:hello-system-59-eternal-pillars-beyond-frameworks",
    slug: "59-eternal-pillars-beyond-frameworks",
    parentId: "'doc:hello-system-part-6'",
    title: "第59章 框架消失以后，还剩下什么？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 4,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第59章 框架消失以后，还剩下什么？

## 1. 潮水退去后的六大永恒基石

框架会过时，类库会更替，语法糖会消亡。但计算机软件系统的六大底层法则永恒不变：

\`\`\`mermaid
flowchart TD
    Root["计算机软件系统的六大永恒基石"]
    
    P1["1. 状态 (State)\n内存中的变量是瞬态的，磁盘中的数据是持久的"]
    P2["2. 封装与不变量 (Invariants)\n谁拥有数据，谁就拥有修改数据的唯一权力"]
    P3["3. 关系与投影 (Relational Model)\n现实实体的解构与数学拼合"]
    P4["4. 协议与契约 (Protocols & Interfaces)\n跨越物理与抽象边界的通用语言"]
    P5["5. 并发与锁 (Concurrency & Isolation)\n在物理时间切片中维持确定性"]
    P6["6. 可靠性与容灾 (WAL & Idempotency)\n在充满缺陷与故障的物理硬件上构建确定性"]

    Root --> P1
    Root --> P2
    Root --> P3
    Root --> P4
    Root --> P5
    Root --> P6
\`\`\`
`
  },
  {
    id: "doc:hello-system-60-click-again",
    slug: "60-click-again",
    parentId: "'doc:hello-system-part-6'",
    title: "第60章 现在，再点击一次“选课”",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第60章 现在，再点击一次“选课”

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
`
  }
];
