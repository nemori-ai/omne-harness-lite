# 闭包规格 w3-mcp-lifecycle-model

## 身份与位置
- 闭包：w3-mcp-lifecycle-model
- 卡与修订：#1119 r1
- 工作树：/home/user/omne-harness-lite/.worktrees/w3-mcp-lifecycle-model
- 分支：PanQiWei/skill-mcp-w3-mcp-lifecycle-model
- 基线：1160e92c891e0438ee7cf21bcc0155fcd3eaa70f
- 清晰度：定

## 模型与推理强度
developer，implementation_kind verification（加载 verification-facility），claude-opus-5-5，effort xhigh。理由：跨模块资源生命周期与并发（策略 `cross-module-lifecycle`，hardest → xhigh）；验证设施建模跨故障与并发交错，按角色说明用顶档。Fable 受用量上限，用 Opus 记一次降级。policy_version 947.1；角色源树 532b22c6edbb0ada17daf1ca8d13cdd7f5551e23；宿主 Claude Code（云）。

## 目标边界
目标：为 `@omne-harness/mcp` 连接表的生命周期建立行为模型与性质证据，使「凭据句柄恰好释放一次」这类不变式由模型与穷举探索守住，而不是由逐条用例守住。产出四样东西：

1. **性质账本**：把连接表的关键性质写成定理（状态与参与者、端口失败模型、公平性前提、结论）。至少包括：
   - P1 句柄守恒：每个取得的凭据句柄最终恰好释放一次；任何可达状态下释放次数不超过 1。
   - P2 遗忘安全：条目被删除时什么资源也不持有。
   - P3 每个进程都被要求停止：任何被落点交来的进程，在条目被遗忘或实例关停之前至少被请求停止一次。
   - P4 关停之后不建连：`closeAll` 开始之后不再调用落点启动与传输打开。
   - P5 键隔离：不同租户或对端账号永不共用一个条目。
   - P6 迟到不覆盖：产出代际不是当前代际的结果不改变当前状态，也不发布。
   - P7 错误不静默、不崩溃：每个异步副作用的失败都有去向（交给等待它的调用方，或记在条目上可被观察）；不存在未处理拒绝。
   - P8 等待有界（活性，带前提）：在端口答复或挂起的每种组合下，哪些调用方一定在时限内得到答复，哪些不能（写成定理与反定理，不能的列为已知限制）。
2. **TLA+ 模型**：`packages/mcp/mcp/verification/models/ConnectionTable.tla` 与 `.cfg`，按仓库先例（例如 `packages/session/session-contract/verification/models/`、`packages/agent/agent-contract/verification/models/Finishing.tla`）组织；动作覆盖 ensure、拆除三步、落点迟到、`closeAll`、`release`、端口的答复/拒绝/同步抛出/挂起；性质 P1–P7 写成 INVARIANT/PROPERTY。本环境没有 TLC（`/opt/tlaplus/tla2tools.jar` 未安装，下载被会话权限拒绝），模型状态如实记为「已声明但未执行」，并写明运行命令与预期的检查范围。
3. **对真实实现的有界穷举探索器**：`packages/mcp/mcp/tests/model/`（新建）。用显式状态探索驱动**真实**的 `createMcpCore`（或内部 `createConnectionTable`），端口用可编程替身：每个端口调用可以答复、拒绝、同步抛出、挂起、迟到答复；调度器枚举有界范围内的全部交错（例如 2 个键、每键至多 2 次 ensure、1 次 release、1 次 closeAll、每个端口调用 5 种结局），在每一步核对 P1–P7 的可观察投影（替身计数、`status.inspect`、未处理拒绝监听）。探索器的动作与 TLA+ 模型的动作一一对应，映射写进 `verification/README.md`。探索范围、状态数、耗时写进报告；有界通过不推广为无条件证明。
4. **差距账本初稿**：`tmp/closures/w3-mcp-lifecycle-model/gaps-mcp.md`（不进仓库，reduce 收进记录分支）：应然（组页 `packages/mcp/docs/architecture.md`「MCP 连接」不变式 1–6、`mcp-contract` SPEC S1–S9 与 AV–T、`mcp` SPEC）逐条对照实然（1160e92c8 源码），每条写差距与建议处置。

形状与决定：
- 探索器预期会在 1160e92c8 上找到反例（已知：`closeAll` 的未处理拒绝 B1、迟到路径同步抛出 N2、建连自身拆除挂起 P2）。找到的每个反例写成最小复现轨迹，**不修产品代码**——修复归下一个闭包 `w3-mcp-lifecycle`。探索器的测试把已知反例标为预期失败（`it.fails` 或等价），并在报告列出；其余性质必须通过。
- 不改 `src/`。不改契约。

不在范围内：修复连接表；调用口与任务表；本地传输；组页。

### 写范围
- `packages/mcp/mcp/verification/`（新建） — TLA+ 模型、配置与 README（动作映射、运行命令、证据状态）
- `packages/mcp/mcp/tests/model/`（新建） — 显式状态探索器、可编程端口替身与性质核对
- `packages/mcp/mcp/SPEC.md` — 只加一节「性质与证据」：每条性质的定理陈述、证据类型与状态（六种状态分开），链接到 verification/ 与 tests/model/
- `packages/mcp/mcp/README.md` — 验证一段加一句指向 verification/
- `packages/mcp/mcp/README_ZH.md` — 同上

