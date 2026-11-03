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

每条写本包怎样兑现、一个反例，以及让守住它的用例变红的变异。锚点给验证引用。

<a id="mc-1"></a>

- **MC-1 配置**（S3）：`createMcpCore` 用 `validateConfig` 核对 `McpConfig`。`principalKey` 不是函数，或三个上界不是正的安全整数时，抛出 `RangeError`，不建立任何服务，不问任何端口。配置不是对象时同样抛出。反例：`maxListingPages: 0`、`maxActions: 1.5`、`principalKey: 'alice'`。变异：`isPositiveSafeInteger` 放过 0 → `config.spec.ts` 变红。

<a id="mc-2"></a>

- **MC-2 关口**（S1）：S1 只有一份实现，在 `internal/gate.ts`：`admit` 先问 `AdoptionView.endpoint`（`adopted`，并把正文解析一次），再问 `UseEligibility.check`（`judge`），交出一个带裁决的 `GateDecision`；`refusalOf` 把裁决映射为 R1 的拒绝。未采用答 `not-available-to-you` 且不问资格；采用不可读或正文不能解析答 `unknown`；资格 `not-eligible` 答 `not-available-to-you`；被设置挡下答 `blocked` 带原因；资格 `unknown` 答 `unknown`。生产入口是 `internal/guard.ts` 的 `admitForUse`（读口、`release`）与 `stillAdmitted`（发布边界），以及 `status.ts` 在 `admit`/`judge` 上的组合；它们不另写映射。两个令牌：`AdoptedOnly`（采用通过、正文已读、资格未判）与 `AdmittedEndpoint`（资格也通过），都是冻结副本，带模块私有品牌并登记在模块私有的 `WeakSet` 里；需要连接的函数只收后者，`assertAdmitted` 对其他对象（含 `AdoptedOnly`、副本）抛出 `TypeError`。令牌只在关口内从采用端口的答复铸出，铸造函数不导出；`judge` 只接受登记过的 `AdoptedOnly`，换了正文或定义的副本抛出 `TypeError`，所以被准入的连接只在端口交来的材料上建立。`list` 经 `admitScope` 在关口内逐项裁决。反例：未采用的接入点让资格替身被调用；换掉定义的令牌副本被 `judge` 准入并启动了不是采用的命令。变异：`admit` 先问资格再看采用 → `gate.spec.ts`「without asking eligibility」与 `races.spec.ts`「(D1)」变红；`judge` 不核令牌来源 → `gate.spec.ts`「only a token this gate handed out」变红。

<a id="mc-3"></a>

- **MC-3 连接键**（K2，不变式 1）：连接表的键是 `connectionKeyOf(tenant, endpoint, account)` 的规范文本，含租户、持有、采用修订与对端账号。两个租户、两个对端账号、两个采用修订各自得到不同的连接。对端账号只由 `peerAccountOf` 得出（K1）。反例：同一采用修订下两个凭据绑定共用一条连接。变异：`connectionKeyTextOf` 去掉对端账号 → `ensure.spec.ts`「two peer accounts」变红。

<a id="mc-4"></a>

- **MC-4 配值**（S4、K1）：要连接的操作按 target、credential、connect-timeout、env 的次序检查配值，只报第一项（`settings` 阶段的失败）。credential 缺失答 `credential-unavailable`（`missing`），不合法答 `config-invalid`（`credential`）。connect-timeout 缺失时用请求的 `connectBound`，不合法时不改用 `connectBound`。`current` 与 `peer` 只需要 credential，缺失答 `config-missing`（`credential`）。反例：target 与 credential 同时不合法时报 credential。变异：`prepareSettings` 先查 credential → `ensure.spec.ts`「reports the first defect only」变红。

<a id="mc-5"></a>

