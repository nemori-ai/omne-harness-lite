# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

运行行为测试经根入口与 `./testing` 入口调用，断言公开返回值。下列内部测试各有明确边界：

- `loop-transitions.spec.ts` 与 `loop-evaluator.spec.ts` 直接导入 `src/loop/nodes.ts`，并读评估器的导入图。转移表是纯数据。C1 核对正常路径与节点表。E1 的临时例外见下文。
- `canonical.spec.ts` 直接调用 `src/canonical.ts` 的纯函数，核对其注释承诺的输入等价性。
- `loop-coordinator.spec.ts` 直接调用协调者，核对 E1 `found-existing` 返回成功，以及节点抛错时返回的停止节点与 failure 种类。公开观察没有停止原因，不能区分这些协调结果。此测试只读返回值，不读私有状态。

- `loop-intake-prepare.spec.ts` 直接调用协调者，以区分等待完成、提供者违约和阶段不支持的结果。它只读返回值与 Journal 已存事实，不读取私有状态。公开 invoke 用例另核对同一 runtime 的两次输入无重叠。
- `loop-reply-close.spec.ts` 直接调用协调者，核对公开面未呈现的 I3/I4/I8 提交切点与停止结果。用例只读取 Journal 已存事实及返回值，不读私有帧。
- `loop-main-call.spec.ts` 直接调用协调者，按原调用身份核对主调用接缝。NA-M0-1 提交前切点与两个 C1 用例丢弃旧协调者，只从同一内存 Journal 的 I2 ready/step 或 M6 PendingCall 重建固定帧，保留原 runtime/Access/Authority，不传旧 iteration。提交前用例将恢复后的 PendingCall/EffectIntent 与原 M0 提交候选逐项比对，并核对未重做 prepare、只受理一次。另有 reply/partial/no-reply 三个用例在 ACK 后丢弃结果缓存与旧协调者，从 Journal completion 读取已存材料后接续到相同 I3 结果，不向 Model 再读全文。它们不验证进程耐久、公开 resume、挂接恢复或通用结果帧水合。
- 同文件的 R1 原 ACK 矩阵分别改变 call、consumer 的 owner/work/position/purpose、version、receipt 和 operation，核对 I3 的具名 invalid、原 release 仍 pending、恢复后仅确认一次。inspect 不可用或未知须保留 modelRuntime 失败来源与诊断，不能由同节点的 defect 代替。原 admit、Read 与 ACK 次数均保留断言。
- `loop-wait-reconcile.spec.ts` 核对公开驱动的失通知计时重读、提交回执丢失的 committed/unknown/excluded、普通原提交与 W0 自身未知时的零干扰写入、监听窗口新输入、单驱动互斥、零间隔让出、时钟边界与观察/计时清理失败。另核对同一及新协调者窄接续时先查询未知 M3，依赖在 W0 保存后恢复时先重查再决定休眠，I1 四类读取的一次失败都可不推进时钟而接续。严格 Node 子进程验证慢观察清理期间 Clock 拒绝仍可见且不形成未处理拒绝。默认 Node 子进程验证观察器或 Clock 拒绝的值不能转成诊断文本时，仍返回具名失败，并在返回前等待观察器清理。内存 Journal 与脚本 Model 不证明进程耐久或真实提供者组合。
- `loop-recovery.spec.ts` 直接导入协调者及其纯路由。它核对 E1/E2 只读认回、E4 路由、R0 原操作与 W0 保存等待。公开资格失败由 `provider-access.spec.ts` 的真实守卫测试验证，协调者不接收人为注入的准入结果。主调用用例在同一协调者停止后再入，不模拟进程退出，不证明公开 resume 或跨进程恢复。

## 测试范围

各文件核对以下行为：

- `loop-reply-close.spec.ts` 核对 NA-I3-1/2、NA-I4-1 与 NA-I8-1/2/3：准入与接续同 revision、原交接回执未知后同候选认回、message 事件、真实空批、最终失败 no-reply、完成候选与终态区分、在途 Journal.submit 到 step-2、终态释放后新 invoke，以及未处理结果等待。ordinary limit 保留真实 trim，部分与中断不准入消息或工具动作。测试仅用脚本化 Model、内存 Journal 与材料，不证明公开 submit、控制请求、耐久性或完整恢复。

