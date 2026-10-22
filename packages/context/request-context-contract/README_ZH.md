# @omne-harness/request-context-contract

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Request Context 的纯契约成员，`module` 变体。

## 职责与状态

本成员拥有一次模型请求输入的派生计算协议：组装输入的七组、请求候选、覆盖证据、装入裁定、表示决定、压缩计划与步、六层装载布局与快照锚点规则，以及历史源读口与策略端口的类型。它定义十一个纯操作：八个单项操作加三个压缩计划操作。它读取的全是别人拥有的事实，不拥有事实，不发请求，不固定采用，不写历史。它只认通用角色：协调者、历史持有者、集成方、贡献者与调用方。

状态：契约成员，`draft`。[SPEC](SPEC.md) 写明了哪些部分由技术接受采用，哪些部分依据产品正文第 4 版写入。现在的实现情况如下：

- 已实现：没有。`src/index.ts` 是空导出，根入口没有类型，也没有运行值。
- 未实现：全部值类型、全部纯操作、端口类型与契约常量，清单见[公开接口页](docs/public-api.md#随实现进入的导出)。
- 未验证：SPEC 的全部行为条款。本成员没有运行实现，不宣称租户隔离、断电耐久、模型兼容或性能通过。

现在没有包依赖本成员。协调者一侧的适配器还没有建立，见[使用与定位](docs/context.md#现在的真实消费者)。

## 使用

本成员只有根入口 `@omne-harness/request-context-contract`，现在没有可以导入的名称。操作进入后，调用顺序如下：

1. 调用方准备七组输入与构造依赖，调用 `assemble`。
2. 结局是候选成立时，调用方交 Model 准备并固定，覆盖证据在下一次组装作为「已采用」传回。
3. 结局是需要压缩时，调用方调用 `planCompaction` 与 `deriveStep`，自己执行步并保存进度，提交压缩转换后调用 `resume`。
4. 结局是装不下时，失败回到调用方。

职责伪代码见[对象模型](docs/object-model.md#调用方怎样使用)。独立消费与托管消费的路径见[使用与定位](docs/context.md#使用方式)。

独立使用只需安装本成员，不需要协调者、历史持有者或 Cordis。本成员没有 `./cordis` 入口。Cordis 集成走组内其他成员，见 [Cordis 说明](docs/cordis.md)。

## 契约

- 公开形状归 [src/index.ts](src/index.ts)，现在为空。
- 类型以外的行为归 [SPEC](SPEC.md)，条款 RQ-01 至 RQ-11、布局规则 R1 至 R9、历史源规则 H1 至 H5。
- 导出索引归[公开接口页](docs/public-api.md)。
- 对象的身份、拥有者与生灭归[对象模型](docs/object-model.md)。

一次组装只有四种结局：候选成立且还要过扩展位置、候选成立且可以固定、需要压缩、装不下。失败只有三类：无权、无效、不可用。另有未知。限额未知不是失败，固定部分超限是结局「装不下」，不是失败。压缩转换与最终请求记录是两笔共同提交，都不在本成员内发生，本成员只给材料。本成员不持有资源，没有需要释放的对象。

## 设计

根入口按十个模块组织：输入与候选的值类型、投影、提示词组装、声明投影、放置、表示选择、预算裁定、组装与覆盖证据、计划与步、历史源与策略端口。依赖单向。包外依赖是 model-contract、tool-contract、content-block、message 与 runtime-context-contract 的公开值，它们随实现进入 `package.json`。模块切分与设计理由见[内部架构](docs/architecture.md)，六条协议流程见[协议流程](docs/flows.md)，对象见[对象模型](docs/object-model.md)。

## 配置与运行

本成员没有配置，没有环境前提，运行时不读取资源。压缩策略与表示策略的配置项见 [SPEC 的 RQ-06](SPEC.md#rq-06-压缩共同结果与保护边界)，默认值只是初值，数值归 [request-context](../request-context/README.md)。

调用方负责提供七组输入与构造依赖：`HistorySource` 实现、Model 的计量端口与转换件结果端口、两个策略实现。调用方还负责固定最终请求、执行压缩步、保存计划进度，以及与历史持有者共同提交压缩转换。读取系统托管的数据时，仍适用原来源契约。

## 验证

在仓库根执行：

```sh
pnpm turbo run test --filter=@omne-harness/request-context-contract
```

在本目录执行 `pnpm typecheck` 做类型检查。现有测试只断言根入口没有运行导出，见 [tests/](tests/README.md)。SPEC 的[持续验证义务](SPEC.md#rq-11-持续验证与未覆盖)都还没有测试覆盖。结构检查通过不表示行为已验证。

## 维护

- 公开导出变化时，同步 SPEC、[公开接口页](docs/public-api.md)、[src 索引](src/index.md)与导出测试。
- 七组输入、四种结局、三类失败、六层顺序或前缀变化原因变化时，同步组内依赖方 request-context-cordis-contract、request-context、request-context-cordis，以及协调者一侧的适配器，见[字段对应](docs/context.md#字段对应)。
- 新的压缩策略或表示策略是策略端口的新实现，本成员不改。
- 成员关系与依赖方向归[组入口](../README.md)。具名维护者由负责人指定。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为，RQ-01 至 RQ-11
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块与依赖、关键机制与理由
├── flows.md              F-RQ01 至 F-RQ06 协议流程
├── object-model.md       对象、生命周期与状态
├── public-api.md         导出入口与定义索引
├── context.md            独立消费、邻域交接、字段对应与系统定位
└── cordis.md             不适用 Cordis 集成的理由
src/                      公开定义，现在只有空导出的 index.ts
tests/                    持续测试，fixtures/ 现在为空
schema/                   现在为空，本成员不发布 Schema
verification/             models/ 与 proofs/，现在为空
adr/                      现在为空
examples/                 现在为空
resources/                现在为空
acceptance/               现在为空，fixtures/ 也为空
```

每个目录的 README.md 说明职责与现状，index.md 负责导航。阅读路径见 [index.md](index.md)。
