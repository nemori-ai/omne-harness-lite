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

## 2026-10-03 D-116 主体实施与有限验收

本节点固定图已实施构建期生成与首次实际消费时的同步原生装载。全部定义、公开结果/errors、构建失败清理、恢复、新鲜性及制品消费的实际范围见[主体原始运行与有限签收](../../../../record/evidence/2026-10-03-tests-fixed-schema-main/README.md)。本段取代上文 D-116 补充中关于固定图实施/验证尚待的状态；原契约、其他能力与历史运行的边界不变。
