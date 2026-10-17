# 系统公开契约

本成员拥有治理公开协议 `governance-public/1` 的消息、`outcome` 和操作规则。身份和授权的业务事实仍归 identity 与 authorization。

## 阅读路径

调用者和两端实现者先读[行为规格](SPEC.md)。SDK 与服务端接入使用该规格里的同一张结果表，不另写结果含义。内部结构见[内部设计](docs/internals.md)。

## 使用

请求和响应都是一个 JSON 对象。唯一协议版本是 `governance-public/1`。每个操作的登录证明和行事租户是必填还是禁止，写在行为规格的字段表里。

撤销本账号的一份登录时不带行事租户。`messageId` 由调用者生成。

```ts
governanceOperation({
  protocolVersion: "governance-public/1",
  messageId: "caller-generated",
  operation: "revoke-login",
  loginProof: proof,
  body: { targetLoginId },
});
```

## 验证

同一输入只有一个对外结果。结果句子在行为规格。`tests/public-entry.spec.ts` 核对当前公开导出。

## English promise

This member owns governance message `governance-public/1`. Identity and authorization own the business facts. Callers read `SPEC.md` for fields and outcomes. One input has one outcome.
