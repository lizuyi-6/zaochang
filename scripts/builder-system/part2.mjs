// scripts/builder-system/part2.mjs
// 第二部分：页面开始变复杂 (13 ~ 24)
// 全量技术修订与规范化完整版本 (全 12 章高密度深度正文)

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

## 1. 最初情境：Web 标准三剑客

在现代前端框架普及之前，Web 应用依靠三项基础技术构建：
- **HTML（结构）**：使用标签定义文档的内容层级与语义；
- **CSS（表现）**：定义元素的布局、颜色与字体等视觉样式；
- **JavaScript（行为）**：通过浏览器提供的 API 实现事件监听与动态交互。

早期 Mini Campus 选课系统的一个最小页面如下：

\`\`\`html
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
        const btn = document.getElementById('enroll-btn');
        const countSpan = document.getElementById('remaining-count');

        btn.addEventListener('click', function() {
            if (remaining > 0) {
                remaining--;
                countSpan.innerText = remaining;
                if (remaining === 0) {
                    btn.disabled = true;
                    btn.innerText = '名额已满';
                }
            }
        });
    </script>
</body>
</html>
\`\`\`

---

## 2. 浏览器的渲染流程概览

当浏览器加载 HTML 时，底层渲染引擎大致经历以下阶段：

\`\`\`mermaid
flowchart TD
    HTML["HTML 字符流"] --> DOM["DOM 树 (Document Object Model)"]
    CSS["CSS 字符流"] --> CSSOM["CSSOM 树 (CSS Object Model)"]
    DOM --> RenderTree["渲染树 (Render Tree)"]
    CSSOM --> RenderTree
    RenderTree --> Layout["布局排版 (Layout / Reflow)\n计算盒模型的几何坐标与尺寸"]
    Layout --> Paint["绘制 (Paint)\n生成绘制指令与图层"]
    Paint --> Composite["图层合成 (Compositing)\n交付 GPU 最终显示"]
\`\`\`

> **注意**：
> 现代浏览器的渲染流水线并非严格单向的一次性过程，而是随着异步资源加载、脚本执行与样式变化动态交替进行的。

在简单交互场景下，原生 HTML/CSS/JS 具有零构建配置、无运行时框架体积开销的显著优势。
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

## 1. 复杂交互下的命令式 DOM 联动

随着功能扩展，选课页面增加了多个相互关联的 UI 区域：
1. 课程卡片中的剩余名额与按钮状态；
2. 顶部导航栏中的已选课程数量徽章；
3. 右侧侧边栏中的已选课程清单与总学分统计；
4. 筛选搜索框。

如果使用原生 JavaScript 采用命令式（Imperative）方式逐一更新 DOM：

\`\`\`javascript
function handleEnrollSuccess(course) {
    // 1. 手动修改卡片内文本
    const countEl = document.querySelector('#card-' + course.id + ' .count');
    countEl.innerText = parseInt(countEl.innerText) - 1;

    // 2. 手动修改按钮
    const btn = document.querySelector('#card-' + course.id + ' button');
    btn.disabled = true;
    btn.innerText = '已选修';

    // 3. 手动修改顶部徽章
    const badge = document.getElementById('enrolled-badge');
    badge.innerText = parseInt(badge.innerText) + 1;

    // 4. 手动向侧边栏追加 DOM 节点
    const list = document.getElementById('sidebar-list');
    const item = document.createElement('li');
    item.id = 'sidebar-item-' + course.id;
    item.innerText = course.name;
    list.appendChild(item);

    // 5. 手动更新总学分
    const creditEl = document.getElementById('total-credits');
    creditEl.innerText = parseInt(creditEl.innerText) + course.credits;
}
\`\`\`

---

## 2. 核心问题：状态分散在 DOM 中

\`\`\`mermaid
flowchart LR
    Event["选课事件触发"] -->|命令式逐一修改| DOM1["卡片剩余数字"]
    Event -->|命令式逐一修改| DOM2["卡片按钮 disabled 属性"]
    Event -->|命令式逐一修改| DOM3["顶部徽章计数"]
    Event -->|命令式逐一修改| DOM4["侧边栏 li 列表"]
    Event -->|命令式逐一修改| DOM5["总学分展示元素"]
\`\`\`

在命令式编程模式下：
1. **状态被隐式保存在 DOM 节点的文本与属性中**，缺乏单一明确的数据来源；
2. **多处修改容易产生不一致**：如果在退课或搜索重置逻辑中漏改了某一个 DOM 节点，界面各处的显示将产生冲突；
3. **事件与 DOM 呈现高度耦合的网状依赖**，维护成本随交互复杂度快速上升。
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

## 1. 范式转换：声明式（Declarative）编程

为了解决命令式 DOM 操作的维护困境，现代前端引入了**声明式 UI（Declarative UI）**范式：

> **开发者不再手动编写“如何操作 DOM”的每一步指令，而是维护一份纯内存状态（State），并声明“在特定状态下，UI 应该呈现出什么结构”。**

#### 核心抽象公式：
$$UI = f(State)$$

\`\`\`mermaid
flowchart LR
    State["内存状态 State\n{ courses: [...], enrolledIds: [101] }"] -->|声明式映射 f(State)| UI["渲染后的真实页面 UI"]
\`\`\`

---

## 2. 声明式 UI 的实现机制说明

需要说明的是，**虚拟 DOM（Virtual DOM）只是实现声明式 UI 的常见手段之一，而非唯一途径**：
- **React / Vue**：通过在内存中比对新旧虚拟 DOM 树（Diffing），计算出最小更新补丁（Patch）并批量应用到真实 DOM；
- **Svelte / SolidJS**：通过编译期分析或细粒度响应式订阅，直接在状态改变时精准更新对应的真实 DOM 节点，不依赖虚拟 DOM。

无论底层采用哪种技术，**以状态为中心（State-Driven）的心智模型**是现代前端开发的共同基石。
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

## 1. Vue 3 响应式的核心机制

Vue 3 的响应式系统围绕三个核心行为展开：
1. **拦截属性访问与修改**：
   - \`reactive()\` 主要使用 ES6 \`Proxy\` 拦截对象的读取（get）与写入（set）；
   - \`ref()\` 使用带有 \`.value\` 访问器属性（getter/setter）的 RefImpl 对象；
2. **依赖收集（Track）**：在执行副作用函数（如组件渲染函数）期间，若读取了响应式属性，系统将当前活跃的副作用函数（Effect）记录为该属性的依赖；
3. **依赖触发（Trigger）**：当响应式属性被修改时，系统查找并重新执行该属性收集到的所有副作用函数。

\`\`\`mermaid
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
\`\`\`

---

## 2. 最小响应式原理代码示例

\`\`\`javascript
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
\`\`\`

---

## 3. 本章小结

1. 响应式系统通过拦截数据的读写操作，实现依赖自动收集与自动通知；
2. Vue 3 中 \`reactive\` 使用 \`Proxy\`，\`ref\` 使用访问器属性，其上层统一遵循 track/trigger 响应式模型。
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

## 1. 派生状态与缓存机制

在选课系统中，已选总学分是由已选课程列表计算而来的**派生状态（Derived State）**。

如果将其写为普通方法并在模板中多次调用：
\`\`\`html
<p>总学分: {{ calculateTotalCredits() }}</p>
<p>总学分: {{ calculateTotalCredits() }}</p>
\`\`\`
只要组件因任何无关状态改变而重新渲染，普通方法都会被重复执行。

---

## 2. computed 的工作原理

\`computed()\` 创建一个具有**依赖追踪与缓存特性**的响应式引用：
1. **自动追踪依赖**：\`computed\` 内部自动收集其所引用的响应式数据（如 \`enrolledCourses\`）；
2. **基于依赖缓存**：只要所依赖的源数据未发生变化，多次访问 \`computed\` 属性会直接返回缓存值；
3. **惰性失效**：当源数据变化时，将缓存标记为失效，在下一次被读取时才重新计算。

\`\`\`mermaid
flowchart TD
    Access["访问 computed.value"] --> CheckDirty{"依赖源数据是否发生过变更?"}
    CheckDirty -->|是| ReCalc["重新执行计算函数并更新缓存"]
    CheckDirty -->|否| ReturnCache["直接返回缓存结果 (零计算开销)"]
\`\`\`

> **设计原则提示**：
> \`computed\` 的计算函数应当设计为纯函数，避免在其中执行异步请求或修改其他状态等副作用操作。
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

## 1. 纯计算与副作用（Side Effects）的区分

- **\`computed\`**：适用于**纯派生数据**。根据状态生成新的数据，不修改外部环境；
- **\`watch\` / \`watchEffect\`**：专门用于处理**副作用（Side Effects）**。当状态变化时，执行与外部系统的交互操作（如发起网络请求、修改 LocalStorage、手动操作 DOM 或设置定时器）。

\`\`\`javascript
import { ref, watch } from 'vue';

const selectedCourseId = ref(null);
const courseDetail = ref(null);

// 状态变化时触发异步网络请求副作用
watch(selectedCourseId, async (newId, oldId, onCleanup) => {
    if (!newId) return;

    let isCancelled = false;
    onCleanup(() => {
        isCancelled = true; // 处理并发或组件卸载时的清理逻辑
    });

    const res = await fetch(\`/api/courses/\${newId}\`);
    const data = await res.json();
    if (!isCancelled) {
        courseDetail.value = data;
    }
});
\`\`\`

---

## 2. 避免用 watch 替代 computed

初学者常会使用 \`watch\` 手动更新另一个 \`ref\` 来实现派生数据，这会增加不必要的状态管理开销并容易导致循环更新。对于纯数据推导，应优先使用 \`computed\`。
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

## 1. 单巨石页面的维护瓶颈

当一个页面包含课程搜索、卡片网格、侧边栏、分页器与详情弹窗时，将所有模板、样式与状态都堆在单文件中会导致：
- 状态变量命名空间混杂；
- 单一功能逻辑难以独立复用与测试；
- 团队多人协作容易产生代码冲突。

---

## 2. 组件化（Component-Based Architecture）

组件化将页面拆解为由树形结构组织的独立可复用单元：

\`\`\`mermaid
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
\`\`\`

每个组件封装了自身的结构、样式与局部交互逻辑，通过明确的接口与外部进行数据通信。
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

## 1. 单向数据流（One-Way Data Flow）模式

在父子组件通信中，**Props Down, Events Up** 是最基础且推荐的单向数据流模型：
- **Props Down**：父组件向子组件单向传递只读属性；
- **Events Up**：子组件通过触发自定义事件通知父组件发生状态变更意图。

\`\`\`mermaid
flowchart TD
    Parent["父组件 (CourseListView)"]
    Child["子组件 (CourseCard)"]

    Parent -->|1. Props 传递只读数据 :course='item'| Child
    Child -->|2. Emit 抛出事件 @enroll='handleEnroll'| Parent
\`\`\`

---

## 2. Props 的单向绑定说明

在 Vue 规范中：
- 子组件**严禁直接对接收到的 Prop 变量进行重新赋值**（如 \`props.course = newObj\`）；
- 若 Prop 为对象或数组，直接修改其内部嵌套属性虽然在技术上可能影响父组件，但这破坏了单向数据流的可追踪性，属于不推荐的做法。

---

## 3. 多种通信方式的适用场景

除了 Props/Emit 之外，现代前端还提供了其他通信手段：
- **provide / inject**：用于跨多层级的深层依赖传递；
- **全局状态管理（如 Pinia）**：用于跨路由、多视图共享的应用级状态；
- **组合式函数（Composables）**：用于在不同组件间复用有状态的业务逻辑。
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

## 1. 组件的生命周期过程

组件从被创建到最终销毁经历多个阶段：

\`\`\`mermaid
stateDiagram-v2
    [*] --> Setup: 初始化阶段 (创建响应式状态与计算属性)
    Setup --> Mounted: onMounted (DOM 节点挂载完成)
    Mounted --> Updated: onUpdated (响应式数据改变触发重新渲染)
    Mounted --> Unmounted: onUnmounted (组件销毁卸载)
    Unmounted --> [*]
\`\`\`

---

## 2. 数据获取与资源清理

1. **异步数据获取时机**：
   - 可以在 \`onMounted()\` 中发起初始数据请求，此时 DOM 容器已就绪；
   - 在支持服务端渲染（SSR）或使用路由导航守卫的架构中，数据也可在进入组件前由数据加载层完成预获取。
2. **清理副作用防止内存泄漏**：
   - 若在组件内注册了全局事件监听（如 \`window.addEventListener\`）或定时器（\`setInterval\`），必须在 \`onUnmounted()\` 中进行显式解绑与清理。
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

## 1. MPA 与 SPA 的架构差异

- **多页面应用（MPA, Multi-Page Application）**：每次页面跳转均向服务器请求全新的 HTML 文件，浏览器执行完整页面刷新；
- **单页面应用（SPA, Single-Page Application）**：初始只加载单个 HTML 入口，后续的“页面切换”由客户端 JavaScript 动态替换视图组件完成，避免了全屏刷新。

---

## 2. 客户端路由（Client-Side Routing）原理

客户端路由器（如 Vue Router）主要利用 **HTML5 History API** 实现无刷新导航：

\`\`\`mermaid
flowchart LR
    UserNav["用户点击导航链接 /schedule"] --> Router["前端路由器拦截点击"]
    Router --> HistoryAPI["调用 history.pushState() 更新浏览器地址栏 (无网络刷新)"]
    Router --> ComponentSwap["根据路由配置动态渲染对应的视图组件"]
\`\`\`

- \`history.pushState()\` 和 \`history.replaceState()\` 允许在不重新加载页面的前提下修改浏览器地址栏；
- 浏览器前进/后退时触发 \`popstate\` 事件，路由器捕获后同步更新对应的视图组件。
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

## 1. 跨层级状态共享与 Pinia

当系统中多个不具备直接父子关系的组件（如顶部用户信息与右侧购物车抽屉）都需要访问同一份数据时，若仅靠状态提升（Lifting State Up）和 Props 层层透传（Prop Drilling），会导致中间组件充斥无关参数。

**Pinia** 是 Vue 官方推荐的状态管理库，其核心心智模型包括：
- **Store**：支持按业务模块定义多个独立的 Store（如 \`useUserStore\`, \`useCourseStore\`）；
- **State**：保存全局共享的响应式数据；
- **Getters**：基于 State 的派生计算属性；
- **Actions**：包含同步或异步的业务操作方法。

\`\`\`mermaid
flowchart TD
    subgraph PiniaStore ["Pinia Store (useCourseStore)"]
        State["state: { enrolledList: [] }"]
        Actions["action: enroll(courseId)"]
    end

    CompA["HeaderBadge.vue"] -->|读取已选数量| State
    CompB["CourseCard.vue"] -->|触发选课操作| Actions
\`\`\`

> **架构提示**：
> Pinia 的 Store 实例与具体的 Vue 应用实例绑定，在服务端渲染（SSR）场景下会为每个请求创建独立的状态实例，避免不同用户之间的状态污染。
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

## 1. 数据形态的五层空间演变

在理解完整的软件系统时，开发者需要清晰认识到数据在不同层次中的存在形式：

\`\`\`mermaid
flowchart LR
    L1["1. DOM 树呈现\n(用户可见的视图文字)"] <--> L2["2. 浏览器 JS 内存\n(响应式 Proxy / Ref 对象)"]
    L2 <-->|JSON 序列化与反序列化| L3["3. HTTP 报文内容\n(网络传输字节流)"]
    L3 <-->|反序列化与映射| L4["4. 后端服务内存\n(Java 领域对象 / DTO)"]
    L4 <-->|数据库引擎持久化| L5["5. 数据库存储介质\n(关系表 / 索引 / 磁盘页)"]
\`\`\`

- **瞬态数据（Transient Data）**：浏览器内存中的 JavaScript 变量和 DOM 结构属于瞬态数据，页面刷新或窗口关闭后即被销毁；
- **持久数据（Persistent Data）**：经过网络协议传输至后端、最终写入数据库管理系统的数据，具备事务与持久性保障。

接下来，我们将深入数据持久化的核心领域——**第三部分：数据需要一个真正的家**。
`
  }
];
