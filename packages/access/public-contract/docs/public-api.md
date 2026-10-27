# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，不手写第二套签名。行为正文归 [SPEC.md](../SPEC.md)。

## 导出入口

`package.json` 的 `exports` 只有入口 `.`。`source` 条件指向 [src/index.ts](../src/index.ts)，供工作区开发使用。独立消费者使用 `types` 与 `import` 条件，它们指向 `dist`。

调用者不需要资格。客户端 SDK 与服务端接入都按包名 `@omne-harness/public-contract` 导入。运行时导出恰为八个函数：治理一组四个，会话一组四个。[tests/public-entry.spec.ts](../tests/public-entry.spec.ts) 检查这个清单。其余导出都是类型。本包不导出 `./testing`，也不导出业务提供者。

## 定义索引

| 导出 | 种类 | 定义位置 |
| --- | --- | --- |
| `readGovernanceRequest`、`readGovernanceResponse`、`encodeGovernanceRequest`、`encodeGovernanceResponse` | 函数 | [src/codec.ts](../src/codec.ts) |
| `GovernanceProvidedOperation`、`GovernanceStageOperation`、`GovernanceOperation`、`GovernanceRequest`、`GovernanceResponse`、`ProofInput` | 类型 | [src/messages.ts](../src/messages.ts) |
| `GovernanceProtocolRejected`、`GovernanceStageNotProvided`、`GovernanceProtocolResult` | 类型 | [src/messages.ts](../src/messages.ts) |
| `GovernanceCodecLimits`、`GovernanceDiagnostic`、`GovernanceRequestRead`、`GovernanceResponseRead`、`GovernanceEncodeResult`、`GovernanceResponseEncodeInput` | 类型 | [src/messages.ts](../src/messages.ts) |
| `readSessionRequest`、`readSessionResponse`、`encodeSessionRequest`、`encodeSessionResponse` | 函数 | [src/session-codec.ts](../src/session-codec.ts) |
| `SessionOperation`、`SessionRequestBodies`、`SessionRequest`、`SessionOutcomes`、`SessionSuccessBodies`、`SessionResponse` | 类型 | [src/session-messages.ts](../src/session-messages.ts) |
| `SessionProtocolRejected`、`SessionHistoryEntry`、`SessionHistoryPage` | 类型 | [src/session-messages.ts](../src/session-messages.ts) |
| `SessionCodecLimits`、`SessionDiagnostic`、`SessionRequestRead`、`SessionResponseRead`、`SessionEncodeResult`、`SessionResponseEncodeInput` | 类型 | [src/session-messages.ts](../src/session-messages.ts) |

`SessionCodecLimits`、`SessionDiagnostic` 与 `SessionEncodeResult` 分别是治理一组同名类型的别名。两组共用 `ProofInput`。

[api/public-contract.api.md](../api/public-contract.api.md) 是从 `dist` 声明生成的签名快照。在仓库根运行 `pnpm run contract:api --write` 重新生成它，不手改。

## 输入输出与失败行为

| 要查的内容 | 正文位置 |
| --- | --- |
| 治理消息的字段、`outcome`、判断次序与 body | [SPEC.md 共同消息](../SPEC.md#共同消息)至[本阶段不提供的操作](../SPEC.md#本阶段不提供的操作) |
| 会话消息的版本、信封、body、判断次序、结果与历史页 | [SPEC.md 会话公开操作](../SPEC.md#会话公开操作) |
| 治理四函数的参数与可见结果、预算与编程错误 | [SPEC.md 操作集合与函数](../SPEC.md#操作集合与函数) |
| 会话四函数的参数与可见结果，以及与服务端接入的责任划分 | [SPEC.md 会话编解码函数](../SPEC.md#会话编解码函数) |
| 本地值与线上表示、输入反射与诊断 | [SPEC.md 本地值与线上表示](../SPEC.md#本地值与线上表示) |
| 响应 body 闭合、`messageId` 关联与重复键补扫 | [SPEC.md 结果闭合与关联](../SPEC.md#结果闭合与关联) |
| 内部模块、规则表与关联读取的实现 | [内部设计](internals.md) |

八个函数都同步执行，没有外部副作用。下面是非规范的摘要，规则以 [治理函数表](../SPEC.md#操作集合与函数)与[会话函数表](../SPEC.md#会话编解码函数)为准：

- 编程错误抛出固定 `TypeError`，错误不含输入值。
- 本地模型无效时，编码函数返回 `invalid` 和有限诊断 code。
- 请求读取在消息不合规时返回 `protocol-rejected`。只有治理一组在阶段操作上返回 `stage-not-provided`。
- 响应读取在消息不合规时返回 `unreadable`，在合法响应的关联值不同或没有关联值时返回 `unmatched`。
- `readSessionRequest` 对 `message` 只核对 JSON 对象与 `role` 为 `user`。完整的消息解码归服务端接入。

## 验证

[README](../README_ZH.md#验证) 列出验证命令与各测试文件的覆盖范围。
