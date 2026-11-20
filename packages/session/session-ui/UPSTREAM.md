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
- 控件留在头部中间。来源在停靠时把触发器移进侧栏，并平移 140。
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
