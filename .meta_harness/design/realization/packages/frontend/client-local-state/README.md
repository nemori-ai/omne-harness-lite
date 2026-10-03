# client-local-state 提供者

- kind：provider
- 源码位置：`packages/frontend/client-local-state`。
- 语义接受：[D046](../../../../record/decisions/client-local-state-adoption/README.md)接受CLS1 S1～8及本节点限定路径。
- 可实施范围：私有本地完整记录、比较替换与资源生命周期；不含网络、CLI用例或远端认证。
- 绑定：已登记本地完整读取、CAS、防旧覆盖与生命周期的有限测试绑定。
- 实际验证：本地36项、真实编译产物双平台驱动及infra 42项检查通过；详见验证义务与实际运行，未包含CLI/TUI。

[设计](design.md) · [验证义务](verification.md)。初始化竞争、目录同步与真实多进程验证不可用形式模型替代。

## 2026-10-03 固定Schema技术采用

[D-116](../../../../record/decisions/fixed-schema-precompile/README.md)与[本节点固定图装配](fixed-schema-precompile-design.md)补充现行设计。只改变固定图编译/装载时机；本机制实施、实际绑定与验证未完成，原契约和历史run的状态不据此改写。
