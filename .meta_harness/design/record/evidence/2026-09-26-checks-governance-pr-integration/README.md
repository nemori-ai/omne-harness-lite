# 治理交付 PR 与最新 main 的集成检查

2026-09-26，在用户要求整理PR后读取实际远端，交付提交`39e9376a`来自PR #7基线`cc01c832`；最新main为`bb3d8bc4`，已接受PR #9资产/运行时设计。执行`git merge --no-commit --no-ff origin/main`发现38个未合并路径，随后`git merge --abort`恢复完整交付，未选择任一方覆盖另一方。[结果](result.json)、[原始merge输出](merge-output.txt)、[精确输入](input.tar.gz)及[输入hash](input-sha256.json)保存实际检查。

**结论：交付可供Draft PR审阅，尚未与最新main集成，不可宣称可直接合并。**这不改写[此前交付验收](../2026-09-26-tests-governance-review-fixes/README.md)在其原基线上的结果。

两边catalog都将同一`(omne-harness-lite-design-2026-09-15, capability.organization-governance, 2)`接受并冻结，但contract.md实际字节不同。本线hash为`07f161ff5d9fd9ab2023e9e66bbe260f1f29f56c1a719f24cd3466e846322628`，接受归`governance-participation-provider`；main为`40b2600806055b6695a680dcfc168a36bad411a7bc23f28cc27827d4f6896083`，接受归`assets-runtimes-contract-acceptance`。本线S61～64承载邀约拒绝、AI3共同参与；main承载成员/隶属生效时刻，资产分享消费者依赖它判断关系解除再建立后不复活。双方共同accepted契约坐标扫描仅发现这一份正文不同；并非所有设计语义的穷尽比较。

独立architecture-reviewer已只读核对：这是真实契约身份冲突，不能机械合并正文、任选冻结hash或仅重编号目录。D038～D045也由两线不同接受事件复用了稳定编号；产品修订、词表/对象、映射与registry需在版本协调时一起对账。完整输入固定为两个Git提交，不将当前分支改写为已集成状态。

后续必须先明确正式谱系与新的无冲突契约坐标，保留历史资源和原验收，逐个迁移消费者/实现/协议绑定并验证，再合入最新main。此检查不裁定应取哪个新版本，不接受新业务语义、不覆写任何已发布资源；具体协调由后续设计决定承担。PR本轮保持Draft，明确写出这一合并前置条件。
