# 闭包规格 w3-mcp-host-fix1

## 身份与位置
- 闭包：w3-mcp-host-fix1
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
- 分支：PanQiWei/skill-mcp-w3-mcp-host
- 基线：8f9016fd8701b82383eb4cbde3f22e7ebf25715c
- 清晰度：定

`w3-mcp-host` 第 1 轮评审之后的代码修复轮（PR #1138）。基线是评审时的 head。五路评审与卡拥有者的裁定全文在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r1.md`。本闭包只改代码与用例；两个成员的 SPEC、README、`docs/` 由下一个闭包按本闭包的结果改写。

## 模型与推理强度
developer，implementation_kind product，Claude Fable 5.1（claude-fable-5-1），effort high。理由：等待上界与取消的并发次序、凭据句柄（策略 `cross-process-faults`、`security-sensitive`），跨契约与成员两个包的决策层重构 → 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：(1) 把 T8 的决策层从会话与脚本化传输里抽到契约根，两种传输共用一份，结论直接取 `classifyWireEvent` 的类别；(2) 会话对线路 I/O 的每个等待点受请求的 `signal` 与关闭管辖，等待之后再核状态，`close()` 有上界；(3) 修掉评审指出的其余缺陷。每个缺陷先写一条在基线上变红的用例。

### 根因（卡拥有者的诊断，按它修，不另找）
- 已定事项 2（原闭包规格 `w3-mcp-host.md`）点名的「T8 的决策」没有进契约根。会话因此抄了脚本化传输的整层决策，抄时又自写了 `isModern`、`supportedOf` 与 `answerWireOf` 的拆分，与契约结论分歧（A3、B1）；`plainOf` 的词形问题被一起复制（B3）。
- 会话对线路 I/O 的等待点不受请求的 `signal` 与 `closing` 管辖，等待返回后不再核状态（A1、A2、A4、B4、B5）。

### 已定的事（不重新裁定）
1. **决策层进契约根**（可加改动）。契约 `src/` 新建一个模块，导出两种传输都用的纯函数与常量，至少包括：
   - 由「请求类 × `classifyWireEvent` 给的应答类」得出结论：结局、`answer-malformed` 的种类、再探测、走旧一路、过期（`-32602` 当任务过期）。会话与脚本化传输都不再自己读 `-32022` 的 `data.supported`、不再自己判现代修订、不再把错误类压平后重判。唯一还要读的「`data.supported` 里与我方共有的版本」作为契约根导出，复用 `wire.ts` 现有的 `supportedOf`。
   - 探测决策（现 `probeOf`、`probeErrorOf`、`versionRetryOf`）按应答类分支：`+common` 再探测，`+modern` 答 `answer-malformed(discover-shape)`，`+legacy` 走旧一路，`-32020`、`-32021` 答错误，`-32601` 走旧一路，`unreadable` 按 D11。
   - 读法组合（现 `reading`、`readTask`、`readAnswer`、`interpret`、`answerOf`、`interpretFailure`）。
   - 流断开后再发一次的方法集合（现 `READ_METHODS`，T8 D15、O05）与协议常量（`OFFERED_LEGACY_VERSION`、`METHOD_NOT_FOUND` 等）。
   - 授权发现的取回循环，取回动作作为参数传入（带 `signal`），两边共用。
   - 出站消息的文本：调用方写的值（`arguments`、`inputResponses`）与回显的对端请求 id 按原词形写出，经 `@omne-harness/json-text` 的 `writeJsonText`（RFC-0010）。删除两边的 `plainOf`、`plainIdOf` 及同类转换。
   名字与分组由你定，写进交回。脚本化传输与会话都改用这些导出，各自只留线路编排与在途表。
