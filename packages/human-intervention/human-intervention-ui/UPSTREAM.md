# 来历

本成员一张卡的版式取自外部项目 `pandazki/super-assistant`，提交 `3b967f58768714d57cd1bacf67b599d2aa7a8f53`。复用依据与共用界面件相同，见 [ui-kit 的来历](../../frontend/ui-kit/UPSTREAM.md)。

## 取了哪几块

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本成员 |
| --- | --- | --- |
| `conversation/decision-card.css` | `96da44ced8684828dfedb3682ce1a5fe0a2c5dd469bf2dafb5b1f0c30cf85e52` | `src/view/human-intervention-ui.css`：卡是一块浅底的圆角块加一条发丝线；卡头一行小字写种类；标题用界面字号，不是大标题；选项是一列行，选中的行用主墨色；底部一行放动作 |
| `conversation/decision-card.tsx` | `ce5db24470bbf8aa055e3c0e1054c4ac6de1b77d92bc16bc81dcc62ec58d0207` | `src/view/card-view.tsx`：一张卡从上到下的次序，卡头、标题、说明、选项、自己的话、底部动作 |

## 改了哪几样

- 只取版式的思路，没有照抄代码；CSS 变量前缀 `--pe-` 改为 `--omne-`，类名改为 `hitl-` 前缀，写死的像素都换成 `--omne-*` 变量。
- 卡头不写提问的时间，也没有「更多」菜单、撤回请求、批准前再确认一次与答复后的回执。
- 选项行用共用界面件的 `RadioGroup` 与 `RadioGroupItem`，没有取来源的滑动高亮菜单；文本框与按钮用共用界面件的 `Textarea` 与 `Button`，文案直接写中文，不读多语言。
- 卡的种类与提交状态写在数据属性 `data-kind`、`data-state` 上，样式读属性；来源的种类名换成本项目的问询、请示、放行、扩展。
