# 客户端 SDK 行为规格

本页拥有治理协议的客户端职责。消息字段和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。

## 客户端职责

SDK 是调用者使用完整 Harness 治理消息的客户端入口。它持有调用者提供的传输适配，以及调用者交给它的登录证明。它把请求交给传输适配。它只把带有相同 `messageId` 的响应交给该次调用。没有 `messageId` 的 `protocol-rejected` 不记到任何一次调用上。该次调用的字节可能已经发出时，调用者仍没有可信答复。

注册和签发登录之前，调用者必须已经选定对端信任材料。信任核验失败时，SDK 不发送凭据或登录证明。

SDK 对同一个 `outcome` 使用公开契约里的解释。它不另定拒绝原因，也不把超时写成没有业务效果。

## 自动再送与缓存

本页每一个治理操作都使用这一条再送规则。传输适配报告请求字节没有发出时，SDK 自动再送一次。字节已经发出，或适配不能证明没有发出时，SDK 不自动再送。未知效果不能靠这次再送重做。调用者自己发起的下一次调用是一次新调用，并遵守该操作自己的重复规则。

SDK 不缓存准入允许、登录证明或凭据。它不提供 `prefer-copy`。客户端应用可以保存屏幕投影。投影失败不改变已经返回的 `succeeded`。清掉投影不把 `unknown` 变成成功或没有发生。

这些治理调用不刷新登录的空闲计时。`public-health` 不带登录证明，也不带行事租户。

## 安装闭包

SDK 依赖公开契约，以及调用者提供的传输适配接口。它不依赖服务端接入。它不依赖服务器存储类型。

安装闭包以 SDK 发布产物的依赖清单为准。源码能够编译不能代替该清单。

## 设计签名

下面的类型和函数是设计形状。本包不导出它们。它们不是已经可安装的调用。

消息对象仍是公开契约里的请求和响应。本页不另写字段或 `outcome`。

```ts
type TransportReport =
  | { kind: "response"; bytes: Uint8Array }
  | { kind: "not-sent" }
  | { kind: "uncertain" };

type GovernanceTransport = {
  send(bytes: Uint8Array): Promise<TransportReport>;
};

type CallerResult =
  | { kind: "response"; message: unknown }
  | { kind: "uncertain" };

type GovernanceClient = {
  submit(message: unknown): Promise<CallerResult>;
};
```

`GovernanceTransport` 由调用者交入。`submit` 接收公开契约的共同消息，并带上这次发送的 `messageId`。传输字节先按公开契约读取，再核对这个 `messageId`。对上了才成为 `response`。读不出，或 `messageId` 不是这一次，结果是 `uncertain`，不再交成 `response`。

```ts
type ReadReport =
  | { kind: "message"; messageId?: string }
  | { kind: "unreadable" };

async function submitOnce(
  transport: GovernanceTransport,
  bytes: Uint8Array,
  expectedMessageId: string,
  readPublicContract: (input: Uint8Array) => ReadReport,
): Promise<CallerResult> {
  const matched = (report: TransportReport): CallerResult | undefined => {
    if (report.kind !== "response") return undefined;
    const read = readPublicContract(report.bytes);
    if (read.kind !== "message" || read.messageId !== expectedMessageId) {
      return { kind: "uncertain" };
    }
    return { kind: "response", message: read };
  };
  const first = await transport.send(bytes);
  if (first.kind === "uncertain") return { kind: "uncertain" };
  const firstResult = matched(first);
  if (firstResult) return firstResult;
  const second = await transport.send(bytes);
  const secondResult = matched(second);
  if (secondResult) return secondResult;
  return { kind: "uncertain" };
}
```

`readPublicContract` 表示公开契约的严格读取。本页不实现解析器。适配报告 `not-sent` 时，`matched` 没有结果，函数再送一次。第二次仍是 `not-sent`，或任一次报告 `uncertain`，调用者得到 `uncertain`。`uncertain` 不是业务成功，也不是没有发生。

```ts
function revokeOwnLogin(
  client: GovernanceClient,
  proof: string,
  targetLoginId: string,
): Promise<CallerResult> {
  return client.submit({
    protocolVersion: "governance-public/1",
    messageId: "caller-generated",
    operation: "revoke-login",
    loginProof: proof,
    body: { targetLoginId },
  });
}
```

`messageId` 的值只是占位。`revoke-login` 的字段表禁止行事租户。这个调用不带 `actingTenant`。字段表写明必填的操作才带上当前选择。

## 验证

SDK 不另写结果含义。必须遵守的客户端规则是自动再送条件和不缓存允许。下列输入的结果以公开契约为准。

- 字段表要求登录证明时，缺失或空字符串只有 `denied`。字段表禁止该字段时，出现该字段是 `protocol-rejected`。
- 留存期内的接续在激活完成时是 `succeeded`。已经激活后再注册是 `not-loginable`。
- 陌生账号接受邀请是 `not-visible`。过期且有权看见的邀请返回已有的过期终结。看不见时是 `not-visible`。
- `query-current-tenant` 不带行事租户。
- `issue-login` 的 `basis-unavailable` 不来自凭据已匹配的分支。
- 版本是 `governance-public/1` 时，`disable-subject`、`restore-subject`、`end-subject` 和 `reopen-after-media-loss` 在坏正文和坏证明下都是 `stage-not-provided`。版本不是 `governance-public/1` 时是 `protocol-rejected`。

