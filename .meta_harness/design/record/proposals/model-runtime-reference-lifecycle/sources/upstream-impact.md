# 本地 origin/main 00356190 对 model-request 纵线的影响

核对日期：2026-09-29。HUB `/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime`，分支 `panqiwei/model-request-runtime`，HEAD `be316078f4490f9e03381de1d57a72726eaaec78`；本地 origin/main `003561900adb27de6ebe776fa1cf1b228304c873`；共同基线 `01c113f4b73003d01d459c809538fd3fee242b2c`。新增上游为 `441506c4 docs: define session composition and runtime assembly lifecycle` 及 PR #16 merge commit。

**报告时 origin 文档尚未合入 HUB。**ORIGIN 引用均来自固定 Git blob，而非 HUB 正文；没有读入主检出 dirty 内容，没有 fetch、merge、build、运行产品测试、联网、付费或读取密钥。本次仅改原 tmp 报告；原97文件预检证据保留。代码结论为静态读数，不冒称已运行复现或验收。

## 最新澄清与结论

用户最新澄清是：**model runtime 属于 Session/Run；现设计/实现已经符合的无需改；完整 Session/Run 始终在本轮边界外。**这覆盖了本报告前版“8项必然重构”及要求实现 Session/Run 治理闭包的表述，现已撤回。不得从 `host`、`close` 命名或显式停止后的恢复入口推断每次 Agent attempt 释放都会取消模型。

**可保留两侧实质增量、人工解决冲突并对账后同步；不是可直接无冲突合并。**上游97文件全是文档（产品79、对象3、foundation2、词表12、派生视图1），没有修改 spec、realization、registry、接受记录、源码或测试。它改变产品承诺，却没有自动升级现行精确契约。

当前实现已把调用 owner、短操作 reservation、attempt 借用和观察端分开，app 按 Session 留存调用 host，没有发现 Agent/runner 释放直接取消模型的链。**不能据此要求整体重构 RT/runtime/runner。**仍有两个窄问题：RT10 明文的 Agent 宿主寿命与新产品矛盾；原 attempt 被替换后、尚未写 opened 的独立调用会遭遇旧 opened fence（下列条件轨迹）。公开面也尚未提供“重新取得仍在途调用的等待/结果消费句柄”的完整承诺；已完成历史读取则已有，不应重复建设。缺少完整 Session/Run 装配不构成本纵线实现缺陷。

## 产品变化及本纵线适用范围

以下 ORIGIN 路径均在 `.meta_harness/design/`，行号固定于00356190。

| 新产品性质 | 依据 | 当前适用判断 |
|---|---|---|
| Model/Tool/Agent runtime 生命周期归 Session，Agent 只持句柄；零持有者仍执行、输出、记账 | PF013 `design.md:1087` §5.13；PF012 `:2022` §6.13；PF015 `:884` §6.21 | 模型 owner 独立性须逐项查；已有 Session 登记与 owner 机制可复用，不能要求全部重新实现 |
| 先查原执行：运行中重新等待、完成取原结果，只有执行自身失去连续性才恢复 | PF013 `design.md:1055`，PF012 §6.13 | 冷恢复已有；完成态 readAttempts 已有；live 重新等待公开承诺存在窄缺口 |
| 尝试替换不取消独立调用，原调用继续记结果/成本，新尝试可承接仍等待结果 | PF012 `design.md:2072`、`:1797` | 原 unfenced 结算与原归属兼容；opened 仍 fenced 的交错需要处理；late 标记本身不是矛盾 |
| call/Run 显式取消、Session归档取消；无Run旁路不受无关Run取消 | PF012 §6.13/6.15；PF015 §6.21 | 调用控制能力继续复用；完整 Run/Session 取消发现与治理装配边界外，不能把外部未实现自动算runtime缺陷 |
| 新Run采用当前定义；显式reload同Run安全交接，普通恢复不暗升；在途请求输入/绑定不变 | PF004 `:591/:621/:641` §6.9–6.11；PF012 `:2204` §6.18 | 固定plan/input/lease与校准来源门可复用；定义装配/reload不是本轮新建完整Agent/Run的理由 |
| 装配名单、定义数据、执行实现、稳定入口不同；提示词/schema逐请求采用当前合法数据 | SYS-COMPOSITION C3/C4；PF004；PF009/010；PF015 `:906` §6.22 | 输入组装方负责提供快照；不推翻纯plan，不把数据变化等同transport provider撤除 |
| 必需来源不止AgentDefinition，继承false；已知身份不等于执行授权；official AgentDefinition不可替换 | PF002/PF004 §4/6.2/6.8 | 资产/定义装配责任；AgentDefinition不等于ModelDefinition，不推导模型档案或贡献禁更新 |
| 会话输入/当前采用值持久、归档/空闲、队列迟到、压缩溢出、子会话、connector搁置、工具全文回取 | PF015 §6.16–6.24（`:813/:942`）；PF012/PF007/PF014/PF006 | 已纳入97文件盘点，属于相邻产品规则；本轮不实现完整Session/Run/工具/connector，不扩型号域或付费矩阵 |

