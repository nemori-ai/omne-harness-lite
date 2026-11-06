# 闭包规格 w3-mcp-host-fix4

## 身份与位置
- 闭包：w3-mcp-host-fix4
- 卡与修订：#1119 r1
- 工作树：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
- 分支：PanQiWei/skill-mcp-w3-mcp-host
- 基线：54a2377cbcf02ff4af63944afabbed8857ae4dff
- 清晰度：定

`w3-mcp-host` 第 4 轮关口（最后一个关口）之后唯一的一轮修复（PR #1138）。四面都没有阻断。卡拥有者的处置在 `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r4.md` 末尾「卡拥有者对第 4 轮的处置」，第 1–9 条是本闭包要做的全部事情；各面原文在同一文件的 A、B、C、E 节。不做处置里「不修，记录」的项，也不做各面「超出已要求的需求」里的任何一项。

## 模型与推理强度
developer，implementation_kind product，Claude Opus 5.5（claude-opus-5-5），effort high。理由：代码项碰会话的收尾与错误去向（`work`、`pump`、`close()`），属于收尾时机一类风险，用默认档；改法已逐项写定，不需要顶档。

## 目标边界
目标：第 1–9 条全部落地，每个代码项有先红后绿的用例，文档与最终 head 一致。

### 已定的事（不重新裁定）
1. **脚本化传输的 `cancelRequest` 经相规则**：`testing-scripted-transport.ts` 的 `cancelRequest` 在不按通知取消的连接上，取在途项后调用 `this.stop(entry)`；只在已交出相时记 `stream-aborted`。用例：在授权发现中的请求上 `cancelRequest`，结局与会话相同（经 `stopAnswerOf`），用例放契约 `tests/`。
2. **缺陷总有去向**：`session.ts` 的 `work` 在 catch 里，`stop` 抛出时原缺陷仍交给 `reportDefect`（`try/finally` 或先报后停，选一种并在提交说明写理由）。用例：让 `stop` 经过的一个端口抛出（例如交换的 `abort`），断言原缺陷到了缺陷出口，且没有未处理拒绝。
3. **线路事件迭代 reject**：`pump` 的 catch 按线路断开处理，调用 `die('stream-broken')`，并把原因交 `reportDefect`；注释改成与行为一致。用例：测试线路的事件迭代 reject 时，在途请求按相结算（授权中答 `not-sent`，已交出答 `no-answer`（`stream-broken`）），缺陷出口收到原因。测试线路缺这种能力时，在 `tests/` 的测试线路上加，不改产品线路。
4. **线路 `close()` 的义务与单飞**：`line.ts` 的 `Line.close` 文档写明「完成只依赖本地资源，不等对端；这是 V4 的前提」。`StdioLine.close()` 第二次调用返回第一次关闭的同一个 promise，在读循环结束之后才完成。用例：连续两次 `close()`，第二次在读循环结束之前不完成。
5. **B 非阻断 1–8**：按处置第 5 条逐项改。`mB1` 的归属：文档与 `tests/model/mutants.ts` 的 `breaks` 写成同一个（以 SPEC V6 为准，`breaks` 跟着改；只改这一个字段）。两份 TLC 运行记录对齐到同一次运行（第 6 条重跑之后的那一次）。
6. **B 非阻断 9 与小项**：按处置第 6 条逐项改。`verification/models/TransportSession.tla` 只改注释；改后按 `verification/models/README.md` 的命令重跑全部配置与有效动作变异，读数写进运行记录。
7. **C 非阻断 8**：H6 与 `stdio-line.ts` 的 `close()` 注释写明：不等缓冲排空，但已交给 Node 的字节仍可能送达，对端在在途写结束之后才见到输入结束。
8. **`McpTransport.call` 的前提**：契约 SPEC 在 T 段 `call` 处写明「参数与输入答复的值树已经判定（`judgeJsonValue`），违反是调用方的缺陷」。只写这一句及其指针，不改代码。
9. **依据写法**：成员 SPEC 依据表对契约 SPEC 一行写「与本页同一提交的契约 SPEC」；成员 SPEC 维护一节加一句「契约 T1–T9、R4 或裁定表变化时重核本页」。
10. **红灯表 B 节存活的 `settle` 守卫变异**：在现行代码上（副本）重跑一次：变红就记用例名；存活就判断能否补一条用例让它可判定，能补就补（放 `tests/`），不能补就写等价理由。记进 `verification/README.md` 的红灯相关一节。

