# 系统接入能力组

本组维护完整 Harness 的公开接入工程关系。三个成员都在 workspace 内，都已实现并有持续的测试。依据为[系统分层](../../docs/architecture/layers-and-dependencies.md)和[目标包组织](../../docs/package-organization.md#sdk与系统接入)。

## 责任与范围

公开契约承接两端共同的操作、数据、事件、错误与边界行为。SDK 承接客户端统一入口。服务端接入承接协议输入、身份材料、请求分派和结果交付。三者的分工是：谁定义线上的字节，谁在客户端构造和解释它们，谁在服务端读取和应答它们。

业务含义与权威事实仍归各能力。身份、授权与 Session 的规则归它们的拥有者。传输方式、首批操作和客户端环境仍在细化，未定的部分以各成员的行为规格为准。

## 成员与依赖

| 成员 | 做什么 | 公开入口 |
| --- | --- | --- |
| [`public-contract`](public-contract/README.md) | `governance-public/1` 与 `session-public/1` 两个协议的纯编解码。定义请求、响应、`outcome` 与拒绝规则，把对象与字节互转。 | 八个同步编解码函数与它们的类型 |
| [`sdk`](sdk/README.md) | 客户端入口。持有调用者的传输适配，编码请求，发送，只交出 `messageId` 相同的响应，零字节时自动再送一次。 | `createGovernanceClient`、`createSessionClient`、`createHttpTransport`，以及租户与用户消息的辅助函数 |
| [`server-entry`](server-entry/README.md) | 服务端 HTTP 入口。在回环地址上监听，读取公开契约的消息，识别登录，调用 identity 与 Session，写出响应与 SSE 观察流。 | `createServerEntry({ config, dependencies })` |

依赖方向：

- SDK 依赖公开契约。SDK 重新导出调用者需要的公开类型与编码入口。
- 服务端接入依赖公开契约，并向 identity 与 Session 的公开入口发起调用。
- 公开契约不依赖 SDK，也不依赖服务端接入。
- SDK 不依赖服务端私有实现、存储或 Cordis 装配树。
- 业务能力不反向依赖 SDK 或传输处理器。独立能力从自身公开入口消费。

## 关键协作

一次调用经过三个成员。客户端经 SDK 表达操作并处理结果。SDK 按公开契约编码请求字节，交给传输适配。服务端接入按同一契约解释字节，把通过协议检查的请求交给 identity 与 Session，再把结果编码成响应。SDK 读回响应，按 `messageId` 关联到本次调用。

结果含义只有一份，在公开契约。SDK 不解释 `outcome`，服务端接入不改写 identity 与 Session 返回的 `denied` 和 `basis-unavailable`。入口的身份校验不替代能力授权。

连接中断或结果未知时，任何一方都不得推断动作未执行。客户端得到 `uncertain`，服务端把自身故障报成空正文的 500。

## 组合验证

三者的组合性质：两端用同一份契约编解码，同一份语义得到同一种线上表示；登录证明只出现在消息体里，任何错误文本和输出都不含它；未知结果不会被当成失败或成功。

每个成员验证自己负责的性质：

- 公开契约用自己的用例矩阵、类型反例和两个独立消费者的安装闭包。
- SDK 用真实回环 HTTP 服务器验证传输适配、响应关联与再送。
- 服务端接入用真实回环 HTTP 验证入口、状态码映射、`denied` 的一致性与观察流。

跨成员的端到端核对在真实服务端接入与真实 Session 就位后进行。当前没有这一层的执行资源或通过证据。检查依据见[系统分层的偏离检查](../../docs/architecture/layers-and-dependencies.md#偏离检查与维护责任)。

## 维护

改公开操作时，契约拥有者先确认业务拥有者与消费者，再同步 SDK、接入适配及验证。改传输或发布范围时核对实际应用与依赖闭包。组技术拥有者维护成员关系，成员契约拥有者维护精确行为。

建包前按[成员文档规范](../../docs/member-documentation.md)和[开发指南](../../docs/development.md#创建和整改产品包)准入。文档落位不授予技术采用。

根目录的 `documentation.json` 把本页登记为必选的组文档，要求上面五节。新增或删除小节时，同时改登记。

本组的成员各有一份 README.md 与一份 README_ZH.md，两者表达同一份承诺，修改时同步。
