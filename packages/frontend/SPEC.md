# Frontend

## 总体架构

本组回答两件事：各领域的界面模块与各应用的外壳共用哪些界面件、它们的观感从哪里来；界面外壳与界面模块之间的契约是什么。

| 成员 | 回答的问题 |
| --- | --- |
| `ui-kit` | 设计 token、动效、基础控件、图标、字体、流式 Markdown 的包装、主题与字号档的控制器、Agent 形的墨迹：别的界面成员导入什么就得到同一种观感。纯展示，不认识任何领域，不认识任何应用 |
| `shell-contract` | 界面外壳给界面模块的是什么：有哪几个界面插入位置，往里放的一项长什么样，放进去、撤下、登录、租户、切页怎样调。纯契约加一个 Cordis 服务的定义，不含任何外壳的实现，不认识任何领域 |

依赖方向：`ui-kit` 不依赖仓库里任何别的成员，不依赖 Cordis，不依赖任何协议契约，不依赖 Node 内置模块。`shell-contract` 只依赖 Cordis 与 React 的类型声明，不依赖客户端装配、任何领域成员与 Node 内置模块。领域的界面模块（例如 `session-ui`）和应用的外壳（例如 `apps/desktop`）导入这两个成员，反向不成立。本组两个成员互不依赖。

新增一段界面代码时按下表选位置：

| 这段代码是什么 | 放在 |
| --- | --- |
| 与领域无关、只靠属性与事件就能用的控件、图案、样式、动效 | `ui-kit` |
| 要认识某个领域的数据、协议或文案 | 那个领域的界面模块 |
| 要认识应用的导航、窗口、登录与连接 | 应用的外壳 |

## 领域边界

本组拥有：设计语言的数值（颜色、字号、间距、圆角、阴影、动效时长与曲线）、控件与通用件的外观和交互状态、图标、字体、Markdown 的版式、明暗主题与字号档怎样落到页面上、Agent 形与墨框怎样画。

本组还拥有界面外壳与界面模块之间的契约：插入位置的名字与种类、一项的形状、存放的规则、`shell` 服务的形状。

本组不拥有：任何领域的界面（会话列表、对话版式、设置页等归各领域的界面模块）、任何应用的外壳的实现（导航、侧栏、标题栏归应用）、登录与登录状态的事实、与服务端的连接、偏好的存储、形此刻该说什么状态（归报告状态的界面模块）。

共用件不认识调用它的是谁：文案由调用者经属性传入，缺省值是中文；失败码到文案的映射归调用者；主题与字号档的读与写由调用者注入。

## 心智模型

共用件是一套语言，不是一个组件仓库。拿它量一个改动：这段样式或交互，换一个领域用还对不对。不对，它属于那个领域。

- 数值只有一处：`ui-kit/src/styles/tokens.css`。组件读语义层，不读调色板层，不写死数值。规格不抄数值。
- 状态由数据属性表达：交互族由 `data-control` 标记，部件由 `data-slot` 标记，状态用 `data-state`、`aria-*`。样式和测试读这些属性，不读类名。
- 动效只有一套时钟：时长与曲线只来自 token，循环动画匀速。只有刚发生的事才动；减少动效时位移改为不透明度变化。
- 明暗两套一次写出：颜色用 `light-dark()`，由 `color-scheme` 切换。控件不写第二套颜色。
- 尺寸只有一个旋钮：字号档的系数 `--omne-size`。token 里的长度都乘它，成员只读 token，所以整个界面一起变大变小。成员的样式里不写 px 与 rem 的数，1px 的细线除外。共用件不带构建插件。
- 颜色只在这几处有含义：墨蓝标出动作、链接与焦点；琥珀标出等人回答的东西（[待答数](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-awaiting-answer-count--待答数--awaiting-answer-count)、等人回答的决策卡片与列表行），别的颜色不表示在等人；绿、琥珀、红是已知事实的成功、注意、失败三种语气，琥珀除了等人回答的东西只作「注意」语气，结果不知道时用中性；红只用在失败的事实与不可撤销的最后一步上。<!-- OD-12 -->
- 断点只有三个：768、1100 与对话区的 1160。
- 形是 agent，不是装饰：一个页面里至多一个形，它只以笔法动；它展开的东西都是墨框，别的浮层都不是墨框。

## 应然设计

### 共用界面件

`ui-kit` 的十块与它们的位置：

| 块 | 位置 |
| --- | --- |
| 设计 token、基线样式、字体、图标样式、Markdown 样式 | `src/styles/` |
| 动效：到达、落定、位移、浮层可达性、对象过渡 | `src/motion/` |
| 图标：毛笔笔画的图标集，只有一种风格 | `src/icons/` |
| 基础控件：按钮、字段、选择、菜单、浮层、抽屉、表格、分段 | `src/controls/` |
| 通用件：折叠、空状态、加载、行内通知、确认、事实表、状态胶囊与过程行、计数胶囊、列表加阅读、栏加窗格、设置行、对话的气泡与输入框、决定的面等 | `src/patterns/` |
| 流式 Markdown：`Prose`、代码高亮主题、图表主题、中文文案 | `src/prose/` |
| 主题控制器 | `src/theme/` |
| 字号档：四档的名字、控制器、一档一档调的函数 | `src/size/` |
| 墨迹：Agent 形、形座位、一程、墨框、告知笺 | `src/ink/` |
| 图表：堆叠柱、折线、面积、占比条、读数表、迷你图、数字块，与数字的格式化 | `src/charts/` |

