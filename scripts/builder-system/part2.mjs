// scripts/builder-system/part2.mjs
// 《Hello System · 图解软件系统》第二部分：页面开始变复杂 (第 13 ~ 24 章)（全量教材化深度扩写版本）

const part2Docs = [];

// 顶层部分节点
part2Docs.push({
  id: "doc:hello-system-part-2",
  slug: "part-2",
  parentId: "'doc:book-hello-system'",
  title: "第二部分: 页面开始变复杂 (13~24)",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 2,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第二部分: 页面开始变复杂 (13~24)

本部分聚焦于**现代 Web 前端框架的核心原理与演进逻辑**。

我们将从浏览器的底层渲染流水线与原生 DOM 树出发，亲历命令式 DOM 操作在大型应用中导致的状态脱节灾难。我们将深入剖析声明式 UI（$UI = f(\\text{state})$）、Vue 3 的 Proxy 响应式系统（依赖收集与派发更新）、计算属性缓存、编译期优化、单向数据流组件化以及全局状态树 Pinia，彻底打通前端“数据如何驱动界面”的心智模型。
`
});

// 第 13 章
part2Docs.push({
  id: "doc:hello-system-13-browser-and-dom",
  slug: "13-browser-and-dom",
  parentId: "'doc:hello-system-part-2'",
  title: "第13章 浏览器如何看待网页：DOM 树与渲染流水线",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 13,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第13章 浏览器如何看待网页：DOM 树与渲染流水线

## 1. 从纯文本到内存对象树：HTML 解析与 DOM

当浏览器从网络中接收到一段 HTML 文本时，它并不能直接在屏幕上把文字显示出来。

浏览器内核（如 Chromium 的 Blink 或 WebKit）必须经历以下严密的数据结构构建过程：

\`\`\`mermaid
flowchart LR
    HTML["HTML 字符流\n<div class='course'>...</div>"] --> Tokenizer["词法分析 (Tokenization)\n生成 StartTag, Characters, EndTag"]
    Tokenizer --> TreeBuilder["语法分析 (Tree Construction)\n维护节点父子包含关系栈"]
    TreeBuilder --> DOMTree["DOM 树 (内存 C++ 节点树)\nDocument Object Model"]
\`\`\`

最终在浏览器内存中建立的 **DOM 树（Document Object Model Tree）** 是一组相互关联的 C++ 原生对象：

\`\`\`text
                [ Document ]
                     │
                 [ <html> ]
                     │
                 [ <body> ]
                     │
            [ <div class="card"> ]
             ├── [ <h1> "计算机系统导论" ]
             ├── [ <p> "已选: 1/100" ]
             └── [ <button> "选课" ]
\`\`\`

---

## 2. 浏览器的经典渲染流水线（Rendering Pipeline）

当 DOM 树与 CSS 规则树（CSSOM）构建完成后，浏览器开始执行完整的渲染流水线：

\`\`\`mermaid
flowchart TD
    DOM["DOM 树 (结构)"] & CSSOM["CSSOM 树 (样式)"] --> RenderTree["1. 渲染树构建 (Render Tree)\n过滤掉 display:none 的不可见节点"]
    RenderTree --> Layout["2. 布局计算 (Layout / Reflow)\n计算每个几何元素的绝对像素坐标 (X, Y, W, H)"]
    Layout --> Paint["3. 绘制记录 (Paint)\n生成各图层的绘制指令列表 (边框、背景、文字)"]
    Paint --> Composite["4. 栅格化与图层合成 (Raster & Composite)\n利用 GPU 将矢量指令光栅化为屏幕像素位图"]
\`\`\`

1. **重排 / 回流（Reflow / Layout）**：当元素的几何尺寸（宽高、位置、边距）发生变化时，浏览器必须重新遍历渲染树，计算整棵树上相关节点的几何坐标。这是性能开销最大的操作之一；
2. **重绘（Repaint）**：当仅有颜色、背景等不影响几何尺寸的外观发生变化时，浏览器跳过布局直接重新绘制；
3. **强制同步布局（Forced Synchronous Layout）**：如果在 JavaScript 中频繁交替执行“写入 DOM”与“读取几何属性（如 \`offsetHeight\`）”，浏览器将被迫在每一帧内多次强制执行昂贵的重排，导致严重的页面掉帧卡顿（Layout Thrashing）。
`
});

