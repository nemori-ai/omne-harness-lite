# 核心工作协调 v1 验证范围

既有 Admission 模型仅覆盖其明确的逻辑准入抽象；不覆盖 CC-01、CC-05 通用耐久交付、CC-06 崩溃/新 epoch 或 CC-07 观测。现有恢复模型与故障变体的范围按 [v1/formal/README](v1/formal/README.md) 逐项判断，不能自动外推到个人创建。

个人创建的 CC-03 候选已改为 Account 当代受信直读 F、Tenant 派生 T/C、单租户流提交。旧 Account→CC 导入与二/三流测试不再属于此链的正例。需要验证未发行 F、Account 暂缺席、读完 F 后实例离线、旧 generation 准备失效、两 F 同 UserRef 冲突、不同 UserRef 独立、T unknown 与 CC-06 本代全 owner publication。场景见 [CC-S07～S11](v1/scenarios.md)，具体联合义务见 [v1 验证](v1/verification.md)。

CC-05 保留为其他真正需要耐久接纳的边界的通用契约；本轮不声称该条已被个人创建或既有模型验证。
