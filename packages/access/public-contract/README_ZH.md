# 系统公开契约

[English](README.md)

本成员提供 `governance-public/1` 的纯编解码函数。客户端和服务端适配共同消费请求、响应与拒绝规则。

## 职责与状态

本成员实现34项治理请求操作，并识别4项本阶段不提供的操作。[行为规格](SPEC.md)拥有规则。[主入口](src/index.ts)导出四个函数及其输入、结果类型。[消息类型](src/messages.ts)把操作与允许的结果和正文关联。

本成员不核验身份、不判断授权、不执行业务，也不选择传输。identity和authorization继续拥有业务责任。SDK和server-entry仍是独立消费者，各自承担后续交付义务。

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

示例预算由调用者选择，本包没有默认预算。`readGovernanceResponse`接收原操作与预期messageId，先完整校验响应，再匹配关联。业务结果通过带原操作的`encodeGovernanceResponse`编码。共同拒绝重载无须operation，只接受`protocol-rejected`或`stage-not-provided`。

必填登录证明在本地为`ProofInput`。缺失和空字符串保留为不同协议读取状态，交业务拥有者核验。身份字段使用legal-identity铸造的纯值，时间字段使用utc-instant纯值。租户同时保留组织和账号。parameters使用json-text树，保留数字原始lexeme。

## 契约

[公开编解码条款](SPEC.md#公开编解码入口与实现细化)定义检查顺序、封闭字段、预算、关联与诊断。四个函数同步执行，没有外部副作用。无效编程参数抛固定`TypeError`，无效请求或响应模型返回`invalid`。诊断只有有限code，不含凭据、证明、输入路径或原始字节。

读出请求只证明协议合规。读出响应只证明该操作的结果形状与关联合规。它们不证明业务授权或耐久提交。

## 设计

[内部设计](docs/internals.md)说明封闭操作表、线上转换和重复键关联扫描。严格json-text读取是业务数据的唯一来源。只有重复键失败才补扫，补扫只恢复唯一根messageId，完整验证语法并执行同一组六预算。

运行时只依赖json-text、legal-identity、utc-instant和jsonc-parser。本包没有Cordis入口或生命周期资源。打包文件只含dist，source导出条件供工作区开发，独立消费者使用import和types条件。

## 配置与运行

运行环境为Node.js 24及以上。每次调用显式提供六项正安全整数预算。本包不读环境变量、时钟、数据库或网络。对象模型必须使用自有、可枚举的数据属性，不执行getter或toJSON。字节预算限制接纳的文档大小，不保证进程内存上限。

## 验证

在仓库根按顺序运行：

```sh
pnpm --filter '@omne-harness/public-contract...' build
pnpm --filter @omne-harness/public-contract typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/public-contract test
```

测试消费主exports。protocol.spec.ts验证共同边界与两端演示。correlation.spec.ts覆盖后缀语法、六预算和深层输入。operations.spec.ts与responses.spec.ts覆盖所有操作、封闭正文、终结、名单和秘密排除。public-consumption.spec-d.ts验证操作关联类型。

fixtures/client.ts与fixtures/server.ts各自只从包名消费。install-closure.spec.ts打包本包及三个workspace纯依赖，建立干净安装，编译两端并通过Node运行dist。安装测试需要pnpm，以及可用的jsonc-parser注册表或缓存。测试清理临时安装，把闭包记录写入任务tmp证据目录。fixtures/profile.mjs从dist入口观察有界负载。

这些检查覆盖纯协议与独立制品消费。真实传输、登录、授权、存储和完整治理旅程仍由各自拥有者验证。

## 维护

消息类型、操作规则、编解码与SPEC同步维护。协议变更须同步两端fixture、类型反例及完整操作矩阵。依赖变化后重验安装闭包。SDK与server-entry分别迁移其后续运行时消费者。
