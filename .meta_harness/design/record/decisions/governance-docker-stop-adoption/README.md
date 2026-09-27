# D-071 · Docker 正常终止请求与真实退出

[决定](decision.md)接受 R5 的 S-B：显式 TERM 请求与真实 wait／inspect 退出分开，不把回执、空等待输出或调用方退出当作应用完成。来源为[三个候选](../../proposals/governance-docker-deployment/stop-r5.md)、[完整受审节点](../../proposals/governance-docker-deployment/docker-r5-reviewed.md)和固定 Engine 实验。

准入：2026-09-27 主线按用户技术设计与验收授权接受；精确修订见[快照](provider-snapshot.json)。这里只开放 I2 修订和最终组合验证，未接受 Docker 总体交付。
