# 公共操作验证义务

规范行为归 [SPEC](../SPEC.md)，公开形状归 src/。模型与正负配置见 [models](models/README.md)；从模型目录执行 TLC 并逐项判读预期反例，具体执行结果归工作树 tmp。有限模型不证明 TLS、SQLite耐久、OS私有目录或真实终端恢复；现有对应 tests 仍须保护这些实际边界。

## 管理关闭与异常前缀

[应用契约](../SPEC.md#启动前缀与表示释放门)及[公共客户端](../../../packages/core/governance-client-operations/SPEC.md)区分原关闭尝试、静止许可、表示恢复和整体完成。

持续故障用例覆盖CG网络仍在途时close拒绝或同步抛错，原报告与70不变，transport和CLS不关闭，TUI不恢复，closed仍未完成。正向覆盖迟到CAS及查证结束后恢复、恢复实际结束后才开始CLS.close；CLS.close失败保已经发生的恢复及state-close-failed。

[assembly测试](../tests/assembly.spec.ts)及[应用测试](../tests/application.spec.ts)接续观察资源缺席、重复observe、observe失败、实例创建后未公开的setup与close双失败，以及无receipt、有receipt未observe、已observe三类前缀。真实强撤CLS、重复停止、输入输出或恢复长期未完和恢复实际抛错仍须实际驱动。

[模型](models/README.md)保持CQ1及CQ2原配置和有限前提。模型未覆盖关闭异常，不能替代真实拒绝驱动；PTY、终端矩阵及GUI/IME各自验证范围仍须明确。
