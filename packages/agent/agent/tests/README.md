# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 等测试文件、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

运行行为测试经根入口与 `./testing` 入口调用，断言公开返回值。下列内部测试各有明确边界：

- `loop-transitions.spec.ts` 与 `loop-evaluator.spec.ts` 直接导入 `src/loop/nodes.ts`，并读评估器的导入图。转移表是纯数据。C1 核对正常路径与节点表。E1 的临时例外见下文。
- `canonical.spec.ts` 直接调用 `src/canonical.ts` 的纯函数，核对其注释承诺的输入等价性。
- `loop-admission-read.spec.ts` 直接调用协调者，核对 E2 读取主回复准入事实的下界选择、进程内前缀、正常提交携带的读取位置、提交时 `missing-basis` 转 W0、缺依据时一次 origin 重读与报告，以及从已保存前缀恢复的读取范围（#1011）。重启用例用新协调者的窄接续，以条件读取失败截停在 E2 之后，不证明公开 resume 或跨进程恢复。`loop-admission-pages.spec.ts` 用脚本页核对 `admission-read.ts` 的下界规则、读取位置选择与逐页校验，每条用例只破坏一项条件，含越过 2^53 的序位。内存 Journal 的计数器只证明测试用提供者的读取量，不证明 SQLite 或 E9。
- `loop-coordinator.spec.ts` 直接调用协调者，核对 E1 `found-existing` 返回成功，以及节点抛错时返回的停止节点与 failure 种类。公开观察没有停止原因，不能区分这些协调结果。此测试只读返回值，不读私有状态。

