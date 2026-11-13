# @omne-harness/session-protocol 行为规格

本包是公开协议 `session/v1` 的协议契约：会话向客户端开放哪些操作和观察，每个操作收什么、答什么。它是纯数据，用共同契约的 `defineProtocol` 声明。精确类型由 [src/session-protocol.ts](src/session-protocol.ts) 的 `sessionProtocol` 推出，本文件只写类型以外的约定。

## 范围与依据

- 设计源：[RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md)「共同契约」「协议怎样划分」「会话观察」「成员怎么放，依赖方向」四节。成员落点与允许的依赖见[成员组织](../../../docs/package-organization.md)「`<领域>-protocol`」一行。
- 状态：候选。契约与用例已建；接入插件 `session-access`、客户端核心对它的消费、把会话观察接成帧来源都还没有做。
- 操作清单从哪来：现有家族 `session-public/1`（共同契约成员的 `session-rules.ts`、`session-messages.ts`）的八个操作，去掉 `read-session-diagnostics`（它归 `session-diagnostics/v1`）。不含 `list-sessions`：它还没有领域实现，做出来时在同一个主版本里加。

## 结果与不变量

<a id="operations"></a>**七个操作。** `create-session`、`query-create-session`、`send-input`、`query-send-input`、`read-history`、`cancel-run`、`stop-call`。三栏按 RFC-0015 第 7 节的规则机械地得到：

| 操作 | 身份要求 | 效果 | 体上限 |
| --- | --- | --- | --- |
| `create-session` | `acting-tenant` | `commit` | `small` |
| `query-create-session` | `login` | `read` | `small` |
| `send-input` | `login` | `commit` | `input` |
| `query-send-input` | `login` | `read` | `small` |
| `read-history` | `login` | `read` | `small` |
| `cancel-run` | `login` | `commit` | `small` |
| `stop-call` | `login` | `commit` | `small` |

七个操作与观察都标 `countsAsAccess`：答 `succeeded`（观察：建立成功）算一次业务访问。没有操作标 `carriesCredential`。

<a id="differences"></a>**和旧家族的四处差别。** 其余的消息体、成功体、结果集逐字段相同：

1. `create-session` 的 `definition` 可以不给。不给时取哪个定义是接入插件的行为，不在本契约里。
2. `defineProtocol` 给每个操作并进 `protocol-rejected`、`basis-unavailable`、`denied`，给提交类并进 `unknown`。旧家族的结果集本来就有后三个，所以实际多出来的只有 `protocol-rejected`。
3. 信封不在契约里：协议版本、消息编号、操作名、登录证明、行事租户归共同契约的外层。消息体里原有的目标租户（除 `create-session` 外的六个操作的 `tenant`）照旧在消息体里。
4. `query-create-session`、`query-send-input` 的效果是 `read`，但结果里手写了 `unknown`：查询本身可能答不出那次提交的结局，这是旧家族就有的结果。

<a id="outcome-bodies"></a>**结果的体。** `succeeded` 的体是旧家族的成功体；`limited` 的体是 `{ resource: 'pending-inputs' | 'input-bytes', limit }`；其余有体的结果（`invalid`、`conflict`、`archived`、`frozen`、`not-committed`、`not-found`、`unsupported`）体为空对象。固定结果（`denied`、`basis-unavailable`、`unknown`、`protocol-rejected`）只写 `true`，响应体恒为空，领域不能给它们加字段（RFC-0015 I-13）。会话家族没有阶段操作，部署也不能声明不提供，所以没有操作答 `stage-not-provided`。

<a id="observe-session"></a>**观察 `observe-session`。** 身份要求 `login`；建立点 `{ tenant, session }`；体上限缺省（`small`）。帧五种，以 `kind` 区分：

- `state`：`run`（当前这一轮的编号，没有进行中的一轮时为 `null`）、`revision`（会话日志到这一刻的修订号）、`phase`（模型调用的阶段，可为 `null`）、`target`（`{ projection: 'model-output-v1' }` 或 `null`）。
- `snapshot`、`delta`：`projection: 'model-output-v1'` 与一棵 JSON 值 `value`。
- `gap`：`reason` 为 `buffer` 或 `source-history`。
- `refreshing`：没有别的字段。

这个观察自己的结束原因只有 `refresh-exhausted`。`denied`、`unavailable` 以及中枢的结束原因不在这里列。

<a id="rule-texts"></a>**规则文本是复制来的。** 消息体与结果体的规则从共同契约的 `session-rules.ts` 复制到本包，归属从此在会话。共同契约里的那一份由接入插件那一程（删现有三个位置与旧家族时）删掉；在那之前两份并存，本包的用例逐个操作核对两份读出的值相同。

## 所有权、失败与生命周期

本包只有一个不可变的值和它推出的类型，没有状态、资源、副作用或生命周期。哪种情形答哪个结果是处理函数的事，不在本包。读写的失败由共同契约的规则引擎给出 `ok: false`，不抛出。

派生标识的文本（`session-public/1:session` 等）在入口成员里，本包不碰。

## 组合与验证

- 消费：`@omne-harness/public-contract` 的 `defineProtocol`、`ruleCodec`、`RuleValue` 与现有规则叶子（`text`、`string`、`tenant`、`session`、`page-bytes`、`boolean`、`null`、`positive-integer`、`json`、`user-message`）。源码不导入别的成员，不导入 Cordis、存储或 Node 内置模块（RFC-0015 I-18）。领域核心不依赖本包（I-17）。
- [tests/operations.spec.ts](tests/operations.spec.ts)：遍历操作表核三栏、算业务访问、结果名，以及两个查询的 `unknown`、唯一的 `input` 与唯一的 `acting-tenant`。
- [tests/shapes.spec-d.ts](tests/shapes.spec-d.ts)：类型断言核每个操作的请求体、成功体、`limited` 与空体、结果名集合与旧家族相同，差别逐处写明；观察的帧恰好五种。
- [tests/wire.spec.ts](tests/wire.spec.ts)：合规样本新旧两边读出的值相同且写回原样；不合规样本两边都拒绝；`create-session` 带与不带 `definition`。
- [tests/observe-session.spec.ts](tests/observe-session.spec.ts)：观察的身份、建立点、结束原因，每种帧读写来回，`state` 的三个可空字段，种类不认识的帧被拒绝。
- [tests/browser-fixture.spec.ts](tests/browser-fixture.spec.ts)（慢层）：不带 Node 类型、带 DOM 的消费者工程把包入口编过去。
- 未覆盖：依赖规则（`tools/repo-config`）还没有守本包的纯度与 I-17，现在靠上面的浏览器夹具和 `git grep` 核。
