# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

测试只经根入口与 `./testing` 入口调用，只断言公开返回值，不读内部状态。一处例外：`loop-transitions.spec.ts` 与 `loop-evaluator.spec.ts` 直接导入 `src/loop/nodes.ts`，并读 `src/loop/evaluator.ts` 的导入图。转移表是 1.3 至 1.9 共用的内部接缝，它与节点表逐行对应正是本卡的判据 C1；它是纯数据，读它不读运行状态。

- `public-entry.spec.ts` 核对两个入口的导出名、源码与构建产物的导入图、清单依赖，以及生产安装闭包不到达 Cordis。它读 `package.json` 与 `dist`，所以先构建再运行。
- `memory-journal.spec.ts` 用内存 Journal 核对[同形清单](../docs/architecture/mechanisms.md#两种实现必须同形的事实)。替身只有一个进程，不覆盖耐久性、崩溃与跨进程接管。
- `fixtures.spec.ts` 与 `assembly.spec.ts` 核对替身按编排回答，以及测试装配交给工厂得到 idle 的 provider。替身不证明真实提供者符合契约。
- `factory.spec.ts` 核对工厂的四种创建失败与成功的 idle。每条失败用例都经调用记录核对创建没有调用任何依赖的方法：没有写 Journal，没有事件，没有调用登记句柄与 `access.check`。
- `loop-transitions.spec.ts`（C1）以一张独立写出的期望表逐行核对转移表：每行的去向、所注行号确是该节点在 `docs/architecture/loop-algorithm.md` 节点表中的行、该行含决定去向的原话；另核对表没有多余的行，节点词汇与节点表一致，正常路径只凭表就能从 U0 走到结束。
- `loop-evaluator.spec.ts`（C1）核对评估器在 E4 与 I8 的决定，以及正常路径之外的事实（控制、stopping、在途调用、生产者、未交清的结果、其他位置）返回 `unsupported`。属性测试沿 `packages/tool/tool/tests/json-tree-wait.spec.ts` 的种子生成器，生成 500 组 `LoopFacts`：同一事实与其深拷贝得到相同的 `Next`，深度冻结的输入不被改动，每个步骤只在 E4 或 I8 产生且转移表中有行。导入图测试断言评估器只到达 `nodes.ts`，不导入协调者、testing 入口或 Node 模块。
- `loop-invoke.spec.ts`（C2）对脚本化 Model 与内存 Journal 走一条输入：`invoke` 在受理后、主调用收场之前返回句柄；经句柄读到 input-taken、producer、ended，序号 1、2、3；runtime 从 occupied 回 idle；Journal 中 execution 为 ended，结果走 processed 路径并在 ACK 后释放；`handoff` 依次准入外部输入与助手回复；同一 runtime 能接着跑第二个 execution。脚本化 Model 在测试打开闸门之后才收场被受理的调用。
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

- `loop-invoke.spec.ts` 中「临时简化，1.3–1.9 按节点表收紧」的用例固定每节点一次提交的次序与 `position` 的去向：自 E3 至 F2 每个节点各一次，U0 至 Q4、E1、E2、E4、F3 之后不提交。补齐某节点精确提交点的卡改写这条用例中该节点的期望。
- 同文件「待 #558 M04-1……M04-8……」的用例固定事件的承载：input-taken 随 I0 的提交，producer 随 M3 `recordResult` 之后的提交。M04-7（`open` 不写事件）由事件序号从 1 起即 input-taken 体现。M04-5（processed 不声明参加者）由结果的完成依据体现。
- `loop-transitions.spec.ts` 中 I1 行与 I3 进入 Q1 的行注明是本卡的读法：I1 把 `prepare` 返回的 assembled 或 ready 都转 P0（伪代码 `prepareRequest`），I3 把回复交 Q1（伪代码 `runIter`、`admitMessage`）。
- `loop-evaluator.spec.ts` 中「stage-temporary (#502 stage 5)」的用例固定 `decode` 返回 `unsupported`。

失败分支、等待、恢复与 busy 都没有用例：骨架遇到正常路径之外的结果，以具名的 `unavailable` 停在该节点，不回 idle。节点验收表（agent-contract 的 `verification/node-acceptance.md`）的「实现用例」列不在本包写范围，骨架用例与后续各卡的对应如下：

| 节点 | 骨架用例 | 补齐的卡 |
| --- | --- | --- |
| U0、Q1、Q2、Q4、E0 | `loop-invoke.spec.ts` 的受理与 handoff 用例 | 1.3 |
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