- `loop-intake-prepare.spec.ts` 直接调用协调者，以区分等待完成、提供者违约和阶段不支持的结果。它只读返回值与 Journal 已存事实，不读取私有状态。公开 invoke 用例另核对同一 runtime 的两次输入无重叠。
- `loop-reply-close.spec.ts` 直接调用协调者，核对公开面未呈现的 I3/I4/I8 提交切点与停止结果。用例只读取 Journal 已存事实及返回值，不读私有帧。
- `loop-main-call.spec.ts` 直接调用协调者，核对 M0 提交前后丢弃协调者时的原 reference、PendingCall、EffectIntent 和固定请求接续。正常 loop 仅 admit，受理未知或恢复时才 inspect；Model 消费调用保持为零。reply/partial/no-reply 从 Journal 的原 received 与完整材料恢复，producer 事件唯一，不新受理调用。原生产者 pusher 的 ACK 记录与 Agent 调用记录分开核对，不证明进程耐久或公开 resume。
- 原 Agent ACK/Read/release 矩阵已退休。原绑定、consumer、版本、共同提交失败与材料校验分别由 `model-receiver.spec.ts`、`journal-received.spec.ts` 和材料采用用例覆盖。不能从这些用例推断 Agent 仍执行 Model ACK。
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
- `loop-invoke.spec.ts`（C2）对脚本化 Model 与内存 Journal 走一条输入：`invoke` 在受理后、主调用收场之前返回句柄；经句柄读到 input-taken、producer、message、ended，序号 1 至 4；runtime 从 occupied 回 idle；Journal 中 execution 为 ended，结果经 received 共同保存后由 loop 采用，ACK 由 Model pusher 完成；`handoff` 依次准入外部输入与助手回复；同一 runtime 能接着跑第二个 execution。脚本化 Model 在测试打开闸门之后才收场被受理的调用。同文件另核对句柄的 `output.read` 与 `output.events`：守卫的 denied 与 unavailable、跨租户与读另一个 execution 的身份都被拒绝；pusher 取得的完整结果按原次序进入同一条回复；调用、操作与回复消息的身份由 execution 的摘要与 step 序号派生。另核对主调用的 `ModelInvocationRef` 随 M0 的提交在首次 admit 之前保存，且 admit 返回同一引用、指向所受理的调用。
- `loop-main-call.spec.ts` 核对原 received 的 reply/partial/no-reply 解释、未知 schema/缺材料拒绝、M3 producer 后的窄恢复与真实撤权。材料不可读时保留原调用和待办，恢复不生成第二条 producer，不从 Model 查询拼出业务结果。
- reasoning_state、完整 thinking 和未封 thinking 缺原产出 scope/format 时仍返回 unsupported，不接纳消息。reasoning_state 的合法 envelope 直接送入真实 receiver；Model scripted producer 的旧 sealed 校验不支持该类型，因此这一场景不声明真实 producer 或 pusher ACK 已通过。其余正常结果仍经公开 pusher。
- `loop-intake-prepare.spec.ts` 核对 NA-I0-1/2 与 NA-I1-1/2/3：完整输入批、batch/step/event 同次提交、下一 step 清旧准备、两次 invoke 无重叠、条件与选择及上下文和准备的顺序、首次 assembled 与 P1 ready、条件来源、初次 adopted 为空与 M0 采用 coverage、四端口不可用各保存一次 W0。另核对非法首次 ready 不调用 Model、真实 cannot-fit 保留原因并经 F1 保存完整候选、I1/F1 未知提交的 committed/excluded 接续、F1 候选与时刻不因重试变化。候选时刻来自注入的 AgentClock.now，同一候选只取一次；取时 unavailable 时零 F1 写入，准备与续点保留，后续取时成功才形成候选。revision 2 的 needs-compaction 保存原准备并答 unsupported，不进入 F1 或压缩调用。输入测试直接调用内存 Journal.submit，不证明公开 submit。真实在途输入保持已固定请求，M3 在 changed 后重读当前挂接并完成原回复准入，用例在 I8 停止。完整 SC-AG-157 的迭代与终结交错仍归后续卡。另一用例在回复保管前受理新输入，单独核对下一 step 只承接新增输入。
- `loop-admission.spec.ts` 的用例名以节点验收表行号开头。U0 交出的内容经 `Journal.inputs` 读回。外部输入在 Q1 不写 P；模型回复在 Q1 先写 P 再 `prepare`。Q2 的 Ja 带 `handoff.resolve`、模型回复的准入事实与 message 事件，并清除 `currentHandoff`；外部输入不写 Ja。Q4 按来源返回 U0 或 I3。E0 在预约槽后保存输入与初始 checkpoint。
- 同文件核对 C1：最近受理的操作在运行中、停止后与 ended 后均认回原句柄。重复调用不再次 open。事件序号保持为 1 至 4。
- 同文件核对另一 execution 占槽时的原记录查找。更早操作经 query 与幂等受理认回，当前槽不变，原执行不再推进。定义解析失败原样返回。prepare 回执未知时，返回值使用本次 invoke 的操作身份。
- 同文件核对新 runtime 认回 Journal 原记录。修订号已推进时，E1 结束协调。修订号未推进时，新 runtime 使用原 Authority 驱动。`loop-coordinator.spec.ts` 另断言前一种路径成功返回，不形成缺少转移行的缺陷。
- 同文件核对输入冲突。已记住的同一操作与 execution 配另一输入时，原 execution 占槽则直接返回 conflict。该路径不查询 Journal，也不动槽。槽空闲或另一 execution 占槽时，由 Journal 判定 conflict。
- 同文件核对 busy 与路由。预约中、运行中、已停止、open 未定各有 busy 用例。只有操作与 execution 都匹配 R0 待查项才进入重试查询。查询进行中，预约仍挡住另一 invoke。Journal 查询的 denied 读作 busy，unavailable 原样返回，unknown 返回本次操作的 commit-unknown。
- 同文件核对 C2：外部输入在 Q1 的 prepare 回执未知时，invoke 返回原操作的 commit-unknown，新受理释放槽。同一操作以同一请求再次调用 prepare 即查询，并取得原结果。此测试核对两次 prepare 的请求相同。
- 同文件核对 E0 的 R0 路径。pending、applied、dropped 故障配合 settle，覆盖 unknown、committed、excluded 三种查询结果。committed 后重试在 open 前失败保留预约，excluded 后同样的失败释放预约。查询失败原样返回并保留 R0 待查项。
- `loop-model-wait.spec.ts` 经公开 `invoke` 走一次模型请求，脚本化 Model 在协调者进入 W0 之后才收场。它核对各节点的提交次数与 W0 的 producer 等待、每次提交携带的 #1011 读取位置、等待提交到休眠之间最多一次 `load`、自身 waiting 事件不唤醒、结果在重读前后到达都在检查时刻之前唤醒、重读 unavailable 不算进度、重读 denied 停在原位，以及等待期间同操作认回、异输入 conflict 与跨租户 denied。录制器只包住 Journal 与时钟，不读私有帧。
- `loop-recovery.spec.ts` 的用例名以节点验收表行号开头。表驱动用例核对阶段 1 的已存 position、输入批、assembled/ready 准备、主调用、settling 与未建成节点。E1/E2 不推进修订号。不可用读取与准入投影 gap 保存等待。R0 对 unknown、committed、excluded 均保留原操作身份。9 个真实提交切点分别在再入前或 R0 查询时 settle 为 committed/excluded，核对原受理、received 材料读取、零 Agent Model 消费调用与 producer 事件的次数，以及回复准入事实。E1/E2 之间真实 detach 后不再次连接 Model，本地协调回 idle。E2 读取终态时不再读取业务输入，终态路由优先于未定业务操作。W0 的状态与事件一次提交，失败保持为失败。
- `canonical.spec.ts` 核对对象键顺序与缺席成员不改变输入。它保留 null、数组顺序与元素边界。字节视图只使用其偏移与长度范围内的字节。
- `loop-port-failures.spec.ts` 记录 #502 1.2 只走正常路径这一限制：对路径上每个调用端口的节点注入一次端口的 `unavailable`。E1/E2/I1/M1 保存等待，F3 的 `tryFinish` unavailable 经 R0 在内存等待，不提交 waiting（`position` 仍是 F3），其余受测节点停止，Journal 的 `position` 停在最后一次提交写下的节点并保持 20 轮，F3 之前 execution 不终结，`observe` 显示 occupied。停止的 `owner` 只保留在协调者内部（#558 S-14）。公开测试不核对停止原因。`open` 之前的端口失败（`adoptions.resolve`、Q1 `handoff.prepare`、E0 `open`）是 `invoke` 的回答，并释放槽。
- `loop-slot.spec.ts` 核对单执行槽：扩展拒绝在 `open` 之前释放槽；登记句柄的 `report` 抛出不影响 `invoke` 与回 idle；在 `invoke` 之前打开的观察先见 idle、再被唤醒见 occupied；E4 的 stop 与缺少转移行的结果都使运行停在 E4、未终结且仍占槽，后者走协调者的 `#defect` 路径；P1 再选择与第一次不一致时运行停在 P1（#502 1.2 的替代做法；P0/P1 与一致性重试尚未交付）。
- `provider-access.spec.ts` 对四个面的每个公开操作核对：跨租户 `denied`，缺租户或租户非法 `invalid`（`observe` 以 `denied` 结束），都不调用 `access.check`。`access.check` 的 denied、unavailable、reject 与契约之外的回答都不放行。每次操作恰好调用一次，不缓存 allowed。