// 第 14 章
part2Docs.push({
  id: "doc:hello-system-14-dom-chaos",
  slug: "14-dom-chaos",
  parentId: "'doc:hello-system-part-2'",
  title: "第14章 命令式 DOM 操作的失控：从 jQuery 到手动同步灾难",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 14,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第14章 命令式 DOM 操作的失控：从 jQuery 到手动同步灾难

## 1. 命令式编程（Imperative Programming）的原生写法

在现代前端框架诞生前，开发者使用原生 JavaScript 或 jQuery 直接操作 DOM 节点：

\`\`\`javascript
// 模拟一次选课点击事件
document.getElementById("btn-enroll").addEventListener("click", function() {
    // 1. 手动从 DOM 中抓取当前文本并解析出数字
    let text = document.getElementById("enrolled-count").innerText;
    let count = parseInt(text.split("/")[0].replace("已选: ", "").trim());
    let capacity = 100;

    // 2. 判断业务条件
    if (count < capacity) {
        count++;
        // 3. 手动修改数据展示 DOM
        document.getElementById("enrolled-count").innerText = "已选: " + count + "/" + capacity;
        // 4. 手动修改按钮状态
        if (count >= capacity) {
            document.getElementById("btn-enroll").setAttribute("disabled", "true");
            document.getElementById("btn-enroll").innerText = "名额已满";
            document.getElementById("status-badge").className = "badge badge-full";
        }
    }
});
\`\`\`

---

## 2. 状态同步灾难（State Synchronization Nightmare）

上述代码在只有一个按钮的小页面里运行良好。

但如果页面需求发生变化：
- 顶部导航栏增加了一个“全校已选总门数统计”；
- 页面右侧增加了一个“我的选课小票预览”；
- 增加了后台轮询更新（其他同学退选，名额空出）。

此时，只要课程人数发生改变，开发者必须**在所有可能引起数据变化的业务路径里，手动找到这 4 处 DOM 节点并逐一执行修改**！

\`\`\`mermaid
flowchart TD
    StateChange["选课人数变化 (count++)"] --> Op1["手动修改 #enrolled-count 文本"]
    StateChange --> Op2["手动修改 #btn-enroll disabled 属性"]
    StateChange --> Op3["手动修改 #status-badge class 类名"]
    StateChange --> Op4["手动修改 #nav-total-count 统计"]
    StateChange --> Op5["手动更新 #drawer-cart 侧边栏列表"]
\`\`\`

只要任何一个分支少写了一句 \`document.getElementById().innerText = ...\`，用户就会看到极其怪异的画面：**按钮显示已满员置灰，但文本却依然显示 99/100**。

核心矛盾暴露无遗：**真实的状态数据被碎片化地编码并散落在了成百上千个 HTML DOM 属性中，系统失去了唯一定义事实的中心源头。**
`
});

