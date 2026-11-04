# 交接信息包：Skill 与 MCP 两领域（卡 #1119，W3 进行中）

写于 2026-11-04（UTC），作者：PanQiWei 委派的 Claude Code 会话（reduce 兼 Skill、MCP 两线负责人）。负责人因配额暂停本会话，本包让另一台机器上的接手者**只凭 GitHub 上的提交与本包**无损接手。本包是任务过程材料，不是正文；正文以仓库里的组页、成员 SPEC 为准。

## 0. 接手先做的五件事

1. 读本包全文，再读卡 [#1119](https://github.com/nemori-ai/omne-harness-lite/issues/1119)（正文 + W1、W2 两条报告评论）。
2. 取三类分支（第 2 节列全）：父分支 `PanQiWei/skill-mcp`、记录分支 `PanQiWei/skill-mcp-records`、W3 未合入的闭包分支。
3. 在仓库根按 `AGENTS.md` 与 `docs/development.md` 准备依赖：`uv sync --locked`、`pnpm install --frozen-lockfile --ignore-scripts`。要跑 Python 参考 MCP 服务端时再 `uv sync --group mcp-fixtures`。
4. 装形式工具（第 6 节），跑 `pnpm run check:formal-tools` 应通过。
5. 从第 4 节「W3 闭包现状」表里状态为「进行中」的闭包开始，按「下一步」列做。

## 1. 这件事是什么

- **负责人**：PanQiWei（GitHub `PanQiWei`）。唯一的人类决策者。
- **范围**：Skill 领域（`packages/skills/*`）与 MCP 领域（`packages/mcp/*`）的**领域内实现**，边界是里程碑 M2「端到端多轮闭合」完结之前。M2 之后才做跨域联调（真实提供者、消费者接入、插件进应用插件树）。
- **交付方式**：单会话 map-reduce 波段式滚动交付。会话兼 reduce 与两条线负责人；写者、评审者是子代理。每个闭包一个写者、一棵工作树（`.worktrees/<闭包>`）、一个分支 `PanQiWei/skill-mcp-<闭包>`，评审后开 PR、**以 merge commit 合入父分支 `PanQiWei/skill-mcp`**。父分支是普通开发分支，**不是集成轨道**，不进 `integration/mainline`，不走 gate。
- **波段**：W1 契约地基（已收）→ W2 通用实现与本地来源（已收）→ **W3 调用、传输与目录（进行中）** → W4 Cordis 服务键与加固 → M2 之后联调。总体设计、波段计划、验收判据 C1–C6 在卡 #1119 正文。
- **向负责人汇报的口径**：只讲两个领域本身（需求、对外能力、设计实现交付进展），用地道中文，不汇报相邻领域的承接与联调。

## 2. 分支与提交（2026-11-04 停工时）

| 分支 | 头 | 说明 |
| --- | --- | --- |
| `PanQiWei/skill-mcp`（父分支） | `49e984dd8` | 含 W1、W2 全部、W3 已合入的 `w3-skill-catalog`（PR #1122）、`w3-skill-model`（PR #1123）、SDK 2.4.0 与参考服务端测试依赖 |
| `PanQiWei/skill-mcp-records`（记录分支） | 见本包所在提交 | 只存过程记录，永不合并。目录 `skill-mcp-domain/`：`waves/`（范式、各波波包与两线 spec/plan、评审、交接、W3 结构性处置、差距账本）、`delegate/`（闭包规格与追加记录、派发流水）、`compat/`（生态兼容探针与结果）、`evidence/`（reduce 复跑日志）、`techdoc/`、`progress/`、`model/` |
| `PanQiWei/skill-mcp-w3-mcp-contract` | 见第 4 节 | MCP 契约第 6 轮，**未合入** |
| `PanQiWei/skill-mcp-w3-mcp-table` | `1160e92c8` | 连接表收口第 2 轮，**停在这里，不合入**（被结构性处置取代，见第 3 节） |
| `PanQiWei/skill-mcp-w3-mcp-lifecycle-model` | 见第 4 节 | 连接表生命周期的性质账本、TLA+ 模型、探索器，**未合入**；基线是 `w3-mcp-table` 的 `1160e92c8` |
| `PanQiWei/skill-mcp-w3-skill-fix` | `8f0225d42` | Skill 差距修复与生态兼容，**未合入** |

本地工作树（另一台机器没有，按需重建）：`git worktree add .worktrees/<闭包> <分支>`，或用 `node --experimental-strip-types tools/dev-flow/src/integration/worktree-cli.ts prepare-closures --root <主检出> --base <40 位提交> --closure <名>:<分支> --build '<turbo 过滤>' --json`。新工作树要设 `git config user.name PanQiWei`、`git config user.email 594557445@qq.com`。

## 3. W3 的关键转折（必须知道的来龙去脉）

1. **生态兼容（负责人要求，优先于其余条目）**：MCP 与 Skill 是融入开发者生态的关键，社区 Skill（Claude 官方、Codex 官方、pstack、Matt、本机、本仓库）与各厂商 MCP 服务必须能用，不能因自造轮子或比规范与主流宿主更严而用不了。落点：`waves/w3/wave-pack.md`「生态兼容」节、`compat/README.md`。
2. **结构性处置（负责人要求）**：修问题不着眼局部，要有本质与结构视角；守住领域边界与 SOLID；清楚应然与实然的差距并消弭；重要的性能、架构、不变式用定理、形式化证明与契约测试守住。落点：`waves/w3/structural.md`（复盘根因与方法）与范式 `waves/operating-model.md` r3「方法」节。核心做法：
   - 应然（组页、SPEC）是唯一源；实然偏离时登记进**差距账本**并改实现，只有承诺本身错了才改承诺并写理由；写回不能把实然抄成应然。
   - 关键性质写成**定理**，配三类证据：TLA+ 模型（TLC 实跑）、驱动**真实实现**的有界穷举探索器、契约测试；六种证据状态分开写（`docs/verification.md`）。
   - 并发与资源生命周期用**结构化并发**；符合性套件按「条款 × 违约」组织；协议读法写成**全决策表/全函数**，套件由表生成。
   - 同一类问题第二次出现就停下做结构性处置，不再补洞（`quality.md`）。
3. **MCP SDK 版本**：负责人 2026-11-04 决定用最新版。父分支钉 `@modelcontextprotocol/client`、`server` 2.4.0（`core` 2.4.0、`node` 2.1.2、`server-legacy` 2.4.0）。**已接受的 RFC-0001 r4 文字仍写 2.3.1**，与负责人新决定不一致，需 RFC 拥有者更新；两领域没有改 RFC。
4. **MCP 连接表**：W2 三轮、W3 两轮评审都在同一类问题（异步副作用的所有权、错误去向、等待上界）上打转，已停止补洞；改为先建模（`w3-mcp-lifecycle-model`），再按模型做结构化并发重写（`w3-mcp-lifecycle`，未开工），验收 = 探索器零反例 + TLC 通过 + 既有用例。
5. **MCP 契约**：传输读法经三轮补条款后在第 4 轮改成 54 行全决策表 T8（989 个输入组合，每组合恰好一行，用例由行生成），第 6 轮再把「线上事件 → 应答类别」写成导出的纯全函数。第 6 轮定了**停止规则**：之后再报同一类阻断（线上事件归类、表与服务条款衔接），登记为未封闭项交 `w3-mcp-host` 用真实传输兑现，不开第 7 轮。

## 4. W3 闭包现状与下一步

| 闭包 | 状态 | 头 | 下一步 |
| --- | --- | --- | --- |
| `w3-skill-catalog` | 已合入 PR #1122（`e0b68a7c3`） | `cc6bad191` | 无 |
| `w3-skill-model` | 已合入 PR #1123（`49e984dd8`） | `ed9de3676` | 无 |
| `w3-skill-fix` | 进行中，第 2 轮做了大半 | `8f0225d42`（两个 WIP，reduce 代存） | 第 1 轮（`b63e4df0b` 及之前）完成并过门禁：GS-06/S7（边界解析核对引用身份；TLC 新负控 `ReadGate_FlawNoRefCheck` 报 `OwnMaterialOnly` 反例、正控无反例；探索器去掉 PR1 前提后 S1–S7 违反 0）、GS-02（inspect 映射按调用点分格）、GS-04（无合法头部答 `source-unavailable`）、GS-05（前提写进 SPEC）、GS-07（导航），三项兼容放宽（逐行读、说明超长加载、metadata）；语料 195/197。第 2 轮（闭包规格追加记录 15:05Z）两项：**N2 说明上限 16384** 在 WIP `ab761c7c1`（`contract.ts`、`parse/shape.ts`、`parse/manifest.ts`、公开根导出与 skill/skill-contract 用例，含新 `skill/tests/compat.spec.ts`）；**N1 name 与目录名不同时接受** 在 WIP `8f0225d42`（`parse/package.ts` 只按 `expectedName` 拒绝，另给 `name-differs-from-root` 提示；host-local 示例与 `examples.spec.ts` 改写，写者已做变红证明）。两个 WIP **都没过门禁**。接手者：先跑三成员门禁修到绿，核对 N2 的验收（claude-api 包 `describe` 与 `read` 正文成功；16385 字符拒绝；单一常量从公开根导出），语料复跑到 197/197 且每包读正文成功，探索器与 TLC 正控复跑，派增量 L3 复审与差分变异，合入；合入前可把两个 WIP 压成正常提交 |
| `w3-mcp-contract` | 第 6 轮实现已提交，未验收 | `0bed5de7b` | R6-1–R6-7 全部提交：`src/wire.ts` 导出纯全函数 `classifyWireEvent` 与 `PROCESS_EXIT_WINDOW_MS`；X01/X02「请求离开前失败」两行；信封判据进 T2；S1/S2/S5/S7 改写；N1–N9。写者提交前跑过：mcp-contract 536 例、mcp 254 例通过、类型无错。**没跑**：最后提交后的 turbo、`lint:rules`、`lint:deps`、`check:docs`、`format:check`；变异 M85、M138–M164 未跑（M53–M137 共 83 条在 `0bed5de7b` 上全部变红）。下一步：跑门禁与剩余变异（`python3 tmp/closures/w3-mcp-contract/red-r2/mutate-r2.py M85 M138 … M164`——**该脚本只在原机器工作树 tmp 里**，接手者需按 `red-r2` 的做法重建，或只做 reduce 的差分变异）；派一次增量表达复审，按停止规则处置；合入。另一项新发现待裁：SEP-2243 Final 规定 `x-mcp-header` 只用于 integer、string、boolean，不允许 `number`，契约 T2 仍允许 `number` |
| `w3-mcp-table` | 停止（不合入） | `1160e92c8` | 由 `w3-mcp-lifecycle` 取代；其已知阻断 B1（`closeAll` 未处理拒绝）、N2、P2 由模型复现、由重写修复 |
| `w3-mcp-lifecycle-model` | 基本完成，未评审 | `4a9287296` | 已提交：探索器 `packages/mcp/mcp/tests/model/`（驱动真实连接表，复现已知反例 B1、N1、N2、N3、P2 并给最短调度）；`verification/models/ConnectionTable.tla` 与 16 份配置（正控、已知反例 `cex-*`、负控 `bad-*`、活性探针），TLC 2.19 实跑，`run.py` 退出 0（结果表在 `verification/models/README.md`）；性质账本 P1–P8 在 `verification/README.md` 与 SPEC「性质与证据」；差距账本 `verification/gaps-mcp.md`。写者停下时仍有一次 vitest 在跑，它的最终报告没有交回——接手者先跑成员门禁确认，再派一次 L3 评审（核对模型—实现映射与反例），合入 |
| `w3-mcp-lifecycle` | 未开工 | — | 模型合入后派：按性质账本 P1–P8 把连接表改成结构化并发（每个异步副作用有作用域、错误去向、等待上界；端口调用只经一个把同步抛出/拒绝/挂起/答复变成类型化结局的适配器）；验收 = 探索器零反例 + TLC + 既有用例。基线：模型合入后的父分支（需先把 `w3-mcp-table` 的 `1160e92c8` 一并合入或在其上开） |
| `w3-mcp-host` | 未开工 | — | 契约合入后派：`createLocalTransportFactory`（stdio + Streamable HTTP，HTTP+SSE 旧传输作为 Streamable HTTP 内的回退）；优先复用 SDK 2.4.0，只在违反硬承诺（结局如实分类、进程归落点、不代调用方重发）处自写；用契约的归类函数与 T8；真实 SDK 服务端夹具跑 `mcpTransportConformance()`；HTTP 5xx 与契约未封闭项在此兑现 |
| `w3-mcp-call` | 未开工 | — | `w3-mcp-lifecycle` 合入后派：`ActionInvoker`、任务表、`createMcp`；删成员内绕道；C1 清单容错改为单个不合法工具剔除并报告（授权写 `mcp-contract` 的 C1 与 `completeListing`）；兑现契约 T9、S2、S5、S7、S8 的服务侧条款 |
| `w3-mcp-e2e` | 未开工 | — | 两种传输上 `createMcp` 跑旅程；兼容矩阵：6 个目标（第 7 节）上「发现 → 列工具 → 调一个只读工具」与官方 SDK 客户端结论一致 |
| 波末 | 未开工 | — | 组页/领域页写回（含差距账本里的组页项、表达评审的 G1–G8）；`pnpm run admission` + `acceptance` + `loop:status --strict --base <F0>`；`waves/w3/handoff.md`；卡 #1119 更新与 W3 报告评论；`records-sync.sh` |

**待负责人拍板**：要不要把 `w3-mcp-call` 与 `w3-mcp-e2e` 挪到 W4 开头，让 W3 以「契约 + 本地传输 + 生命周期重写 + Skill 收尾」为出口（代价：卡判据 C4 顺延一波）。负责人尚未回答；默认按原计划。

## 5. 已定的裁定（只列 W3 需要接手者知道的；全文在记录分支）

- MCP 线规格 `waves/w3/mcp/spec.md` 已定事项 1–41，加「生态兼容」节与更正（`Mcp-Name`：`tools/call` 为工具名，`tasks/*` 为任务号，依 SEP-2663）。契约各轮裁定在 `delegate/closures/w3-mcp-contract.md` 追加记录（C1–C9、待裁 1–6、D1–D6、R4-1–R4-7、R6-1–R6-7）。要点：
  - 旧一路 `initialize` 不声明任何客户端能力；对端 `ping` 答空结果，其余对端请求 `-32601`；旧对端 HTTP 取消发 `notifications/cancelled`，现代修订中止应答流；会话 404 → `not-sent`（`session-ended`）。
  - 探测与回退与 SDK 2.4.0 一致，唯一不同：`-32020`/`-32021` 不回退；stdio 探测时管道断开或进程退出不回退。
  - 请求离开前失败（HTTP 连接阶段、stdio 写入时管道已断）→ `not-sent`（`connection-unavailable`）；已开始发送后断开 → 流断开（读类再发一次，写类不再发）；不跟随重定向。
  - JSON-RPC 信封判据：JSON 对象、`jsonrpc:"2.0"`、恰好 `result` 或 `error` 之一、`id` 等于本请求（4xx/5xx 正文不核 id）。
  - stdout 结束与进程退出都发生：`exited` 在 100 ms 内兑现记进程退出，否则流断开。
  - 表结论带「传输不再可用」→ 连接 `lost`（子因）+ `markUnavailable(connection-unavailable)`。
  - `cancelTask` 复用连接不核授权；新建连接必须核采用、资格 `granted`。
  - 有意偏离协议：HTTP 应答流断开时只对读类请求重发一次，`tools/call`、`tasks/update`、`tasks/cancel` 不重发（效果未知时不代调用方重发）。
- Skill 线规格 `waves/w3/skill/spec.md` 已定事项 1–13；`delegate/closures/w3-skill-catalog.md` 与 `w3-skill-fix.md` 追加记录。要点：
  - 端口答复（判别与载荷）在边界上一次完整解析，不合即「没有作答」：判定端口 → `unknown`，来源 → `source-unavailable`；参数 JSON 树逐节点重建并冻结、深度上限、数字词法、只认自有属性。
  - GS-06/S7 引用身份一致：`resolve` 的 `ref.capability` 必须是所请求的身份（带依据时来源层、资产版本、内容摘要相等），否则 `unknown`。
  - 生态兼容放宽：说明 1025–16384 字符可用并带提示（>16384 拒绝；有意偏离 Agent Skills 1024 上限）；name 与目录名不同接受、以头部 name 为准（`expectedName` 给出时仍拒绝）；`metadata` 非字符串映射只保留字符串值；严格 YAML 失败退到逐行读 `name`、`description`；每项带兼容提示 `compatibilityHints`。
- 停止规则与「同一类阻断两次即缩窄承诺」：`quality.md`。

## 6. 环境（另一台机器要重做）

- **形式工具**（负责人授权安装；云环境 setup 脚本里尚未加入，新会话要重装）：
  ```bash
  mkdir -p /opt/tlaplus /opt/alloy
  curl -sSL -o /opt/tlaplus/tla2tools.jar https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar   # sha256 936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
  curl -sSL -o /opt/alloy/alloy-6.2.0.jar https://github.com/AlloyTools/org.alloytools.alloy/releases/download/v6.2.0/org.alloytools.alloy.dist.jar   # sha256 6b8c1cb5bc93bedfc7c61435c4e1ab6e688a242dc702a394628d9a9801edb78d
  ```
  `/usr/local/bin/tlc`（`exec java -XX:+UseParallelGC -cp /opt/tlaplus/tla2tools.jar tlc2.TLC "$@"`）、`tla2sany`（`tla2sany.SANY`）、`alloy`（`-jar /opt/alloy/alloy.jar`，`alloy.jar` 链到 `alloy-6.2.0.jar`）；`/etc/profile.d/tlaplus.sh` 导出 `JAVA_HOME`、`JAVA_BIN`、`TLA2TOOLS_JAR`、`ALLOY_ANALYZER_JAR`。非登录 shell 先 `. /etc/profile.d/tlaplus.sh`。`pnpm run check:formal-tools` 校验版本与 SHA。TLC 版本必须是 v1.7.4（TLC 2.19）。
- **参考 MCP 服务端**（测试依赖，锁文件安装，不经 npx/uvx）：`@modelcontextprotocol/server-everything`、`server-filesystem` 2.1.0（`mcp-host-local` devDependencies）；Python `mcp-server-fetch` 2026.10.28（根 `pyproject.toml` 非默认组 `mcp-fixtures`）。
- 已知基线失败（与两域无关）：`preflight`/`admission` 的 `acceptance:lock` 报 7 个主线历史提交；`execution-environment-host-local` 三条测试在 root 下失败；新工作树里 `lint:deps` 首跑可能因 `packages/agent/agent/dist` 未构建而报不可解析，先 `pnpm turbo run build --filter=@omne-harness/agent`。

## 7. 生态兼容基线（`compat/README.md` 全文）

- Skill 社区语料（`compat/skill-compat.mjs`：加载 + 经 `SkillAccess` 读正文）：Claude 官方 `anthropics/skills`@ca45fc4、Codex 官方 `openai/skills`@49f948f、pstack 0.9.128、Matt 1.3.2、本机 `~/.claude/skills`、本仓库 `.claude/skills`，共 197 包。父分支上 191 可加载；`w3-skill-fix` 第 1 轮 195；目标 100% 且每包读正文成功。
- MCP 六个目标（`compat/mcp-*-baseline.mjs`，官方 SDK 2.4.0 客户端对照全部可连）：DeepWiki、Context7（2026-07-28）、Microsoft Learn（2025-06-18，旧修订）三个远程 HTTP；server-everything（22 工具）、server-filesystem（14）、Python mcp-server-fetch（1）三个本地 stdio。GitHub MCP 需要 OAuth（归凭据提供者）。

## 8. 流程与工具（照做即可）

- 每个闭包：闭包规格（十二字段 + 追加记录，见现有 `delegate/closures/*.md`）→ `node --experimental-strip-types tools/dev-flow/src/delegate/brief-check-cli.ts --spec <规格> --base <40 位提交>` 退出 0（基线写 40 位；写范围每行一个路径；新建文件标「（新建）」；避免反引号包常见词，否则检查器输出过长崩溃）→ 选模型 `python3 .claude/skills/design-subagents/scripts/render_pair.py --source .meta_harness/agents/roles/developer --resolve claude_code --work-kind product --risk <security-sensitive|cross-module-lifecycle|cross-process-faults> --policy-version 947.1` → 派写者 → reduce 自己 `grep` 核实结构性改动、复跑门禁（成员 build/typecheck/test、`lint:rules`、`lint:oxlint`、`lint:deps`、`format:check`）→ 评审（L3 implementation-reviewer 实跑探针；设计与实践；SPEC 用 design-reviewer 的 expression 判断）→ 修复轮写进追加记录 → 最终 head 跑 `pnpm run mutation --base <F0>` → 推分支、开 PR（模板 `.github/pull_request_template.md`）、merge commit 合入 → 父分支 `pnpm install --frozen-lockfile` 与成员门禁。
- 署名：作者 `PanQiWei <594557445@qq.com>`；trailer `Harness: claude-code` + `Agent-Role`（写者 `developer`，reduce `main`）；**不加 Co-Authored-By**（CONTRIBUTING 禁止，`lint:rules` 拒绝）。
- GitHub：本会话只能用 `gh` 做 search；写操作用 GitHub MCP 工具。
- 用量：Fable 有单独上限；Opus 5 小时上限一次最多两三个并发；写者在跑时评审错开。
- 记录：`bash tmp/skill-mcp-domain/records-sync.sh "<说明>"` 把 tmp 里的过程材料推到记录分支。
- 页面：进展页 https://claude.ai/artifact/KNYD4VLPdkvyrh433dHRqc、实现架构页 https://claude.ai/artifact/3Zfm6AtcBczsMTTE6KuhkA（Claude 账号私有，换机后用 artifact 工具按 URL 读写；生成脚本 `progress/build.py`、`techdoc/gen.mjs` 在记录分支）。

## 9. 本波教训（接手后避免重犯）

- 越过已接受的 RFC 改依赖版本（SDK 2.3.1 → 2.4.0）之前，先查 `docs/rfcs/` 与 `docs/architecture/technical-foundations.md`；负责人后来明确授权用最新版。
- 给写者转评审意见要带原文，不能只给编号。
- 闭包写范围要包含成员的 `docs/`、`documentation.json`、`index.md`、`tests/index.md`。
- 证明变红必须先还原源码并重建 dist。
- 用文字穷尽线上协议没有尽头：用全决策表 + 全函数 + 真实对端做仲裁。
