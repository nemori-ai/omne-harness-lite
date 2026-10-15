PACKAGE_TEMPLATE_DRAFT

本成员已按 RFC-0003 初始化。凭据引用、存在性查询、解析和本地保管库从根入口导出。`source` 条件指向本包源码。发布时去掉它。其余行为仍以 SPEC 为准。D-04 接受前，待审设计不写入 SPEC。

# model 文档目标

本成员的协作契约已技术接受，精确范围见 [SPEC](SPEC.md)。其余候选、生产实现及运行验证的状态分别保留。

## 责任与使用

本成员沿[SPEC](SPEC.md)承担完整行为。凭据的独立消费走根入口，不要求启动 Cordis。系统集成走 `src/cordis.ts` 的 `modelCredential`。档案选择、结果保管和费用的公开形状仍待设计。

## 契约与设计

- [行为入口](SPEC.md)与原专题共同保持完整承诺。
- [抽象与建模](docs/model.md)、[Cordis 接缝](docs/cordis.md)、[包内架构](docs/architecture.md)、[关键流程](docs/key-flow.md) 是本包 `docs/` 的四块。
- [档案与模态](docs/profile-and-modality.md) 和 [消费与费用](docs/consumption-and-cost.md) 保持行为正文。未闭合项见 [open-questions](docs/open-questions.md)。
- [原具名专题 profile-and-modality.md](docs/profile-and-modality.md)保持唯一行为正文。
- [原具名专题 consumption-and-cost.md](docs/consumption-and-cost.md)保持唯一行为正文。

## 验证与维护

SPEC及专题维护持续验证义务。凭据解析有成员测试。模型执行器、真实提供者和完整装配仍缺。修改时同步公开消费者和组导航。未决按[产品第四块](../../../.meta_harness/design/product/model-invocation/design.md#未决问题与待定事项)及技术拥有者闭合。
默认测试责任是单元和契约。`tests/credential.spec.ts` 覆盖解析、拒绝、轮换、重启和 Cordis 关闭。`tests/public-entry.spec.ts` 从包名核对根入口导出。