## 逐性质符合性：契约、映射与实现分开

下表 HUB 路径以仓库根为起点；realization 缩写指 `.meta_harness/design/realization/packages/model/model-request-runtime/`。所谓“符合”是列明源码/已采用设计支持的有限性质，不是完整新产品验收。

| 性质 | 已有证据 | 判断与最窄影响 |
|---|---|---|
| 实际调用owner独立于attempt消费者 | `packages/model/model-request-runtime/src/service-types.ts:129` 明定义原调用 actual lifetime owner；`service-dispatch.ts:784–792` 取消组合仅原host.signal与lease.signal；v11-host-observer设计分离身份binding与寿命host | **已具备独立owner承载机制，可复用。**host是调用者提供，类型本身不证明任何装配都Session所有，也不证明绑定Agent；需看实际来源 |
| app按Session持有owner | `examples/model-invocation-minimal-demo/src/bootstrap.ts:588/:2296–2317` Map以SessionRef为key，验证Session后登记真实host；`model-call-host.ts:10–55`登记close至实际release | **已有Session关联与保留责任。**CLI `demo.ts:402/:468`每次send建owner、处理结果后显式stop；它不模拟Agent换代，不能将该stop当Agent释放反例，也不称demo是完整Session owner |
| attempt/runner释放不自动停止模型 | `bootstrap.ts:2055–2060` controlled attempt release只还log registration；`runner-service-host.ts:135–136/:205–209`使借用失效并释放failure source；`service-dispatch.ts:855–861`还reservation后继续await原handle.outcome | **该性质已符合，可复用。**没有发现释放链触达model host.abort/close；不据runner scope/task owner命名提出runner整体重构 |
| 观察者与业务执行独立 | v11-host-observer设计明确observer consumer_failed不取消模型或结算，资源仍由call owner保留；服务onAccepted只offer，不等待接收端 | **已采用性质，可复用。**不以观察句柄消失推论模型失联；完整无人持有时所有消费位置的接续尚非本次验收结论 |
| 冷恢复须真正停止旧执行/写者 | RT10 S17/S33；v12恢复、v14冷宿主映射；`bootstrap.ts:2321–2357`是显式reconcile入口，捕获原handle再stop/wait | **适用于真实失联/受控恢复的要求继续成立。**该入口本身不是“每次attempt必调”，不能凭stop-before-reconcile判实现违约；RT10把新attempt与该对账统一的明文需精确演进 |
| 已完成结果可读、原归属/迟到结算 | `service-reads.ts:226` readAttempts及`service-types.ts:411`；`settlement-coordinator.ts:432` unfenced+tailEquals；RT10 S69 | **已有，可复用。**不能说换attempt后所有结果被旧fence拒绝；late原归属不阻止另一个消费者合法承接，两者须分清 |
| 活调用查询与重新等待 | `service-types.ts:391–415`公开服务面；`service-calls.ts:655–663/:694–695`已有call只允许resumable；在途openCall得到wrongPhase | **公开“活执行重新等待/消费”承诺的窄缺口。**readAttempts可读阶段/历史，不等价返回活handle；不能用重新dispatch充当接续。究竟本轮要求何种独立消费者适配，由主owner界定；不由本报告预定新API/存储域或要求完整Session实现 |
| 新attempt出现后旧调用首次内容继续 | `service-dispatch.ts:784`固定原attempt；`anchored-invocation.ts:536–547/:700–703` opened走原fence；`session-log-jsonl/src/state.ts:33–37`拒绝较旧attempt | **具体源码反例见下。**限opened门，不泛化到结算；须定清独立runtime产出与Agent推进的写权边界，不能简单移除所有fence |

