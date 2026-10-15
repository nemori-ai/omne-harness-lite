# 系统公开契约

本成员拥有治理公开协议 `governance-public/1` 的消息、`outcome` 和操作规则。依据是 Issue 274 修订 1 的已接受候选。身份和授权的业务事实仍归 identity 与 authorization。

本目录已有 workspace 草稿。`src/index.ts` 不导出治理操作。文档不表示运行实现已经存在。

## 阅读路径

调用者和两端实现者先读[行为规格](SPEC.md)。SDK 与服务端接入使用该规格里的同一张结果表，不另写结果含义。内部结构见[内部设计](docs/internals.md)。

## 使用

请求和响应都是一个 JSON 对象。唯一协议版本是 `governance-public/1`。每个操作的登录证明和行事租户是必填还是禁止，写在行为规格的字段表里。

撤销本账号的一份登录时不带行事租户。

```ts
governanceOperation({
  protocolVersion: "governance-public/1",
  messageId: "caller-generated",
  operation: "revoke-login",
  loginProof: proof,
  body: { targetLoginId },
});
```

这个函数现在不是本包的导出。它只说明调用形状。

## 验证

本阶段核对的是规格是否让同一输入只有一个对外结果。实现测试未运行。`tests/public-entry.spec.ts` 仍只核对包的公开导出是否为空。集成测试和端到端测试不适用，因为还没有治理服务器。

长期个人负责人尚未具名。
