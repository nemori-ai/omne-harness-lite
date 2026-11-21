# 来历

本成员的对话与会话列表的版式取自外部项目 `pandazki/super-assistant`，提交 `3b967f58768714d57cd1bacf67b599d2aa7a8f53`。复用依据与共用界面件相同，见 [ui-kit 的来历](../../frontend/ui-kit/UPSTREAM.md)。

## 取了哪几块

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本成员 |
| --- | --- | --- |
| `components/conversation-patterns.css` | `9cf38456486263906c14fbd45f07a3ce822d7e4d2e7a2ee56ee9d432b3417b63` | `src/view/session-ui.css`：气泡与输入框 |
| `conversation/conversation.css` | `4c34c3a3ec0e87daf2d60d46a88f428863d1690a8e92fbcb9496850c27e30a25` | `src/view/session-ui.css`：对话页的栏宽、标题栏、转写区、一轮的分隔线 |
| `routes/conversations/directory.css` | `2ff2d6f67db1284e373107b6836141feb0af6f6c4779ea92e12610bcad834f60` | `src/view/session-ui.css`：会话列表的行、标题与时间 |
| `conversation/composer-action-slot.tsx` | `f61b95c33bc2e938587e9ca1cba8a592de7ce99e2e10f0ef96d3794245b10edf` | `src/view/composer-action-slot.tsx` |
| `conversation/transcript-arrivals.tsx` | `60663d4162ee3c86296a5ce58a870606a9fa961d6b983936982d8879986f44fa` | `src/view/transcript-arrivals.tsx` |

## 改了哪几样

- CSS 变量前缀 `--pe-` 改为 `--omne-`，类名改为 `omne-` 前缀；只留本成员用得到的规则。
- 注释全部删去。
- 发送、停止、正在停止的那一个按钮照来源只画字形（R6b）：发送是实心的样子，名字在可访问名称与提示里，直接写中文，不读多语言。不同之处：多一张「再确认停止」的脸，用重试的字形；停止的几张脸在提示里名字后面接一句后果，这句也是描述，所以用共用件的 `ActionTooltip` 加 `Button` 拼成，不用 `IconButton`；字形换入的弹出动效没有取。
- 转写区的行不是 `li`，是一层 `div`；只有刚到的行淡入，用共用界面件的 `useArrival`。
- 贴底跟随沿用本成员原有的 `src/view/scroll.ts`，没有取来源的 `scroll.ts`。

## 对话头与侧边区（R4）

对话头的座位、形口报告、侧边区的停靠与墨框、侧边区的标题，取自同一个来源的提交 `83c1616f`。

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本成员 |
| --- | --- | --- |
| `conversation/agent-work-panel.tsx` | `293dc966e53c80ede12d014de72b2c0e0b776f2f118ba3f426fdc5c0a25dc09c` | `src/view/side-frame.tsx`：对话头的控件；`src/view/side-panel.tsx`：停靠与墨框 |
| `conversation/work-dock.ts` | `6988a06e4afe0572c978e33f5ae2038a7ac4cef47fd44dc703adb599140eac63` | `src/view/side-frame.tsx`：`dockFits` |
| `conversation/agent-work-panel.css` | `c85820beb698c2d93e030327abefdac5d4cc0b97b3b0dec2cae89feff2789f72` | `src/view/session-ui.css`：停靠的格线轨道、侧边区的标题 |
| `conversation/assistant-activity.ts` | `e7e7679eeaf39f67d9dff3f6354587601c9e1473eb3e6336105d9270535b75cd` | `src/view/figure-report.tsx` |
| `assistant/activity.ts` | `0f347ead6e2ec38769c6018fb5043c41d146ef200f9fe5cd9cf9535d3cb3f213` | `src/view/figure-report.tsx` |

### 对话头的座位

