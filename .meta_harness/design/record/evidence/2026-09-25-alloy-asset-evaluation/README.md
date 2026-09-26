# 2026-09-25 · 资产求值 Alloy 结构模型对当前候选文件的重跑（含十三个变异）

只跑一件事：`spec/capabilities/asset-evaluation/v1/formal/Evaluation.als` 的十八条命令（六条 `run`、十二条 `check`），
外加十三个变异文件各跑同一批 `check`。**它不是 registry 登记的 formal task**（与 [`2026-09-23-alloy-affiliation`](../2026-09-23-alloy-affiliation/README.md) 同一性质：Alloy 的 `exec` 退出码无意义，结论要读输出），
通过不提升契约状态；契约仍是 `candidate`，接受归 [D-041](../../decisions/assets-runtimes-contract-acceptance/README.md)（待签）。

## 为什么入库

起草 asset-evaluation 时在主检出 `tmp/formal-runs/asset-evaluation-v1-2026-09-25/`（Git 忽略）跑过这一次，只把结论写在契约验证入口；
PF-002 投影 v1 起草时核出「原始输出没进 `record/evidence`」——这里把那次运行的输入快照、原始输出与变异结果原样搬入，不重跑、不改写。

## 跑了什么，结果是什么

| 输入 | 命令 | 结果 |
|---|---|---|
| `unregistered-alloy-asset-evaluation/input/Evaluation.als`（SHA-256 `6935da22…505f`，与当前 `spec/` 文件逐字节相同） | `alloy exec Evaluation.als`（Alloy 6.2.0，`/opt/alloy`；[`output/run.log`](unregistered-alloy-asset-evaluation/output/run.log)，[`output/receipt.json`](unregistered-alloy-asset-evaluation/output/receipt.json)） | 六条 `run` 全部 **SAT**（各有实例，`output/*-solution-0.md`）；十二条 `check`（`TeamAssetsStayInTree`、`LockTruncates`、`DisableIsDisjunction`、`WorkspaceNeverSources{Permission,Placement,Governance}`、`OfficialLowerBound`、`ReplacementCannotEscapePermission`、`NonFittingPickNeverSources`、`UnusableNeverEffective`、`UnusableKeepsBounds`、`ForbidIsBound`）全部 **UNSAT**（作用域内无反例）；12.5 s |

**有效性核对（变异）**：`mutants/M1～M13.patch` 各改模型一处（如去掉 `OfficialNeverDisabled`、把工作区放进权限来源、放宽锁的截断），`mutants/M*.out` 是各自的输出，[`mutants-summary.txt`](unregistered-alloy-asset-evaluation/mutants/mutants-summary.txt) 汇总。**十三个变异每个都至少推翻一条断言**：

| 变异 | 被推翻的断言 |
|---|---|
| M1 | `LockTruncates`、`ReplacementCannotEscapePermission` |
| M2 | `DisableIsDisjunction` |
| M3 | `WorkspaceNeverSourcesPermission` |
| M4、M10 | `OfficialLowerBound` |
| M5 | `TeamAssetsStayInTree` |
| M6 | `WorkspaceNeverSourcesPlacement` |
| M7 | `ReplacementCannotEscapePermission`、`UnusableKeepsBounds` |
| M8 | `NonFittingPickNeverSources` |
| M9 | `UnusableNeverEffective` |
| M11 | `UnusableKeepsBounds` |
| M12 | `ForbidIsBound` |
| M13 | `WorkspaceNeverSourcesGovernance` |

十二条断言里每一条都至少被一个变异推翻——正配置下的 UNSAT 不是因为断言空真。

## 边界

Alloy 的 `check` 在各命令自带的作用域内无反例，不是无界证明（作用域见 `receipt.json` 的 `scopes`）；`run` 找到实例只说明谓词可满足。
「同输入同输出」（S-11）不在模型里（函数按定义确定），证据形式是规范场景（契约验证入口）。
run id 用本程工作日 `2026-09-25`；原始运行时刻是 UTC 2026-09-24 15:09。

返回[运行证据](../README.md)。
