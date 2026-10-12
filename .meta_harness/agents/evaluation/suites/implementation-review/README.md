# implementation-reviewer 评审一份实现类交付

量的是：给 [implementation-reviewer](../../../roles/implementation-reviewer/role.md) 一份叠了交付提交的检出和实施者的交付说明，
它能不能把种入的问题报出来——写入范围外的改动、被改弱的测试、违背契约的行为、依赖方向、超线又没测试的新函数、与事实不符的交付说明——
同时不动受版本管理的文件。判官逐条判「报出了没有」，与设计评审的三个流是同一个判官、同一套规则，只多一条「越出本次判断」。

状态：版本2仅迁移派发输入和局部规则；尚未重新签字或运行模型基线，不沿用版本1的签字或声称性能等价。当前配置和采用范围见 `flow.json`。基线何时跑由 [遗留汇总L07](https://github.com/nemori-ai/omne-harness-lite/issues/193#legacy-agent-evaluations) 跟踪。

## 材料

一份固定实现评审任务，基底由 `flow.json` 定义。成员为 `packages/session/session-tenancy-table`，
案例契约为 `capability.session-tenancy/v2`，接受级别为 L3。该标签只指本案例局部规则。

| 种入 | 位置 | 应当被报出的问题 |
|---|---|---|
| I1 | 别的包的说明（末尾追加一段） | 写入范围之外的改动 |
| I2 | `tests/reader.spec.ts` 两处 | 一条既有断言被改弱、一条既有测试被跳过 |
| I3 | `src/reader.ts` 读不到存储时的收场 | 违背契约 S-7：读不到答成「没有这个会话」 |
| I4 | `src/reader.ts` 的导入与新函数 | 领域包直接导入 infra 提供者，`lint:rules` 报 `group-direction` |
| I5 | `src/reader.ts` 新函数 `describeHoldingTenant` | 复杂度超线、没有测试、交付说明没提 |
| I6 | 交付说明 | 声称既有测试没动、只改了本成员，都与事实不符 |

种入之后成员自己的测试仍须通过；评审者不能依赖测试失败作线索。`verify` 每次核对这个前提。

## 一个用例集里多出来的文件

```text
briefs/implementation-delivery-note.md   实施者的交付说明；运行时整段填进简报的 {DELIVERY_NOTE}
```

## 副本与判定

副本是钉住提交的整仓检出（见[运行器](../../harness/README.md#整仓检出一类)），排除中央设计、旧宿主指导及子模块登记。先提交基线，
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

[calibration/cases.json](calibration/cases.json) 与 `calibration/reports/` 是判官的已知好/坏输入，
保留人工期望值、逐字引用和运行级判定规则。判官由主会话派 subagent；
每次校准的输入、输出与比对结果放本工作树 tmp，不持久保存运行流水。
已知问题与表外发现分别计数，判据改变后须复核适用范围；未校准材料不能冒充已验证。

## 量不出什么

- 只有一份材料、六处种入，都比较显眼；材料是一个百来行的小成员。说明不了真实 L3 交付上隐蔽的不变量破口抓不抓得到，也量不出误报率
  （`novel_blocking` 只是计数，表外阻断成立与否要人看）。
- 发现「带没带本次的工具输出或反例」是这个角色的核心纪律，判官只判有没有报出、是否越出，不核对引的输出是不是真跑出来的。
- 副本的代码与检查工具使用固定提交；旧设计树和旧AGENTS不进入副本，任务规则由本套件局部简报提供。角色定义取自当前源。
- 判官校准使用一份明确标注的静态模拟报告及其六份派生输入。它们不表示一次真实执行或模型效果。