- 来源的触发器是肖像加名字。这里是共用件的座位 `header`（优先级 2）加名字「Agent」，形坐在座位上。
- 有侧边区内容时，座位与名字合成一个控件；没有内容时只是座位与名字，不是控件。来源总是一个控件。
- 控件在头部正中（R6c 起，见下面「对话头的三栏」；R5、R6 时在标题旁）。来源的主对话也在正中，停靠时不动；别的对话在停靠时把触发器移进侧栏，并平移 140。
- 照来源：展开时控件静止时没有底色，指针放上才有。
- 照来源 `c0073196`：按下控件时，如果它拿着键盘给的焦点，先放掉，再按指针的方式拿焦点，不留焦点环。

### 形口报告

- 照来源的活动：一轮在跑时，有没结果的工具调用是 `looking`，回复在写或刚落笔是 `writing`，其余是 `thinking`；没有一轮而有后台调用是 `background`。
- 不同之处：工具不分种类，一律是 `looking`；来源把 making 算 `writing`、self 算 `changing`。人自己的取消也算 `could-not`，照产品的状态表。来源的 `changing`、`named` 和 work、beat 那种后台，这里没有对应的事实。不报 `subject`。

### 侧边区的停靠与墨框

- 照来源：门槛是 `dockFits(width, 系数)`，即宽度不小于 1160 乘字号档的系数。系数取共用件的 `useSizeFactor()`。字号变了、宽度没变，也重新量。
- 不同之处：量的是对话页自己的 `clientWidth`，含左右留白。来源量的是它的版式盒。
- 停靠时照来源用一条格线轨道：轨道从 0 滑到侧边区的宽度，`column-gap` 从 0 到一个页间距，时长与曲线是 `layout` 与 `ease-enter`；里面的版面宽度不变，从它贴着的那一边滑进来，收起时在 `exit` 与 `ease-exit` 上离开；减弱动效下没有过渡。
- 不同之处：宽度 320 写成 `calc(var(--spacing) * 80)`，间距 32 写成 `--omne-space-page`，滑进的 12 写成 `calc(var(--spacing) * 3)`，都随字号档变。裁切放在 `aside` 上，用 `overflow: clip` 并留出焦点环的位置。来源用一层绝对定位、`overflow: hidden` 的裁切层。轨道的选择器用 `:has()`，因为侧边区的父元素归对话页。
- 照来源（R6c 起）：缺省收着，人按对话头的控件打开；人在停靠时的开与收在对话页挂着期间保留，换会话、宽窄切换都不变；窄时墨框的开与收不算这个选择。不同之处：来源把这个选择记在整个窗口里，这里记在对话页里。
- 不同之处：停靠时收起侧边区是一个图标钮，镜像的折叠字形，名字「收起侧边区」在提示里（R6b）。来源用 × 图标。
- 照来源：窄时是淡墨框，从座位朝下写出；开在头部细线下 `BELOW_RULE`（8）；宽度上限 600（`--omne-measure-decision`），不越出头部；在别处按下就收起；Escape 收起并把焦点还给控件。
- 照来源：侧边区的正文区标着 `data-initial-focus`，可以用 Tab 到达。不同之处：只有从键盘打开墨框时，焦点才进到墨框里；墨框放好之后的下一帧，由共用件的 `focusSurface` 放进去。指针打开的墨框不移动焦点。
- 侧边区在停靠时与墨框里都标 `data-keyboard-region`，F6 走得到它。收起的停靠侧边区是 `inert`，F6 不停在那里。

### 侧边区的标题

- 照来源面板的组标题（`agent-work-panel.css` 第 11、12 行）：说明字号、强字重、淡墨色，基线对齐；标题与数之间一个行内间距；数用 `tabular-nums`，字体与标题相同。
- 不同之处：外边距是 0，与正文之间的距离由侧边区的间距给出；标题不换行，太长时用省略号截断。只有带数的项写数，现在只有「后台」带数。有两项以上时，同样的标题与数写在页签里。

