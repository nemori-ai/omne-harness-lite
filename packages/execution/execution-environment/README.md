PACKAGE_TEMPLATE_DRAFT

本成员已按 RFC-0003 初始化为 workspace 草稿。宿主文件设施和 `executionEnvironment` 服务已从公开入口导出。`command`、三种沙箱和 SPEC 其余行为仍未实现。导出条件 `source` 指向本包源码。发布时去掉它。

# 执行环境成员目标

状态：宿主文件使用和 `executionEnvironment` 服务有公开入口与包测试。整份 SPEC 仍是行为候选。不能把这一刀当成应用已经装上该插件，也不能从此目录启动应用。

## 职责与阅读

本目标承接领域中归属于执行环境能力的完整必要行为。根入口导出环境类型和宿主文件操作。`./cordis` 导出服务键、登记表和宿主文件插件。行为由[完整 SPEC](SPEC.md)维护。设计分成 [架构](docs/architecture.md)、[关键流程](docs/key-flow.md)、[模型](docs/model.md) 和 [Cordis 集成](docs/cordis.md)。PanQiWei 已接受该设计，见 [技术设计接受](https://github.com/nemori-ai/omne-harness-lite/issues/278#issuecomment-6197369869)。与外部能力协作从[组入口](../README.md)展开。

## 独立与 Cordis 消费

独立消费者须提供可核验主体、原工作与实际依赖，沿 SPEC 的采用前提消费。宿主文件这一刀可以从包名和 `./cordis` 调用。这不构成整份 SPEC 的运行支持声明。Cordis 集成沿[统一 IC 约定](../../../docs/architecture/cordis-integration-conventions.md)设计装配、依赖与撤除；内核不提供领域授权、耐久、安全隔离或外部效果回滚。

## 配置、验证与维护

具体提供者、公开形状、配置协议和部署尚待技术采用，未选部分沿内部设计的技术后续设计补足。SPEC 的持续验证义务尚无本轮运行证据；真实消费者、故障与并发范围须由实现及组合拥有者核验。修改行为时同步内部设计、组导航、真实消费者与持续验证资源，不能以图或文档存在授予采用。
默认测试责任是单元和契约。`tests/` 从包名核对宿主文件结果和 `./cordis` 登记。集成测试和端到端测试不适用：本包还没有具体存储、应用服务或关键用户旅程。