### 写范围
- `packages/mcp/mcp-contract/src/testing-scripted-transport.ts` — 第 1 条
- `packages/mcp/mcp-contract/tests/` — 第 1 条的用例（只新增用例，不改已有断言）
- `packages/mcp/mcp-contract/SPEC.md` — 第 5、6、8 条涉及的句子
- `packages/mcp/mcp-host-local/src/session.ts` — 第 2、3 条
- `packages/mcp/mcp-host-local/src/line.ts` — 第 4 条（只改文档注释）
- `packages/mcp/mcp-host-local/src/stdio-line.ts` — 第 4、7 条
- `packages/mcp/mcp-host-local/src/index.md` — 第 5 条如需
- `packages/mcp/mcp-host-local/tests/` — 第 2、3、4、10 条的用例与测试线路；`tests/model/mutants.ts` 只改 `mB1` 的 `breaks`
- `packages/mcp/mcp-host-local/SPEC.md` — 第 5、6、7、9 条
- `packages/mcp/mcp-host-local/docs/object-model.md` — 第 5 条
- `packages/mcp/mcp-host-local/docs/architecture.md` — 第 5 条
- `packages/mcp/mcp-host-local/verification/README.md` — 第 5、6、10 条
- `packages/mcp/mcp-host-local/verification/models/README.md` — 第 5、6 条
- `packages/mcp/mcp-host-local/verification/models/TransportSession.tla` — 只改注释（第 6 条）

### 排除的调用方
- `packages/mcp/mcp/`：调用口分支另有写者；契约脚本化传输的消费者在那边，合入父分支后由派发者跑组合用例。
- `packages/mcp/mcp-host-local/src/` 中 `session.ts`、`line.ts`、`stdio-line.ts` 之外的文件。
- 契约 `src/` 中 `testing-scripted-transport.ts` 之外的文件。

## 验收清单
1. 第 1–4 条：每条的新用例在基线 `54a2377cb` 的 `src/` 上变红、在 head 上变绿；红灯日志存 `tmp/closures/w3-mcp-host/fix4/red/`，交回写「用例全名 → 缺陷 → 变红摘录 → 日志哈希」。
2. `VITEST_MAX_WORKERS=4 pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract --filter=@omne-harness/mcp-host-local --filter=@omne-harness/mcp` 退出 0；交回写三个包的用例数与两条传输的符合性套件计数（通过、失败、不适用）。
3. 负控：`node tests/model/mutate.ts --out ../../../tmp/closures/w3-mcp-host/fix4/mutants`（host 包根）全部变红、源码逐字节还原。
4. TLC：全部配置与有效动作变异符合判读，日志哈希写进模型 README 与交回。
5. `pnpm run typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`、`check:docs`、`check:design` 退出 0，`git ls-files --eol | grep -c w/crlf` 为 0；输出尾部与日志哈希写进交回。
6. `git diff --name-only <基线>..HEAD` 只含写范围内的文件；`TransportSession.tla` 与 `line.ts` 的 diff 只有注释行；`mutants.ts` 的 diff 只有 `mB1` 的 `breaks`。
7. 第 5–9 条逐项写「已改」与位置。

## 实施规格
- 代码项先写用例，确认在基线上变红，再改实现。
- 中文文档按 asd-ste100 的语言无关规则；英文 README 不在范围。
- 只写现状与依据，不写评审轮次与过程；编号要能在仓库里解析。

## 性质及证据义务
- 第 1 条之后，`stopAnswerOf` 与 `lineGoneAnswerOf` 仍是会话与脚本化传输决定结局的唯一入口（交回附 `grep` 输出）。
- 第 2、3 条之后，会话里每个 catch 都把原因交给缺陷出口或按端口条款映射成结局（交回逐个列出 catch 与去向）。

## 施工计划
1. 读处置与各面原文、`720a5d08a..54a2377cb` 的相关 diff。
2. 第 1–4 条：先红用例，再改，再绿。
3. 第 10 条变异重跑。
4. 第 5–9 条文档；第 6 条的 TLC 重跑。
5. 负控、门禁、交回。
提交信息中文，trailer `Harness: claude-code`、`Agent-Role: developer`，作者 `PanQiWei <594557445@qq.com>`。不加 Co-Authored-By。

