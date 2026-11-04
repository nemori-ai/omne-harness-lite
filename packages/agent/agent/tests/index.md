# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身、测试的组织
- [public-entry.spec.ts](public-entry.spec.ts)：入口导出名、导入图、清单依赖与 Cordis 路径
- [assembly.spec.ts](assembly.spec.ts)：测试装配的 17 项依赖，以及它交给工厂得到 idle 的 provider（C1）
- [factory.spec.ts](factory.spec.ts)：工厂的四种创建失败与成功的 idle（C1）
- [provider-access.spec.ts](provider-access.spec.ts)：四个面每个公开操作的租户核对与 `access.check`（C2）
- [provider-quiesce.spec.ts](provider-quiesce.spec.ts)：停用：空闲实例 drained 并撤登记、draining 拒绝新的 invoke 与 resume、占槽时 unresolved、操作身份与认回
- [provider-run-failure.spec.ts](provider-run-failure.spec.ts)：运行失败：执行槽改为 failed、报告一次、quiesce 仍答 unresolved，可恢复的失败通过不报告
- [loop-transitions.spec.ts](loop-transitions.spec.ts)：转移表逐行对节点表（C1）
- [loop-evaluator.spec.ts](loop-evaluator.spec.ts)：评估器的决定、种子属性测试与导入图纯性（C1）
- [measure.spec.ts](measure.spec.ts)：测量事件的受理与驱动通过、观察者缺省与抛出
- [loop-invoke.spec.ts](loop-invoke.spec.ts)：一条输入到 ended 的正常路径与骨架的临时简化（C2）
- [loop-terminal.spec.ts](loop-terminal.spec.ts)：完成竞争、原终结查询、非空观察台账、O0 原责任认回与 idle 复用
- [loop-reply-close.spec.ts](loop-reply-close.spec.ts)：I3 同 revision 准入、I4 空批、I8 三种去向与 ordinary limit/partial 边界
- [loop-main-call.spec.ts](loop-main-call.spec.ts)：主调用的一次提交、原身份认回、结果责任、最终失败、部分结果、窄接续与推理回放限制
- [loop-adopted-request.spec.ts](loop-adopted-request.spec.ts)：主用途 M0 写 `adoptedRequest`，它撑过调用收场、工具往返与下一步 I1，只由下一次主用途 M0 替换（FIXED-FACTS F2）
- [loop-intake-prepare.spec.ts](loop-intake-prepare.spec.ts)：I0 完整输入批、新 step 与 I1 顺序准备、W0、真实不能装下和阶段压缩限制
- [loop-admission.spec.ts](loop-admission.spec.ts)：受理幂等、输入冲突、busy、commit-unknown 与 R0 重试路由
- [loop-wait-reconcile.spec.ts](loop-wait-reconcile.spec.ts)：W0 失通知、观察窗口、检查时刻、原操作对账、窄接续的未知保护、依赖重查与严格 Node 清理失败
- [loop-wait.spec.ts](loop-wait.spec.ts)：W0 对 query 的 rejected 视为已定、unknown 保持等待
- [loop-dependency-wait.spec.ts](loop-dependency-wait.spec.ts)：公开驱动在 I1 依赖持续不可用时，每个检查时刻只走一遍，两个检查时刻之间不空转；依赖恢复后下一个检查时刻接续到 ended
- [loop-model-wait.spec.ts](loop-model-wait.spec.ts)：AG-03 先等待再收到回复的一次模型请求：节点提交次数、#1011 读取位置、每次进入等待最多一次 `load`、自身 waiting 事件不唤醒、重读失败不算进度与等待期间的重复 invoke
- [loop-recovery.spec.ts](loop-recovery.spec.ts)：E1/E2 只读认回与挂接撤销、E4 恢复路由、R0 原提交切点的 committed/excluded 接续与 W0 保存等待
- [loop-coordinator.spec.ts](loop-coordinator.spec.ts)：E1 found-existing 正常结束协调
- [canonical.spec.ts](canonical.spec.ts)：输入等价性、元素边界与字节视图
- [loop-port-failures.spec.ts](loop-port-failures.spec.ts)：路径上每个节点的端口失败停在该节点
- [loop-slot.spec.ts](loop-slot.spec.ts)：单执行槽的释放、停止后的占用、observe 与登记投影
- [loop-support.ts](loop-support.ts)：Loop 测试共用的 `LoopFacts` 构造与装配
- [factory-support.ts](factory-support.ts)：工厂测试共用的选项、调用记录与登记句柄替身
- [fixtures.spec.ts](fixtures.spec.ts)：每个替身的编排接口
- [memory-journal.spec.ts](memory-journal.spec.ts)：内存 Journal 的同形清单各条、绑定的 coordination 模式、`tryFinish` 的五类 blocked 次序与 unknown 项的 unavailable
- [journal-core-conformance.spec.ts](journal-core-conformance.spec.ts)：内存 Journal 运行 agent-contract `./testing` 的 Journal 核心一致性套件（Q1、Q1b、Q3、Q11、Q13、R2、P、Ja、Rh，以及终结的候选投影、清单、blocked 次序、取消路线与六个结算变体）；基线无失败用例，三个只破坏一条规则的装饰器各使其规则所在的具名用例变红
- [journal-replay.spec.ts](journal-replay.spec.ts)：内存 Journal 运行 agent-contract `./testing` 的轨迹回放（AG-23）：收尾协议模型导出的轨迹逐步核对答复与状态投影，三条负控的违规轨迹须在最后一步被报告
- [host-record.spec-d.ts](host-record.spec-d.ts)：内存 Journal 的本地 `TestHostRecord` 与 `SettlementQualification` 与一致性套件的同名类型互相可赋值
- [journal-support.ts](journal-support.ts)：测试共用的契约值与步骤
- [module-graph.ts](module-graph.ts)：导入图遍历
- [fixtures/](fixtures/index.md)：测试固定输入
- [journal-received.spec.ts](journal-received.spec.ts)：同源提供者执行 required 接收共同提交套件
- [model-receiver.spec.ts](model-receiver.spec.ts)：资格、原交付校验、未知、容量、账目和重装配
- [loop-tools.spec.ts](loop-tools.spec.ts)：Tool 动作分发先保存原请求与意图再交给 Tool；收到的结果作为工具消息准入并发出下一次 Model 请求；并发调用在各自的槽里运行并按动作顺序准入消息，`toolConcurrency` 满时等待空位；关联未知的调用保留意图并重发同一请求；整批被拒时每个动作各有拒绝消息；准入答 unavailable、准入端口答 denied 或 unavailable 的 Failure、Tool 请求来源缺席或在 describe、prepare 答 denied 或 unavailable 时，整批被拒，后续动作不再调用 admit，先前已允许的动作也不发出，Run 继续；源 Ja 的调用方：声明了 `message` 时工具消息交给 message 参加者，没有声明时调用方为 none，主回复始终为 none。夹具 [fixtures/tool-call.ts](fixtures/tool-call.ts)
- [journal-ought-guards.spec.ts](journal-ought-guards.spec.ts)：动作状态只存引用的两项守卫（R2-D292、R2-D294）。20 步工具用例下，一步之后 `load` 返回的字节与步数无关；执行保存的每份材料都被 Journal 的事实引用，没有孤立材料。两项都做过负控
- [loop-run-steps.spec.ts](loop-run-steps.spec.ts)：执行步数上限 `maxRunSteps`（R2-D221 的 M2 临时兜底）。脚本化 Model 每一步都调同一个工具：上限之内由 Model 收尾时正常完成；走满上限时不开新一步，执行以 kind 为 `guard` 的失败候选结束；配置缺省时用 50。每条都配负控
- [loop-consumption-scope.spec.ts](loop-consumption-scope.spec.ts)：协调器铸造的消费标识带 execution：两个 execution 的同一步是两个消费，后一个 Run 的调用登记不与前一个冲突
- [loop-admission-pages.spec.ts](loop-admission-pages.spec.ts)：回复准入读取（Agent SPEC「回复准入的已核实前缀」）的纯部分：选下界的规则、普通提交携带的位置，以及已核实前缀前移之前对每一页的核对，每个用例只破坏一页的一个条件
- [loop-admission-read.spec.ts](loop-admission-read.spec.ts)：E2 对回复准入事实的读取：协调器选的下界、进程内前缀、普通提交携带的读位置、提交时缺依据的答复进入 W0、缺依据时对原出处重读一次，以及从已保存前缀恢复读取。内存 Journal 不耐久，这里不证明耐久提供者
- [provider-control.spec.ts](provider-control.spec.ts)：执行控制与 Tool 调用控制的受理，夹具 [fixtures/control-assembly.ts](fixtures/control-assembly.ts)：取消之后保留在途结果且不发出其中的 Tool 建议；Model 准入之前取消；同一操作重试返回原回执；他租户在保存与传播之前被拒；未知受理保留原操作；Tool 控制只中断被点名的调用，未知答复先查询且从不重发，引用丢失时保持未决；取消与关联、意图提交的先后；中断之后已交付的内容与账目仍可读
- [tool-receiver.spec.ts](tool-receiver.spec.ts)：Tool 结果接收器的符合性套件，以及：解除挂接与接收器重装配之后迟到的结果按原宿主状态接收；确定失败不在共同发布之前报告 saved；等待取消之后实际在途的工作保留并只保存一次；已保存键也重核当前资格；陌生引用在查询关联之前被拒；同一键仍在写入时的第二次推送为 unknown 且不再提交；账目修订各自保留，冲突内容被检出
- [journal-tool-control.spec.ts](journal-tool-control.spec.ts)：内存 Journal 的控制与 Tool 操作：保留的调用故障，待决控制操作的保管，待决与已提交认回的共同前置核对（参加者支持、保管、观察资格），Tool 控制的关联（producer 种类先于文本比较、重复的规范身份、检查点移除之后认回），Tool 操作挂接的输入核对、冲突与阶段推进，以及被破坏的保留状态
