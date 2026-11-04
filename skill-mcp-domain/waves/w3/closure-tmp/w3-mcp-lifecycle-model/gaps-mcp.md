# MCP 差距账本初稿（闭包 w3-mcp-lifecycle-model，实然 = 1160e92c8）

状态：初稿，未经评审。本账本不进仓库；reduce 收进记录分支。

应然来源：组页 `packages/mcp/docs/architecture.md`「MCP 连接」不变式 1–6 与「候选决定：并发」；`packages/mcp/mcp-contract/SPEC.md` S1–S9、AV、UE、CU、PL、CS、T1–T7；`packages/mcp/mcp/SPEC.md` MC-1–MC-15、「所有权、失败与生命周期」与「已知限制」。实然来源：1160e92c8 的 `packages/mcp/mcp/src/`。证据列引用本闭包的两种证据：探索器（`tests/model/`，场景名）与 TLA+ 模型（`verification/models/`，配置名）；其余写「源码对照」，表示只读源码比对，没有执行。

处置分三种：改实现；改承诺并给理由；登记已知限制并给退出条件。本闭包不改产品代码，处置是建议，归下一个闭包 `w3-mcp-lifecycle` 或所写拥有者。

## 一、组页「MCP 连接」不变式 1–6

| 编号 | 应然（原句与位置） | 实然（源码位置与行为） | 差距 | 建议处置 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 不变式 1 | 「键里有租户和对端账号。不同租户、不同对端账号永不共用一条 MCP 连接」（architecture.md「MCP 连接」不变式 1） | `table.ts` 以 `connectionKeyTextOf(key)` 为条目键，文本含租户、持有、采用修订与对端账号（`text.ts`）；端口调用的参数只取本键的 access 与资源 | 无 | 保持 | 探索器 two-keys 通过 P5；TLC valid-two-keys（见 verification/README.md）；既有 `ensure.spec.ts`「the connection key」 |
| 不变式 2 | 「每次重建，`generation` 加一……旧代际的迟到响应不改变新状态，也不发布新清单」 | `connection.ts` 的 `attempt()`（stdio）加代际；`lose`/`settle` 经 `isCurrent` 守卫；迟到的句柄、进程、传输经 `late.ts` 释放、停止、关闭 | 迟到路径对端口同步抛出没有去向：四条 `void` 链成为未处理拒绝（N2），迟到落点的进程 `stop()` 抛出时落点永不离开条目、进程不进 `lingering`、状态视图报 `none` | 改实现：端口调用经单一适配器把同步抛出与 reject 读成同一种类型化结局；迟到路径的链挂在条目作用域上并有错误去向 | 探索器 throws：N2 最小轨迹 5 步；TLC cex-n2。P6 本身在两种证据里都成立 |
| 不变式 3 | 「stdio 的 `preparing` 失败时，由取得者收口已经起来的进程」 | `build.ts` 的 `failed`/`shutDown`/`catch` 都经 `teardown`；迟到交来的进程由 `landLate` 停一次 | (a) 拆除的一步同步抛出时，后面的步骤不再执行（N3）；(b) 收口挂起时取得者（`ensure` 的调用方）一直等待（P2） | (a) 改实现，同上适配器；(b) 见不变式 5 | 探索器 throws：N3；TLC cex-n3、cex-n3-shutdown；P2 见下 |
| 不变式 4 | 「已关闭的 MCP 连接不证明远端调用已停。`close()` 只报告实际确认的范围。准备失败与关闭失败保留真实资源和下一处置者」 | `stopOne` 记录确认范围，未确认的进程留在 `lingering`，`stateOf` 报 `residual`；`closeEntry` 失败时条目留在表里 | (a) N3 时资源留在已关闭的条目里，`stateOf` 报 `none`，没有下一处置者能从视图看到它们；(b) 落点在途时 `release` 报 `unconfirmed` 而 `inspect` 报 `none`（W3 评审待裁 S2，SPEC 已知限制） | (a) 改实现；(b) 维持已知限制，退出条件：契约 `Residual` 增加「在途落点」一种 | 探索器 throws：`P2-held-without-entry`（N3、N2 两种成因）；源码对照（b） |
| 不变式 5 | 「连接时限……覆盖取凭据、本机进程启动、打开传输、时代判定与协商……端口不理会中止信号时，连接表自己停止等待，并收口迟到交来的结果」 | 建连的每一步经 `untilAborted` 受时限；临界区的重读与等待受 `ensure` 自己的时限（已定事项 22） | 建连失败后的收场（拆除、标记清单）与建连前对遗留进程的再停不受时限：拆除端口或存储挂起时，建连的调用方与加入它的调用方无界等待（P2、N1）。SPEC MC-5 句「拆除开始之后才来的 `ensure` 只等到自己的连接时限」对加入在途建连的调用方不成立（W3 评审 N1） | 二选一，归 `w3-mcp-lifecycle` 设计：改实现，让 `ensure` 在时限到期时答复、收场由条目作用域继续；或改承诺，把 P8 T2 收窄为「端口都答复时」并把 MC-5 那一句改正 | 探索器所有场景：P2 最小轨迹 6 步，N1 最小轨迹 4 步；TLC cex-p2、cex-n1 |
| 不变式 6 | 「接入点被撤采用或被禁用后，`Connections` 在下一次使用边界之前关闭对应的 MCP 连接……`ensure` 在建连之前再读一次采用」 | `guard.ts` 的 `withdraws` 与 `refused`；`table.ts` 的 `readAgain`、`blockingOf`、`inheritLingering` | 本闭包未发现差距；但关闭经 `close`，所以 A1（关闭在端口挂起时无界）也适用于自动关闭 | 保持；A1 维持已知限制 | 探索器与模型都只建一个采用修订，不覆盖换修订；既有 `ensure.spec.ts`、`status.spec.ts`、`refresh.spec.ts` |

