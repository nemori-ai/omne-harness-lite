# 来历

本成员的设计语言、素材、字体与代码取自外部项目 `pandazki/super-assistant`，提交 `83c1616f44d000d1f333e929bfd94d31dff847da`。项目负责人在 2026-11-13 说它的设计语言、视觉、动画、素材、字体和前端技术栈都可以复用，并已全面授权。外部项目的仓库里没有 LICENSE 文件，复用依据只有这一条授权。每个来源文件的哈希在 [provenance.json](provenance.json)。

## 取了哪几块

| 块 | 来源（相对 `desktop/src/renderer/src/`） | 本成员 |
| --- | --- | --- |
| 设计 token | `design/tokens.css` | `src/styles/tokens.css` |
| 动效 | `design/motion.css`、`design/motion.ts`、`design/use-object-transition.ts` | `src/styles/motion.css`、`src/motion/` |
| 基线样式 | `styles.css` 的基线层、关键帧、减少动效、焦点、日期控件，以及折叠、空状态、页头、页列、分段、浮层的规则 | `src/styles/base.css`、`src/controls/controls.css`、`src/patterns/patterns.css` |
| 图标 | `design/icons/{brush,glyphs,glyph,index}.ts`、`icons.css` | `src/icons/`、`src/styles/icons.css` |
| 字体 | `public/fonts/` 的 Inter、JetBrains Mono 与各自的 OFL 文本，`assets/fonts/fonts.css` | `resources/fonts/`、`src/styles/fonts.css` |
| 霞鹜文楷 | `public/fonts/lxgw-wenkai/`（1.7.0，常规与粗体，按字符范围切成 194 片）与它的 OFL 文本，`assets/fonts/wenkai.css` | `resources/fonts/lxgw-wenkai/`、`resources/fonts/LICENSE.LXGWWenKai`、`src/styles/wenkai.css`（只改了字体文件的地址）。约 9 MB，负责人 2026-11-15 定纳入。它排在中文字体栈的第一位，页面只取用到的那几片 |
| 全角标点 | 不取来源的文件，只照 `public/fonts/TsangerJinKai02-W04.woff2`（粗体照 `-W05`）每个字形的前进宽度 | `resources/fonts/omne-punctuation/` 的常规与粗体两个文件、`resources/fonts/LICENSE.OmnePunctuation`、`src/styles/fonts.css` 的两条 `@font-face` 与 `--omne-font-han` 的第一位。为什么：来源的仓耳今楷把全角标点做成按比例宽，霞鹜文楷画成 1 em，标点后面空出大半个字（OD-15）。怎样改：从随包的霞鹜文楷 1.250（网页字体包 1.7.0）的切片里取 25 个全角标点的字形，前进宽度取仓耳今楷同一字形的宽度按 UPM 换算；墨在左边的标点左边距不变，开头的标点整个字形左移，到下一个字的距离不变；破折号、省略号与「～」不改。上游较新的版本保留了 `LXGW`、`霞鹜` 等名字，附加许可不放行改宽度，所以用自己的家族名 `Omne Punctuation` 发，name 表里不带这些名字；194 片原文件不动。重做：用 fontTools，读 [provenance.json](provenance.json) 的 `modified` 修改表，每个码位从表里那一片复制字形，水平平移 `shift`，前进宽度写 `advance_to`，左边距取平移后的 xMin；换家族名、全名与 PostScript 名，存成 woff2 |
| 基础控件 | `components/ui/*.tsx`（十三个）、`components/ui.tsx`、`lib/utils.ts`、`keyboard/focus.ts` | `src/controls/`、`src/lib/` |
| 通用件 | `components/ai/*`、`disclosure`、`empty-state`、`loading-state`、`loading-ink`、`page-header`、`page-column`、`save-receipt`、`fact-list`、`code-surface`、`confirm/*`、`icon-button`、`inline-notice`、`ago`、`conversation/time.ts`，连同各自的 CSS | `src/patterns/` |
| 流式 Markdown | `conversation/prose.tsx`、`code-highlight.ts`、`markdown-diagrams.ts`，`conversation.css` 里 Markdown 的规则 | `src/prose/`、`src/styles/prose.css` |
| 主题 | `theme/controller.ts` | `src/theme/` |
| 墨迹 | `spirit/` 里形的引擎与件，`assistant/told-note.{tsx,css}` | `src/ink/`，逐文件见[墨迹](#墨迹) |

## 改了哪几样

- CSS 变量前缀 `--pe-` 全部改为 `--omne-`；类名与动画名的前缀 `pe-` 也全部改为 `omne-`。Markdown 的根类名从 `conversation-markdown` 改为 `omne-prose`。
- 注释全部删去，只留许可声明与工具读的取时标注。
- 路径别名 `@/` 改为相对导入，导入写 `.ts` 与 `.tsx` 扩展名。
- 断开对来源自己东西的依赖：
  - `icon-button` 不再读尺寸偏好，提示偏移写成常量 4。
  - `inline-notice` 重写：属性是语气、标题、正文、详情、可选的动作，失败码到文案的映射归调用者。
  - 图标只留 `gentle` 一种风格，笔画的粗线分支与偏好订阅删去。
  - `prose` 去掉 `omne://` 与提及的链接解析，链接按外链处理；Markdown 控件的文案换成中文。
  - `focus.ts` 不认识外壳：没有落在键盘区里时，回退到调用者给的区，不给就不回退。
  - 主题控制器的偏好来源改为注入：`createThemeController({ read, write, system })`。
  - `time.ts` 与 `ago` 不再读多语言目录。
- 多语言：`sheet`、`confirm/*`、`state-word`、`prose` 的 Markdown 控件、图表（`frame`、`simple`、`series`）、`time.ts` 与 `ago` 的相对时间，文案都改为属性，缺省值是中文。
- `input` 去掉 `dark:` 的第二套颜色，颜色只走 `light-dark()`。
- 样式里的长度只读 token：各个 CSS 文件里大于 1px 的 px 与 rem 换成已有的 token 或 `--spacing` 的倍数；单处用到的长度在 `tokens.css` 里按角色起名，四档各写一个值。代码块右缘渐隐的 `--omne-code-edge` 改为 0 到 1 的系数，乘 `--omne-code-fade`。`patterns.css` 读的 `--omne-window-inset` 在 `tokens.css` 里定义，缺省 0。
- 字号档的控制器与一档一档调的函数（`src/size/`）是本成员写的：偏好的读写由调用者注入，自己不碰存储；四档的名字与系数是来源 `tokens.css` 里的那四档。
- 去掉的死代码：`brush.ts` 里只给来源的脚本用的函数。
- `styles.css` 里 `main.list-reading` 一类业务版式、壳与设置的类不取。

## 重新对齐

2026-11-21 从 `3b967f58768714d57cd1bacf67b599d2aa7a8f53` 对齐到 `83c1616f44d000d1f333e929bfd94d31dff847da`。两个提交之间，取过的文件里变了四个，[provenance.json](provenance.json) 里它们的哈希随之更新，`realigned` 记着起点与这四个文件：

| 来源文件 | 来源的改动 | 本成员 |
| --- | --- | --- |
| `components/ai/receipt-pill.tsx` | 回执多一种 `declined`：拒绝，用拒绝的记号与结束的语气 | `src/patterns/ai/receipt-pill.tsx` 照改 |
| `design/use-object-transition.ts` | 对象过渡落到看得见的那一面，跳过 `[inert]` 里同一个对象的视图 | `src/motion/use-object-transition.ts` 照改 |
| `i18n/state-labels.ts` | 多一个状态词 `notDone`（没做），算作 `released` | `src/patterns/ai/state-labels.ts` 照改，只取中文 |
| `design/icons/brush.ts` | 删去 `smoothPath` | 本成员本来就没有它，不用改 |

## 墨迹

形、墨框与告知笺搬自来源的同一套笔法，不是近似：算法、分支、具名常量和随性的范围都与来源相同，笔迹记录 `tests/ink-trace.spec.ts` 守着这一点。每个来源文件要什么、不要什么，按 R3 的来源清单（每个来源文件一行，「依据」一列写产品正文里对应的概念或非目标）。下表的「依据」就是那一行的依据。

### 来源文件与本成员的文件

路径相对 `desktop/src/renderer/src/`。

| 来源 | 本成员 | 删去的功能（依据：来源清单那一行） |
| --- | --- | --- |
| `spirit/casual.ts` | `src/ink/casual.ts` | 无 |
| `spirit/writing.ts` | `src/ink/writing.ts` | 无 |
| `spirit/ink.ts` | `src/ink/ink.ts` | 无 |
| `spirit/brush-weight.ts` | `src/ink/brush-weight.ts` | `weightOn`（纸面） |
| `spirit/bristle.ts` | `src/ink/bristle.ts` | 无 |
| `spirit/ink-canvas.ts` | `src/ink/ink-canvas.ts` | `InkFrame.paper`、`setArea`（小品展开纸面） |
| `spirit/clock.ts` | `src/ink/clock.ts` | 两个窗口共用的系统时钟偏移（离开窗口、原生窗口）。这个文件改作墨迹唯一的取时出口 |
| `spirit/carry.ts` | `src/ink/travel.ts` | `Carrier`、`glide`（拖拽与拿起）。只搬 `FLIGHT`、`flightTime` |
| `spirit/observation-frame.tsx` | `src/ink/travel.ts` | 观测框全部（观测）。只搬类型 `Box` |
| `spirit/travel.ts` | `src/ink/travel.ts` | 翻面、拿纸边、逛（`Timed`、`HELD_INK`、`CARRY_WAKE`、`stroll`、`carries`、`way`、`along`、`hold`、`reached`、`held`、`alongShare`、`head()`）；座位的 `opened`（`setOpened`、`covered`） |
| `spirit/body.ts` | `src/ink/body.ts` | 小品（闲时与悬停小品）；化形；起名；`setSending`、`soak`、`setReceiving`、`setHand`（读取、拿东西靠近、拖拽进门、纸面笔调）；`paper`；只服务这些功能的 getter、`WRITE` 里的 10 项、`Role` 里的 `form`、`piece`、`guise` |
| `spirit/doing-ink.ts` | `src/ink/doing-ink.ts` | `NAMED`、`SAYS`、`saysTiming`（起名） |
| `spirit/pieces.ts` | `src/ink/doing-ink.ts` | 只搬 `pressOf`，其余是小品 |
| `spirit/doing.ts` | `src/ink/doing.ts` | `figureDoing`、`GESTURE`、`followActivity`、化形的 `changing` 分支 |
| `spirit/note-ink.ts` | `src/ink/note-ink.ts` | 丝线与签条（快捷笺） |
| `spirit/note-bubble.tsx` | `src/ink/note-bubble.tsx` | 签条、字形与起名笺的时序（快捷笺、起名） |
| `spirit/ink-bubble.tsx` | `src/ink/ink-bubble.tsx` | `canvas`、`words`、`slips` 三个参数（起名笺、快捷笺） |
| `spirit/spirit-ink.tsx` | `src/ink/figure-ink.tsx` | 随纸面改纸的区域（小品） |
| `spirit/spirit-journeys.tsx` | `src/ink/figure-journeys.tsx` | 无 |
| `spirit/spirit-stage.tsx` | `src/ink/figure-stage.tsx` | 观测框与签、拖放、笺、键盘、座位提示、多语言、表面的指针区域（观测、拖拽、快捷笺、悬停小品）。只取 `placeAt`、层与旅程的挂载、悬停、按下、抬起与取消 |
| `spirit/seat.tsx`，`spirit/host.ts` 的 `besideOf` | `src/ink/seat.tsx` | 座位提示、`still`、`lively`、`jump`、`opened`、`work`、菜单与激活（座位提示、观测、宿主接线） |
| `spirit/store.ts` | `src/ink/store.ts` | 拖拽、栖、逛、观测、笺、化形、小品、闲时、悬停提示、翻面、宿主链接 |
| `assistant/told-note.tsx` | `src/ink/told-note.tsx` | `ClassicTold` 与它的宿主接线、纸面墨（纸面、宿主接线）。只取画笺的 `ToldNote`、`TOLD_LINES`、`toldLines` |
| `spirit/spirit.css`、`spirit/ink-bubble.css`、`assistant/told-note.css` 里要的部分 | `src/ink/ink.css` | 观测框、标签、座位提示、抓手、原生窗口、笺、快捷笺的规则；告知笺的拖动区与侧栏宽度那一条（侧栏版面归宿主） |
| `design/icons/brush.ts` | `src/icons/brush.ts` | 仍不取 `strokeWriter`（观测）。墨迹用到的 `Pressure`、`handPressure`、`Fineness`、`strokeSpine` 补成导出 |

没取的来源文件：`told.ts` 的「最新一条没看过」「看过即收」归外壳；`activity.ts` 的事件源在本产品是形口，归外壳；`kit-ink.ts`、`marks.ts` 是给小程序写记号的，`zoom.ts` 只服务原生窗口，本产品都没有。

### 与来源不同的地方

- 前缀与名字：类名和 CSS 变量的 `spirit-`、`pe-` 改为 `omne-`；`SpiritBody` 改为 `FigureBody`，`SPIRIT_CANVAS` 改为 `FIGURE_SIZE`，`SPIRIT_PAPER` 改为 `FIGURE_PAPER`，`spirit-*.tsx` 改为 `figure-*.tsx`。`Gesture`、`gesture()` 改为 `FigureMoment`、`moment()`，带 `serial`，与外壳契约的形口用同一个词。
- 取时：来源各处的 `performance.now()` 都改经 `clock.ts` 的 `inkNow()`。它是唯一带取时标注的出口，用例能换掉它；`travel.ts` 与 `note-bubble.tsx` 帧回调里的时刻也由它取，比帧开始的时刻晚一点点。
- 颜色字面量（FE-I20：颜色只写在 `tokens.css`）：画布的兜底墨色 `#1f1d1a` 改为 `CanvasText`；擦除笔和层画布遮罩的 `#000` 改为 `CanvasText`，这两处只用 alpha，结果相同；墨晕的三个 `rgba(0,0,0,…)` 改读 `--omne-ink-wash-*`，纸的遮罩改读 `--omne-ink-mask`，墨框影子改读 `--omne-ink-shadow`，值都与来源相同。
- 长度字面量：样式里大于 1px 的长度换成 `tokens.css` 里按角色起名、四档各一个值的 token（`--omne-ink-bubble-paper-soft`、`--omne-ink-shadow-y`、`--omne-ink-shadow-blur`、`--omne-ink-breath-near`、`--omne-ink-breath-far`、`--omne-told-note-room`、`--omne-told-note-padding`），中楷的值与来源相同。
- 告知笺的截行：来源只在经典面侧栏展开、笺在家里时截行；本成员处处截（最多三行，第四行能写完全文时写四行），因为本产品的告知笺只在家写。笺的宽度不越出侧栏，由外壳的版面限定。
- 告知笺的按钮：原生 `button` 改为 `role="button"` 的 `span`，带 `data-control="told-note"`（FE-I25）；`Told` 只有 `id` 与 `text`；`onOpen` 收整条 `Told`。
- 停留规则：`doing.ts` 的 `follow(doing, moment)` 直接收状态名与一次性的事实，`serial` 变了才算新的一次。来源从 `activity.ts` 读活动。`DWELL`、`SETTLE`、`LAG` 与欠账照来源。
- 形的一层与座位：座位直接从页面元素读，中点照来源取到 0.01；来源由宿主每帧轮询座位，本成员在 resize、捕获阶段的 scroll、`body` 与座位的大小变化、`inert` 变化时重排，没事时帧循环停着。没有看得见的座位满 `SEATLESS_HOLD` 500 ms，墨原地干去（来源是去角落）。一个页面只画一个形（FE-I18）。悬停时圆心点一个墨点，抬起时回调 `onPress`。命中区是半径为形大小 0.4 的圆。
- `note-bubble.tsx` 删了 `canvas` 参数，字号档的系数用 `useSizeFactor()`。
- 写法：构造参数属性改成字段（`erasableSyntaxOnly`）；lint 要求的地方把展开复制改成 `Array.from` 或 `slice`；注释全部删去，只留取时标注。
- 拆开的函数：下面六个函数各拆成几个小函数，行为不变，笔迹记录逐字节不变。
  - `bristle.ts` 的 `Painter.paint`：一根笔毛的一段移到 `paintHair`，笔毛的半宽移到 `halfWidth`，`push`、`flush` 成了私有方法，`n`、`ctx`、`drew` 成了字段。
  - `body.ts` 的 `stopDoing`：浮回墨色移到 `riseRest`，判哪一笔该浮回移到 `thinned`。
  - `body.ts` 的 `lookRound`：看向哪里移到 `glanceAt`，引线移到 `threadFrom`。随机数的取用次序不变。
  - `note-bubble.tsx` 的收起 `close`：移出 `keepLive`、`foldFrom`、`timeFold`、`foldLeft`。
  - `ink-bubble.tsx` 的放置钩子：移到 `usePlacement`，比较移到 `samePlace`、`samePoint`。
  - `told-note.tsx` 的 `ToldNote`：笺坐在哪里移到 `useToldSpot`，量行数移到 `useToldLines`。

## 没取的

- 仓颉今楷：许可不许作为应用资产发布。
- 对话的气泡、输入框、转写区、会话列表、设置页的版式，壳的导航与侧栏。它们归各领域的界面模块与应用的外壳。
- `lucide-react`、`tw-animate-css`、路由库、react-query、多语言库。

## 许可

基础控件改自 shadcn/ui 的 new-york-v4 风格，MIT，声明在 [LICENSE.shadcn](LICENSE.shadcn)，这些文件的第一行写了许可标识。Inter、JetBrains Mono、霞鹜文楷与由它改出的 Omne Punctuation 是 SIL OFL 1.1，许可文本放在 `resources/fonts/` 里字体旁边。
