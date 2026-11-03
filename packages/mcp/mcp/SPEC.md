# @omne-harness/mcp 行为规格

状态：W2 核心实现的候选规格，尚未取得技术接受。本包是 `@omne-harness/mcp-contract` 四个应用服务接口的实现方。行为条款归契约成员的 [SPEC](../mcp-contract/SPEC.md)；本页只写两类内容：本包兑现哪些条款，以及契约没有定、由本包决定的事项。本页不复制条款正文。公开形状归 `src/` 的公开定义，导航在 [docs/public-api.md](docs/public-api.md)。

## 范围与依据

| 依据                                                   | 修订        | 本页采用的范围                                                                              |
| ------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------- |
| [契约 SPEC](../mcp-contract/SPEC.md)                   | `b0f2ec7fb` | K1–K3、C1–C7、R1、R6、R7、S1、S3–S5、S7–S9、AV、UE、CU、PL、CS、T1、T3、T5 作为被兑现的条款 |
| [组工程设计](../docs/architecture.md)                  | `b0f2ec7fb` | 「MCP 连接」的状态机、不变式 1–6 与 `close()` 次序；「应用服务」的读口、状态口、资格与换代  |
| W2 MCP 线实施规格已定事项 1–17（任务材料，2026-11-03） | 本地        | 模块划分、聚合与关口的形状、连接表的次序、内存存储的键、脚本化传输替身                      |

本包不兑现 S2、S6、R2、O1–O6、D1–D5、T2、T4、T6、T7：它们属于调用口与传输实现，不在本波。

## 结果与不变量

每条写本包怎样兑现，锚点给验证引用。

<a id="mc-1"></a>

- **MC-1 配置**（S3）：`createMcpCore` 用 `validateConfig` 核对 `McpConfig`。`principalKey` 不是函数，或三个上界不是正的安全整数时，抛出 `RangeError`，不建立任何服务。配置不是对象时同样抛出。

<a id="mc-2"></a>

- **MC-2 关口**（S1）：`admit` 先问 `AdoptionView.endpoint`，再问 `UseEligibility.check`。未采用答 `not-available-to-you` 且不问资格；采用不可读答 `unknown`；资格 `not-eligible` 答 `not-available-to-you`；被设置挡下答 `blocked` 带原因；资格 `unknown` 答 `unknown`。通过的接入点以 `AdmittedEndpoint` 交出：它是采用答复的冻结副本，带模块私有品牌并登记在模块私有的 `WeakSet` 里。需要连接的内部函数只收它，`assertAdmitted` 对其他对象抛出 `TypeError`。`admitWithoutEligibility` 只问采用，给 S2 允许复用连接的任务操作。

<a id="mc-3"></a>

- **MC-3 连接键**（K2，不变式 1）：连接表的键是 `connectionKeyOf(tenant, endpoint, account)` 的规范文本，含租户、持有、采用修订与对端账号。两个租户、两个对端账号、两个采用修订各自得到不同的连接。对端账号只由 `peerAccountOf` 得出（K1）。

<a id="mc-4"></a>

- **MC-4 配值**（S4、K1）：要连接的操作按 target、credential、connect-timeout、env 的次序检查配值，只报第一项。credential 缺失答 `credential-unavailable`（`missing`），不合法答 `config-invalid`（`credential`）。connect-timeout 缺失时用请求的 `connectBound`，不合法时不改用 `connectBound`。`current` 与 `peer` 只需要 credential，缺失答 `config-missing`（`credential`）。正文不能解析时答 `unknown`。

<a id="mc-5"></a>