2. **`WireClassification` 的 `answer` 可加地带出已解析的消息**。会话不再自己 parse，删掉 `limits.ts` 里复制的上限；对应答类做穷尽的 `switch`，`default` 用 `never`，不兜底造出 `result: null` 或 `error: null`。
3. **`signal` 释放交换**（P3）：调用方的 `signal` 在请求登记之后任何时刻触发，传输都不再等待，`answer` 以 `no-answer`（`abandoned`）兑现（T5）；在途表的项在授权与写出之前登记，`signal` 在登记时接到它的 `AbortController`。现代 Streamable HTTP 上释放交换就是中止应答流，这是允许的。授权元数据的取回同样受请求的 `signal` 管辖。
4. **stdio 写端**：线路的 `send` 遵守端口声明的 `signal`。一次写在完成前被中止，线路不再可写：在途的请求按 stdio 流断开的行结算，传输不再可用。`close()` 不依赖对端读 stdin：写端有未完成的写时用 `abort` 结束它；次序仍是先结束 stdin 写端，再取消 stdout；`close()` 等两个读循环结束后才返回。
5. **关闭之后不碰凭据**：每个等待点返回后先核会话是否已关闭、请求是否已结算；已关闭就不再调用凭据句柄。旧 HTTP+SSE 回退的 GET 也一样（A4）。
6. **先到的 401 决定结论**：401 或带 `insufficient_scope` 的 403 已到、授权发现进行中时 `close()` 或 `signal` 触发，结束发现，答 `not-sent`（`authorization-required`），`discovery.metadata` 按 R4 是 `unavailable`。`reportRejection()` 仍恰好一次，且在 `close()` 返回之前。
7. **答复对端请求也经 `authorize`**（P7）：答复对端 `ping` 等请求的 POST 是出站 HTTP 请求，带授权头。关闭之后不再答复。
8. **16 MiB 行上界对每一行生效**，不只是块里的第一行（A5）。HTTP 上只有 2xx 的正文（JSON 或一条 SSE 事件）越界是流断开；错误状态的正文越界按「纯」归类，状态行照常（现行实现的读法，下一闭包写进 SPEC）。授权元数据的正文读取用同一个有上界的读法，越界按没取到算。
9. **回退是否成立**（T3：200、`text/event-stream`、首个事件是同源的 `endpoint`）由会话或成员内的纯函数判定，线路只交事实。
10. **其余非阻断**：`closing.signal` 上的监听随交换释放而移除（或交给 `AbortSignal.any`）；删掉 `consume` 的 `seen`；删掉重复与死代码（`message.ts` 的 `isPlainJson`、`memberOf`、`textOf`、无调用方的 `idOf`，两边的 `Deferred` 共用一份或各自内联，`readers.ts:169`、`:173-180` 与 `session.ts:555` 不可达的分支）；类型收紧（`versions` 用非空元组，`send` 的 `method` 用字面量联合，授权发现只收 HTTP 材料，不为 stdio 造占位地址）；`StdioLine.ready` 不用误导的 `race`；凭据泄漏用例加正面断言（discover 成功、`authorization-required` 带发现）。
11. **I07 表行**：契约 `testing-transport-table.ts` 的 I07 行加一行注释：套件的对端不提供旧一路，所以表上是回退不成立的一支；成立的一支在 `mcp-host-local` 的旧 HTTP+SSE 用例里。表的数据不改。

### 写范围
- `packages/mcp/mcp-contract/src/` — 第 1、2、11 条：新的决策模块、`wire.ts`、`readers.ts`、`index.ts`、`testing-scripted-transport.ts`、`testing-transport-table.ts` 的注释
- `packages/mcp/mcp-contract/tests/` — 新导出的用例与导出集合
- `packages/mcp/mcp-host-local/src/` — 会话、两条线路、授权、消息
- `packages/mcp/mcp-host-local/tests/` — 新用例；夹具（含 `tests/fixtures/`）可加选项，例如 HTTP 对端延迟写头
- `tmp/closures/w3-mcp-host/fix1/`（新建） — 红灯输出、探针与日志

### 排除的调用方
- `packages/mcp/mcp/`：只读。另一闭包 `w3-mcp-call` 在改它，也在改契约的 `services.ts`、`testing-values.ts`、`testing.ts`、`SPEC.md`；本闭包不碰这几个文件。契约改动不能让 `mcp` 的 254 条用例在本分支上失败；会失败时停下交回。
- 两个成员的 `SPEC.md`、`README.md`、`README_ZH.md`、`docs/`、`index.md`、`documentation.json`、`verification/`，契约的 `docs/public-api.md`：下一闭包改。新根导出写进交回，由下一闭包同步。
- `pnpm-lock.yaml`、各 `package.json` 的依赖段：只由 reduce 写。需要新依赖时停下交回。

## 验收清单
每条写命令、预期与结果。失败时先在基线上复跑同一检查。

1. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp` 退出 0。
2. 下表每一项有一条用例：在基线 `8f9016fd8` 的源码上变红，在交回的 head 上变绿。红灯输出存 `tmp/closures/w3-mcp-host/fix1/red/`。证明变红时先还原源码并重建 `dist` 再跑（成员用例经包名导入，读的是 `dist`）。
   - stdio 对端不读 stdin、参数写满管道：`call` 的 `signal` 触发后有界结算，`close()` 有界返回（A1、B4）
   - HTTP 对端收下请求后迟迟不发应答头：`signal` 触发后 `call` 有界返回，答 `abandoned`（A2、B5）
   - 401 之后授权元数据取回挂住：`signal` 或 `close()` 触发后有界结算，答 `not-sent(authorization-required)`，`metadata` 为 `unavailable`（A2 P2、第 6 条）
   - `-32022` 的 `supported` 含非日期项：答 `answer-malformed(discover-shape)`（A3 P4、B1）
   - discover 收到不带 `jsonrpc` 的 `-32022`：按 D11 走旧一路（A3 P9）
   - `tools/list` 收到信封不合格的错误：`answer-malformed(error-shape)`（A3 P9、O03）
   - `call` 收到信封不合格的错误：交出整条消息（T2、C02）
   - 旧 HTTP+SSE 回退的 GET 先到 401 头、正文未到时 `close()`：`close()` 返回之后 `reportRejection()` 调用 0 次（A4）
   - 一个块里含一行超过 16 MiB 的行，不在块首：`stream-broken`，传输不再可用（A5）
   - 工具参数含 `1234567890123456789`：对端读到的原始行里词形不变；回显的对端请求 id 词形不变（B3）
   - 受保护的 HTTP 对端发 `ping`：答复的 POST 带授权头（第 7 条）
   - 连发 50 条通知或对端 50 次 `ping` 之后，`closing.signal` 上的监听数不随之增长（N1）
   - 授权元数据正文超过上界：按没取到算（N2）
3. 结构：`session.ts` 与 `testing-scripted-transport.ts` 里都没有下列名字的定义（函数或常量声明）：`supportedOf`、`isModern`、`MODERN_ERROR_CODES`、`READ_METHODS`、`reading`、`interpret`、`expiredOf`、`probeOf`、`probeErrorOf`、`versionRetryOf`、`plainOf`、`plainIdOf`；两者都从契约根导入决策层。交回时附 `grep -n -E` 的命令与输出。
4. 契约原有用例原样通过；导出集合用例按新增改写（不算放宽）；`TRANSPORT_TABLE` 的数据不变；`mcp` 254 条用例不改、全部通过。
5. `pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check` 退出 0；`git ls-files --eol | grep -c w/crlf` 为 0。`lint:deps` 在干净树上要先构建 `@omne-harness/agent` 与 `@omne-harness/identity-sql`。
6. `src/` 无 `as`（`as const` 除外）、无 `any`、无非空断言。交回时附命令与输出。
7. `pnpm run metrics --coverage --base 8f9016fd8` 退出 0。本闭包改动或新增的函数不新增超 alert（圈复杂度 > 12）的；评审点名的 `answerWireOf`、`conclude`、`dispatch`、`enterSse`、`tryEnterSse`、`readStdout` 重构后的读数写进交回。

## 实施规格
- 契约 T2–T9 的条款不变；本轮只把已有规则放到一处实现，并按上面的已定事项改行为。决策层的输入是 `classifyWireEvent` 的类别与它带出的消息，不是原始文本。
- 在途表项的生命周期：登记（含 `signal` 接线）→ 授权 → 写出 → 等应答 → 结算；每一步之后核「已结算或已关闭」，是就停止，不再调用凭据句柄。
- 命名账本：新模块与导出的名字由你定，写进交回。

## 性质及证据义务
- 每个异步副作用有等待上界或明确的拥有者：`close()`、写出、应答头、授权元数据取回、回退 GET、SSE 流。新用例断言有界（例如在一个固定的时间内结算），时间值写成常量并注明理由。
- 测试结束时没有遗留的进程与端口（沿用 `afterEach` 的 `leftover()`、`leftoverServers()`）。
- 不重发与进程归落点的性质保持：原有用例原样通过。

## 施工计划
1. 读评审记录 `mcp-host-r1.md` 全文；读探针 `waves/w3/reviews/mcp-host-r1-probes-a/`（A，按 `source` 条件打包 `src/` 跑，`build.sh`）与 `mcp-host-r1-probes-c/`（C，跑 `dist`），用它们写第 2 条的红灯用例。
2. 契约决策层：先在契约里写导出与它们的用例，再让脚本化传输改用它们；契约 553 条与 `mcp` 254 条用例保持全绿。
3. 会话改用决策层；删掉第 3 条列出的定义；`WireClassification` 带出消息。
4. 等待点与关闭：第 3–7 条，每条先红后绿。
5. 第 8–11 条与其余非阻断。
6. 门禁与交回。
红灯输出存 `tmp/closures/w3-mcp-host/fix1/red/`。提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行三个成员的构建与测试、仓库检查；起本机夹具进程（测试结束时清理）；本地提交。不允许：推送、开 PR、合并、改写范围外文件、新增或升级依赖、改契约条款的含义、连远程 MCP 服务。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host。并行的有 reduce 本会话与 `w3-mcp-call` 的写者（另一棵树）。派发者唯一合回。不跑 `admission`、不跑仓库全量测试、不跑差分变异。本机 8 核：成员测试用 `VITEST_MAX_WORKERS=4`。慢层用例单独跑时用 `pnpm --filter @omne-harness/mcp-host-local run test:slow`。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 评审记录与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r1.md
- 原闭包规格（已定事项 1–7 与追加记录）：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host.md
- 设计：工作树 `tmp/closures/w3-mcp-host/design.md`
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 T1–T9、R4、「真实传输兑现时的裁定」
- RFC-0010：`docs/rfcs/RFC-0010-json-text-lossless-writer.md`
- 必须加载：ub-mode；pstack:typescript-best-practices

## 当前认知
- 已确认：A、C 两路的探针在基线上复现了第 2 条的各项（输出在探针目录的 `out/` 或报告里）。成员用例经 `@omne-harness/mcp-host-local` 包名导入，`exports` 的 `import` 条件指向 `dist`，所以源码变异要重建 `dist` 才生效。
- 已确认：契约 `json.ts`、`listing.ts`、脚本化传输已导入 `writeJsonText`；契约依赖 `@omne-harness/json-text`。
- 未知：stdio 写端在 Node 的 `Writable.toWeb` 上 `abort` 的确切效果（是否立即关闭 fd、子进程是否看到 EOF）。先写探针确认。

## 返回与恢复
每个提交号；每条验收的命令与结果；第 2 条每项的「用例 → 缺陷 → 变红证据」；第 3 条的 `grep` 输出；新导出的名字与签名（下一闭包同步 SPEC 用）；自定裁定与理由；写者声称的结构性改动清单（reduce 逐条 `grep` 核实）；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-host/fix1/`。

