# 评审与处置

- **待审对象与精确修订**：三份竞标原件（[`candidates/A|B|C`](candidates/README.md)）
  与由它们合并而成的 [`spec/data/identity-values` v1](../../../spec/data/identity-values/README.md)（`candidate`，未冻结，无 hash 可绑）。
- **当前事实**：**合并件经过四轮 spec-reviewer 独立评审**（2026-09-22，每轮一位 opus subagent，只读）；
  **三份竞标原件本身未被独立评审过**——评审对象一直是合并后的 v1。
  **architecture-reviewer 尚未派过。**

## 已发生的评审：spec-reviewer 四轮

| 轮 | 对本契约的发现 | 处置 | 复核结果 |
|---|---|---|---|
| 一 | 阻断若干、非阻断若干（与同批四份契约一起审） | 逐条修订，改动落 v1 原地 | 轮二复评 |
| 二 | 阻断 1、非阻断 5（`MembershipStandingResult` 保持两支、S-10 措辞、S-19 落点坐标、量词收窄、消费者表） | 逐条修订 | 轮三复评 |
| 三 | 阻断 1（Schema description 与 S-10 互斥）、非阻断 7（性质 6 非对称、S-10 引用 S-26、引用即消费判据、性质 4 撤销「一次性」等） | 逐条修订；主线按「判得对吗、合理吗、本阶段必需吗」三问裁定 | 轮四复评 |
| 四 | **阻断 0**、非阻断 6（Schema/examples 措辞、方向豁免写进 spec/README、性质 4 论证补一路、编号族登记、变更记录标注） | 主线当场改完 | **收敛** |

每轮的发现与本契约怎么改，逐条记在 [`spec/data/identity-values/verification.md#变化的影响`](../../../spec/data/identity-values/verification.md#变化的影响)；
主线的处置表在任务区（不进设计链）。**评审是对表达的评审，不判业务对错，也不产生接受。**

同批的能力边界另经[三票独立投票](../tenant-capability-split/review.md)裁定维持；本契约作为共用 data 契约在两种候选下都不变。

## 不算评审的那些

以下事情确实发生过，**但没有一件是独立评审**：

| 发生过什么 | 为什么不算 |
|---|---|
| 三位起草者各自在 `notes.md` 里对施工简报提了异议 | **自检，不是评审。**起草者评自己那一份 |
| 主线读完三份并做了合并裁定 | **择优，不是评审。**它回答「取哪一段」，不回答「这一段对不对」 |
| 落盘之后主线按统一语言校准过一轮措辞 | **一致性维护，不是评审** |
| 起草时对 Schema 正反实例的本地形状自检 | **未登记的自检**，不作证据 |

## 仍未闭合的事项

- **architecture-reviewer 未派**：本包目前没有架构结论可审，待提供者设计成稿后一并。
- **评审不产生接受。**接受仍须由有权者在 [`record/decisions/`](../../decisions/README.md) 落一份决定，
  再去 [registry](../../../registry/README.md) 把状态翻过去并冻结资源。
- **在此之前，[catalog 里这一条是 `candidate`](../../../registry/README.md)**，`acceptance` 为 `null`，资源未冻结。

返回[本 topic 入口](README.md)。