测试通过不代替规格或验收。

## 维护

公开行为或 `SPEC.md` 条款变化时，同步对应测试与本目录 `index.md`。同形清单变化时，按新条目号同步 `memory-journal.spec.ts` 的用例名。

## 本包事实

`memory-journal.spec.ts` 按同形清单组织：每个 `describe` 对应一条事实，名称以 `fact N` 开头，用例名也带条目号。6.1 与 7.4 可以把这些用例搬到 `agent-journal-local`，两种实现共用同一套断言。

名为「facts 6, 7, 9, 11 and 17 as #558 decided them」的 `describe` 含四条用例：

- 第 6 条：`commit` 与六个记录方法每建立一个新事实推进一次 revision，同操作重试认回原回执、不推进。
- 第 9、11 条：standalone 绑定下 `recordResult.transfer` 的 custody 与 processed 由提供者建立依据；`commit.caller` 的未声明种类返回 `unsupported`。
- 第 7 条：`open` 不追加事件，第一个序号属于之后的一次提交。
- 第 17 条：`control` 与 `recordControl` 把阶段事实投影为 control 事件。

名为「Q2: the coordination mode of the binding」的 `describe` 固定绑定声明的 `coordination`：standalone 对非空 grant 或来源写前返回 `unsupported`；coordinated 缺 grant 返回 `denied`，参加者的四种响应各映射一次。`journal-core-conformance.spec.ts` 以内存 Journal 运行 agent-contract `./testing` 的 `agentJournalCoreConformance`，session-adapters 的同名 spec 以 coordinated 替身运行同一套件。同文件另以三个只破坏一条规则的装饰器（重试答 conflict、ended 后新 submit 被受理、过期 expected 先于 ended 答 changed）包住内存 Journal：先核对未装饰的基线没有失败用例，再核对每个装饰器使它所破坏规则所在的那条具名用例变红。夹具另提供 `seedLegacyCandidate`（旧协议留下的 cancelled 候选）、`qualify`（三种结算资格）与提交效果意图的 `produceResult`。