## 会话列表、已归档与搜索页（R5）

- 照来源提交 `83c1616f`：会话列表与搜索结果的行是共用件 `GlideMenu` 的行（来源 `components/ai/glide-menu.tsx`，sha256 `535de9b5f964a8ec427bbad13bc6d62f922313ecfd1745c231eebb705eba01eb`），时间是共用件 `Ago`（来源 `components/ago.tsx`，sha256 `f474b3e44fc6a9cc3f40216aa517953576ca2cc75926b75edc636bd0e5adabae`）；行里一行标题、一行相对时间照来源的话题行。不同之处：已归档在侧栏里原地展开，来源是同一页上的分段；本成员没有取来源的代码与样式，只用共用件。

## 对话页的头部、转写与输入框（R5）

头部、气泡、标记与输入框的样子取自同一个来源的提交 `83c1616f`。

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本成员 |
| --- | --- | --- |
| `conversation/conversation.css` | `4c34c3a3ec0e87daf2d60d46a88f428863d1690a8e92fbcb9496850c27e30a25` | `src/view/session-ui.css`：头部高 84 与细线；转写区两边留滚动条的位置；同一说话人与换人的间距；输入框的上限 |
| `components/conversation-patterns.css` | `9cf38456486263906c14fbd45f07a3ce822d7e4d2e7a2ee56ee9d432b3417b63` | `src/view/session-ui.css`：两边的气泡、阅读字体与字距；输入框这张纸与聚焦时变深的线 |
| `conversation/dialogue.css`、`conversation/dialogue.tsx` | `7a5b5a28f7e24cba47d9d4c4bb446700c3e67106f78925062387cde4607c677a`、`0bd609829b91eca8a80c48b5acbfd29c12ad4bd659598f1299f112360cc1745c` | `src/view/parts.tsx`、`src/view/session-ui.css`：说话人的名字只给读屏 |
| `routes/conversations/management.tsx` | `aa02330303442aa6a213b6ab7c155951495889c0ba448f2c143dcdce0d577f72` | `src/view/conversation-page.tsx`：头部的 `⋯`，事实在上、动作在下 |

- 照来源：头部的 `⋯` 是共用件的 `IconButton` 加 `DropdownMenu`，上面是这个会话的事实，一条分隔线，下面是动作。不同之处：事实只有会话标识（等宽，显示前 12 位，整串在提示里）；复制是菜单里的一项，按下菜单不收，这一项自己的字换成「已复制会话标识」再换回来；动作只有「归档」，按下就发，回执写在 `⋯` 旁边。来源的事实是开始的时间与连接状态，动作有改名与归档。
- 不同之处：头部高 84 写成 `calc(var(--spacing) * 21)`，随字号档变；输入框的上限 400 写成 `calc(var(--spacing) * 100)`。右边的模型与权限处理是共用件的 `Select`，去掉字段的边与底，指针放上或打开时才有底色。来源的右边是检视入口与对话头的控件。
- 不同之处：正常的一轮开始与完成不画，靠历史条目的种类认出来，界面模型不变；失败那一行的字用失败色。
- 不同之处：在途的话发送中与已受理不画字；未知与没有发出写在气泡下一行，没有发出用失败色。
- 不同之处：从搜索跳来的那一行用共用件的 `useSettleCue` 落定一次，不留框。

## 过程行、失败的一轮、排着的话与收起的头部（R6）

过程行的样子取自同一个来源的提交 `83c1616f`。

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本成员 |
| --- | --- | --- |
| `conversation/run-line.tsx` | `28eb5b5d0235d882839e712c41305d4060e9ac63730c25b4c188ae64581af783` | `src/view/parts.tsx`：推理与工具调用各是一行，原地展开；推理展开成阅读字 |
| `components/ai/trace.tsx` | `db31f99ff0834e64e174457c2afde6b18f3aac4d17ba838806289b44dc35c822` | `src/view/parts.tsx`：行是共用件 `TraceHeader`（`TraceRow` 一族）加 `DisclosureContent` |

