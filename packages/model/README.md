# 模型调用能力组

本组拥有模型档案、完整请求校验、真实发出、原输出、结果保管及费用事实的工程组织。CAP-MD01 至 CAP-MD13 的接受状态与阶段承诺以[产品正文](../../.meta_harness/design/product/model-invocation/design.md#阶段与版本支持承诺)为准，产品能力不表示已交付；源码实现与运行验证分别判断。

## 当前状态

状态分四类，各类只说明自己的范围。

1. 已有：凭据引用、解析与本地保管。凭据的纯契约（引用、查询、存在性与解析结果、`CredentialPort`、持有者比较函数）在 [model-contract](model-contract/README_ZH.md) 的根入口，声明在 `src/credential.ts` 与 `src/credential-values.ts`。存在性与解析的判定在 [model](model/README_ZH.md) 的根入口。本地保管（文件保管库）与装载它的 `LocalCredentialPlugin` 在 [model-host-local](model-host-local/README_ZH.md) 的根入口与 `./cordis` 入口。Cordis 凭据服务定义 `ModelCredentialService` 在 [model-cordis-contract](model-cordis-contract/README_ZH.md) 的 `./cordis` 入口。局限：保管库只在本机文件系统上验证，并要求调用方与保管库在同一进程共享 legal-identity 实例；凭据服务不核验调用方资格，该项在 [model-cordis-contract 的 SPEC](model-cordis-contract/SPEC.md#凭据服务)登记为未决。
2. 已实现的两个公开契约。model-contract 的根入口导出 153 个类型与 18 个运行值，`./testing` 入口导出受控替代提供者、替代传输与提供者符合性断言，共 27 个名字。model-cordis-contract 的根入口导出 8 个登记类型，`./cordis` 入口导出 42 个名字与 `Context`、`Events` 增补。两个包都有导出清单比对、类型探针、安装闭包检查与角色夹具，model-cordis-contract 另有对真实 Cordis 的登记与撤除测试。局限：替代提供者的结果由脚本给出，不证明生产提供者；这些检查证明契约面，不证明任何运行实现。
3. model 已实现 `executeModel`、受理、原流保存、最小实例观察与[有限的原终局收场](model/SPEC.md#已实现的调用收场)，提供[逐步教学示例](model/examples/README.md)。验证使用真实产品 driver/sender 和内存 Commands、脚本传输，不证明真实厂商或生产耐久。结果读取及 processed ACK 已实现；retained ACK、自动清理、重试循环、恢复与独立能力构造尚未实现。尚未实现的还有 model-host-local 的时钟、实例调度、目录装载与托管运行插件，以及 pi 传输、厂商家族、tokenizer 引擎等其他提供者。
4. 技术设计：非 pi-ai 技术设计已接受。pi-ai 的成员划分、家族贡献取得协议、Tokenizer 分工及迁移接受条件已接受；其余细化沿[组架构](docs/architecture.md#成员与新增条件)的各节标注。OpenAI 实现线只交付三个新成员，延期条件见[迁移接受范围](docs/architecture.md#迁移与接受条件)。

## 成员与依赖

| 成员 | 责任与实际状态 | 阅读入口 |
| --- | --- | --- |
| model-contract | 已实现：根入口 153 个类型与 18 个运行值，`./testing` 入口 27 个名字；拥有共同协议、公开值与端口。运行实现与真实提供者不在本包 | [成员入口](model-contract/README_ZH.md)、[行为规格](model-contract/SPEC.md) |
| model-cordis-contract | 已实现：根入口 8 个登记类型，`./cordis` 入口 42 个名字（含凭据服务定义）；拥有 Cordis 定义和登记协议 | [成员入口](model-cordis-contract/README_ZH.md)、[行为规格](model-cordis-contract/SPEC.md) |
| model | 已有独立执行、凭据判定、`deliver`、受理、原流保存、实例观察与有限的原终局收场；结果读取及 processed ACK 已实现，retained ACK 和生产宿主尚未实现 | [成员入口](model/README_ZH.md)、[实现规格](model/SPEC.md) |
| model-host-local | 目前只实现本地凭据保管（文件保管库与 `LocalCredentialPlugin`）；时钟、实例调度、目录装载的设计已接受，尚未实现 | [成员入口](model-host-local/README_ZH.md)、[行为规格](model-host-local/SPEC.md) |

目标分为 `model-contract`、`model-cordis-contract`、可复用实现 `model` 和单机宿主 `model-host-local`，再组合已采用 pi 技术栈的共享传输、八个厂商家族及两类 tokenizer 引擎包。两个契约成员已有源码与测试，文档已落位；model 保留可复用实现设计并暂存宿主装配设计；model-host-local 已承接本地凭据保管，不保留聚合安装门面。完整职责、共同依赖前置和初始化条件见[组架构](docs/architecture.md#成员与新增条件)。具体型号在家族内独立绑定和验证。

## 责任与范围

[产品设计](../../.meta_harness/design/product/model-invocation/design.md)定义承诺，[领域架构](../../docs/domains/model-invocation/architecture.md)划分业务责任，[组架构](docs/architecture.md)决定工程组织。进入成员后，先看[内部架构](model/docs/architecture.md)与[流程](model/docs/flows.md)，再按需读对象模型、公开接口设计、SPEC 和 Cordis 装配。

## 关键协作

Context 选择表示、组装、分配预算及压缩，在请求前用 Model 提供的计量能力判断输入大小。Model 固定参数与供应商采用，在实际发送前核实媒体并编码最终 payload，不计量输入；上游报告输入超限时，调用以 input-over-limit 收场。调用方保存选择；原发起者保存用途和消费位置。Model 不反向依赖请求组装者、原发起者或消费者拥有者的实现。

## 组合验证

[Model 持续验收](model/acceptance/README.md)通过构建后的公开运行时覆盖成功调用、受理拒绝和本地凭据拒绝三条产品场景。它使用脚本传输及内存后端，独立验收与交付接受仍须另行取得证据。

[能力覆盖](model-contract/verification/README.md#model-产品能力与设计覆盖)连接产品承诺、内部 module、流程和反例。跨领域验证覆盖同次输入采用、消费者换代、提交未知、首内容、不重复发送、ACK 清理、迟到费用及普通断电耐久。单个模拟 adapter 通过不代替真实供应商和存储证据。

## 维护

行为变更回成员 SPEC，工程分解回组架构，用户后果回产品。提供者记录具体支持范围和验证，不能降低共同契约。组页不另建状态机、服务定义或第二套错误集合。

凭据的当前入口见[判定入口](model/docs/public-api.md#已实现的凭据入口)与[本地保管入口](model-host-local/docs/public-api.md)。model 源码与包清单都不含 Cordis、proper-lockfile 与 model-cordis-contract，包导出根与独立 testing 入口。model 的安装闭包由 `install-closure` 检查，运行方式与范围见 [model 测试说明](model/tests/README.md#安装闭包)和[组架构](docs/architecture.md#凭据的现有装配边界)，结果不在本页记录。
