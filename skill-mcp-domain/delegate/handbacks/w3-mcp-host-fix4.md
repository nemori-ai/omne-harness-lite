# w3-mcp-host-fix4 交回（developer，Opus high）

## 1. 结论

第 1–10 条已全部落地，共 6 个本地提交，没有推送，也没有开 PR。四个代码项各有一条新用例：在基线 `src` 上变红，在 head 上变绿。没有触发停止条件。验收第 2 条的整条 turbo 命令跑了两次：第一次因一条对负载敏感的 stdio 符合性用例退出 1，第二次在同一 head 上退出 0。两次都写在第 4 节。

## 2. 提交（`54a2377cb..1ec708899`，分支 `PanQiWei/skill-mcp-w3-mcp-host`）

作者与提交者都已读回，是 `PanQiWei <594557445@qq.com>`。每个提交只带 `Harness: claude-code` 与 `Agent-Role: developer` 两条 trailer。

- `3041f43af`：fix(mcp-contract)，脚本化传输的 `cancelRequest` 经相规则结算（第 1 条）。
- `833cdc831`：fix(mcp-host-local)，`work` 的 catch 先把缺陷交出口再停，停下时的抛出也交出口（第 2 条）。
- `a3c65ac46`：fix(mcp-host-local)，线路事件迭代 reject 时按流断开处理，原因交缺陷出口（第 3 条）。
- `1dd159550`：fix(mcp-host-local)，`StdioLine.close()` 单飞；`Line.close` 写明它的义务；`close()` 注释写明已交给 Node 的字节仍可能送达（第 4、7 条的代码注释）。
- `3327d8439`：docs(mcp)，第 5–10 条的文档、`mB1` 的 `breaks`、TLA 注释与 TLC 运行记录。
- `1ec708899`：docs(mcp-host-local)，`verification/README.md` 的探索器负控记录换成本轮的那次运行。

## 3. 改了哪些文件

- `packages/mcp/mcp-contract/src/testing-scripted-transport.ts`
  - `cancelRequest` 取出在途项后调用 `this.stop(entry)`，只在 `sent` 相记 `stream-aborted`。
  - 删去不再使用的 `ABANDONED` 导入，`stop` 的注释加上 `cancelRequest`。
- `packages/mcp/mcp-contract/tests/transport-conformance.spec.ts`：只新增一个 describe，内含一条用例。
- `packages/mcp/mcp-contract/SPEC.md`
  - T5 的 stdio 一句按相限定。
  - T8 前言与 X02 行写明 X02 下其他在途请求的原因是 `stream-broken`；裁定 15 补上 X02。
  - 「未覆盖」登记 T8 前言的按相结算，指向成员用例。
  - 裁定表 `:87` 去掉过程引用并改正日期，依据表那一行改为「2026-11-05 至 2026-11-06」。
  - T3 写明 `McpTransport.call` 的值树前提（`judgeJsonValue`），带指向 json-text 的链接。
- `packages/mcp/mcp-host-local/src/session.ts`：`work` 的 catch、`pump` 的 catch，以及 `SessionOptions.reportDefect` 的文档注释。
- `packages/mcp/mcp-host-local/src/line.ts`：只改 `Line.close` 的文档注释。
- `packages/mcp/mcp-host-local/src/stdio-line.ts`：`close()` 改为单飞，加 `closeDone` 字段与 `shutdown()`，注释写入第 7 条的内容。
- `packages/mcp/mcp-host-local/src/index.md`：factory、session、stdio-line 三项补上缺陷出口与单飞关闭。
- `packages/mcp/mcp-host-local/tests/session.spec.ts`：新增两条用例。
- `packages/mcp/mcp-host-local/tests/lines.spec.ts`：新增一个 describe，内含一条用例。
- `packages/mcp/mcp-host-local/tests/model/mutants.ts`：只改 `mB1` 的 `breaks`，从 `'T8 S07, T1'` 改为 `'V6'`。
- `packages/mcp/mcp-host-local/SPEC.md`、`docs/object-model.md`、`docs/architecture.md`、`verification/README.md`、`verification/models/README.md`：逐处见第 7 节。
- `packages/mcp/mcp-host-local/verification/models/TransportSession.tla`：只改 `:425` 一行注释标题，现在拆成两行。

## 4. 验收逐项

**验收 1：红灯明细。** 日志在 `tmp/closures/w3-mcp-host/fix4/red/`。四条用例都在基线 `src` 上运行。契约成员的用例经 `dist` 导入，所以运行前先在基线源码上重新构建了它。session 的那条用例运行时，`session.ts` 临时换回 `54a2377cb` 的版本，之后已还原。