- **MC-5 建立连接**（S4 第 4 步、R6、S7、S9，不变式 3、5）：连接表对一个键只建一条连接。状态是 `ready` 或 `degraded` 时复用；`preparing` 在途时等同一个 promise（单飞）；`lost` 或 `closed` 时重建，代际延续；同键的关闭在途时先等关闭完成。建立前重读 `AdoptionView.endpoint`：未采用答 `not-available-to-you`，不可读答 `unknown`，修订与令牌不同答 `unknown`；三种都不建连、不关别的连接。同一租户同一持有的 `ensure` 在一个临界区里完成重读、关闭其他修订的连接与条目的建立（建连本身在临界区外），所以两个修订的令牌先后过重读只留一个条目：后过的那个关闭先建的。建立的次序：`Connection.attempt()` → `auth` 不是 `none` 时 `CredentialUse.acquire`（stdio 用 `process-env`，HTTP 用 `http-authorization` 带 target） → stdio 经 `ProcessLanding.start` 取进程 → `McpTransportFactory.open` → `transport.discover()` → `Connection.ready(peer)`。连接时限从取凭据起计时，覆盖取凭据、进程启动、打开传输与协商，用 `AbortSignal.timeout(bound)`；端口不尊重信号时连接表自己放弃等待：迟到交来的句柄释放、传输关闭；迟到交来的进程 `await stop()`，范围不是 `tree-confirmed` 时并入条目的 `lingering`，状态视图由它报告 `residual`，下一次关闭再停一次。落点在时限内未答时凭据句柄不立即释放：进程交来则在它 `stop()` 返回后释放，落点答失败则随答复释放（S9）。迟到答复或收口的 reject 丢弃，不成为未处理拒绝。调用方的 `signal` 不进建连：单飞由所有调用方共享，只受连接时限约束。任一步失败或端口抛出：连接先同步转 `lost` 带 S7 原因，再经条目唯一的拆除关传输、`stop()` 已起的进程、释放凭据句柄（S9：进程句柄在 `stop()` 返回之后，没有进程时立即），`residual` 由拆除的结果报告，清单经 `markUnavailable` 写入；端口抛出的错误在收场后原样抛给调用方。失败的答复与原因：

  | 失败                                                                       | 答复                                | `lost` 原因                                                            | `markUnavailable` 原因   |
  | -------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- | ------------------------ |
  | 凭据 `missing`、`rejected`、`unknown`                                      | `credential-unavailable` 带子因     | `preparation-failed`                                                   | `credential-unavailable` |
  | 落点 `landing-invalid`、`facility-missing`、`unknown`                      | `landing-unavailable`               | `preparation-failed`                                                   | `landing-unavailable`    |
  | `open` 或 `discover` 答 `not-sent`（`authorization-required`）             | `authorization-required` 带授权发现 | `authorization-required`                                               | `authorization-required` |
  | `open` 或 `discover` 答 `not-sent`（`connection-unavailable`）、任一步超时 | `connection-unavailable`            | `preparation-failed`                                                   | `connection-unavailable` |
  | `discover` 答 `no-answer`                                                  | `effect-unknown` 带子因             | `stream-broken`、`process-exited`；`abandoned` 记 `preparation-failed` | `connection-unavailable` |
  | `discover` 答 `error-answer`、`answer-malformed`                           | `connection-unavailable`            | `discover-failed`                                                      | `connection-unavailable` |

  `ensure` 的失败分两个阶段：`settings`（S4 的拒绝、K1 的 `credential-unavailable(missing)`、重读采用的 `not-available-to-you` 与 `unknown`；没有标记）与 `connect`（上表的答复，带标记结果 `catalog`：`marked`、`revision-conflict`、`unavailable`、`not-acquired`）。凭据缺失时没有对端账号，所以不标记清单。反例：落点永不返回时 `ensure` 永不返回、`release` 被拖住；时限后才交来的进程答 `unconfirmed` 却不进 `residual`。变异：`landing.start` 不经 `untilAborted` → `races.spec.ts`「(B5)」变红；失败路径不释放句柄 → `ensure.spec.ts` 三条「released exactly once」变红；迟到的进程不并入 `lingering` → `races.spec.ts`「(R3-2, S9)」变红；时限到时立即释放句柄 → 「(S9)」变红；重读与建条目不在一个临界区 → 「(observation)」变红。

