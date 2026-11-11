---
id: RFC-0014
title: 单卡单会话与 gate 减负
revision: 1
status: accepted
owner: PanQiWei
---

# RFC-0014：单卡单会话与 gate 减负

规则与维护责任见 [README.md](README.md)。成稿须核对当前拥有者，而非把提案当作实施许可。

## 问题与有效输入

本项目的研发流程层按多会话协作设计：一张卡要认卡、登记执行记录（attempt）、绑定工作树、`start` 开工、维护看板阶段；任务工作树按双基线与 `task-sync` 同步；轨道按树组织，进轨道的 PR 申报「所含的卡」。两张真卡的试走测得这套簿记的成本（已观察）：

- #1143：执行记录登记 3 次、换工作树 2 次、准入 3 次约 20 分钟。
- #1174：执行记录登记 4 次、换工作树 3 次、准入 13 次约 144 分钟，其中 7 次失败，多数本可由改动成员自己的检查与预检先发现。

研发方法已改由外部技能集 pqw-skills 承担（单会话研发流：定义期由人主导，过交接点后代理自主交付）。单卡由一个会话交付，多会话执行权的物件失去对象。不处理的后果：流程正文新旧两套并存，代理按先读到的那套做；簿记与重复准入继续占用代理与机器。

| 当前要求或承诺 | 核对修订与条款 | 本提案受什么约束 |
| --- | --- | --- |
| [RFC-0009](RFC-0009-adoption-and-local-tool-retirement.md) | revision 1，「task-sync 与两条基线」「保留的命令」中 `register`、`start` 的开工准入 | 已接受范围；本提案只取代下表列出的部分 |
| [RFC-0011](RFC-0011-trunk-admission-and-track-tree.md) | revision 1，「主干」「轨道树」，及进轨道 PR 的「所含的卡」 | 主干只经发布身份写、gate 确认绑定 head 不变 |
| [多层分支规则](../engineering/integration.md) | 现行准入、轨道与提升 | 合入门的保护力不降低 |
| [整洁回路](../clean-loop.md) | 四条硬线 | 硬线一、二、三的语义不变 |

## 建议与改变范围

一张卡由一个会话从卡开工到进入 `integration/mainline`。卡正文就是交接信息包：目标、依据、不变式、验收标准、边界、起点与风险、已定事项、只有人能定的待决、四问。起点提交写在包里，取代 taskBase 与双基线；同步用普通的 `git merge origin/integration/mainline`。

| 受影响拥有者 | 现行保证或机制 | 拟改变内容 | 必须保持的条件与例外 |
| --- | --- | --- | --- |
| 集成规则与集成工具 | 认卡、attempt、binding、`start`、`status`、task context | 退役 | 合入仍只经 gate；gate 确认仍绑定最终 head |
| 集成规则 | 双基线、`task-sync` | 退役；起点写在卡上，同步用普通合并 | 准入仍在合入最新 mainline 的最终 head 上跑 |
| 集成规则 | 轨道树、多段线轨道 | 只留一条联调轨道 `integration/mainline` | main、stable、release 的提升与发行不变 |
| 集成规则 | 进轨道 PR 申报「所含的卡」 | 由合入提交自动生成列表 | gate 的 unit 覆盖核对不变 |
| 准入步骤 | `check:lines`、`change-scope`、准入末步 `loop:status` | 删前两步；`loop:status` 移出准入，挂到 mainline 提升 main | 硬线一、二由 `lint:deps`、`lint:rules`、验收锁在准入里守 |
| 交付操作与看板 | 八档 Stage、标签族、波、派发台账、五节交接报告 | 删；交付声明取代交接报告 | 接受仍由有权者按交付协议记录 |

## 实质备选

| 方案 | 如何满足目标 | 代价、风险和失败后果 | 推荐或放弃理由 |
| --- | --- | --- | --- |
| 保持现行机制，只把方法换成 pqw | 方法层换掉，簿记照旧 | 两轮试走的簿记与重复准入照旧；流程正文仍两套 | 放弃：问题出在簿记本身 |
| 保留 attempt 与 binding，只删双基线 | 少一套同步机制 | 每扩一次写范围仍要登记与换树（两轮共 7 次登记、5 次换树） | 放弃：成本的主体还在 |
| 本提案 | 单卡单会话，起点写在卡上，gate 减到九道 | 多会话并行协作不再有工具支持；合入前的检查变少，回退可能变多 | 推荐：单卡单会话下多会话物件没有对象；回退次数在复议时量，升了把对应的门加回 |

## 验证与消费者切换

切换分六步，每步一张卡、一个 PR，可单独回退：装上 pqw 与入口；技能与角色；文档与上下文地图；整洁回路封装；删旧工具；平台规则与切换。整洁回路换到 pqw 之前，用一套固定考题（两张真卡的改动与二十个种下的缺陷）先量旧回路、再量新回路：每个缺陷须在同一步或更早查出，或有负责人签字；工具读数错误不能签字放行；各阶段耗时与 CPU 不超过旧流程的 1.1 倍。

消费者：根 `AGENTS.md`、`docs/engineering/` 的交付、集成、工作约定正文、`tools/dev-flow` 的交付与集成部分、`tools/test-runner` 的准入步骤图、`github-gate` 分支的工作流、`.github` 的卡与 PR 模板、技能与角色源。

## 决定范围

- 有权决定者：PanQiWei（项目负责人，交付流程与集成规则的拥有者）
- 决定日期及对应revision：2026-11-10，revision 1。PanQiWei 在第十四程会话里对「建议接受」的回复原话：「认可你的建议，继续推进吧」。
- 采用范围：「建议与改变范围」全部条款。
- 不采用范围及必要理由：无
- 未决与依赖停止点：`github-gate` 分支的改动只有管理员能做，由 PanQiWei 做或授权

## 写回现行正文

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换或解除依据及确认者 |
| --- | --- | --- | --- |
| 单卡单会话、卡即交接信息包 | [卡与交接信息包](../engineering/delivery.md)；`omne-card` 技能 | 已写回 | #1179 卡分支，随 #1179 合入 mainline 生效；PanQiWei |
| attempt、binding、双基线、task-sync、轨道树退役 | [轨道与 gate](../engineering/integration.md)；`tools/dev-flow` | 已写回 | #1179 切片 10 删除 dev-flow 的交付部分时写回，随 #1179 合入 mainline 生效；PanQiWei |
| 准入步骤调整与 `loop:status` 移位 | [测试与准入工具说明](../../tools/test-runner/README_ZH.md)；[整洁回路](../clean-loop.md) | 待写回 | #1179 切片 09 写回 |

## 后继关系与维护

本提案获接受后，部分取代 [RFC-0009](RFC-0009-adoption-and-local-tool-retirement.md) 的「task-sync 与两条基线」与 `register`、`start` 的开工准入，部分取代 [RFC-0011](RFC-0011-trunk-admission-and-track-tree.md) 的「轨道树」与进轨道 PR 的「所含的卡」申报；两篇的决定状态与其余范围不变。尚无后继。
