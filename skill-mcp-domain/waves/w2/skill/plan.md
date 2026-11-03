# W2 Skill 线交付计划：`@omne-harness/skill` 与 `@omne-harness/skill-host-local`

格式沿 `claim` 技能 `references/plan-template.md`，方法 Matt `to-tickets`。与同目录 [spec.md](spec.md) 配套。

## 进度总览

进度：[□□□□□□□□□□] 0/6 切片已完成 · 更新 2026-11-03T17:50:00Z · head b0f2ec7fb
当前：切片 01、05 第 2 步（写闭包规格）

| 切片 | 交付的行为 | 对应判据 | 状态 |
| --- | --- | --- | --- |
| 01 | 一个目录包经 `createPackageInspection` 得到 `SkillDefinition` 或按次序的拒绝 | SK2-1 | 待做 |
| 02 | `describe` 与 `gate`：无权主体三路径同答，依据核对，`material` 两态 | SK2-2（1–4 步）、SK2-3、SK2-7 | 待做 |
| 03 | `read`、`list` 与 `pin`/`verifiedBytes`：摘要分野、`resource-missing`、`version-changed`、范围规则、`aborted` | SK2-2（5–11 步）、SK2-4、SK2-6 | 待做 |
| 04 | `export` 与 `skillAccessConformance`；`manifest.ts` 夹具 | SK2-5、SK2-6、SK2-8 | 待做 |
| 05 | `createDirectorySource` 过来源套件；链接与非常规文件 | SK2-9、SK2-10 | 待做 |
| 06 | 权限接缝与竞争；示例 | SK2-11、SK2-12 | 待做 |

| 闭包 | 写者模型@档位 | 清晰度 | 工作树 | 分支 | 状态 | 轮次 | 追加 | 验收报告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| w2-skill（切片 01–04） | claude-fable-5-1@high | 定 | `.worktrees/w2-skill` | `PanQiWei/skill-mcp-w2-skill` | 待派 | 0 | 0 | — |
| w2-skill-host（切片 05–06） | claude-opus-5-5@high | 定 | `.worktrees/w2-skill-host` | `PanQiWei/skill-mcp-w2-skill-host` | 待派 | 0 | 0 | — |

## 角色与模型分配

本会话宿主：Claude Code（云），模型 claude-fable-5-1。派发做法按 `delegate`「选模型」；钉值来自 `render_pair.py --resolve claude_code --policy-version 947.1`。

| 切片或环节 | 工作性质与复杂度 | 清晰度 | 角色 | 模型与 effort | 理由 |
| --- | --- | --- | --- | --- | --- |
| 调度 | 规格、计划、简报、裁定、读 diff、L3 逐行读 | — | 本会话 | fable | 全局上下文 |
| 01–04 | 能力实现；读取关口安全敏感（无披露、依据） | 定 | developer，product | claude-fable-5-1，high | 策略 `security-sensitive` → 顶档，最低 high |
| 05–06 | 单成员提供者，规格完整；接缝设计有判断 | 定 | developer，product | claude-opus-5-5，high | 默认档 |
| 评审 | review-delivery、review-code 四面、implementation-reviewer（L3 热点） | — | 只读子代理 | opus，high | 项目默认评审档 |
| 修复轮 | 评审阻断 | — | developer | 第 1、2 轮同原写者；第 3 轮按 D6 | `quality.md` |

## 切片

### 01：检查目录包

- **交付：** 来源一侧把 `{ kind: 'directory', root }` 交给 `inspect`，得到定义或拒绝；来源失败与快照缺陷按映射。
- **被谁阻塞：** 无。
- **成员与文件：** `skill/src/inspection.ts`、`mapping.ts`、`index.ts`；测试用 `createMemorySource`。
- **验收：** `pnpm turbo run test --filter=@omne-harness/skill`；用例覆盖已定事项 7 的每条映射。

### 02：`describe` 与关口

- **交付：** `gate` 三步；`describe` 不读字节；无披露三路径同答。
- **被谁阻塞：** 01（共用 `mapping.ts`）。
- **文件：** `access/gate.ts`、`access/service.ts`。
- **验收：** A1–A3、A13 的本地用例先红后绿。

### 03：`read`、`list` 与范围

- **交付：** `pin`、`verifiedBytes`、`range`、`checkpoint`；`bodyOffsetOf` 可加。
- **被谁阻塞：** 02。
- **验收：** 11 步分支用例；`range.spec.ts` 六条；`bodyOffsetOf` 用例；契约旧用例原样通过。

### 04：`export`、套件与夹具

- **交付：** `export` 逐条核对；`skillAccessConformance()` ≥13 条，本实现全绿，去掉第 2 步的变体变红；`manifest.ts:47–55` 夹具。
- **被谁阻塞：** 03。
- **验收：** 套件；变红证据存 `tmp/closures/w2-skill/red/`；`pnpm run mutation --base F`（只 `manifest.ts`，用 `--plan-only` 先核范围）。

### 05：`createDirectorySource` 过套件

- **交付：** 真实临时目录上 `snapshot`/`open`；链接、非常规文件分类。
- **被谁阻塞：** 无（与 01 并行）。
- **文件：** `skill-host-local/src/{index,directory-source,fs,walk}.ts`。
- **验收：** `skillPackageSourceConformance()` 全绿；SK2-10 用例。

### 06：权限接缝、竞争、示例

- **交付：** 注入 `DirectoryFs` 的权限用例；取快照后改文件；`examples/` 一个脚本对样本目录做 `snapshot` + `parseSkillPackage`。
- **被谁阻塞：** 05。
- **验收：** SK2-11、SK2-12；示例可运行（`node --experimental-strip-types`）。

每个切片的七步待办同 [W1 计划](../../w1/skill/plan.md)。

## 集中检查

- 结构读数：每闭包交回后 reduce 跑 `pnpm run metrics --coverage --base F`、`lint:deps`。
- 差分变异：最终 head 上热点：`gate.ts`、`mapping.ts`、`range.ts`、`walk.ts`。
- 评审：交回后一次六面；L3 热点逐行。
- 准入：波末父分支头一次。

## 交回清单

- [ ] 进度总览最终状态；候选 head
- [ ] 闭包 PR 合入父分支（merge commit）
- [ ] 技术文档与进展页更新
- [ ] 波末交接报告 Skill 小节

## 顺序与并行

- `w2-skill` 内 01→02→03→04 串行；`w2-skill-host` 内 05→06 串行；两闭包并行，写集不相交。
- 只依赖 F；不读 MCP 线。
