PACKAGE_TEMPLATE_DRAFT

本成员已按 RFC-0003 初始化为 workspace 草稿。公开行为尚未实现。`src/index.ts` 不导出值。导出条件 `source` 指向本包源码。发布时去掉它。

# identity

## 职责与状态

本目录维护目标成员的行为与机制文档，尚无实现成员、公开导出或运行入口。支持未核实，业务规则采用范围见 [SPEC](SPEC.md)，精确公开形状及机制仍待确定。原有效能力与阶段承诺沿[产品正文](../../../.meta_harness/design/product/identity-and-authorization/design.md)判断，不以文档存在证明兑现。

## 使用与集成

独立消费从 [SPEC](SPEC.md)读取明确输入、结果、资格和生命周期责任；目前不能提供可运行示例或命令。Cordis 消费须在公开契约明确后沿[IC 约定](../../../docs/architecture/cordis-integration-conventions.md)设计装配，不能将活体 Context 当作业务数据。

## 契约与设计

[SPEC](SPEC.md)完整维护非类型行为，[内部设计](docs/internals.md)维护本成员机制、精确流程与后续设计义务。[组入口](../README.md)维护依赖及协作。合法身份与时间点的已采用纯值归[共同纯表示](../../common/README.md)。本成员的操作公开类型仍待形成，不复制旧签名。

## 配置与运行

配置、环境、资源限制及提供者采用沿 SPEC 和内部设计的适用条件判断。尚无已核实运行装配，不提供默认机制。

## 验证与维护

SPEC 的不变量与验证场景是持续义务，尚无本次运行证据。成员维护者改变行为时同步公开形状、机制、消费者及验证，组维护者同步跨成员协作与导航。关键未知只暂停依赖路径。
默认测试责任是单元和契约。`tests/public-entry.spec.ts` 从包名核对当前公开导出。集成测试和端到端测试不适用：本包还没有具体存储、应用服务或关键用户旅程。
