# W2 交接报告（Skill 线与 MCP 线）

格式沿 `.meta_harness/human/map-reduce-delivery/templates/handoff-report.md`，按[范式 r1](../operating-model.md) 变通。

- 波：W2 通用实现与本地来源；F = b0f2ec7fb；计划修订 r3
- 候选：父分支 `PanQiWei/skill-mcp` 头 **78e978ab6**（实现 ff17f7701 + 写回）（PR #1114 → 478e56381、#1115 → 0956ccf01、#1116 → ff17f7701）；写回闭包合入后以「波末补记」为准
- taskBase：b0f2ec7fb
- 结果：ready（写回与准入见补记）
- 停写：三个实现闭包已停写，工作树已删，证据在 `evidence/w2-{skill,skill-host,mcp-core}/`

## 1. 做了什么

| 闭包 | 线 | 轮次 | 合入 | 用例 | 写者 |
| --- | --- | --- | --- | --- | --- |
| w2-skill-host | Skill | 2（+reduce 2 处） | PR #1114 → 478e56381 | 84（10 文件） | opus@high |
| w2-skill | Skill | 2（+reduce 1 处） | PR #1115 → 0956ccf01 | skill 195 + 契约 398 | fable@high |
| w2-mcp-core | MCP | 3（第 3 轮换写者 fable@xhigh；+reduce 1 处） | PR #1116 → ff17f7701 | 254（13 文件） | fable@high → fable@xhigh |
| w2-spike | Reduce | 1 | tmp | 4 个脚本 | opus |

### Skill 线

| 验收项 | 达到或未达到 | 证据 |
| --- | --- | --- |
| SK2-1 `inspect` 合法包与每种来源失败映射 | 达到 | `inspection.spec.ts`、`mapping.spec.ts`；变异 M1 |
| SK2-2 读取 11 步每个分支 | 达到（第 2 轮修正第 5/6 步次序） | `read.spec.ts`/`pin.spec.ts`/`bytes.spec.ts` 用例名含步号；探针 P4 |
| SK2-3 无披露三路径同答 | 达到 | 套件 A1–A3 两个夹具世界 `deepStrictEqual` |
| SK2-4 字节范围六条规则与正文起点 | 达到（请求终点取字面） | `range.spec.ts`、`body-offset.spec.ts`；探针 P5 |
| SK2-5 `skillAccessConformance` ≥13 条并能变红 | 达到 | 15 条 × 2 世界；跳过第 2 步在作答世界恰好 A1–A3 红 |
| SK2-6 `aborted`/`export` 不交部分内容 | 达到（gate 的两次端口调用也在检查点内） | A7 四端口 0 次；A12b；探针 P1/P2 |
| SK2-7 `describe` 不读字节 | 达到 | A13 |
| SK2-8 `manifest.ts` 边界夹具 | 达到 | 字节扫描 `frontmatterBounds` 替换旧实现，存活只剩类型守卫 |
| SK2-9 `DirectorySource` 过来源套件 | 达到 | PS1–PS6、PS8；PS7 不适用 |
| SK2-10 链接与非常规文件分类 | 达到 | `links.spec.ts`（根外、悬空、成环、FIFO、socket） |
| SK2-11 权限接缝不依赖 root | 达到 | `permissions.spec.ts` 注入 `DirectoryFs` |
| SK2-12 取快照后改文件 `open` 交新字节 | 达到 | `race.spec.ts` |

### MCP 线

