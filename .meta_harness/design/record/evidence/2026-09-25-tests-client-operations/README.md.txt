# 治理客户端用例提供者

- kind：provider
- 源码位置：`packages/frontend/governance-client-operations`。
- 语义接受：CG1 S1～15由[D047](../../../../record/decisions/governance-client-operations-adoption/README.md)接受，冻结规范不变。
- 可实施：D047限定路径已有实现；共享服务、固定use、一次CAS和安全结果，依赖CLS/D045，应用另行装配。
- 绑定：固定身份、原快照结算、缓存失效、收场及安全输出的具名检查已写入[绑定表](bindings.yaml)。
- 实际验证：106项源码测试；编译产品CG1+CLS+真实中心HTTPS/SQLite在macOS/Linux arm64通过12组治理流程，输入与原始输出见[本次运行](../../../../record/evidence/2026-09-25-tests-client-operations/README.md)。独立复核与结构检查仍须按实际运行结论读，不推导CLI/TUI或生产就绪。

[设计](design.md) · [验证](verification.md)。来源为[CG1](../../../../spec/compositions/governance-client-operations/README.md)与[CLI-TUI §11](../../../../record/proposals/cli-tui/governance-client.md#11-2026-09-25-共享治理用例组合接续)，D046边界不重开。
