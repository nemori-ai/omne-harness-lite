# Model Cordis 契约架构

本成员隔离框架依赖，并为消费者与提供者提供唯一 Service 身份。根入口只允许纯类型，Service、键和增补归 `./cordis`。当前两个源码入口均为空。

## 定义与实现

业务操作采用抽象 Service，形状引用 model-contract。ModelInstancesService 与 ModelConvertersService 拥有 IC-3 允许的登记状态、token 和条件撤除；这是定义包内的具体登记机制。它们不执行模型请求、持久化调用事实或调度业务实例。

model-host-local 的具体插件继承唯一定义，应用装载所需目录。业务实现来自 model 或其他相容提供者。定义包不依赖这些实现、pi、tokenizer 或存储引擎。实际设计声明归 [public-api](public-api.md)，登记行为归 [SPEC](../SPEC.md)。

## 依赖与生命周期

框架契约消费 Cordis 和领域契约，领域契约不反向依赖框架。目录撤除只结束装配贡献，不撤回已发送请求，也不删除原调用及结果。服务依赖失去的业务后果沿领域协议，宿主组合见 [model 装配设计](../../model/docs/cordis.md)。
