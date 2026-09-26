# D-059：资产／工具／模型三块的能力拆分接受、领域名与装配落点，以及 2026-09-24 当场裁决汇编

产品负责人 2026-09-24 回到本程账本，**逐项拍板**：三份能力拆分提案的推荐接受（G3）、四个领域名、两块运行时的装配落点、
`apps/tenancy-host` 暂不改名；连同同一天对资产流转矩阵、凭据归属、档案身份、多命令工具模型面、拓展件不可用处置、孤卡收场、
连接件与技能设置等十几处产品未决的裁决。**接受的是拆分与形状层面的取舍，不是契约**——契约仍是 `candidate`，各自另行接受（G4）。
本决定是那些契约与产品修订里「产品负责人裁定 2026-09-24」这一类依据的**长期落点**，代替只存在于任务区账本里的转述。

- **输入与下游**：三份提案 [capability-split-assets](../../proposals/capability-split-assets/README.md)、
  [capability-split-tools](../../proposals/capability-split-tools/README.md)、[capability-split-model](../../proposals/capability-split-model/README.md)
  （各含三票独立评审）；产品修订 PF-003 rev 5、PF-013 rev 10、PF-002 rev 18/19、PF-006 rev 19、PF-012 rev 12、PF-007 rev 17、PF-008 rev 7、PF-016 rev 8（本决定落盘时部分仍在起草，以各 topic changelog 为准）。
  下游是本程全部候选契约的修订、realization 节点的领域名与布局、`apps/cli` 节点的修订。
- **范围定位**：只解决「拆分取哪一边、名字叫什么、装配落在哪、这些产品未决各取哪一边」。**不解决**：契约条款与 Schema（归契约）、
  主线为起草补的推导（记在各契约的「主线裁定，待产品负责人确认」项与账本，**未经签字的不在本决定的接受范围内**，逐项见[决定正文](decision.md#主线自定待确认)）。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 有权者 | 产品负责人（`panqiwei`） |
| 接受记录 | 2026-09-24 对话中逐项裁决，原话录于[决定正文](decision.md#裁决原话与含义)；当日台账为主检出 `tmp/assets-runtimes/pending-user-rulings.md`（过程材料） |
| 精确修订 | 提案 A `3c737ee3`、B `39e98e44`、C `fba27cd4`（HUB `panqiwei/assets-runtimes` 提交）；投票记录在各提案 `review.md` |
| 接受范围 | 三份提案的推荐候选（assets B / tools C / model P1-A·P2-A·P3-A）；领域名 `assets` `tools` `model` `agent-loop`；两块运行时归 `apps/cli`；`apps/tenancy-host` 不改名但记承载张力；产品未决 U-1～U-6、U-24-1～4、PF-002 D-2/D-3/D-4、PF-007 D-3；逐项见正文 |
| 保留前提 | 「模型面只有 flat 一种」以本项目自建判定层为前提；「组织层不持有凭据」把「组织托管凭据」留作后续题；`tenancy-host` 承载超出租户领域是已知张力，改名待中心侧装配内容稳定；见[正文](decision.md#理由与保留前提) |
| 取代关系 | 闭合 D-026/D-027 之后「领域名与装配节点名待拍板」；修正 [D-058](../message-and-shape-rulings/README.md) Q11（撤回）与 Q5（按 flat 读法）；不取代任何已接受契约 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 每条裁决的原话与含义 | [决定正文](decision.md#裁决原话与含义) |
| 拆分接受了哪个候选、代价是什么 | 三份提案的 `alternatives.md`「推荐与改票条件」与 `review.md` |
| 主线自定、尚待签字的那些 | [正文「主线自定，待确认」](decision.md#主线自定待确认) |

返回[决定](../README.md)。
