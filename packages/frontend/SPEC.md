# Frontend

## 总体架构

本组回答两件事：各领域的界面模块与各应用的外壳共用哪些界面件、它们的观感从哪里来；界面外壳与界面模块之间的契约是什么。

| 成员 | 回答的问题 |
| --- | --- |
| `ui-kit` | 设计 token、动效、基础控件、图标、字体、流式 Markdown 的包装、主题控制器：别的界面成员导入什么就得到同一种观感。纯展示，不认识任何领域，不认识任何应用 |
| `shell-contract` | 界面外壳给界面模块的是什么：有哪几个界面插入位置，往里放的一项长什么样，放进去、撤下、登录、租户、切页怎样调。纯契约加一个 Cordis 服务的定义，不含任何外壳的实现，不认识任何领域 |

依赖方向：`ui-kit` 不依赖仓库里任何别的成员，不依赖 Cordis，不依赖任何协议契约，不依赖 Node 内置模块。`shell-contract` 只依赖 Cordis 与 React 的类型声明，不依赖客户端装配、任何领域成员与 Node 内置模块。领域的界面模块（例如 `session-ui`）和应用的外壳（例如 `apps/desktop`）导入这两个成员，反向不成立。本组两个成员互不依赖。

新增一段界面代码时按下表选位置：

| 这段代码是什么 | 放在 |
| --- | --- |
| 与领域无关、只靠属性与事件就能用的控件、图案、样式、动效 | `ui-kit` |
| 要认识某个领域的数据、协议或文案 | 那个领域的界面模块 |
| 要认识应用的导航、窗口、登录与连接 | 应用的外壳 |

## 领域边界

本组拥有：设计语言的数值（颜色、字号、间距、圆角、阴影、动效时长与曲线）、控件与通用件的外观和交互状态、图标、字体、Markdown 的版式、明暗主题怎样落到页面上。

本组还拥有界面外壳与界面模块之间的契约：插入位置的名字与种类、一项的形状、存放的规则、`shell` 服务的形状。

本组不拥有：任何领域的界面（会话列表、对话版式、设置页等归各领域的界面模块）、任何应用的外壳的实现（导航、侧栏、标题栏归应用）、登录与登录状态的事实、与服务端的连接、偏好的存储。

共用件不认识调用它的是谁：文案由调用者经属性传入，缺省值是中文；失败码到文案的映射归调用者；主题偏好的读与写由调用者注入。

## 心智模型

共用件是一套语言，不是一个组件仓库。拿它量一个改动：这段样式或交互，换一个领域用还对不对。不对，它属于那个领域。

- 数值只有一处：`ui-kit/src/styles/tokens.css`。组件读语义层，不读调色板层，不写死数值。规格不抄数值。
- 状态由数据属性表达：交互族由 `data-control` 标记，部件由 `data-slot` 标记，状态用 `data-state`、`aria-*`。样式和测试读这些属性，不读类名。
- 动效只有一套时钟：时长与曲线只来自 token，循环动画匀速。只有刚发生的事才动；减少动效时位移改为不透明度变化。
- 明暗两套一次写出：颜色用 `light-dark()`，由 `color-scheme` 切换。控件不写第二套颜色。

## 应然设计

### 共用界面件

`ui-kit` 的七块与它们的位置：

| 块 | 位置 |
| --- | --- |
| 设计 token、基线样式、字体、图标样式、Markdown 样式 | `src/styles/` |
| 动效：到达、落定、位移、浮层可达性、对象过渡 | `src/motion/` |
| 图标：毛笔笔画的图标集，只有一种风格 | `src/icons/` |
| 基础控件：按钮、字段、选择、菜单、浮层、抽屉、表格、分段 | `src/controls/` |
| 通用件：折叠、空状态、加载、行内通知、确认、事实表、状态胶囊与过程行等 | `src/patterns/` |
| 流式 Markdown：`Prose`、代码高亮主题、图表主题、中文文案 | `src/prose/` |
| 主题控制器 | `src/theme/` |

