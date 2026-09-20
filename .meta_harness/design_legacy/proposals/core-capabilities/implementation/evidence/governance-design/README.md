# 治理施工设计的复核证据

源稿为 `058c77c`，HUB 整合为 `01b7f3f`。[汇总](hub-summary.json)记录精确身份、
复验命令与限制；[HUB 原始结果](hub-probe-result.json)包含全部 33 项设计示例。
[作者清单](author-manifest.json)按路径、长度与 SHA-256 对应 `author-artifacts.tar.gz`
内十份原件，保留原作者当时的 proposed 状态与检查结果，不追写历史。

在 HUB 的 `tmp/governance-design/` 放置归档中的 `revision-probe.py`，使用本检出
`.venv/bin/python tmp/governance-design/revision-probe.py` 可重跑。脚本读取本检出的
治理稿并记录哈希，仅写自己的 fixture/result；正文接受状态的后续修改会改变哈希。
复验受审原文时使用上面的固定提交。

这些是算术、币种政策和原输入/预置结果身份示例。预算身份的五项只是条件断言，
独立子进程不使用真实 writer、准入、锁或 fsync。它们不证明产品行为、并发授权、
耐久恢复或任何完整 A01–A32 验收；实现 TDD 与真实组合仍须独立完成。