- 照来源：一行是展开控件，箭头在前，名字后面是状态，展开只由人来做；记录读回来时不出声。
- 不同之处：来源一轮只有一行，展开后每个工具一行；这里照会话规格，推理与每个工具调用各是一行，各自展开，不叠第二层。行上不闪光、不转圈（`quiet`），在做什么由形来说。状态是看得见的共用件状态词，来源只有记号加读屏的字；这一轮结束而没有结果写「没有结果」，中性。
- 不同之处：展开后参数是共用件 `FactList`，嵌套的值写成一行摘要、空对象不写；结果是共用件 `CodeSurface`。来源展开的是工具最后一行输出与全部输出。
- 不同之处：推理与工具调用不在气泡里，站在 agent 这一侧的气泡之间；连着的话仍在一个气泡里。系统提醒与内部工具消息是最轻的一行：没有图标与状态词，说明字号。
- 一轮失败照会话规格：共用件 `InlineNotice` 的 `danger`，诊断放进它自己的「详情」，「重试」是它的动作；重试的结果不知道、连不上、被拒写在通知里，中性的墨。来源没有对应的一块。
- 排着的话照会话规格：一行说明字号的共用件 `Disclosure`，原地展开成列表。来源没有对应的一块。
- 头部放不下时照会话规格：权限处理先收进 `⋯`，再收模型；`⋯` 里是共用件 `DropdownMenuSub`，触发的一行写当前的值，展开是可选的值。量的是每样东西自己的宽度，收起的那一样留在原处、看不见、不占位，所以宽度一直量得到。R6c 起头部是三栏，右端只用自己那一栏，收起只看右端放不放得下；标题那一栏与它一样宽，标题的 8 个字靠栏宽，收起给不了标题地方。来源没有对应的规则。

## 后台调用与侧边区的页签（R6）

- 照来源 `83c1616f` 的 `conversation/agent-work-panel.{tsx,css}`（sha256 见上面「对话头与侧边区」一表）：后台的每一项是一行原地展开的行，展开的内容缩进到行字之下，正文是说明字号、弱墨。不同之处：行是共用件的 `DisclosureTrigger` 加 `DisclosureContent`，一行里是等宽的短号、意图与共用件的状态词，箭头在前；来源是图标、标题、下一行的状态词，箭头在后。「停止」是行尾唯一的动作，来源的停止在展开的内容里。停止的进度是共用件的 `FactList`，三行；来源没有这一块。
- 不同之处：侧边区选中的页签由对话页的侧边区状态保管，宽窄切换不变；输入框上方「后台有 n 项在跑」按下时选中「后台」并展开侧边区。来源没有这条提示。

## 抬起的件的余地（R6b）

- 输入框上方放卡的停靠条 `.omne-session-dock` 与侧边区的正文 `.omne-session-side-body` 两个滚动区向外伸出焦点环的余地，再把它作自己的内边距（S15、K1）：卡边上、面板边上的抬起的件不被裁，里面的东西不挪。来源没有这一条。

## 对话头的三栏（R6c）

头部的三栏、标题的手、正中的座位与名字取自同一个来源的提交 `83c1616f`。

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本成员 |
| --- | --- | --- |
| `conversation/conversation.css` | `4c34c3a3ec0e87daf2d60d46a88f428863d1690a8e92fbcb9496850c27e30a25` | `src/view/session-ui.css`：`.conversation-header[data-assistant-home='true']` 的 `minmax(0, 1fr) auto minmax(0, 1fr)`；头部的间距 12；`.conversation-header-controls` 的间距 12；767 以下头部右边留给抽屉开关的 42 |
| `assistant/topic-switcher.css` | `737d698a7c792f0ca57f2f98c6658e07b3e6cdcc2b195c7e9c70bade14383dbe` | `src/view/session-ui.css`：标题是界面字号、常规字重、弱墨 |
| `conversation/agent-work-panel.css` | `c85820beb698c2d93e030327abefdac5d4cc0b97b3b0dec2cae89feff2789f72` | `src/view/session-ui.css`：`.agent-work-trigger[data-presentation='hero']` 的高 60、内边距 6 16 6 6、间距 12、最宽 320，肖像 48，名字是阅读字体、lead 字号、常规字重、标题行高 |