// 第 15 章
part2Docs.push({
  id: "doc:hello-system-15-state-driven-ui",
  slug: "15-state-driven-ui",
  parentId: "'doc:hello-system-part-2'",
  title: "第15章 声明式 UI：UI 是状态的纯函数 UI = f(state)",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 15,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第15章 声明式 UI：UI 是状态的纯函数 UI = f(state)

## 1. 概念革命：从“如何修改”到“应该长什么样”

为了彻底消灭手动同步 DOM 的混乱，现代前端框架（React、Vue、Svelte）提出了一场深刻的心智模型革命——**声明式 UI（Declarative UI）**：

$$\\text{UI} = f(\\text{state})$$

- **开发者唯一的职责**：维护内存中纯粹的 JavaScript 数据状态（\`state\`），并使用模板声明视图与状态之间的映射函数（\`f\`）；
- **框架的核心职责**：当 \`state\` 发生改变时，自动化地对比新旧视图结构，并将必要的差异高效应用到真实 DOM 上。

\`\`\`html
<!-- Vue 声明式模板示例 -->
<template>
  <div class="course-card">
    <h3>{{ course.name }}</h3>
    <p>已选人数: {{ course.enrolled }} / {{ course.capacity }}</p>
    <button :disabled="isFull" @click="handleEnroll">
      {{ isFull ? '名额已满' : '立即选课' }}
    </button>
  </div>
</template>
\`\`\`

开发者在业务代码中**只需要执行 \`course.enrolled++\`**，所有依赖该数据的文本、按钮禁用状态、样式类名都由框架自动且精准地批量更新。

---

## 2. 虚拟 DOM（Virtual DOM）与协调算法的客观认识

在以 Vue 和 React 为代表的框架实现中，**虚拟 DOM（Virtual DOM）** 扮演了重要的桥梁角色。

虚拟 DOM 本质上是一个用纯 JavaScript 对象描述真实 DOM 树结构的轻量级数据表示：

\`\`\`javascript
const vnode = {
    tag: 'div',
    props: { class: 'course-card' },
    children: [
        { tag: 'p', children: '已选人数: 1/100' },
        { tag: 'button', props: { disabled: false }, children: '立即选课' }
    ]
};
\`\`\`

> **算法规范说明**：
> 虚拟 DOM 的协调算法（Reconciliation / Diff）根据新旧虚拟 DOM 树的差异，推导出需要应用到真实 DOM 上的具体更新操作。
> 需要明确：**这是一种工程上的高效启发式对比算法（通常采用同层比对与 Key 复用策略），并不暗示在数学意义上求解全局绝对最小编辑距离（Minimum Edit Distance）。**
`
});

// 第 16 章
part2Docs.push({
  id: "doc:hello-system-16-vue-reactivity",
  slug: "16-vue-reactivity",
  parentId: "'doc:hello-system-part-2'",
  title: "第16章 Vue 3 响应式核心：依赖收集与派发更新",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 16,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第16章 Vue 3 响应式核心：依赖收集与派发更新

## 1. 响应式的核心命题

请思考一个最朴素的 JavaScript 现象：

\`\`\`javascript
let enrolled = 1;
let message = "当前已选: " + enrolled;
console.log(message); // 输出: 当前已选: 1

enrolled = 2;
console.log(message); // 依然输出: 当前已选: 1！
\`\`\`

在标准 JavaScript 语法中，变量赋值是一个**瞬时动作**。修改 \`enrolled\` 的值，绝不会自动触发 \`message\` 的重新计算。

Vue 3 响应式系统的全部使命，就是**建立一套自动化的“依赖追踪（Track）”与“派发更新（Trigger）”机制**。

---

## 2. 响应式基石：ES6 Proxy 拦截机制

Vue 3 使用标准的 ES6 \`Proxy\` 对象对目标对象进行透明拦截包装：

\`\`\`mermaid
flowchart TD
    UserCode["用户代码: state.enrolled = 2"] --> ProxySet["Proxy set 陷阱 (Setter Trap)"]
    ProxySet --> ReflectSet["Reflect.set(target, key, value) 写入底层对象"]
    ProxySet --> Trigger["trigger(target, key) 派发更新: 通知所有订阅该属性的副作用函数重新执行"]

    ReadCode["渲染函数读取: state.enrolled"] --> ProxyGet["Proxy get 陷阱 (Getter Trap)"]
    ProxyGet --> Track["track(target, key) 依赖收集: 记录当前正在执行的 activeEffect"]
    ProxyGet --> ReflectGet["Reflect.get(target, key) 返回真实值"]
\`\`\`

---

## 3. 依赖关系全局数据结构：\`targetMap\`

Vue 3 内部维护了一个高度优化的三层桶结构，用于精确记录“谁依赖了哪个对象的哪个属性”：

\`\`\`text
targetMap (WeakMap)
  └── [ target 对象 (例如 course) ] : (Map)
        └── [ key 属性名 (例如 "enrolled") ] : (Set)
              └── Effect 1: 组件渲染更新函数 RenderEffect
              └── Effect 2: 计算属性 ComputedEffect
\`\`\`

- **依赖收集（Track）**：当某个渲染函数或副作用函数执行时，它会被设置为全局的 \`activeEffect\`。当它读取 \`state.enrolled\` 时，触发 \`get\` 拦截，Vue 将当前 \`activeEffect\` 注册到对应属性的 \`Set\` 集合中；
- **派发更新（Trigger）**：当执行 \`state.enrolled = 2\` 时，触发 \`set\` 拦截，Vue 立即从 \`targetMap\` 中取出该属性对应的所有 \`Effect\` 并依次重新执行，从而精准驱动组件视图重绘！
`
});