| 验收项 | 达到或未达到 | 证据 |
| --- | --- | --- |
| MC2-1 `createMcpCore` 校验配置 | 达到 | `config.spec.ts`、`core.spec.ts` |
| MC2-2 `Connection` 状态机穷举 | 达到 | 74 例（13 合法、17 非法转移 × 2 策略） |
| MC2-3 `InFlightCalls` 五条性质 | 达到 | 13 例 |
| MC2-4 `admit` 六答复与令牌不可伪造 | 达到（第 2 轮改测生产入口；第 3 轮运行期也只能经关口铸出） | `gate.spec.ts`、`types.spec-d.ts`；探针 Ne3 |
| MC2-5 `ensure` 复用/重建/单飞/配值/连接失败/句柄释放 | 达到（时限覆盖范围第 2、3 轮修正） | `ensure.spec.ts` 33 例、`races.spec.ts` |
| MC2-6 `refresh` 整份发布与并发发布边界 | 部分：`stale-revision` 来源在 refresh 里不可达（basedOn 与 current 同读），其余达到 | `refresh.spec.ts` 34 例；探针 A/A2/B2 |
| MC2-7 `current`/`peer` 不连接 | 达到 | 替身计数 0 |
| MC2-8 `status` 四态视图与无披露 | 达到 | `status.spec.ts` |
| MC2-9 `release`/`closeAll` 次序与确认范围 | 达到（迟到进程范围进 residual） | `release.spec.ts`；探针 Nd/X7 |
| MC2-10 内存 `CatalogStore` 过 CS 套件 | 达到 | CS1–CS7，CS8 不适用 |

## 2. 没做什么

- `SkillCatalog`、`ActionInvoker`、任务表、`createMcp`、真实传输、SDK、`list_changed` 订阅：W3。
- MCP 核心的已知限制（成员 SPEC「已知限制」）：端口 reject 时资源归宿不保证（遗忘谓词未从「什么也不持有」推出）；临界区等待无上界的采用重读；落点永不答复则句柄不释放；`closeAll` 不阻止之后的建连；旧令牌在采用口给旧答复时短暂建旧连接。这几项是 W3 `w3-mcp-call` 的首项。
- Skill：与契约重复的常量、端口答畸形值的处置不对称（读取判定 `unknown` vs 对应端口抛 `TypeError`）；`skill` 的真实来源示例未补。
- `w2-spike` 未跑通：任务在 SDK 服务端没有 API（线路可行但形状自拟）；input_required 任务流转；T7 各种读不懂应答；auto 探测超时回退。
- 三个成员的 Stryker 读数：skill 96.4%（测量有效）；skill-host-local 280/杀 248/存活 21（5 静态变异致测量无效）；mcp 1420/杀 1104/存活 172（2 静态变异致测量无效）。

## 3. 发现的冲突

- 契约与组页：组页「读取」11 步次序与已定事项 3 把第 5 步捆进 `pin` 冲突（写者照做后自称偏离）→ 第 5 步独立为 `materialOf`。
- 契约措辞歧义：「请求终点」两种读法；`describe` 带依据时 basis 的来源；两处都裁定并写进 SPEC。
- 契约缺口：`refresh` 没有 `signal`（S5 的 `kept(cancelled)` 需要）；没有领域时钟；`close()`/`stop()` 的 reject 语义；`PeerIdentity.serverInfo` 必填（prep2 已改可选）。全部进 W3 prep。
- 已定事项与 SPEC：6.4「不可用 → 不报」与 S5「答 unknown」矛盾（按 S5）；6.5 时限覆盖范围与组页不变式 5（按组页并扩到取凭据）；11 自动关闭粒度（收窄为接入点级）。
- 2026-07-28 核对：14 项不一致/未覆盖，1 项影响 W2（已 prep2），13 项进 W3（`schema-check.md`）。
- 流程：三个 Opus 评审者与一个写者撞 5 小时用量上限（21:50 重置），续跑后无损；`records-sync.sh` 把探路件的 node_modules 同步进记录分支（已排除）；证明变红时必须重建 dist（两次无效证据）；写者两次声称已做 `satisfies` 实际未做（第 3 轮复审抓到，reduce 自修）。

## 4. 给集成节点的提示

