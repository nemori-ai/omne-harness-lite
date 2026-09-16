# 评审状态

本轮重建了对称的三候选比较。[D-018](../../decisions/e-message-stream-hooks/decision.md) 已接受
MS-06/22/23/24 的新 v1 可观察语义方向；未接受本包所有候选机制，也未完成发布和实现。
legacy review 与 D-015 证明旧谱系曾审阅/接受；独立架构评审结果由本次 E 证据包记录。

`9a58ae2` 的 round-3 候选因 closing 增量缺口、guessed-identity 授权旁路和 Run epoch 双写而被拒绝并冻结。
新结构链只重新裁决候选 3 的授权完整集合与完整 state-update 边界；候选 1/2 仍是实质可行路径，推荐仍待新评审。

新结构链 round2 集中修复交付缺口：事实末帧不再充当客户端安装证明；无帧的 hidden-only 区间
由客户端周期 changes(to=latest) 取得有界 coveredThrough 并原子推进；只有状态更新的批仍返回非空
授权组，具体 to 不得被全局 completeTo 越过。该澄清不接受候选，须重新进行独立评审。