<a id="mc-6"></a>

- **MC-6 代际**（不变式 2）：stdio 的代际在每次 `attempt()` 加一，失败的尝试也加；HTTP 的代际在 `ready()` 加一。同一个键关闭后再建的连接延续上一条的代际，同一次运行内一个键的代际不重复。`Connection.isCurrent(g)` 只对当前代际且状态是 `ready` 或 `degraded` 时为真。聚合只由连接表写：服务经 `table.settle`、`table.lose` 报告结果，`Ensured.connection` 只是 `generation` 与 `isCurrent` 的只读视图。反例：失败的 stdio 尝试不加代际，迟到结果与下一次尝试同代。变异：`on-attempt` 改在 `ready` 加代际 → `connection.spec.ts`「failed attempts included」变红。

<a id="mc-7"></a>

- **MC-7 刷新与发布**（S5、C1–C6、不变式 2、4、5）：`refresh` 的次序是关口 → `ensure`（调用方 `signal` 中止时答 `kept`（`cancelled`），建连留给其他调用方） → `CatalogStore.read` 取 `basedOn` → 取页 → `completeListing` → `mergeListing` → 发布边界 → `CatalogStore.write(key, record, basedOn)`。取页阶段另起同一上界的 `AbortSignal.timeout`，最多 `maxListingPages` 页：某页超时按该页 `no-answer`（`abandoned`）处理；调用方中止答 `kept`（`cancelled`），不标记清单，连接不变。页答 `no-answer`、`error-answer` 或 `answer-malformed` 时 `kept`（`listing-incomplete`，`page-failed`），连接由 `ready` 转 `degraded`（`list-failed`）；全部页成功时 `degraded` 回到 `ready`；两者都经 `table.settle` 并只对当前代际生效。页答 `not-sent` 时经 `table.lose` 按 MC-5 的表处理，但 `lost` 原因是 `stream-broken`（`connection-unavailable`）或 `authorization-required`；标记写入冲突答 `kept`（`superseded`），不可用答 `unknown`；产出该页的代际已不是当前时 `lose` 不动作，`refresh` 答 `kept`（`superseded`）。发布边界的次序：先 `stillAdmitted`（资格仍 `granted`，否则答对应 `Refusal` 不发布；采用修订仍等于清单所在连接的修订，否则 `kept`（`superseded`）），然后紧挨写入同步核对产出清单的连接仍是当前（`isCurrent`，否则 `kept`（`superseded`））与 `signal` 未中止（否则 `kept`（`cancelled`））。写入答 `revision-conflict` 时 `kept`（`superseded`），答 `unavailable` 时 `unknown`。读取答 `unavailable` 时 `unknown`，不取页。清单取得时刻来自 `createMcpCore` 的 `now`。反例：资格核对期间连接换代，旧代际的清单仍发布。变异：去掉写入前的同步核对 → `races.spec.ts`「(B1)」两条变红；`lose` 去掉代际守卫 → 「(B2)」变红；取页不经时限 → 「(B3)」两条变红；去掉发布边界的 `isCurrent` → `refresh.spec.ts`「invariant 2」变红。

<a id="mc-8"></a>

- **MC-8 读口不连接**（S8、K3）：`current` 与 `peer` 只过关口、读配值、查存储与连接表。`current` 的 `basisCurrent`：没有连接 `no-connection`；协议版本相等且能力按规范化 JSON（成员按名字的 UTF-16 码元排序）相等 `matches`；否则 `differs`。`peer` 没有 `ready` 或 `degraded` 的连接时答 `not-connected`。反例：`current` 在未连接时打开传输。变异：`current` 在没有连接时调用 `ensure` → `refresh.spec.ts`「not-acquired before any refresh, with no transport opened」变红。

<a id="mc-9"></a>

