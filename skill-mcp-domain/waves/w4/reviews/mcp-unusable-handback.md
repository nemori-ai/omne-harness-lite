# w4-mcp-unusable 产品写者交回要点（派发者整理）

产品写者（developer product，Opus 5.5 high）在 `78d850505` 交回。下面按它的交回原文整理，供关口评审者使用。整理不是验证，评审按代码与运行读数判。

## 提交

| 提交 | 内容 |
| --- | --- |
| `71a0fe978` | 契约：类型、决策层与脚本化传输 |
| `9fc4eade3` | 契约：符合性套件三处比较用推导函数得出标记；`decisions.spec`、`public-entry.spec` 随形状更新 |
| `77a789367` | `mcp-host-local`：会话交出的答复带标记；stdio 夹具改为「关闭 stdin 但仍然存活」的进程实现 X02；用例与 SPEC、`verification/` 同步 |
| `871c93f41` | `mcp`：`lostOf` 取代按原因的三个映射；三个服务改用它；新用例；探索器替身带标记 |
| `963d0b26d` | `mcp-host-local`：两条用例（「关闭优先，不带标记」与 `handedOver` 写入标记） |
| `78d850505` | 两份 SPEC、`public-api.md`、`mcp/verification/README.md` |

## 全函数

`packages/mcp/mcp/src/internal/lost.ts`：`lostOf(answer: TransportFailure | PeerAnswer): Lost | undefined`。

1. `not-sent`（非 `authorization-required`）或 `no-answer` 带 `unusable` → `{ reason: unusable, mark: 'connection-unavailable' }`。
2. `not-sent`（`authorization-required`）→ `{ reason: 'authorization-required', mark: 'authorization-required' }`。
3. 其余（`error-answer`、`answer-malformed`、`result`、`error`、不带标记的答复）→ `undefined`。

按 `kind` 穷尽，`default` 为 `never`；不按 `cause` 判断传输是否可用。调用点：`calls.ts:311`（`loseIfLost`，第 9 步与第 12 步；第 12 步判分类之前的 `PeerAnswer`）、`tasks.ts:152`（`failureOf`）、`discovery.ts:106`／`:154`（`lostPageOf`／`pageLost`）。T5 停止信号的单独跳过分支已删：两种停止答复都来自 `stopAnswerOf`，都不带标记，按第 3 条连接不变。

## 写者自定的事（要评审核对）

1. 就绪连接上 `discover` 答 `error-answer` 或 `answer-malformed` 时，契约 S5 原写转 `lost`（`discover-failed`），改为转 `degraded`（`discover-failed`）。依据：全函数第 3 条；建连中的失败归 MC-5；本包没有就绪连接上的 `discover`（`transport.discover()` 只在 `internal/build.ts:308`）。S7 的 `discover-failed` 这个 `lost` 原因只剩建连一种来源。
2. `streamGoneAnswerOf` 的参数从 `NoAnswerCause` 收窄为 `Exclude<UnusableCause, 'session-ended'>`（公开签名，0.x，组内没有别的调用方）。
3. `unusableAnswerOf` 保留已有的标记：会话第二次断开时，`lineGoneAnswerOf` 写入新原因，`handedOver` 只补没有标记的答复。
4. 探索器替身 `tests/model/ports.ts` 的 `NOT_SENT` 与 `STREAM_BROKEN` 带 `stream-broken` 标记，让探索器仍经过转 `lost` 的交错。没有加新性质（守护写者加）。

## 契约 SPEC 改了哪些条款

T1（可选字段 `unusable` 的含义、哪些失败带它、只由决策层写、单调、`close()` 之后不带）；T8 前言；S5（首句改为按标记；本条 `discover` 只指就绪连接；不带标记的页失败与 `discover` 失败转 `degraded`；时限先于清单标记到期时清单标记 `pending`）；S7（原因取标记；「传输不再可用」一条与全函数一致）；S8（`closeAll` 有本包错误时以 `AggregateError` 拒绝）；R1 与 S2 写成同一句；R7 的 `no-connection` 含「资格不是 `granted`」；调用口闭包的裁定第 32 条。

## 写者门禁（`78d850505`）

- 三包 `build typecheck test`（`VITEST_MAX_WORKERS=6`）退出 0：契约 683、`mcp-host-local` 410（1 skipped）、`mcp` 501（含探索器）；日志 `logs/acc1-test.log`（`6174c3d1e08ba570`）。`test:slow` 退出 0（`1f2318520fa2031a`）。
- `typecheck`、`lint:rules`、`lint:oxlint`、`format:check`、`check:docs` 退出 0；`lint:deps` 退出 1，8 处 `no-unresolvable` 全在组外三个未构建成员（派发者在 Skill 闭包上已证实构建后为 0）。
- 变红验证 U1–U14（`tmp/closures/w4-mcp-unusable/mut/`，驱动 `mutate.py`），U1–U5 与 U12 记进 `mcp/verification/README.md`。

## 写者点出的范围外说明（已交守护写者修）

- `packages/mcp/mcp/docs/architecture.md:25` 关于 `internal/lost.ts` 的旧句。
- `packages/mcp/mcp/README.md:82` 关于偏离的旧句。

## 未覆盖（写者原话整理）

- `tasks.ts` 的 `resultOf` 不问 `lostOf`：`finished.answer` 来自读取器，只产出 `result` 或 `error`，目前没有 `no-answer` 路径。
- 跨服务的完整组合验证没有做。探索器只证明已有性质在新形状下仍成立；新性质与漏标、错标的违约实现归守护写者。