- **MC-5 建立连接**（S4 第 4 步、R6、S7、S9，不变式 3、5）：连接表对一个键只建一条连接。状态是 `ready` 或 `degraded` 时复用；`preparing` 在途时等同一个 promise（单飞）；`lost` 或 `closed` 时重建，代际延续。建立的次序：`Connection.attempt()` → `auth` 不是 `none` 时 `CredentialUse.acquire`（stdio 用 `process-env`，HTTP 用 `http-authorization` 带 target） → stdio 经 `ProcessLanding.start` 取进程 → `McpTransportFactory.open` → `transport.discover()` → `Connection.ready(peer)`。连接时限从 `attempt()` 起计时，覆盖到 `ready`，用 `AbortSignal.timeout(bound)` 与调用方的 `signal` 组合；传输不尊重信号时，连接表自己放弃等待，迟到打开的传输被关闭。任一步失败：传输关闭、已起的进程 `stop()`、凭据句柄释放（S9：进程句柄在 `stop()` 返回之后，准备失败立即）、连接转 `lost` 带 S7 原因与 `residual`、清单经 `markUnavailable` 写入。失败的答复与原因：

  | 失败                                                                             | 答复                                | `lost` 原因                                                            | `markUnavailable` 原因   |
  | -------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- | ------------------------ |
  | 凭据 `missing`、`rejected`、`unknown`                                            | `credential-unavailable` 带子因     | `preparation-failed`                                                   | `credential-unavailable` |
  | 落点 `landing-invalid`、`facility-missing`、`unknown`                            | `landing-unavailable`               | `preparation-failed`                                                   | `landing-unavailable`    |
  | `open` 或 `discover` 答 `not-sent`（`authorization-required`）                   | `authorization-required` 带授权发现 | `authorization-required`                                               | `authorization-required` |
  | `open` 或 `discover` 答 `not-sent`（`connection-unavailable`）、超时、调用方中止 | `connection-unavailable`            | `preparation-failed`                                                   | `connection-unavailable` |
  | `discover` 答 `no-answer`                                                        | `effect-unknown` 带子因             | `stream-broken`、`process-exited`；`abandoned` 记 `preparation-failed` | `connection-unavailable` |
  | `discover` 答 `error-answer`、`answer-malformed`                                 | `connection-unavailable`            | `discover-failed`                                                      | `connection-unavailable` |

  `markUnavailable` 的写入结果随失败一起交给调用方：`marked`、`revision-conflict`、`unavailable`、`not-acquired`（清单从未取得）或 `untouched`（没有对端账号，无法组成清单键）。凭据缺失时没有对端账号，所以不标记清单。

<a id="mc-6"></a>

- **MC-6 代际**（不变式 2）：stdio 的代际在每次 `attempt()` 加一，失败的尝试也加；HTTP 的代际在 `ready()` 加一。同一个键关闭后再建的连接延续上一条的代际，同一次运行内一个键的代际不重复。`Connection.isCurrent(g)` 只对当前代际且状态是 `ready` 或 `degraded` 时为真。

<a id="mc-7"></a>

- **MC-7 刷新与发布**（S5、C1–C6、不变式 2、4）：`refresh` 的次序是关口 → `ensure` → `CatalogStore.read` 取 `basedOn` → 最多 `maxListingPages` 页 `listActions` → `completeListing` → `mergeListing` → 发布边界 → `CatalogStore.write(key, record, basedOn)`。发布边界依次核对：产出清单的连接仍是当前（`isCurrent`），否则 `kept`（`superseded`）；请求的 `signal` 未中止，否则 `kept`（`cancelled`）；`UseEligibility.check` 仍 `granted`，否则答对应的 `Refusal` 不发布。写入答 `revision-conflict` 时 `kept`（`superseded`），答 `unavailable` 时 `unknown`。读取答 `unavailable` 时 `unknown`，不取页。页答 `no-answer`、`error-answer` 或 `answer-malformed` 时 `kept`（`listing-incomplete`，`page-failed`），连接由 `ready` 转 `degraded`（`list-failed`）；全部页成功时 `degraded` 回到 `ready`。页答 `not-sent` 时按 MC-5 的表处理，但 `lost` 原因是 `stream-broken`（`connection-unavailable`）或 `authorization-required`；标记写入冲突答 `kept`（`superseded`），不可用答 `unknown`。清单取得时刻来自 `createMcpCore` 的 `now`。

<a id="mc-8"></a>