- 三个成员都只在父分支，未进轨道。合入轨道前：组页写回（本波末）、API 语义复核签名、`acceptance:lock` 的 7 个主线历史提交要由 main/qa 处理（基线既有，与两域无关）。
- `w3-mcp-host` 只用 SDK 的 `Transport` 层自己发 JSON-RPC（spike 结论）；SDK 加进 catalog 与锁文件由 reduce 在 W3 prep 做。
- `@omne-harness/mcp` 给 W3 的接入点见 README「给下一波」：`admitForUse`/`stillAdmitted`、`createConnectionTable().ensure`、`InFlightCalls`、`readAccountOf`。
- `@omne-harness/skill` 的三段函数在 `src/access/` 内模块，W3 的 `SkillCatalog` 只用公开根的 `SkillPorts` 与契约 `resolution.adopted`。
- 清理候选：`mcp/internal/table.ts` 684 行（临界区 + 单飞 + 迟到收口叠在一起，W3 接调用口前抽「条目生命周期」模块）；`skill-contract` 与 `tool-contract` 的 read-body 克隆（W1 遗留）。

## 5. 评审闭合

- w2-skill-host：第 1 轮交付边界 1 阻断（reduce 自修 786c4a70b）、正确性 2 阻断 + 扇出预算裁定、设计 6 建议；第 2 轮全闭合，增量复审放行；reduce 补 e86875893。
- w2-skill：第 1 轮设计 2 阻断、交付边界 1 阻断、L3 探针 7 个（1 阻断 + 4 待裁）；第 2 轮全闭合并重放探针；增量复审无阻断；reduce 补 b123eec06。
- w2-mcp-core：第 1 轮交付边界 1 阻断、设计 1 阻断 + 10 建议、L3 探针 9 个（5 阻断、3 待裁）；第 2 轮闭合后新出 2 阻断（同类）；第 3 轮换写者修完，复审重放 27 个探针无阻断；同类问题第三次以非阻断形式出现，按 `quality.md` 缩窄承诺收口（SPEC 已知限制 + W3 首项）；reduce 补 9f41ad7ee。
- 复验（每个 head）：成员 build/typecheck/test、`lint:rules`、`lint:oxlint`、`lint:deps`、`metrics --coverage --base F`、`mutation --base F` 全部退出 0 或读数记录；证据 `evidence/w2-*/reduce/`。
- 未闭合：无阻断。读数类：`discovery.publish` CC 17、`table.begin` CC 13、`prepareSettings` CC 15、`skillAccessConformance` CC 11（套件）。
- 准入：父分支头 ff17f7701 的 `admission` + `acceptance` + `loop:status --strict --base F` 见补记。

## 波末补记

### 准入（父分支头 ff17f7701，2026-11-03 23:13–23:30 UTC，证据 `evidence/w2-admission/`）

- `pnpm run admission`：退出 1。18 步里除 test 外全绿（check:agents/design/lines/docs、change-scope、format:check、test:format、lint:oxlint、build、python、typecheck、contract-check、check:declarations、lint:rules、lint:deps）。**test 失败**：86 成员 22725 例，5 处失败：`tools/dev-flow` 两条 stack-trace 定向重跑通过（负载下的抖动，该目录自 F 无改动）；`execution-environment-host-local` 三条与 W1 相同，基线既有（该成员自 F 无改动，F 的祖先上同样失败）。慢层因快层失败没跑。
- `pnpm run acceptance`：退出 0。
- `pnpm run loop:status --strict --base b0f2ec7fb`：退出 0。四条硬线：依赖违规 0、环 0（组环按 GCX 例外）、验收锁无未解决违规、传感器有数据。
- 三个成员的 Stryker 读数见第 2 节。

### 写回闭包

| 闭包 | 轮次 | 合入 | 改动 |
| --- | --- | --- | --- |
| w2-writeback-skill | 1（+reduce 1 处） | PR #1117 → 3248c271a | 组页、组内 key-flows、领域页、领域 key-flows、README |
| w2-writeback-mcp | 1（+reduce 2 处） | PR #1118 → 78e978ab6 | 同上六类 |

- 评审：review-docs 五面（`reviews/writeback-r1.md`）：落盘遗漏无阻断、断链无、上下层 2 处旧「第一波」残留（reduce 自修）、表达 6 建议（4 条 reduce 自修，其余进 W3 写回清单）、图 2 建议（W3）。
- 写回后的父分支头 **78e978ab6**。
- 结果：**ready**。两域 W2 成果全部在父分支 `PanQiWei/skill-mcp`，未进任何轨道。
