# @omne-harness/skill-contract

[English](README.md)

Skill 能力组的纯契约成员。它提供 Skill 的值、失败、服务接口、纯函数、三个需求端口及其符合性套件，以及 `@omne-harness/assets` 的 `skill` 类别端口。

## 职责与状态

本成员拥有其他成员共用的 Skill 词汇：包格式规则、快照与内容摘要、失败种类、端口形状，以及 `skill` 类别的资产正文。它没有服务实现，没有来源，也没有运行时状态。`PackageInspection`、`SkillCatalog` 与 `SkillAccess` 只有接口，实现在 `@omne-harness/skill`。目录来源在 `@omne-harness/skill-host-local`。

状态：形状与规则是第一波 Skill 线的候选，尚未取得技术接受。纯函数与内存替身有测试。本成员没有验证任何真实来源、读取权或对应。

## 使用

本成员有三个入口：

- `@omne-harness/skill-contract`：给调用方。值、失败、服务接口、纯函数与 `skillBodyContract`。
- `@omne-harness/skill-contract/provider`：给端口实现方。端口、`SkillRef`、`PackageLocator` 与 `sealSnapshot`。
- `@omne-harness/skill-contract/testing`：给端口实现方的测试。它在运行时导入 `vitest`，消费者必须自己安装 `vitest`。

来源只经 `sealSnapshot` 交出快照。检查一个包的最小示例见 [README.md](README.md#usage)。登记类别端口时，把 `skillBodyContract()` 交给 `@omne-harness/assets` 的类别注册表。本成员没有 Cordis 入口。

## 契约

`src/` 的公开类型拥有数据形状。[SPEC.md](SPEC.md) 拥有类型表达不了的行为：拒绝次序、快照的内容摘要、头部与声明的规则、读取的形状规则、端口要求、符合性套件与类别端口的扩展。[docs/public-api.md](docs/public-api.md) 导航公开定义。`.omne/skill.json` 的机读形状是 [schema/skill-declaration.schema.json](schema/skill-declaration.schema.json)。

## 设计

本成员由几个小模块组成：值、名字、内容摘要、媒体类型、快照构造器、包解析、声明文件与资产正文共用的形状读取、投影、类别端口与测试套件。详见 [docs/architecture.md](docs/architecture.md)。

## 配置与运行

本成员没有运行时配置。两个默认值是可以覆盖的策略值：`parseSkillPackage` 的声明预算（`declarationLimits`），以及 `SkillAccess` 实现使用的 65536 字节读取页。运行需要 Node.js 24 或更高版本。

## 验证

在本目录运行 `pnpm run build`、`pnpm run typecheck` 与 `pnpm test`。测试是单元与契约测试。`tests/conformance-red.spec.ts` 属于慢层：它起一个子测试运行，核对套件对泄露身份的替身变红。详见 [tests/README.md](tests/README.md) 与 [SPEC.md](SPEC.md#持续验证)。

## 维护

本成员合入父分支后，公开形状只做可加改动。形状或规则变化时，同步 SPEC.md、Schema、测试，以及消费者 `@omne-harness/skill` 与 `@omne-harness/skill-host-local`。组设计见 [../docs/architecture.md](../docs/architecture.md)。

## 目录结构与文档职责

```text
README.md, README_ZH.md   入口：用途、状态与本图
index.md                  包内阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成
├── architecture.md       模块、状态与资源归属、机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费方式与在系统中的位置
└── cordis.md             Cordis 适用性
src/                      公开定义、校验与实现
tests/                    持续测试；fixtures/ 放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
```

每个目录有 README.md 说明职责，有 index.md 导航。阅读路径见 [index.md](index.md)。模板目录 `acceptance/` 不在本成员：独立验收者创建它。