- **MC-8 读口不连接**（S8、K3）：`current` 与 `peer` 只过关口、读配值、查存储与连接表。`current` 的 `basisCurrent`：没有连接 `no-connection`；协议版本相等且能力按规范化 JSON（成员按名字的 UTF-16 码元排序）相等 `matches`；否则 `differs`。`peer` 没有 `ready` 或 `degraded` 的连接时答 `not-connected`。

<a id="mc-9"></a>

- **MC-9 状态视图**（S1、S7）：`inspect` 对未采用答 `not-available-to-you`，对不可读答 `unknown`，对 `not-eligible` 答 `not-available-to-you`，对被挡下写进 `use: blocked` 不算失败。凭据按 `auth` 与配值报告 `not-required`、`absent`、`invalid`、`present`，不报告值。连接状态来自连接表：没有条目 `none`；关闭后进程未确认停止时 `lost`（`close-unconfirmed`）带 `residual`；`lost` 带准备失败或关闭留下的 `residual`。`list` 经 `AdoptionView.endpoints` 取列表，逐项核资格，`not-eligible` 不列，被挡下列出并带 `use: blocked`，任一项 `unknown` 整次 `unknown`，采用不可读整次 `unknown`。无权主体对存在与不存在的接入点得到同一答复。

<a id="mc-10"></a>

- **MC-10 关闭**（S8、S9、组页 `close()` 次序，不变式 4）：`release` 过关口后关闭该租户该持有的连接：`Connection.close()` 拒新请求 → `transport.close()` → stdio `process.stop()` → 释放凭据句柄。报告 `released` 带确认范围，没有进程带 `no-process`，没有连接答 `no-connection`。`stop()` 答 `tree-confirmed` 时条目删除，状态回到 `none`；答 `root-only` 或 `unconfirmed` 时进程句柄留在条目里，状态是 `lost`（`close-unconfirmed`）带 `residual`，再次 `release` 或重建前再次 `stop()`，报告它这次确认的范围。`closeAll` 对每条连接做同样的事，不问采用与资格。关闭不声称进程已停。

<a id="mc-11"></a>

- **MC-11 自动关闭**（S1 末句，不变式 6）：每次 `ensure` 先关闭同租户同持有下键不同的连接（采用修订已变）。关口答未采用或被挡下时，`refresh`、`current`、`peer`、`release` 与 `inspect` 先关闭该接入点的连接。主体无资格（`not-eligible`）不关闭：接入点对租户仍然成立。资格 `unknown` 不关闭。`list` 不关闭。

<a id="mc-12"></a>

- **MC-12 在途表**（S2 的表，本波只建不接）：`InFlightCalls` 的键是（租户、`principalKey` 文本、关联键）。`reserve` 查重与占位是一个同步步骤；已结束的键可以再次占位。`cancel` 对不在表的键答 `unknown`，对已结束答 `no-call-in-flight`，对只占位的键标记取消并答 `signalled`，对已发出且代际是当前的答 `signalled`，代际已换答 `unknown`。标记取消后的 `markSent` 答 `cancelled` 并把键转为已结束。表项在本次运行内不删除，`release` 只撤销占位。

<a id="mc-13"></a>

- **MC-13 内存存储**（CS1–CS7）：`createInMemoryCatalogStore` 按清单键的规范文本（租户文本、对端账号文本、持有）保存整份记录，只接受期望修订等于当前修订的写入。它没有不可用的路径，CS8 不适用。租户不是 `legal-identity` 造出的值时抛出 `TypeError`。

## 所有权、失败与生命周期

