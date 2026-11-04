# @omne-harness/skill

[English](README.md)

Skill 三个应用服务的通用实现：`createPackageInspection` 经来源检查一个包，`createSkillCatalog` 列出并检索主体能读的 Skill，`createSkillAccess` 经 `@omne-harness/skill-contract` 的三个需求端口描述、读取、列举与导出一份 Skill。

## 职责与状态

本包实现契约的接口 `PackageInspection`、`SkillCatalog` 与 `SkillAccess`。它在调用之间不持有状态，没有缓存，也没有自己的来源：每次操作都现场核验读取权、对应与包字节。端口由集成方给出。目录只收读取判定与对应端口，不读字节。

状态：候选，没有技术接受。服务对 `skill-contract/testing` 的内存替身、`SkillAccess` 与 `SkillCatalog` 符合性套件验证过。真实的读取判定、对应与来源都没有在这里验证。第一个真实来源是 `@omne-harness/skill-host-local`。

## 使用

最小示例见 [README.md「Usage」](README.md#usage)。三个工厂收普通对象，交普通对象，没有要启动或释放的东西。`read`、`list` 与 `export` 收 `AbortSignal`，`describe` 与目录不收。每个端口答复在边界上解析一次，判别值与载荷都核对。端口 reject、抛出或答复解析不了时服务不抛出：读取判定与对应端口算 `unknown`，来源算 `unavailable`。`@omne-harness/skill-contract/testing` 的内存替身只能装进测试。

## 契约

数据形状是 `@omne-harness/skill-contract` 的公开类型。三个服务的行为归契约：目录的过滤与检索规则归[契约 SPEC「目录的匹配规则」](../skill-contract/SPEC.md#catalog-search)，拒绝次序与控制文件规则归[契约 SPEC「检查 Skill 包」](../skill-contract/SPEC.md#parse)，读取的形状规则归[「读取的形状规则」](../skill-contract/SPEC.md#read-shape)，读取 11 步与端口映射归组页[「读取」](../docs/architecture.md#读取)与[「端口」](../docs/architecture.md#端口)。本包的 [SPEC.md](SPEC.md) 只拥有实现加上的部分：11 步怎样切成三段、映射在哪里、本包自己做的决定。公开定义的导航在 [docs/public-api.md](docs/public-api.md)。

## 设计

三段，每段是一个只依赖端口的函数：`gate`（第 1–3 步）、`pin`（第 5、7 步）、`verifiedBytes`（第 9、10 步）。`describe` 在 `gate` 后结束，`list` 在 `pin` 后结束，`read` 与 `export` 走完三段。一张表 `mapping.ts` 把来源答复变成服务失败；`port-answer.ts`、`answer-values.ts` 与 `source-answer.ts` 解析每个端口答复（含载荷），交出重新构造的值。`catalog.ts` 是目录：合法集合、每个身份一条、过滤或纯匹配函数 `match.ts`，再对留下的身份做读取判定。`range.ts` 是字节范围的纯函数。见 [docs/architecture.md](docs/architecture.md)。

## 配置与运行

没有配置。每页上限 65536 字节由契约固定。本包需要 Node.js 24 或更新。`@omne-harness/skill-contract` 在进程里只加载一份：契约的快照凭证按模块实例计。

## 验证

在本目录运行 `pnpm run build`、`pnpm run typecheck` 与 `pnpm test`。测试把服务放在内存替身上运行，直接运行每一段，并在本实现上运行 `SkillAccess` 与 `SkillCatalog` 符合性套件，后者还对两个违约目录核对恰好预期的用例变红。见 [tests/README.md](tests/README.md)。未覆盖：真实端口、对同一个包的并发写入、内容存储来源。

## 维护

契约改变一种失败、一步或一条形状规则时，改 `mapping.ts`、拥有那一步的那一段、测试与 [SPEC.md](SPEC.md)。三段之间不互相混入对方的步骤。组设计在 [../docs/architecture.md](../docs/architecture.md)。

## 目录结构与文档职责

```text
README.md、README_ZH.md   入口：用途、状态与本结构图
index.md                  全包的阅读路径
SPEC.md                   公开类型以外的行为
documentation.json        文档登记
docs/                     内部设计、公开使用与集成说明
├── architecture.md       模块、状态与资源归属、关键机制
├── flows.md              关键业务流程与数据流
├── object-model.md       内部对象模型
├── public-api.md         公开边界与定义索引
├── context.md            消费侧使用与系统定位
└── cordis.md             Cordis 适用性与集成
src/                      公开定义、运行时校验与内部实现
tests/                    持续测试；fixtures/ 存放测试输入
schema/                   对外 Schema
verification/             models/ 与 proofs/
adr/                      有持续消费者的实现取舍
examples/                 面向公开入口的示例
resources/                运行所需的非源码资源
acceptance/               独立验收；fixtures/ 存放验收输入
```

每个目录的 README.md 说明职责，index.md 负责导航。阅读路径见 [index.md](index.md)。docs 专题可以升级为同名目录，目录内须有 README.md 与 index.md；专题移动时同步本结构图。
