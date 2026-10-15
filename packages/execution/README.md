# 执行环境能力组

状态：工程设计草案。具名叶子已是 workspace 草稿，公开行为尚未实现，没有运行支持。正式维护位置不授予技术采用。

## 责任与范围

本组承接执行环境能力的工程分解，业务边界沿[已接受领域责任](../../docs/domains/execution-environments/README.md)。工程依赖不接管相邻主体、资产、原调用或逻辑工作事实。产品阶段与政策沿[产品第四章](../../.meta_harness/design/product/execution-environments/design.md#未决问题与待定事项)，未定部分保持缺项。

## 成员与依赖

| 具名目标 | 文档及状态 | 允许协作 |
| --- | --- | --- |
| `execution/execution-environment` | [阅读入口](execution-environment/README.md)、[完整行为](execution-environment/SPEC.md)、[架构](execution-environment/docs/architecture.md)、[模型](execution-environment/docs/model.md)；宿主文件设施已有包测试，应用尚未装上插件 | 消费可信身份、领域明确来源及本次合法条件；通过公开边界与资源、资产、工具、装配及 Context 协作，不持有邻域事实 |

成员目标是已有包组织的名字，不能从文档目录推定服务键、进程或数据表。实际成员成立前须有技术接受、构建计划及真实公开入口。

## 关键协作

[工程设计](docs/architecture.md)维护组合验证分工；[领域交接](../../docs/domains/execution-environments/architecture.md)及[跨领域流程](../../docs/domains/execution-environments/key-flows.md)说明邻接关系。成员精确机制见[架构](execution-environment/docs/architecture.md)、[关键流程](execution-environment/docs/key-flow.md)、[模型](execution-environment/docs/model.md) 与 [Cordis 集成](execution-environment/docs/cordis.md)，组不重复算法或状态机。

## 组合验证

本组技术拥有者协调真实成员与相邻消费者，按完整 SPEC 的持续验证义务核对身份、授权、并发、未知、取消与原效果责任。验证须绑定具体提供者、版本、环境及故障前提。宿主文件这一刀有包测试。组内组合、沙箱和命令设施仍没有运行验证证据。mock、图及结构通过不证明真实组合保证。

## 维护

组维护者同步本入口、登记、成员选择及真实消费者；具名负责人尚待指定。新建实现先核对[成员文档规范](../../docs/member-documentation.md)和[包创建入口](../../docs/development.md#创建和整改产品包)。职责、协议或采用范围变化由其唯一拥有者修订，不复制组根统一 SPEC，也不借目录自动扩大支持。