## 自主范围与动作授权
允许：写范围内改文件；运行三个 mcp 成员的测试、负控、TLC、仓库检查；本地提交。不允许：推送、开 PR、合并、改写范围外文件、做处置「不修，记录」与「超出已要求的需求」里的事。

## 工作树与协调
独占工作树 /data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host。并行：调用口树上 `w3-mcp-call-docs3`（Sonnet，会跑单个用例文件与 TLC）。成员测试用 `VITEST_MAX_WORKERS=4`；TLC 经 `node scripts/with-test-slot.mjs` 取名额，`FORMAL_WORKERS=4`，`JAVA_BIN=/opt/java/jdk-21.0.12.1+1-jre/bin/java`，jar 是 `/opt/tlaplus/tla2tools.jar`（v1.7.4）。不跑 `admission`、仓库全量测试与差分变异。变异在工作树之外的副本上做。

## 方法与知识入口
- 先读：/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/.meta_harness/agents/skills/delegate/canonical/references/writer-conventions.md
- 处置与各面原文：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/reviews/mcp-host-r4.md
- 闭包主规格：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/closures/w3-mcp-host.md
- fix3 与 docs3 的交回：/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/delegate/handbacks/w3-mcp-host-fix3.md、w3-mcp-host-docs3.md
- 各面的探针（可复用）：`/tmp/host-r4-a/`、`/tmp/c-r4-probe/`
- 必须加载：asd-ste100；ub-mode

## 当前认知
- 已确认：第 4 轮四面都没有阻断；第 3 轮阻断全部消失（A 面逐条复跑探针）。
- 已确认：`stopAnswerOf`、`lineGoneAnswerOf` 对三相穷尽；会话只经它们结算，脚本化传输除 `cancelRequest` 外也只经它们。
- 未知：测试线路是否已能让事件迭代 reject；`settle` 守卫变异的原文在现行 `session.ts` 上对应哪一行。

## 返回与恢复
每个提交号；验收各条的命令、结果、输出尾部与日志哈希；红灯明细；负控与 TLC 读数；第 5–9 条逐项位置；变异重跑结论；未覆盖项。

## 已知会受影响的现有用例
- 依赖脚本化传输 `cancelRequest` 只作用于已交出相的用例（契约与 host 两侧）：若有，按新行为改断言，并在交回里逐条说明。

## 停止条件
- 某条代码项的新用例在基线上不变红（说明缺陷描述有误）。
- 第 1 条改动让调用口一侧可能依赖的行为变化无法在本树里判断时，写明并继续，不改 `packages/mcp/mcp/`。
- `TransportSession.tla` 改注释后某个配置的判读与预期不符。

## 追加记录
- 2026-11-06 06:35 派发前：基线 `54a2377cb`（已推送），树干净。简报检查退出 0；24591 条 `caller-outside-scope` 是 `send`、`close`、`stop` 一类常见标识符的全仓同名匹配，不是本闭包的调用方。这是第 4 轮关口之后唯一的一轮修复（C-SM-08）；修完只复核本轮改动，再跑一次差分变异。

## 接受（派发者，2026-11-06 07:31 UTC）
- 交回存档：`delegate/handbacks/w3-mcp-host-fix4.md`。读了四处代码改动的 diff；`54a2377cb..1ec708899` 共 16 个文件，都在写范围内；6 个提交的作者与 trailer 读回无误。
- 第 10 条 `settle` 守卫的变异判为等价：理由成立（会对已结算条目调用 `settle` 的两处都不带探测计时），接受。
- turbo 第一次退出 1（N01 计数为 0）记为负载下的偶发，第二次在同一 head 退出 0；两次都上卡，不只贴绿的那次。
- 范围外观察的处置（`50fc8d146`）：释放函数不抛出写成端口义务；`lineGoneAnswerOf` 注释补 X02；`mB1` 文案去掉过程引用；契约「未覆盖」原句改准；值树前提扩到 `updateTask`。`received()` 的 12 ms 静默窗口转波末小卡。
- 接受。