成员导出一个根入口、一份汇总样式 `./styles.css`、字体 `./fonts/*`。汇总样式按次序引入 token、字体、基线、动效、图标、控件与通用件的样式和 Markdown 的样式，并带 `@source`，让用它的应用在构建时扫到成员的类名。

### 主题

`createThemeController({ read, write, system })` 把一个主题偏好（浅色、深色、跟随系统）落到页面：`data-theme` 永远是一个具体的调色板，`data-theme-preference` 记录偏好。偏好的读与写经注入的函数，控制器自己不读写任何存储。跟随系统时才持有系统变化的监听，显式选择时放开它。切换时加 `theme-switching` 类冻结过渡，等两帧后放开。

### 技术栈

React、Tailwind 4（无配置文件，`@theme inline` 把 Tailwind 的主题名映射到 `--omne-*` 变量）、Radix、class-variance-authority、Streamdown。这套栈只在本组使用，不进项目顶层的[技术基础](../../docs/architecture/technical-foundations.md)页（负责人已定）。用本成员的应用负责装 `@tailwindcss/vite`，本成员不带构建插件。

### 来历与取舍

设计语言、素材、字体与代码取自外部项目，取了哪几块、改了哪几样见 [UPSTREAM.md](ui-kit/UPSTREAM.md)。取来的代码要符合本仓库：变量前缀是 `--omne-`；没有注释；不用路径别名；不依赖来源自己的桥、偏好与多语言。

中文字体先用系统字体回退，集中写在 `styles/fonts.css` 的 `--omne-font-han`，以后加字体只改这一处。仓颉今楷的许可不许作为应用资产发布，不取。霞鹜文楷的许可允许，但字体文件有 9 MB，放不放进仓库等负责人定。

界面只有中文。需要文案的件（抽屉的关闭按钮、确认、状态词、行内通知、Markdown 控件）由属性传入文案，缺省值是中文。

### 外壳契约

`@omne-harness/shell-contract` 回答一件事：[界面外壳](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-app-shell--界面外壳--app-shell)给[界面模块](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-ui-module--界面模块--ui-module)的是什么：有哪几个[界面插入位置](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-ui-slot--界面插入位置--ui-slot)，往里放的一项长什么样，放进去、撤下、登录、租户、切页怎样调。

#### 入口

| 入口 | 内容 |
| --- | --- |
| `.` | 运行时有三样：常量表 `slots`、错误 `ShellAssemblyError`、存放的工厂 `createSlotStore`。其余是类型：存放的类型 `SlotStore`，三种位置的一项 `GateItem`、`PageItem`、`SidebarItem`，位置名 `SlotName`，按位置取项的类型 `ItemOf`，渲染函数的属性 `GateProps`、`ScopedProps`，外壳一侧读位置的接口 `ShellSlots`，租户的形状 `ScopeSource`，登录的端口 `ShellLogin`、登录状态 `ShellLoginState`、凭据与结果 `LoginCredentials`、`LoginResult`、`LogoutResult` |
| `./cordis` | 服务 `shell` 的抽象类 `ShellService`、它的键 `shellKey`、界面模块的助手 `defineUiModule` 与它的类型 `UiModuleDefinition`。根入口的源码闭包不含 Cordis 绑定 |

#### 三个插入位置

插入位置写死在常量表 `slots` 里，不在运行期创建。种类是「只放一个」（`one`）或「放一列」（`list`）。

| 位置 | 种类 | 一项 | 谁放 |
| --- | --- | --- | --- |
| `gate` 登录门 | 一个 | `id`、`render` | 身份的界面模块。没有登录时外壳只显示它 |
| `pages` 页面 | 一列 | `id`、`title`、`order`、可选的 `icon`（图标名）、`render` | 会话的对话页、资产的设置页 |
| `sidebar` 侧栏区 | 一列 | `id`、`order`、`render` | 会话的会话列表、身份的账号块 |

渲染函数收到的属性由契约定。页面与侧栏区的一项收到 `{ scope }`，`scope` 是当前租户的文本，还没有查到时是 `undefined`。登录门的一项不收租户，属性是空的。界面模块要的协议客户端不经属性传，它自己从客户端的树上注入。