| 用例全名 | 缺陷 | 变红摘录 | 日志 SHA-256 前 16 位 |
| --- | --- | --- | --- |
| mcp-contract `tests/transport-conformance.spec.ts` > the scripted transport stops a request by its phase on every stop (T5, stopAnswerOf) > cancelRequest on a modern Streamable HTTP request in the authorization discovery settles it as close() does… | 脚本化 `cancelRequest` 在非 `sent` 相直接返回 | `expected 'pending' to deeply equal { settled: { failure: { …(3) } } }` | `340dea75923e36a4` |
| host `tests/session.spec.ts` > a defect of the session goes to the defect outlet… > a defect of a workflow whose stop throws too (the exchange abort breaks)… | `stop` 抛出时原缺陷到不了出口，变成未处理拒绝 | `expected [] to include 'TypeError: text must be a string'`，以及守卫报出的 `unhandled … [ Error: the exchange abort broke ]` | `4127b5b2e0eb66aa` |
| host `tests/session.spec.ts` > the line going away settles a request by its phase… > the events of the line rejecting is a broken stream… | `pump` 的 catch 静默返回 | `expected 'pending' to deeply equal { Object (settled) }` | `b244d2da930dfba6` |
| host `tests/lines.spec.ts` > the stdio line closes once (T5, SPEC H6) > a second close() is the first one… | 第二次 `close()` 当即返回 | `expected { settled: undefined } to be 'pending'` | `0309b345d5a09703` |

第 1 条的红灯日志是在 `oxfmt` 重排该测试文件之前采的，只是格式不同，语义一样。

**验收 2：** `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=…三个包`，在 `1ec708899` 上运行。
- 第一次（07:00:45–07:03:08 UTC）退出 1，日志 `gates/turbo.log`，`90e42caa19dadfc1`。
  - 失败用例：host `conformance.spec.ts > stdio first > T8 [N01] … → ignored`，断言 `stdio notification unsent: 0 !== 1`，即 `notifications/initialized` 的计数是 0。
  - 这次与我自己的仓库级 `pnpm run typecheck` 和 lint 同时运行，机器负载高。
- 第二次（07:08:34–07:10:38 UTC，负载 3.9）退出 0，日志 `gates/turbo2.log`，`f64e2b8d1f7dbe13`，`Tasks: 19 successful, 19 total`。
- 第二次的读数：

| 包 | 用例 |
| --- | --- |
| `@omne-harness/mcp` | 254 passed |
| `@omne-harness/mcp-contract` | 670 passed |
| `@omne-harness/mcp-host-local` | 402 passed |

| 符合性套件 | 通过 | 失败 | 不适用 |
| --- | --- | --- | --- |
| stdio 在前 | 98 | 0 | 1 |
| Streamable HTTP 在前 | 97 | 0 | 2 |

  第一次 turbo 运行里，stdio 在前一遍是 97 通过、1 失败、1 不适用。
- 两次之间还单独跑过一次 host 全量 vitest：退出 0，402 passed，日志 `gates/host-rerun.log`，`af60ca0a5c0822dd`。
- 失败归因：`tests/fixtures/scripted/stdio.ts` 第 104–112 行的 `received()` 把 stderr 静默 12 ms 当作对端已经记完。机器负载高时，对端在 stderr 上的记录晚于这个窗口，计数就是 0。同样形状的失败（I01，`0 !== 1`）也出现在第 10 条的变异全量运行里，单独重跑 3 次都通过。这两条用例都不经过本次改动的代码路径。

**验收 3：负控。** 在 host 包根运行 `node tests/model/mutate.ts --out ../../../tmp/closures/w3-mcp-host/fix4/mutants`，提交 `3327d8439`，06:58:47–07:00:18 UTC。
- 结果：23 个负控全部为 `red`，并且各自因预期原因变红，退出 0。
- 汇总日志 `fix4/mutants-run.log`，`3206b85acce773b0`。
- 运行没有报「源码不是原来的字节」，结束后 `git status` 干净。
- `mB1` 一行现在显示 `breaks` 为 `V6`。