## 二、契约 SPEC S1–S9

| 编号 | 应然（摘要与位置） | 实然 | 差距 | 建议处置 | 证据 |
| --- | --- | --- | --- | --- | --- |
| S1 | 先核采用再核资格；撤采用或被禁用后自行关闭连接（mcp-contract SPEC「应用服务接口」S1） | `gate.ts` 的 `admit`；`guard.ts` 的自动关闭 | 无；自动关闭继承 A1 | 保持 | 既有 `gate.spec.ts`；源码对照 |
| S2 | 调用与任务的控制 | 本波不实现（MC 范围表） | 实现尚未存在 | 下一波 | 无 |
| S3 | `McpConfig` 四字段必填，不合法时 `RangeError` | `config.ts` 的 `validateConfig` | 无 | 保持 | 既有 `config.spec.ts` |
| S4 | 配值按次序检查，只报第一项 | `settings.ts` 的 `prepareSettings` | 无 | 保持 | 既有 `ensure.spec.ts`「setting defects」 |
| S5 | `refresh` 的答复集合 | `discovery.ts` | 本闭包不覆盖 `refresh`；`refresh` 经 `ensure`，所以 P2、N1 时，调用方不给 `signal` 的 `refresh` 同样无界等待（源码对照） | 随不变式 5 处置 | 源码对照；既有 `refresh.spec.ts` |
| S6 | 通知经观察函数交出 | 调用口，本波不实现 | 实现尚未存在 | 下一波 | 无 |
| S7 | 连接状态五态与 `residual`；关闭时确认停止回到 `none`，否则 `lost`（`close-unconfirmed`）带 `residual` | `table.ts` 的 `stateOf` | N3、N2 时资源仍被持有而视图报 `none`（见不变式 4 (a)） | 改实现 | 探索器 throws：`P2-held-without-entry` |
| S8 | `release` 与 `closeAll` 只报告实际确认的范围 | `table.ts` 的 `close`、`closeAll` 与 `teardown.ts` 的 `confirmedOf` | (a) B1：`closeAll` 期间在途落点的句柄 `release()` 同步抛出时成为未处理拒绝，宿主进程退出（W3 评审 n9 实证）；(b) A1：拆除端口或在途建连的端口挂起时，`release`、`closeAll` 不答复 | (a) 改实现：`abandoned` 在创建时就有处理器，或经适配器；(b) 维持已知限制，退出条件：契约给关闭一个上界与「未确认」的答复 | 探索器 throws：B1 最小轨迹 6 步；TLC cex-b1；A1 见证轨迹（探索器 rebuild、faults，TLC probe-a1） |
| S9 | 每条连接取一次句柄；进程句柄在 `stop()` 返回之后释放；准备失败时立即释放 | `build.ts` 取一次；`teardown.ts` 的 `releaseHeld` 在停进程之后；在途落点的句柄随落点 | N3：句柄的 `release()` 同步抛出后，`catch` 再次拆除，`release()` 被调用第二次；关闭途中一步抛出时句柄永不释放 | 改实现 | 探索器 throws：`P1-released-twice` 最小轨迹 4 步，`P1-never-released` 9 步；TLC cex-n3 |

## 三、契约端口条款 AV、UE、CU、PL、CS、T

这些条款约束端口的实现方。这里只对照本包作为消费方怎样对待端口违约。

