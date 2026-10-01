# implementation-reviewer 评审一份实现类交付

量的是：给 [implementation-reviewer](../../../roles/implementation-reviewer/role.md) 一份叠了交付提交的检出和实施者的交付说明，
它能不能把种入的问题报出来——写入范围外的改动、被改弱的测试、违背契约的行为、依赖方向、超线又没测试的新函数、与事实不符的交付说明——
同时不动受版本管理的文件。判官逐条判「报出了没有」，与设计评审的三个流是同一个判官、同一套规则，只多一条「越出本次判断」。

状态：**第 1 版，两次签字都未签，没有基线；判官已在这个流上校准过（见下）。**`prepare` 因此拒绝准备运行。

## 材料

一份，取自[实现评审与独立验收](../../implementation-review-and-qa-2026-10-01/README.md)那次试派，钉在提交 `f1db2fa25`，
成员 `packages/session/session-tenancy-table`，契约 `capability.session-tenancy/v2`，接受级别写 L3。

| 种入 | 位置 | 应当被报出的问题 |
|---|---|---|
| I1 | 别的包的说明（末尾追加一段） | 写入范围之外的改动 |
| I2 | `tests/reader.spec.ts` 两处 | 一条既有断言被改弱、一条既有测试被跳过 |
| I3 | `src/reader.ts` 读不到存储时的收场 | 违背契约 S-7：读不到答成「没有这个会话」 |
| I4 | `src/reader.ts` 的导入与新函数 | 领域包直接导入 infra 提供者，`lint:rules` 报 `group-direction` |
| I5 | `src/reader.ts` 新函数 `describeHoldingTenant` | 复杂度超线、没有测试、交付说明没提 |
| I6 | 交付说明 | 声称既有测试没动、只改了本成员，都与事实不符 |

种入之后成员自己的测试照样是绿的，评审者拿不到一个红灯当线索；这是原记录写明的性质，`verify` 每次核对。

## 一个用例集里多出来的文件

```text
briefs/implementation-delivery-note.md   实施者的交付说明；运行时整段填进简报的 {DELIVERY_NOTE}
```

## 副本与判定

副本是钉住提交的整仓检出（见[运行器](../../harness/README.md#整仓检出一类)），只去掉评估目录（与原试派一致）。先提交基线，
再把六处种入里的五处改动施加上去，以 `implementer <implementer@invalid>` 的名义提交成交付提交
（标题 `session-tenancy-table: operator description and file-based reader`，带 `Harness: claude-code`、`Agent-Role: developer`），
然后在成员里重新构建。简报里的 `{BASE}`、`{HEAD}` 是副本里这两个提交的哈希。

| 指标 | 怎样得出 |
|---|---|
| `caught` | 判官：每处种入一行 |
| `tracked_intact` | 收录时 `git status --porcelain` 没有非 `??` 的行，且 HEAD 仍是交付提交。这个角色有 Bash、会跑检查，副本里会多出未跟踪的产物，所以不用内容哈希判只读 |
| `blocking`、`novel_blocking`、`out_of_kind` | 判官：阻断条数、表外阻断条数、越出本次判断的条数 |

判官的「越出本次判断」对这个流是：不指到工具输出、差异或具体反例的品味意见算越出；指出写入范围外的改动、被改弱的测试、与交付说明不符之处不算。
这条规则让判官的名字与设计评审的三个流不同（`…rules e65bb670c43e`，以 Sonnet 5.5 为例），签判定方法时要签这一个。
这个流没有判据页，不出 `names_page`。

### 判官校准

[calibration/cases.json](calibration/cases.json) 是 7 份报告的人工判定：当时试派的那份真实报告，加 6 份反例
（删掉两条阻断、把一条发现挪进「未覆盖」、只删掉对交付说明的指认、加一条品味意见、结论是没有问题的报告、另一份材料的报告）。

判官是派成 subagent 的 Claude Sonnet 5.5（宿主记录的档位是 medium）。2026-10-01 校准：42 处判定与人工全部一致
（26 处报出、16 处没报出），运行级的 13 项计数也都一致；7 次派发，没有答复被驳回。
[比对记录](calibration/results/judge-subagent-claude-sonnet-5-5-rules-e65bb670c43e.md)。

真实报告只有一份，反例都由它删改而来；别的评审者写法不同的报告上判得怎样，没有校准过。

`verify` 在真的副本上核对：每处改动恰好施加一次；副本里恰好两个提交；成员在种入后构建成功、成员自己的测试退出 0；
`pnpm run lint:rules` 非零退出并报 `group-direction`（I4 的已知坏）；简报的占位符都填得上；跑完这些检查受版本管理的文件仍没变。

## 运行设置

Claude Fable 5.1，high，放行 Read、Glob、Grep、Bash，每份材料 2 次；与角色源的钉值和工具清单一致。

## 复制时改了什么

种入的原文、改后、追加的文字、真值，简报与交付说明逐字取自原试派，只有：

- 清单字段按 `flow.json` 的形状改写：一条种入的 `edits` 与 `append` 改成有序的 `ops`（`replace`、`append`），I6 的 `in` 保留。
- 每条种入新写了 `kind`（`seeded`）与 `where`（位置说明，判官看得到）；`target`、`tags` 是新写的说明。
- 原试派从 `HEAD` 导出（当时就是 `f1db2fa25`）；这里钉成那个提交，并删掉检出里指向宿主生成物的 `.claude`、`.agents`、`.codex` 链接。

## 量不出什么

- 只有一份材料、六处种入，都比较显眼；材料是一个百来行的小成员。说明不了真实 L3 交付上隐蔽的不变量破口抓不抓得到，也量不出误报率
  （`novel_blocking` 只是计数，表外阻断成立与否要人看）。
- 发现「带没带本次的工具输出或反例」是这个角色的核心纪律，判官只判有没有报出、是否越出，不核对引的输出是不是真跑出来的。
- 副本里的 skills、检查工具与文档是钉住那个提交的版本，只有角色定义取自当前的源。
- 判官的校准只对着一份真实报告与它的六份删改；这个流有了基线之后，拿新报告补校准用例。