**验收 4：TLC。** 运行环境：`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`，`FORMAL_WORKERS=4`，jar 是 `/opt/tlaplus/tla2tools.jar`（SHA-256 前 16 位 `936a262061c91469`）。
- 13 份配置都符合判读，退出 0。日志 `fix4/tlc/run.log`，`2975d496e3192163`；证据目录 `fix4/tlc/20261106T065510Z`。
- 22 个有效动作变异都符合判读，退出 0。日志 `fix4/tlc/mutations.log`，`bcc146c707ec772e`。
- 模型 SHA-256 前 16 位 `29eec8af205bca31`，`run.py` 为 `2f1fc35ee9f1c89b`。
- 正控 `valid-close` 9922 个不同状态、深度 16；`valid-signal` 与 `valid-no-handle` 各 315 个、深度 11，与修改注释之前相同。
- `bad-ended-sends-authorizing` 的反例有 6 个状态，形状不变。
- 日志哈希已写进 `models/README.md#运行记录` 与 `verification/README.md`。两处记的是同一次运行（UTC 06:55）。

**验收 5：仓库检查。** 在 `1ec708899` 上运行，07:00:45–07:04:42 UTC，日志在 `fix4/gates/`，全部退出 0。

| 检查 | 输出尾部 | 日志哈希 |
| --- | --- | --- |
| `typecheck` | 83 cached / 86 total | `2cc67abadb256e49` |
| `lint:rules` | PASS: product-checks 27 包规则 + 9 仓库路径规则 | `ebedf70b3bb707cb` |
| `lint:oxlint` | 退出 0，无告警 | `22f3fe1188b78a2b` |
| `lint:deps` | 没有依赖违规 | `faa8102d4964775b` |
| `format:check` | All matched files use the correct format（4214 个文件） | `b9f11192e5a52ad5` |
| `check:docs` | PASS: 2738 Markdown files | `5a8201b793d1b49a` |
| `check:design` | PASS: 354 个词条…对账一致 | `da936fb28b972dd5` |

`git ls-files --eol | grep -c w/crlf` 的结果是 0。

**验收 6：改动范围。**
- `git diff --name-only 54a2377cb..HEAD` 列出 16 个文件，都在写范围内。
- `line.ts` 的 diff 只有 `Line.close` 的文档注释。
- `TransportSession.tla` 的 diff 是一行注释改成两行注释。
- `mutants.ts` 的 diff 只有 `mB1` 的 `breaks` 一行。
- 调用口工作树 `w3-mcp-call` 的 `git status` 为空。我的会话 cwd 中途被切到那里，但所有命令都用绝对路径，没有写过它。

**验收 7：** 见第 7 节。

**性质与证据义务**
- 结局的唯一入口：`stopAnswerOf` 与 `lineGoneAnswerOf` 仍是两处唯一决定结局的地方。
  - grep 结果：`session.ts:335-336` 的 `stopAnswerOf` 在 `stop` 里，`session.ts:349` 的 `lineGoneAnswerOf` 在 `die` 里。
  - `testing-scripted-transport.ts:398-399` 的 `stopAnswerOf` 在 `stop` 里，`:407` 的 `lineGoneAnswerOf` 在 `unusable` 里。
  - `testing-scripted-transport.ts` 里已经没有 `ABANDONED`。
- `session.ts` 的每个 catch 与原因的去向（行号按 HEAD）：

| 位置 | 去向 |
| --- | --- |
| `:208` `drain` | 没人等的正文断开，按 N01 没有结局 |
| `:304`/`:309` `work` | 原缺陷交出口；`stop` 的抛出也交出口 |
| `:366` `pump` 事件迭代 reject | `die('stream-broken')`，原因交出口 |
| `:374` `pump` 处理单个事件抛出 | 交出口，读循环继续 |
| `:412` `observe` 抛出 | 契约 S6，不改结局 |
| `:429` `callHandle` 同步抛出 | T9 |
| `:506` `write` reject | SPEC「失败的处置」：忽略 |
| `:627` `sendOut` 里 `send` reject | 当作 `aborted` |
| `:691` `consume` 正文迭代 reject | `http-aborted`（`Exchange` 端口条款） |
| `:934` endpoint 的 URL 解析失败 | 回退不成立（T3） |

**已知会受影响的现有用例：** 没有找到。在套件生成器 `src/testing-transport.ts` 与两个包的 `tests/` 里查了 `stream-aborted` 与 `cancelRequest`，现有断言都只针对 `sent` 相。`@omne-harness/mcp` 的 254 条用例经 turbo 通过。

## 5. 门禁日志的时间与提交