- 连接表拥有每条连接的 `Connection`、传输、进程句柄、凭据句柄与未确认停止的进程列表。聚合只做状态转移，不做 I/O；非法转移是 `TypeError`，表示本包的编程错误，不是对端或端口的失败。
- 凭据句柄每条连接恰好取得一次、释放一次：进程句柄在 `stop()` 返回之后释放，HTTP 句柄随传输关闭释放，准备失败时在 `finally` 释放。
- 进程由连接表收口。`stop()` 的确认范围只记在视图的 `residual` 上；调用了 `stop()` 不证明进程已停。未确认停止的进程在下一次关闭或重建前再次请求停止。
- 外部效果：进程启动与传输打开是外部效果。关闭不可逆；一次失败的准备可能留下进程，它作为 `residual` 报告给宿主。
- 并发：同一键的并发 `ensure` 共享一个 promise。并发 `refresh` 各自取页，发布边界与存储的条件写入保证只有一份发布，另一份 `kept`（`superseded`）。连接表的操作在一个事件循环内串行化状态变化，没有锁。
- 取消：`refresh` 的 `signal` 在建立连接时组合进连接时限，在发布边界核对。取消已取得的页不撤销对端效果；取消只阻止发布。
- 内存存储与连接表都不跨重启。

## 组合与验证

| 条款  | 验证                                                                                                                                                                     | 命令                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| MC-1  | `tests/config.spec.ts`、`tests/core.spec.ts`                                                                                                                             | `pnpm turbo run build typecheck test --filter=@omne-harness/mcp` |
| MC-2  | `tests/gate.spec.ts`（六种答复、未采用不问资格、伪造令牌）、`tests/types.spec-d.ts`（字面量赋不进 `AdmittedEndpoint`）                                                   | 同上                                                             |
| MC-3  | `tests/ensure.spec.ts`「the connection key」：两个租户、两个对端账号各不共用连接。变异：键文本去掉对端账号 → 用例变红                                                    | 同上                                                             |
| MC-4  | `tests/ensure.spec.ts`「setting defects」、`tests/refresh.spec.ts`「current and peer」                                                                                   | 同上                                                             |
| MC-5  | `tests/ensure.spec.ts`「connection failures」「the connection bound」：替身计数证明句柄取一次释放一次、进程 `stop()` 被调用。变异：失败路径不释放句柄 → 用例变红         | 同上                                                             |
| MC-6  | `tests/connection.spec.ts` 穷举两种策略下的每个合法与非法转移；`tests/release.spec.ts`「rebuilds after an unconfirmed close」。变异：stdio 失败的尝试不加代际 → 用例变红 | 同上                                                             |
| MC-7  | `tests/refresh.spec.ts`：`published`、三种 `kept`、页失败、两次并发的两种次序。变异：发布边界去掉代际核对 → 「迟到结果不发布」用例变红                                   | 同上                                                             |
| MC-8  | `tests/refresh.spec.ts`「current and peer do not connect」：传输工厂替身调用计数为 0，`basisCurrent` 三态                                                                | 同上                                                             |
| MC-9  | `tests/status.spec.ts`：凭据四态、`use` 两态、`residual`、`list` 的过滤与整次 `unknown`、无权主体的 `deepStrictEqual`                                                    | 同上                                                             |
| MC-10 | `tests/release.spec.ts`：替身记录的调用序列是 `transport.close` → `process.stop`；三种范围；HTTP 句柄释放一次；`closeAll` 不问采用与资格                                 | 同上                                                             |
| MC-11 | `tests/ensure.spec.ts`「closes the connection of an earlier adoption revision」、`tests/status.spec.ts`、`tests/refresh.spec.ts`「publish boundary: eligibility」        | 同上                                                             |
| MC-12 | `tests/in-flight.spec.ts`                                                                                                                                                | 同上                                                             |
| MC-13 | `tests/memory-store.spec.ts` 跑 `mcpCatalogStoreConformance()`，CS8 记为不适用；三条隔离用例                                                                             | 同上                                                             |

未覆盖：

- 没有真实传输、真实进程、真实对端与耐久存储；替身通过不等于真实组合通过。`@omne-harness/mcp-host-local` 的传输契约测试与真实服务端夹具不在本包。
- 连接时限只用 `AbortSignal.timeout` 的小值测，没有长时间等待的证据。
- `mergeListing` 的 `stale-revision` 在 `refresh` 里不可达：`basedOn` 与 `current` 来自同一次读取。它由契约成员的测试覆盖。
- 调用口与任务表不在本波，S2 的 `cancel` 答复只在 `InFlightCalls` 上验证。
