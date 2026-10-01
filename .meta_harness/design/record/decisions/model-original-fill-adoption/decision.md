# D-079 原完整 fill 来源读取采用

2026-09-27，主线依用户实施委托，沿[读取链提案](../../proposals/model-request-adaptation/read-projection.md)、[来源反例](../../../realization/packages/tools/asset-registry/v3-original-fill-source.md)及[独立复审](../../proposals/model-request-adaptation/review.md#2026-09-27-mf4ar4-原-fill-读面独立复审)，接受 capability.assembly-manifest/v4 与 capability.asset-registry/v4。原 v3 五/七操作、产品前提与缺口沿原范围保留，旧已发布资源不改。

MF 新 readGiven(session,H) 在一致读中真实核 H 范围，交同会话 max given≤H 的完整不可变记录并核 S32/S47；无源 none，坏新源不回退、不解释 filledBy。AR 从同 H 表/完整 fill 证明原根 asset/version，再经真实 EIS 来源读取；不借创建源、最近 mint 或拼持有修补。reload expectedH 漂移全重做；refresh 保留 H 观察点，不新增末尾重核、report head 或跨存储原子承诺。

同时采用 MF4 provider 增量 MG1～8 与 R-AMS4-1～5，精确设计/义务 hash 见 acceptance.json。首条 parent INSERT 的唯一冲突才同事务重判；后续 table 失败逃出 write，整次 rollback。实际安全整数容量不缩小规范请求域；到容量上界零写 unavailable，不伪造瞬时 StorageUnavailable。

本事件未采用 AR4 provider 候选，不认为 MF3 组件测试覆盖新增 readGiven。实际 MG-V1～12、AR4 S52、原 IO/并发/授权/恢复/tenant/PG 与完整模型链继续逐项验证；新增 bindings=0，覆盖仍未评，official认证0/37。技术采用不等于产品总体签收或证明来源真实。