#### 放进去与撤下

| 位置 \ 现状 | 空 | 有别的标识的项 | 有同一个标识的项 |
| --- | --- | --- | --- |
| 只放一个 | 放进去 | 抛出 | 抛出 |
| 放一列 | 放进去 | 放进去，按次序排 | 抛出 |

- 抛出的是 `ShellAssemblyError`，带 `slot`、`id` 与原因：只放一个的位置已有东西是 `occupied`，放一列的位置里标识重复是 `duplicate`。装配错了不静默覆盖。
- 标识只在同一个位置里不许重复；不同位置里可以同名。
- 放一列的位置按 `order` 升序排，`order` 相同按 `id` 的码元序排，不用区域比较，结果与放进去的先后、加载的次序无关。
- 放进去的一项绑在调用者的作用域上：`contribute` 在调用者的作用域上登记一个效应，作用域卸载时自动撤掉。界面模块不写撤下的代码。撤掉的只是它自己放的，别人放的不动。
- 撤掉当前显示的页面时，外壳回到次序最前的一页；一页都没有时主区空着。这一条归外壳的实现。

#### 服务 `shell`

`ShellService` 是抽象类，键是 `shell`。外壳实现它。

| 成员 | 做什么 |
| --- | --- |
| `contribute(位置, 一项)` | 往一个插入位置里放一项，绑在调用者的作用域上。真正的存放由外壳实现受保护的 `place`，它返回撤下的函数；外壳的实现把 `place` 交给 `createSlotStore`，不另写存放规则 |
| `login` | 登录在页面一侧的全部，类型 `ShellLogin`：`state()`、`subscribe(监听)`、`login(凭据)`、`logout()`。契约自己声明这个端口，登录状态 `ShellLoginState` 的四个取值与 `client-assembly` 的 `LoginState` 逐字相同，但契约不依赖客户端装配。应用在装配处把客户端装配的登录状态源交给外壳；两边的形状不一致时，在应用那里编译不过，这就是对上的办法 |
| `scope` | 当前租户的文本：`get()`、`set(文本)`、`subscribe`。设它的是知道租户的那个界面模块（身份）。登录状态离开「已登录」时外壳把它清空 |
| `navigate(页面的标识)` | 把一个页面切到前面。标识不在时什么都不做 |

`login(凭据)` 只交出凭据，答案只有结果，不含任何登录证明：`signed-in`、`auth-failed`、`unknown`、`unavailable`。`logout()` 的结果是 `signed-out` 或 `unknown`。结果不知道就是 `unknown`，不写成成功或失败。

外壳一侧读位置用 `ShellSlots`：`items(位置)` 给出现在放着的项（列的位置已经排好序，只放一个的位置最多一项），`subscribe(位置, 监听)` 在这个位置变化时通知。外壳的实现同时实现 `ShellService` 与 `ShellSlots`。

#### 存放 `createSlotStore`

存放的规则只有一份，在 `createSlotStore()`：它返回 `SlotStore`，即 `ShellSlots` 加 `place(位置, 一项)`。上面「放进去与撤下」的全化表、排序、错误都由它守，外壳的实现交给它，不另写。它不依赖 Cordis，不依赖 React 的运行时。

- `place` 放进去后通知这个位置的订阅者，返回撤下的函数。被拒绝的放入不通知任何人，也不改变存放。
- 撤下只撤这一次 `place` 放进去的那一项，撤下后通知这个位置的订阅者；撤两次，第二次什么都不做、不通知，也不动后来放进同一个标识的项。
- `items(位置)` 每次给出排好序的新数组；订阅者只收到自己订阅的位置的变化；订阅返回取消订阅的函数。

#### 界面模块

`defineUiModule({ name, inject, apply })` 返回一个 Cordis 插件。它依赖 `shell` 与 `inject` 里列的服务；`apply(shell, services)` 里 `services` 以服务名为键，给出这些服务，界面模块在里面调 `shell.contribute` 放东西。`inject` 里的名字与 `services` 的类型由调用方用类型参数声明，协议客户端的服务名由应用的装配处给出，契约不认识它。

