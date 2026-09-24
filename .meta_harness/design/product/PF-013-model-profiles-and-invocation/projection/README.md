# PF-013 模型档案、调用与切换 · 设计投影视图

本目录按版本固化本需求当前对应的完整设计投影，供实施者作为单一入口。
方法归 `harness-design-handbook` skill 的「步骤 G：投影视图落盘」。

## 版本

| 版本 | 状态 | 对应需求修订 | 发布日期 | 说明 |
| --- | --- | --- | --- | --- |
| [v1](v1/projection.md) | **当前；`post-review`；来源全部 candidate、未冻结；未接受** | PF-013 rev 12（rev 4 已接受，rev 5–12 全文待产品负责人确认） | 2026-09-25 | 首版：八份候选契约（档案形状、响应体、档案目录、模型请求运行时、模态投影、流装配的回复侧、账、回复消息与五种调用记录）＋ `model` 三个节点、`core` 两个纯模块、`apps/cli` 据点装配与验收替身、`apps/tenancy-host` 的中心插件 P-1。realization 节点已过五批独立架构评审并按 [D-040 §八](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M49～M75 处置 |

**当前版本：v1。它不是实施入口**：契约接受待 [D-041](../../../record/decisions/assets-runtimes-contract-acceptance/README.md)，节点接受待 [D-042](../../../record/decisions/assets-runtimes-node-acceptance/README.md)，两份都未签。签字之后出 v2，把 [provenance.json](v1/provenance.json) 里的契约哈希换成 `frozen.json` 登记值；v1 保留并标注被 v2 取代。

**本投影只讲模型这一侧。**工具定义、工具执行、资产注册表、拓展件执行器、流装配的工具侧在 [PF-006 投影](../../PF-006-tools-and-skills/projection/README.md)；上下文组装（PF-010）与计量口径不在任何一份本程投影里。两份互相指路、不互相重复。

## 使用与维护

- 实施者读当前版本的 `projection.md` 即可取得全部设计输入；需要追溯来源时按其 `provenance.json` 回到各权威正文。
- 本视图是**某一时刻的派生快照**，不是权威。与上游不一致时以上游为准。
- 需求变更或设计变更导致内容不再成立时**发布新版本，不原地改旧版**；旧版本保留并标注被谁取代。
- **来源全部未冻结：每次据它实施之前先人工核一遍 `provenance.json` 里的坐标是否仍是当前文件**——工作区没有替投影核漂移的自动检查。
