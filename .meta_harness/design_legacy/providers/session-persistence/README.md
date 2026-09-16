# Session 持久提供者

- 映射契约：`(omne-harness-lite-design-2026-09-15, capability.durable-records@1, 1)`（candidate）
- 实现来源：`packages/session/persistence/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46` / `cbf488cd5c3832913a5a30975ef607f86aae1709154cd846bf3a737d99858bac`
- 当前结论：只有 baseline-facing 设计；recover 与完整 Session 恢复尚未实现，新 v1 联合符合性无证据。

读取 [设计映射](design.md) 区分契约、已实现机制、符合性证据和缺口；[验证](verification.md)
不把旧日志或源码存在升级为新谱系符合性。