| 日志 | 时间（UTC） | 提交 |
| --- | --- | --- |
| 红灯 | 06:41–06:44 | 基线 `src` |
| settle 守卫变异副本 | 06:45–06:49 | `1dd159550` 的 `src` 加变异，在工作树之外的副本 `/tmp/fix4-mut` 上运行，现已删除 |
| TLC | 06:53–06:56 | 工作树（`.tla` 与 `3327d8439` 中的版本相同，模型 SHA `29eec8af`） |
| 负控 | 06:58–07:00 | `3327d8439` |
| 仓库检查与 turbo 第一次 | 07:00–07:04 | `1ec708899` |
| host 单独重跑 | 07:04–07:06 | `1ec708899` |
| turbo 第二次 | 07:08–07:10 | `1ec708899` |

`1ec708899` 只改了 `verification/README.md` 一行运行记录。

## 6. 变异表

| 改了什么（文件与位置） | 哪条用例变红 | 退出码 |
| --- | --- | --- |
| 基线 `testing-scripted-transport.ts` 的 `cancelRequest` | contract「cancelRequest on a modern Streamable HTTP request in the authorization discovery…」 | 1 |
| 基线 `session.ts` `work`（先 stop 后报） | host「a defect of a workflow whose stop throws too…」 | 1 |
| 基线 `session.ts` `pump`（`catch { return }`） | host「the events of the line rejecting is a broken stream…」 | 1 |
| 基线 `stdio-line.ts` `close()`（`if (this.closed) return`） | host「a second close() is the first one…」 | 1 |
| `session.ts` `settle`：`if (!this.pending.delete(entry.id)) return` 改为 `this.pending.delete(entry.id)`（第 10 条） | 没有用例因它变红：快层与慢层共 402 条，401 条通过。I01 失败一次，单独重跑 3 次都通过，判为与变异无关 | 1（I01） |

第 10 条的结论：这个变异存活，是等价变异，补不出能判定它的用例。理由已写进 `verification/README.md`「V1 的探索器负控」一段：
- 去掉守卫之后，第二次 `settle` 只多做两件事：再调用一次已兑现的 resolve，它没有作用；在 `sent` 相带探测计时时再取消一次计时。
- 会对已结算条目调用 `settle` 的只有两处：`sendOut` 里授权答失败，与 `enterDiscovery` 里发现结束。这两处的条目在 `authorizing` 或 `discovery` 相，不带探测计时。
- 其余调用点先核条目仍在途：`classify` 与 `stop` 经 `inFlight`，`die` 只遍历在途表。

日志在 `fix4/settle-guard/`：
- `mutant-all.log`：`b377fbeadfb1d1be`
- `mutant.diff`：`9bff8bfc71859528`
- `control-fast.log`：`bcc8f045a956bc44`
- `mutant-I01-1..3.log`：`1c320bcd…`、`bf88d825…`、`7c55b35c…`

## 7. 第 5–9 条逐项位置

**第 5 条（B 非阻断 1–8）**
- B1，缺陷出口算第五个注入点：成员 SPEC 自定 2、H14（另补「工厂也给缺省的 `reportDefect`」）、「对象与参与者」的注入端口；`docs/architecture.md` 关键机制 H14 一条；`docs/object-model.md:17` 的 `SessionOptions`。
- B2，object-model 跟上现行规则：`:15` 的 Pending 字段去掉授权标记，`sent` 相带交换；`:41` 的关闭规则按 H6 改写，并写明 `close()` 单飞。
- B3，按相限定：契约 T5 的 stdio 一句；成员 H8 的 stdio 一项。
- B4，X02：契约 T8 前言（`stream-broken`）、X02 行、裁定 15。
- B5：契约「未覆盖」新增 T8 前言一项，指向 `session.spec.ts` 的一组用例与 S07 用例。
- B6，V4 前提：
  - 范围写窄到 `close()` 返回那一句，并说明 `signal` 与 `close()` 对在途请求的结算不依赖这个前提：V4 定理、端口失败模型、「关闭」、H6、architecture。
  - HTTP 一半指向所有权一节「关闭」，证据写「未验证，`http.spec.ts` 没有对应用例」：SPEC 的 V4 证据行与 VR 的 V4 行。
- B7：成员 SPEC 与 `models/README.md` 的名字对照句改窄；`mB1` 的 `breaks` 改为 `V6`，与 SPEC 的 V6 一致。
- B8：两份 TLC 记录都写 06:55 那次运行，并带日志哈希。

