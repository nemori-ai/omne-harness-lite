# capability.run-driver v1 的符合性场景

本表是规范场景，不是已执行实现测试；模型覆盖见[验证说明](../verification.md)。

| 场景 | 初始条件、动作与可观察结果 | 规则 |
|---|---|---|
| S01 文本批开 Run | 队首两条连续文本；takeBatch 建 Run、占位、epoch 同提交；首个 Step 切点恰为该批；后到文本进入下一批 | RD-04/06；SR-06 |
| S02 trigger 分隔 | 队列为文本、trigger、文本；takeBatch 只取首段；takeTrigger 一项一 Run；trigger 来源失权时结算 closed 不跳过 | RD-04；SR-06/18 |
| S03 收束等待前台 | 批内一个前台执行调用；Step 不收束；detach 确认后收束并带 deferred_receipt 开下一 Step | RD-09/10 |
| S04 单一消费路径 | 调用在工具权威已终态但 arrival 未裁决；视图为 settling 阻止收束；裁决为 continuation 后收束并在下一 Step 呈现恰一次 | RD-09；SR-16/17 |
| S05 收束后批准 | 待审批调用的 Step 已收束、Run waiting_human；批准到达 → 消费批准并 start，不开新 Step；结算后作为接续开 Step | RD-11；SR-09 |
| S06 批准与接续同时就绪 | 审批型与问答型答复同时 classified；先消费批准，再以问答答复开 Step | RD-06/11 |
| S07 预算门 | 预留被拒于模型准入/调用过门/批准消费三处之一；Run waiting_gate 记 (gateRef, gateRet)；gate_restored 到达后返回原点重做准入；resume 复核门后重取 | RD-08/09/11/12；SR-08 |
| S08 依赖门 | 开 Step 所需绑定不可用；waiting_gate(dependency, E1)；调用级绑定撤回则结算 unavailable 不等待 | RD-06；TL-06 |
| S09 Yield 与重取 | 运行时退役且无前台在途工作；epoch 封闭、占位保留、Run 状态不变；调度不能开新 Run，只能以新 epoch 重取并从投影位置继续 | RD-14；SR-18 |
| S10 强制退役 | 热宽限到期仍有前台执行；按 interrupt 收口，记 yield_forced，释放占位 | RD-14 |
| S11 终态晚到 | Run completed 后后台调用结算；arrival 裁决为 queue 的 trigger，开新 Run；cancelled 的 Run 同类结算 closed(cancelled_run)，stopping 的 closed(isolated) | SR-17/20；RD-15 |
| S12 结算与接续同提交 | Run failed 时存在未消费 continuation；同一提交转为 trigger 并记 converted；崩溃于其间恢复后仍恰一次 | SR-20；RD-16 |
| S13 恢复不重发 | attempt 已准入未耐久 dispatched 时崩溃；恢复判定未发出，旧 attempt cancelled、新 attempt 新准入；已耐久 dispatched 时不重发，查询或按政策新 attempt 并保留费用暴露 | RD-16；MC-04 |
| S14 start 窗口 | 准入后 owner 未回执 start 时崩溃；同 attemptId inspect；owner 无此 attempt 且许可有效则同 ID 重发，不产生第二个 attempt | RD-16；TL-08 |
| S15 未裁决 arrival | 受理后裁决前崩溃且 Session 空闲；提供者启动扫描先裁决；驱动器重取在裁决完成后才进入 | RD-04；SR-21 |
| S16 系统复合打断 | 连接器条件触发且配置为 interrupt_then_run；旧 Run 按 SR-11 收口，待批准调用 cancelled_before_execution；trigger 项排队不获优先通道 | SR-11/17 |
| S17 命令 Run | 队首有序命令；命令处理者结算 success → completed；unknown 保留占位可见；上下文装载型命令随文本项进入模型 | RD-05；SR-07 |
| S18 context 不唤醒 | Run waiting_human 时被动订阅内容到达；只推进水位，不唤醒；答复到达开 Step 时按水位可见且去重 | SR-16/19 |
| S19 暂行一次接续 | Run 运行中、Step 未收束时暂行决定回传声明一次接续；continuation(refs = run)，Step 收束判定时作为就绪接续开 Step，不打断当前 Step | SR-17 |
| S20 可改写站点 | 插件尝试改写工具参数、阻断装配或阻止停止；均被拒；守卫只能收紧 | RD-17 |
