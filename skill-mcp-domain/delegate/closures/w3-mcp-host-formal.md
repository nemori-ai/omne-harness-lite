# 闭包规格 w3-mcp-host-formal

## 身份与位置
- 闭包：w3-mcp-host-formal
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal
- 分支：PanQiWei/skill-mcp-w3-mcp-host-formal
- 基线：9893bebead64555dea4572c621be79087b0b9c14
- 清晰度：界

基线是 `w3-mcp-host-fix1` 交回的 head。第 1 轮评审在会话里找到的阻断都是并发次序一类：等待无界、关闭之后还调用凭据句柄、`signal` 碰不到在途请求。修复轮按评审补了单条用例；负责人要求新代码的并发都在形式化验证的守护之内。本闭包给会话写有界穷举探索器与 TLA+ 模型，性质覆盖这一类缺陷。会话已按派发者的追加改成可驱动：对外副作用只经线路端口、凭据句柄、`SessionOptions.fetchMetadata` 与计时端口 `SessionOptions.schedule`。

## 模型与推理强度
developer，implementation_kind verification，Claude Fable 5.1（claude-fable-5-1），effort high。理由：跨进程故障一类的并发次序与凭据句柄的形式模型（策略 `cross-process-faults`、`security-sensitive` 同类的验证设施）→ 顶档；负责人定的 Fable 档位上限是 high。

## 目标边界
目标：(1) 探索器驱动真实的 `Session`，由它排定线路答复、凭据调用、元数据取回、计时触发、请求 `signal` 与 `close()` 的次序，穷举有界范围内的调度；(2) 写出会话的性质，在每个可达状态核对；(3) 在 `verification/models/` 加会话请求生命周期的 TLA+ 模型，正控通过、每条性质各有一个会变红的负控；(4) 写模型、探索器与实现的动作映射。

本闭包不改 `src/`。找到实现缺陷时留下最小反例与它违反的性质，交回；修复归下一轮。

### 已定的事（不重新裁定）
1. **性质**（名字与编号由你定，陈述写进成员 SPEC 新建的「性质与证据」一节，那里是唯一源）。至少：
   - 恰好结算一次：每个请求的答复恰好兑现一次；结算之后到达的线上事件不改变它。
   - 关闭之后不碰凭据：`close()` 返回之后，不再调用 `authorize` 与 `reportRejection`。
   - 拒绝至多一次：每个带 401、或带 `insufficient_scope` 的 403 的应答至多调用一次 `reportRejection`，且只对用这个句柄授权过的请求。
   - 有界：请求的 `signal` 触发或 `close()` 被调用之后，在探索器的静止点（所有端口都已答复或已中止），每个请求都已结算；线路的 `close` 答复之后 `close()` 返回。线路或端口挂起时，`signal` 与 `close()` 仍让请求结算（端口调用本身可以挂着，由拥有者承接）。
   - 不代调用方重发：写类请求（`tools/call`、`tasks/update`、`tasks/cancel`）不再发；读类在流断开后至多再发一次，用新请求号并重新授权。
   - 三相的去向：`close()` 时授权中的请求答 `not-sent`，已发出的答 `abandoned`，授权发现中的请求结束发现后答 `authorization-required`。
2. **探索器**：放在 `packages/mcp/mcp-host-local/tests/model/`。做法与 `packages/mcp/mcp/tests/model/explore.ts` 相同（两个选择之间让所有 promise 反应跑完；状态按投影去重；宽度优先；`maxDepth` 处把状态推到静止并核对），但不从别的成员的 `tests/` 导入代码：引擎在本成员里写，交回时写明它与生命周期探索器的哪些部分相同，供派发者判断以后是否抽成共用设施。操作至少有：`discover`、带 `signal` 的 `call`、`listActions`、`cancelRequest`、`close()`、`signal` 触发、对端的 `ping`、线路结束；端口至少有：线路的 `send`、`openGet`、`events`、`close`，凭据的 `authorize`、`reportRejection`，`fetchMetadata`，计时。每个端口调用挂起，由探索器选择答复（含挂起、违约、迟到）。两种材料（stdio、Streamable HTTP）都要有场景；旧 HTTP+SSE 回退至少一个场景。
3. **TLA+**：`packages/mcp/mcp-host-local/verification/models/` 新建一个模块（例如 `TransportSession.tla`），对线路与对端只保留会话需要的抽象；配置与运行脚本按 `packages/mcp/mcp/verification/models/` 的做法（`run.py` 的判读与 `summary.json`）。负控每个只放一个缺陷，各自让一条性质变红，例如：等待返回后不核关闭、关闭时不中止授权发现、`signal` 只在写出之后才接上、读类再发两次、401 每个请求都调 `reportRejection`。
4. **映射**：`verification/README.md` 写模型动作 ↔ 探索器动作 ↔ 实现函数（`src/session.ts`、`src/stdio-line.ts`、`src/http-line.ts`）的映射，写明抽象与上限，不写「已证明」。