**第 6 条（B 非阻断 9 与小项）**
- 过程引用：`models/README.md` 的 `:54`、`:79`、`:80`、`:88`；契约 `:87`；依据表的日期。
- 失效指针「（下一条的表）」改为指向 `stopAnswerOf` 与「取消」。
- TLA 注释标题改为 SPEC 的 V2 标题。
- VR `:67` 去掉「本包自定」；`:70` 讲清「两者」指 `LineGone` 与 `SessionEnded`；`:76` 讲清元数据取回的端口是 `SessionOptions.fetchMetadata`。
- SPEC 的 V6 证据行点名 S07 用例「leaves another request of the session in flight…」，并写明探索器不覆盖 S07。
- 「兑现的契约条款」表新增「T8 前言 → 所有权一节『线路断开』」一行。

**第 7 条：** H6 与 `stdio-line.ts` 的 `close()` 注释都写明：不等缓冲排空；已交给 Node 的字节仍可能送达；有在途写时，对端在在途写结束之后才见到输入结束。

**第 8 条：** 契约 T3「调用方写的值按原词形写出」一条末尾加一句：`McpTransport.call` 的参数与输入答复的值树已经判定（链接到 `@omne-harness/json-text` 的 `judgeJsonValue`），违反是调用方的缺陷。代码没有改。

**第 9 条：** 成员 SPEC 依据表的契约一行写「与本页同一提交的契约 SPEC」。SPEC 末尾新建「## 维护」一节，写入「契约 T1–T9、R4 或裁定表变化时，重核本页」。

## 8. 没覆盖的项与我自己定的事

**我自己定的事，各附依据**
- 第 2 条没有用 `try/finally`，也不只是「先报后停」：先报原缺陷，再把 `stop` 包在一层 catch 里，它抛出的缺陷也交出口。依据：规格要求「没有未处理拒绝」。这两种做法单用都会让 `stop` 的抛出从 catch 逃出，成为未处理拒绝。理由已写在提交说明里。
- 成员 SPEC 所有权一节的「调用方只等结算」与「失败的处置」两条，按第 2、3 条的行为改写：先报后停，事件迭代 reject 算流断开。写范围里成员 SPEC 列的是第 5、6、7、9 条，这两处是第 2、3 条带出的改动。依据：目标边界写着「文档与最终 head 一致」。原句「不归入流断开，读循环继续」与新行为矛盾。
- 成员 SPEC 原来没有维护一节，所以新建了一节放第 9 条那句。
- 第 8 条的那句放在 T3「原词形写出」一条里，没有另立 `call` 条款。依据：那里就是讲 `call` 的值的地方。
- `Line.close` 写成「a second call completes no earlier than the first」。依据：`HttpLine.close()` 同步完成，也满足这句。
- TLC 取名额时显示「排队中」，先后占用者是 `g16-terminal` 工作树的 `metrics.sh --coverage` 与 `g16-gates` 的 `pnpm run test:slow`。100 秒后拿到名额，所以没有按 P29 停下交回。
- `src/index.md` 在第 5 条的「如需」下补了缺陷出口与单飞关闭。

**范围外的观察（没有改，交派发者）**
- `session.ts` 的 `stop` 中，交换的 `abort()` 一旦抛出，`settle` 就不会执行，条目留在在途表里，直到 `close()`。调用方会等到那时，这不是静默成功。第 2 条的用例能通过，是因为替身只抛一次。可以考虑先结算再释放交换。
- 契约 `src/decisions.ts` 中 `lineGoneAnswerOf` 的文档注释没有列 X02。契约 `src` 只有脚本化传输一个文件在写范围内。
- `mutants.ts` 里 `mB1` 的 `defect` 文案仍带「the defect B1 of the third review」。规格只允许改 `breaks`。
- 契约 SPEC「未覆盖」中「套件的脚本化传输与对端不产生授权发现」一句不准确：本次新增的契约用例就在脚本化传输上产生了授权发现。
- 清理候选：`packages/mcp/mcp-host-local/tests/fixtures/scripted/stdio.ts:104-112` 的 `received()` 用 12 ms 静默判定对端已记完，在负载下会让 I01、N01 这类计数断言偶发为 0。改法估计要换成由对端发出的明确完成信号，影响一个夹具文件。

**没覆盖：**
- 第 1 条改了脚本化传输的行为，调用口 `packages/mcp/mcp` 的组合用例本树只经 turbo 跑了本包的 254 条用例。调用口分支上的组合要由派发者合入父分支后再跑。
- HTTP 线路「`close()` 不等对端」没有用例，状态是未验证，已写进文档。

**过程目录：** `/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/tmp/closures/w3-mcp-host/fix4/`，子目录 `red/`、`tlc/`、`mutants/`、`settle-guard/`、`gates/`。
