# 来历

本成员的纸（一组卡）取自外部项目 `pandazki/super-assistant` 的决策卡，提交 `83c1616f44d000d1f333e929bfd94d31dff847da`。复用依据与共用界面件相同，见 [ui-kit 的来历](../../frontend/ui-kit/UPSTREAM.md)。纸怎样从来源的卡推出来，见本组规格「界面模块」的七步。

## 取了哪几块

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 本成员 |
| --- | --- | --- |
| `conversation/decision-card.css` | `96da44ced8684828dfedb3682ce1a5fe0a2c5dd469bf2dafb5b1f0c30cf85e52` | `src/view/human-intervention-ui.css`：纸照 `.decision-card`（决定宽度、浮层底、细线抬起、卡片圆角、底边 2）；一节的种类行照 `.decision-kind`，行尾提问的时间照 `.decision-kind-time`，标题照 `.decision-question` 与 `.decision-heading`，说明照 `.decision-consequence`，谁在问照 `.decision-scope`，放行卡的事实表照 `.decision-facts`，作答的一组行照 `.decision-options`，文本框照 `.decision-field`，折叠照 `.decision-scope-fold`，纸底照 `.decision-foot`、`.decision-quiet` 与 `.decision-arming` |
| `conversation/decision-card.tsx` | `136d220aeb936b320a25d8c612e13bc9da423e5d78ffac3b6d20b965fdea35b0` | `src/view/card-view.tsx`、`src/view/card-area.tsx`：一节自上而下的次序（种类行、标题、说明、事实、作答），选一行不发送、只有纸底的钮发，武装的原因写在钮下面一行，指针下的东西不动；纸底右边的「拒绝」「批准」（描边钮带关掉的字形、主钮带对勾）成了钮式的选项钮，字形照出卡方给的角色；「添加备注（选填）」的折叠成了「自己写，或不回答」 |

## 改了哪几样

- 只取版式与数，没有照抄代码；CSS 变量前缀 `--pe-` 改为 `--omne-`，类名改为 `hitl-` 前缀。来源里大于 1px 的长度写成 `calc(var(--spacing) * n)`，随字号档变。
- 来源一张卡一张纸；这里一组卡一张纸，几题是纸上的几节，节间一条内缩的细线。
- 来源的两个钮固定是「拒绝」「批准」；这里只有一节、选项少而短时，选项本身是纸底的钮，钮上写出卡方给的标签，最后一个是主钮，字形照出卡方给的角色（本组不解释哪一项是准）；别的情形是选择行加唯一的「提交」。来源按可逆性给「批准」武装，这里只在选了有持续效果的一档时武装「提交」。没有「更多」菜单、撤回请求与答复后的回执。
- 作答的行用共用件的 `ChoiceList` 与 `ChoiceRow`（来源的 `.decision-option` 一族进了共用件）；事实表、折叠、分段、文本框、按钮与状态词都用共用件，文案直接写中文，不读多语言。
- 卡的种类与提交状态写在数据属性 `data-kind`、`data-state` 上，样式读属性。
