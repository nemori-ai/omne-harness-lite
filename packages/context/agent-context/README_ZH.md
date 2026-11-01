# @omne-harness/agent-context

PACKAGE_TEMPLATE_DRAFT
[English](README.md)

Context 一侧的 Agent 适配集成成员，`service-provider` 变体。本成员现在只有骨架。

## 职责与状态

本成员将承载应用装配页的两行：`agent-context` 行提供 `agentRequests` 与 `agentModelContext`，`agent-account-outlet` 行提供 `agentAccountOutlet`。服务定义归 [agent-cordis-contract](../../agent/agent-cordis-contract/README_ZH.md)，Context 一侧的端口归 [request-context-contract](../request-context-contract/README_ZH.md)。行与依赖见[应用装配](../../../docs/architecture/runtime/application-assembly.md#插件树)，适配方案见 [Context 的适配方案](../request-context-contract/docs/context.md#适配方案)。

状态：骨架。职责与采用范围等 Context 与 Agent 集成缺口契约（[#859](https://github.com/nemori-ai/omne-harness-lite/issues/859)）的采用。成员名与位置是暂名，待该采用确认；改名时同批改包组织页与锁文件的登记。

- 已实现：无。`src/index.ts` 与 `src/cordis.ts` 都没有导出。
- 未实现：请求准备、Runtime Context 读取、账目出站与来源集合登记。
- 未验证：全部。现在没有应用装配本成员，也没有包依赖本成员。

## 使用

<!-- documentation:placeholder -->

给出最小有效示例、依赖及初始化和释放责任。分别说明独立使用入口与 Cordis 集成入口。逐项核对公开 exports、源码值依赖、生成声明、运行启动和安装闭包。存在 ./cordis 不证明独立安装成立。

## 契约

<!-- documentation:placeholder -->

链接公开类型、必要校验及唯一行为正文。类型外行为由 SPEC.md 拥有，公开定义的导航在 docs/public-api.md。说明错误、生命周期与资源责任的拥有者，不复制签名或状态机。

## 设计

<!-- documentation:placeholder -->

概述内部模块和关键不变量的拥有者。完整设计写在 docs/architecture.md、docs/flows.md 与 docs/object-model.md。

## 配置与运行

<!-- documentation:placeholder -->

填写配置拥有者、默认行为、环境前提和显式依赖。说明调用者与包各自的运行责任。

## 验证

<!-- documentation:placeholder -->

填写可复跑命令、性质、前提和未覆盖。提供有实际断言的测试。结构通过不表示业务行为已验证。

## 维护

<!-- documentation:placeholder -->

说明公开契约、资源或依赖变化时必须同步的消费者和验证入口。信息不适用时写明理由，未知时登记具名缺口。

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
