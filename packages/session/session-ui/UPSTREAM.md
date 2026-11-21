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
- 发送、停止、正在停止的那一个按钮用共用界面件的 `Button`，文案直接写中文，不读多语言；字形换入的弹出动效没有取。
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
- 控件在标题旁（R5 起，照会话规格的头部一段；R4 时在头部中间）。来源在停靠时把触发器移进侧栏，并平移 140。
- 展开时控件保留共用件 ghost 按钮的底色。来源在展开时去掉底色。
- 照来源 `c0073196`：按下控件时，如果它拿着键盘给的焦点，先放掉，再按指针的方式拿焦点，不留焦点环。

### 形口报告

- 照来源的活动：一轮在跑时，有没结果的工具调用是 `looking`，回复在写或刚落笔是 `writing`，其余是 `thinking`；没有一轮而有后台调用是 `background`。
- 不同之处：工具不分种类，一律是 `looking`；来源把 making 算 `writing`、self 算 `changing`。人自己的取消也算 `could-not`，照产品的状态表。来源的 `changing`、`named` 和 work、beat 那种后台，这里没有对应的事实。不报 `subject`。

### 侧边区的停靠与墨框

- 照来源：门槛是 `dockFits(width, 系数)`，即宽度不小于 1160 乘字号档的系数。系数取共用件的 `useSizeFactor()`。字号变了、宽度没变，也重新量。
- 不同之处：量的是对话页自己的 `clientWidth`，含左右留白。来源量的是它的版式盒。
- 停靠时照来源用一条格线轨道：轨道从 0 滑到侧边区的宽度，`column-gap` 从 0 到一个页间距，时长与曲线是 `layout` 与 `ease-enter`；里面的版面宽度不变，从它贴着的那一边滑进来，收起时在 `exit` 与 `ease-exit` 上离开；减弱动效下没有过渡。
- 不同之处：宽度 320 写成 `calc(var(--spacing) * 80)`，间距 32 写成 `--omne-space-page`，滑进的 12 写成 `calc(var(--spacing) * 3)`，都随字号档变。裁切放在 `aside` 上，用 `overflow: clip` 并留出焦点环的位置。来源用一层绝对定位、`overflow: hidden` 的裁切层。轨道的选择器用 `:has()`，因为侧边区的父元素归对话页。
- 不同之处：宽时默认展开；人在停靠时收起过，这个选择在对话页挂着期间保留，宽窄切换也不变。来源默认收起，并把人上一次的选择带到下一个对话。
- 不同之处：停靠时收起侧边区用文字按钮「收起侧边区」。来源用 × 图标。
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
| `conversation/conversation.css` | `4c34c3a3ec0e87daf2d60d46a88f428863d1690a8e92fbcb9496850c27e30a25` | `src/view/session-ui.css`：头部高 84 与细线、阅读字体的标题；转写区两边留滚动条的位置；同一说话人与换人的间距；输入框的上限 |
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
- 头部放不下时照会话规格：标题留 8 个字和省略号的宽度，权限处理先收进 `⋯`，再收模型；`⋯` 里是共用件 `DropdownMenuSub`，触发的一行写当前的值，展开是可选的值。量的是每样东西自己的宽度，收起的那一样留在原处、看不见、不占位，所以宽度一直量得到。来源没有对应的规则。

## 后台调用与侧边区的页签（R6）

- 照来源 `83c1616f` 的 `conversation/agent-work-panel.{tsx,css}`（sha256 见上面「对话头与侧边区」一表）：后台的每一项是一行原地展开的行，展开的内容缩进到行字之下，正文是说明字号、弱墨。不同之处：行是共用件的 `DisclosureTrigger` 加 `DisclosureContent`，一行里是等宽的短号、意图与共用件的状态词，箭头在前；来源是图标、标题、下一行的状态词，箭头在后。「停止」是行尾唯一的动作，来源的停止在展开的内容里。停止的进度是共用件的 `FactList`，三行；来源没有这一块。
- 不同之处：侧边区选中的页签由对话页的侧边区状态保管，宽窄切换不变；输入框上方「后台有 n 项在跑」按下时选中「后台」并展开侧边区。来源没有这条提示。

## 抬起的件的余地（R6b）

- 输入框上方放卡的停靠条 `.omne-session-dock` 向栏外伸出焦点环的余地，再把它作自己的内边距（S15、K1）：卡边上的抬起的件不被裁，卡照旧贴着栏的两边。来源没有这一条。