- 照来源：三栏，左栏贴左，右栏贴右，座位与名字合起来在正中。来源的 px 由构建乘字号档的系数，这里写成 `--spacing` 的倍数，随字号档变；字号、字重、行高与墨取 token。
- 不同之处：左栏是会话的标题，只取话题控件写字的样子（字号、字重、墨），不是控件，没有图标、箭头与下拉，省略号收住；贴着头部的左边，不留按钮的内边距。
- 不同之处：座位件不画东西，座位的框取肖像的 48；名字是「Agent」，比来源的「桂」宽，所以座位比参照偏左，偏的量是两个名字宽度之差的一半。
- 不同之处：右栏是模型、权限处理两个安静的下拉与 `⋯`。来源主对话的右栏只有检视入口。
- 不同之处：767 以下外壳的角里是家与抽屉的开关（OD-19），右栏离这个角一个行内间距，这个宽从 token 算出：右边的一个间距、开关、一个间距、家（座位加一个间距）、再一个间距；页的左右留白相等，取窗口宽与头部宽之差的一半。来源只让开开关：头部右边留 42，开关离窗口边 10、宽 40，页边 16。

## 输入框只有一行（R6c）

输入框的纸、字段与字段下面那一行取自同一个来源的提交 `83c1616f`。

| 来源（相对 `desktop/src/renderer/src/`，`scripts/` 相对 `desktop/`） | sha256 | 本成员 |
| --- | --- | --- |
| `components/conversation-patterns.css` | `9cf38456486263906c14fbd45f07a3ce822d7e4d2e7a2ee56ee9d432b3417b63` | `src/view/session-ui.css`：`.assistant-composer` 的内边距与间距，字段的最小高度、内边距与占位符的墨 |
| `conversation/conversation.css` | `4c34c3a3ec0e87daf2d60d46a88f428863d1690a8e92fbcb9496850c27e30a25` | `src/view/session-ui.css`：那一行的右端（`.composer-send-pair`） |
| `styles.css` | `489f671735b0c91da06e972491c71a1346c6a4d641e1936ce85c9de3844a5565` | `src/view/session-ui.css`：纸的细线是输入框自己的浅线（`--pe-composer-line` 即 `--kami-line`） |
| `i18n/zh-CN/conversations.ts` | `da1915f0a17da5c5e3b19f2fc42593f9e52a3c62cbb946fc63c5b7e630b59480` | `src/view/conversation-page.tsx`：占位符「发消息给」加名字（`daily.messagePlaceholder`） |
| `scripts/size-lengths.mjs` | `671f81be63c384e80824f9c86788f5efd190e094e3042a34bcc10769dba3948e` | 来源样式表里大于 1px 的长度乘字号档的系数，所以这里写成 `--spacing` 的倍数 |

- 照来源：纸的内边距 12、16，字段、那一行之间隔 8，字段最小高 38、内边距 2、2、0，都随字号档变，写成 `calc(var(--spacing) * n)`；细线是 `--omne-line-subtle`；占位符是 `--omne-ink-faint`；字段是一行起（`rows` 为 1）。
- 不同之处：占位符是「发消息给」加对话头上 Agent 的名字（同一个常量），没有来源的「，@ 引用」；有在等人答的调用时后面接「，会排队，不算回答」。来源在一轮生成时换成另一句。
- 不同之处：那一行左边没有来源的附件、引用、新建资源三个图标钮，也没有「发到新话题」；左边留给 `sessionComposerAttachments` 放进来的图标动作；这个拓展点本成员还没有实现，左边空着。右边是 `sessionStatus` 的状态位与唯一的动作钮，隔一个行内间距，照来源的 `.composer-send-pair`。
- 不同之处：字段自己的上限 `min(40dvh, 320px)` 没有取，只有纸的上限。

