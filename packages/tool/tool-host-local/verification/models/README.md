# 环境准备的有限协议模型

[EnvironmentPreparation.tla](EnvironmentPreparation.tla) 检查宿主预占、原请求、查询、首次采用和释放的有限安全性质。行为依据为 [Tool P03](../../../tool-contract/SPEC.md#p03-环境准备和释放) 和宿主的 [环境准备租户调度](../../SPEC.md#环境准备的租户调度)。[EnvironmentDriver.tla](EnvironmentDriver.tla) 单独检查 driver 一次 step 的追加 prepare 上限及 prepared 缓存条件。

模型检查不证明源码精化。带完整守卫的规格配置与撤掉转发前守卫的负控配置分开；后者曾对应 `await check(...)` 恢复后缺少原采用再核的源码缺口，该缺口已由源码的同步 `adoptionGuard` 关闭（见[转发前的最终原采用守卫与源码的对应](#转发前的最终原采用守卫与源码的对应)）。规格配置完整通过仍不证明源码符合。

## 状态、有限边界与原子步骤

宿主模型有 A、B 两个租户。A 有 a1、a2 两项原操作，B 有 b1。初始队列按租户 FIFO 排列，未发送的本地拒绝后可以显式重排同一原操作。全局容量分别检查 1 和 2，每租户在途上限为 1。正权重 DRR 的具体 credit 算法被抽象为选择任一有容量的租户队首。该抽象保留共享配额、租户队首和跨租户派发，不证明加权份额或公平进展。

三个操作都能排队、预占、等待检查、发送、发生未发送失败及确认释放。初始状态另枚举 a1、a2、b1 作为重点操作。重点操作展开提供者事实、查询及采用状态，其他操作在发送后持续占额，直到确认关闭。其他操作的提供者关闭和关闭答复合成一步。模型不覆盖两个不同原操作的提供者采用步骤彼此交错，只覆盖它们通过共享调度名额产生的干扰。这一缩减不把三操作配额退化为单操作配额。

同一重点操作一次展开一个 prepare 或 inspect 控制续体，释放与资格变化可和它交错。多个调用者同时认回同一原操作的合并机制没有展开；首次签发唯一性仍由明确的 EE 外部前提承担，不能据本模型宣称已验证提供者的并发实现。

| 状态 | 含义 |
| --- | --- |
| `queue`、`lane` | 每租户队首及 queued、reserved、checked、sent、closed。reserved 到 checked 表示资格异步检查完成，checked 到 sent 表示外层调用者恢复后转发 |
| `occupied` | 宿主拥有的本地名额，包括尚未发送的预占 |
| `outstanding`、`sentEver` | 当前已发送而未结清的责任，以及原请求确实发送过的历史事实 |
| `external`、`allocatedEver` | 原提供者的 pending、allocated、closed、终态 not-allocated 与曾经分配事实，不由本地返回值推导 |
| `registered`、`eligible`、`original`、`scopeOpen` | 原本地登记是否仍在、当前租户资格、当前适配器是否仍为原采用及作用域状态 |
| `phase`、`intent`、`snapshot` | 进行中的显式 prepare 或 inspect、各等待切点和已经取得但尚未消费的旧答复 |
| `leaseIssued`、`badAdoption` | 首次租约签发历史，以及采用发生时的违规事实。后来撤权不会把过去合法采用改写为非法 |
| `retired`、`cleanup`、`excluded`、`releaseConfirmed` | 退休终态、资源清理中、Tool 可靠排除和确认释放各自的事实 |
| `refused`、`diagnostics` | 本地拒绝已经完成资源处置，以及尚在等待的受信诊断接收。诊断完成不控制返额 |

原 tenant、call、operation、adoption、摘要、用途、固定请求和获取输入用八元组 `Original(o)` 表示。相同与不同值是抽象身份比较，不模拟编码、哈希碰撞或运行时解析器。`MismatchedRequest` 枚举八个位置的异值请求。真正发出的请求记录在 `requests`，检查它们始终来自原绑定。

模型没有深度上限、状态约束或公平性公式。`StateView` 只省略未被任何动作守卫或被检性质读取的 `returned` 标签。队列、诊断等待、提供者事实、查询快照、当前资格、登记、退休和采用历史都保留。公开错误字符串、异常对象与脱敏实现不在这个商状态空间内。TLC 的完整搜索仅指这个明确的有限空间。

`ProviderExcludes` 表达 Tool P03 的可靠 `excluded`，它确认本次已发出的请求没有存活的迟到分配。随后只有调用者显式执行 `RetryUnsent`，同一原操作才可重新排队并首次分配。`ProviderNotAllocated` 表达 EE 的原键终态 `notAllocated`，不能翻译为 Tool `excluded`。该终态只能查询或结清，不能重新分配；`EERejectionIsTerminal` 检查宿主不把它放回队列。这两条动作代表不同的外部契约事实，没有证明提供者怎样完成排除或终局提交。

### await 切点

| 模型动作 | 可在前后交错的事件与源码对应 |
| --- | --- |
| `Reserve` | 对应 `scheduled-environment.ts` 的 `pump` 取队首并增加本地占额。随后资格检查可以等待，其他租户可以派发 |
| `CompleteDispatchCheck`、`Dispatch` | 前者对应 `check` 内 await qualify 结束并完成最后 matches。后者对应 `enqueue.dispatch` 的外层 await check 恢复。二者间允许采用更换，不能合成一步 |
| `RefuseDispatch`、`FinishDiagnostic` | 对应 `check` 的 onFailure 与独立 diagnostics.record 等待。本地预占在诊断返回前撤回。已发送的 outstanding 不走这条分支 |
| `ProviderAllocates`、`CapturePrepare`、`ReturnPrepare` | 原分配成立、适配器产生答复、宿主消费答复分开。结果可以 unknown，或在退休之后才返回。原 prepare 抛错不撤已发出的名额 |
| `RetryPolicy` | 对应 `recall` 的 await policy.retry，完成后重新检查原采用与退休。wait 不触发采用，inspect 只查询 |
| `ReadQuery`、`ReturnQuery` | 对应 `queryPreparation` 与其调用者恢复。两者间可以丢登记、释放或退休。查询快照不是下一动作的授权 |
| `CompleteRecheck`、`ForwardRecognition` | 对应 `inspectOrRecognize` 的 await check 内完成与外层恢复。二者分开，并再次允许原采用变化 |
| `Adopt` | 原适配器在首次 prepare 或同输入接续上请求 EE 首次采用。原登记、首次 guard 与 ledger 对应、作用域、当前准入及单次签发由下列外部前提约束 |
| `LoseRegistration` | EE 本地登记丢失或冷恢复。原描述及提供者事实保留，查询和清理仍可继续，没有自动重建原登记的动作 |
| `AdoptionFails`、`BeginRelease`、`ProviderSettles`、`ConfirmRelease` | 采用终局失败、清理请求、外部实际结清、宿主确认分开。没有租约也仍可结清原获取；unknown 不确认释放 |

`RefuseDispatch` 的无条件失败选择包括当前资格明确拒绝、资格抛错及 adoption getter 抛错。它不是对异常概率的假设。非重点操作省略外部等待期间的具体响应，只保留占用至确认关闭的契约责任。

## 性质和检查配置

| 性质 | 具名判据 | 配置 |
| --- | --- | --- |
| 本地拒绝完成即无未发送占额 | `LocalRefusalVacates` | EnvironmentPreparation.cfg、one-slot.cfg |
| 已发送未知、分配和待清理责任继续占额 | `SentDutyRetained` | 同上 |
| 未发送失败不铸造外部终局 | `NoInventedExternalFinal` | 同上 |
| 原请求完整身份不改变 | `OriginalRequestsOnly` | 同上 |
| 外层 await 恢复后仍沿原适配器转发 | `OriginalAdapterAtForward` | 同上，及 forward.cfg 的定向负控 |
| 总占额和每租户占额不超过当前模型边界 | `QuotaBounds` | 同上 |
| inspect 不产生首次采用 | `InspectNeverAdopts` | 同上 |
| 丢原登记和退休不能产生新采用 | `NoColdAdoption`、`NoRetiredAdoption` | 同上 |
| 已退休项不重新进入排队和预占 | `ClosedNeverRequeues` | 同上 |
| EE 原键终态 notAllocated 不重排、不变成首次分配 | `EERejectionIsTerminal` | 同上 |
| A 本地失败后，合法、有容量的 B 队首仍能被调度 | `LocalFailureLeavesBSchedulable` | 同上。检查 `ENABLED Reserve("b1")`，不是时序进展 |
| A 仍等待诊断时 B 实际可发送 | `NeverBWhileADiagnosticWaits` 的反例 | witness-b.cfg，否定命题的反例只作为存在性见证 |
| A 有第二项排队，同时 A、B 各有一个在途操作 | `NeverTwoTenantsWithAQueued` 的反例 | witness-quota.cfg，仅全局容量 2 |

五个宿主负控分别启用 `LeakReservation`、`InspectAdopts`、`SkipRegistration`、`SkipRetirement`、`SkipForwardAdoption`。它们必须分别违反 `LocalRefusalVacates`、`InspectNeverAdopts`、`NoColdAdoption`、`NoRetiredAdoption`、`OriginalAdapterAtForward`。每个配置只检查其定向目标，不能用其他异常或其他不变量代替成功命中。

`SkipRetirement` 同时撤掉显式 prepare 入口、重试答复消费、检查后转发和首次采用的退休守卫，其中包含 `PublicSnapshot` 对退休项的不可用映射。只撤掉部分守卫会被余下守卫挡住，不能检验该终态保护。规格正控始终设置该开关为 FALSE。

### 转发前的最终原采用守卫与源码的对应

`check` 在内部 await qualify 后调用 matches 并返回。`enqueue.dispatch`、`inspectOrRecognize` 与直接 `inspectPreparation` 在外层 await check 恢复后，先核 retired，再同步调用 `adoptionGuard`，它在没有新的等待点的情况下再次匹配原 adoption，然后才进入 `sendPreparation` 或 `queryPreparation`。守卫不成立时按既有 unavailable 返回；尚未发送的派发同时撤回本地预占，已发送的条目保留查询与清理责任；getter 抛错走 `qualify` 阶段诊断并先撤未发送预占。这对应规格里 `Dispatch`、`ForwardRecognition` 的 `s.original` 守卫与 `RefuseBeforeSend`、`DeclineRecognition`。直接查询路径没有在模型里单独展开，由 `tests/environment-boundaries.spec.ts` 的直接 inspectPreparation 换代用例覆盖。

`EnvironmentPreparation-forward.cfg` 只设置 `SkipForwardAdoption=TRUE`，保留其他安全守卫。它是负控：撤掉转发前守卫时必须命中 `OriginalAdapterAtForward`，预期轨迹为 Reserve、CompleteDispatchCheck、AdapterChange、Dispatch。它曾作为当时源码的对应配置（`current-source`）复现 #675 第二轮的转发反例；守卫落入源码后它只证明性质对该守卫敏感，不再描述源码。

规格正控里的最终原采用守卫是源码应当满足的承诺。模型检查不证明源码精化：守卫与源码的对应由上段文字和宿主测试维护，runner 的 `implementationConformance` 固定报告 `not-established-by-this-run`。

## 外部前提与实际验证的责任

| 前提 | 拥有者与采用范围 | 源码或实际测试的对应，不能据此声称已运行 |
| --- | --- | --- |
| 同一完整原获取键不会重复分配；Tool excluded 封住此前请求的迟到分配；EE notAllocated 是原键终局 | Tool P03 对原环境适配器的要求，以及 EE「原获取的查询与结清」 | `tool-contract/tests/environment-allocation.spec.ts` 的唯一分配及原操作场景，host 的 reliable exclusion 显式重排场景。模型用 `allocatedEver` 和分开的 provider 状态编码前提，没有展开提供者算法 |
| 原本地登记及首次 guard、ledger 对应正确，首次采用只签发一次租约 | 原 EE 采用状态转移。模型用 `registered` 抽象有效登记与捕获上下文，用 `leaseIssued` 编码单次签发 | 同测试文件的 concurrent original adoption、lost local registration；这是内存 fixture 符合性检查，不是生产 EE 证明 |
| 冷恢复原描述可用于查询和结清，不能认领旧租约 | 原环境适配器及 EE 恢复拥有者 | `tool-host-local/tests/environment-allocation.spec.ts` 的 cold original-query 与 release-before-adopt 场景 |
| 外部 released 或 exclusion 回执真实且绑定原操作 | 原提供者与适配器的事实验证责任 | host `checkedPreparationProgress`、`finishRelease` 及 release 相关行为用例；模型没有证明底层耐久或回执真实性 |
| qualify 给出的当前授权结论可信 | 注入的受信资格拥有者 | `environment-boundaries.spec.ts`、`environment-scheduling.spec.ts` 的撤权、异常、异租户与原输入用例。模型不认证凭据 |
| Tool 原准备记录与适配器原获取映射可恢复 | Tool 与环境适配器各自的事实拥有者 | P03 的责任边界。模型不实现存储、崩溃事务或跨进程恢复 |

`ProviderAllocates` 和 `Adopt` 的单次计数不是宿主证明的结果。它们是以上精确外部契约前提的可执行表达。宿主模型检查自己保留责任、保持原请求、限制动作入口及拒绝过期条件。模型没有把“调用了 disposer”当成资源已结束。

## Driver 子模型

driver 模型检查最多两次 step，每次可遇到 allocated、prepared、pending、unknown、unavailable 或身份不符的答复。第一答复和追加 prepare 的答复分别行动，允许取消与原采用变化在等待间发生。`OneExtraPreparePerStep` 限制每步追加调用不超过一次。`OnlyPreparedCached` 和 `OnlyPreparedExecutable` 限制缓存与重新连接的 E 来源，`OriginalContinuationInput` 固定原调用输入。

对应源码为 `tool/src/driver.ts` 的 `askEnvironment`、`continueAllocation`、`prepare` 和 `environmentOf`。`tool/tests/driver-allocation.spec.ts` 覆盖一次追加上限、异值回包、冷恢复、取消和 allocated 重连拒绝。driver 的 loop 负控必须命中 `OneExtraPreparePerStep`，cache 负控必须命中 `OnlyPreparedCached`。本子模型不证明 driver 与宿主的整个运行组合。

## 执行与证据判据

使用已安装 Java 和 TLA2Tools，先取得任务授权的重型窗口。命令在实际任务工作树根执行，输出目录必须是尚不存在的任务 tmp 子目录。

```sh
export JAVA_BIN=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java
export TLA2TOOLS_JAR=/Users/panqiwei/.local/share/omne-tools/tlaplus/tla2tools-1.7.4.jar
bash scripts/with-test-slot.sh node packages/tool/tool-host-local/verification/models/check-models.mjs tmp/issue-675/round2-model/run-001 <获准的40位HEAD>
```

runner 逐个使用 `java -cp JAR tlc2.TLC -workers 1`，并为每次运行分配独立 metadir。工具支持 `-noGenerateSpecTE` 时显式关闭生成。已核对的 JAR 文件名为 `tla2tools-1.7.4.jar`，实际 banner 为 `TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)`。它只提供 opt-in 的 `-generateSpecTE`，因此不传该选项。runner 先保存工具帮助，再把模型和配置复制到任务 tmp 的独立输入目录并核对哈希，生成物不能进入产品目录。

runner 固定 locale、时区与颜色环境，保存完整命令、起止、退出、信号、超时、源码 HEAD、源文件和模型配置哈希、Java 二进制与 JAR 哈希、Java 版本、TLC 原输出、状态数和实际有限边界。输出目录不可复用，失败日志保持原名。

正控同时要求零退出、`Model checking completed. No error has been found.`、状态队列为零、`Finished in` 和无错误。负控及可达性见证要求上述实际 TLC 版本的不变量退出码 12、唯一预期不变量名、至少两状态反例和结束标记。语法失败、死锁、其他非零退出、超时或未完成搜索均不算目标命中。

所有配置都设置 `CHECK_DEADLOCK FALSE`。本轮检查安全性质、指定动作的可执行性及有限可达轨迹，不检查全局无死锁，也不证明进展。runner 对死锁错误的拒绝只验证结果分类器不会把它误认成具名不变量反例，不能解释为本次启用了死锁检查。

`node .../check-models.mjs --self-test` 检查日志解析器拒绝缺完成标记、未清空队列、伪零退出、缺状态数、错属性、错退出码、缺轨迹、死锁、超时和信号。正式执行同时调用这些自检。`summary.json` 的 `allExpectedResults` 仅表示各检查产生预期结果；`implementationConformance` 固定为 `not-established-by-this-run`，不能用 runner 零退出报告产品通过。

## 未覆盖范围

模型只检查有限安全性、动作可执行性和具名可达轨迹，没有公平前提，也没有执行 liveness 检查。它不证明无界参与者、任意配额、具体 DRR 数值稳定性、生产耐久、跨进程、真实 EE、vault、外部效果、设施清理、凭据政策或 Session 冻结。U16/C7 原引用及原持久事实全部丢失的缺口保持未闭合。完整组合、运行时异常脱敏和真实提供者由各自 QA 与集成证据覆盖。