### 写范围
- `packages/mcp/mcp-host-local/tests/model/`（新建） — 探索器、端口替身、性质、场景、慢层用例
- `packages/mcp/mcp-host-local/verification/models/`（新建） — TLA+ 模块、配置、`README.md`
- `packages/mcp/mcp-host-local/verification/models/run.py`（新建） — 运行脚本，判读与 `summary.json` 同生命周期模型的做法
- `packages/mcp/mcp-host-local/verification/README.md` — 映射与读数
- `packages/mcp/mcp-host-local/SPEC.md` — 只新建「性质与证据」一节（放在「组合与验证」之后），不改其他节
- `tmp/closures/w3-mcp-host-formal/`（新建） — 运行输出、反例与日志

### 排除的调用方
- `packages/mcp/mcp-host-local/src/`：只读。缺一个可注入点而无法表达某条性质时，停下交回。
- `packages/mcp/mcp-host-local/tests/` 里 `model/` 以外的用例与替身：只读，可以导入复用（`memory-line.ts`、`fixtures/settle.ts`）。
- 成员 SPEC 的其他节、README 两种语言、`docs/`、`verification/index.md`、`verification/sdk/`：并行的 `w3-mcp-host-docs` 在改。
- 契约成员与 `packages/mcp/mcp/`：只读。

## 验收清单
1. `VITEST_MAX_WORKERS=3 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-host-local` 退出 0。
2. 慢层的探索器用例退出 0：每个场景没有反例；报告每个场景的状态数、深度与耗时。
3. 探索器的负控：对每条性质，在工作树之外的副本上对实现做一处使它失效的变异，探索器找到反例；记下变异、场景与反例的调度，然后还原。第 1 轮评审的阻断（A1、A2、A4、A5、B4、B5，见方法入口里的第 1 轮评审记录）至少各有一个对应的变异，证明探索器能重新发现它们。
4. `node scripts/with-test-slot.mjs python3 packages/mcp/mcp-host-local/verification/models/run.py` 退出 0：正控通过，每个负控按预期违反它针对的性质。
5. 成员 SPEC「性质与证据」、`verification/README.md` 的映射与 `verification/models/README.md` 的配置表一致，编号与名字三处相同。
6. `pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run format:check`、`pnpm run check:docs` 退出 0。

## 实施规格
- 时间值、上限与场景的边界写成常量并注明理由；耗时超过 10 分钟的场景只放慢层，交回里给出耗时。先用最小场景（一个请求、一次 `close()`）量出状态数再加宽。
- TLC 环境：`TLA2TOOLS_JAR=/opt/tlaplus/tla2tools.jar`（仓库钉的 v1.7.4，SHA-256 `936a2620…`），`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`；Bash 工具是非登录 shell，运行前显式 `export`。TLC 经 `scripts/with-test-slot.mjs` 排运行名额，`FORMAL_WORKERS=3`。
- 命名账本：模块、配置、性质的名字写进交回。

## 性质及证据义务
- 每条性质至少有一个正控（无反例）与一个负控（有反例），两者的命令与输出留在 `tmp/closures/w3-mcp-host-formal/`。
- 探索器找到实现缺陷时：反例的调度、违反的性质、能复现它的最小场景，写进交回的「发现」。

