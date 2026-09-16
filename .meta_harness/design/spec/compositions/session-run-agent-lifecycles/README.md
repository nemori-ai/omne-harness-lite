# Session、Run 与 Agent 实例生命周期组合

- 坐标：`(omne-harness-lite-design-2026-09-15, composition.session-run-agent-lifecycles, 1)`
- 状态：candidate；`acceptance:null`
- 条款：LC-01～LC-09
- 责任：附着、占位、执行者三条关系和跨 Session/Run/Agent 的原子级联、Yield 与恢复。
- 提供者：由应用装配与相关能力提供者共同实现，当前无单一完成提供者

先读 [v1 契约](v1/contract.md)，再按问题读取[验证范围](verification.md)。形式工件来自
legacy 当前规范的行为表达，但旧运行日志不随重基继承；registered 只表示工件可定位。
