本成员的根入口导出资产类别端口 `toolBodyContract`、全部公开契约类型、品牌身份解码函数、默认结果政策和契约函数。契约函数覆盖定义与状态判定、呈现、可用性判定、作者注册、等待契约、默认参数 codec、结果渲染与投影。子路径入口 `./binding` 导出读取句柄内作者的函数，只供受信的执行绑定提供者使用。子路径入口 `./testing` 导出环境、启动围栏、执行者绑定、输出保管、ToolClock、决策桥和资源应答七个端口的一致性套件，以及各自守约的非耐久替身。登记语义套件在 `tool-cordis-contract` 的 `./testing`。本包不依赖 Cordis。服务定义、18 个服务键和事件增补在 [`@omne-harness/tool-cordis-contract`](../tool-cordis-contract/README.md)。本包不含 runtime 与提供者的实现。独立执行函数和 runtime 在 `@omne-harness/tool`。支持范围见[支持范围](#支持范围)。

# @omne-harness/tool-contract

本成员的协作契约已技术接受，精确范围见 [SPEC](SPEC.md)。公开类型和契约函数已经导出，一致性套件已交付。本包不含独立执行函数、runtime 与提供者。它们在其他包，支持范围见[支持范围](#支持范围)。

## 支持范围

检出范围和跨包总表见[工具执行组的支持范围](../README.md#支持范围)。本节只写本包的部分。每档的验证范围只说明测试核对了什么，不说明测试范围之外的行为已成立。

| 档 | 本包的状态 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开类型已导出 | 已导出：全部公开契约类型、品牌身份解码函数、默认结果政策与资产正文端口 `toolBodyContract` | 根入口 | `tests/public-entry.spec.ts` 核对导出名与导入方向。`*.spec-d.ts` 以正负编译用例核对类型 |
| 纯契约函数已实现 | 已实现：定义、请求、交付解除与状态的判定函数，可用性判定与呈现，作者注册，等待契约，默认参数 codec，结果渲染与投影，以及 `./binding` 的作者读取函数 | 根入口。`./binding` 只给受信的执行绑定提供者 | 单元测试覆盖这些函数。函数不做 I/O。没有包外消费者验证 |
| 独立执行已实现 | 本包没有。`executeTool` 与 `createIndependentToolScope` 在 `tool`，该包的范围见[组的支持范围](../README.md#支持范围) | 无 | 无 |
| runtime 已实现的路径 | 本包没有。runtime 在 `tool`，该包的范围见[组的支持范围](../README.md#支持范围)。本包只定义它的契约 | 无 | 无 |
| 尚未交付的宿主与提供者 | 本包只定义端口。真实的环境、执行者绑定、输出保管、时钟、决策桥与资源应答提供者都尚未交付。启动围栏的本地提供者已在 `tool-host-local` 中实现，范围见该包 README 的支持范围一节（`tool-host-local/README_ZH.md#支持范围`） | 无 | 无 |

`./testing` 的七个一致性套件已交付。它们只对非耐久替身和违约变体运行。真实实现的对照见[一致性套件](#一致性套件)。

## 责任与使用

本成员沿[SPEC](SPEC.md)承担完整行为。独立消费通过根入口及显式依赖，不要求启动Cordis；系统集成通过 `@omne-harness/tool-cordis-contract` 的定义与具名宿主插件满足共同IC、合法身份及业务交接。公开形状、配置、协议与对象模型已接受。公开类型与契约函数已经导出。独立执行函数已在 `tool` 实现，runtime 只实现了一部分路径，宿主与提供者大多尚未交付。

## 一致性套件

外部提供者对自己的 `ToolEnvironment`、`ToolStartAuthority`、live-only `ToolExecutorBinding`、`ToolOutputCustody`、`ToolClock`、`ToolDecisionBridge` 或 `ToolResourceResponses` 实现，从 `@omne-harness/tool-contract/testing` 取对应套件（`toolEnvironmentConformance`、`toolStartAuthorityConformance`、`toolExecutorBindingConformance`、`toolOutputCustodyConformance`、`toolClockConformance`、`toolDecisionBridgeConformance`、`toolResourceResponsesConformance`）。套件不依赖测试框架：它返回用例列表，每条用例是 `{ name, clause, run(fixture) }`，以 `node:assert` 判定。提供者在自己的测试框架里逐条注册，每条用例前新建一个夹具。夹具给出被测端口、它接受的主体与租户，以及它能给的控制手柄。夹具还可给出第二个租户的主体与租户（`otherAccess`），跨租户用例以它证明另一租户读不到、改不了记录，也得不到记录存在的信息；缺失时这些用例不适用，手柄名是 `otherAccess`。每个端口有一张回答表（`environmentAnswers`、`startAuthorityAnswers` 等，从 `./testing` 导出），列出表示进度的答复种类（`pending`、`unknown`、`accepted`）与表示回包丢失的失败种类（`commit-unknown`），每行引用条款。提供者可以先答这些种类：套件用 `finalAnswer` 在进度期间再问一次，再调用夹具的推进手柄（`settle`、`completeStop` 一类），最后问一次取最终答复，不轮询；没有该手柄则报告不适用，不判失败。手柄的完成契约是：只在延迟工作已经落地、且对端口的每次读取都可见之后才 resolve。某条用例需要的手柄缺失时，`runConformanceCase` 把它报告为不适用，并指明手柄。不适用不是通过，要单列计数。注册示例见 [public-api](docs/public-api.md#端口一致性套件testing)。替身声明 `durability: 'none'`，不能用于生产，也不证明耐久提供者符合契约。真实实现的对照与未对照的端口，以 [public-api 的 `./testing` 一节](docs/public-api.md#端口一致性套件testing)为准。

## 契约与设计

- [SPEC](SPEC.md)拥有完整行为、操作协议及程序执行方的组合协议。
- [设计入口](docs/index.md)展开六个文档主题。
- [内部架构](docs/architecture.md)解释模块、依赖、机制与外部缺项。
- [验证资源](verification/index.md)维护能力覆盖和持续验证场景。

## 验证与维护

SPEC规定必要保证，verification维护持续验证义务。已有的证据是本包的单元测试、类型测试和一致性套件的自证，范围见下。形式模型、真实提供者和装配的证据尚缺。修改时同步公开消费者和组导航；未决按[产品第四块](../../../.meta_harness/design/product/tool-execution/design.md#未决问题与待定事项)及技术拥有者闭合。
默认测试责任是单元和契约。快层命令是 `OMNE_TEST_TIER=fast pnpm --filter @omne-harness/tool-contract run test`，慢层命令是 `OMNE_TEST_TIER=slow pnpm --filter @omne-harness/tool-contract run test`。两条命令都先构建本包再运行本层测试；本包依赖的成员要先构建（例如 `pnpm --filter @omne-harness/tool-contract... run build`），干净检出里没有依赖的 `dist` 时测试无法解析导入。`tests/public-entry.spec.ts` 核对公开导出。现有测试覆盖资产正文端口及其 `programmable` 校验、品牌身份解码、契约函数、默认结果政策、三个入口的导入方向、服务键唯一性、公开类型的正负编译用例，以及七个端口一致性套件对内存替身和违约变体的自证（逐断言的违约变体对应表在 [tests/README](tests/README.md#断言与违约变体的对应)，守约但不同的提供者必须全过）；运行契约实施后须补齐存储和执行旅程的集成验证。

<a id="342-主干运行契约候选"></a>

## 主干运行契约

[公开设计定义](docs/public-api.md)、[行为与必要协议](SPEC.md#342-主干运行契约候选)、[消费及失败场景](docs/context.md)、[Cordis集成设计](../tool-cordis-contract/docs/cordis.md)共同构成已接受的运行设计。公开类型与契约函数已从根入口导出，定义在 [src](src/index.ts)。独立执行函数和 runtime 工厂的实现在 `@omne-harness/tool`，签名导航见 tool 的 public-api（`tool/docs/public-api.md`）。共同对象、装配与后继验证从[运行架构入口](../../../docs/architecture/runtime/README.md)展开。

## 目录结构与文档职责

本包按公开契约、内部设计和验证职责组织文档。实际目录如下。

```text
tool-contract/
├── README.md / README_ZH.md   包职责与使用入口
├── index.md                  文件与阅读路径
├── SPEC.md                   行为唯一正文
├── documentation.json        实际文档登记
├── docs/                     README.md + index.md
│   ├── architecture.md       内部架构
│   ├── flows.md              业务与数据流
│   ├── object-model.md       对象模型
│   ├── public-api.md         源码导航
│   └── context.md            消费与系统定位
├── src/                      README.md + index.md，公开类型、身份解码、契约函数与正文端口
├── tests/                    README.md + index.md，成员测试与类型测试
│   └── fixtures/             README.md + index.md，占位
├── schema/                   README.md + index.md，占位
├── verification/             README.md + index.md，覆盖矩阵和持续验证场景
│   ├── models/               README.md + index.md，占位
│   └── proofs/               README.md + index.md，占位
├── adr/                      README.md + index.md，占位
├── examples/                 README.md + index.md，占位
├── resources/                README.md + index.md，占位
├── acceptance/               README.md + index.md，占位
└── tsconfig.build.json / tsconfig.test.json / vitest.config.ts
```

树中列出 docs 的全部主题；验证资源见 [verification](verification/index.md)。设计阅读路径见[文档索引](docs/index.md)。六主题的职责见[文档说明](docs/README.md)。标为占位的目录只有职责说明，不表示已有 Schema、模型、证明、决策、示例、运行资源或验收能力。文件导航见 [index](index.md)，完整目录要求见[成员文档规范](../../../docs/member-documentation.md)。
