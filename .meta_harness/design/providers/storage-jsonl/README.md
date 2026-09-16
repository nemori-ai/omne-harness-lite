# JSONL 存储提供者

- 映射契约：`(omne-harness-lite-design-2026-09-15, capability.durable-records@1, 1)`（candidate）
- 实现来源：`packages/storage/jsonl/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46` / `78d8eb48075d91af05f5b009d5200594193feea3700f309fc3705df482a85ab9`
- 当前结论：旧 `/1` 有受限真实 JSONL/锁/恢复实现；通用 `/3`、冻结顺序、冲突与 epoch 仍需代码修订，文件系统、fsync、unknown 和换代仍需新 v1 真实验收。

读取 [设计映射](design.md) 区分契约、已实现机制、符合性证据和缺口；[验证](verification.md)
不把旧日志或源码存在升级为新谱系符合性。
