本成员导出 `toolBodyContract`，作为已接受的资产类别端口。执行、等待和结果保管仍按本页其余章节，那些行为尚未在这个入口实现。

# @omne-harness/tool

本成员的协作契约已技术接受，精确范围见 [SPEC](SPEC.md)。运行接口尚未实现，提供者与组合验证尚未完成。

## 责任与使用

本成员沿[SPEC](SPEC.md)承担完整行为。独立消费通过未来公开入口及显式依赖，不要求启动Cordis；系统集成通过同包Cordis适配满足共同IC、合法身份及业务交接。公开形状、配置、协议与对象模型已接受，实际导出与提供者仍待实现。

## 契约与设计

- [SPEC](SPEC.md)拥有完整行为、操作协议及 Code 组合协议。
- [设计入口](docs/index.md)展开六个文档主题。
- [内部架构](docs/architecture.md)解释模块、依赖、机制与外部缺项。
- [验证资源](verification/index.md)维护能力覆盖和持续验证场景。

## 验证与维护

SPEC规定必要保证，verification维护持续验证义务；实际测试、模型、提供者和装配证据尚缺。修改时同步公开消费者和组导航；未决按[产品第四块](../../../.meta_harness/design/product/tool-execution/design.md#未决问题与待定事项)及技术拥有者闭合。
默认测试责任是单元和契约。命令是 `pnpm --filter @omne-harness/tool test`。`tests/public-entry.spec.ts` 核对公开导出。现有测试覆盖资产正文端口；运行契约实施后须补齐存储和执行旅程的集成验证。

<a id="342-主干运行契约候选"></a>

## 主干运行契约

[公开设计定义](docs/public-api.md)、[行为与必要协议](SPEC.md#342-主干运行契约候选)、[消费及失败场景](docs/context.md)、[Cordis集成设计](docs/cordis.md)共同构成已接受的运行设计。签名尚未成为生产导出。共同对象、装配与后继验证从[运行架构入口](../../../docs/architecture/runtime/README.md)展开。

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
│   ├── public-api.md         公开定义导航与设计声明
│   ├── context.md            消费与系统定位
│   └── cordis.md              集成责任
├── src/                      当前公开定义与实现
├── tests/                    当前成员测试
└── verification/             覆盖矩阵和持续验证场景，含 README.md + index.md
```

树中列出 docs 的全部主题；验证资源见 [verification](verification/index.md)。设计阅读路径见[文档索引](docs/index.md)。六主题的职责见[文档说明](docs/README.md)。其他模板目录尚未建立，完整目录要求见[成员文档规范](../../../docs/member-documentation.md)。
