# W1 Skill 线交付计划：`@omne-harness/skill-contract`

格式沿 `claim` 技能 `references/plan-template.md`，方法 Matt `to-tickets`。与同目录 [spec.md](spec.md) 配套。

## 进度总览

进度：[□□□□□□□□□□] 0/4 切片已完成 · 更新 2026-11-03T13:40:00Z · head 21175c9f9
当前：切片 01 第 2 步（写闭包规格）

| 切片 | 交付的行为 | 对应判据 | 状态 |
| --- | --- | --- | --- |
| 01 | 合法 Skill 包被检查为 `SkillDefinition`，非法包按次序给出第一个拒绝原因 | SC1、SC2、SC3 | 待做 |
| 02 | 来源实现方能用唯一构造器交出一致的快照，用套件证明自己合规 | SC4、SC5 | 待做 |
| 03 | 资产治理从扩展后的 `skillBodyContract` 得到设置声明项，旧正文仍合法 | SC6 | 待做 |
| 04 | 后续写者从 SPEC 读到全部已封闭的未定项 | SC7、SC8 | 待做 |

| 闭包 | 写者模型@档位 | 清晰度 | 工作树 | 分支 | 状态 | 轮次 | 追加 | 验收报告 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| w1-skill-contract | claude-opus-5-5@high | 定 | `.worktrees/w1-skill-contract` | `PanQiWei/skill-mcp-w1-skill-contract` | 待派 | 1 | 0 | — |

四个切片写同一成员，合成一个闭包，一个写者按 01→04 顺序做（不能把同一成员拆给并行写者）。

## 判据

| ID | 判据 | 证据 |
| --- | --- | --- |
| SC1 | 公开根导出 spec 列出的值、失败、服务接口、纯函数；`./provider` 与 `./testing` 存在且不被公开根导入 | `tests/public-entry.spec.ts` 断言三个入口的导出键集合 |
| SC2 | 每个拒绝原因各有至少一个包样本，`parseSkillPackage` 给出预期原因；同时违反两条时给出次序靠前的那条 | `tests/parse-package.spec.ts` |
| SC3 | `toSkillName`、`toPackagePath`、`toSafeReason`、`computeDigest`、`projectAssetBody` 的边界穷举 | `tests/values.spec.ts` |
| SC4 | `sealSnapshot` 拒绝重复路径与前缀冲突（含 `a`、`a-b`、`a/b`）；摘要与条目次序、包根名无关 | `tests/snapshot.spec.ts` |
| SC5 | 三个端口的符合性套件对内存替身全绿；故意违反无披露的替身使套件变红 | `tests/conformance.spec.ts` |
| SC6 | 现有两个测试文件原样通过；扩展字段的接受与拒绝；`deriveDeclarations` 产出 `setting:<类别>:<名字>` | `tests/contract.spec.ts` 与新增用例 |
| SC7 | 成员迁到 `typescript-package@3.0.0` 完整骨架；结构扫描除草稿标记外无缺项 | `pnpm package:template scan --member packages/skills/skill-contract --json` |
| SC8 | SPEC 封闭组页列给本成员的全部未定项（见 spec「已定事项」1–15 与组页第 71、77、87、324、346、491、524、539 行）；`schema/skill-declaration.schema.json` 与已定事项 8 一致 | SPEC 正文；design-reviewer 表达评审报告 |

## 角色与模型分配

本会话宿主：Claude Code（云端）。

| 切片或环节 | 工作性质与复杂度 | 清晰度 | 角色 | 模型与 effort | 理由 |
| --- | --- | --- | --- | --- | --- |
| 调度 | 规格、简报、裁定、读 diff | — | 本会话 | 当前会话模型 | 需要全局上下文 |
| 01–04 | 能力契约，单成员，规格完整 | 定 | developer，product | Opus 5.5，high | 默认档；契约被后续波段依赖 |
| 评审 | 实现评审；SPEC 表达评审 | — | implementation-reviewer；design-reviewer（expression） | Opus 5.5，high；Opus 5.5，xhigh | 角色描述的推荐配置 |
| 修复轮 | 评审阻断 | — | developer（续用原写者） | 同上 | 同一闭包的追加可续用 |

## 切片

### 01：检查 Skill 包

- **交付：** 给定快照与控制文件字节，`parseSkillPackage` 返回 `SkillDefinition` 或第一个拒绝原因。
- **被谁阻塞：** 无。
- **对应判据：** SC1、SC2、SC3。
- **成员与文件：** `packages/skills/skill-contract/src/`、`tests/`、`tests/fixtures/packages/`。
- **七步待办：**
  - [ ] 1. 补上下文：已由 reduce 写进闭包规格，跳过子代理
  - [ ] 2. 写闭包规格，`brief-check` 退出 0（承担：调度）
  - [ ] 3. 写者实施（承担：developer）
  - [ ] 4. 复跑门禁，核对写范围（承担：调度）
  - [ ] 5. 跳过：常规评审集中到最后
  - [ ] 6. 阻断集中修复（承担：developer）
  - [ ] 7. PR 合入父分支，更新进度总览（承担：调度）

### 02：快照构造器与端口套件

- **交付：** `./provider` 的端口与 `sealSnapshot`；`./testing` 的三个套件与内存替身。
- **被谁阻塞：** 01（共用值类型）。
- **对应判据：** SC4、SC5。
- **七步待办：** 同 01，第 2、7 步与 01 合并（同一闭包）。

### 03：扩展类别端口

- **交付：** `skillBodyContract` 的可加扩展与设置声明项。
- **被谁阻塞：** 01。
- **对应判据：** SC6。
- **七步待办：** 同 02。

### 04：SPEC、Schema 与骨架迁移

- **交付：** 成员 SPEC、`schema/`、完整骨架。
- **被谁阻塞：** 01–03（SPEC 写实际形状）。
- **对应判据：** SC7、SC8。
- **七步待办：** 同 02。

## 集中检查

- 结构读数与差分变异：闭包交回后 reduce 在闭包 head 上跑一次。
- 常规评审：交回后一次实现评审（L2），一次 SPEC 表达评审。
- 波末：父分支头一次准入（质量读数）。

## 交回清单

- [ ] 进度总览改成最终状态
- [ ] 闭包 PR 合入父分支，读回父分支头
- [ ] 判据证据写进本文件「判据」表
- [ ] 波末交接报告 `w1/handoff.md` 的 Skill 一节

## 顺序与并行

- 01 → 02 → 03 → 04，同一写者顺序做。
- 与 MCP 线的 `w1-mcp-contract` 并行，写集不相交，只依赖 F。
