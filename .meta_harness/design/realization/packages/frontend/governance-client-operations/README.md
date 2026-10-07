# 治理客户端用例提供者

- kind：provider
- 源码位置：`packages/frontend/governance-client-operations`。
- 语义接受：CG1 S1～15由D047接受，冻结规范不变。
- 可实施：D047限定路径已有实现；共享服务、固定use、一次CAS和安全结果，依赖CLS/D045，应用另行装配。
- 绑定：固定身份、原快照结算、缓存失效、收场及安全输出的具名检查已写入[绑定表](bindings.yaml)。
- 实际验证：106项源码测试；编译产品CG1+CLS+真实中心HTTPS/SQLite在macOS/Linux arm64通过12组治理流程，输入与原始输出见本次运行。独立复核与结构检查仍须按实际运行结论读，不推导CLI/TUI或生产就绪。

[设计](design.md) · [验证](verification.md)。来源为[CG1](../../../../spec/compositions/governance-client-operations/README.md)与CLI-TUI §11，D046边界不重开。

[CG2交互输入扩展](design-v2.md)已由D048接受并实现，公开runPrepared及use.runPrepared；Input/Output仍沿冻结v1资源，新增Schema由schema/v2公开。139项测试（原106+新增33）及两平台真实编译组合通过，见运行包。上方D047数字为历史增量，不能替代本次新增证据；CLI/TUI仍未交付。

## 2026-10-03 固定Schema技术采用

D-116与[本节点固定图装配](fixed-schema-precompile-design.md)补充现行设计。只改变固定图编译/装载时机；本机制实施、实际绑定与验证未完成，原契约和历史run的状态不据此改写。

## 2026-10-03 D-116 主体实施与有限验收

本节点固定图已实施构建期生成与首次实际消费时的同步原生装载。全部定义、公开结果/errors、构建失败清理、恢复、新鲜性及制品消费的实际范围见主体原始运行与有限签收。本段取代上文 D-116 补充中关于固定图实施/验证尚待的状态；原契约、其他能力与历史运行的边界不变。
