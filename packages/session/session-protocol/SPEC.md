# @omne-harness/session-protocol 行为规格

本包是公开协议 `session/v1` 的协议契约：会话向客户端开放哪些操作和观察，每个操作收什么、答什么。它是纯数据，用共同契约的 `defineProtocol` 声明。精确类型由 [src/session-protocol.ts](src/session-protocol.ts) 的 `sessionProtocol` 推出，本文件只写类型以外的约定。

## 范围与依据

- 设计源：[RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md)「共同契约」「协议怎样划分」「会话观察」「成员怎么放，依赖方向」四节。成员落点与允许的依赖见[成员组织](../../../docs/package-organization.md)「`<领域>-protocol`」一行。
- 状态：候选。契约与用例已建；接入插件 `session-access` 已按它写了九个处理函数；客户端核心对它的消费还没有做。
- 操作清单从哪来：现有家族 `session-public/1`（共同契约成员的 `session-rules.ts`、`session-messages.ts`）的八个操作，去掉 `read-session-diagnostics`（它归 `session-diagnostics/v1`），得到七个；再加 `list-sessions`（[RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 第 8 节「列出会话」），它在旧家族里没有，同一个主版本里加；再加 `retry-run`，同样只在本家族。

## 结果与不变量

<a id="operations"></a>**九个操作。** `create-session`、`query-create-session`、`send-input`、`query-send-input`、`read-history`、`list-sessions`、`cancel-run`、`stop-call`、`retry-run`。三栏按 RFC-0015 第 7 节的规则机械地得到：

| 操作                   | 身份要求        | 效果     | 体上限  |
| ---------------------- | --------------- | -------- | ------- |
| `create-session`       | `acting-tenant` | `commit` | `small` |
| `query-create-session` | `login`         | `read`   | `small` |
| `send-input`           | `login`         | `commit` | `input` |
| `query-send-input`     | `login`         | `read`   | `small` |
| `read-history`         | `login`         | `read`   | `small` |
| `list-sessions`        | `login`         | `read`   | `small` |
| `cancel-run`           | `login`         | `commit` | `small` |
| `stop-call`            | `login`         | `commit` | `small` |
| `retry-run`            | `login`         | `commit` | `small` |

九个操作与观察都标 `countsAsAccess`：答 `succeeded`（观察：建立成功）算一次业务访问。没有操作标 `carriesCredential`。

<a id="differences"></a>**和旧家族的七处差别。** 其余的消息体、成功体、结果集逐字段相同：

1. `create-session` 的 `definition` 可以不给。不给时取哪个定义是接入插件的行为，不在本契约里。
2. `defineProtocol` 给每个操作并进 `protocol-rejected`、`basis-unavailable`、`denied`，给提交类并进 `unknown`。旧家族的结果集本来就有后三个，所以实际多出来的只有 `protocol-rejected`。
3. 信封不在契约里：协议版本、消息编号、操作名、登录证明、行事租户归共同契约的外层。消息体里原有的目标租户（除 `create-session` 外的六个操作的 `tenant`）照旧在消息体里。
4. `query-create-session`、`query-send-input` 的效果是 `read`，但结果里手写了 `unknown`：查询本身可能答不出那次提交的结局，这是旧家族就有的结果。
5. `read-history` 的成功体多一个字段 `upper`：这一轮读取固定的会话修订号。旧家族没有带出它，读者就没有办法把历史页和状态帧对上，见[会话修订号与读历史](#revisions)。
6. 多一个操作 `list-sessions`，旧家族没有，见[列出会话](#list-sessions)。
7. 多一个操作 `retry-run`，旧家族没有，见[重试](#retry-run)。

<a id="retry-run"></a>**重试 `retry-run`。** 身份要求 `login`，提交类，体上限 `small`，业务访问。消息体 `{ tenant, session, controlId, run }`：`run` 是失败的那一轮。成功体 `{ recovered }`，同一个 `controlId` 再发一次时为 `true`。自己的结果：`invalid`、`archived`、`frozen`、`not-found`（`run` 不是会话在等的那一轮失败）、`no-change`（会话在等人，但没有待处理的输入）、`conflict`，体都为空。会话契约里的 `nothing-pending` 在公开结果的封闭集合里没有同名的一项，这里答 `no-change`。哪种情形答哪个结果归会话，见[包组规格](../SPEC.md)「等人」。

<a id="list-sessions"></a>**列出会话 `list-sessions`。** 身份要求 `login`，只读，体上限 `small`，业务访问。消息体 `{ tenant, cursor, limit?, includeArchived? }`：`tenant` 是目标租户；`cursor` 是上一页的 `next` 原文，第一页给 `null`；`limit` 不给时用部署的默认值，超过部署的上界答 `invalid`；`includeArchived` 不给时不含已归档的会话。成功体 `{ sessions, next, completeness }`：

- `sessions` 每项 `{ session, createdAt, lastActivityAt, lifecycle, title }`。两个时刻是 UTC 时刻，`null` 表示这个会话建在系统开始记提交时刻之前。`lifecycle` 是 `initializing`、`dormant`、`active`、`frozen`、`archived` 之一。`title` 是最早一条带文字的用户消息的开头，还没有时是 `null`。
- `next` 为 `null` 表示读完了。
- `completeness` 为 `partial` 表示这一页读到了行数的上界，可能还有没扫到的会话；为 `complete` 表示没有。

自己的结果只有 `invalid`（`limit` 超上界或 `cursor` 不合法），体为空。资格被拒答 `denied`，和会话不存在看不出区别；领域答不出来答 `basis-unavailable`。次序、标题的取法与读的资格归会话，见 RFC-0015 第 8 节「列出会话」；本契约只定形状。

<a id="revisions"></a>**会话修订号与读历史。** 本契约里有两条轴，都写成不透明的十进制文本，按数值比较，两条轴之间不比较。

| 轴         | 出现在哪                  | 含义                                                                                                                            |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 会话修订号 | 历史条目的 `revision`     | 写下这一条的那次提交                                                                                                            |
| 会话修订号 | 历史页的 `upper`          | 这一轮读取固定的上界。一轮从 `cursor: null` 开始，沿 `next` 往下读；同一轮的每一页 `upper` 相同，这一轮只给修订号不超过它的条目 |
| 会话修订号 | 状态帧的 `revision`       | 会话观察自己读日志时固定的同一个上界                                                                                            |
| 扫描位置   | 历史页的 `scannedThrough` | 存储这一页实际扫到的位置。空页不表示读完，翻页只用 `next`                                                                       |

同一个会话里修订号只增不减。读者据此判断手里的历史新不新：

- 最近一轮从末尾开始的读取，`upper` 不小于某个状态帧的 `revision`：那一帧说到的提交，读者都已经读到。
- 小于：日志里有读者没读到的提交。读者从末尾反向再读一轮，读到已经持有的条目就可以停，更早的它已经有了。
- 读者在收到某个状态帧之后才发出的读取，答复的 `upper` 不小于那一帧的 `revision`：两者读的是同一份日志，日志只增不减。

<a id="outcome-bodies"></a>**结果的体。** `succeeded` 的体是旧家族的成功体；`limited` 的体是 `{ resource: 'pending-inputs' | 'input-bytes', limit }`；其余有体的结果（`invalid`、`conflict`、`archived`、`frozen`、`not-committed`、`not-found`、`unsupported`）体为空对象。固定结果（`denied`、`basis-unavailable`、`unknown`、`protocol-rejected`）只写 `true`，响应体恒为空，领域不能给它们加字段（RFC-0015 I-13）。会话家族没有阶段操作，部署也不能声明不提供，所以没有操作答 `stage-not-provided`。

<a id="observe-session"></a>**观察 `observe-session`。** 身份要求 `login`；建立点 `{ tenant, session }`；体上限缺省（`small`）。帧五种，以 `kind` 区分：

- `state`：`run`（当前这一轮的编号，没有进行中的一轮时为 `null`）、`revision`（会话日志到这一刻的修订号）、`phase`（模型调用的阶段，可为 `null`）、`target`（`{ projection: 'model-output-v1' }` 或 `null`）。
- `snapshot`、`delta`：`projection: 'model-output-v1'` 与一棵 JSON 值 `value`。
- `gap`：`reason` 为 `buffer` 或 `source-history`。
- `refreshing`：没有别的字段。

帧的含义归会话观察（[RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md) 第 8 节与[会话观察的规格](../session-observation/SPEC.md)），读者按下表读，不另作推断：

| 帧           | 它说的是                                                                   | 读者据此                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `state`      | 会话这一刻的四个字段。观察建立后的第一帧是它，之后只在字段有变化时发       | `run` 为 `null` 是没有进行中的一轮；`revision` 按[会话修订号与读历史](#revisions)和历史对上                                                            |
| `snapshot`   | 当前这次模型调用的回复到这一刻的全部内容                                   | 换掉手里正在生成的内容                                                                                                                                 |
| `delta`      | 接在上一帧之后的增量                                                       | 接得上就接上；接不上就不用它，等下一个 `snapshot`                                                                                                      |
| `gap`        | 回复的流丢了一段：`buffer` 是缓冲放不下，`source-history` 是来源的历史不够 | 手里正在生成的内容可能不全。观察会重新取，之后给新的 `snapshot`                                                                                        |
| `refreshing` | 观察这一刻没有可以转发的回复流，按间隔又找了一次，记一次尝试               | 它不是错误，也不表示流断过。一轮刚开始而模型还没给出流时、一轮结束之后、没有进行中的一轮时，间隔到期都会发它。至多在有进行中的一轮时显示「正在等内容」 |

连续的尝试用尽时，观察以 `refresh-exhausted` 结束。

这个观察自己的结束原因只有 `refresh-exhausted`。`denied`、`unavailable` 以及中枢的结束原因不在这里列。

<a id="rule-texts"></a>**规则文本是复制来的。** 消息体与结果体的规则从共同契约的 `session-rules.ts` 复制到本包，归属从此在会话。共同契约里的那一份由接入插件那一程（删现有三个位置与旧家族时）删掉；在那之前两份并存，本包的用例逐个操作核对两份读出的值相同。`list-sessions` 的规则是本包新写的，共同契约里没有对应的一份，不在核对之列。

## 所有权、失败与生命周期

本包只有一个不可变的值和它推出的类型，没有状态、资源、副作用或生命周期。哪种情形答哪个结果是处理函数的事，不在本包。读写的失败由共同契约的规则引擎给出 `ok: false`，不抛出。

派生标识的文本（`session-public/1:session` 等）在入口成员里，本包不碰。

## 组合与验证

- 消费：`@omne-harness/public-contract` 的 `defineProtocol`、`ruleCodec`、`RuleValue` 与现有规则叶子（`text`、`string`、`tenant`、`session`、`page-bytes`、`boolean`、`null`、`positive-integer`、`json`、`user-message`）。源码不导入别的成员，不导入 Cordis、存储或 Node 内置模块（RFC-0015 I-18）。领域核心不依赖本包（I-17）。
- [tests/operations.spec.ts](tests/operations.spec.ts)：遍历操作表核三栏、算业务访问、结果名，`list-sessions` 的三栏与它唯一的自有结果 `invalid`，以及两个查询的 `unknown`、唯一的 `input` 与唯一的 `acting-tenant`。
- [tests/shapes.spec-d.ts](tests/shapes.spec-d.ts)：类型断言核每个操作的请求体、成功体、`limited` 与空体、结果名集合与旧家族相同，差别逐处写明（含 `list-sessions` 自己的体与结果名）；观察的帧恰好五种。
- [tests/wire.spec.ts](tests/wire.spec.ts)：合规样本新旧两边读出的值相同且写回原样；不合规样本两边都拒绝；`create-session` 带与不带 `definition`；`list-sessions` 没有旧家族，单独核消息体与成功体的合规与不合规样本。
- [tests/retry-run.spec.ts](tests/retry-run.spec.ts)：`retry-run` 没有旧家族，单独核三栏、自有结果、消息体与成功体的合规与不合规样本。
- [tests/observe-session.spec.ts](tests/observe-session.spec.ts)：观察的身份、建立点、结束原因，每种帧读写来回，`state` 的三个可空字段，种类不认识的帧被拒绝。
- [tests/browser-fixture.spec.ts](tests/browser-fixture.spec.ts)（慢层）：不带 Node 类型、带 DOM 的消费者工程把包入口编过去。
- 未覆盖：依赖规则（`tools/repo-config`）还没有守本包的纯度与 I-17，现在靠上面的浏览器夹具和 `git grep` 核。
