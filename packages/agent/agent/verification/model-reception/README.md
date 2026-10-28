# Model 结果接收协议的有限模型

本目录检查 Agent 宿主接收 Model 交付时的安全性质：材料与 `received` 条目共同可见、原操作认回、排除后不复活、提交后才发送账目，以及实例分离和接收组件重建后保留责任。

[Reception.tla](Reception.tla) 定义有限状态模型，[配置文件](valid.cfg)选择实例规模与故障开关，[run.py](run.py) 调用 TLC 并保存执行证据。有限模型的结论只适用于所列状态、动作和配置。它不证明产品实现符合模型，也不替代实际提供者及宿主的验证。证据的声明边界见[验证说明](../../../../../docs/verification.md#证据能支持什么)。

## 契约依据

| 拥有者条款 | 模型检查的责任 |
| --- | --- |
| Agent [结果接收](../../../agent-contract/SPEC.md#结果接收)，J02 | 宿主持有接收责任；每次 push 先检查当前资格和 Model 原交付，再认回 saved |
| Agent [接收共同提交](../../../agent-contract/SPEC.md#接收共同提交) | 材料、received 条目与原回执共同发布；unknown 沿原 operation 查询；权威排除阻止迟到发布 |
| Agent [账目出站](../../../agent-contract/SPEC.md#账目出站)，J28 | committed 后才交出账目；重试使用同一 handoff；硬失败保留 blocked；收到确认不删除 Journal |
| Model [结果推送与保存](../../../../model/model-contract/SPEC.md#结果推送与保存)及 [push 的失败形状与决定顺序](../../../../model/model-contract/SPEC.md#push-的失败形状与决定顺序) | 每次 push 的核验顺序、原 key 认回和未知保存责任 |

这些条款拥有产品行为。模型中的简化和有限参数不改变条款，也不增加产品保证。

## 状态与有限范围

两个租户各有一个同名 execution。每个 execution 有两个 delivery。身份包含租户、execution 和本地 delivery 编号，因而相同文本可以在两个租户内并存。

`records` 按租户与 delivery 索引，保存以下状态：

- 权威提交状态：absent、pending、committed 或 excluded。
- 材料与条目的可见性、原 operation、receipt、saved 和发布次数。
- 宿主已知的提交结果，以及待发账目的 handoff 和 outlet 状态。
- 是否曾被排除、是否曾进入 blocked 的历史位。

`attached` 表示每个租户的 Agent 实例是否挂接。`receiverGeneration` 在两个值之间切换，用于表示接收组件重建。重建次数和重试次数没有步数上限；状态图中的环表示重复动作。

两个正控分别将每租户逻辑容量设为 2 和 1。模型枚举这些有限身份内允许的动作交错，单个 `Publish` 是一个原子动作。配置没有另加 TLC 状态约束或公平性条件。

## 动作

| 动作 | 状态变化与限制 |
| --- | --- |
| `Push` | 按 actor 租户、当前 access、Model authority、同 key 内容、原记录、容量的顺序处理。新交付开始原 operation；重复交付认回原结果。每次调用均重新检查，包括 cached saved |
| `Publish` | 从 pending 一次建立材料、条目和 receipt，并记录一次发布。响应可以使宿主知道 committed，也可以保持 unknown |
| `Query` | 核验当前访问后读取原操作。可返回已知 committed/excluded，也可持续不可读或 unknown；查询不创建排除依据 |
| `Exclude` | 在 pending 时建立权威排除。后续 Publish 不再允许执行 |
| `Enqueue` | 仅在权威已 committed、宿主也已知 committed 时建立待发 handoff |
| `Send` | 发送原 pending handoff，不更换身份 |
| `OutletReply` | unknown/unavailable 回到 pending；denied/conflict/invalid 进入 blocked；received 保留 Journal |
| `Detach`、`Attach` | 只改变实例挂接状态。迟到的提交、接收和账目交付不依赖 attached |
| `Rebuild` | 改变接收组件代次，保留宿主记录，包括 unknown、原身份和 blocked |

`access` 的 allowed/denied/unavailable 与 `authority` 的 valid/invalid/unavailable 是每次调用的环境输入。Model 的原受理、admission、consumer 和完整 dispatch 集合检查合并为 authority 输入。它不表示模型验证了 Model 的内部算法。

`Next` 对会产生相同状态和返回类别的输入组合取代表值。例如，跨租户已经在第一步拒绝时，不再枚举后续 authority 的所有值。资格和权威核验属于单个 Push 动作；模型不展开核验内部的并发时序。

## 被检查的性质

| 名称 | 表达方式与判据 |
| --- | --- |
| `AtomicVisibility` | 状态不变量。材料可见当且仅当条目可见；条目要求 committed、原 receipt 和一次发布；committed 必须有条目 |
| `NoPrecommitOutlet` | 状态不变量。任何出站状态都要求 committed 且条目可见 |
| `ExcludedNeverRevives` | 历史位 `wasExcluded`。排除后始终为 excluded，材料与条目均不可见 |
| `IdentityStable` | 状态与动作监视位。后续 operation 和 handoff 保持原身份，返回的 saved 引用原 receipt |
| `TenantIsolation` | 状态与动作监视位。局部动作不改变其他键；无权动作不改变记录；operation 和 receipt 的租户与记录一致 |
| `BlockedSurvivesRebuild` | 历史位 `wasBlocked`。进入 blocked 后，任何后续动作均不能把它改回可发送状态 |
| `DetachPreservesSaved` | 动作监视位。Detach 前后的完整宿主记录相同，包含 unknown、材料、回执和待办 |
| `FreshValidationBeforeSaved` | 动作监视位。每次返回 saved 都要求本次 access=allowed 且 authority=valid |
| `CapacityBound` | 状态不变量。每租户 pending/committed 的逻辑记录数不超过配置容量 |
| `TypeOK` | 检查提交、宿主知情、出站、挂接、代次和发布次数的取值范围 |

动作监视位比较实际前后状态或本次返回分支。它们初始为 TRUE，首次违反后保持 FALSE。历史位在对应事件发生时设置，后续不清除。这些辅助变量将跨步骤的约束转换成 TLC 可直接检查的不变量。

## 配置与负控

| 配置名 | 规模或故障 | 预期判读 |
| --- | --- | --- |
| `valid` | 2 租户 × 2 delivery，每租户容量 2 | 全部性质成立，完整搜索结束 |
| `capacity-one` | 相同身份空间，每租户容量 1 | 全部性质成立，完整搜索结束；容量不足时拒绝新接管 |
| `bad-split` | `SplitPublish` 使发布先公开材料，再公开条目 | 命中 `AtomicVisibility` |
| `bad-precommit` | `PrecommitSend` 允许 pending 提交提前发送 | 命中 `NoPrecommitOutlet` |
| `bad-rebuild` | `ClearBlockedOnRebuild` 将 blocked 改回 pending | 命中 `BlockedSurvivesRebuild` |

`FinishSplit` 只用于拆分发布负控。三个故障开关在两个正控中均关闭。负控证明判据能检出指定错误，不证明判据覆盖所有错误。

## 执行与证据

环境需要 Node.js、Python 3、Java 和 TLA2Tools JAR。设置 `TLA2TOOLS_JAR` 指向所用 JAR。未设置时，脚本尝试 `~/.local/share/omne-tools/tlaplus/tla2tools-1.7.4.jar`。设置 `JAVA_BIN` 可指定 Java；未设置时使用 PATH 中的 `java`。

从仓库根运行全部配置：

```sh
node scripts/with-test-slot.mjs python3 packages/agent/agent/verification/model-reception/run.py
```

在同一命令后追加配置名可以选择一项或多项：

```sh
node scripts/with-test-slot.mjs python3 packages/agent/agent/verification/model-reception/run.py valid capacity-one
```

脚本必须通过仓库运行名额入口执行。不要手工设置 `OMNE_TEST_SLOT_HELD` 绕过排队。默认每案预算 180 秒，使用 2 个 workers、`-Xmx1024m`、ParallelGC、seed 787 和 fingerprint polynomial 0。`FORMAL_BUDGET_SECONDS` 可调整单案时限。

原始证据默认写入仓库 `tmp/formal/model-reception/runs/<UTC 时间>/`。每次运行创建新目录，不覆盖旧结果。`FORMAL_OUTPUT_DIR` 可指定其他证据目录，应保持在仓库 tmp 内，不把执行产物写入本目录。

每份证据保存模型、配置和脚本快照，以及各案 `tlc.log` 和汇总 `results.json`。汇总记录 Java 与 TLC 版本、JAR 和输入 SHA-256、检出 HEAD、命令、预算、起止、退出码和状态数。检出 HEAD 只定位运行环境，不代表工作树无改动。

正控必须退出 0，并包含 TLC 的 `Model checking completed. No error has been found.`。负控必须退出非零、命中配置指定的不变量，并给出反例轨迹。缺工具、求值错误、解析失败和超时均不能算通过；因错误停止后的其余配置属于未执行。判读时保留 TLC 给出的 fingerprint 碰撞估计，不把有限搜索表述为无条件证明。

## 假设、遗漏与实现对照

- 模型只检查安全性。没有公平性假设或进展定理；永久 unknown、永久拒绝或永不调度时，不保证完成。
- 每项 delivery 代表一份材料和一个非 null 的账目 handoff。多个 dispatch、null 账目、乱序修订、resultVersion 关联和材料字节需要实现验证。
- `Held` 只计算 pending/committed，不计算 excluded。实际产品保留原 identity 或完整失败输入时，仍可能需要计算其资源占用。`CapacityBound` 不证明排除后应释放资源、实际释放正确或系统能够继续接纳。实际 in-flight 槽、bytes、attachments、取消和暂存回收没有进入模型。
- receiver 使用确定性 operation。直接调用共同提供者时，另一 operation 对同一 delivery 的别名认回，以及普通 Journal 命令占用 operation 的冲突，需要按 Agent 接收共同提交条款另验。
- 两个租户均作为合法标识进入模型。未铸造标识、畸形输入、公开失败字段、完整输入冻结、副本防篡改和序列化没有展开。
- 发布点表示同一提供者的一次权威原子发布。它不为跨越发布点的两次独立读取提供共同快照。真实 Journal 与材料视图必须验证共同可见，不能从这个原子动作反推实现具有原子性。
- 宿主状态在同进程内保留。存储故障、跨进程恢复、磁盘耐久、Model ACK、Cordis 装配和 loop 推进不由此模型证明。

实现对照应从公开入口观察：发布前后的材料与条目、重复提交的原 receipt 和 revision、未知查询的原 operation、排除后的迟到提交、核验失败时的缓存拒绝、账目重试的原 handoff，以及 detach/rebuild 后的宿主状态。保留模型与实现之间尚未覆盖的映射，不把模型运行替代这些场景。
