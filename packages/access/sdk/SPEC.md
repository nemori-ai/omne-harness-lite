# 客户端 SDK 行为规格

本页拥有治理协议和会话协议的客户端职责。消息字段和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。路径、方法、状态码和 SSE 格式只归[承载绑定表](../server-entry/docs/http-binding.md#承载绑定表)。SDK 只引用那张表，不复制它。SDK 不导入 server-entry，这里只是文档引用。

## 客户端职责

SDK 是调用者使用完整 Harness 治理消息的客户端入口。它持有调用者提供的传输适配，以及调用者交给它的登录证明。它把请求交给传输适配。它只把带有相同 `messageId` 的响应交给该次调用。没有 `messageId` 的 `protocol-rejected` 不记到任何一次调用上。该次调用的字节可能已经发出时，调用者仍没有可信答复。

注册和签发登录之前，调用者必须已经选定对端信任材料。信任核验失败时，SDK 不发送凭据或登录证明。

SDK 对同一个 `outcome` 使用公开契约里的解释。它不另定拒绝原因，也不把超时写成没有业务效果。

## 会话客户端

会话客户端使用公开契约的会话一组编解码函数。它发送 `session-public/1` 的消息，覆盖公开契约的七个会话操作和 `cancel-observation`。`observe-session` 见[会话观察客户端](#会话观察客户端)。

- 会话客户端只把带有相同 `messageId` 的响应交给该次调用，规则同治理客户端。
- 会话客户端把 `loginProof` 放进消息体。它不把登录证明写进 HTTP 头、日志或错误文本。
- 调用者在首次发送前生成 `messageId`、`createCallId`、`acceptId`、`inputId`、`controlId` 和 `observationId`，并在重试时保持不变。SDK 不替调用者换标识，也不隐藏地重新生成它们。
- 调用者不填写 `SessionOperationId`、登录或操作身份。SDK 不提供这样的参数。服务端接入派生它们，规则见[派生规则](../server-entry/docs/http-binding.md#sessionoperationid-的派生规则)。
- `unsupported` 是最终结果。SDK 不对它再送。`stop-call` 的 Tool 目标得到它。
- SDK 不按状态码再送，也不按 `outcome` 再送。再送只按下一节的规则。
- 会话操作得到 `unknown`，或没有收到可信答复时，SDK 把它交给调用者。调用者用同一组标识原样再送，或用 `query-create-session`、`query-send-input` 认回。`cancel-run` 和 `stop-call` 用同一 `controlId` 原样再送。SDK 不替调用者做这些动作。

- SDK 重新导出调用者构造请求所需的公开契约类型与编码入口。CLI 因此只依赖 SDK，不直接导入公开契约。

```ts
type SessionClient = {
  submit(message: unknown): Promise<CallerResult>;
};
```

`SessionClient` 与 `GovernanceClient` 对称，由同一个传输适配构造。上面是设计形状，本包现在不导出它。

## HTTP 传输适配

SDK 提供一个基于 `fetch` 的 HTTP 传输适配，实现 `GovernanceTransport` 的形状。该形状对两个位置通用。CLI 通过它发请求，不自己写 HTTP。调用者仍然可以交入自己的传输适配。

适配按[承载绑定表](../server-entry/docs/http-binding.md#承载绑定表)工作。

- 适配实例绑定一个位置和一个服务地址。它向该位置的固定路径发 POST，内容类型是 `application/json`。
- 适配只接受 `127.0.0.1` 或 `localhost` 上的 `http:` 地址。其他地址的构造失败。原因是 M2 的传输是明文，见服务端接入的[已知限制](../server-entry/docs/http-binding.md#已知限制)。
- 适配不跟随重定向。登录证明在请求体里，重定向会把它送到别处。
- 适配按响应的 `Content-Type` 选择读取方式。JSON 响应的字节作为 `response`。SSE 响应交给观察客户端。
- 适配不用状态码判断业务含义。收到响应但读不出匹配的消息时，结果是 `uncertain`。
- 适配在下列情况报告 `not-sent`：连接在写出任何请求字节之前失败（连接被拒、地址不可达、连接超时），或调用者在请求开始前取消。其他失败都报告 `uncertain`，包括已经写出部分请求字节、收到状态 500、收到 404、405 或 421，以及响应中途断开。

```ts
type HttpTransportOptions = {
  origin: string;
  location: "governance" | "session";
};

function createHttpTransport(options: HttpTransportOptions): GovernanceTransport;
```

上面是设计形状，本包现在不导出它。

## 会话观察客户端

观察客户端是 AC-12，在波 D 实现。本波不实现，也不导出。下面写它的职责，让规格先完整。

- 观察客户端发送 `observe-session`，读取 SSE 响应。第一条事件是确认响应，之后的事件是 `observation-frame` 消息。
- 客户端忽略心跳注释行，不把它交给调用者。它不把心跳当作帧。
- 客户端为 SSE 解析器设缓冲上限，同时限制原始字节和事件队列。超限时，客户端关闭连接，并把观察交回调用者为本地未知。
- 连接断开使调用者本地保持未知。客户端不自动重连，也不自动发出任何其他公开操作。重连是调用者发起的新 `observe-session`，重连不重发原 Model 或 Tool 调用。
- 调用者取消观察有两种方式：中止连接，或用另一个连接发 `cancel-observation`。取消观察不是业务控制。
- 确认响应不是 `succeeded` 时，客户端把它作为这次调用的终端结果，不等待帧。

## 自动再送与缓存

本页每一个治理操作和会话操作都使用这一条再送规则。传输适配报告请求字节没有发出时，SDK 自动再送一次。字节已经发出，或适配不能证明没有发出时，SDK 不自动再送。未知效果不能靠这次再送重做。调用者自己发起的下一次调用是一次新调用，并遵守该操作自己的重复规则。

SDK 不缓存准入允许、登录证明或凭据。它不提供 `prefer-copy`。客户端应用可以保存屏幕投影。投影失败不改变已经返回的 `succeeded`。清掉投影不把 `unknown` 变成成功或没有发生。

这些治理调用和会话调用不刷新登录的空闲计时。`public-health` 不带登录证明，也不带行事租户。

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

type PublicResponse = {
  protocolVersion: string;
  messageId: string;
  outcome: string;
  body: unknown;
};

type CallerResult =
  | { kind: "response"; message: PublicResponse }
  | { kind: "uncertain" };

type GovernanceClient = {
  submit(message: unknown): Promise<CallerResult>;
};
```

`GovernanceTransport` 由调用者交入。`submit` 接收公开契约的共同消息，并带上这次发送的 `messageId`。传输字节先按公开契约读取，再核对这个 `messageId`。对上了才成为 `response`。读不出，或 `messageId` 不是这一次，结果是 `uncertain`，不再交成 `response`。

```ts
type ReadReport =
  | { kind: "message"; response: PublicResponse }
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
    if (read.kind !== "message" || read.response.messageId !== expectedMessageId) {
      return { kind: "uncertain" };
    }
    return { kind: "response", message: read.response };
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

`readPublicContract` 表示公开契约的严格读取。成功时 `response` 是那份共同响应，至少含 `protocolVersion`、`messageId`、`outcome` 和 `body`。`body` 里的结果字段仍只由公开契约定义。本页不实现解析器。核对通过后，调用者拿到的是这份 `response`，不是读取标签。适配报告 `not-sent` 时，`matched` 没有结果，函数再送一次。第二次仍是 `not-sent`，或任一次报告 `uncertain`，调用者得到 `uncertain`。`uncertain` 不是业务成功，也不是没有发生。

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

会话客户端与 HTTP 适配另有下列验证义务。

- 会话操作的往返用环回服务端替身通过，响应按 `messageId` 关联。
- 零字节再送只发生一次。写出部分字节后失败不再送。
- 非回环地址的构造失败。
- 重定向响应不被跟随，结果是 `uncertain`。
- 任何输出、日志和错误文本都不含登录证明与凭据。
