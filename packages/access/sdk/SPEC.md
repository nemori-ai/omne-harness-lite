# 客户端 SDK 行为规格

本页拥有治理协议和会话协议的客户端职责。消息字段和 `outcome` 的含义只归[公开契约](../public-contract/SPEC.md)。路径、方法、状态码、SSE 格式和两端共用的[客户端规则](../public-contract/docs/http-binding.md#客户端规则)只归[承载绑定页](../public-contract/docs/http-binding.md)。SDK 引用那一页，不复制它。

下列条款是 #978 波 1 设计点 DP-2 的候选，待批复，尚未被接受：本段第一段对会话协议和承载页的引用、「[会话客户端](#会话客户端)」与「[HTTP 传输适配](#http-传输适配)」两节、「[自动再送与缓存](#自动再送与缓存)」中把规则扩到会话操作的两句、「[验证](#验证)」一节中会话客户端与 HTTP 适配的验证义务、「[已知限制](#已知限制)」整节。其余条款保持原有的采用状态。

## 客户端职责

SDK 是调用者使用完整 Harness 治理消息的客户端入口。它持有调用者提供的传输适配，以及调用者交给它的登录证明。它把请求交给传输适配。它只把带有相同 `messageId` 的响应交给该次调用。没有 `messageId` 的 `protocol-rejected` 不记到任何一次调用上。该次调用的字节可能已经发出时，调用者仍没有可信答复。

注册和签发登录之前，调用者必须已经选定对端信任材料。信任核验失败时，SDK 不发送凭据或登录证明。

SDK 对同一个 `outcome` 使用公开契约里的解释。它不另定拒绝原因，也不把超时写成没有业务效果。

## 会话客户端

会话客户端使用公开契约的会话一组编解码函数。它发送 `session-public/1` 的消息，覆盖公开契约的七个会话操作。两个观察操作和观察客户端在后续波。公开契约的会话编解码函数不读写观察消息，所以公开契约提供观察消息的函数之前，SDK 不发观察操作。

- 会话客户端只把带有相同 `messageId` 的响应交给该次调用，规则同治理客户端。
- 会话客户端把 `loginProof` 放进消息体。它不把登录证明写进 HTTP 头、日志或错误文本。
- 调用者在首次发送前生成 `createCallId`、`acceptId`、`inputId` 和 `controlId`，并在重试同一意图时保持不变。SDK 不替调用者换这些标识。`messageId` 不在此列。它只关联一次发送，不是去重键，调用者每次调用可以生成新的 `messageId`，见公开契约的[共同消息](../public-contract/SPEC.md#共同消息)。SDK 的自动再送发送同一份字节，所以沿用同一个 `messageId`。
- 调用者不填写 `SessionOperationId`、登录或操作身份。SDK 不提供这样的参数。
- 会话操作得到 `unknown`，或没有收到可信答复时，SDK 把它交给调用者。再送和认回由调用者发起，规则见承载页的客户端规则。
- SDK 重新导出调用者构造请求所需的公开契约类型与编码入口。CLI 因此只依赖 SDK，不直接导入公开契约。

```ts
type SessionClient = {
  submit(message: unknown): Promise<CallerResult>;
};
```

`SessionClient` 与 `GovernanceClient` 对称，由同一个传输适配构造。上面是设计形状，本包现在不导出它。

## HTTP 传输适配

SDK 提供一个基于 `fetch` 的 HTTP 传输适配，实现 `GovernanceTransport` 的形状。该形状对两个位置通用。CLI 通过它发请求，不自己写 HTTP。调用者仍然可以交入自己的传输适配。

适配按[承载绑定表](../public-contract/docs/http-binding.md#承载绑定表)工作。

- 适配实例绑定一个位置和一个服务地址。它向该位置的固定路径发 POST。
- 适配不跟随重定向。登录证明在请求体里，重定向会把它送到别处。
- 适配按响应的 `Content-Type` 选择读取方式。响应是 JSON 时，无论状态码是什么，适配把完整的响应体字节作为 `response` 交出。所以 `unknown` 的状态 500 作为一条可读消息交给客户端。客户端再按 `messageId` 核对，读不出匹配的消息时，结果是 `uncertain`。
- 适配在下列情况报告 `not-sent`：连接在写出任何请求字节之前失败（连接被拒、地址不可达、连接超时），或调用者在请求开始前取消。
- 其他失败都报告 `uncertain`：已经写出部分请求字节后失败、响应体为空（例如 404、405、421 和响应体为空的 500）、响应不是 JSON，以及响应中途断开。

```ts
type HttpTransportOptions = {
  origin: string;
  location: "governance" | "session";
};

function createHttpTransport(options: HttpTransportOptions): GovernanceTransport;
```

上面是设计形状，本包现在不导出它。

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
- 状态 500 且响应体是匹配的 `unknown` 消息时，调用者得到 `response`，`outcome` 是 `unknown`。响应体为空的 500 得到 `uncertain`。
- 任何输出、日志和错误文本都不含登录证明与凭据。

## 已知限制

- M2 的适配只接受 `127.0.0.1` 或 `localhost` 上的 `http:` 地址。其他地址的构造失败，包括 `https:`。这是 M2 的范围限制，不是登录证明的保护规则。M2 的服务只在回环地址上提供明文，见承载页的[已知限制](../public-contract/docs/http-binding.md#已知限制)。远程访问或 TLS 进入范围时，适配的这条限制随之改。
- 「[客户端职责](#客户端职责)」要求注册和签发登录之前选定对端信任材料。M2 的明文回环连接没有可以核验的信任材料。M2 用上一条的回环地址限制代替这项核验，适配不要求调用者给出信任材料。TLS 进入范围时，这项核验随之生效。
- M2 部署对 32 个治理操作答 `stage-not-provided`，这是服务端接入的[治理位置的偏离](../server-entry/SPEC.md#治理位置的偏离)。公开契约的 `readGovernanceResponse` 读不出这些响应，所以 SDK 的调用者发这些操作时得到 `uncertain`。偏离闭合后，这条限制随之消失。
- 会话观察客户端不在波 1。
