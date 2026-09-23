# 运行证据

这里保存实际执行留下的配置、输入快照和原始结果：形式任务的 TLC 输出、
符合性测试的运行记录、真实集成的观察。

失效事件：没有。一次运行的结果不改写——重跑是**新的一次运行**，
旧结果连同它当时的输入一起保留。改写旧结果会让「当时在什么条件下得到什么」不可恢复，
而那恰恰是证据的全部价值。

## 为什么不在规格的版本目录里

规范资源一经接受即冻结，逐文件登记 SHA-256；而运行结果会随每次执行增加。
把可变的运行产物放进不可原地改写的版本目录，两类失效事件互相打架：
要么冻结形同虚设，要么每跑一次就要发新版本。

所以规范归 [spec/](../../spec/README.md)，运行产物归这里，
两者通过 [registry/formal-tasks.json](../../registry/README.md) 的任务 id
与 [realization](../../realization/README.md) 绑定表的 `evidence` 字段关联。

## 组织

```text
evidence/
└── <run-id>/              可恢复的运行标识
    ├── README.md          本次跑了什么、覆盖范围、结论与边界
    ├── <task-id>/         按 registry/formal-tasks.json 的任务 id 分目录
    │   ├── config…        实际使用的配置，不是模板
    │   ├── input…         输入快照（模型、规格文件）及其哈希
    │   └── output…        原始结果，不做摘要式改写
    └── …
```

`<run-id>` 的形状是 **`<YYYY-MM-DD>-<kind>-<scope>[-<n>]`**，例如 `2026-09-22-formal-tenant-domain`；
同日同范围再跑一次是 `…-2`。日期在前只为让目录按时间排；`kind` 与 `scope` 给人扫读用。
**目录名不是查找键**——「契约 X 的性质 P 靠哪次运行撑着」从 registry 的任务 id
与 realization 绑定表的 `evidence` 字段 join 过来，所以任务子目录必须用任务 id 命名。
不按种类预建上层目录；只有一种证据时分层是空框架。
同一批任务的重跑建新的 run，不覆盖旧目录。

## 准入

进入前必须能回答：这次运行**实际发生**了吗，用的什么输入与配置，结果原文在哪。

- 预期结果、样例输出、计划中的验证不进这里。
- 摘要可以有，但不能替代原始结果；原始结果被删掉后，摘要不再是证据。
- 运行环境缺工具、超时或非零退出都是结果，照实保存；失败的运行同样是证据。

## 读取与引用纪律

**有限检查不表述为无条件形式化证明。** 每份运行 README 必须写明本次的边界：
状态空间规模、关闭了哪些故障路径、跳过了哪类输入、公平性假设是什么。
引用这份证据的地方沿用同一边界，不在传递中把「在 `Failures = FALSE` 下成立」
读成「成立」。

通过不自动提升候选规格状态。证据说明实现或模型在给定条件下的行为，
接受由 [decisions/](../decisions/README.md) 完成，采用登记由
[registry/](../../registry/README.md) 完成。

## 当前状态

**本区有四次运行**：2026-09-22 两次形式工件执行，2026-09-23 一次形式工件执行与一次实现测试运行。

| run | 跑了什么 | 结果 |
|---|---|---|
| [`2026-09-22-formal-tenant-domain/`](2026-09-22-formal-tenant-domain/README.md) | 四个已登记 TLC 任务、一次有效性核对、一次未登记的 Alloy 执行 | 任务全部无反例，有效性核对按预期给出反例 |
| [`2026-09-22-formal-tenant-domain-2/`](2026-09-22-formal-tenant-domain-2/README.md) | 同一批，模型改过之后重跑 | 同上 |
| [`2026-09-23-formal-governance-center-entry/`](2026-09-23-formal-governance-center-entry/README.md) | formal task `governance-center-entry-v1-decision` ＋ 九个否定配置 | 正配置无反例；九个否定配置全部按预期给出反例 |
| [`2026-09-23-tests-tenancy-leg-2/`](2026-09-23-tests-tenancy-leg-2/README.md) | 全部 13 个 TS 成员的 build／typecheck／test、`lint:rules`、`format:check`（sqlite），三份 pg 测试文件（`postgres:16`）；两处逐字节独立核对；[各节点证据义务的回填清单](2026-09-23-tests-tenancy-leg-2/coverage.md) | sqlite 1218 条：1184 通过、**34 跳过**、0 失败；pg 33 条全过 |

**2026-09-22 的第二次是因为模型改了**：五份契约经评审轮一修订，`Registration.tla`、`progress.cfg` 与
`Affiliation.als` 三份工件跟着改了，**`Membership.tla` 与它的两个 cfg 没改**。
因此**第一次 run 不是整批作废**——它的 membership 两行输入逐字节未变、仍然适用，
其余几行对应旧模型。[逐文件的哈希对照在 run `-2` 的 README](2026-09-22-formal-tenant-domain-2/README.md#为什么重跑)。

**2026-09-23 没有重跑那四个任务**：它们的模型与配置同 run `-2` 的输入快照逐字节相同，run `-2` 的结论照旧适用；
**例外是未登记的 Alloy 模型**，`Affiliation.als` 与 run `-2` 的快照差一行注释，那一行结论已不绑定当前文件
（[对照在 2026-09-23 形式 run 的 README](2026-09-23-formal-governance-center-entry/README.md#其余四个任务为什么不重跑)）。

**通过不提升任何契约的状态**，它们仍是 `candidate`；引用结论时沿用对应 run README 写明的边界。
**模型检查与实现测试分开陈述**：形式 run 的无反例不说明实现，测试 run 的通过不说明模型性质；测试 run 里的跳过不是通过。

存量证据尚未从 `design_legacy/evidence/` 迁入（约 292 个文件，
含 `formal-2026-09-16` 的 TLC 执行记录、`joint-protocol-2026-09-16` 与 `legacy-consumers`）。
迁入是整目录搬运。

返回[已发生的事](../README.md)。