// 第 17 章
part2Docs.push({
  id: "doc:hello-system-17-computed-properties",
  slug: "17-computed-properties",
  parentId: "'doc:hello-system-part-2'",
  title: "第17章 computed 计算属性：脏值检查与惰性求值",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 17,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第17章 computed 计算属性：脏值检查与惰性求值

## 1. 为什么不直接用普通方法？

在 Vue 组件中，我们常常需要从原始状态衍生出新的展示数据（例如判断课程是否已满员）：

\`\`\`javascript
// 方案 A: 使用普通函数方法
function isFullMethod() {
    console.log("执行了方法计算");
    return course.enrolled >= course.capacity;
}

// 方案 B: 使用 computed 计算属性
const isFullComputed = computed(() => {
    console.log("执行了 computed 计算");
    return course.enrolled >= course.capacity;
});
\`\`\`

如果模板中有 5 处引用了 \`isFull\`，或者组件因为其他完全无关的状态（例如输入框内容）发生重新渲染：
- **普通方法**：每一次渲染都会**无条件重新执行 5 次**复杂计算；
- **computed 计算属性**：只要其依赖的 \`course.enrolled\` 和 \`course.capacity\` 没有发生改变，它会直接返回**内存缓存结果**，计算逻辑一次都不会重复执行！

---

## 2. 脏值检查（Dirty Flag）与惰性求值（Lazy Evaluation）

\`computed\` 内部通过一个布尔标志位 \`_dirty\` 实现高效的惰性求值：

\`\`\`mermaid
flowchart TD
    Init["初始化: _dirty = true, 缓存 _value = undefined"] --> FirstRead["第一次读取 computed 值"]
    FirstRead --> Eval["_dirty 为 true: 触发求值计算, 更新 _value, 设 _dirty = false"]
    Eval --> Return1["返回计算结果"]

    SubRead["后续再次读取 computed 值"] --> CheckDirty{"_dirty 是否为 true ?"}
    CheckDirty -->|否 (依赖未变)| Cache["直接返回缓存 _value, 零计算开销"]
    CheckDirty -->|是 (依赖已变更)| Eval

    DepChange["依赖发生变化: course.enrolled++"] --> TriggerComputed["触发 computed 内部调度器: 仅将 _dirty 设为 true, 暂不执行计算 (惰性)"]
\`\`\`

这种设计避免了昂贵的衍生数据计算在状态频繁变化时产生不必要的 CPU 浪费。
`
});

