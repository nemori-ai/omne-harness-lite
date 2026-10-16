# @omne-harness/tool-contract

与 [README.md](README.md) 是同一成员。设计已接受。根入口导出全部公开类型、品牌身份解码函数、默认结果政策和契约函数，服务定义与服务键在 [`@omne-harness/tool-cordis-contract`](../tool-cordis-contract/README_ZH.md)。独立执行函数与 runtime 尚未实现。

<a id="342-主干运行契约候选"></a>

## 主干运行契约

[公开设计定义](docs/public-api.md)、[行为与必要协议](SPEC.md#342-主干运行契约候选)、[消费及失败场景](docs/context.md)、[Cordis集成设计](../tool-cordis-contract/docs/cordis.md)共同构成已接受的运行设计。公开类型与契约函数已从根入口导出，定义在 [src](src/index.ts)。独立执行函数和 runtime 工厂的签名尚未实现，保留在 public-api。共同对象、装配与后继验证从[运行架构入口](../../../docs/architecture/runtime/README.md)展开。

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
├── src/                      README.md + index.md，公开类型、身份解码、契约函数、服务定义与正文端口
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