成员导出一个根入口、一份汇总样式 `./styles.css`、字体 `./fonts/*`。汇总样式按次序引入 token、字体、基线、动效、图标、控件与通用件的样式和 Markdown 的样式，并带 `@source`，让用它的应用在构建时扫到成员的类名。

#### 页的骨架

页的版式只由下面几件搭，规则见[规则与 token 的索引](../../.meta_harness/agents/skills/visual-standard/canonical/references/rules-index.md#s-间距圆角版式断点)的 S6 与 L6。页面不自己画页头下的线、节线与目录栏。文案、记号、时间与动作都由调用者传入。下表的长度是中楷的值，随字号档一起变。

| 件 | 职责 | 状态 |
| --- | --- | --- |
| `PageHeader({ title, titleId?, description?, actions? })` | 页的标题，标题下至多一句说明，右边是这一页的动作。下面一条细线，只由它画。在 `PageColumn` 里它与下面的内容再隔一节 | 有说明时标题与说明隔 4，说明是弱墨的界面字；没有说明只有标题。768 以下动作靠左 |
| `Section({ id, title, badge?, children })` | 运营页的一节：上面一条细线，强字的节标题，标题下面是正文 | 紧跟 `PageHeader` 的一节不画上线，也不再留上边距：页头的线就是它的线 |
| `ListReadingPage({ title, titleId?, description?, actions?, detail, children })` | 列表加阅读的一页：顶上是 `PageHeader`，它的线横跨整个工作区；下面是工作区。外壳的 `main` 已经是地标，这一件是普通的块 | `detail` 为真表示开着一条记录；768 以下开着记录时不画页头 |
| `ListReadingWorkspace({ detail, empty?, children })` | 目录栏与阅读面并排 | 1100 以下并成一栏：开着记录时只有阅读面，没有开时只有目录栏，`empty`（列表空）时只有阅读面 |
| `ListReadingDirectory({ search?, filters?, children })` | 目录栏，宽 252：顶上是搜索，下面是筛选，再下面是只有自己滚动的行列表。搜索、筛选、行与列表里空的文字共用一个内边距 | 1100 以下目录栏单独成页时，内边距等于页的左右边距 40，768 以下是 16 |
| `DirectorySearch({ value, onChange, label, clearLabel, maxLength? })` | 目录栏的搜索字段：搜索字形在字段里，右边一个清除的图标钮 | 没有字时没有清除钮；按清除钮把字清空 |
| `ListReadingRow({ title, mark?, facts?, time?, selected?, onSelect })` | 一条记录的一行：弱墨的记号一列，正文一列是强字的标题、至多两行弱墨的事实、最淡的时间。悬停是 `GlideMenu` 的滑动高亮 | `selected` 为真时行带 `aria-current`，底是 `--omne-selected` |
| `ListReadingMain({ children })` | 阅读面：上面是工具条，下面是文档或空闲的一句话 | — |
| `ReadingToolbar({ name, back?, origin?, children? })` | 阅读面的工具条：返回、名字与来源一行、右边的动作，下面一条细线 | 没有返回或没有来源时不留位置；768 以下不写名字 |
| `ReadingDocument({ children })` | 阅读面里滚动的文档，阅读量度，居中 | — |
| `ReadingState({ children })` | 阅读面空闲时的那一句话，放一个 `EmptyState`，没有别的 | — |
| `SettingRow({ label, labelId?, controlId?, hint?, notice?, children? })` | 设置行：左边是名字与一句弱墨的说明，右边是值或控件，这一行自己的失败通知在整行下面。行与行之间一条细线，最后一行不画 | 1100 及以上两半并排，控件靠右；1100 以下两半叠起，控件回到左边。没有值或控件时只有左边 |

### 图表

图表控件与别的控件一样，与领域无关，只靠属性与事件：给它序列或分解好的数据、各系列的名字与次序，它画出来。它不取数据，不认识用量。

- 颜色与字体只读样式变量：一组图表色 `--omne-chart-*`，明暗两套写在 token 里。图表不接受十六进制颜色，主题切换不需要重新渲染。
- 图表画成 SVG，不画在 canvas 上。它不往页面里插样式表，也不在运行时求值，所以在只放行自有脚本与自有样式的页面策略下能用。
- 每张图有文本的替代：一个可读的标签，和一份同样数据的表格视图。键盘能走到每个数据点。
- 数据为空、只有一个点、全是未知，各有确定的样子，不画成零。
- 图表库只在本块被导入，不出现在本成员的导出类型里。换图表库只改本块。
- 数字的格式化是一个共用函数：千分位、缩写、百分比、带单位的金额；未知有固定的写法，不写成零。

### 主题

`createThemeController({ read, write, system })` 把一个主题偏好（浅色、深色、跟随系统）落到页面：`data-theme` 永远是一个具体的调色板，`data-theme-preference` 记录偏好。偏好的读与写经注入的函数，控制器自己不读写任何存储。跟随系统时才持有系统变化的监听，显式选择时放开它。切换时加 `theme-switching` 类冻结过渡，等两帧后放开。

### 字号档

[字号档](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-size-tier--字号档--size-tier)有四档：小楷、中楷、大楷、老花，缺省是中楷。各档的系数在 token 里。

`createSizeController({ read, write })` 把一档落到页面：中楷时 `<html>` 上没有 `data-size`，别的档写 `data-size` 为 `small`、`large` 或 `reading`。`--omne-size` 随 `data-size` 变，token 里的长度都乘它，所以版式在每档下不变。偏好的读与写经注入的函数，控制器自己不读写任何存储（FE-I19）。共用件另给一档一档调的函数：大一档、小一档、回到中楷，以及判断一个按键组合是哪一种的函数。按键绑在哪里、偏好存在哪里，归应用。

### 墨迹

`src/ink/` 画 [Agent 形](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-agent-figure--agent-形--agent-figure)：形的身体、[形座位](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-figure-seat--形座位--figure-seat)、换座位时的一程、[墨框](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-ink-bubble--墨框--ink-bubble)与[告知笺](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-told-note--告知笺--told-note)。它只收状态名、一次性的事实、待答数与座位，不认识会话、通知与任何领域。

- 形画在页面最上面的一层：固定定位，这一层不接指针，只有形自己接指针。不另开窗口，所以页面在普通浏览器里也能打开。
- 墨用 canvas 与 SVG 画。位置经 CSSOM 的属性写，不拼样式文本，不插样式表，所以在只放行自有样式的页面策略下能用。
- 一个页面里至多一个形（FE-I18）。座位只给中点，自己不画东西。几个座位同时看得见时，形坐优先级最高的那一个。在 `[inert]` 里、没有接上页面或大小为零的座位不算看得见。没有看得见的座位时，形的墨原地干去。
- 形只以笔法动：写、点、干、重写、走一程。它不旋转、不拉伸、不缩放、不滑动，不用 CSS 动画。没事时帧循环停着。
- 形的大小是 56px 乘字号档的系数，在每个座位上、路上都一样。
- 减弱动效时，形不写、不飞，直接以新的样子出现在新的座位上：在想时停在半墨，在用工具时一点在正中，在写出时一页竖笔不动。
- 墨框是一个件，有浓、淡两种墨。边按框的大小生成，不拉伸；引线从口出来，绕过圆，不穿过圆；边合上之前内容不可见，收起时内容先走。墨框没有焦点环，墨就是边。Escape 收起墨框，焦点回到展开它的控件。
- 告知笺用浓墨，在形的右边，最多三行；第四行能写完全文时写第四行。宿主可以给一个更小的行数上限，不少于两行，写不下的用省略号收住；上限由宿主按它不能盖住的字算。<!-- OD-20 -->
- 待答数用形自己的笔写在口外，用琥珀色。
- 笔法、时长与验收问题的全部规则在[视觉规范的技能](../../.meta_harness/agents/skills/visual-standard/canonical/SKILL.md)里；数都在 `src/ink/` 的具名常量里。

### 技术栈

React、Tailwind 4（无配置文件，`@theme inline` 把 Tailwind 的主题名映射到 `--omne-*` 变量）、Radix、class-variance-authority、Streamdown。这套栈只在本组使用，不进项目顶层的[技术基础](../../docs/architecture/technical-foundations.md)页（负责人已定）。用本成员的应用负责装 `@tailwindcss/vite`，本成员不带构建插件。

### 来历与取舍

设计语言、素材、字体与代码取自外部项目，取了哪几块、改了哪几样见 [UPSTREAM.md](ui-kit/UPSTREAM.md)。取来的代码要符合本仓库：变量前缀是 `--omne-`；没有注释；不用路径别名；不依赖来源自己的桥、偏好与多语言。

中文字体集中写在 `styles/fonts.css` 的 `--omne-font-han`，以后换字体只改这一处。全角标点由随成员带的 `Omne Punctuation` 给出，墨两边的边距取来源同一字形的，墨宽是霞鹜文楷的，破折号与省略号 1 em。<!-- OD-15 --> 它只有全角标点，排在第一位；第二位是随成员带的霞鹜文楷（1.7.0，SIL OFL 1.1，常规与粗体），后面是系统字体回退。霞鹜文楷按字符范围切成 194 片放在 `resources/fonts/lxgw-wenkai/`，每片一条 `@font-face`（`styles/wenkai.css`），页面只取文字用到的那几片。仓耳今楷的许可不许作为应用资产发布，不取。字体栈里不写没有随成员带的字体名：Charter 没有随成员带，阅读字体栈里没有它。<!-- OD-8 -->

界面只有中文。需要文案的件（抽屉的关闭按钮、确认、状态词、行内通知、Markdown 控件）由属性传入文案，缺省值是中文。

### 外壳契约

`@omne-harness/shell-contract` 回答一件事：[界面外壳](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-app-shell--界面外壳--app-shell)给[界面模块](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-ui-module--界面模块--ui-module)的是什么：有哪几个[界面插入位置](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-ui-slot--界面插入位置--ui-slot)，往里放的一项长什么样，放进去、撤下、登录、租户、切页怎样调。

#### 入口

| 入口 | 内容 |
| --- | --- |
| `.` | 运行时有七样：常量表 `slots`、错误 `ShellAssemblyError`、存放的工厂 `createSlotStore`、声明带类型的拓展点的两个函数 `definePoint` 与 `defineKeyedPoint`、造带类型的键的 `serviceKey` 与按键取服务的 `serviceOf`。其余是类型：带类型的键 `ServiceKey`，存放的类型 `SlotStore`，四种位置的一项 `GateItem`、`PageItem`、`SidebarItem`、`AttachedItem`，位置名 `SlotName`，按位置取项的类型 `ItemOf`，渲染函数的属性 `GateProps`、`ScopedProps`、`AttachedProps`，宿主排版时拿到的一项 `AttachedEntry` 与排版函数 `AttachedLayout`，带类型的拓展点的类型（见「带类型的拓展点」），外壳一侧读位置的接口 `ShellSlots`，租户的形状 `ScopeSource`，登录的端口 `ShellLogin`、登录状态 `ShellLoginState`、凭据与结果 `LoginCredentials`、`LoginResult`、`LogoutResult` |
| `./cordis` | 服务 `shell` 的抽象类 `ShellService`、它的键 `shellKey`、界面模块的助手 `defineUiModule` 与它的类型 `UiModuleDefinition`、提供服务的函数类型 `Provide`。根入口的源码闭包不含 Cordis 绑定 |

#### 插入位置

插入位置写死在常量表 `slots` 里，不在运行期创建。种类是「只放一个」（`one`）或「放一列」（`list`）。

| 位置 | 种类 | 一项 | 谁放 |
| --- | --- | --- | --- |
| `gate` 登录门 | 一个 | `id`、`render` | 身份的界面模块。没有登录时外壳只显示它 |
| `pages` 页面 | 一列 | `id`、`title`、`order`、`icon`（图标名）、可选的 `group`（`primary` 或 `utility`，缺省 `primary`）、可选的 `badge`（显示在导航里标题旁的小标记，返回空值时不显示）、`render` | 会话的对话页、资产的设置页 |
| `sidebar` 侧栏区 | 一列 | `id`、`order`、可选的 `group`（同上）、可选的 `rail`（侧栏折成窄条时的渲染函数）、`render` | 会话的会话列表、身份的账号块 |
| `attached` 附着位置 | 一列 | `id`、`order`、`anchor`（位置的名字）、可选的 `label`（宿主排成页签时用的标签）、`render` | 要把自己的界面附着到别人展示的对象上的界面模块，或应用的装配 |

每个页面项都给 `icon`：侧栏折成窄条时只剩图标。名字不在图标集里时，外壳画「未知」的字形。`group` 只说这一项排在侧栏的哪一段：`primary` 在上，`utility` 在底部；同一段里的次序仍只由 `order` 与 `id` 定。侧栏折成窄条时，外壳画侧栏区各项的 `rail`，没给 `rail` 的项不画。

渲染函数收到的属性由契约定。页面与侧栏区的一项收到 `{ scope }`，侧栏区一项的 `rail` 也收到 `{ scope }`，页面项的 `badge` 也收到 `{ scope }`，`scope` 是当前租户的文本，还没有查到时是 `undefined`。附着位置的一项收到 `{ scope, subject }`，`subject` 是展示它的那个地方给出的对象文本。登录门的一项不收租户，属性是空的。界面模块要的协议客户端不经属性传，它自己从客户端的树上注入。

附着位置让一个界面模块把东西放进另一个界面模块展示的对象里，而两边互不导入：展示对象的界面模块为这个位置起一个名字（`anchor`），调用服务的 `attached(位置的名字, 对象)` 留出位置；别的界面模块或应用的装配往同名的 `anchor` 里放项。位置的名字由展示那个对象的界面模块定，并写在它自己的规格里；契约不认识名字与对象的含义，它们对契约只是文本。

#### 瞬时提示

瞬时提示是外壳交给界面模块的一个口，不是插入位置：界面模块在某一刻说「现在提示这一条」，之后这条提示的寿命归外壳。它的共同规则见[宿主交给贡献方的口](../../docs/architecture/cross-cutting-concepts.md#宿主交给贡献方的口)。

| 问题 | 回答 |
| --- | --- |
| 外壳给什么 | 服务 `shell` 上的一个操作：提示一条。交的是数据：`id`、轻重（`info` 或 `attention`）、标题、可选的一行正文、可选的动作（按钮上的字与要去的页面，页面可以带一个对象） |
| 谁画 | 外壳。界面模块不交渲染函数。桌面应用的外壳把它画成告知笺，见应用的规格 <!-- OD-4 --> |
| 寿命 | 外壳定：显示几条、什么时候收回、什么时候不显示。人可以点掉。这些是外壳的选择，写在外壳的规格里 |
| 同一个 `id` 再来 | 替换原来那一条，不叠加 |
| 界面模块卸载 | 它的提示随它的作用域撤掉，排着队的也撤掉 |
| 给不出时 | 提示是尽力而为的：这个操作没有结果，界面模块不能凭它判断人看没看到 |
| 形状怎样变 | 只加不改；改形状要换名字 |

提示不保存任何东西：关掉窗口，没显示完的提示就没有了，再打开不补。要让人之后还找得到的内容，由界面模块自己的页面负责。点提示上的动作等于调 `navigate` 去那一页。

#### 形口

[形口](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-figure-port--形口--figure-port)是外壳交给界面模块的另一个口，同样不是插入位置：界面模块报出它代表的会话此刻在做什么，以及[待答数](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-awaiting-answer-count--待答数--awaiting-answer-count)；外壳把各份报告合起来画 [Agent 形](../../.meta_harness/design/ubiquitous_language/terms/interaction-and-dispatch.md#ul-agent-figure--agent-形--agent-figure)。共同规则同样见[宿主交给贡献方的口](../../docs/architecture/cross-cutting-concepts.md#宿主交给贡献方的口)。

| 问题 | 回答 |
| --- | --- |
| 外壳给什么 | 服务 `shell` 上的一个操作：报一份。交的是数据：`doing`，持续的活动，取 `idle`、`thinking`、`looking`、`writing`、`background` 之一；可选的 `moment`，一次性的事实，取 `received`、`landed`、`could-not` 之一，带一个序号，序号变了才算新的一次；可选的 `subject`，一句给读屏的对象文字；可选的 `waiting`，待答数；可选的 `waitingPage`，有待答时按形要去的页面标识 |
| 报什么 | `doing` 与 `moment` 的含义见[桌面应用「Agent 在屏幕上的形」](../../.meta_harness/design/product/desktop-application/design.md#agent-在屏幕上的形)的状态表。`waiting` 只报待答数：决策池里等着人回答的决策卡片的张数。别的计数不经这个口 |
| 谁画 | 外壳，用共用界面件的墨迹块。界面模块不交渲染函数 |
| 怎样合 | 同一个界面模块再报一份，替换它上一份。放了当前显示那一页的模块，它的活动是前台的；别的模块报的不是 `idle` 的活动只算 `background`。待答数相加。有待答时按形，去报了待答数的模块给的 `waitingPage`；几个模块都给时，去次序最前的那一页 |
| 界面模块卸载 | 它的报告随它的作用域撤掉 |
| 给不出时 | 报告是尽力而为的：这个操作没有结果。外壳此刻不画形时，报告照样记下，形出现时用最新的那一份 |
| 形状怎样变 | 只加不改；改形状要换名字 |

报告不保存任何东西，也不改服务端的任何事实。外壳把前台的活动说成一句隐藏的状态文字，给读屏用。

#### 放进去与撤下

| 位置 \ 现状 | 空 | 有别的标识的项 | 有同一个标识的项 |
| --- | --- | --- | --- |
| 只放一个 | 放进去 | 抛出 | 抛出 |
| 放一列（页面、侧栏区） | 放进去 | 放进去，按次序排 | 抛出 |
| 附着位置 | 放进去 | 放进去，按次序排 | 位置的名字不同：放进去。位置的名字相同：抛出 |

- 抛出的是 `ShellAssemblyError`，带 `slot`、`id` 与原因：只放一个的位置已有东西是 `occupied`，放一列的位置里标识重复是 `duplicate`。装配错了不静默覆盖。
- 标识只在同一个位置里不许重复；不同位置里可以同名。附着位置里，标识在同一个位置的名字（`anchor`）下不许重复：两个互不知道的界面模块在两个名字下可以用同一个标识。
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
| `navigate(页面的标识, 可选的对象)` | 把一个页面切到前面。标识不在时什么都不做。带了对象时，这个页面的 `render` 在 `{ scope, subject }` 里收到它（一段文本，含义归这个页面），用来指到页面上的那一项；它不打开、不改变任何东西 |
| `page` | 现在显示在前面的页面的标识：`get()`、`subscribe`，只读；一页都没有时是 `undefined`。界面模块用它判断自己的页面在不在前面，不用它切换页面（切换用 `navigate`） |
| `figure(一份报告)` | 见「形口」。已经卸载的调用方，报告直接丢掉，不报错 |
| `toast(一条提示)` | 见「瞬时提示」。同一个 `id` 的替换只在同一个界面模块之内；不画提示的外壳、已经卸载的调用方，提示直接丢掉，不报错 |
| `attached(位置的名字, 对象)` | 给出附着位置里 `anchor` 与位置的名字相同的全部项的渲染结果，按存放的次序排；每一项收到 `{ scope, subject }`，`scope` 是外壳当前的租户文本，`subject` 是这里给的对象。位置里的项放进或撤下、租户变了，已经渲染出来的结果跟着变。没有匹配的项时什么都不渲染 |
| `arranged(位置的名字, 对象, 排版函数)` | 和 `attached` 取同样的项、同样的次序，但不替宿主拼在一起：把每一项的标识、标签、渲染结果（`AttachedEntry`）交给宿主的排版函数，给出排版函数的返回值。没有匹配的项时排版函数收到空表。订阅位置与租户的变化仍在外壳里，宿主不碰存放 |

`login(凭据)` 只交出凭据，答案只有结果，不含任何登录证明：`signed-in`、`auth-failed`、`unknown`、`unavailable`。`logout()` 的结果是 `signed-out` 或 `unknown`。结果不知道就是 `unknown`，不写成成功或失败。

外壳的实现给它画的每一项包一层错误隔离：一项的渲染抛出时，只有这一项显示读不出（FE-I14）。坏了的一项显示什么，归外壳的实现。

外壳一侧读位置用 `ShellSlots`：`items(位置)` 给出现在放着的项（列的位置已经排好序，只放一个的位置最多一项），`subscribe(位置, 监听)` 在这个位置变化时通知。外壳的实现同时实现 `ShellService` 与 `ShellSlots`。

#### 存放 `createSlotStore`

存放的规则只有一份，在 `createSlotStore()`：它返回 `SlotStore`，即 `ShellSlots` 加 `place(位置, 一项)`。上面「放进去与撤下」的全化表、排序、错误都由它守，外壳的实现交给它，不另写。它不依赖 Cordis，不依赖 React 的运行时。

- `place` 放进去后通知这个位置的订阅者，返回撤下的函数。被拒绝的放入不通知任何人，也不改变存放。
- 撤下只撤这一次 `place` 放进去的那一项，撤下后通知这个位置的订阅者；撤两次，第二次什么都不做、不通知，也不动后来放进同一个标识的项。
- `items(位置)` 每次给出排好序的新数组；订阅者只收到自己订阅的位置的变化；订阅返回取消订阅的函数。

#### 带类型的拓展点

展示对象的界面模块要让别的领域往自己的界面里放东西时，用 `definePoint` 或 `defineKeyedPoint` 声明一个[拓展点](../../.meta_harness/design/ubiquitous_language/terms/architecture-core-and-extension.md#ul-extension-point--拓展点--extension-point)。它是附着位置上的一层薄壳：位置的名字与对象对外壳仍然只是文本，薄壳在两头做编解码。共同的规则见[拓展点的共同契约](../../docs/architecture/cross-cutting-concepts.md#拓展点的共同契约)。

| 函数 | 声明什么 | 返回的拓展点 |
| --- | --- | --- |
| `definePoint<S>({ name, subject })` | 名字，与对象 `S` 的编解码 `PointCodec<S>`（`encode` 把对象编成文本，`decode` 把文本解回对象，解不回时给 `undefined`） | `Point<S>`：`name`；宿主用的 `slot(外壳, 对象, 排版函数)`；贡献方用的 `contribute(外壳, 一项)` |
| `defineKeyedPoint<S>(同上)` | 同上。这个拓展点按键分 | `KeyedPoint<S>`：`slot` 与 `contribute` 各多一个键。不同的键互不可见 |

- 一项是 `PointItem<S>`：`id`、`order`、可选的 `label`、`render`。`render` 收到 `{ scope, subject }`，`subject` 是解回来的对象。文本解不回对象时这一项不画，不抛出。
- 按不按键分由用哪一个函数定。不按键的拓展点上写不出键。
- 不按键的拓展点，附着位置的名字就是拓展点的名字，所以直接往同名的 `anchor` 里放的项也在里面。按键的拓展点，附着位置的名字是「拓展点的名字、冒号、键」。拓展点的名字里不带冒号。
- 贡献可以先于键放进去。宿主什么时候展示这个键，它什么时候出现。
- 编解码由宿主交进来。薄壳不导入任何协议契约，也不导入 Cordis：它要的外壳写成两个结构类型，`PointContributor`（有 `contribute`）与 `PointHost`（有 `arranged`），服务 `shell` 两样都满足。
- 贡献方不导入宿主的界面模块。宿主从自己的 `./cordis` 入口导出拓展点，应用的装配把它交给贡献方。贡献方只要贡献的一面，类型是 `PointSink<S>` 或 `KeyedPointSink<S>`，并用自己要的对象形状写 `S`。宿主的对象比它宽时可以交过去；对不上时，在应用的装配处编译不过。

#### 界面模块

`defineUiModule({ name, inject, apply })` 返回一个 Cordis 插件。它依赖 `shell` 与 `inject` 里列的服务；`apply(shell, services)` 里 `services` 以服务名为键，给出这些服务，界面模块在里面调 `shell.contribute` 放东西。`inject` 里的名字与 `services` 的类型由调用方用类型参数声明，协议客户端的服务名由应用的装配处给出，契约不认识它。

加载与卸载都是 Cordis 的依赖注入本来就做的，不另写判断：依赖的服务出现时插件加载，消失时卸载，它放的东西随作用域撤掉；外壳不在时不加载。

界面模块也能在客户端的树上提供一个服务，交给别的界面模块用。`apply` 的第三个参数 `provide(键, 值)` 把值以键为名提供出去，绑在这个界面模块的作用域上：它卸载时服务撤回，注入这个服务的界面模块随之卸载，再提供时再加载。不提供服务的界面模块不用这个参数。

- 键是带类型的键 `ServiceKey<T>`：它就是服务名的文本，类型里另带一个形状 `T`，放在函数返回值的位置上。`serviceKey<T>(名字)` 造一个键。所以给得多的键能当给得少的用（`ServiceKey<多>` 能赋给 `ServiceKey<少>`），反过来编译不过。`provide` 的值必须是键的形状。
- 提供方从自己的 `./cordis` 入口导出键。使用方不导入提供方：它用自己要的形状写键的类型，由应用的装配把提供方的键交给它；形状对不上时，在应用的装配处编译不过。使用方把键写进 `inject`，在 `apply` 里用 `serviceOf(services, 键)` 取到这个形状的服务。
- 同一个名字由两个界面模块提供，照 Cordis 自己的规则；契约不另定。一个口只有一个宿主。

## 原则与约束

- 共用件不认识领域，也不认识应用。需要领域知识的界面放进那个领域的界面模块。
- 数值只在 token 里；组件读语义层。
- 控件的交互状态用数据属性表达，不靠类名约定。
- 文案由调用者传入，缺省是中文；共用件不挑错误码的措辞。
- 导航与列表里的计数一律用共用件的计数胶囊。琥珀的样子只给等人回答的数，别的计数用中性的样子。
- 加载、空与出错各只用共用件的一个件；可点的东西只经控件族，成员不写原生控件。
- 状态词只取共用件的状态词表；时刻只经共用件的相对时间件写；图标只画共用件的图标集。
- 动作照[规则与 token 的索引](../../.meta_harness/agents/skills/visual-standard/canonical/references/rules-index.md#a-动作)的 A 节：常用的工具动作是图标钮，名字在提示与可访问名称里；偶尔的动作进一个 `⋯`；带字的 `Button` 只有表单与对话框落定的那一个、对话里要人选的选项、一页唯一的主动作，以及字就是东西本身的对象名与当前值；不需要的动作不画。抬起的件四周留得下它的边线、投影与焦点环，不贴着会裁切的容器的边（S15）。
- 两套主题下，正文与状态词对它所在的面至少 4.5:1，字段边界与焦点至少 3:1。
- 守观感的门集中在桌面应用的 `tests/design-gates/`，扫共用件、桌面应用的页面与它装配的每个界面模块。今天的违规记在基线里，基线只许变小：多一处是新违规，少了而基线没缩也失败。
- 偏好的读写由调用者注入，共用件不自己碰存储。
- 本组不为旧数据写兼容代码；改承诺同步真实消费者，替代实现随改随删。

## 不变式

| 编号 | 永远成立的性质 | 违反的后果 | 由什么守 |
| --- | --- | --- | --- |
| FE-I01 | `ui-kit` 不导入仓库里任何别的成员，不导入 Node 内置模块与 Cordis | 共用件反过来认识领域或应用，依赖成环 | `ui-kit/tests/boundary.spec.ts` 的导入用例；`pnpm run lint:deps` |
| FE-I02 | 样式与代码里没有 `pe-` 前缀（变量、类名、动画名都算），也没有 `react-i18next` | 来源的命名与多语言带进仓库，两套命名并存 | `ui-kit/tests/boundary.spec.ts` 的前缀与多语言用例 |
| FE-I03 | 每个基础控件在明暗两套下都渲染，且角色与可访问名称不变 | 一种主题下控件缺失或不可达 | `ui-kit/tests/controls.spec.tsx` 的主题用例 |
| FE-I04 | 主题控制器不自己读写存储：偏好的读与写只经注入的函数 | 偏好有第二个来源，与调用者的存储不一致 | `ui-kit/tests/theme-controller.spec.ts` 的存储用例与读写用例 |
| FE-I05 | `Prose` 的链接一律在新窗口打开并带 `rel="noreferrer noopener"`，没有应用内的自定义链接方案 | 外部内容的链接带着来源页面的信息，或者借自定义协议进入应用 | `ui-kit/tests/prose.spec.tsx` 的链接用例 |
| FE-I06 | `Prose` 流式输入分次给出，已给出的内容一个字也不丢 | 回复在流式过程中缺字 | `ui-kit/tests/prose.spec.tsx` 的流式用例 |
| FE-I07 | 汇总样式能被 Tailwind 4 编出来，产物里有 `--omne-` 变量与控件的类 | 应用引入后样式缺失 | 构建核对：在最小的 Vite 工程里只引汇总样式，`vite build` 后检查产物 |
| FE-I08 | `shell-contract` 的 `src/` 只导入 Cordis、React 的类型与自己 | 契约反过来认识客户端装配、领域或应用，界面模块经它带进不该有的依赖 | `shell-contract/tests/boundaries.spec.ts`；`pnpm run lint:deps` 的 `frontend-knows-no-domain` |
| FE-I09 | 只放一个的位置不会有第二项；放一列的位置里标识不重复，附着位置里同一个名字下标识不重复。违反时抛出 `ShellAssemblyError`，存放不变，不通知任何人 | 两个界面模块静默互相覆盖，看到哪一个取决于加载次序 | `shell-contract/tests/contribute.spec.ts` 的全化表与存放工厂的用例 |
| FE-I10 | 放一列的位置的次序只由 `order` 与 `id` 决定，与放进去的先后无关 | 同一组界面模块在两次启动里排出不同的次序 | `shell-contract/tests/order.spec.ts` |
| FE-I11 | 一个作用域卸载时，撤掉的恰好是它放的那些项；撤两次第二次什么都不做 | 卸载一个界面模块带走别人放的东西，或留下自己的 | `shell-contract/tests/unload.spec.ts` 与存放工厂的撤回用例 |
| FE-I12 | 登录与退出的答案只有结果，不含任何登录证明 | 页面里的界面模块读到登录证明 | `shell-contract/tests/slots.spec-d.ts` 里登录端口的类型用例 |
| FE-I13 | 附着位置里的一项只渲染在名字相同的地方，收到那个地方给的对象；按键的拓展点里，一项只出现在它的键下 | 一个对象的界面出现在另一个对象上 | `shell-contract/tests/attached.spec.ts` 的参考外壳用例；`shell-contract/tests/point.spec.ts`；`apps/desktop/tests/shell.spec.tsx` 的附着位置用例 |
| FE-I14 | 外壳画的一项在渲染当中抛出时，只有这一项显示读不出；别的项与宿主的页面照常。这一条由外壳的实现守，契约只规定它 | 一个领域的界面出错，整个页面卸掉 | `apps/desktop/tests/shell.spec.tsx` 的「一项坏了只坏这一项」一组 |
| FE-I15 | 瞬时提示只有数据，外壳自己画；一个界面模块的提示随它的作用域撤掉；同一个 `id` 至多显示一条 | 一个领域的提示坏了连累外壳；卸掉的模块还留着提示 | `shell-contract/tests/toast.spec.ts` 与 `toast-store.spec.ts`；`shell-contract/tests/slots.spec-d.ts` 的 `Toast` 形状；`apps/desktop/tests/toasts.spec.tsx` |
| FE-I16 | 瞬时提示不保存、不重放，提示这个操作没有结果 | 界面模块把「提示过」当成「人看到了」 | `shell-contract/tests/toast.spec.ts` 的「shows what a module hands over and gives nothing back」；`shell-contract/tests/slots.spec-d.ts` 的 `toast` 签名；`notification-ui/tests/toast-arrivals.spec.tsx` 的「toasting changes nothing about the notification」 |
| FE-I17 | 形口只有数据，外壳自己画；同一个界面模块再报一份就替换上一份；一个界面模块的报告随它的作用域撤掉；报告这个操作没有结果 | 卸掉的模块还让形在写，或界面模块把「报过」当成「人看到了」 | `shell-contract/tests/figure.spec.ts`；`shell-contract/tests/slots.spec-d.ts` 的报告形状；`apps/desktop/tests/figure.spec.tsx` |
| FE-I18 | 一个页面里至多一个形；形的大小等于 56px 乘字号档的系数，在每个座位上相同 | 屏幕上出现两个形，或形随座位变大小 | `ui-kit/tests/ink.spec.tsx` |
| FE-I19 | 字号档控制器不自己读写存储：偏好的读与写只经注入的函数；中楷时 `<html>` 上没有 `data-size` | 字号偏好有第二个来源，与调用者的存储不一致 | `ui-kit/tests/size-controller.spec.ts` |
| FE-I20 | 样式只读存在的 `--omne-*`；共用件以外不读 `--kami-*`、不声明自定义属性；`tokens.css` 以外没有颜色字面量与调色板类 | 一个变量没人定义时静默退回继承值，悬停或强调色悄悄丢掉；一种主题的颜色写死在件里 | `apps/desktop/tests/design-gates/tokens.spec.ts` |
| FE-I21 | `tokens.css` 以外没有大于 1px 的 px 数，也没有 rem（跟着字号走的 em 可以）；字号、行高、圆角、控件高度只取 token，图标只取图标刻度 | 换字号档时这一处不跟着变，版式错开 | `apps/desktop/tests/design-gates/scale.spec.ts` |
| FE-I22 | 时长与曲线只取动效 token；`tokens.css` 的动效 token 与视觉规范技能的时长表逐行相同；关键帧的名字恰好是技能公布的那几个 | 出现第二套时钟，动效的快慢各处不一 | `apps/desktop/tests/design-gates/motion.spec.ts` |
| FE-I23 | 媒体查询与代码里比较的宽度只有 768、1100、1160（`max-width` 写成减一） | 不同的页面在不同的宽度换版式 | `apps/desktop/tests/design-gates/breakpoints.spec.ts` |
| FE-I24 | 环的余量是一个注册的长度；每个裁切容器留出它，工作区的边除外；每个滚动容器拿它作滚动内边距 | 焦点环被裁掉一半，键盘用户看不到焦点 | `apps/desktop/tests/design-gates/rings.spec.ts` |
| FE-I25 | 共用件的控件以外没有原生的 `button`、`input`、`select`、`textarea`、`details`；可点的元素都带控件族的标记 | 一处可点的东西没有悬停与按下的反馈，或带进浏览器自己的样子 | `apps/desktop/tests/design-gates/clickables.spec.ts` |
| FE-I26 | 只画图标集里的图标；字形在 24 格内、用 `currentColor`、笔画数不超过上限，只经动效 token 上的过渡移动 | 出现第二种风格的图标 | `apps/desktop/tests/design-gates/icons.spec.ts` |
| FE-I27 | 两套主题下正文与状态词 4.5:1、字段边界与焦点 3:1；悬停、选中与强调的悬停彼此分得开 | 一种主题下字看不清，或指针下的行像是选中了 | `apps/desktop/tests/design-gates/contrast.spec.ts` |
| FE-I28 | 加载、空、出错各只有共用件的一个件；胶囊与数字徽标只有共用件的那一个 | 同一种状态在两页长得不一样 | `apps/desktop/tests/design-gates/one-per-job.spec.ts` |
| FE-I29 | 每份样式表都被导入；渲染的每个类名在样式里都有规则，或是工具类，或是共用件的类 | 一个件的样子整个没了，按散字排在页面里 | `apps/desktop/tests/design-gates/classes.spec.ts` |
| FE-I30 | 共用件根入口导出的每个值至少被一个界面模块或桌面应用用到；例外各带理由与带来使用者的那一程 | 没人用的件是等着被引进的第二套语言 | `apps/desktop/tests/design-gates/unused.spec.ts` |
| FE-I31 | 状态词只经 `StateWord` 从状态词表取；成员不自己写表里的词，不写表外的状态说法 | 同一个状态在两页叫两个名字 | `apps/desktop/tests/design-gates/state-words.spec.ts` |
| FE-I32 | 源码的文字里没有「正在生成」「正在等回复」「已连接」「强提醒」「弱提醒」 | 界面替系统说废话，正常的状态也占人的注意 | `apps/desktop/tests/design-gates/words.spec.ts` |
| FE-I33 | 时刻只经 `Ago` 与它的格式化模块写 | 同一页出现两种时钟格式，或把 UTC 原文给人看 | `apps/desktop/tests/design-gates/time.spec.ts` |
| FE-I34 | 图表画成 SVG，颜色只来自图表变量，每张图有表格视图 | 图表在一种主题下看不清，或读屏的人拿不到数 | `ui-kit/tests/charts.spec.tsx` 的「draws SVG whose colors come only from the style variables」与「gives the same data as a table」 |
| FE-I35 | 源码与本组、桌面应用的规格里指向视觉规范技能的锚点都存在 | 读者顺着引用找到的规则已经不在 | `apps/desktop/tests/design-gates/references.spec.ts` |
| FE-I36 | 成员视图与外壳里每个带字的 `Button` 都在登记表 `baselines/worded-buttons.json` 里，每一条写各有几个是哪一种：`commit`（落定）、`choice`（对话里的选项）、`primary`（一页唯一的主动作）、`name`（对象的名字作入口）、`value`（当前值），或交给哪一程收走（如 `R7`）；交给一程的只许去掉，那五种新加时写一条并写明种类，表外多一个就失败 | 面上又长出写字的工具钮，与图标钮的标准两套并存 | `apps/desktop/tests/design-gates/worded-buttons.spec.ts` |
| FE-I37 | 每个抬起的件连同它的投影与焦点环的余地，都在裁切它的每个祖先的可见范围里；件本身滚出视野的不算 | 钮与字段贴着容器的边被切掉边线与投影，看起来像坏了 | 判法的用例 `apps/desktop/tests/raised-edges.spec.ts`；观感走查 `apps/desktop/demo/visual-walk.mjs` 每张截图核一次 |
