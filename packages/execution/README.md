# 执行环境能力组

状态：工程设计草案。宿主文件设施已有包测试。`command`、三种沙箱和整组组合仍没有运行支持。正式维护位置不授予技术采用。

## 责任与范围

本组承接执行环境能力的工程分解，业务边界沿[已接受领域责任](../../docs/domains/execution-environments/README.md)。工程依赖不接管相邻主体、资产、原调用或逻辑工作事实。产品阶段与政策沿[产品第四章](../../.meta_harness/design/product/execution-environments/design.md#未决问题与待定事项)，未定部分保持缺项。

## 成员与依赖

| 具名目标 | 文档及状态 | 允许协作 |
| --- | --- | --- |
| `execution/execution-environment` | [阅读入口](execution-environment/README.md)、[完整行为](execution-environment/SPEC.md)、[架构](execution-environment/docs/architecture.md)、[模型](execution-environment/docs/model.md)；宿主文件设施已有包测试，应用尚未装上插件 | 消费可信身份、领域明确来源及本次合法条件；通过公开边界与资源、资产、工具、装配及 Context 协作，不持有邻域事实 |
| `execution/image` | [阅读入口](image/README.md)、[行为](image/SPEC.md)、[架构](image/docs/architecture.md)、[关键流程](image/docs/key-flow.md)、[模型](image/docs/model.md)、[Cordis 集成](image/docs/cordis.md)、[候选推荐配置](image/docs/budget-profile.md)；技术设计已接受，已是 workspace 成员。公开入口是 `imageBudget`、`open`，以及打开句柄上的 encode 和 close | 只接收完整图像字节和调用方传入的预算。不选择执行落点，不提供隔离，不持有工具效果或会话身份 |

成员目标是已有包组织的名字，不能从文档目录推定服务键、进程或数据表。实际成员成立前须有技术接受、构建计划及真实公开入口。`execution/image` 已获技术接受并成为 workspace 成员，六个生产上限由调用方传入。

## 关键协作

[工程设计](docs/architecture.md)维护组合验证分工；[领域交接](../../docs/domains/execution-environments/architecture.md)及[跨领域流程](../../docs/domains/execution-environments/key-flows.md)说明邻接关系。成员精确机制见[架构](execution-environment/docs/architecture.md)、[关键流程](execution-environment/docs/key-flow.md)、[模型](execution-environment/docs/model.md) 与 [Cordis 集成](execution-environment/docs/cordis.md)，组不重复算法或状态机。

图像成员与执行环境没有交接。调用方把完整图像字节和预算对象交给图像成员。图像成员不读取环境选择结果，也不把解码成功写成设施就绪或隔离已成立。宿主上的文件使用对象核对归 `execution-environment`。图像成员不描述 `Files()` 或 `Shell()` 的落点。图像成员自己的 Cordis 服务定义不写入执行环境。

## 组合验证

本组技术拥有者协调真实成员与相邻消费者，按完整 SPEC 的持续验证义务核对身份、授权、并发、未知、取消与原效果责任。验证须绑定具体提供者、版本、环境及故障前提。宿主文件这一刀有包测试。组内组合、沙箱和命令设施仍没有运行验证证据。mock、图及结构通过不证明真实组合保证。图像成员的预算、拒绝、编码和关闭由该成员自己的 SPEC 验证，命令是 `pnpm --filter @omne-harness/image test`。执行环境的隔离证据不能当作图像解码已经隔离。

## 维护

组维护者同步本入口、登记、成员选择及真实消费者；具名负责人尚待指定。新建实现先核对[成员文档规范](../../docs/member-documentation.md)和[包创建入口](../../docs/development.md#创建和整改产品包)。职责、协议或采用范围变化由其唯一拥有者修订，不复制组根统一 SPEC，也不借目录自动扩大支持。