### 排除的调用方
- `packages/mcp/mcp/src/` — 只读；停止条件：探索器需要产品代码暴露新入口时，先用已有内部模块（测试可导入 `src/internal/*`），仍不够就停下交回
- `packages/mcp/mcp-contract/`、`packages/mcp/mcp-host-local/` — 只读
- `pnpm-lock.yaml`、各 `package.json` 依赖段 — 只由 reduce 写；停止条件：需要新依赖（例如 fast-check）时停下交回，探索器用手写的显式状态枚举即可

## 验收清单
1. `pnpm turbo run build typecheck test --filter=@omne-harness/mcp` 退出 0（已知反例以预期失败形式存在，不使门禁变红）。
2. 性质账本 P1–P8 每条有定理陈述、前提、证据类型与状态；SPEC 新节与之一致。
3. TLA+ 模型能被 `java -cp $TLA2TOOLS_JAR tla2sany.SANY` 解析的前提无法在本环境核对时，写明「未执行」；模型文件、`.cfg`、运行命令与预期范围齐全。
4. 探索器：报告给出探索范围（键数、调用数、端口结局集合）、可达状态数、耗时；每条性质的核对点；对已知反例 B1、N2、P2 各给出探索器找到的最小轨迹。
5. 探索器能变红：至少 3 个手工变异（例如去掉拆除里某一步的吸收、`forgettable` 不看已关闭、`closeAll` 不置关停）各被探索器在有界范围内抓住，报告列「变异 → 反例轨迹」。证明变红前先还原源码并重建 dist。
6. 差距账本初稿覆盖组页「MCP 连接」不变式 1–6 与 `mcp-contract` S1–S9。
7. 收尾门禁：`pnpm run lint:rules`、`pnpm run lint:oxlint`、`pnpm run lint:deps`、`pnpm run format:check`、`pnpm run check:docs`。

## 实施规格
- 先读仓库形式验证约定 `docs/verification.md`（「证据能支持什么」「分别表述这六种状态」「设计情形与证据义务」）与一个先例模型的 README。
- 探索器结构：`tests/model/ports.ts`（可编程替身：每次调用登记一个待决结局，由调度器选择答复/拒绝/同步抛出/挂起/迟到）、`tests/model/explore.ts`（深度优先或广度优先的交错枚举，状态以可观察投影去重）、`tests/model/properties.ts`（P1–P7 的核对函数）、`tests/model/lifecycle.spec.ts`。
- 未处理拒绝：在探索期间监听 `process.on('unhandledRejection')` 并记为 P7 违例。
- 命名账本：`ConnectionTable.tla`、`explore`、`ScriptedPortCall`（名可调，写进报告）。

## 性质及证据义务
- 按 `docs/verification.md`：模型检查与有界探索都要写明范围；有限范围通过不写成无条件证明；未执行就写未执行。
- 映射：模型的每个动作对应探索器的哪个调度选择、对应实现的哪段代码。

## 施工计划
1. 读输入；写性质账本与 TLA+ 模型。
2. 写探索器，先跑出 1160e92c8 上的反例（预期 B1、N2、P2），写最小轨迹。
3. 做验收 5 的变异证明。
4. 写 SPEC 新节、verification/README、差距账本初稿；门禁；交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`。

## 自主范围与动作授权
允许：写范围内改文件；运行成员测试与仓库检查；本地提交。不允许：改产品源码、推送、开 PR、加依赖、下载或执行外部代码（TLC 不可用就记未执行）。规格不够时在授权内自定并在交回列理由。

## 工作树与协调
独占工作树 /home/user/omne-harness-lite/.worktrees/w3-mcp-lifecycle-model。并行：`w3-skill-model` 写 Skill 成员。派发者唯一合回。

## 方法与知识入口
- 先读：/home/user/omne-harness-lite/.worktrees/w3-mcp-lifecycle-model/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 结构性处置的来由：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/structural.md
- 连接表现状与评审：/home/user/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-table-r1.md（含第 2 轮 B1、N1、N2、P1–P4）；评审者探针 /tmp/claude-0/-home-user-omne-harness-lite/f1070bb8-fa26-55f8-8bda-04c4ceeaeb27/scratchpad/review-w3-mcp-table-r2/ （n1、n2、n4、n9 等可直接借用为种子轨迹）。
- 应然：组页 `packages/mcp/docs/architecture.md`「MCP 连接」；`packages/mcp/mcp-contract/SPEC.md` S1–S9、AV–T；`packages/mcp/mcp/SPEC.md`。
- 必须加载：verification-facility；ub-mode；pstack:typescript-best-practices；写文档时 asd-ste100。

## 当前认知
- 已确认：1160e92c8 上 298 例通过；评审实证 B1（`closeAll` 未处理拒绝）、N2（迟到路径同步抛出）、P2（建连自身拆除挂起时调用方无界等待）。
- 假设：真实连接表在替身端口下是确定性的（同一调度序列得到同一结果）。不成立时停下交回。
- 未知：有界探索的可行范围（状态爆炸）；先从 1 键、少量调用起步，报告实测。

## 返回与恢复
内联交回：提交号；性质账本；模型与探索器的映射；探索范围、状态数、耗时；反例轨迹；变异证明；门禁日志；未覆盖。过程输出留工作树 `tmp/closures/w3-mcp-lifecycle-model/`。

## 已知会受影响的现有用例
- 无（只新增测试目录）。

## 停止条件
- 探索器必须改产品代码才能驱动。
- 真实实现在相同调度下不确定。
- 同一用例连试三种做法仍红。

## 追加记录
