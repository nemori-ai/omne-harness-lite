# D-086：RT4 结算消费规格接受

2026-09-27，主线依用户“Implement the plan”、遵循已接受spec／realization施工及主调度／验收职责授权，技术接受 `(omne-harness-lite-design-2026-09-15, capability.model-request-runtime, 4)` [全部73条](../../../spec/capabilities/model-request-runtime/v4/contract.md)及[接受摘要](acceptance.json)列出的27资源。最终contract SHA256 `4a31cb8bc98ae5bbb55a28c671ff84a8f86520747de7dd07c180787183651689`，起草整包29输入manifest SHA256 `11ec2435be9ae52f9ccc9f32fc9a745fe7b600b8d0123fd0208a82d26c592e15`。来源为 [late协调三候选](../../proposals/model-request-adaptation/late-coordination.md)及 [D081](../model-late-coordination-direction/decision.md)，精确消费 [D083](../session-log-tail-condition-adoption/decision.md) 已接受SL3；不接续未投影的新workspace产品政策。

保留十三操作、既有身份／参数／费用／失败／阶段、独立函数面和未知opened强门。新增S68～73明确稳定原业务批、同提交尾比较、按实际提交前完整前缀判late、未知原批认回、消费者争用策略与耗尽责任；正常路径仍可unconditional，不能把候选模型的Budget或先验StopOld写成产品默认。S27／S43／S72区分确定本次零写与未知回执，未知不保证仍为M1；读当前选中不认回未知命令，不新增命令键、恰一次、自动重放或回滚。S6／S32／S33／S49本实例待确认不否认可能已耐久的响应／终结，沿权威认回和原重复返回。进展须真实恢复可执行且被调用、合法完整前缀、适用旧写者实际停止及预算内实际提交机会；持有owner或触发收口不保证成功，未满足仍是未完成义务。

独立 architecture-reviewer 初审及修订定向复核无阻断，保持中高置信度及全尾争用、完整读取授权、旧写者协作的代价。独立 spec-reviewer 初审ER1～3阻断、ER4非阻断；模型括号及上述最小正文修复后四项闭合，无新增问题。73条／13个九项操作、17依赖、55项reviewed=false覆盖及6正向形式任务经核对，旧64冻结资源与13继承形式文件不变。初稿／两次修订／差分／检查及主线归因摘要见 [191文件归档](../../proposals/model-request-adaptation/reviews/model-request-runtime-v4-2026-09-27.tar.gz)，SHA256 `d0d7dafb0a9ecc6ba20d0e89ed78067670b4cbc3492ead5904e39ce8e9224e92`，主线全部读回。意见不代替本次接受或实现验收。

独立 [实际形式run](../../evidence/2026-09-27-formal-model-request-settlement/README.md) 原第一轮Fail／exit75保留；第二轮新SANY／3正／6指定负控取得有限Pass。执行的contract为初稿 `27f547…`；最终24形式资源与run2逐字一致，但run2没有执行新版正文或四组新规范向量。StopOld、完整读取、共享身份等为模型前提，不是实际IO保证；无公平活性或任意规模证明。旧RT3形式结果亦不改标签为RT4运行。

旧RT2／RT3、SL2／SL3与所有未受影响数据规范保持冻结字节，旧条目及关系不覆写。本事件登记新版accepted／27冻结资源／17依赖／55未复核covers／6形式任务，推荐或接受不自动升级runner3、transport、runtime源码、消费者或装配。版本正文起草时candidate标签保留原字节，当前状态由本决定与registry明确。

新版runtime提供者投影尚未采用，新增实现binding0。G28生产Run终结认法、G29共同业务codec／完整批及全部旧写者物理停止、G30合法完整读取与权限、G31多值headers继续由原owner交付；继承G1～27未由本次关闭。JSONL D084／D085设计采用不代证这些义务。P2／P4／P5、全部十三操作、完整观测、37模型认证与人的总体签收不由本事件放行。

登记后主线实际internal design／formal=skip退出0（13.895秒）、diff check退出0；472冻结资源逐项hash一致、旧445项不变，实际命令／输出及登记准备顺序修正原件见 [checks.tar.gz](checks.tar.gz)。准备时先写acceptance.json即填登记，随后保全并恢复本次独占修改，补decision.md后再施同一登记；检查及提交只在完整顺序修正后进行，不改规范或忽略失败。
