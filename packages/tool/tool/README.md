本成员的根入口导出资产类别端口 `toolBodyContract`、全部公开契约类型、品牌身份解码函数和默认结果政策的身份。`./cordis` 导出服务定义、18 个服务键和 `tool/call-changed` 事件增补。执行、等待和结果保管的函数与 runtime 尚未实现。

# @omne-harness/tool

本成员的协作契约已技术接受，精确范围见 [SPEC](SPEC.md)。公开类型与服务定义已经导出。运行函数、提供者与组合验证尚未完成。

## 责任与使用

本成员沿[SPEC](SPEC.md)承担完整行为。独立消费通过根入口及显式依赖，不要求启动Cordis；系统集成通过同包Cordis适配满足共同IC、合法身份及业务交接。公开形状、配置、协议与对象模型已接受，公开类型已经导出，运行函数与提供者仍待实现。

## 契约与设计

- [SPEC](SPEC.md)拥有完整行为、操作协议及 Code 组合协议。
- [设计入口](docs/index.md)展开六个文档主题。
- [内部架构](docs/architecture.md)解释模块、依赖、机制与外部缺项。
- [验证资源](verification/index.md)维护能力覆盖和持续验证场景。

## 验证与维护

SPEC规定必要保证，verification维护持续验证义务；实际测试、模型、提供者和装配证据尚缺。修改时同步公开消费者和组导航；未决按[产品第四块](../../../.meta_harness/design/product/tool-execution/design.md#未决问题与待定事项)及技术拥有者闭合。
默认测试责任是单元和契约。命令是 `pnpm --filter @omne-harness/tool test`。`tests/public-entry.spec.ts` 核对公开导出。现有测试覆盖资产正文端口、品牌身份解码、默认结果政策身份、两个入口的导入方向、服务键唯一性和公开类型的正负编译用例；运行契约实施后须补齐存储和执行旅程的集成验证。

<a id="342-主干运行契约候选"></a>

## 主干运行契约

[公开设计定义](docs/public-api.md)、[行为与必要协议](SPEC.md#342-主干运行契约候选)、[消费及失败场景](docs/context.md)、[Cordis集成设计](docs/cordis.md)共同构成已接受的运行设计。公开类型已从根入口导出，定义在 [src](src/index.ts)。运行函数的签名尚未实现，保留在 public-api。共同对象、装配与后继验证从[运行架构入口](../../../docs/architecture/runtime/README.md)展开。

## 目录结构与文档职责

本包按公开契约、内部设计和验证职责组织文档。实际目录如下。

```text
tool/
├── README.md / README_ZH.md   包职责与使用入口
├── index.md                  文件与阅读路径
├── SPEC.md                   行为唯一正文
├── documentation.json        实际文档登记
├── docs/                     README.md + index.md
│   ├── architecture.md       内部架构
│   ├── flows.md              业务与数据流
│   ├── object-model.md       对象模型
│   ├── public-api.md         源码导航与尚未实现的函数签名
│   ├── context.md            消费与系统定位
│   └── cordis.md              集成责任
├── src/                      README.md + index.md，公开类型、身份解码、服务定义与正文端口
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
