# @omne-harness/tool

与 [README.md](README.md) 是同一成员。设计已接受，运行接口尚未实现。

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
