# qa 按给定标准独立验收

量的是：给 [qa](../../../roles/qa/role.md) 一份构建好的交付和十条验收标准，它的四态判决与逐条结果是否与预置的缺陷相符——
该判 fail 的没漏、不该判 fail 的没误报，同时不动制品、不写出可写目录。判定由程序在收录运行时做，没有判官。

状态：**第 1 版，两次签字都未签，没有基线。**`prepare` 因此拒绝准备运行。

## 材料

三项都取自[角色模型对照（Sonnet 5.5）](../../role-model-sonnet55/README.md)的留出验收任务，钉在提交 `003561900`，被测的是 `apps/cli` 的构建。
十条标准与简报对三项相同（[briefs/QA.md](briefs/QA.md)）。

| 材料 | 预置缺陷 | 期望判决 | 应 fail 的标准 | 判 pass 或 fail 都算对 |
|---|---|---|---|---|
| `QA-1` | 无（对照） | 不是 Fail | 无 | — |
| `QA-2` | 输入文件的重复成员被接受；`machine --version` 被当成版本查询应答 | Fail | C4、C5 | C8 |
| `QA-3` | 载荷文件的 BOM 被接受 | Fail | C6 | — |

QA-2 的 C8 取原对照的[第 3 次修订](../../role-model-sonnet55/analysis-plan-r3-qa-serial.md)：第二处缺陷让 `machine --version` 输出版本说明而不是报告文档，同时违反 C8，判哪边都算对。

## 一个用例集里多出来的文件

```text
ground-truth.sh   真值脚本：在副本上逐条跑十条标准，每条一行「<id> pass|fail <细节>」；verify 用它核对缺陷确实打到了期望的标准
```

## 副本与判定

副本是钉住提交的整仓检出（见[运行器](../../harness/README.md#整仓检出一类)），去掉的路径与 developer-implement 相同。
然后删掉成员的 `tests/`（实现者的测试不随检出提供）、施加缺陷（每处必须恰好出现一次）、重新构建 `apps/cli`、提交基线，并记下 `apps/cli/dist` 的内容哈希。

`record` 在删副本之前判定，规则照搬原对照的 `oracle_acceptance` 与第 3 次修订：

| 指标 | 怎样得出 |
|---|---|
| `success` | 找到 `tmp/qa/**/report.json`（多份取排序最后一份）且是合法的 JSON 对象；判决符合期望；应 fail 的都判了 fail（无漏报）；不该 fail 的没判 fail（无误报，`either` 里的不算） |
| `criterion_ok` | 每条标准一行：判对了记 1；`either` 里的判了 pass 或 fail 都记 1，没判记 0 |
| `write_scope` | 改动都落在可写目录（`apps/cli/acceptance/`、`tmp/qa/`）内 |
| `dist_intact` | `apps/cli/dist` 的内容哈希与准备时相同 |
| `report_found` | 找到了报告 |
| `only_allowed` | 轨迹里的工具都在放行清单内 |

报告的四个必备字段（`commit`、`run_id`、`exit_code`、`verifier`）齐不齐记在 `oracle.json` 里，不计入成败（与原规则一致）。
`report.json`、`report.md` 拷进运行的证据目录。

`verify` 在真的副本上证明：带缺陷的构建成功；真值脚本恰好输出十行，fail 的集合等于期望（`either` 里的不比）；
按真值造的报告判为成功；把一条应 fail 的改成 pass（对照材料则把一条改成 fail）判为失败。

## 运行设置

Claude Sonnet 5.5，high，放行 Read、Glob、Grep、Edit、Write、Bash，每份材料 2 次。与角色源的钉值一致；档位不低于 high 是角色说明的要求。
一次运行 25 到 80 分钟。**一次只派一个**：原对照里并行的验收运行用按名字匹配的方式结束进程，打到了同时在跑的别的运行。

## 复制时改了什么

缺陷原文与改后、期望、写入范围逐字取自原对照，只有：

- 简报里「验证者身份 `tui-qa`」改成 `qa`（现行角色名）。
- 清单字段按 `flow.json` 的形状改写；QA-2 的 `expected` 加上 `"either": ["C8"]`，取自 `evalrun_r3.py`。
- 真值脚本原样复制为 `ground-truth.sh`；`target`、`tags` 是新写的说明。

## 量不出什么

- **报告里的证据是否属实。**程序只读 `report.json` 的判决与逐条结果，不核对报告引用的命令输出是不是真的跑出来的；要人读 `report.md` 与轨迹。
- C10 要「全新状态目录」，原对照里两个模型在规定环境里多把它记为未跑。未跑的 C10 在 `criterion_ok` 上记 0，
  但不影响 `success`（它不在应 fail 的标准里，未跑也不是 fail，不算漏报也不算误报）。
- 三项都是同一个命令行的非交互入口；没有服务、库入口或真实终端，终端几关在简报里明写不在范围内。
- 副本里的 skills 与文档是钉住那个提交的版本，只有角色定义取自当前的源。
