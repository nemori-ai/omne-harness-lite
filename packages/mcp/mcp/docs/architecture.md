# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：模块划分、依赖方向、状态与资源归属、关键机制及理由。组级约束见[组工程设计](../../docs/architecture.md)。

## 模块与依赖

| 模块                     | 内容                                                                                     | 持有的状态与资源                                             | 依赖                                               |
| ------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `index.ts`               | `createMcpCore`、`createInMemoryCatalogStore`、`McpCore`                                 | 无                                                           | 下列全部                                           |
| `config.ts`              | `validateConfig`（SPEC MC-1）                                                            | 无                                                           | 契约类型                                           |
| `inspection.ts`          | 类别端口 `mcp` 加 `inspect`、`launchesLocalCommand`                                      | 无                                                           | 契约的 `parseEndpointBody`                         |
| `discovery.ts`           | `refresh`、`current`、`peer`（MC-7、MC-8）                                               | 无；状态在连接表与存储                                       | `internal/*`、契约的清单函数                       |
| `status.ts`              | `inspect`、`list`（MC-9）                                                                | 无                                                           | `internal/gate`、`internal/guard`、连接表          |
| `connections.ts`         | `release`、`closeAll`（MC-10）                                                           | 无                                                           | `internal/guard`、连接表                           |
| `store/memory.ts`        | 生产内存存储（MC-13）                                                                    | 一张 `Map`，按清单键文本                                     | `internal/text`                                    |
| `internal/connection.ts` | `Connection` 聚合：状态机与代际（MC-6）                                                  | 状态、代际、对端视图                                         | 契约类型                                           |
| `internal/in-flight.ts`  | `InFlightCalls` 聚合（MC-12）                                                            | 一张 `Map`，按（租户、主体、关联键）                         | `legal-identity`                                   |
| `internal/gate.ts`       | `admit`、`admitWithoutEligibility`、`AdmittedEndpoint`、`assertAdmitted`（MC-2）         | 模块私有 `WeakSet`                                           | 两个端口                                           |
| `internal/guard.ts`      | 使用边界：关口加不变式 6 的自动关闭（MC-11）                                             | 无                                                           | `gate`、连接表                                     |
| `internal/table.ts`      | 连接表：`ensure`、`lose`、`current`、`stateOf`、`close`、`closeAll`（MC-3、MC-5、MC-10） | 每个键一个条目：聚合、传输、进程、凭据句柄、未确认停止的进程 | 五个端口、`connection`、`gate`、`settings`、`text` |
| `internal/settings.ts`   | S4 配值检查、读口的对端账号（MC-4）                                                      | 无                                                           | 契约的 `parseEndpointBody`、`peerAccountOf`        |
| `internal/text.ts`       | 两个键的规范文本                                                                         | 无                                                           | `legal-identity`                                   |
| `internal/canonical.ts`  | JSON 的规范化相等                                                                        | 无                                                           | `json-text`                                        |

依赖只指向契约成员与公共值成员。本包不依赖 Cordis、MCP SDK 或任何提供者；传输由 `McpTransportFactory` 端口交来。`src/` 里只有两个 `class`：两个聚合。服务是返回对象字面量的工厂函数。源码没有类型断言。

## 关键机制与理由

- **关口只有一份，令牌有两个。** S1 的次序与映射只在 `gate.ts`：`admit` 交出带裁决的 `GateDecision`，`admitForUse`、`stillAdmitted`、`status.inspect`、`status.list` 都在它上面组合。「先核采用再核资格」不靠纪律：需要连接的函数只收 `AdmittedEndpoint`，它只由 `judge` 在资格 `granted` 时授予；只过采用的 `AdoptedOnly` 是另一个品牌，赋不进去。两者都是带解析过正文的冻结副本，登记在模块私有的 `WeakSet` 里；运行期 `assertAdmitted` 挡住伪造的对象。
- **聚合不做 I/O，只有一个写者。** `Connection` 只做状态转移；连接表在每次端口调用之后告诉它结果，服务经 `table.settle`、`table.lose` 报告，`Ensured` 只交只读视图。非法转移抛 `TypeError`，因为它只能来自本包的编程错误。两种代际策略写成 `GenerationPolicy`：新增一种传输只加一个取值。
- **键的规范文本。** 连接表与内存存储的 `Map` 键是 `connectionKeyOf`、`catalogKeyOf` 的固定字段序 JSON 文本。租户文本来自 `tenantCodec.encode`，所以不是 `legal-identity` 造出的租户进不了表。
- **建连与关闭都单飞，代际延续。** 同一键的并发 `ensure` 共享条目上的一个 promise；同一键的关闭也只有一次在进行，`ensure` 等它完成再建，`forget` 只删仍属于本次关闭的条目。关闭后条目删除，但键的最后代际留在一张小表里，下一条连接从它继续，所以一次运行内一个键的代际不重复，W3 的 `cancel`、`continueWithInput` 可以用代际数值比较。迟到的结果（旧代际的页）经 `settle`/`lose` 的代际守卫被忽略。
- **时限由本包自己守，调用方的中止只属于调用方。** 建连的时限从取凭据起覆盖 `acquire`、`landing.start`、`open`、`discover`，取页另起同一上界；每一步经 `untilAborted` 等待，端口不尊重信号时也在时限内答复，迟到的句柄释放、进程停止、传输关闭。调用方的 `signal` 不进共享的建连：等建连、取页与发布边界各自核对它，答 `kept(cancelled)`，不标记清单。
- **失败按阶段，带着清单标记的结果回来。** `ensure` 的失败是 `{ stage: 'settings', reason }` 或 `{ stage: 'connect', reason, catalog }`：S5 要求 `refresh` 对标记写入的冲突答 `kept(superseded)`、不可用答 `unknown`，而 W3 的 `invoke` 只要 `reason`。两种消费者各取所需，标记只做一次。
- **发布边界在服务里，紧挨写入。** `mergeListing` 只核清单修订（契约 C5）；`refresh` 先做异步的核对（`stillAdmitted`：资格与采用修订），再在写入前同步核对代际与取消，中间没有 await。两次并发刷新各自取页，谁先写谁发布，另一方由存储的 `revision-conflict` 得到 `superseded`。
- **关闭只报告确认范围。** `teardown` 的次序固定：关传输、停进程（含上次未确认停止的）、释放句柄；关闭前先拒新请求并等在途的建连结束。未确认停止的进程留在条目的 `lingering` 里（带它确认的范围），视图由它报告 `residual`，下一次关闭或重建前再问一次。端口抛出时同样 `teardown` 再抛出。
- **时钟。** 清单取得时刻来自 `createMcpCore` 的 `now`；不给时读本机时钟，并按仓库规则标注为观察时刻。它不参与本包的任何判断。

## 验证与维护

每条 SPEC 条款对应的测试、反例与变异见 SPEC「结果与不变量」「组合与验证」。L3 热点是 `internal/gate.ts`、`internal/table.ts`（键、句柄释放、关闭对建连）与 `discovery.ts` 的发布边界；交错用例在 `tests/races.spec.ts`。改契约的服务条款时改同名模块；改 `Connection` 的状态机时同步 `tests/connection.spec.ts` 的合法转移表。下一波的调用口接在 `internal/table.ts`、`internal/in-flight.ts` 与 `internal/gate.ts` 上，签名见包根 README「给下一波」。