- **MC-9 状态视图**（S1、S7）：`inspect` 在 `admit` 的裁决上组合：未采用答 `not-available-to-you`，不可读答 `unknown`，`not-eligible` 答 `not-available-to-you`，被挡下写进 `use: blocked` 不算失败。凭据按解析过的正文与配值报告 `not-required`、`absent`、`invalid`、`present`，不报告值。连接状态来自连接表：没有条目 `none`；关闭后进程未确认停止时 `lost`（`close-unconfirmed`）带 `residual`；`lost` 带准备失败或关闭留下的 `residual`。`list` 经 `AdoptionView.endpoints` 取列表，逐项经 `judge` 核资格，`not-eligible` 不列，被挡下列出并带 `use: blocked`，任一项 `unknown` 整次 `unknown`，采用不可读整次 `unknown`。无权主体对存在与不存在的接入点得到同一答复。反例：`list` 把 `not-eligible` 的接入点列出。变异：`list` 对 `not-eligible` 写 `blocked` → `status.spec.ts`「not the ones without eligibility」变红。

<a id="mc-10"></a>

- **MC-10 关闭**（S8、S9、组页 `close()` 次序，不变式 4）：`release` 过关口后关闭该租户该持有的连接，一个键同时只有一次关闭在进行（单飞），拆除也只有一次（条目的 `tearing`）：`lose`、准备失败、重建前的再停与关闭共用它。次序：`Connection.close()`（或 `lose()`）先同步拒新请求 → 关闭等在途的建连结束 → `transport.close()` → stdio `process.stop()`（含上次未确认停止的与迟到交来的进程） → 释放凭据句柄。`lose` 在途时的 `release` 等这次拆除完成再报告；`lose` 在途时的 `ensure` 等它完成再建。报告 `released` 带确认范围（几个进程时取最窄的），没有进程带 `no-process`，没有连接答 `no-connection`。`stop()` 答 `tree-confirmed` 时条目删除（只删仍属于本次关闭的条目），状态回到 `none`；答 `root-only` 或 `unconfirmed` 时进程句柄留在条目里，状态是 `lost`（`close-unconfirmed`）带 `residual`，再次 `release` 或重建前再次 `stop()`，报告它这次确认的范围。`closeAll` 对每条连接做同样的事，不问采用与资格。关闭不声称进程已停。反例：关闭进行中建起的新连接被删掉，进程无人停；`lose` 拆除途中 `release` 先报告 `released`，进程先于传输停止。变异：`ensure` 不等在途的关闭 → `races.spec.ts`「(B4)」变红；先 `stop()` 再 `transport.close()` → `release.spec.ts`「closes the transport before it stops the process」变红；`lose` 在拆除之后才转状态 → `races.spec.ts`「(R3-1)」变红。

<a id="mc-11"></a>

- **MC-11 自动关闭的粒度**（S1 末句，不变式 6）：被设置挡下（`disabled`、`local-command-not-enabled`）与撤采用是接入点级的事实：关口答未采用或被挡下时，`refresh`、`current`、`peer`、`release`、`inspect` 与发布边界先关闭该接入点的连接。主体无资格（`not-eligible`）是主体级的事实，不关闭：接入点对租户仍然成立。资格或采用 `unknown` 不关闭。`list` 不关闭。每次 `ensure` 先关闭同租户同持有下采用修订不等于当前读到的修订的连接；旧修订的令牌不能关闭新修订的连接（MC-5）。反例：一个主体被判 `not-eligible` 关掉同租户其他主体的连接。变异：`withdraws` 对 `not-eligible` 答真 → `gate.spec.ts`「does not close for a principal without eligibility」与 `races.spec.ts`「(O1)」变红。

<a id="mc-12"></a>

- **MC-12 在途表**（S2 的表，本波只建不接）：`InFlightCalls` 的键是（租户、`principalKey` 文本、关联键）。`reserve` 查重与占位是一个同步步骤；已结束的键可以再次占位。`cancel` 对不在表的键答 `unknown`，对已结束答 `no-call-in-flight`，对只占位的键标记取消并答 `signalled`，对已发出且代际是当前的答 `signalled`，代际已换答 `unknown`。标记取消后的 `markSent` 答 `cancelled` 并把键转为已结束。表项在本次运行内不删除，`release` 只撤销占位。反例：两个并发占位都答 `reserved`。变异：`reserve` 查后经 await 再占 → `in-flight.spec.ts`「exactly one of two concurrent callers」变红。

