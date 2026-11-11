# @omne-harness/tool-definitions

[English](README.md)

## 职责与状态

本包提供 Files 与 Shell 纯根作者，经已限权设施执行。独立 Tool 调用已实现。生产 Cordis 绑定与真实后端组合验证由父线继续交付。

## 使用

导入 createFilesAuthor 或 createShellAuthor，传入显式 JsonValue 配置。完整方式见[使用说明](docs/context.md)与可运行的[测试驱动](tests/run-author.ts)。

## 契约

[公开源码](src/index.ts)拥有类型，[SPEC](SPEC.md)拥有行为、失败与资源责任。[公开接口](docs/public-api.md)导航实际定义。

## 设计

同一命令表供声明、校验与 help 使用。Files 先预检再写入。Shell 使用精确的 command 或 terminal 门面。理由见[内部架构](docs/architecture.md)。

## 配置与运行

resultMaxBytes 必填。Shell 另需 executable、argsPrefix、cwd 与 env。Files 可选绝对路径 cwd，相对路径在调用设施之前按它解析（R2-D290）。调用者提供当前授权和落点事实。作者不读取宿主默认值。

## 验证

运行本成员 build、typecheck、test。[成员测试](tests/README.md)使用公开作者、真实 Tool 作用域及非耐久设施，不证明真实文件系统、PTY 或生产授权。

## 维护

修改命令时同步同一张表与行为测试。修改环境门面时协调宿主消费者。未完成绑定见 [Cordis](docs/cordis.md)。

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

## TodoItems

`createTodoItemsAuthor` 与 `todoItemsToolModule` 提供 help、add、remove、mark_complete、list，采用 wrapped 单声明。构造值只有正安全整数 `resultMaxBytes`，environment 为 null。

宿主在 `attachToolsCapability` 之后调用 `attachTodoItems`，两种附着使用最终的同一个 context。finish 在清理前撤除访问，重复调用返回同一 Promise。[窄口](src/todo-items-port.ts)只接收绑定后的业务参数。

结果 JSON 完整保留 Session 回执、页面、游标和失败。提交未知时保留原操作。输出超预算明确答 unavailable，并提示减小页长。1 MiB 是部署初始预算，控制字符的 JSON 转义可能扩大字节数，因此不保证容纳所有合法页面。过小预算会明确触发输出校验失败。

[作者测试](tests/todo-items.spec.ts)使用绑定替身，通过真实 Tool 解码、执行与输出验证。它不证明 SQL 持久化、完整应用交付或自动 Context 投影。行为见 [SPEC](SPEC.md#todoitems-作者)。

## Web

`createWebAuthor` 与 `webToolModule` 提供 help、search、fetch，采用 wrapped 单声明。构造值只有正安全整数 `resultMaxBytes` 与 `maxSearchResults`，environment 为 null，本切片不声明设置项。

宿主在 `attachToolsCapability` 之后用一个 `WebAccess` 实现（[窄口](src/web-port.ts)）调用 `attachWebAccess`；作者看不到 key、供应商或租户。search 写标题、网址、日期与摘录，fetch 写最终网址、媒体类型与 Markdown 正文，网络内容放在外部数据标记之间。失败是 `WebFailure` 闭集里的一行 `<kind> reason=`；`unconfigured` 写明要配置 Web 的设置项 `exa.apiKey`。

[作者测试](tests/web.spec.ts)使用脚本化端口；网络提供者是 `@omne-harness/tool-host-local/web`。行为见 [SPEC](SPEC.md#web-作者)。
