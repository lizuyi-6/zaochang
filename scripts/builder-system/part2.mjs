// scripts/builder-system/part2.mjs
// 第二部分：页面开始变复杂 (13 ~ 24)
// 深度教科书级高密度完整版本 (全 12 章完整深度展开)

export const part2Docs = [
  {
    id: "doc:hello-system-part-2",
    slug: "part-2",
    parentId: "'doc:book-hello-system'",
    title: "第二部分 · 页面开始变复杂",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 4,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: ""
  },
  {
    id: "doc:hello-system-13-html-css-dom",
    slug: "13-html-css-dom",
    parentId: "'doc:hello-system-part-2'",
    title: "第13章 网页最开始根本不需要框架",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 1,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第13章 网页最开始根本不需要框架

## 1. 最初情境：纯粹的 Web 三剑客

在 React、Vue 等现代庞大框架统治前端开发之前，整个互联网依靠极其纯粹的三大基石运转了二十年：
- **HTML（结构）**：描述页面有哪些信息和层级；
- **CSS（样式）**：描述这些信息呈现的视觉规则；
- **JavaScript（行为）**：赋予页面极少量的局部动态交互。

早期 Mini Campus 选课系统的网页，只需要一个简单的 \`index.html\` 文件：

\`\`\`html
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
        document.getElementById('enroll-btn').addEventListener('click', function() {
            if (remaining > 0) {
                remaining--;
                document.getElementById('course-remaining').innerText = remaining;
                alert('选课成功！');
                if (remaining === 0) {
                    this.disabled = true;
                    this.innerText = '已满员';
                }
            }
        });
    </script>
</body>
</html>
\`\`\`

---

## 2. 浏览器的物理渲染流水线

当浏览器接收到 HTML 字节流时，底层渲染引擎（如 Chromium Blink / WebKit）会经历以下严格物理流水线：

\`\`\`mermaid
flowchart TD
    Bytes["HTML / CSS 网络字节流"] --> Tokenizer["分词解析器 (Tokenization)"]
    Tokenizer --> Tree["构建 DOM 树 (Document Object Model)"]
    Tree --> CSSOM["计算 CSSOM 样式树 (Computed Styles)"]
    CSSOM --> Layout["布局排版 (Layout / Reflow)\n计算每个盒子的几何坐标与尺寸"]
    Layout --> Paint["绘制图层 (Paint)\n将文字、颜色转化为像素填充指令"]
    Paint --> Composite["GPU 光栅化合成 (Raster & Compositing)\n最终输出到显卡帧缓冲区"]
\`\`\`

在页面极其简单时，这种直接编写 HTML 并通过少量原生 JS 事件监听的方式，拥有**零构建耗时、零框架体积消耗、极高首屏加载速度**的绝对优势。
`
  },
  {
    id: "doc:hello-system-14-dom-manipulation-mess",
    slug: "14-dom-manipulation-mess",
    parentId: "'doc:hello-system-part-2'",
    title: "第14章 直接操作DOM为什么迟早会出问题？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 2,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第14章 直接操作DOM为什么迟早会出问题？

## 1. 业务扩张带来的 DOM 操作泥潭

当 Mini Campus 页面不仅有单个按钮，而是增加了：
1. 顶部全局未读通知徽章（需要加 1）；
2. 右侧已选课程总学分悬浮条（需要累加 3 学分）；
3. 课程卡片按钮变为不可点击；
4. 搜索框过滤课程时隐藏已满课程。

采用原生 DOM 操作的 JavaScript 代码会迅速演变成一张极其错综复杂的网状蜘蛛网：

\`\`\`javascript
// 痛苦的命令式 DOM 联动代码
function handleEnrollSuccess(course) {
    // 1. 手动修改卡片内部名额
    const remainEl = document.querySelector('#card-' + course.id + ' .remaining');
    remainEl.innerText = parseInt(remainEl.innerText) - 1;

    // 2. 手动修改按钮状态
    const btn = document.querySelector('#card-' + course.id + ' button');
    btn.disabled = true;
    btn.innerText = '已选修';

    // 3. 手动修改顶部徽章
    const badge = document.getElementById('global-enrolled-badge');
    badge.innerText = parseInt(badge.innerText) + 1;

    // 4. 手动向侧边栏插入一个新 li 节点
    const sidebarList = document.getElementById('sidebar-course-list');
    const li = document.createElement('li');
    li.id = 'sidebar-item-' + course.id;
    li.innerHTML = course.name + ' <button onclick="handleDrop(' + course.id + ')">退选</button>';
    sidebarList.appendChild(li);

    // 5. 手动更新总学分
    const creditEl = document.getElementById('total-credits');
    creditEl.innerText = parseInt(creditEl.innerText) + course.credits;
}
\`\`\`

---

## 2. 致命危机：DOM 变成了系统状态的唯一存储器

\`\`\`mermaid
flowchart LR
    subgraph Mess ["命令式 DOM 泥潭 (多源状态撕裂)"]
        Action1["选课点击"] -->|手动修改| DOM1["卡片剩余名额文本"]
        Action1 -->|手动修改| DOM2["按钮 Disabled 属性"]
        Action1 -->|手动修改| DOM3["侧边栏 li 列表"]
        Action1 -->|手动修改| DOM4["顶部徽章数字"]

        Action2["退课点击"] -->|漏改了某个 DOM| DOM3
        Action3["搜索框筛选"] -->|意外清空重建| DOM1
    end
\`\`\`

一旦系统稍微复杂：
- 如果某处漏改了某一个 DOM 节点，系统就会陷入：**侧边栏显示已选 2 门课，顶部徽章却显示 1，总学分显示 0 的数据撕裂！**
- DOM 树本应只是**用来展示的像素投影**，但在命令式编程中，它被反客为主当成了**保存系统状态的数据库**。
`
  },
  {
    id: "doc:hello-system-15-state-driven-ui",
    slug: "15-state-driven-ui",
    parentId: "'doc:hello-system-part-2'",
    title: "第15章 究竟应该让页面保存数据，还是让数据决定页面？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 3,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第15章 究竟应该让页面保存数据，还是让数据决定页面？

## 1. 认知范式的大倒转：声明式（Declarative）

解决 DOM 泥潭的根本手段，是彻底颠覆软件的心智模型：

> **传统命令式思维**：页面上有若干 DOM，我发生了一个事件，我一步一步手动去拔动每一个 DOM 节点。  
> **现代声明式思维**：系统内部维护一个纯粹的 JavaScript 内存状态（State）。我只描述“状态长成这样时，页面应该长成什么样”。剩下的 DOM 同步工作，全部由底层框架自动搞定。

#### 核心宇宙公式：
$$UI = f(State)$$

\`\`\`mermaid
flowchart LR
    State["纯内存状态 State\n{ courses: [...], enrolledIds: [101] }"] -->|纯函数计算 f(State)| VirtualDOM["虚拟 DOM 描述结构"]
    VirtualDOM -->|框架自动 Patch 差异| RealDOM["真实页面 DOM"]
\`\`\`

你只需要修改内存中的数据，页面会自动变成对应状态的准确投影。
`
  },
  {
    id: "doc:hello-system-16-vue-reactivity-under-the-hood",
    slug: "16-vue-reactivity-under-the-hood",
    parentId: "'doc:hello-system-part-2'",
    title: "第16章 “数据变了，页面自己变”到底是什么意思？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 4,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第16章 “数据变了，页面自己变”到底是什么意思？

## 1. 响应式的核心机制：Proxy 拦截

Vue 3 之所以能在你修改对象属性时自动刷新页面，底层依赖于 JavaScript 的核心机制：**\`Proxy\` 代理对象**。

系统通过拦截属性的**读操作（Get）**和**写操作（Set）**，实现了两大关键动作：
1. **依赖收集（Track）**：当某个渲染函数在读取 \`course.enrolled\` 时，Vue 偷偷把这个渲染函数登记在当前属性的“观察者名单”中；
2. **依赖触发（Trigger）**：当你执行 \`course.enrolled++\` 时，Vue 拦截到赋值，立即遍历“观察者名单”，通知所有依赖该属性的渲染函数重新执行！

\`\`\`mermaid
flowchart TD
    subgraph Read ["读取属性 (Get)"]
        Render["渲染函数 render()"] -->|读取 state.enrolled| ProxyGet["Proxy get() 拦截"]
        ProxyGet --> Track["Track 依赖收集\n将 render 记录到 Set 集合中"]
    end

    subgraph Write ["修改属性 (Set)"]
        UserAction["用户点击: state.enrolled++"] --> ProxySet["Proxy set() 拦截"]
        ProxySet --> Trigger["Trigger 依赖触发\n取出 Set 中的全部 render() 重新执行"]
        Trigger --> Patch["重新计算并更新 DOM"]
    end
\`\`\`

---

## 2. 最小响应式原型的 30 行可运行实现

\`\`\`javascript
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
\`\`\`
`
  },
  {
    id: "doc:hello-system-17-computed-and-caching",
    slug: "17-computed-and-caching",
    parentId: "'doc:hello-system-part-2'",
    title: "第17章 computed为什么不是一个普通函数？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 5,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第17章 computed为什么不是一个普通函数？

## 1. 派生状态与普通函数的性能陷阱

在选课系统中，我们经常需要计算：
- 已选课程的总学分；
- 当前是否还能继续选课（是否达到学分上限）。

如果在模板中直接调用普通函数：
\`\`\`html
<p>总学分: {{ calculateTotalCredits() }}</p>
<p>总学分: {{ calculateTotalCredits() }}</p>
\`\`\`
每次页面有任何无关变量发生微小变化引起重绘时，\`calculateTotalCredits\` 都会被重复调用无数次。

---

## 2. computed 的核心秘密：脏标记（Dirty Flag）与缓存

\`computed\` 本质上是一个**带有缓存的惰性计算响应式对象**：
1. 只有当它依赖的响应式源数据（如已选课程列表）发生变化时，它才会被打上“脏（\`dirty = true\`）”的标记；
2. 只要依赖没有变，无论外界读取它多少次，它都会直接从内存缓存中返回上一次计算好的旧值。

\`\`\`mermaid
flowchart TD
    Read["外部读取 computed 属性"] --> CheckDirty{"_dirty 是否为 true?"}
    CheckDirty -->|是 (数据已变)| Calc["重新执行计算函数\n缓存新结果, _dirty = false"]
    CheckDirty -->|否 (数据未变)| Cache["直接返回上次缓存的值 (零计算开销)"]
\`\`\`
`
  },
  {
    id: "doc:hello-system-18-watch-and-side-effects",
    slug: "18-watch-and-side-effects",
    parentId: "'doc:hello-system-part-2'",
    title: "第18章 watch到底应该什么时候使用？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 6,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第18章 watch到底应该什么时候使用？

## 1. 纯计算 vs 副作用（Side Effects）

- **\`computed\`**：适用于**纯派生数据计算**。输入若干响应式数据，输出一个新的值。严禁在 computed 内部发起网络请求或修改其他状态！
- **\`watch\`**：专门用于处理**副作用（Side Effects）**。当某个状态发生变化时，需要执行某种与外界环境交互的动作（如发起 HTTP 请求、写 LocalStorage、设置定时器）。

\`\`\`javascript
// 典型的 watch 正确用法：当选课状态变化时，异步持久化到本地存储
watch(enrolledCourseIds, (newIds) => {
    localStorage.setItem('saved_courses', JSON.stringify(newIds));
    console.log('已自动保存选课状态到本地存储');
}, { deep: true });
\`\`\`
`
  },
  {
    id: "doc:hello-system-19-component-decomposition",
    slug: "19-component-decomposition",
    parentId: "'doc:hello-system-part-2'",
    title: "第19章 为什么页面最终必须被拆开？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 7,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第19章 为什么页面最终必须被拆开？

## 1. 单巨石页面的崩溃与组件化（Component）

当选课系统页面包含 50 个功能点时，把所有代码堆在一个 \`App.vue\` 文件中将造成几千行的巨石灾难。

组件化的本质是：**在前端领域重新运用高内聚低耦合原则，将 HTML 模板、CSS 样式与 JS 逻辑打包成一个自包含的自治砖块。**

\`\`\`mermaid
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
\`\`\`
`
  },
  {
    id: "doc:hello-system-20-props-events-data-flow",
    slug: "20-props-events-data-flow",
    parentId: "'doc:hello-system-part-2'",
    title: "第20章 组件之间怎样传递信息？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 8,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第20章 组件之间怎样传递信息？

## 1. 单向数据流（One-Way Data Flow）铁律

现代前端组件树通信遵循严格的单向流动规则：
- **Props Down**：父组件向子组件单向传递只读属性数据；
- **Events Up**：子组件不得擅自修改 Prop，必须通过抛出自定义事件（\`emit\`）请求父组件修改。

\`\`\`mermaid
flowchart TD
    Parent["父组件 (CourseList)"]
    Child["子组件 (CourseCard)"]

    Parent -->|1. 传入只读数据 :course='item' (Props Down)| Child
    Child -->|2. 用户点击, 向上抛出事件 @enroll='handleEnroll' (Events Up)| Parent
\`\`\`

这样保证了**单一数据源（Single Source of Truth, SSOT）**，任何状态的修改源头都在父级清晰可溯。
`
  },
  {
    id: "doc:hello-system-21-component-lifecycle",
    slug: "21-component-lifecycle",
    parentId: "'doc:hello-system-part-2'",
    title: "第21章 组件什么时候出生？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 9,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第21章 组件什么时候出生？

## 1. 组件生命周期（Lifecycle Hooks）

组件在浏览器内存和 DOM 树中经历完整的生老病死：

\`\`\`mermaid
stateDiagram-v2
    [*] --> Setup: 组件实例化 (创建响应式状态)
    Setup --> Mounted: onMounted (真实 DOM 已挂载到页面, 适宜发起异步 API 请求)
    Mounted --> Updated: onUpdated (响应式状态改变, DOM 重新渲染完成)
    Mounted --> Unmounted: onUnmounted (组件被销毁, 必须清理定时器与全局事件监听)
    Unmounted --> [*]
\`\`\`

### 黄金法则：
- **网络请求发起时机**：通常在 \`onMounted()\` 中执行，保证数据返回时 DOM 容器已就绪；
- **防止内存泄漏**：在 \`onUnmounted()\` 中必须显式清理所有未完成的定时器（\`clearInterval\`）与全局事件监听器（\`window.removeEventListener\`）。
`
  },
  {
    id: "doc:hello-system-22-spa-and-client-routing",
    slug: "22-spa-and-client-routing",
    parentId: "'doc:hello-system-part-2'",
    title: "第22章 一个网站为什么能有很多“页面”？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 10,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第22章 一个网站为什么能有很多“页面”？

## 1. 单页面应用（SPA）与客户端路由

在传统网站中，点击链接会导致浏览器向后端请求一个全新的 HTML 文件并触发全屏白屏刷新。

而在现代单页面应用（SPA）中：
1. 整个网站**永远只有一个 HTML 入口**；
2. 当用户点击“查看课表”跳转到 \`/my-schedule\` 时，前端路由库（如 Vue Router）通过 **HTML5 History API（\`pushState\`）** 拦截浏览器跳转行为，静默修改地址栏 URL；
3. 根据当前 URL 动态卸载旧组件并挂载新组件，实现**丝滑零刷新的页面切换体验**。

\`\`\`mermaid
flowchart LR
    URL["用户点击路由链接 /schedule"] --> Router["前端路由器 Vue Router 拦截"]
    Router --> PushState["调用 history.pushState() 修改地址栏 (无网络刷新)"]
    Router --> SwitchComp["根据路由表在 <router-view> 中\n动态替换显示 ScheduleView 组件"]
\`\`\`
`
  },
  {
    id: "doc:hello-system-23-global-state-management",
    slug: "23-global-state-management",
    parentId: "'doc:hello-system-part-2'",
    title: "第23章 状态应该放在哪里？",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 11,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第23章 状态应该放在哪里？

## 1. 属性钻取（Prop Drilling）的极限与全局 Store

当处于树形结构不同分支的深层组件（如导航栏右侧的个人头像，与主界面右下角的选课结算单）都需要共享当前登录学生信息时，如果一层一层通过 Props 传递，会造成严重的**属性钻取地狱**。

全局状态管理库（如 Pinia）在全应用单例中维护公共状态池：

\`\`\`mermaid
flowchart TD
    subgraph GlobalPiniaStore ["全局状态仓库 (Pinia Store)"]
        UserState["currentUser: { id: 1001, name: '李雷' }"]
        EnrollState["enrolledCourses: [...]"]
    end

    CompA["HeaderAvatar 组件 (深层叶子节点)"] -->|直接订阅读取| UserState
    CompB["EnrollmentCheckout 组件 (深层叶子节点)"] -->|直接调用 Action 修改| EnrollState
\`\`\`
`
  },
  {
    id: "doc:hello-system-24-browser-data-vs-db-data",
    slug: "24-browser-data-vs-db-data",
    parentId: "'doc:hello-system-part-2'",
    title: "第24章 浏览器里的数据不是数据库里的数据",
    visibility: "public",
    authorEmail: "2251213429@qq.com",
    sortOrder: 12,
    isBook: 0,
    coverHue: 215,
    summary: "",
    bodyMd: `# 第24章 浏览器里的数据不是数据库里的数据

## 1. 五层数据形态的全景认知

在走过前端世界之后，每一个工程师必须树立清晰的数据介质分层认知：

\`\`\`mermaid
flowchart LR
    L1["1. DOM 树\n(UI 像素层)"] <--> L2["2. Vue Proxy 状态\n(浏览器 JS 堆内存)"]
    L2 <-->|JSON 序列化| L3["3. HTTP 报文\n(网络字节流传输层)"]
    L3 <-->|反序列化| L4["4. 后端 Entity/DTO\n(服务器堆内存)"]
    L4 <-->|SQL 驱动读写| L5["5. 关系表 / B+ 树 / 扇区\n(持久化物理磁盘)"]
\`\`\`

- 浏览器里的 JavaScript 变量是**脆弱的瞬态数据**，一旦用户按 F5 刷新或者断电，全部化为乌有；
- 只有经过网络协议跨越边界，写入数据库的持久化介质，数据才获得真正的生命。

接下来，我们将离开浏览器的图形世界，深入最坚固的物理数据堡垒——**第三部分：数据需要一个真正的家**。
`
  }
];
