# Admission 形式工件

legacy CC v1 的 Admission 模型只检查三个不变量：准入具备授权见证
`AdmissionAuthorized`、效果开始前已经耐久 `DurabilityBeforeEffect`，以及取消/安全停止后
迟到启动不越界 `NoLateStartAfterSafeStop`。这只为 CC-02～CC-04 的相应片段提供候选证据。

模型没有 outbox、崩溃恢复、新 epoch 或工程观测状态，因此不覆盖 CC-05、CC-06、CC-07，
也不覆盖任何 recovery interleaving。它同样不覆盖新 v1 的 CC-01 声明规则或真实业务组合行。
旧通过日志不复用；本轮仅登记，Java/TLC 不可用时不声称执行成功。
