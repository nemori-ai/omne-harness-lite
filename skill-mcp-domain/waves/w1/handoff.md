# W1 交接报告（Skill 线与 MCP 线）

格式沿 `.meta_harness/human/map-reduce-delivery/templates/handoff-report.md`，按[范式 r1](../operating-model.md) 变通：没有卡与线轨道，候选是父分支头。

- 波：W1 契约地基；F = 21175c9f9；计划修订 r1
- 候选：父分支 `PanQiWei/skill-mcp` 头 **c247b873a**（含 PR #1110 → aafc0cdc9、PR #1111 → c247b873a 两个 merge commit）；写回闭包合入后以本文件末尾「波末补记」为准
- taskBase：21175c9f9
- 结果：ready（写回与波末准入见补记）
- 停写：两个契约闭包已停写，工作树已删，证据在 `evidence/w1-skill-contract/`、`evidence/w1-mcp-contract/`

## 1. 做了什么

| 闭包 | 线 | 轮次 | 合入 | 用例 | 覆盖 |
| --- | --- | --- | --- | --- | --- |
| w1-skill-contract | Skill | 3（+reduce 1 处测试修） | PR #1110 → aafc0cdc9 | 13 文件 364 例 | 97% |
| w1-mcp-contract | MCP | 4 | PR #1111 → c247b873a | 12 文件 298 例 | 98% |

### Skill 线

| 验收项 | 达到或未达到 | 证据 |
| --- | --- | --- |
| SC1 三入口与导出键集合；公开根不导入 ./testing | 达到 | `public-entry.spec.ts` 沿导入图核对；r1-delivery.md |
| SC2 每个拒绝原因有包样本；按封闭次序取第一条 | 达到 | `parse/package.ts` `INSPECT_REJECTIONS`；`package.spec.ts` |
| SC3 纯函数边界穷举 | 达到 | `names/digest/media/yaml-value` 各 spec |
| SC4 `sealSnapshot` 拒绝重复与前缀冲突；摘要与次序、包根名无关 | 达到 | `snapshot.spec.ts` |
| SC5 三个端口套件全绿；违反无披露的替身使套件变红 | 达到 | `conformance.spec.ts`（进程内变红，无子进程） |
| SC6 `skillBodyContract` 可加扩展；旧测试原样通过；设置声明项 | 达到 | `contract.spec.ts`；assets 旧 6 例未改 |
| SC7 迁到 typescript-package 3.0.0 完整骨架 | 达到 | preflight 0；`acceptance/` 四文件 |
| SC8 SPEC 封闭全部未定项；声明 schema | 达到 | `SPEC.md`「与组页的差异」15 处；`schema/skill-declaration.schema.json` |

### MCP 线

| 验收项 | 达到或未达到 | 证据 |
| --- | --- | --- |
| MC1 三入口；不依赖 MCP SDK | 达到 | `package.json` 无 `@modelcontextprotocol/*`；`public-entry.spec.ts` |
| MC2 接入点正文拒绝原因；本机命令判定；设置声明项 | 达到 | `endpoint.spec.ts` 23 例；`spec-closed-sets.spec.ts` |
| MC3 `completeListing`/`mergeListing` 性质测试 | 达到 | `catalog.spec.ts` 31 例 + `mergeListingCases` |
| MC4 `classifyOutcome` 穷举结局 | 达到 | `classifyOutcomeCases`；`closed-sets.spec-d.ts` 钉死联合 |
| MC5 `toContentBlocks` 不丢内容 | 达到 | `content.spec.ts` |
| MC6 五个端口套件全绿；违反无披露的替身使套件变红 | 达到 | `conformance.spec.ts` |
| MC7 结构扫描无缺项 | 达到 | r1-structure.md + 第 2 轮 38–41 项 |
| MC8 SPEC 封闭全部未定项；接入点正文 schema | 达到 | `SPEC.md`「与组页的差异」10 处、「未封闭项」1 处交资产 SPEC；`schema/endpoint-body.schema.json` |

## 2. 没做什么

- Skill `parse/manifest.ts:47–55` 头部定界扫描的边界（`-1/+1`、`end-1`）变异存活，是测试缺口，不是行为缺陷；W2 补夹具。
- MCP 产品代码 49 条存活变异散在 10 个文件，`brands.ts:50–52` 与 `endpoint.ts:117–153` 各一簇；W2 补。
- 两成员的差分变异都因静态变异改坏模块加载被工具判「测量无效」（Skill 13 个、MCP 96 个），没有分数，只有被杀/存活清单。接受为读数，不改工具。
- 三个 Skill 应用服务与六个 MCP 应用服务只有接口，实现在 W2。
- 组页/领域页/README 写回在两个写回闭包里（见补记）。

