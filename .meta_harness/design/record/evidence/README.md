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

**2026-09-24 公开health客户端实现**：[`2026-09-24-tests-governance-health-client/`](2026-09-24-tests-governance-health-client/README.md) 保存47项实现测试、两真实中心只读联调及Linux打包冒烟；不是完整CLI交付。

**2026-09-24 客户端候选隔离取证**：[`2026-09-24-probe-governance-client/`](2026-09-24-probe-governance-client/README.md) 保存 macOS TLS/公开 health 的10场景，以及 macOS/Linux 容器的本地 SQLite 竞争与崩溃探针。不是已实现客户端或生产准入。

**2026-09-24 开发基线与局部修复**：[`2026-09-24-tests-production-cli-baseline/`](2026-09-24-tests-production-cli-baseline/README.md) 保存 macOS 的原始基线失败、第二来源地址配置修复、N-18 具名时钟错误修复及最终代码回归。最终 e2e 46/46、入口真实组合 15/15；生命周期与定向慢用例的通过/跳过分开记录。不是 Linux/多机或生产准入证据。



**本区的运行**：2026-09-22 两次形式工件执行；2026-09-23 一次形式工件执行、一次实现测试运行、一次 Alloy 重跑与两次端到端验收；2026-09-25 六次（见下表）。

| run                                                                                                 | 跑了什么                                                                                                                                                                                                           | 结果                                                         |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [`2026-09-22-formal-tenant-domain/`](2026-09-22-formal-tenant-domain/README.md)                     | 四个已登记 TLC 任务、一次有效性核对、一次未登记的 Alloy 执行                                                                                                                                                       | 任务全部无反例，有效性核对按预期给出反例                     |
| [`2026-09-22-formal-tenant-domain-2/`](2026-09-22-formal-tenant-domain-2/README.md)                 | 同一批，模型改过之后重跑                                                                                                                                                                                           | 同上                                                         |
| [`2026-09-23-formal-governance-center-entry/`](2026-09-23-formal-governance-center-entry/README.md) | formal task `governance-center-entry-v1-decision` ＋ 九个否定配置                                                                                                                                                  | 正配置无反例；九个否定配置全部按预期给出反例                 |
| [`2026-09-23-tests-tenancy-leg-2/`](2026-09-23-tests-tenancy-leg-2/README.md)                       | 全部 13 个 TS 成员的 build／typecheck／test、`lint:rules`、`format:check`（sqlite），三份 pg 测试文件（`postgres:16`）；两处逐字节独立核对；[各节点证据义务的回填清单](2026-09-23-tests-tenancy-leg-2/coverage.md) | sqlite 1218 条：1184 通过、**34 跳过**、0 失败；pg 33 条全过 |

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

**2026-09-23 另有一次 Alloy 重跑**：[`2026-09-23-alloy-affiliation/`](2026-09-23-alloy-affiliation/README.md)——`Affiliation.als` 自 run `-2` 之后改过一行注释（冻结的是改后的文件），对当前文件重跑四条命令，结论与 run `-2` 逐条相同；同样不是 formal task。

**2026-09-25 资产／工具运行时／模型请求运行时一程**（契约全部仍 `candidate`，接受归 [D-041](../decisions/assets-runtimes-contract-acceptance/README.md)，待签）：

| run | 跑了什么 | 结果 |
|---|---|---|
| [`2026-09-25-formal-assets-runtimes/`](2026-09-25-formal-assets-runtimes/README.md) | 本程 8 个已登记 formal task（asset-transfer ×3、stream-assembly、model-request-runtime ×2、tool-execution-runtime ×2），修复波 2 之后的模型 | 全部退出 0、无反例；快照与当前 `spec/` 逐文件相同 |
| [`2026-09-25-validity-stream-assembly/`](2026-09-25-validity-stream-assembly/README.md) | stream-assembly P-1、P-7 的三份有效性核对配置（预期出反例） | 三份全部按预期找到反例 |
| [`2026-09-25-alloy-asset-evaluation/`](2026-09-25-alloy-asset-evaluation/README.md) | `Evaluation.als` 十八条命令 ＋ 十三个变异文件（不是 formal task） | 六条 `run` 全 SAT、十二条 `check` 全 UNSAT；变异各按预期被推翻 |
| [`2026-09-25-node24-json-probe/`](2026-09-25-node24-json-probe/README.md) | `content-blocks` 节点「Node 24 无损 JSON 读写」的运行时前提探针 | 在 Node 24.18.0 上成立，手写解析器退路不需启用 |
| [`2026-09-25-formal-session-log/`](2026-09-25-formal-session-log/README.md) | 接口契约 `session-log` v1：formal task `session-log-v2-appends` ＋ 五份核对配置 | 正配置无反例；五份核对全部按预期出反例 |
| [`2026-09-25-formal-credential-custodian/`](2026-09-25-formal-credential-custodian/README.md) | 接口契约 `credential-custodian` v1：formal task `credential-custodian-v2-sweep`（单 worker 超时一次、4 worker 重跑一次）＋ 五份核对配置 | 重跑无反例（230 万 distinct、3 min 26 s）；五份核对全部按预期出反例；登记改为 `-workers 4`、900 s |

