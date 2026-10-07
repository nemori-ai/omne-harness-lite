# Agent Loop 候选薄规格

未来拥有者`packages/core/agent-loop`。定义来自PF-012，现有拓展runner、模型／工具行为继续由其原拥有者维护。module模板、纯root，无新Service／Context类型。

## 公开函数形状

`nextStep({facts, currentInputs})`：完整固定日志投影、当前权限/装配/context/原调用对账结果，返回闭合决定：idle、wait(originalPosition)、adoptInputs、invokeModel(preparation)、executeActions(batch)、compact、runExtensions(position)、finish(terminal/reason)、blocked(义务与原因)；表示非法返回invalidInput，必需来源缺失返回unavailable，不把这两支当正常idle。
每个决定含expectedSourceToken、Run／attempt或明确无Run、原消费位置与必要采用证据；同输入唯一，不将clock/random/网络隐含为输入。
`driveStep({decision, permit, ports, signal})`：显式注入SessionCoordination、消息投影、model/tool/extension、context能力函数；只对已有attempt的决定执行，必须显式携最新AttemptPermit。返回committed(newToken)、waiting(originalPosition)、retryFromFacts、handedBack(originalCalls)或blocked(义务/原因)，非法决定／permit表示返回invalidInput。已知端口缺席／不准入／当前无法核实返回blocked并保原义务，未知内部缺陷按AL7上抛。不直接暴露任意append／SQL／ctx。
`releaseAttempt(owner)`：先撤本拥有者准入、取消本地await并交還原调用句柄，await本地owned work完成，返回released或pending(未交还义务)，非法owner引用返回invalidInput；重复认回同一释放结果。不cancel模型/工具实际执行。

首次启动由Session协调器按[启动与推进表](../session-runtime/SPEC.md#启动与推进授权)执行startRun／startAttempt，提交后才将permit交给Loop。没有可运行attempt的合法nextStep输入返回idle(noRunnableAttempt)，调用者不进入driveStep；强杀／零Agent治理也归协调者，不把CoordinationAuthority混成Agent permit。

## 类型之外的行为

AL1：nextStep纯且不落事实；driveStep执行明确一段，结果可能改变f时才提交状态点。一次段内中断仍指原段，不重复原调用/决策。
AL2：attempt开始、消息落盘、压缩、调模型、执行动作和落终态按PF012状态点及十一个拓展位置；不另开“组装中间”挂点。attempt事实不成为模型提醒。
AL3：拓展runner保持真实官方准入／效果token／完整等待批次；同位置同一次经过仅一轮，日志变化重组装但不无限重复hook。默认放行件的安全属性不能因可插拔而被删除。
AL4：模型调用等待身份先持久准备，经真实原子准入才执行；模型response原文只按既有整份否决／派生规则处置，不改原件。工具建议需当前装配／权限重新核对，已发调用输入不变。
AL5：模型/工具句柄寿命与实际执行分开。旧attempt不得用driveStep继续发起或承接，原执行结果和费用仍由其拥有者保存。
AL6：等待未满足可释放Agent；恢复对账后接续原位置，不重调/重出卡。不可用与没有执行分开。强杀终态由治理者落，不靠本Agent。
AL7：内部未知异常上抛到Session fault owner并保存恢复责任；signal取消只控制本段资源，原调用取消必须显式产品目标。

## 验证

固定输入唯一结果、段内断点、十一个位置、等待回放、old/new attempt、装配换代旧建议、模型reply否决与来源配对、独立调用接续。首卡只实现无需工具的正常路径，不让缺失其他分支被默认成功吞掉；未支持决定返回明确blocked而非伪造完成。
