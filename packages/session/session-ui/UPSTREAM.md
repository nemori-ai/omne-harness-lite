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