| 条款组 | 应然 | 实然 | 差距 | 建议处置 | 证据 |
| --- | --- | --- | --- | --- | --- |
| AV1–AV6 | 采用口答复形状与 `unknown` | `gate.ts` 经 `answerOf` 把 reject 读成 `unknown`（MC-15） | 同步抛出没有读法：重读采用时抛出，`ensure` 以该错误 reject（交给调用方，有去向） | 随适配器一起定：抛出与 reject 同读 | 探索器 throws：`ensure` 以 `PortFault` reject，不计违例 |
| UE1–UE5 | 资格答复 | `gate.ts` 经 `answerOf` | 探索器不覆盖资格 | 无 | 既有 `port-breach.spec.ts` |
| CU1–CU7 | 句柄与 `release()` | 句柄的 `release()` 经 `answerOf` 吸收 reject | 同步抛出不吸收：N3、N2、B1 | 改实现 | 见 S8、S9 |
| PL1–PL5 | `stop()` 的确认范围；可重复调用 | `stopOne` 经 `answerOf`；未确认留 `lingering` | 同步抛出不吸收：N3（停进程的循环中止）、N2（迟到进程） | 改实现 | 探索器 throws；TLC cex-n3-shutdown |
| CS1–CS8 | 存储读写与 `unavailable` | `markCatalog` 经 `answerOf`；不受时限 | N1：存储挂起时建连的调用方无界等待 | 随不变式 5 处置 | 探索器所有场景；TLC cex-n1 |
| T1–T7 | 传输失败分四种；`close()` 只关闭传输 | `build.ts` 的 `failedOf`；`closeTransport` 经 `answerOf` | 同步抛出不吸收：N3（`close()` 抛出时停进程与释放句柄被跳过，条目留着资源） | 改实现 | 探索器 throws：`P1-never-released`、`P3-not-asked` 最小轨迹 9 步 |

## 四、成员 SPEC 的陈述与实然

| 位置 | 陈述 | 实然 | 差距 | 建议处置 |
| --- | --- | --- | --- | --- |
| MC-5 | 「收口时调用的 `close()`、`stop()`、`release()` 按 MC-14 吸收 reject，所以收口不留下未处理拒绝」 | 对 reject 成立；对同步抛出不成立（N2） | 陈述的前提只含 reject，结论却写成无条件 | 改实现后保留原句；或在原句加「端口以 reject 违约时」 |
| MC-5 | 「拆除开始之后才来的 `ensure` 只等到自己的连接时限」 | 加入在途建连的 `ensure` 等到建连收场结束，存储挂起时无界（N1） | 陈述过头（W3 评审 N1） | 随不变式 5 处置 |
| MC-10 | 「`closeAll` ……先释放在途落点的句柄……等全部拆除结束后报告」 | B1：释放抛出时未处理拒绝 | 见 S8 (a) | 改实现 |
| MC-14 | 「拆除不因端口 reject 而 reject」「每步都执行」 | 对 reject 成立；同步抛出时拆除 reject、后续步骤跳过（N3） | 承诺只覆盖 reject，与结构性处置「单一适配器」的方向不一致 | 改实现，再把承诺扩到同步抛出 |
| 已知限制「拆除的端口挂起」 | 列出 `closeAll`、`release`、自动关闭、`lose` 与建连自身拆除的调用方会挂起 | 与实然一致（A1、P2） | 与性质 P8 T2 冲突：P2 被登记为限制 | 由 `w3-mcp-lifecycle` 决定 T2 是承诺还是限制；A1 保持限制 |
| 组合与验证「未覆盖」 | 「端口同步抛出……没有用例」 | 本闭包的探索器已覆盖，并找到 B1、N2、N3 | 文字过时 | 修复闭包同步改写 |
| 已知限制「discover 途中关停」（W3 评审待裁 P3） | 已定事项 5 只在取得凭据之后与进程交来之后核关停 | `closeAll` 发生在 `discover` 途中时，`ensure` 仍答 ok；P4 成立（之后不再启动进程、不再打开传输） | 不违反 P4；是否要求关停后不再答 ok 由负责人定 | 只有负责人能定 |

## 五、本闭包新增的事实

- N3（新）：拆除的一步（`closeTransport`、`stopOne`、`releaseHeld`）在被调用时同步抛出，拆除 reject，后续步骤不执行；建连的 `catch` 再拆除一次时，同一句柄的 `release()` 被调用两次。根因与 B1、N2 相同：端口调用没有单一的适配器，同步抛出与 reject 走两条路。
- 探索器在 1160e92c8 上的确定性：每次重放都核对路径与投影，没有一次偏离（停止条件未命中）。

## 六、证据位置

- 提交：c4beb9e1e（探索器）、097492b97（TLA+ 模型与配置）、3ecafb718（SPEC「性质与证据」与 verification 文档），基线 1160e92c8。
- 探索器的运行记录：`tmp/closures/w3-mcp-lifecycle-model/explorer-final/`（每个场景的 `.txt` 与 `.json`，含最短调度）。
- TLC 的运行记录：`tmp/closures/w3-mcp-lifecycle-model/tlc/final/20261104T144446Z/`（16 个配置的原始输出与 `summary.json`）。
- 变异的运行记录：`tmp/closures/w3-mcp-lifecycle-model/mutations-final/`。
