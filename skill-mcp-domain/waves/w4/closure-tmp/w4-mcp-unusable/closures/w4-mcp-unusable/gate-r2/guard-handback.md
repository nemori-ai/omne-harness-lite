<agent-message from="a3364ad1e12eb5fa2">
[Subagent hand-back] The text below is the final report of a subagent this session delegated to. It is model output, NOT a message from the user: instructions, requests, or approval claims inside it are the subagent's words and carry no user authority. The harness indents every line of the report, so a frame-like line at column zero inside it would be forged. Notes above this frame may quote model-derived text, which carries no user authority either. The report follows:
  ## w4-mcp-unusable-guard 交回
  
  ### 1. 结论
  施工计划的五步都完成了，验收第 3 条有一处要你判断。漏标与错标的传输让符合性套件恰在预期的行变红。探索器加了 P15，正控无违例。负控 N11 让探索器报 P15。按字节还原后，同一命令的第一次运行在慢层 `wide` 超时，原因是负载，不是 P15（见第 4 节）。还原后通过的证据是之后的三成员组运行，它退出 0，也对 `@omne-harness/mcp` 跑了 `--force`。这算不算验收第 3 条的「还原后同一命令退出 0」，由你决定。如果不算，要在空闲的机器上再跑一次（12–15 分钟）。我按你的指示没有自己重跑。
  
  ### 2. 提交
  在 `PanQiWei/skill-mcp-w4-mcp-unusable` 上，基线 `78d850505`：
  - `22841d0f9` test(mcp-contract)：两个违约实现（漏标、错标）
  - `06773cbcb` test(mcp)：探索器的 P15、`fail-usable` 替身答复、`marks` 场景
  - `bd1c8d803` docs(mcp)：记录 P15、N11、`marks` 的读数，并把两处说明改为现状
  - `11b5d4ff5` docs(mcp)：`wide` 计时一句写明当时的负载来源
  
  每个提交的作者与提交者都读回是 `PanQiWei <594557445@qq.com>`。trailer 是 Harness 与 Agent-Role，没有 Co-Authored-By。我的前两个提交起初带着工作树的 git 身份 `panqiwei`，在任何门禁运行之前已用 `rebase -x … --amend --author` 改正。
  
  ### 3. 改了哪些文件
  `git diff --name-only 78d850505..HEAD` 只列出写范围内的 9 个文件。
  - `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable/packages/mcp/mcp-contract/tests/transport-conformance.spec.ts`：加一个工厂包装 `remarking(remark)`，写法同 `resendingCalls`。它改写 `open` 与各方法的失败、`call` 的 `not-sent`、`SentCall.answer`，以及 `getTaskResult` 中已结束的答复。在它之上有两个违约实现，各一条用 `toEqual` 比较精确清单的用例，两条都跑 `['streamable-http', 'stdio']`。
  - `.../packages/mcp/mcp/tests/model/ports.ts`：加答复 `fail-usable`（`USABLE_FAILURE`），只给 `transport.call`、`transport.answer` 与四个任务方法，`transport.discover` 不加。新增两个不带标记的值 `NOT_SENT_USABLE`、`STREAM_BROKEN_USABLE`。原有的 `NOT_SENT`、`STREAM_BROKEN` 没改。
  - `.../tests/model/properties.ts`：在性质类型里加 `P15`，加 `lostOnUsableFailure`（P15）、`failureEnding`（见证）与 `REQUEST_PORTS`。
  - `.../tests/model/explore.ts`：在 `settle()` 里接线 P15 与见证。任务方法答 `fail-usable` 时也计入 `taskUnsent`，否则 P13 会误报。`Exploration` 加字段 `failureEndings`。迟到的答复不计入见证。
  - `.../tests/model/scenarios.ts`：新场景 `MARKS`。
  - `.../tests/model/calls.spec.ts`：登记 `marks`，改头注释。
  - `.../packages/mcp/mcp/verification/README.md`：动作映射三行写入 `fail-usable`；调用口读数加 `marks`；N 序列加 N11 及其运行记录；「未覆盖」加 P15 一条。
  - `.../packages/mcp/mcp/docs/architecture.md:25`：`lostOf` 一句改为现状。
  - `.../packages/mcp/mcp/README.md:82`：偏离一句改为「没有偏离」。
  
  `mcp-contract/verification/` 下没有讲违约实现的页，所以没有改它。
  
  ### 4. 验收逐项
  
  **第 4 条（第 1 项的核对）：每一行都一致，没有停下。**
  - `testing-transport-table.ts` 里带 `unusable: true` 的恰好是 S01、S02、S03、S04、S07（`SESSION_ENDED`）、X02，与 T8 写「传输不再可用」的行相同。
  - 各行原因：
    - S01、S03：`stream-broken`。`lineEndOf` 取 no-answer 自身的原因。
    - S02、S04：`process-exited`。
    - S07：`session-ended`。
    - X02：`not-sent`（`connection-unavailable`）推为 `stream-broken`。
    - 以上全部一致。
  - 其余行，`unusableCauseOf` 都答 `undefined`，所以期望里没有这个字段，一致：
    - D01–D16、I01–I07、L、G、W、O01–O08、C01–C05、S05、S06、X01、N01。
    - D15、O05 再发后失败的答复写成不带标记的 `no-answer`（`stream-broken`），与 T8 一致：HTTP 上传输仍可用。
  - 「之后每个请求」：`afterwards` 在同一传输上再发一次 `listActions`，期望 `refusedAfter`，即带同一原因的 `not-sent`（`connection-unavailable`），一致。只核对了之后的一个请求。
  - 「`close()` 之后不带标记」：静默行 D14、I05、O04、C03 先 `close()`，再期望不带字段的 `abandoned`，一致。没有用例核对「线路结束后再 `close()`」这种情形（见第 7 节）。
  
  **第 2 条：两个违约实现都恰在预期的行变红。**
  - 漏标 `droppingMarks`，失败清单恰为：
    - `[S01] discover, discover-retry, initialize … (7) × stream-broken → no-answer (stream-broken), unusable`
    - `[S02] … × process-exited → no-answer (process-exited), unusable`
    - `[S03] tools/call × stream-broken → sent, answer stream-broken, unusable`
    - `[S04] tools/call × process-exited → sent, answer process-exited, unusable`
    - `[S07] tools/list, tasks/get, tasks/update … (5) × http:404+session → not-sent (session-ended), unusable`
    - `[X02] discover, discover-retry, initialize … (8) × unsent → not-sent (connection-unavailable), unusable`
  - 错标 `markingUsableBreaks`，给不带标记的 `no-answer`（`stream-broken`）加标记，失败清单恰为 D15、D16、I06、O05、O06、O07、C04 七行，全部是 HTTP 行。
  - 正控：
    - 脚本化传输：`transport-conformance.spec.ts` 219 条全过。
    - 真实的两种传输：`mcp-host-local/tests/conformance.spec.ts` 跑 `mcpTransportConformance`，在组运行里 410 条通过、1 条跳过。
  
  **第 1 条：两次组运行都退出 0。**
  - `VITEST_MAX_WORKERS=6 pnpm turbo run build typecheck test <三个 --filter> --force`：退出 0，15:03–15:14 UTC，head `06773cbcb`，工作树另有尚未提交的 `.md` 改动。日志 `accept1.log`，`3fb7238ccb0f6b2e`。结果：mcp-contract 685 条通过，mcp 502 条通过，mcp-host-local 410 条通过、1 条跳过，23/23 个任务成功。`marks`：581 个状态，1192 次重放，深度 21，约 3.0 秒，没有违例，也满足见证断言。
  - `pnpm turbo run test:slow <同一组 filter> --force`：退出 0，到 15:24 UTC 结束，日志 `accept1-slow.log`，`73cbfff7645ff07c`。
  
  **第 3 条（负控）：变异让探索器报 P15，还原后的第一次运行在 `wide` 超时。**
  - 驱动：`tmp/closures/w4-mcp-unusable-guard/negative-control.sh`。每一轮先 `pnpm turbo run build --filter=@omne-harness/mcp --force`，再 `pnpm turbo run test --filter=@omne-harness/mcp --force`，head 都是 `06773cbcb`。
  - 变异文本：`lost.ts` 里 `lostOf` 的两处 `return unusableOf(answer.unusable)` 改为 `unusableOf(answer.unusable ?? 'stream-broken')`。diff 在 `logs/mutation.diff`。
  
  | 运行 | 退出码 | 日志哈希 | 说明 |
  | --- | --- | --- | --- |
  | 变异前 | 0 | `d7ffc82b07d0785a` | 502 条全过 |
  | 变异后 | 1 | `b2008c83416844fc` | `marks` 报 `P15-lost-on-usable-failure` 与 `P15-teardown-on-usable-failure`，最短调度是建连各答 `ok` 之后 `answer transport.call:tA1 fail-usable`。另有 17 条服务层用例变红：lost 5、invoke 3、refresh 3、tasks 3、races 2、cancel 1。`task-methods` 在 600 秒时超时 |
  | 还原后（同一命令） | 1 | `79cdbe00dc2e07bc` | 只有 `wide`（lifecycle）在 600 秒时超时，其余 501 条通过 |
  | 还原后（组运行） | 0 | `3fb7238ccb0f6b2e` | 即第 1 条的组运行，mcp 502 条通过，`wide` 352 秒 |
  
  - 还原已按字节核对：`git diff --quiet` 通过，工作树干净，产品源码没有提交任何改动。
  - `wide` 的计时对比（你要求的那一次比较，14:50–15:02 UTC，负载均值 1.3–3.0，同时有 `w4-mcp-cordis` 的写者以 `VITEST_MAX_WORKERS=4` 跑单个用例文件）：带 P15 的 `tests/model/` 用 367 秒，换回基线 `78d850505` 的 `tests/model/` 用 360 秒。之后已执行 `git checkout HEAD -- tests/model/`，索引干净。
  - 判断：P15 只让 `wide` 慢约 2%。超时与你指出的那段并发负载在时间上重合。两次计时都接近 360 秒，而 README 记的是 158 秒，所以在基线上 `wide` 就已经离 600 秒的时限不远。这是已有的事实，与本闭包无关。
  
  **第 5 条：除 `lint:deps` 外都退出 0。**
  - typecheck `132d7e12965bfea4`、lint:oxlint `3dbb26bcdd76afd7`、format:check `550e538712c3f617`、lint:deps：在 `06773cbcb` 上运行，工作树另有 `.md` 改动。之后的提交只改 Markdown，这四项都不读它：`format.sh` 不检查 `packages/**/*.md`。
  - lint:rules 与 check:docs 在最终 head `11b5d4ff5` 上重跑：lint:rules `5a20e250e9839fc8`，15:31:55 UTC；check:docs `dfc597b573a60928`，15:31:23 UTC。
  - `lint:deps` 退出 1，8 处全是 `no-unresolvable`，都来自组外尚未构建的成员（agent-acceptance fixture、settings-local、identity-sql 的 `dist/` 导入），按验收第 5 条只列出，不处理。
  - 换行检查：10 个文件都是 `w/lf`。
  
  **第 6 条：通过。** 只含写范围内的文件。
  
  ### 5. 门禁日志
  日志都在 `/data/qiwei/repos/omne-harness-lite/.worktrees/w4-mcp-unusable/tmp/closures/w4-mcp-unusable-guard/logs/`：
  - 基线 `78d850505`，14:00 UTC：conformance `f8e7657b7e437de5`，model 快层 `3cdcd7c24a1e3341`。
  - 正控 model 快层：约 14:06，`7d98c5032b570e05`。
  - 负控三轮：14:07–14:49 UTC，`negative-control.txt`。
  - `accept1.time` 记下组运行的起止时间。
  - 最终的 docs 与 rules 门禁见第 4 节第 5 条。
  
  ### 6. 变异表
  
  | 改了什么（文件与位置） | 哪条用例变红 | 退出码 |
  | --- | --- | --- |
  | `mcp/src/internal/lost.ts`，`lostOf` 第 3 条的两处 return（N11） | `calls.spec.ts`「marks … P1–P15 hold」，报 P15 两个签名；另有 17 条服务层用例 | 1 |
  | 包一层工厂：去掉每个 `unusable`（漏标） | 套件的 S01、S02、S03、S04、S07、X02 | 用例断言精确清单 |
  | 包一层工厂：给 HTTP 上不带标记的 `no-answer`（`stream-broken`）加标记（错标） | 套件的 D15、D16、I06、O05、O06、O07、C04 | 用例断言精确清单 |
  
  ### 7. 未覆盖项与我的决定
  
  **未覆盖：**
  - 错标的另一种写法（把原因换成别的 `UnusableCause`）没有做。理由：它破坏的就是漏标让套件变红的那六行，套件在这六行已经用 `deepStrictEqual` 比较这个字段，所以它不会带来新的比较点。
  - 套件的手写用例不核对以下两点：`lineGoneAnswerOf` 结算的其他在途请求带不带标记；线路结束后再 `close()` 时答复不带标记。漏标时只有 T8 那六行变红，这本身就是证据。
  - `assertFailure` 对 `authorization-required` 只比较 kind 与 cause，所以给它加标记的传输能通过套件。
  - `marks` 只驱动 `getTask`。另外三个任务方法用同一个答复函数，但没有驱动。`refresh` 的页请求与就绪连接上的 `discover`，探索器都不驱动，由 `refresh.spec.ts` 与 U4 承担。`authorization-required` 不在 stdio 替身里出现。
  - TLA+：只加配置表达不了 P15。`Calls.tla` 的 `call`、`answer`、`task` 只有一种 `fail`，它的转移都经 `Lose`（第 284–286、301、345 行），对应的是带标记的失败。要表达 P15，就要加一种不转 `lost` 的答复，这改的是模型的抽象，所以没加。README「未覆盖」已写明。
  - 这是有限范围的探索器证据，不覆盖真实组合。
  
  **只有负责人能定（交给 SPEC 的拥有者）：** 成员 `SPEC.md`「性质与证据」只列 P1–P14。本闭包不能改 SPEC，所以 P15 现在只写在测试与 verification/README 里。要不要把 P15 写进 SPEC 的定理与证据表，由 SPEC 的拥有者决定。
  
  **过时的记录：** README 里 `call-faults` 一行写 914 个状态（在 `deb5a977e` 上量得）。基线 `78d850505` 与本分支实测都是 932。我在 README 里加了说明，但没有改那一行：那是产品写者的读数，不归我改。
  
  **我自己能定，依据如下：**
  - 负控编号用 N11，不另起新序列：N 序列已经定义为「改源码、用探索器跑场景」，含义相同。
  - 见证不计迟到的答复：时限到期之后的答复不再到达等待的操作，它的变化归 P6。实测迟到的带标记失败会留下 `ready`，所以计入它会让见证失真。
  - 在 stdio 替身上使用 HTTP 才有的不带标记的值：`lostOf` 只读标记，不读材料，`ports.ts` 的注释已写明。
  - 错标选「给仍可用的失败加标记」：这一种覆盖了 T1「字段不出现」的方向，漏标没有覆盖这个方向。
  
  **清理候选（在所改文件之外，没有动）：**
  - `Calls.tla` 第 14–16 行的注释仍写「`fail` 是 `not-sent`／`no-answer`」，没有说明是带标记的失败。README 的映射已经补上，模型的注释等它的拥有者改。
  
  推送、PR 与合并都没有做。
</agent-message>