加载与卸载都是 Cordis 的依赖注入本来就做的，不另写判断：依赖的服务出现时插件加载，消失时卸载，它放的东西随作用域撤掉；外壳不在时不加载。

## 原则与约束

- 共用件不认识领域，也不认识应用。需要领域知识的界面放进那个领域的界面模块。
- 数值只在 token 里；组件读语义层。
- 控件的交互状态用数据属性表达，不靠类名约定。
- 文案由调用者传入，缺省是中文；共用件不挑错误码的措辞。
- 偏好的读写由调用者注入，共用件不自己碰存储。
- 本组不为旧数据写兼容代码；改承诺同步真实消费者，替代实现随改随删。

## 不变式

| 编号 | 永远成立的性质 | 违反的后果 | 由什么守 |
| --- | --- | --- | --- |
| FE-I01 | `ui-kit` 不导入仓库里任何别的成员，不导入 Node 内置模块与 Cordis | 共用件反过来认识领域或应用，依赖成环 | `ui-kit/tests/boundary.spec.ts` 的导入用例；`pnpm run lint:deps` |
| FE-I02 | 样式与代码里没有 `--pe-` 前缀，也没有 `react-i18next` | 来源的命名与多语言带进仓库，两套变量并存 | `ui-kit/tests/boundary.spec.ts` 的前缀与多语言用例 |
| FE-I03 | 每个基础控件在明暗两套下都渲染，且角色与可访问名称不变 | 一种主题下控件缺失或不可达 | `ui-kit/tests/controls.spec.tsx` 的主题用例 |
| FE-I04 | 主题控制器不自己读写存储：偏好的读与写只经注入的函数 | 偏好有第二个来源，与调用者的存储不一致 | `ui-kit/tests/theme-controller.spec.ts` 的存储用例与读写用例 |
| FE-I05 | `Prose` 的链接一律在新窗口打开并带 `rel="noreferrer noopener"`，没有应用内的自定义链接方案 | 外部内容的链接带着来源页面的信息，或者借自定义协议进入应用 | `ui-kit/tests/prose.spec.tsx` 的链接用例 |
| FE-I06 | `Prose` 流式输入分次给出，已给出的内容一个字也不丢 | 回复在流式过程中缺字 | `ui-kit/tests/prose.spec.tsx` 的流式用例 |
| FE-I07 | 汇总样式能被 Tailwind 4 编出来，产物里有 `--omne-` 变量与控件的类 | 应用引入后样式缺失 | 构建核对：在最小的 Vite 工程里只引汇总样式，`vite build` 后检查产物 |
| FE-I08 | `shell-contract` 的 `src/` 只导入 Cordis、React 的类型与自己 | 契约反过来认识客户端装配、领域或应用，界面模块经它带进不该有的依赖 | `shell-contract/tests/boundaries.spec.ts`；`pnpm run lint:deps` 的 `frontend-knows-no-domain` |
| FE-I09 | 只放一个的位置不会有第二项；放一列的位置里标识不重复。违反时抛出 `ShellAssemblyError`，存放不变，不通知任何人 | 两个界面模块静默互相覆盖，看到哪一个取决于加载次序 | `shell-contract/tests/contribute.spec.ts` 的全化表六格与存放工厂的用例 |
| FE-I10 | 放一列的位置的次序只由 `order` 与 `id` 决定，与放进去的先后无关 | 同一组界面模块在两次启动里排出不同的次序 | `shell-contract/tests/order.spec.ts` |
| FE-I11 | 一个作用域卸载时，撤掉的恰好是它放的那些项；撤两次第二次什么都不做 | 卸载一个界面模块带走别人放的东西，或留下自己的 | `shell-contract/tests/unload.spec.ts` 与存放工厂的撤回用例 |
| FE-I12 | 登录与退出的答案只有结果，不含任何登录证明 | 页面里的界面模块读到登录证明 | `shell-contract/tests/slots.spec-d.ts` 里登录端口的类型用例 |