// 第 18 章
part2Docs.push({
  id: "doc:hello-system-18-watch-and-side-effects",
  slug: "18-watch-and-side-effects",
  parentId: "'doc:hello-system-part-2'",
  title: "第18章 watch 与副作用管理：何时触发外部世界？",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 18,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第18章 watch 与副作用管理：何时触发外部世界？

## 1. 明确区分：computed 与 watch 的边界

初学者经常在什么时候用 \`computed\`、什么时候用 \`watch\` 之间产生混淆：

| 维度 | \`computed\` 计算属性 | \`watch\` 侦听器 |
| :--- | :--- | :--- |
| **主要定位** | **纯粹的数据映射**：从现有响应式状态衍生出新的同步数据 | **执行副作用（Side Effects）**：当状态变化时，与外部非响应式世界交互 |
| **返回值** | **必须有返回值**，对外暴露为只读的 Ref | **没有返回值**，用于执行动作（如发送网络请求、操作 localStorage） |
| **异步支持** | 必须是同步纯函数，禁止在内部执行异步操作 | 天生支持在回调函数中编写异步 \`async/await\` 逻辑 |

---

## 2. 副作用清理：防范竞态条件（Race Condition）

当用户快速切换下拉菜单中的选修课程时，系统会频繁发起异步查询。

如果第一次请求耗时 800ms，第二次请求耗时 200ms，第二次请求的响应可能会先到达，随后第一次请求的旧数据返回并覆盖最新视图，造成严重的**竞态条件（Race Condition）**。

Vue 3 的 \`watch\` 提供了专用的清理回调 \`onCleanup\`：

\`\`\`javascript
watch(currentCourseId, (newId, oldId, onCleanup) => {
    const controller = new AbortController();
    
    // 注册清理回调：当下一次监听触发或组件卸载时自动执行
    onCleanup(() => {
        controller.abort(); // 立即取消上一次尚未完成的 HTTP 请求！
    });

    fetchCourseDetail(newId, { signal: controller.signal })
        .then(data => { courseDetail.value = data; })
        .catch(err => {
            if (err.name !== 'AbortError') console.error(err);
        });
});
\`\`\`
`
});

// 第 19 章
part2Docs.push({
  id: "doc:hello-system-19-templates-and-reactivity-compiler",
  slug: "19-templates-and-reactivity-compiler",
  parentId: "'doc:hello-system-part-2'",
  title: "第19章 模板编译：为什么 Vue 模板能被精准优化？",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 19,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第19章 模板编译：为什么 Vue 模板能被精准优化？

## 1. 纯运行时比对的瓶颈

在纯运行时的虚拟 DOM 框架中，当组件更新时，框架必须递归遍历整棵虚拟 DOM 树上的所有节点。即使一个节点是完全静态的纯文字（如 \`<h1>选课中心</h1>\`），协调算法也必须遍历它并比对它的属性。

---

## 2. Vue 3 编译期优化：静态提升与补丁标记（Patch Flags）

Vue 3 的模板编译器在构建阶段（Build Time）对模板进行了深度的静态结构分析：

\`\`\`html
<div class="card">
  <h1>Mini Campus 选课系统</h1>       <!-- 静态节点 1: 绝对不变 -->
  <p>固定选课规则说明...</p>           <!-- 静态节点 2: 绝对不变 -->
  <span :class="themeClass">{{ course.name }}</span> <!-- 动态节点: 仅 class 和 text 变化 -->
</div>
\`\`\`

编译后生成的渲染函数代码：

\`\`\`javascript
// 1. 静态提升 (Static Hoisting)：静态节点在内存中只创建一次，重复复用
const _hoisted_1 = /*#__PURE__*/_createElementVNode("h1", null, "Mini Campus 选课系统", -1);
const _hoisted_2 = /*#__PURE__*/_createElementVNode("p", null, "固定选课规则说明...", -1);

export function render(_ctx, _cache) {
  return (_openBlock(), _createElementBlock("div", { class: "card" }, [
    _hoisted_1,
    _hoisted_2,
    // 2. 补丁标记 (Patch Flag): 9 代表 TEXT + CLASS 动态绑定
    _createElementVNode("span", { class: _ctx.themeClass }, _toDisplayString(_ctx.course.name), 9 /* TEXT, CLASS */)
  ]))
}
\`\`\`

当数据发生改变时，Vue 的 Diff 算法通过 Block Tree **直接跳过所有静态节点，精准定位到带有 Patch Flag 的动态节点**，比对效率提升了一个数量级。
`
});