## 仍真实存在的冻结条款差异

HUB 当前接受依据是 D107 `record/decisions/model-input-usage-calibration-adoption/decision.md`。不能只看规范或增补文件保留的candidate历史标签判未接受。

1. RT10 `spec/capabilities/model-request-runtime/v10/contract.md:269` S5明写“宿主恒为agent runtime”；`:305` S7把一次调用宿主解释为agent runtime；`:993` S36明写agent runtime停止导致未收场调用中止。与ORIGIN PF013 `:1087–1102`直接冲突。**这是规范文义冲突，不能用泛化实现类型默默覆盖；但也不能反推代码已经把host绑Agent。**后继应限定真正执行owner停止与Agent消费者释放，保留实际停止/结算责任，不原地改冻结RT10。
2. RT10 `:861` S33要求新attempt进loop前对账，且恢复要旧执行/写者实际停止；新产品允许新attempt接续仍活模型。需要将真正恢复的适用条件与消费者重接区分；现有冷恢复算法不因新产品失效，**不据此断言app每次attempt都强制reconcile**。
3. RT10 `:321` S8明定Run内两个锚点均fenced；S15首内容先写opened，已接受行为在下述交错造成opened拒绝。此项需RT/日志写权相关owner共同判定最窄后继，不能在实现里偷偷忽略fence。
4. S61同寿命的停止位、signal、登记集合（`:1397`）本身是必要owner一致性，**不需要因为“host”名称重做**；只须修清它究竟承载哪个生命周期。S69 late原attempt归属（`:1533`）可保留，不要求抹掉或改成当前attempt。

ORIGIN PF013 `decisions.md:556`也明确冻结契约/映射应经规格演进核对宿主、取消、尝试栅栏、恢复，产品改动不自动改版本或接受范围。**不能自动升级不代表永远忽略规则**：上列差异交对应规格演进责任；本轮修真实局部差异所需内容，已有符合性质复用，完整Session/Run仍边界外。

## opened fence 的精确条件轨迹（源码推导，未运行复现）

前提：同Session/Run，原attempt A合法发出模型且尚无首内容，实际model host与lease保持活；新attempt B>A的合法条目已进入同一本真实日志；原模型随后收到首内容。这正是新产品允许Agent换代而独立模型继续的交错。

1. `service-dispatch.ts:784–787`把A传入 `createAnchoredModelInvocation`；原调用绑定不因B出现而改变。
2. `anchored-invocation.ts:689–703`首内容回调准备opened，用原A壳，然后调用append；`:542–546`选`fenced{run, attempt:A}`。
3. `session-log-jsonl/src/state.ts:33–37`看到已记录B>A，返回`attemptSuperseded`。`:84–87`对实际条目更新maxAttempt，不是任意外部声称。
4. `anchored-invocation.ts:565–575`把该确定失败认作openedKnownAbsent，receipt返回undefined；`:702`抛`model_anchor.unconfirmed`，不能正常确认/交付该首内容。新产品要求的独立执行持续可用在这个门受阻。后续具体响应/诊断终态未在本次运行，不能冒称某一个实测FailureCause。