`fact 10` 固定 `tryFinish` 的五类 blocked（inputs、controls、operations、passages、custody）及其次序、有效取消对普通终结的优先（有效取消下带 complete 或 failed 候选的 F1 为 changed）、取消授权只能结束取消候选、未定写入为清单的 unknown 项而 tryFinish 为 unavailable、判断 unknown 为 unavailable、无安装时候选变体为 unavailable。ended 之后的迟到阶段事实只记录、不投影事件是 SPEC 六个阶段的正式条款。`journal-support.ts` 的 `finishInput` 先提交 F1 与 F2 再 `prepareFinish`，以读到的投影组成 tryFinish 输入；`finish` 先经 `takeInputs` 取走受理输入；`finishCancelled` 以 establish、judge、prepareFinish 结束取消候选。

`provider-access.spec.ts` 中名称以「stage-temporary (#502)」开头的用例固定阶段性临时做法：放行之后，`invoke` 与 `observe` 之外的操作本体返回具名的 `unavailable`。`invoke` 放行之后先经 `adoptions.resolve` 取评估器，没有采用时返回其 `unavailable`、不 open。`loop-invoke.spec.ts` 的同名用例固定句柄的 `submit`、`control`、`acknowledge`。实现对应阶段的卡改写这些用例。

### 终态出口（#516）

`loop-terminal.spec.ts` 核对 F1 完整候选与 F2 证据的固定、F3 的唯一终态共同提交，以及先受理输入使旧候选失效。
三类丢失回执分别核对原操作的 committed、excluded 与 unknown。查询或读取不可用时不写会改变原终结条件的等待提交。
真实 custody blocked 保留未交清责任。真实 transfer 后才重提完成。
B1 用例在 no-reply 取时与 F1 提交两个切点先受理新输入，核对同次驱动进入 step-2、零虚假 producer 等待，以及原 Model 身份、received 及独立 pusher ACK 记录。其他生产者的 O0 release 责任保持原规则。

非空台账用例固定两项 after_terminal 采用：原登记回执丢失后查回，同一内存 Journal 上的新协调者从 ended 认回已登记与未登记项。
未登记项保留给长期 Journal，宿主之后经公开记录端口完成登记。此用例不执行阶段 3 扩展，也不证明真实杀进程或跨进程恢复。
O0 窄接续用例保留原 received 与材料，核对零 Agent Model 消费调用；不重读 Model 正文或执行 ACK。
未确认输出在 idle 后仍能从原句柄读取。登记不撤除，原 execution 不重开，新 execution 可复用 runtime。

### Loop 骨架（#502 1.2）的临时做法与后续各卡

骨架的临时做法在源码注释、下列测试名与[成员 README](../README_ZH.md#支持范围)中写明：

- `loop-invoke.spec.ts` 中「临时简化，1.3–1.9 按节点表收紧」的用例固定骨架的提交次序与 `position` 去向。其余节点尚未全部按节点表收紧。I2 仅构造帧，M0 一次提交，M6、M1 收场、无扩展 M4 与 M5 不提交，对应期望已同步。
- 同文件「the producer event goes with M3 after joint receipt; input-taken goes with I0」的用例固定事件的承载：input-taken 随 I0 的提交，producer 随 M3 采用 received 之后的业务提交。`open` 不写事件由事件序号从 1 起即 input-taken 体现。Model 不再用 processed 参加者保存结果；Tool 的既有参加者协议保留。
- `loop-transitions.spec.ts` 核对 I1 首次 assembled 转 P0、不可用转 W0、真实 cannot-fit 转 F1。P1 带 previous 复核才返回 ready（#558 S-11）。I3 把回复交 Q1（伪代码 `runIter`、`admitMessage`）。
- E1 在修订号已超过原 open 回执时返回 `found-existing`，由转移表正常结束协调。这避免为已受理的同一操作启动第二个 Loop。节点表 E1 行没有这个去向，属于阶段 1 读法。`loop-transitions.spec.ts` 核对转移行，`loop-coordinator.spec.ts` 核对成功结果。
- Q1 的 prepare 回执未知时，由调用方用原操作与原请求再次调用 prepare 即查询。invoke 先返回 commit-unknown，新受理释放槽。模型回复的 Ja 回执未知时转 R0，再入时 Q2 以 lookup 读回同一个 H。`loop-admission.spec.ts` 与 `loop-reply-close.spec.ts` 核对此读法，后台等待尚未交付。
- `loop-evaluator.spec.ts` 的 decode 用例核对 checkpoint schema revision 2 的全成员 round-trip，并拒绝缺少 `replyAdmissionRead`、schema 未知与读取位置畸形的 continuation（#1011）。其他 facet 的身份关系判断仍属 #502 阶段 5。

E1/E2/I1 的等待、E4/R0 路由与 I0/I1 的用例已写入节点验收表（agent-contract 的 `verification/node-acceptance.md`）的「实现用例」列。公开唤醒与完整失败恢复尚未交付。下表仅列仍待后续卡补齐的骨架用例：

| 节点                   | 骨架用例                              | 补齐的卡                   |
| ---------------------- | ------------------------------------- | -------------------------- |
| P0、P1                 | 转移表的 P 行；不含扩展与一致性重试   | 后续请求接缝实现           |
| M1 的 Model 等待       | 只从 Journal 匹配 received，不发布 Agent stream | 已采用的接收路径；不是 stream 透传待办 |
| F2、F4 的扩展求值       | 本阶段只固定依据并保留观察台账        | 阶段 3                     |
| W0、R0                 | 无                                    | 1.9                        |

下列创建校验没有用例，因为工厂收到的输入判定不了它们，见[成员 README](../README_ZH.md#支持范围)：

- 待拥有者：绑定租户与安全作用域不一致（`denied`）。
- 待拥有者：精确采用 `binding.definition` 与 `loopGuardPolicy` 解析不到（`unavailable`），以及依定义判定 tools、admission、extensions 的必需性。

工厂只为无类型调用方校验选项的取值。依赖假定满足各自的契约类型，测试不覆盖违反类型的依赖：没有 `capabilities` 的 Journal、抛出异常的 `registration.instance` 读取器、不是对象的选项或依赖都使创建 reject。

`observe` 缺租户与租户非法的用例名带「待拥有者」：契约没有 `invalid` 的结束原因，用例只核对序列结束、没有状态、没有调用 `access.check`，不核对结束原因。

`journal-support.ts` 构造测试共用的契约值。`loop-support.ts` 构造评估器测试的 `LoopFacts`，并给出采用了 `agentEvaluator`、编排了条件与模型选择、模型在闸门打开后以一段文本收场的装配。`factory-support.ts` 给出工厂测试的有效选项、记录每次依赖方法调用的代理与登记句柄替身。`module-graph.ts` 与 `packages/tool/tool/tests/module-graph.ts` 相同，遍历导入图。
`journal-received.spec.ts` 对实际内存 Journal 的四个同源视图执行 required 共同提交套件。`model-receiver.spec.ts` 通过公开 Model pusher 的冻结交付验证原资格、dispatch 集合、未知认回、取消与容量、账目重试及 blocked 保留。`loop-main-call.spec.ts` 验证 Agent 不调用 Model 消费面、从 received 采用结果、恢复及撤权；生产者 ACK 从 pusher 的独立记录验证。

第 2 轮回归还核对：维护入口返回 `Reply<ModelReceiverReport>`，两租户同名 execution、同租户不同 execution、撤权与不存在均不泄漏；每次维护捕获原绑定工作集，等待期间新增绑定不进入报告或材料读取。未决目标或资格检查取消返回无内容 unavailable。真实出口未完时首推与重复推送已返回 saved，实际 outlet 任务仍由宿主持有，重装配不双发，旧驱动代不发后继。

`createModelReceiverFixture` 是 `./testing` 的公开非耐久装配设施。它使用真实 memory Journal 和已提交 PendingCall，显式替身提供 Model 权威、Access 与 outlet。host-local 用它验证根工厂的 supported/unsupported、共同保存、报告和同 handoff 重试，不证明完整 Cordis 插件或真实 Model host。