<a id="mc-13"></a>

- **MC-13 内存存储**（CS1–CS7）：`createInMemoryCatalogStore` 按清单键的规范文本（租户文本、对端账号文本、持有）保存整份记录，只接受期望修订等于当前修订的写入。它没有不可用的路径，CS8 不适用。租户不是 `legal-identity` 造出的值时抛出 `TypeError`。反例：两个租户同一持有读到同一份记录。变异：`catalogKeyTextOf` 去掉租户 → `memory-store.spec.ts` CS7 与「differs in the tenant」变红。

<a id="deviations"></a>

### 与已定事项的偏离

| 偏离                                                                             | 原因                                                               | 退出条件                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 公开根另导出 `McpDiscovery`、`RefreshRequest`；`refresh` 请求多一个可选 `signal` | 契约的 `refresh` 请求没有 `signal`，S5 的 `kept(cancelled)` 需要它 | W3 契约回写 `signal?: AbortSignal` 后删除这两个类型，`McpCore` 回到 `Omit<McpServices, 'invoker'>` |
| `createMcpCore` 的可选第三参 `{ now }`（`McpCoreOptions`）                       | 清单的 `acquiredAt` 是领域时间，契约端口里没有时钟；仓库禁止裸取时 | 时钟进 `McpPorts` 或 `McpConfig` 后删除第三参                                                      |
| `internal/canonical.ts` 复制契约 `json.ts` 的规范化                              | `basisCurrent` 要按规范化 JSON 比较能力，契约不导出 `canonical`    | 契约导出 `canonical` 或 `sameJson` 后删除本模块                                                    |

## 所有权、失败与生命周期

- 连接表拥有每条连接的 `Connection`、传输、进程句柄、凭据句柄与未确认停止的进程列表。聚合只做状态转移，不做 I/O；非法转移是 `TypeError`，表示本包的编程错误，不是对端或端口的失败。
- 凭据句柄每条连接恰好取得一次、释放一次：进程句柄在 `stop()` 返回之后释放（时限后才交来的进程也是），HTTP 句柄随传输关闭释放，没有进程的准备失败时立即释放。
- 进程由连接表收口，时限后才交来的进程也由它停止一次。`stop()` 的确认范围只记在视图的 `residual` 上；调用了 `stop()` 不证明进程已停。未确认停止的进程在下一次关闭或重建前再次请求停止。等待迟到落点的条目在关闭后仍保留，直到落点答复。
- 外部效果：进程启动与传输打开是外部效果。关闭不可逆；一次失败的准备可能留下进程，它作为 `residual` 报告给宿主。
- 并发：同一键的并发 `ensure` 共享一个 promise；同一键的关闭也只有一次在进行，拆除只有一次（`lose`、准备失败、重建与关闭共用），`ensure` 等它们完成再建；同一租户同一持有的 `ensure` 串行决定哪个修订的条目存在。并发 `refresh` 各自取页，发布边界与存储的条件写入保证只有一份发布，另一份 `kept`（`superseded`）。迟到的结果按产出它的代际识别，不改变新连接。连接表的操作在一个事件循环内串行化状态变化，没有锁。
- 取消：调用方的 `signal` 只属于这一次 `refresh`：等待建连、取页与发布边界各自核对它，答 `kept`（`cancelled`）；建连本身只受连接时限约束，由同键的调用方共享。取消已取得的页不撤销对端效果；取消只阻止发布。
- 时限：连接时限从取凭据起覆盖建连全程；取页阶段另起同一上界。端口不尊重信号时连接表自己放弃等待，迟到的结果被收口（句柄释放、进程停止并记录未确认的范围、传输关闭）；收口的 reject 丢弃，本包没有日志口可报。
- 内存存储与连接表都不跨重启。
- 已知限制（本版本）：端口的 `close()`、`stop()`、`release()` 以 reject 失败时（违反契约的提供者），拆除在那一步停下，条目可能被当作已结清而遗忘，进程与句柄的归宿不保证；同一持有的临界区等待没有上界的采用重读时，后续 `ensure` 一起等待；落点在时限内不答复时进程凭据句柄随迟到的进程走，落点永不答复则句柄不释放，`release`/`closeAll` 这时答 `no-process`；`closeAll` 不阻止之后的建连；采用口给出旧答复时旧修订的令牌仍会短暂建起旧连接随即被关闭。这几项的处置归下一波。

