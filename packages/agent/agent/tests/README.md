# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

运行行为测试经根入口与 `./testing` 入口调用，断言公开返回值。下列内部测试各有明确边界：

- `loop-transitions.spec.ts` 与 `loop-evaluator.spec.ts` 直接导入 `src/loop/nodes.ts`，并读评估器的导入图。转移表是纯数据。C1 核对正常路径与节点表。E1 的临时例外见下文。
- `canonical.spec.ts` 直接调用 `src/canonical.ts` 的纯函数，核对其注释承诺的输入等价性。
- `loop-coordinator.spec.ts` 直接调用协调者，核对 E1 `found-existing` 返回成功。公开观察只能读到 idle，不能区分随后正常结束还是缺少转移行的缺陷。此测试只读协调结果，不读私有状态。


- `public-entry.spec.ts` 核对两个入口的导出名、源码与构建产物的导入图、清单依赖，以及生产安装闭包不到达 Cordis。它读 `package.json` 与 `dist`，所以先构建再运行。
- `memory-journal.spec.ts` 用内存 Journal 核对[同形清单](../docs/architecture/mechanisms.md#两种实现必须同形的事实)。替身只有一个进程，不覆盖耐久性、崩溃与跨进程接管。
- `fixtures.spec.ts` 与 `assembly.spec.ts` 核对替身按编排回答，以及测试装配交给工厂得到 idle 的 provider。替身不证明真实提供者符合契约。
- `factory.spec.ts` 核对工厂的四种创建失败与成功的 idle。每条失败用例都经调用记录核对创建没有调用任何依赖的方法：没有写 Journal，没有事件，没有调用登记句柄与 `access.check`。
- `loop-transitions.spec.ts`（C1）以独立期望表核对正常路径的去向、出处列与原文。通常取节点表「如何返回」列。U0 接纳转 E0 取「终止或进展条件」列。I3 转 Q1 取正常路径伪代码的 `admitMessage(model-reply, reply)`。E1 的临时 `found-existing` 行另按阶段 1 读法核对。测试也核对节点词汇、转移行集合，以及正常路径只凭表就能从 U0 走到结束。
- `loop-evaluator.spec.ts`（C1）核对评估器在 E4 与 I8 的决定，以及正常路径之外的事实（控制、stopping、在途调用、生产者、未交清的结果、其他位置）返回 `unsupported`。编码用例核对布尔、有限数与 null 的写法、省略缺席成员，非有限数与函数抛出 `TypeError`。属性测试沿 `packages/tool/tool/tests/json-tree-wait.spec.ts` 的种子生成器，生成 500 组 `LoopFacts`：同一事实与其深拷贝得到相同的 `Next`，深度冻结的输入不被改动，每个步骤只在 E4 或 I8 产生且转移表中有行。导入图测试断言评估器只到达 `nodes.ts`，不导入协调者、testing 入口或 Node 模块。
- `loop-invoke.spec.ts`（C2）对脚本化 Model 与内存 Journal 走一条输入：`invoke` 在受理后、主调用收场之前返回句柄；经句柄读到 input-taken、producer、ended，序号 1、2、3；runtime 从 occupied 回 idle；Journal 中 execution 为 ended，结果走 processed 路径并在 ACK 后释放；`handoff` 依次准入外部输入与助手回复；同一 runtime 能接着跑第二个 execution。脚本化 Model 在测试打开闸门之后才收场被受理的调用。同文件另核对句柄的 `output.read` 与 `output.events`：守卫的 denied 与 unavailable、跨租户与读另一个 execution 的身份都被拒绝；分页读取的多页结果按次序进入同一条回复；调用、操作与回复消息的身份由 execution 的摘要与 step 序号派生。另核对主调用的 `ModelInvocationRef` 随 I2 的提交在首次 admit 之前保存，且 admit 返回同一引用、指向所受理的调用。
- `loop-admission.spec.ts` 的用例名以节点验收表行号开头。U0 交出的内容经 `Journal.inputs` 读回。Q1 不提交，直接转 Q2。Q2 的模型回复回执随 checkpoint 提交，外部输入回执不另存（#558 S-13）。Q4 按来源返回 U0 或 I3。E0 在预约槽后保存输入与初始 checkpoint。
- 同文件核对 C1：最近受理的操作在运行中、停止后与 ended 后均认回原句柄。重复调用不再次 open。事件序号保持为 1、2、3。
- 同文件核对另一 execution 占槽时的原记录查找。更早操作经 query 与幂等受理认回，当前槽不变，原执行不再推进。定义解析失败原样返回。accept 回执未知时，返回值使用本次 invoke 的操作身份。
- 同文件核对新 runtime 认回 Journal 原记录。修订号已推进时，E1 结束协调。修订号未推进时，新 runtime 使用原 Authority 驱动。`loop-coordinator.spec.ts` 另断言前一种路径成功返回，不形成缺少转移行的缺陷。
- 同文件核对输入冲突。已记住的同一操作配另一输入时，原 execution 占槽则直接返回 conflict。该路径不查询 Journal，也不动槽。槽空闲或另一 execution 占槽时，由 Journal 判定 conflict。
- 同文件核对 busy 与路由。预约中、运行中、已停止、open 未定各有 busy 用例。只有操作与 execution 都匹配 R0 待查项才进入重试查询。查询进行中，预约仍挡住另一 invoke。Journal 查询的 denied 读作 busy，unavailable 原样返回，unknown 返回本次操作的 commit-unknown。
- 同文件核对 C2：Q2 accept 回执未知时，invoke 返回原操作的 commit-unknown，新受理释放槽。同一操作以同一候选再次调用 accept 即查询，并取得原结果。此测试核对两次 accept 的操作身份与候选相同。
- 同文件核对 E0 的 R0 路径。pending、applied、dropped 故障配合 settle，覆盖 unknown、committed、excluded 三种查询结果。committed 后重试在 open 前失败保留预约，excluded 后同样的失败释放预约。查询失败原样返回并保留 R0 待查项。
- `canonical.spec.ts` 核对对象键顺序与缺席成员不改变输入。它保留 null、数组顺序与元素边界。字节视图只使用其偏移与长度范围内的字节。
- `loop-port-failures.spec.ts` 记录 #502 1.2 只走正常路径这一限制：对路径上每个调用端口的节点注入一次端口的 `unavailable`，运行停止，Journal 的 `position` 停在最后一次提交写下的节点并保持 20 轮，F3 之前 execution 不终结，`observe` 显示 occupied。停止的 `owner` 只保留在协调者内部（#558 S-14）。公开测试不核对停止原因。`open` 之前的端口失败（`adoptions.resolve`、Q2 `handoff.accept`、E0 `open`）是 `invoke` 的回答，并释放槽。
- `loop-slot.spec.ts` 核对单执行槽：扩展拒绝在 `open` 之前释放槽；登记句柄的 `report` 抛出不影响 `invoke` 与回 idle；在 `invoke` 之前打开的观察先见 idle、再被唤醒见 occupied；E4 的 stop 与缺少转移行的结果都使运行停在 E4、未终结且仍占槽，后者走协调者的 `#defect` 路径；P1 再选择与第一次不一致时运行停在 P1（#502 1.2 的替代做法，1.5 补自环）。
- `provider-access.spec.ts` 对四个面的每个公开操作核对：跨租户 `denied`，缺租户或租户非法 `invalid`（`observe` 以 `denied` 结束），都不调用 `access.check`。`access.check` 的 denied、unavailable、reject 与契约之外的回答都不放行。每次操作恰好调用一次，不缓存 allowed。

测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。#558 裁定 M04-4、M04-5 或 M04-7 之后，在同一波修改内存 Journal、对应的临时做法用例和成员 README 的支持范围表。同形清单变化时，按新条目号同步 `memory-journal.spec.ts` 的用例名。

## 本包事实

`memory-journal.spec.ts` 按同形清单组织：每个 `describe` 对应一条事实，名称以 `fact N` 开头，用例名也带条目号。6.1 与 7.4 可以把这些用例搬到 `agent-journal-local`，两种实现共用同一套断言。

名为「临时做法，待 #558 裁定」的 `describe` 含四条用例：

- M04-4：`commit` 与六个记录方法成功写入时推进 revision，同操作重试认回原回执、不推进。
- M04-5：未声明参加者时，`recordResult.transfer` 的 custody 与 processed 由提供者建立依据；`commit.caller` 的同种类返回 `unsupported`。
- M04-7：`open` 不追加事件，第一个序号属于之后的一次提交。
- M04-1 的读法：`control` 与 `recordControl` 把阶段事实投影为 control 事件。

`fact 10` 中名称带「临时做法，待 #558 裁定」的用例固定 `tryFinish` 的 controls 与 inputs 两项 blocked 条件、passages 不检查，以及 ended 之后 `recordControl` 只记录、不投影事件。`journal-support.ts` 的 `finish` 先经 `takeInputs` 取走受理输入，再以普通完成终结。

`provider-access.spec.ts` 中名称以「stage-temporary (#502)」开头的用例固定阶段性临时做法：放行之后，`invoke` 与 `observe` 之外的操作本体返回具名的 `unavailable`。`invoke` 放行之后先经 `adoptions.resolve` 取评估器，没有采用时返回其 `unavailable`、不 open。`loop-invoke.spec.ts` 的同名用例固定句柄的 `submit`、`control`、`acknowledge`。实现对应阶段的卡改写这些用例。

### Loop 骨架（#502 1.2）的临时做法与后续各卡

骨架的临时做法在源码注释、下列测试名与[成员 README](../README_ZH.md#支持范围)中写明：

- `loop-invoke.spec.ts` 中「临时简化，1.3–1.9 按节点表收紧」的用例固定骨架的提交次序与 `position` 去向。它不区分节点表规定的精确提交点。补齐某节点提交点的卡改写该节点的期望。
- 同文件「待 #558 M04-1……M04-8……」的用例固定事件的承载：input-taken 随 I0 的提交，producer 随 M3 `recordResult` 之后的提交。M04-7（`open` 不写事件）由事件序号从 1 起即 input-taken 体现。M04-5（processed 不声明参加者）由结果的完成依据体现。
- `loop-transitions.spec.ts` 中 I1 行与 I3 进入 Q1 的行注明是 #502 1.2 的读法：I1 把 `prepare` 返回的 assembled 或 ready 都转 P0（伪代码 `prepareRequest`），I3 把回复交 Q1（伪代码 `runIter`、`admitMessage`）。
- E1 在修订号已超过原 open 回执时返回 `found-existing`，由转移表正常结束协调。这避免为已受理的同一操作启动第二个 Loop。节点表 E1 行没有这个去向，属于阶段 1 读法。`loop-transitions.spec.ts` 核对转移行，`loop-coordinator.spec.ts` 核对成功结果。
- Q2 的 commit-unknown 在节点表中转 R0，未定则等待。阶段 1 以 #558 S-13 为依据，由调用方用原操作与原候选再次调用 accept 即查询。invoke 先返回 commit-unknown，新受理释放槽。`loop-admission.spec.ts` 核对此读法，后台等待尚未交付。
- `loop-evaluator.spec.ts` 中「stage-temporary (#502 stage 5)」的用例固定 `decode` 返回 `unsupported`。

自 E1 起的失败分支、等待与恢复都没有用例：运行遇到正常路径之外的结果，以具名的 `unavailable` 停在该节点，不回 idle；`loop-port-failures.spec.ts` 只核对这种停止。U0、Q1、Q2、Q4、E0 的用例已写入节点验收表（agent-contract 的 `verification/node-acceptance.md`）的「实现用例」列。下表是骨架用例与后续各卡的临时对应，#502 1.4 至 1.9 各卡把用例写入节点验收表之后删去本表：

| 节点 | 骨架用例 | 补齐的卡 |
| --- | --- | --- |
| E1、E2、E4 | 转移表的 E 行；评估器 E4 用例 | 1.4 |
| I0、I1、P0、P1 | 转移表的 I、P 行；input-taken 的承载用例 | 1.5 |
| I2、M0、M6、M1、M3、M4、M5 | 转移表的 M 行；producer 的承载用例 | 1.6 |
| I3、I4、I8 | 转移表的 I 行；评估器 I8 用例 | 1.7 |
| F1、F2、F3、F4、O0、E9 | ended 与回 idle 的用例 | 1.8 |
| W0、R0 | 无 | 1.9 |

下列创建校验没有用例，因为工厂收到的输入判定不了它们，见[成员 README](../README_ZH.md#支持范围)：

- 待拥有者：绑定租户与安全作用域不一致（`denied`）。
- 待拥有者：精确采用 `binding.definition` 与 `loopGuardPolicy` 解析不到（`unavailable`），以及依定义判定 tools、admission、extensions 的必需性。
- 待 #558 M04-3：外部协调者参加的拒绝条件。

工厂只为无类型调用方校验选项的取值。依赖假定满足各自的契约类型，测试不覆盖违反类型的依赖：没有 `capabilities` 的 Journal、抛出异常的 `registration.instance` 读取器、不是对象的选项或依赖都使创建 reject。

`observe` 缺租户与租户非法的用例名带「待拥有者」：契约没有 `invalid` 的结束原因，用例只核对序列结束、没有状态、没有调用 `access.check`，不核对结束原因。

`journal-support.ts` 构造测试共用的契约值。`loop-support.ts` 构造评估器测试的 `LoopFacts`，并给出采用了 `agentEvaluator`、编排了条件与模型选择、模型在闸门打开后以一段文本收场的装配。`factory-support.ts` 给出工厂测试的有效选项、记录每次依赖方法调用的代理与登记句柄替身。`module-graph.ts` 与 `packages/tool/tool/tests/module-graph.ts` 相同，遍历导入图。
