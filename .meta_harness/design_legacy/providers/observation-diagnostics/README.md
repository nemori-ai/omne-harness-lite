# 工程诊断提供者

- 映射契约：`(omne-harness-lite-design-2026-09-15, capability.engineering-observation@1, 1)`（candidate）
- 实现来源：`packages/observation/diagnostics/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46` / `32e4c2f88dd2c3cc73462347c090ebe0c258fe936e15c0a9431defbc877c2ae6`
- 当前结论：结构化被动诊断、Pino/Sonic/OTel 边界有实现；它不是 durable audit，也没有闭合 query/export 或全能力接入。

`packages/` 路径是相对产品仓库根的源码定位符；文中实现现状可按产品源码提交 `74e3e48aa13b5c39c3b064537d2072dc2498b1d4` 复核，不是设计包内依赖。

读取 [设计映射](design.md) 区分契约、已实现机制、符合性证据和缺口；[验证](verification.md)
不把旧日志或源码存在升级为新谱系符合性。