## 施工计划
1. 读成员 SPEC、`src/session.ts`、两条线路、`line.ts`、`factory.ts`；读 `tests/session.spec.ts` 与 `memory-line.ts` 的驱动方式；读生命周期探索器（`packages/mcp/mcp/tests/model/`）与它的 TLA+ 目录作为做法的先例。
2. 性质陈述的草稿（放 tmp），再写探索器。
3. 探索器：端口替身 → 性质 → 最小场景 → 加宽 → 负控。
4. TLA+：模块 → 正控 → 负控。
5. 映射与 SPEC「性质与证据」；门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行本成员的构建与测试（含慢层）、TLC；在工作树之外的副本上改实现做负控；本地提交。不允许：改 `src/`、推送、开 PR、合并、改写范围外文件、新增依赖。规格不够时在授权内自定，交回时逐条列出理由。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal。并行的有：`w3-mcp-host-docs`（同一基线、另一棵树，改成员 SPEC 的其他节与文档）、`w3-mcp-call-fix1` 与 `w3-mcp-call-model`（另两棵树；后者也在跑探索器与 TLC）。本机 8 核，几个写者同时跑：成员测试用 `VITEST_MAX_WORKERS=3`，TLC 用 `FORMAL_WORKERS=3` 并经运行名额。不跑 `admission`、不跑仓库全量测试、不跑差分变异。派发者唯一合回。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host-formal/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 第 1 轮评审与裁定：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r1.md（A、C 两节的阻断与探针，探针副本在同目录 `mcp-host-r1-probes-a/`、`mcp-host-r1-probes-c/`）
- 代码修复轮的规格与追加记录：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host-fix1.md
- 契约：`packages/mcp/mcp-contract/SPEC.md` 的 T3、T4、T5、T8、T9
- 先例：`packages/mcp/mcp/verification/README.md`、`packages/mcp/mcp/verification/models/README.md`
- 必须加载：verification-facility；ub-mode；pstack:typescript-best-practices；写 SPEC 时 asd-ste100

## 当前认知
- 已确认（代码修复轮交回）：请求的生命周期是「登记（含 `signal` 接线）→ 授权 → 写出 → 等应答 → 结算」，`Pending.phase` 是 `authorizing`、`sent`、`discovery` 三相；每步之后核「已结算或已关闭」；`close()` 中止每个请求的控制器，授权中答 `not-sent`、已发出答 `abandoned`、授权发现中等发现结束；`die()` 跳过授权中的请求。`Scheduler` 与 `Session` 不从包根导出，用例从 `src/session.ts` 导入（`session.spec.ts` 的做法）。
- 已确认：stdio 线路自己的计时（退出窗口的 `setTimeout`、`performance.now`、`ready()` 的 `setImmediate`）没有注入；探索器经内存线路驱动会话，不经 stdio 线路。
- 未知：会话的状态空间大小。

## 返回与恢复
每个提交号；每条验收的命令与结果；性质的名字与陈述；每个场景与配置的状态数、深度、耗时；负控的「变异或缺陷 → 性质 → 反例」表；发现（实现缺陷的反例）；探索器引擎与生命周期探索器的异同；自定裁定与理由；未覆盖项。过程输出留工作树 `tmp/closures/w3-mcp-host-formal/`。

## 已知会受影响的现有用例
- 无（只新增）。

## 停止条件
- 某条性质只能靠改 `src/` 才能在探索器里表达：停下交回，写明缺什么。
- 状态空间在最小场景上已超过 30 分钟：停下交回，附读数。
- 同一负控连试三种写法仍不变红。

## 追加记录
- 2026-11-05 派发前：简报检查退出 0。`caller-outside-scope` 警告来自 `close`、`now`、`ready`、`signal`、`sent`、`phase` 等通用词与全仓库同名标识符的匹配；本闭包不改 `src/`，只从探索器里调用。工作树由 `prepare-closures` 建好（安装、投影、构建 `mcp-host-local`、`agent`、`identity-sql`），作者用 `git config --worktree` 设为 PanQiWei。
- 2026-11-05 约 14:40 宿主 429 限流（5 小时额度到顶），写者中断；15:05 额度恢复后续用原写者接着做（保留工作树改动，P18）。派发者读的工作树事实写在续派消息里；对 `w3-mcp-call-model` 与 `w3-mcp-host-formal` 加了「每完成一个能过 typecheck 的阶段就提交」。