## 阅读列、过程行、系统提醒与失败通知（R6c）

取自同一个来源的提交 `83c1616f`。来源的样式表都按中楷写 px，构建时乘上字号档的系数（`desktop/scripts/size-lengths.mjs`，sha256 `671f81be63c384e80824f9c86788f5efd190e094e3042a34bcc10769dba3948e`）；这里把同一个数写成 `calc(var(--spacing) * n)`，`--spacing` 在四档是 3、4、5、6，效果相同。

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本成员 |
| --- | --- | --- |
| `conversation/conversation.css` | `4c34c3a3ec0e87daf2d60d46a88f428863d1690a8e92fbcb9496850c27e30a25` | `src/view/session-ui.css`：`.conversation-page` 的内边距 0 40 32；`.conversation-main` 最宽 740、居中；`.conversation-transcript-frame` 与 `.conversation-transcript` 的槽、余地 6、上 8、下 24、最矮 160；`.conversation-run-line` 的标签可以换行；`.conversation-run-reasoning` 的字号与量度 |
| `components/conversation-patterns.css` | `9cf38456486263906c14fbd45f07a3ce822d7e4d2e7a2ee56ee9d432b3417b63` | Agent 的纸：底色、圆角、内边距与 70ch，R5 已照这里写，本程核过没有改 |
| `conversation/run-line.tsx` | `28eb5b5d0235d882839e712c41305d4060e9ac63730c25b4c188ae64581af783` | `src/view/session-ui.css`：过程行里的工具名是等宽的说明字号（来源调试时工具名是 `font-mono text-xs`） |
| `components/inline-notice.tsx`、`components/ai/tone.ts` | `e09b4af08bd38a667995572dffa36f8e620422c1741895726f387306394c2a2b`、`a031e554076fa86dc03dff1052bfe2112590e05d614e3c8149e0a32dd9713709` | 只核对，没有取：来源的通知整块是语气的墨（`TONE_SURFACE` 的 `text-danger-ink`），正文跟着它 |

- 照来源：转写的滚动区向主列外伸出滚动条的槽与余地，再把余地作自己的内边距，行落在主列的两边上，你的话的气泡收在右边上。不同之处：槽取共用件的 `--omne-scrollbar-size`（四档 8、10、12、15），来源是 10 乘系数（7.5、10、12.5、15）；没有来源那一层裁切的框，转写自己不是裁切的容器。
- 不同之处：主列打头的不是转写时（重连的那一行、通知），它离头部的细线一格，与转写第一行的上边距相同。来源的主列里没有这样的东西。
- 不同之处：推理的阅读字照来源是界面字号、62ch，里面的标题不放大；来源的推理在一轮的那一行展开后的行里，这里每段推理自己是一行。
- 不同之处：失败通知只有说事实的那一句是失败的墨，后面说条数与怎么办的句子是正文的墨，照会话规格。来源整块都是语气的墨，所以没有改共用件，只在本成员的 `.omne-waiting-body` 上改。
- 不同之处：系统提醒与内部工具消息展开后是几行弱墨的「名：值」，照会话规格；来源没有这一块。一段字里每个独占几行的元素是一个值，名字取它的 `key`（运行时上下文的块），里面别的单行元素（之前的值）不写；整段是一个 JSON 对象时写它的字段；嵌套的值写成一行摘要，整段在提示里。两样都不是的字（后台调用的结果、停止的说明）照原样写成弱墨的阅读字。