## 组合与验证

| 条款  | 验证                                                                                                                                                                     | 命令                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| MC-1  | `tests/config.spec.ts`、`tests/core.spec.ts`                                                                                                                             | `pnpm turbo run build typecheck test --filter=@omne-harness/mcp` |
| MC-2  | `tests/gate.spec.ts`（六种答复、未采用不问资格、伪造令牌、`judge` 只认本关口的令牌）、`tests/types.spec-d.ts`（字面量赋不进 `AdmittedEndpoint`）                        | 同上                                                             |
| MC-3  | `tests/ensure.spec.ts`「the connection key」：两个租户、两个对端账号各不共用连接。变异：键文本去掉对端账号 → 用例变红                                                    | 同上                                                             |
| MC-4  | `tests/ensure.spec.ts`「setting defects」、`tests/refresh.spec.ts`「current and peer」                                                                                   | 同上                                                             |
| MC-5  | `tests/ensure.spec.ts`「connection failures」「the connection bound」「read again before a build」；`tests/races.spec.ts`「(R3-2, S9)」「(observation)」。变异：失败路径不释放句柄 → 用例变红 | 同上                                                             |
| MC-6  | `tests/connection.spec.ts` 穷举两种策略下的每个合法与非法转移；`tests/release.spec.ts`「rebuilds after an unconfirmed close」。变异：stdio 失败的尝试不加代际 → 用例变红 | 同上                                                             |
| MC-7  | `tests/refresh.spec.ts`：`published`、三种 `kept`、页失败、两次并发的两种次序。变异：发布边界去掉代际核对 → 「迟到结果不发布」用例变红                                   | 同上                                                             |
| MC-8  | `tests/refresh.spec.ts`「current and peer do not connect」：传输工厂替身调用计数为 0，`basisCurrent` 三态                                                                | 同上                                                             |
| MC-9  | `tests/status.spec.ts`：凭据四态、`use` 两态、`residual`、`list` 的过滤与整次 `unknown`、无权主体的 `deepStrictEqual`                                                    | 同上                                                             |
| MC-10 | `tests/release.spec.ts`：替身记录的调用序列是 `transport.close` → `process.stop`；三种范围；HTTP 句柄释放一次；`closeAll` 不问采用与资格；`tests/races.spec.ts`「(B4)」「(R3-1)」 | 同上                                                             |
| MC-11 | `tests/ensure.spec.ts`「closes the connection of an earlier adoption revision」、`tests/status.spec.ts`、`tests/refresh.spec.ts`「publish boundary: eligibility」        | 同上                                                             |
| MC-12 | `tests/in-flight.spec.ts`                                                                                                                                                | 同上                                                             |
| MC-13 | `tests/memory-store.spec.ts` 跑 `mcpCatalogStoreConformance()`，CS8 记为不适用；三条隔离用例                                                                             | 同上                                                             |

未覆盖：

- 没有真实传输、真实进程、真实对端与耐久存储；替身通过不等于真实组合通过。`@omne-harness/mcp-host-local` 的传输契约测试与真实服务端夹具不在本包。
- 连接时限与取页时限只用 `AbortSignal.timeout` 的小值（1 ms、50 ms）测，没有长时间等待的证据；端口自己尊重信号的路径没有测（替身不读信号）。
- `mergeListing` 的 `stale-revision` 在 `refresh` 里不可达：`basedOn` 与 `current` 来自同一次读取。它由契约成员的测试覆盖。
- 调用口与任务表不在本波，S2 的 `cancel` 答复只在 `InFlightCalls` 上验证。