## 3. 发现的冲突

- 组页（`packages/mcp/docs/architecture.md` 407–436）沿 2025-11-25 线写 `mode`/`taskSupport`/`mode-unsupported`；2026-07-28 修订（SEP-2663）任务由服务端决定。裁定 G1 删除，写回组页。这是 reduce 设计阶段的错误，已记进 plan-changes 反向信号。
- 两份波规格对套件形态（vitest 套件 vs `ConformanceCase[]`）与品牌授予（`toX` vs `isX`）写法不一致；裁定按 tool-contract 先例统一。
- 组页 L459 与 L467 对 `cancelTask` 是否需连接自相矛盾；裁定 M3-17 统一为例外。
- 写者工具里没有 SendMessage，波中不能提问；改为写者自定并在交回列理由（范式 §3 已记）。
- 变异沙箱会写出文件，读源码文本的测试在沙箱里失败；两边都改为先去注释与空语句再比对。
- 记录分支首建时误用相对路径污染主检出（已 `reset --keep`，脚本改绝对路径）。

## 4. 给集成节点的提示

- 两成员都只在父分支，未进任何轨道。合入轨道前要补：API 语义复核签名（两成员未登记）、组页写回后的 `check:docs`/`check:design`。
- `lint:deps` 基线既有 `no-unresolvable`（agent dist 缺失），先 build agent 再跑。
- `loop:status --strict` 要先 `pnpm run acceptance`，否则验收传感器无数据。
- 两成员的「只能由构造器造出」是进程内 `WeakSet` 凭证，装配方须保证单实例。
- W2 引用：`w2-skill` 用 `./provider` 的 `PackageInspection`/`sealSnapshot`；`w2-mcp-core` 用公开根的 `completeListing`/`classifyOutcome` 与 `./provider` 的五个端口。
- 清理候选：Skill 与 tool-contract 的 25 行 read-body 读取器克隆（去处是 assets）；MCP `listing.ts`↔`catalog.ts` 类型环（把 `AdoptionBasis`/`ExpectedRevision`/`Freshness` 下沉到 `listing.ts`）。

## 5. 评审闭合

- 评审（第 1 轮，六面，报告在 `reviews/`）：交付边界 r1-delivery.md（无阻断）；正确性 r1-correctness.md（无阻断，21 条裁定 C1–C21）；设计与实践 r1-design.md（4 条全局裁定 G1–G4）；结构读数 r1-structure.md（CC 热点 4 处，拆分 3 处）；差分变异 r1-mutation.md（两边测量无效，存活按三类处置）；SPEC 表达 r1-spec.md（Skill 1 阻断、MCP 4 阻断，E1–E31）。汇总 decisions-r1.md。
- 修复轮：
  - 第 2 轮：续用原写者；Skill 38 条、MCP 46 条追加记录；增量复审四面（r2-summary.md）：代码面无阻断；SPEC 面 Skill 无阻断、MCP 1 阻断（非调用请求的失败落点，decision-gap）。返工原因：规格。
  - 第 3 轮：Skill 39–52、MCP 47–68；reduce 在两 head 跑完整链；MCP 另派 B1 改法最小表达复审。Skill 变异因测试读源码文本在沙箱失败，reduce 改 `public-entry.spec.ts`（3adb30b2c）后重跑。返工原因：评审发现、环境。
  - 第 4 轮（仅 MCP）：69–77（`answer-malformed`、`close-unconfirmed`、任务操作新建连接须 granted）；head 302441beb。返工原因：规格。
- 复验（合入前，每个 head）：成员 build/typecheck/test、`typecheck`、`lint:rules`、`lint:oxlint`、`lint:deps`、`preflight`、`metrics --coverage --base F`、`acceptance`、`loop:status --strict --base F` 全部退出 0；四条硬线全过；`mutation --base F` 在最终 head 各跑一次。证据：`evidence/w1-skill-contract/reduce/`、`evidence/w1-mcp-contract/reduce/r4/`。
- 未闭合的发现：无阻断。读数类：Skill `skillResolutionConformance` CC 11（用例表）；MCP `parseEndpointBody` CC 16（契约拒绝次序，已抽 `transportOf`，不再拆）、`deliveredItem` CC 12、`isConnectionTarget` CC 11。
- 准入：父分支头 c247b873a 上 `pnpm run admission` + `acceptance` + `loop:status --strict --base 21175c9f9`，结果见补记。

## 波末补记

（写回闭包合入与准入结果在此追加。）