- `public-entry.spec.ts` 核对两个入口的导出名、源码与构建产物的导入图、清单依赖，以及生产安装闭包不到达 Cordis。它读 `package.json` 与 `dist`，所以先构建再运行。
- `memory-journal.spec.ts` 用内存 Journal 核对[同形清单](../docs/architecture/mechanisms.md#两种实现必须同形的事实)。替身只有一个进程，不覆盖耐久性、崩溃与跨进程接管。
- `fixtures.spec.ts` 与 `assembly.spec.ts` 核对替身按编排回答，以及测试装配交给工厂得到 idle 的 provider。时钟用例核对 now 返回受控当前时刻、不登记等待，advanceTo 后读取同步变化。替身不证明真实提供者符合契约。
- `factory.spec.ts` 核对工厂的四种创建失败与成功的 idle。每条失败用例都经调用记录核对创建没有调用任何依赖的方法：没有写 Journal，没有事件，没有调用登记句柄与 `access.check`。
- `loop-transitions.spec.ts`（C1）以独立期望表核对正常路径的去向、出处列与原文。通常取节点表「如何返回」列。U0 接纳转 E0 取「终止或进展条件」列。I3 转 Q1 取正常路径伪代码的 `admitMessage(model-reply, reply)`。E1 的临时 `found-existing` 行另按阶段 1 读法核对。测试也核对节点词汇、转移行集合，以及正常路径只凭表就能从 U0 走到结束。
- `loop-evaluator.spec.ts`（C1）核对评估器在 E4 与 I8 的决定，以及正常路径之外的事实（控制、stopping、非输入边界的其他位置）返回 `unsupported`。编码用例核对布尔、有限数与 null 的写法、省略缺席成员，非有限数与函数抛出 `TypeError`。属性测试沿 `packages/tool/tool/tests/json-tree-wait.spec.ts` 的种子生成器，生成 500 组 `LoopFacts`：同一事实与其深拷贝得到相同的 `Next`，深度冻结的输入不被改动，每个步骤只在 E4、I0 输入边界或 I8 产生且转移表中有行。导入图测试断言评估器只到达 `nodes.ts`，不导入协调者、testing 入口或 Node 模块。
- `loop-invoke.spec.ts`（C2）对脚本化 Model 与内存 Journal 走一条输入：`invoke` 在受理后、主调用收场之前返回句柄；经句柄读到 input-taken、producer、message、ended，序号 1 至 4；runtime 从 occupied 回 idle；Journal 中 execution 为 ended，结果走 processed 路径并在 ACK 后释放；`handoff` 依次准入外部输入与助手回复；同一 runtime 能接着跑第二个 execution。脚本化 Model 在测试打开闸门之后才收场被受理的调用。同文件另核对句柄的 `output.read` 与 `output.events`：守卫的 denied 与 unavailable、跨租户与读另一个 execution 的身份都被拒绝；分页读取的多页结果按次序进入同一条回复；调用、操作与回复消息的身份由 execution 的摘要与 step 序号派生。另核对主调用的 `ModelInvocationRef` 随 M0 的提交在首次 admit 之前保存，且 admit 返回同一引用、指向所受理的调用。
- `loop-main-call.spec.ts` 的用例核对 I2/M0 的一次意图提交、提交前后丢弃协调者的原身份接续、原 reference 与 admission 认回、受理回执丢失、受理前真实撤销挂接、retry-decision 与无活体路由的等待、最终失败、部分工具参数、在途输入及 no-reply 时刻。processed 实际材料先保存，再由 Journal 绑定完成依据，最后 ACK。丢失 ACK 回执时读取与处理只有一次，原 call/version/consumption 和实际费用记录保持关联。recordResult 回执未知的 applied/dropped 分支都先认回原操作。无扩展的 M4/M5 直接返回 I3，不产生 M2 重试。
- `materials-support.ts` 在原租户与主体下实际保存并读取不可变材料，同 identity 同输入认回原回执、异值 conflict。严格 Model 证据适配器从根入口导入 readProcessedModelMaterial，读取真实材料、原 Model consumer/settlement、已成立 Journal 绑定与当前原 Authority/资格；它不使用 expectEvidence 代替保存。错误 tenant/version/consumer、假引用、无绑定、只有 raw、错误主体或撤权都拒 ACK。材料 owner 不符时原回执不改写，具名失败。
- `loop-main-call.spec.ts` 的 L3-B1/B2 反例核对部分内容在 Model ACK 后仍可读取，材料 preserve 前后失败/未知与 Journal 绑定失败/未知均零 ACK，孤立材料保留；材料未知 schema 或损坏不得变为空回复。完整读取跨 dispatches 不可用保留；readNext 失败/抛错、不完整读取与 closeRead 叠加失败、完整关闭失败与关闭回执丢失后均可重入，原 call/version/consumption 不变，Read 不泄漏，不新受理调用。严格适配与材料仍为非耐久测试实现，不代表真实 Model 提供者端到端。
- 同文件 R1 的 14 个用例专门截在 M3 producer 已成功提交到 M4、随后 I3 Materials.read 一次 unavailable 的位置，区别此前截在 M3 提交前、checkpoint 仍为 M6 的三个用例。新协调者不带 ACK 数组，reply/partial/no-reply 最终 release 均 confirmed，真实原 receipt 相同，ACK/read/admit 各一次、producer 唯一。确认读取不可用、未知、尚未确认或版本/consumer/receipt/operation 不符时不得成功。release unavailable 与 applied/dropped/pending 未知均沿同一原操作重试或 query；query 不可用和 unknown 保持失败，原责任保留。该组只验证主调用 M4 切点。#516 的终态 O0 接续由 `loop-terminal.spec.ts` 覆盖。
- 同文件核对 reasoning_state、完整 thinking 和未封 thinking 缺原产出 scope/format 时返回 unsupported：零 processed、零 ACK、零消息接纳，Read 已关闭，PendingCall 与 Model 生产责任保留。Model 脚本提供者的旧 sealed 校验尚不覆盖 reasoning_state，故该合法新类型从普通结果读取面注入。此测试只证明 Agent 消费边界，不证明真实 Model 提供者端到端。readNext 抛错仍关闭原 Read；closeRead 失败保持显式失败，不释放生产责任。用例没有 Agent stream 事件，透传仍未交付。
- `loop-intake-prepare.spec.ts` 核对 NA-I0-1/2 与 NA-I1-1/2/3：完整输入批、batch/step/event 同次提交、下一 step 清旧准备、两次 invoke 无重叠、条件与选择及上下文和准备的顺序、首次 assembled 与 P1 ready、条件来源、初次 adopted 为空与 M0 采用 coverage、四端口不可用各保存一次 W0。另核对非法首次 ready 不调用 Model、真实 cannot-fit 保留原因并经 F1 保存完整候选、I1/F1 未知提交的 committed/excluded 接续、F1 候选与时刻不因重试变化。候选时刻来自注入的 AgentClock.now，同一候选只取一次；取时 unavailable 时零 F1 写入，准备与续点保留，后续取时成功才形成候选。revision 2 的 needs-compaction 保存原准备并答 unsupported，不进入 F1 或压缩调用。输入测试直接调用内存 Journal.submit，不证明公开 submit。真实在途输入保持已固定请求，M3 在 changed 后重读当前挂接并完成原回复准入，用例在 I8 停止。完整 SC-AG-157 的迭代与终结交错仍归后续卡。另一用例在回复保管前受理新输入，单独核对下一 step 只承接新增输入。
- `loop-admission.spec.ts` 的用例名以节点验收表行号开头。U0 交出的内容经 `Journal.inputs` 读回。Q1 不提交，直接转 Q2。Q2 的模型回复回执随 checkpoint 提交，外部输入回执不另存（#558 S-13）。Q4 按来源返回 U0 或 I3。E0 在预约槽后保存输入与初始 checkpoint。
- 同文件核对 C1：最近受理的操作在运行中、停止后与 ended 后均认回原句柄。重复调用不再次 open。事件序号保持为 1 至 4。
- 同文件核对另一 execution 占槽时的原记录查找。更早操作经 query 与幂等受理认回，当前槽不变，原执行不再推进。定义解析失败原样返回。accept 回执未知时，返回值使用本次 invoke 的操作身份。
- 同文件核对新 runtime 认回 Journal 原记录。修订号已推进时，E1 结束协调。修订号未推进时，新 runtime 使用原 Authority 驱动。`loop-coordinator.spec.ts` 另断言前一种路径成功返回，不形成缺少转移行的缺陷。
- 同文件核对输入冲突。已记住的同一操作与 execution 配另一输入时，原 execution 占槽则直接返回 conflict。该路径不查询 Journal，也不动槽。槽空闲或另一 execution 占槽时，由 Journal 判定 conflict。
- 同文件核对 busy 与路由。预约中、运行中、已停止、open 未定各有 busy 用例。只有操作与 execution 都匹配 R0 待查项才进入重试查询。查询进行中，预约仍挡住另一 invoke。Journal 查询的 denied 读作 busy，unavailable 原样返回，unknown 返回本次操作的 commit-unknown。
- 同文件核对 C2：Q2 accept 回执未知时，invoke 返回原操作的 commit-unknown，新受理释放槽。同一操作以同一候选再次调用 accept 即查询，并取得原结果。此测试核对两次 accept 的操作身份与候选相同。
- 同文件核对 E0 的 R0 路径。pending、applied、dropped 故障配合 settle，覆盖 unknown、committed、excluded 三种查询结果。committed 后重试在 open 前失败保留预约，excluded 后同样的失败释放预约。查询失败原样返回并保留 R0 待查项。
- `loop-recovery.spec.ts` 的用例名以节点验收表行号开头。表驱动用例核对阶段 1 的已存 position、输入批、assembled/ready 准备、主调用、settling 与未建成节点。E1/E2 不推进修订号。不可用读取与准入投影 gap 保存等待。R0 对 unknown、committed、excluded 均保留原操作身份。9 个真实提交切点分别在再入前或 R0 查询时 settle 为 committed/excluded，核对受理、读取、处理、ACK 与 producer 事件的次数，以及回复准入事实。E1/E2 之间真实 detach 后不再次连接 Model，本地协调回 idle。E2 读取终态时不再读取业务输入，终态路由优先于未定业务操作。W0 的状态与事件一次提交，失败保持为失败。
- `canonical.spec.ts` 核对对象键顺序与缺席成员不改变输入。它保留 null、数组顺序与元素边界。字节视图只使用其偏移与长度范围内的字节。
- `loop-port-failures.spec.ts` 记录 #502 1.2 只走正常路径这一限制：对路径上每个调用端口的节点注入一次端口的 `unavailable`。E1/E2/I1/M1 保存等待，其余受测节点停止，Journal 的 `position` 停在最后一次提交写下的节点并保持 20 轮，F3 之前 execution 不终结，`observe` 显示 occupied。停止的 `owner` 只保留在协调者内部（#558 S-14）。公开测试不核对停止原因。`open` 之前的端口失败（`adoptions.resolve`、Q2 `handoff.accept`、E0 `open`）是 `invoke` 的回答，并释放槽。
- `loop-slot.spec.ts` 核对单执行槽：扩展拒绝在 `open` 之前释放槽；登记句柄的 `report` 抛出不影响 `invoke` 与回 idle；在 `invoke` 之前打开的观察先见 idle、再被唤醒见 occupied；E4 的 stop 与缺少转移行的结果都使运行停在 E4、未终结且仍占槽，后者走协调者的 `#defect` 路径；P1 再选择与第一次不一致时运行停在 P1（#502 1.2 的替代做法；P0/P1 与一致性重试尚未交付）。
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

### 终态出口（#516）

`loop-terminal.spec.ts` 核对 F1 完整候选与 F2 证据的固定、F3 的唯一终态共同提交，以及先受理输入使旧候选失效。
三类丢失回执分别核对原操作的 committed、excluded 与 unknown。查询或读取不可用时不写会改变原终结条件的等待提交。
真实 custody blocked 保留未交清责任。真实 transfer 后才重提完成。
B1 用例在 no-reply 取时与 F1 提交两个切点先受理新输入，核对同次驱动进入 step-2、零虚假 producer 等待，以及原 Model 身份、读取和 ACK 次数。已收场业务续点的关闭不解除 O0 release 责任。

非空台账用例固定两项 after_terminal 采用：原登记回执丢失后查回，同一内存 Journal 上的新协调者从 ended 认回已登记与未登记项。
未登记项保留给长期 Journal，宿主之后经公开记录端口完成登记。此用例不执行阶段 3 扩展，也不证明真实杀进程或跨进程恢复。
O0 内存丢失用例从 completion 材料与生产者 inspect 认回真实原 ACK，不重读 Model 正文、不重复 ACK。
未确认输出在 idle 后仍能从原句柄读取。登记不撤除，原 execution 不重开，新 execution 可复用 runtime。

### Loop 骨架（#502 1.2）的临时做法与后续各卡

骨架的临时做法在源码注释、下列测试名与[成员 README](../README_ZH.md#支持范围)中写明：

- `loop-invoke.spec.ts` 中「临时简化，1.3–1.9 按节点表收紧」的用例固定骨架的提交次序与 `position` 去向。其余节点尚未全部按节点表收紧。I2 仅构造帧，M0 一次提交，M6、M1 收场、无扩展 M4 与 M5 不提交，对应期望已同步。
- 同文件「待 #558 M04-1……M04-8……」的用例固定事件的承载：input-taken 随 I0 的提交，producer 随 M3 `recordResult` 之后的提交。M04-7（`open` 不写事件）由事件序号从 1 起即 input-taken 体现。M04-5（processed 不声明参加者）由结果的完成依据体现。
- `loop-transitions.spec.ts` 核对 I1 首次 assembled 转 P0、不可用转 W0、真实 cannot-fit 转 F1。P1 带 previous 复核才返回 ready（#558 S-11）。I3 把回复交 Q1（伪代码 `runIter`、`admitMessage`）。
- E1 在修订号已超过原 open 回执时返回 `found-existing`，由转移表正常结束协调。这避免为已受理的同一操作启动第二个 Loop。节点表 E1 行没有这个去向，属于阶段 1 读法。`loop-transitions.spec.ts` 核对转移行，`loop-coordinator.spec.ts` 核对成功结果。
- Q2 的 commit-unknown 在节点表中转 R0，未定则等待。阶段 1 以 #558 S-13 为依据，由调用方用原操作与原候选再次调用 accept 即查询。invoke 先返回 commit-unknown，新受理释放槽。`loop-admission.spec.ts` 核对此读法，后台等待尚未交付。
- `loop-evaluator.spec.ts` 中「stage-temporary (#502 stage 5)」的用例固定 `decode` 返回 `unsupported`。

E1/E2/I1 的等待、E4/R0 路由与 I0/I1 的用例已写入节点验收表（agent-contract 的 `verification/node-acceptance.md`）的「实现用例」列。公开唤醒与完整失败恢复尚未交付。下表仅列仍待后续卡补齐的骨架用例：

| 节点                   | 骨架用例                              | 补齐的卡                   |
| ---------------------- | ------------------------------------- | -------------------------- |
| P0、P1                 | 转移表的 P 行；不含扩展与一致性重试   | 后续请求接缝实现           |
| M1 的 stream           | 观察到真实收场，但不发布 Agent stream | 后续生产者元数据与透传接缝 |
| F2、F4 的扩展求值       | 本阶段只固定依据并保留观察台账        | 阶段 3                     |
| W0、R0                 | 无                                    | 1.9                        |

下列创建校验没有用例，因为工厂收到的输入判定不了它们，见[成员 README](../README_ZH.md#支持范围)：

- 待拥有者：绑定租户与安全作用域不一致（`denied`）。
- 待拥有者：精确采用 `binding.definition` 与 `loopGuardPolicy` 解析不到（`unavailable`），以及依定义判定 tools、admission、extensions 的必需性。
- 待 #558 M04-3：外部协调者参加的拒绝条件。

工厂只为无类型调用方校验选项的取值。依赖假定满足各自的契约类型，测试不覆盖违反类型的依赖：没有 `capabilities` 的 Journal、抛出异常的 `registration.instance` 读取器、不是对象的选项或依赖都使创建 reject。

`observe` 缺租户与租户非法的用例名带「待拥有者」：契约没有 `invalid` 的结束原因，用例只核对序列结束、没有状态、没有调用 `access.check`，不核对结束原因。

`journal-support.ts` 构造测试共用的契约值。`loop-support.ts` 构造评估器测试的 `LoopFacts`，并给出采用了 `agentEvaluator`、编排了条件与模型选择、模型在闸门打开后以一段文本收场的装配。`factory-support.ts` 给出工厂测试的有效选项、记录每次依赖方法调用的代理与登记句柄替身。`module-graph.ts` 与 `packages/tool/tool/tests/module-graph.ts` 相同，遍历导入图。