// 第 20 章
part2Docs.push({
  id: "doc:hello-system-20-components-and-props-emit",
  slug: "20-components-and-props-emit",
  parentId: "'doc:hello-system-part-2'",
  title: "第20章 组件化与单向数据流：Props Down, Events Up",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 20,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第20章 组件化与单向数据流：Props Down, Events Up

## 1. 单向数据流（One-Way Data Flow）黄金法则

在组件化架构中，组件之间的数据流动必须遵守严格的单向约束：

\`\`\`mermaid
flowchart TD
    Parent["父组件: CourseList.vue (拥有真实的课程数据列表)"]
    Child["子组件: CourseCard.vue (专职单门课程卡片的展示与交互)"]

    Parent -->|1. Props Down (只读传递数据)| Child
    Child -->|2. Events Up (抛出业务事件 emit('enroll', id))| Parent
\`\`\`

- **Props Down**：父组件通过属性（Props）向子组件自顶向下传递数据；
- **Events Up**：子组件通过自定义事件（Emit）向父组件通知交互意图，**绝不直接在子组件内部修改 Props 传入的数据**。

---

## 2. 为什么严禁在子组件内部直接修改 Props？

如果允许子组件随意执行 \`props.course.enrolled++\`，当多个子组件同时引用同一份数据时，数据的修改来源将变得完全不可追踪。

一旦发生数据错误，你无法确定到底是哪一个子组件在什么时机篡改了状态。

单向数据流确保了：**谁拥有数据（Source of Truth），谁才拥有修改该数据的唯一权力。**
`
});

// 第 21 章
part2Docs.push({
  id: "doc:hello-system-21-component-lifecycle",
  slug: "21-component-lifecycle",
  parentId: "'doc:hello-system-part-2'",
  title: "第21章 组件生命周期与挂载时机",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 21,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第21章 组件生命周期与挂载时机

## 1. 组件生命周期全景

一个 Vue 组件实例从创建到销毁，会经历确定的生命周期阶段：

\`\`\`mermaid
flowchart TD
    Setup["1. setup() 执行 / 响应式状态初始化"] --> Mount["2. onMounted(): 真实 DOM 挂载完毕 (此时可安全进行 DOM 测量或发起首屏 API 请求)"]
    Mount --> Update["3. onUpdated(): 响应式数据变化，完成 DOM 补丁重绘"]
    Update --> Unmount["4. onUnmounted(): 组件从页面卸载销毁 (必须在此清理定时器与全局事件监听)"]
\`\`\`

---

## 2. 常见的内存泄漏陷阱

在 \`onMounted\` 中注册了全局事件监听器或定时器，却忘记在 \`onUnmounted\` 中销毁，是导致前端单页应用（SPA）内存暴涨的最常见原因：

\`\`\`javascript
export default {
  setup() {
    let timerId = null;

    onMounted(() => {
      // 开启定时轮询最新名额
      timerId = setInterval(() => {
        fetchLatestCapacity();
      }, 5000);
    });

    onUnmounted(() => {
      // 严禁遗漏：离开页面时必须彻底清除定时器！
      if (timerId) clearInterval(timerId);
    });
  }
}
\`\`\`
`
});

// 第 22 章
part2Docs.push({
  id: "doc:hello-system-22-form-binding-vmodel",
  slug: "22-form-binding-vmodel",
  parentId: "'doc:hello-system-part-2'",
  title: "第22章 双向绑定的表单真相：v-model 的语法糖展开",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 22,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第22章 双向绑定的表单真相：v-model 的语法糖展开

## 1. \`v-model\` 不是黑魔法

很多初学者将 \`v-model\` 视为一种神奇的“底层双向通道”。

实际上，\`v-model\` 本质上只是一个**单向数据绑定 + 事件监听的编译期语法糖（Syntax Sugar）**：

\`\`\`html
<!-- 开发者书写的语法糖 -->
<input v-model="searchKeyword" />

<!-- 编译器等价展开后的真实代码 -->
<input 
  :value="searchKeyword" 
  @input="searchKeyword = $event.target.value" 
/>
\`\`\`

---

## 2. 中文输入法（IME）的特殊处理

在处理中文、日文等需要输入法输入拼音的场景中，原生 \`@input\` 会在每一个拼音字符敲入时立即触发。

Vue 内部通过监听 \`compositionstart\` 与 \`compositionend\` 原生事件，确保只有在用户选定汉字并完成组字后，才会最终更新响应式变量，避免了半成品拼音引发的高频无效查询。
`
});

