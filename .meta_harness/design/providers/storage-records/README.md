# 记录端口与 codec

- 映射契约：`(omne-harness-lite-design-2026-09-15, capability.durable-records@1, 1)`（candidate）
- 实现来源：`packages/storage/records/README.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46` / `c039cd8830ffc13d0ef3acb38ac04d60174b502638bd5c7200f388ca173ab41d`
- 当前结论：只拥有公开 ports、envelope/receipt 数据与严格 codec；不拥有 writer 锁、fsync、恢复或业务状态语义。

读取 [设计映射](design.md) 区分契约、已实现机制、符合性证据和缺口；[验证](verification.md)
不把旧日志或源码存在升级为新谱系符合性。
