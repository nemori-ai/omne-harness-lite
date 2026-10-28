# @omne-harness/tool-contract

与 [README.md](README.md) 是同一成员。设计已接受。SPEC 的[公开入口的分组](SPEC.md#公开入口的分组)（D-03）与[公共流协议上的观察](SPEC.md#公共流协议上的观察)（D-10）两节是 [#626 revision 4](https://github.com/nemori-ai/omne-harness-lite/issues/626#issuecomment-6395260809) 的写回，它们的接受在该卡交付时记录。[结果推送与保存](SPEC.md#结果推送与保存)、[外层调用方的启动围栏](SPEC.md#外层调用方的启动围栏)与[授权消费点与撤权再核](SPEC.md#授权消费点与撤权再核)是 [#674 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/674#issuecomment-6395429174) 的写回，接受同样在该卡交付时记录。公开名字分两个入口（[SPEC「公开入口的分组」](SPEC.md#公开入口的分组)）：根入口导出 Tool 组外成员实际导入的名字及其声明的传递闭包，以及按规则 3 进入的结果推送名字与 `judgeToolDelivery`，子路径入口 `./provider` 导出只被 Tool 组实现成员使用的提供者协议（含 `toolBodyContract`、其余身份解码函数、默认结果政策、契约函数、启动围栏视图 `ToolStartFence`、受理记录 `ToolStartAcceptance` 与许可引用）。子路径入口 `./binding` 只供受信的执行绑定提供者读取句柄内的作者。子路径入口 `./testing` 给十个一致性套件和守约的非耐久替身：环境、启动排序域、执行者绑定、输出保管、ToolClock、决策桥、资源应答、结果接收端口、外层调用方的启动围栏与启动排序域的授权消费点；登记语义套件在 `tool-cordis-contract` 的 `./testing`，用法见 [README](README.md#一致性套件)。夹具可另给第二个租户的 `otherAccess`，跨租户用例以它判定；缺失时不适用。每个端口有一张回答表，套件经 `finalAnswer` 与 `resendRecalls` 读取答复，不轮询；夹具的完成手柄只在延迟工作落地后才 resolve，缺手柄的用例报告不适用，不是通过。服务定义与服务键在 [`@omne-harness/tool-cordis-contract`](../tool-cordis-contract/README_ZH.md)。本包不含 runtime 与提供者的实现。独立执行函数和 runtime 在 `@omne-harness/tool`。支持范围见[支持范围](#支持范围)。

后台 RC 块的声明、封闭 schema 和纯投影已实现，入口见[后台调用供给](docs/public-api.md#后台调用的-rc-供给)。完整获权目录、可信说明来源与生产 RC 持有者尚未交付。

## 支持范围

检出范围和跨包总表见[工具执行组的支持范围](../README.md#支持范围)。本节只写本包的部分。每档的验证范围只说明测试核对了什么，不说明测试范围之外的行为已成立。

| 档 | 本包的状态 | 入口 | 验证范围 |
| --- | --- | --- | --- |
| 公开类型已导出 | 已导出：全部公开契约类型（含结果推送、启动围栏视图、受理记录与许可引用）、品牌身份解码函数、默认结果政策与资产正文端口 `toolBodyContract` | 根入口与 `./provider`，按[公开入口的分组](SPEC.md#公开入口的分组) | `tests/public-entry.spec.ts` 核对导出名与导入方向。`*.spec-d.ts` 以正负编译用例核对类型 |
| 纯契约函数已实现 | 已实现：定义、请求、交付解除与状态的判定函数，结果推送的纯关系判定 `judgeToolDelivery`（根入口），可用性判定与呈现（可用结果带来源层），作者注册（只收实现侧字段），定义派生 `deriveDefinition` 与常驻规则纯函数 `shapeOf`、`planAdoption`、`refreshAvailability`、`foldResident`，等待契约，默认参数 codec，结果渲染与投影，以及 `./binding` 的作者读取函数 | `./provider`，按[公开入口的分组](SPEC.md#公开入口的分组)。`./binding` 只给受信的执行绑定提供者 | 单元测试覆盖这些函数。函数不做 I/O。没有包外消费者验证 |
| 独立执行已实现 | 本包没有。`executeTool` 与 `createIndependentToolScope` 在 `tool`，该包的范围见[组的支持范围](../README.md#支持范围) | 无 | 无 |
| runtime 已实现的路径 | 本包没有。runtime 在 `tool`，该包的范围见[组的支持范围](../README.md#支持范围)。本包只定义它的契约 | 无 | 无 |
| 尚未交付的宿主与提供者 | 本包只定义端口。真实的环境、执行者绑定、输出保管、时钟、决策桥与资源应答提供者都尚未交付。启动排序域的本地提供者已在 `tool-host-local` 中实现，范围见该包 README 的支持范围一节（`tool-host-local/README_ZH.md#支持范围`）。该提供者尚未提供 `toolStartFence` 服务键，也尚未在 consume 中再核撤权与消费授权许可。结果接收端口由消费拥有者实现，尚无真实实现 | 无 | 无 |

`./testing` 的十个一致性套件已交付。它们只对非耐久替身和违约变体运行。真实实现的对照见 [public-api 的 `./testing` 一节](docs/public-api.md#端口一致性套件testing)。

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

普通 ToolRuntime 以 invoke 提交 payload，返回可保存的调用引用。queries、commands、instances.current、observation.observe 与 content 分别提供查询、命令、当前过程流引用、公共流观察和内容读取。引用 codec 从根入口导出，每次使用仍核当前主体和合法租户。受信内部 admission 与回应不进入普通接口，精确协议见 [SPEC](SPEC.md#342-普通操作与实例目录)。