// 第 23 章
part2Docs.push({
  id: "doc:hello-system-23-global-state-pinia",
  slug: "23-global-state-pinia",
  parentId: "'doc:hello-system-part-2'",
  title: "第23章 跨组件状态共享：Pinia 与全局状态树",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 23,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第23章 跨组件状态共享：Pinia 与全局状态树

## 1. 属性逐级透传（Prop Drilling）的痛苦

当应用规模扩大到数十个组件时，如果顶级组件中的“当前登录学生信息（User Profile）”需要传递给位于组件树第 6 层的某个按钮组件，开发者不得不通过 Props 一层一层往下透传：

\`\`\`text
App -> MainLayout -> ContentArea -> CourseTabs -> CourseList -> CourseItem -> EnrollButton
\`\`\`

中间的 5 层组件根本不需要这些数据，却被迫充当了机械的传话筒。

---

## 2. 全局状态存储库（Pinia Store）架构

Pinia 提供了全局中心化的状态管理模型：

\`\`\`mermaid
flowchart LR
    subgraph Store["Pinia 全局 Store (useEnrollmentStore)"]
        State["State: 响应式全局选课列表 & 用户 Token"]
        Getters["Getters: 衍生计算 (已选总学分)"]
        Actions["Actions: 业务用例方法 (executeEnroll(id))"]
    end

    CompA["组件 A (导航栏)"] -->|读取| Getters
    CompB["组件 B (选课按钮)"] -->|派发动作| Actions
\`\`\`

任何深度的组件都可以直接通过 \`useEnrollmentStore()\` 访问全局状态并调用 Actions 方法，彻底解决了跨层级通信难题。
`
});

// 第 24 章
part2Docs.push({
  id: "doc:hello-system-24-client-data-metamorphosis",
  slug: "24-client-data-metamorphosis",
  parentId: "'doc:hello-system-part-2'",
  title: "第24章 前端数据形态的演变：从用户交互到网络报文",
  visibility: "public",
  authorEmail: "2251213429@qq.com",
  sortOrder: 24,
  isBook: 0,
  coverHue: 215,
  summary: "",
  bodyMd: `# 第24章 前端数据形态的演变：从用户交互到网络报文

## 1. 前端全流程数据形态流转

在结束前端部分的探索前，让我们完整梳理一次点击在浏览器内存中的数据形态演变：

\`\`\`mermaid
flowchart TD
    Step1["1. 物理交互\n用户鼠标点击坐标 (X: 520, Y: 340)"] --> Step2["2. 操作系统与浏览器事件\n产生原生 PointerEvent / MouseEvent 实例"]
    Step2 --> Step3["3. Vue 事件绑定与响应式状态跃迁\nhandleClick 触发: isSubmitting.value = true"]
    Step3 --> Step4["4. 内存业务对象构造\nconst payload = { courseId: 2048, timestamp: 1787932800 }"]
    Step4 --> Step5["5. 序列化编码 (JSON.stringify)\n转换为纯文本字符串: '{\"courseId\":2048}'"]
    Step5 --> Step6["6. 网络协议栈编码\nUTF-8 字符流转换为二进制 TCP 载荷，装配 HTTP POST 报文头"]
\`\`\`

---

## 2. 走向持久化世界

至此，我们已经看清了浏览器内部的数据生命周期。

但是，无论前端的响应式系统多么优雅，运行在浏览器内存中的 JavaScript 对象都是**瞬态的**——只要用户按一下 \`F5\` 刷新网页，所有的内存变量都会瞬间灰飞烟灭。

数据要想获得永恒的生命，必须跨越网络，进入真正的持久化堡垒——数据库管理系统。

让我们进入第三部分：**数据需要一个真正的家 (25 ~ 37)**！
`
});

export { part2Docs };
