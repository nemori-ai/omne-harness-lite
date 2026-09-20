# Budget 形式工件

`Budget.tla`/`Budget.cfg` 来自 legacy v1，只用两个 attempt 和单位容量抽象检查
`NoOverbooking`、`ReceiptIdempotency`、`AccountedAttempts`。模型未表达 tenant/币种/周期、
unknown exposure、取消与迟到 start、来源修订、恢复或真实耐久提交；旧执行结果不复用。
本基线登记任务的实际 [TLC 执行证据](../../../../../evidence/formal-2026-09-16/README.md)只支持上述三个有限性质，尤其不验证 BG-04 的 unknown exposure 选择。
