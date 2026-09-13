# 规范场景与验证映射

这是本次包级候选的验收面。[契约](contract.md) 的 LA-* 是引用对象；上游测试路径均
相对于[固定源码基线](../source-map.md)。`tests/` 在本表指 `packages/core/agent/tests/`。
执行结果及模型边界见[验证记录](../evidence/validation.md)，测试名称不是执行证据。

| 场景 | 初始条件 → 动作 → 可观察结果 | 规则和覆盖 |
|---|---|---|
| S01 身份/碰撞 | 空表登记 Agent A；不匹配 Session ID 的登记失败。同 ID B 不能登记；A 保持原样。 | LA-R1；agent.spec.ts；模型 Identity/Unique 表达已经校验后的状态，未建模错误输入 |
| S02 私有准备与登记可见 | enter A 后尚未 announce；get/list 已能读到 A。此时 detach，条目消失但无 created/disposed。 | LA-R1/R4；agent.spec.ts；Conservation/PairedDisposal |
| S03 重入公告和撤销 | created 监听器中再次 announce A 被拒绝；请求 detach 后，同一同步分发中后续被调用的监听器仍读到 A。退出后条目消失、disposed 一次。 | LA-R2/R3；agent.spec.ts；DispatchVisibility/DeferredDetach；提前撤销变异应失败 |
| S04 部分公告异常 | 第一监听器已观察 A，第二个同步抛错。直接 announce 传播错误且仍登记（无 detach 请求时）；register 组合则回滚并配对 disposed，不能抹掉第一次观察。 | LA-R2/R4；模型 EndAnnounce(throws) 不自动删除；agent.spec.ts 验证 register 组合，直接 announce 错误路径据源码，尚无独立运行场景 |
| S05 监听失败分类 | created 返回拒绝 Promise；另设多个 disposed 监听器分别同步抛错、异步拒绝和成功。创建异步拒绝不回滚；释放报告错误后仍通知成功监听器。 | LA-R2/R4；agent.spec.ts；未将异步错误处理建入 TLA+ |
| S06 旧能力与同 ID 新实例 | A 释放后登记同 ID B；反复调用 A 的 detach，B 仍可见。list 顺序按 B 的新登记位置计算。 | LA-R4/R5；agent.spec.ts；Conservation/RegistrationOrder；按 ID 删除变异应失败 |
| S07 三种归属分离 | 子项显式 owner 为 A，调用作用域为 C，Session 持久父系为 D；isOwnedBy 只匹配 A，效果由 C 拥有，roots 不按 D 判定。 | LA-R5/F2；agent.spec.ts 验证 owner 与 caller 分离；完整 Session 工厂组合待后续 |
| S08 工厂热替换 | 没有 factory 时 create/resume 失败；绑定 F 后第二个绑定失败；调用者 C 得到按 C 追踪的委派。F 的 owner 释放后可绑定 G。 | LA-F1/F2；agent.spec.ts；未建模 factory 状态 |
| S09 归因隔离与清空 | 两个并行链分别设置 A/B；A 内嵌清空后恢复 A。同步抛错或 Promise 拒绝不泄漏到外层，返回对象身份保留。 | LA-I1/I2；agent-initiator.spec.ts；上下文传播未建模 |
| S10 关闭与排空 | 一条非卸载链仍 pending 时触发服务卸载；新边界被拒绝，旧链可读归因；其完成后发起者能力 disposed，保留引用的 currentInitiator/requireInitiator 失败。不能推导 get/list 等读取失效。 | LA-I3；agent-initiator.spec.ts；Accounting/AdmissionClosed/DrainedBeforeDisposed |
| S11 自卸载及独立工作 | 嵌套边界返回祖先 owner 的卸载 Promise，另有独立 pending 链；仅排除自卸载祖先链，继续等待独立链，避免自等待。 | LA-I3；agent-initiator.spec.ts；条件活性 ConditionalDrain；提前失效变异应失败 |
| S12 跟踪边界 | 跨 realm 真 Promise 仍被等待；覆盖 then 不影响原生观察；species 阻止观察时原返回仍保持。普通 thenable/游离工作不据此取得排空保证。 | LA-I2；agent-initiator.spec.ts 覆盖前三项，后两项根据实现边界；未声称保证异常 Promise 完成 |
| S13 路由/主体 | 默认 carrier 下发送 Agent A 事件，payload 伪带 B，接收主体仍为 A；emit 错误隔离，serial 按匹配链分发。自带不匹配 carrier 不在保证前提内。 | LA-E1；agent.spec.ts；waterfall 属于 Cordis 依赖语义，未单独重测 |
| S14 装配与请求之间切换模型 | 单个串行链装配 A 完成后，将 current 替换为 B；该次请求仍采用 A，下次装配采用 B。 | LA-M1；model-selection.spec.ts 实际执行此时序；装配 await 中替换对象的捕获行为、原地修改及另一装配覆盖 assembled 的风险仅据源码分析，未执行额外场景 |
| S15 路由通知 | 已有请求头后变更 provider/model 可提示；首次、同路由、只变 effort、拒绝、取消或规定的空决策不提示；撤销助手后不再干预。 | LA-M1；model-selection.spec.ts；不覆盖 OpenRouter/模型服务 |
| S16 工作核算 | 有 step 的结束、claim 后非 completed 结束形成核算边界；空 completed 不覆盖先前边界。取消移除 pending 留 droppedUnrun，替换不留，后续核算吸收标记。 | LA-W1；consumed-work.spec.ts；不覆盖日志规范化/持久性 |
| S17 状态违规检测 | A 连续报告 running 两次，已挂载 invariant 插件时报错；A/B 的初次同状态不互相冲突。 | LA-S1；invariant.spec.ts；检测器测试不证明 Loop 完整状态机 |
| S18 动态 lookup | typert 在时按 Session ID 查到当前 Agent/ctx，撤除后贡献消失；重新注册同 ID 是新的活体引用。该机制不校验租户。 | LA-T1；agent.spec.ts 验证动态贡献及撤除；重新解析边界据源码 |
| S19 后缀边界不完整 | 输入只有 claim splice 和非 completed 的 turn/end，没有此前 turn/start，也没有 step；fold 不把 claim 归属该 turn，结果不产生核算边界。 | LA-W1；consumed-work.spec.ts 的 credits a claim with no open turn to no turn at all；完整结果要求调用者提供覆盖边界的输入 |

端口的完整 Loop 排空、Session 持久提交与恢复、租户授权、模型请求、工具和
interrupt_then_run 均没有在本轮执行符合性验收。未来实施不能把上表原语测试代替这些组合测试。
