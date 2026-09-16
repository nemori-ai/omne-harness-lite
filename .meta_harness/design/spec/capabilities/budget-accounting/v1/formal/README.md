# Budget 形式工件

`Budget.tla`/`Budget.cfg` 来自 legacy v1，只用两个 attempt 和单位容量抽象检查
`NoOverbooking`、`ReceiptIdempotency`、`AccountedAttempts`。模型未表达 tenant/币种/周期、
unknown exposure、取消与迟到 start、来源修订、恢复或真实耐久提交；旧执行结果不复用。
Java/TLC 不可用时只登记为 registered-not-run。
