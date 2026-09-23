# 2026-09-23 · 组织治理 Alloy 结构模型对当前冻结文件的重跑

只跑一件事：`spec/capabilities/organization-governance/v1/formal/Affiliation.als` 的四条命令（一条 `run`、三条 `check`）。
**它不是 registry 登记的 formal task**（与 [`2026-09-22-formal-tenant-domain-2`](../2026-09-22-formal-tenant-domain-2/README.md) 的 `unregistered-alloy-affiliation` 同一性质），通过不提升任何状态。

## 为什么重跑

W4-A 的证据 run 核出：run `-2` 的 Alloy 输入快照（`7e25524f…`）与当前冻结文件（`1a72efa2…`，`registry/frozen.json` 登记的就是它）不同，差在第 73 行一处注释（「rev 12」改成「rev 14」，是词条依据的 rev 升级带出的），断言式未变。
差异只在注释，但「run `-2` 的 Alloy 结论绑定的不是当前文件」这一点要有一次运行来闭合，而不是靠人读 diff 断言等价。

## 跑了什么，结果是什么

| 输入                                                                                                                              | 命令                                                                              | 结果                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input/Affiliation.als`（SHA-256 `1a72efa2f9b7c8199ae3aac797154120cf714a9b6dc674961621c8187cd1526f`，与当前 spec 文件逐字节相同） | `alloy exec Affiliation.als`（Alloy 6.2.0，`/opt/alloy/alloy-6.2.0.jar`，JRE 21） | `run aNonTrivialTree` SAT（1/1）；`check AcceptPreservesAcyclic`、`check PersonalOrganizationSharesNoAncestor`、`check ShareAncestorIsSameAffiliationTree` 均 UNSAT（无反例）；退出 0。原文 `output/alloy-exec.log`，求解器回执与实例 `output/Affiliation/` |

与 run `-2` 的结论逐条相同。

## 边界

Alloy 的 `check` 在默认作用域内无反例，不是无界证明；作用域由文件里各命令自带的 `for` 子句给出（未改）。
`run` 找到实例只说明谓词可满足。

返回[运行证据](../README.md)。