**2026-09-23 黑盒端到端验收**：[`2026-09-23-e2e-governance-center/`](2026-09-23-e2e-governance-center/README.md)——照部署方式起 `serve` 进程，零产品包引用的测试客户端走 PF-001 flows §一／§二 与 PF-017 acceptance §一／§二；46 条场景全过，产品正文与冻结契约说法不一致三处只记观察（`output/anomalies.txt`）。**独立复跑与四态判定**：[`2026-09-23-e2e-governance-center-2/`](2026-09-23-e2e-governance-center-2/README.md)——干净检出从零构建复跑 46/46 同样通过，手动演练走完；对上一次 run 的 109 行场景逐行判：Pass 54、Pass with issues 20（断言比正文弱或前提有界，逐条列出）、Fail 2（就是那两处产品正文与契约不一致）、Unable to verify 33；遮蔽用独立采集的秘密清单与结构扫描复核，0 命中。

返回[已发生的事](../README.md)。

[2026-09-24 登录候选有限模型](2026-09-24-formal-login-candidates/README.md)：三组正反例及历史失败；不等于 SQL 精化。

[2026-09-24 SQLite FULL 档位](2026-09-24-tests-sqlite-full/README.md)：实际连接、存储符合性、中心启动/升级及完整黑盒；物理断电未测。

[2026-09-24 邀约终结模型与Schema](2026-09-24-formal-offer-settlement/README.md)：单份邀约一正两负控、17项形状检查；原始失败保留。

[2026-09-24 显式存储单元](2026-09-24-tests-storage-unit/README.md)：P13符合性、通知与提交未知、中心回归和Linux冒烟；保留整数主键原型反例。

[2026-09-24 预期租户有限模型与entry候选Schema](2026-09-24-formal-expected-tenant/README.md)：14 distinct正例、两项反例、22项形状检查；无真实CLI/SQL声明。

[2026-09-25 有界账号局部实现](2026-09-25-tests-bounded-account/README.md)：AI80、host40、AR60、OG99、旧entry422通过（各跳过见run）；Linux5组局部smoke，不代表新版生产闭环。

[2026-09-25 entry候选有限模型](2026-09-25-formal-entry-candidates/README.md)：提交/通知与入口分类的正反例，保留镜像缺失失败；不代表组合证明或实现。

[2026-09-25 治理共同参与与注册整合](2026-09-25-tests-governance-participation/README.md)：OG107/4skip、OE36、AR60/1skip，局部实现，未完成entry2/CLI。

[2026-09-25 entry候选补充验证](2026-09-25-formal-entry-candidates-2/README.md)：完整九分支可达性、七份HT2字节和28项Schema；不是实现验证。

- [2026-09-25 本地状态提供者](2026-09-25-tests-client-local-state/README.md)：CLS1、真实多进程/双平台、初始化交错与容量故障。

- [2026-09-25 治理客户端组合候选](2026-09-25-formal-client-operations/README.md)：有限生命周期、四负控及Schema例。

2026-09-25新增：[CG1冻结Schema后续检查](2026-09-25-formal-client-operations-2/README.md)保存最终77例与模型输入对照；[共享治理用例实现](2026-09-25-tests-client-operations/README.md)保存106项测试与Mac/Linux各12组真实组合。均不等于CLI/TUI或生产就绪。

[CG2交互输入实现](2026-09-25-tests-prepared-input/README.md)：139项、两平台实际组合及两个取消反例修复。

[CQ1有限模型](2026-09-25-formal-cli-entry/README.md)：44状态、六负控；不证明TTY帧可信。

[CG2测试直接引用的规范输入补充](2026-09-25-tests-prepared-input/authority-inputs/README.md)：补齐源代码包外的冻结examples/Schema，不重写原运行包。

[D049文件CLI实际运行](2026-09-25-tests-cli-file-entry/README.md)：68项、两平台真实子进程/PTY/管道及原始失败记录，完整终端和生产部署未完成。

[D050可搬运CLI与独立中心进程](2026-09-25-tests-cli-portable-host/README.md)：89项、最终归档及三平台真实进程治理/重启，未含TUI或备份恢复。

[D051 TUI实现增量](2026-09-25-tests-tui-increment/README.md)：115项、真实PTY/中心旅程、XTerm退出和仓库外制品；独立QA与Mac模拟器/IME未完成。

[D051-r3独立验收与Mac/Linux互联](2026-09-25-tests-tui-cross-os/README.md)：126项、53个独立观察、双向网络治理与XTerm UTF8；旧失败保留，完整TUI未接受。


**2026-09-26 D055/D056治理维护**：[固定源码与制品、真实Linux服务、双OS与大库、独立QA](2026-09-26-tests-governance-maintenance/README.md)。包含全部失败尝试和限定结论；不提升安全重新开放或整机损毁灾备范围。

[2026-09-26 PR #9/#10 协调检查](2026-09-26-checks-pr9-pr10-reconciliation/README.md)：固定两线输入、冻结字节与迁移闭包核对、仓库及产品回归；既有跨 OS/部署/形式结果保留原范围。

**2026-09-26 core 首批实现验证**：[`2026-09-26-tests-core-foundation/`](2026-09-26-tests-core-foundation/README.md) 保存 kernel-basis、identity-values、offer-expiry、storage 与 content-blocks 的实际运行、输入快照和失败原文。30／259／31／306 项包内测试及 storage 两项有效性自测分别沿该 run 的范围读取；规则自测最终 101 项与真实 24 规则扫描另列。storage 原 spoke 日志丢失只采用保存的 HUB 复验；content 首次扫描失败与修正后结果分别保留。消费者组合、实际准入与各 JSON 传递边界不因本轮包内通过而闭合，用户总体验收尚未发生。


[2026-09-26 当前core v3实际模型执行](2026-09-26-formal-core-v3/README.md)：SA正配置826411 distinct及三有效变异，AE／Messages263主Alloy读数与28 XML补取；完整输入/raw/封存、有限范围与不覆盖实现分别登记。