反例不依赖Agent释放是否调用close；只要上述日志交错合法，即使命令owner留存也触发。若首内容已在B前确认，本轨迹不适用；无Run调用用unfenced，也不适用。**响应/费用结算另用unfenced+tailEquals，既有late结算用例不可当opened交错覆盖，也不能从opened拒绝推论费用丢失。**若验收范围不包含新attempt与旧活调用并存，应明示覆盖缺口，不能以此宣称已满足整条新产品性质。

## 三方文本冲突及不能丢的 HUB 内容

`three-way-audit.json` 遍历全部97路径，保留每文件上游hunk、是否HUB同改、文本冲突块。使用 Git blobs +临时 `git merge-file -p --diff3`，不碰index/worktree；这不是实际 merge-ort的最终结果，仅文本预检。结果：**56文件两侧同改，40文件存在文本冲突**；完整差异见 `upstream.diff`。目录内临时输入已清理。首次尝试命令 `python` 不存在，未写审计结果；随后 `python3` 成功。

- **PF013修订碰撞**：共同base rev13；HUB rev15（输入cap、unknown上游、token估算+margin），ORIGIN rev14（新生命周期）。`README.md` 有revision和状态两个冲突块，`design.md`只有修订/状态一个块；两侧正文内容可三方并存。不能整文件取theirs或把HUB降到rev14。建议组合为新rev16，注明来源分支各自的历史修订，状态分开记录已接受输入限制/估算与待规格演进的Session归属。
- **不冲突也要复核**：PF013 acceptance/changelog/decisions/flows 三方文本自动合并不代表历史rev编号已唯一；HUB已有rev14输入限制、rev15估算，上游另有rev14生命周期。保留原事件和来源，以组合rev的映射说明消歧，不把历史接受D096/D101改成接受新生命周期。
- **C-40重号**：HUB `ubiquitous_language/conflicts.md` C-40是“模型响应体与实际发送的存在关系”；ORIGIN C-40是“装配选入的来源不止 Agent Definition”，并接C41–48。须保留两条不同事实和引用，给碰撞条目唯一ID/锚点并修相关引用。最窄做法保留origin C40–48，给HUB这条另一个未占用编号；最终编号由词表owner核全库后定，不能盲改历史引用。
- **UL-model-response不可回退**：HUB已修正“response存在不证明实际send；锚点后零send也可结算记录”，并更新对象生灭/词条。上游只是生命周期更改，不能用其旧文本覆盖此修正。这与RT10零send仍有耐久结算责任直接相关。
- **其余冲突主要集中于**PF001/002/004/005/006/007/014及产品总表的rev/状态，追加decisions，10个terms文件的大量出处rev，objects/pending；不能对40个文件统一ours/theirs。HUB的工作区产品对齐及当前模型输入修正要留，上游更晚规则如official定义不可替换、Session所有权也要留。

## 最窄合并与文档对账清单（供主owner，不在本次执行）