## 已知会受影响的现有用例
- `packages/mcp/mcp-contract/tests/public-entry.spec.ts`：导出集合按新增改写。
- `packages/mcp/mcp-host-local/tests/session.spec.ts`：用会话私有函数的用例随重构改导入，断言不放宽。

## 停止条件
- 某项要求只能靠改排除范围内的文件实现。
- 契约改动让 `mcp` 的用例失败。
- 某项已定事项与契约条款冲突，或在任何实现下都兑现不了。
- 同一用例连试三种做法仍红。

## 追加记录
- 2026-11-05 派发前：简报检查退出 0。`caller-outside-scope` 警告来自 `signal`、`abort`、`exports`、`dist` 这类通用词与全仓库同名标识符的匹配；`classifyWireEvent` 的 11 处都在写范围的目录里（检查器只按文件路径精确匹配，不认目录）；`writeJsonText` 的其余调用方不受影响（本闭包不改它）。不处理。
- 2026-11-05 13:30 追加 1（归属：规格。负责人要求新代码的并发要在形式化验证的守护之内；下一个闭包要为会话写有界穷举探索器，驱动真实的 `Session`，做法同 `packages/mcp/mcp/tests/model/explore.ts`）：会话自己不直接调用全局计时器。探测计时经 `SessionOptions` 注入一个计时端口（例如 `schedule(ms, fire): () => void`，返回取消函数），工厂给缺省的 `setTimeout`/`clearTimeout` 实现。会话对外的全部副作用只经线路端口、凭据句柄、元数据取回函数与这个计时端口，没有别的入口（不读全局时钟、不直接 `setImmediate`）。线路自己的计时（stdio 的退出窗口）不在本条。本条不需要新用例，交回时说明会话的全部注入点。
