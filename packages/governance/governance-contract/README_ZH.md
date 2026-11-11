# @omne-harness/governance-contract

## 职责与状态

本包定义动态治理贡献、当前采用与受保护目录的公共接口。源码已包含输入 Schema、结果类型与 Cordis Service；生产提供者及完整符合性验证仍待完成。

## 使用

纯类型从 `@omne-harness/governance-contract` 导入，Cordis 服务从 `./cordis` 导入。按[公开定义](docs/public-api.md)选择命令口或查询口。调用方的可信 Access 与序列化请求分开传递。

## 契约

[行为规格](SPEC.md)拥有原操作、不可变声明、完整发布、当前依据与精确撤除。具体形状以源码为准。

## 设计

[架构](docs/architecture.md)、[对象模型](docs/object-model.md)和[流程](docs/flows.md)说明责任分割。设置值、许可和运行推进仍归各领域。

## 配置与运行

本包没有数据库、后台任务或启动配置。Schema 的预算与提供者的累计输入预算共同约束请求。

## 验证

`pnpm --filter @omne-harness/governance-contract build` 构建；`test:fast` 验证公共边界。有限模型及生产符合性责任见 [verification](verification/README.md)。

## 维护

更改协议时同步本包规格、提供者、应用桥接和实际消费者。不要将 provider 私表或运行时对象加入 wire 类型。

## 目录结构与文档职责

`src/` 拥有公开定义，`tests/` 拥有边界测试，`docs/` 解释设计，`SPEC.md` 拥有非类型行为。其余目录的资源范围见 [index](index.md)。
