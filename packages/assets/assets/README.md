PACKAGE_TEMPLATE_DRAFT

本成员导出身份、正文读取、类别注册和固定版本。执行和发布不在这个入口。导出条件 `source` 指向本包源码。发布时去掉它。

# assets

## 职责与状态

本目录维护本成员的行为与机制文档。公开导出是身份、`readBodyText`、类别注册和 `pinBody`。原有效能力与阶段承诺沿[产品正文](../../../.meta_harness/design/product/assets-and-rules/design.md)判断，不以文档存在证明兑现。

## 使用与集成

独立消费从 [SPEC](SPEC.md)读取明确输入、结果、资格和生命周期责任。正文文本用 `readBodyText` 读取后再交给类别 `judge`。Cordis 消费须在公开契约明确后沿[IC 约定](../../../docs/architecture/cordis-integration-conventions.md)设计装配，不能将活体 Context 当作业务数据。

## 契约与设计

[SPEC](SPEC.md)完整维护非类型行为，[内部设计](docs/internals.md)维护本成员机制、精确流程与后续设计义务。[组入口](../README.md)维护依赖及协作。公开类型是已接受的 `BodyContract` 与 `CategoryRegistry`，见 [SPEC](SPEC.md#accepted-public-types)。

## 配置与运行

配置、环境、资源限制及提供者采用沿 SPEC 和内部设计的适用条件判断。尚无已核实运行装配，不提供默认机制。

## 验证与维护

公开入口的单元测试已经在 Node 26 上跑过。命令是 `pnpm --filter @omne-harness/assets test`。集成测试和端到端测试不适用。类别提供方契约见 [SPEC](SPEC.md#category-provider)，该节已技术接受。公开类型见 [SPEC](SPEC.md#accepted-public-types)。上文其余章节仍是候选。
