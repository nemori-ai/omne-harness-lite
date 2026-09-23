# 斜杠命令识别与解析基线

**选择对象**：人在交付面上提交的一段输入，**是不是一条[斜杠命令](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-slash-command--斜杠命令--slash-command)、是哪一条、参数是什么、展开成什么或交给谁**——
这套识别与解析逻辑以哪家为起点：omne-next 的前缀分类器与 ADR 声明式语法、Codex 的做法、Claude Code 的做法，还是按产品正文自研；
以及它与 skill 读取、系统业务流程分派的接缝。

**推荐：按产品正文自研（候选 D）**，从 Codex 借识别边界、从 omne-next 借失败纪律与声明优先、从 Claude Code 借占位符与留痕形状。
理由是三家各有至少两处与已写定的产品性质方向相反（开头至多一条、三种绑定目标、命令是独立资产、两种呈现形式一样识别、未知名不发送），
逐条修正之后剩下的部件正是 D 要借的。**推荐不是接受。**

- **当前状态：候选。**未经评审（[review.md](review.md)），[decisions](../../decisions/README.md) 里没有任何一条接受它。
- **本次终点与范围**：必要性质、现有承载与剩余责任、四个候选与一条排除路径的比较、推荐与九项待区分事项、推荐路径下的动作链草图。
  **不包含**：识别文法与解析结果的契约正文、判定用例集、任何一条系统业务流程、字面发送的具体记法、导入器。
- **输入基线**（2026-09-23）：
  [PF-002](../../../product/PF-002-assets-settings-and-permissions/README.md) rev 13 §4 Slash Command 与
  [decisions 2026-09-23 原话（一）（三）](../../../product/PF-002-assets-settings-and-permissions/decisions.md#2026-09-23--斜杠命令三种绑定目标mcp-的动作即工具条目连接件带身份鉴权工作区资产的权限取最严值)；
  [PF-014](../../../product/PF-014-inbound-intake-and-queueing/README.md) rev 4 §5.6、§5.10、§9.5；
  [PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md) rev 4 §5.4、§5.7、§6.5；
  UL-slash-command（出处 PF-002 rev 13）；
  [斜杠命令识别与解析五源调研](../../../../research/slash-command-parsing-sources/README.md)
  （Codex `5c5308f`、Claude Code `2.1.280`、DSH `c291e796`、omne-next `6263fed`、pi `3390bd9`；它对照的是 PF-002 rev 11 / PF-014 rev 3 / PF-016 rev 3，本包按当前 rev 重新对照）；
  [连接件与斜杠命令形状调研](../../../../research/connector-and-slash-command-sources/README.md)的 E-S1–E-S7、E-S11、E-S12；
  [skill 规格调研](../../../../research/skill-spec-sources/README.md)的 name 语法一条；
  [cli-tui 提案](../cli-tui/README.md) D7（候选）。未读 `design_legacy/`。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：识别—解析名字—解析参数—展开与分派这条链以谁为起点，及其两处接缝。见 [design.md](design.md#需要作出的选择) |
| 现有能力覆盖 | `spec/` 里没有相关契约；承载全在产品正文与候选层，逐条见 [design.md](design.md#现有能力如何承载) |
| 剩余责任 | 五片：识别文法、名字解析、参数解析、① ② 展开与记录、③ 分派与记录，外加导入器。见 [design.md](design.md#剩余责任与能力演化) |
| 三个实质候选 | **齐，四个 + 一条排除路径**：A omne-next、B Codex、C Claude Code、D 自研；DSH 因违反开头至多一条与未知名不发送被排除，保留依据。四者在「命令身份与参数文法由谁定义」上各不相同，见 [alternatives.md](alternatives.md) |
| 接受权限 | **本包不产生接受。**推荐、评审、模板齐全都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要保留哪些性质、现在什么承载着它们、还剩哪几片责任、推荐路径的动作链长什么样 | [设计正文](design.md) |
| 四个起点各自兑现了什么、与哪条性质相抵、D 借了什么、还有什么没定 | [候选与取舍](alternatives.md) |
| 评审了哪个修订，哪些问题已处置 | [评审记录](review.md) |

## 后续消费

- **尚无实际消费**：没有决定、没有契约、没有 realization 节点采用本包。
- **待接住它的**：[cli 应用节点](../../../realization/apps/cli/README.md)登记的「交付面呈现与受理契约」（待立），
  它要接住斜杠命令的三条交付面规则；受理契约（PF-014 的规格化，待立）；斜杠命令资产的数据形状（待立）。
- **会被它影响的候选**：cli-tui D7「斜杠命令与子命令共享同一份命令定义」——在本包推荐下只覆盖交付面动作与 ③ 流程，
  见 [design.md 交接缺口](design.md#交接缺口)。
- **先要做的一件事**：判定用例集（A1–A11 起步），它既是识别文法的规格，也是任何实现的准入；
  但在三项产品未决答复之前写不全（见 [alternatives.md](alternatives.md#推荐与仍待区分的事项)末段）。