1. PF013六文件合成新rev，保留两个方向的正文/验收/来源，修README状态及产品总入口两表（`product/README.md`、`architecture-core.md`）；本组合修订不修改D096/D101/D107或registry已冻结摘要。
2. PF013新rev涉及现存**31个词条、3对象**出处（需逐条复核，不能全局替换rev）：词表文件 `capabilities-and-composition.md`、`agent-runtime-loop.md`、`execution-and-outcome.md`、`record-and-context.md`、`scope-and-resolution.md`；对象 `UL-model-profile`、`UL-model-call`、`UL-model-response`。清单见 `pf013-source-entries.json`。生命周期真正改含义的核心是model-call/side-question/Agent runtime/Run/runtime-handle；profile输入限额含义保留HUB。
3. 修 C-40编号碰撞及其引用；合并全97文件中被点名的出处与条目（不限于上述PF013子集），同步 `ubiquitous_language/index.md`，`domain_objects/objects.md`和必要pending；对象派生图通过既有生成入口更新，不手改图伪造对账。
4. 用项目现有文档/统一语言/领域对象对账检查确认合并；不需要为纯文档同步重跑付费矩阵或重建模型包。若合并改变了实际实现/装配输入，再由主owner选受影响检查。
5. 若其他两侧独立实质增量被合成一个新的产品revision，按各topic现有revision取新值并同步其真实出处；不能用“取较大revision”冒充复核。完整40冲突清单已机器提供，本报告不擅自给所有topic定新rev。

## 核实版本与最窄责任清单

- 现行契约：RT10、MR9（D107）；Runner契约v5/LC6（D100，D106后继沿用）。现行runtime最新采用v19，继承v10 owner/v11 host-observer/v12恢复/v14冷宿主/v16校准/v17消费/v18来源。**runner最新映射v8（D106），没有已接受runner v9。**transport现行v13及v12r2、v10相关既有承诺。
- 规格owner：核并演进上述RT10明确Agent宿主文字、恢复触发条件、opened写权与活消费者接续承诺。将外部Session/Run调用者责任写成适用前提，不在本纵线填建完整系统。冻结RT10不覆盖，精确接受与消费者切换由主owner负责。
- realization/实现owner：只调整经接受后继证明不符的路径；v11独立owner、Session登记、observer隔离、reservation及attempt借用释放、v12/v14真实停止与恢复直接复用。无证据要求runner、MR9/MS6/CA2/SL3成组升版；若具体后继实际改变它们的语义再传播。
- Session/Run/Agent装配owner：未来实现完整治理、归档、reload或恢复装配时，不能将Agent消费者释放接到模型执行owner停止，不得将有活调用的消费者重接直接引向破坏式reconcile。此为清晰交接，不是本轮实现完整Session/Run的隐藏前置。
- transport/model供给owner：固定body/serialized、meter算法、原binding/lease、真实usage/cost、未知回执与零send责任、校准门均复用；没有产品变化要求重设算法、型号域或重跑全部付费矩阵。

## 有限验收义务与边界

本次未新增/运行测试。后继确有局部变更时，用本地可控传输与真实日志验证相应性质；不能把下表当扩大完整Session/Run交付的要求。

| 性质 | 最窄可观察验收 |
|---|---|
| 已有owner与消费者分离 | 释放controlled attempt/runner借用、归还reservation、观察接收端退出时，原host不abort，原调用可完成；显式真实host停止仍收口且不遗弃责任 |
| opened交错 | 原调用已dispatch、未opened时提交更高attempt，再给原首内容；按后继规则合法记录/交付且opened一次，旧Agent推进仍被拒。对照无Run、opened先于新attempt、真正Run取消 |
| 活重新等待（若本轮纳入独立消费者适配） | 已有调用在途时重新取得其等待/消费能力，不新dispatch、不重选binding、不重复账；未提供完整Session宿主不影响局部接口验证。复用readAttempts已完成态读取 |
| 结果与原归属 | 新attempt出现后原response/账仍可unfenced结算并保持原来源/late，结果承接不得改写发起者；重复读取无额外发送 |
| 真正失去连续性 | 保留实际旧网络/写者停止、unknown整批认回、首内容后不重发；新消费者到来本身不证明执行失联 |

已有规范/实现证据仅在前提不变时复用；旧付费模型矩阵不能代证这些并发性质，亦不因纯文档同步或局部owner核对机械重跑。跨租户、独立闭包、provider实际撤除、结算耐久等原保证保持。报告不给新机制或新接受决定；交付结论须由主owner依据具体版本与相应有限验收作出。
