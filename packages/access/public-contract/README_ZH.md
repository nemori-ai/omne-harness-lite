# 系统公开契约

[English](README.md)

`governance-public/1` 与 `session-public/1` 两个协议的纯编解码。它把请求或响应对象转成字节并转回，读取时校验整份文档。客户端与服务端适配共用本包，就共用同一套消息、`outcome` 与拒绝规则，不必各写一份。SDK 与服务端接入是它的前两个消费者。

## 职责与状态

本成员实现 37 项治理请求操作（其中 3 项管理行事租户的模型凭据）与 7 项会话操作，含会话中断的 `cancel-run` 与 `stop-call`。它还识别 4 项本阶段不提供的治理操作。[行为规格](SPEC.md) 拥有规则。[主入口](src/index.ts) 导出八个协议函数及其输入、结果类型，两种协议各四个，另导出租户、组织、账号、登录状态的[身份文本函数](SPEC.md#身份值的文本)八个。[治理消息类型](src/messages.ts) 与[会话消息类型](src/session-messages.ts) 把操作与允许的结果和正文关联。[公开接口导航](docs/public-api.md) 索引全部导出。

本成员不核验身份、不判断授权、不执行业务，也不选择传输保护协议。[承载绑定](docs/http-binding.md) 写两个位置的 HTTP 与 SSE 承载。identity 与 authorization 继续拥有身份、授权与业务操作的责任。Session 继续拥有会话业务规则。SDK 和 server-entry 是独立消费者，各自承担后续交付义务。

## 使用

```ts
import { encodeGovernanceRequest, readGovernanceRequest } from '@omne-harness/public-contract'

const limits = {
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 4_096,
  maxMembers: 256,
  maxStringLength: 8_192,
  maxNumberLength: 128,
}
const encoded = encodeGovernanceRequest({
  request: {
    protocolVersion: 'governance-public/1',
    messageId: 'caller-generated',
    operation: 'public-health',
    body: {},
  },
  limits,
})
if (encoded.kind === 'encoded') {
  const received = readGovernanceRequest({ bytes: encoded.bytes, limits })
  // received.kind 为 request、protocol-rejected 或 stage-not-provided。
}
```

示例预算由调用者选择，本包没有默认预算。`readGovernanceResponse` 接收原操作与预期 messageId，先完整校验响应，再匹配关联。业务结果用带原操作的 `encodeGovernanceResponse` 编码。共同拒绝的重载不接收 operation，只接受 `protocol-rejected` 或 `stage-not-provided`。每个治理操作的响应也允许空 `body` 的 `stage-not-provided`，因为部署可以声明某个操作不提供。请求读取不知道这份声明。

必填登录证明在本地为 `ProofInput`。缺失和空字符串保留为不同的协议状态，交业务拥有者核验。身份字段使用 legal-identity 铸造的值，时间字段使用 utc-instant 值。租户同时保留组织和账号。parameters 使用 json-text 树，保留数字的原始 lexeme。

## 契约

[公开编解码条款](SPEC.md#公开编解码入口与实现细化)定义检查顺序、封闭字段、预算、关联与诊断。[会话编解码条款](SPEC.md#会话编解码函数)把同一组规则用于会话一组，并写明第 1 步中哪些检查归服务端接入。八个函数同步执行，没有外部副作用。无效编程参数抛固定的 `TypeError`，无效请求或响应模型返回 `invalid`。诊断只有有限的 code，不含凭据、证明、输入路径或原始字节。

稳定的承诺是八个协议函数、八个身份文本函数、它们的输入与结果类型，以及两个协议的操作、结果与正文形状。改动其中任何一项都是协议变更。

读出请求只证明协议合规。对会话请求，这只覆盖第 1 步中本成员负责的检查：`message` 只核到 JSON 对象与 `role` 为 `user`，完整的消息解码由服务端接入完成。读出响应只证明该操作的结果形状与关联合规。它们都不证明业务授权或耐久提交。

实现细节可以改变：内部模块划分、已写明集合之外的诊断 code，以及解析策略。

## 设计

[内部设计](docs/internals.md)说明封闭操作表、线上转换和重复键关联扫描。严格 json-text 读取是业务数据的唯一来源。只有重复键失败才补扫，补扫只恢复唯一的根 messageId，完整验证语法并执行同一组六预算。

运行时依赖 json-text、legal-identity、utc-instant 和 jsonc-parser。本包没有 Cordis 入口或生命周期资源。打包文件只含 `dist`，`source` 导出条件供工作区开发，独立消费者使用 `import` 与 `types` 条件。

## 配置与运行

运行环境为 Node.js 24 及以上。每次调用显式提供六项正安全整数预算。本包不读环境变量、时钟、数据库或网络。对象模型必须使用自有、可枚举的数据属性，不执行 getter 或 toJSON。字节预算限制接纳的文档大小，不限制进程总内存。

## 验证

在仓库根按顺序运行：

```sh
pnpm --filter '@omne-harness/public-contract...' build
pnpm --filter @omne-harness/public-contract typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/public-contract test
```

测试消费公开导出。`protocol.spec.ts` 验证共同边界与两端演示。`correlation.spec.ts` 覆盖后缀语法、六项预算和深层输入。`operations.spec.ts` 与 `responses.spec.ts` 覆盖所有操作、封闭正文、终结、名单、秘密排除、部署声明不提供的应答，以及 `issue-login` 可选的 `loginId`。`public-consumption.spec-d.ts` 验证操作关联的类型。`identity-text.spec.ts` 覆盖每个身份文本函数的往返与非法文本、租户文本的严格规则，以及与消息编解码的一致。

`session-protocol.spec.ts` 用正反向量覆盖 `readSessionRequest` 负责的第 1 步规则。其中 `message` 只覆盖对象与 `role` 的检查，不含完整消息解码。它还覆盖两个位置上的跨版本拒绝。`session-responses.spec.ts` 覆盖每个会话操作的每个结果、封闭正文、历史页、`unmatched`、`unreadable` 与共同拒绝的重载。`session-consumption.spec-d.ts` 验证会话操作、正文与结果的类型。`session-control-protocol.spec.ts`、`session-control-responses.spec.ts` 与 `session-control-consumption.spec-d.ts` 覆盖 `cancel-run` 与 `stop-call` 的请求、结果集合、成功正文与类型，每条用例只违反一条规则。本成员不把 Session 结果映射为线上结果，也不派生操作身份，两者归服务端接入。

`fixtures/client.ts` 与 `fixtures/server.ts` 各自只从包名消费。两个 fixture 各有一次治理往返和一次会话往返。`install-closure.spec.ts` 打包本包及三个工作区依赖，建立干净安装，编译两端，并通过 Node 在 `dist` 上运行两次往返。安装测试需要 pnpm，以及可用的 jsonc-parser 注册表或缓存。测试清理临时安装，把闭包记录写入任务的临时证据目录。`fixtures/profile.mjs` 从 `dist` 入口观察有界负载。

这些检查覆盖纯协议与独立制品消费。真实传输、登录、授权、存储、Session 调用，以及完整的治理与会话旅程仍由各自拥有者验证。

## 维护

消息类型、操作规则、编解码与 SPEC 同步维护。协议变更须同步两端 fixture、类型反例及完整操作矩阵。依赖变化后重验安装闭包。SDK 与 server-entry 分别迁移其运行时消费者。

本文件与 [README.md](README.md) 保持同步。两个文件表达同一份承诺。
