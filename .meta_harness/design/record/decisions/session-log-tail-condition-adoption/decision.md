# D-083：采用 session-log v3 尾条件追加及恢复边界

2026-09-27，主线依据用户“Implement the plan”、实现遵循已接受 spec／realization 及主调度／验收职责委托，技术接受 [capability.session-log/v3](../../../spec/capabilities/session-log/v3/contract.md) 全部37条款及24项版本资源。最终 contract SHA256 `f327f1289e1d6c539dd959e8862b382869e3d303cf984b6a773fdd6a00e4bd26`，精确逐资源摘要由 [acceptance.json](acceptance.json)登记。

采用依据为 [D-081](../model-late-coordination-direction/decision.md) 已选的候选 B；[独立语义及表达评审与修订记录](../../proposals/model-request-adaptation/review.md#2026-09-27-session-log-v3-规格整包独立评审)完成两轮核对。初稿表达阻断 SL3-ER1 将业务批认回扩大到普通无键调用，修订后 ER1及非阻断ER2/3均闭合；架构原无阻断结论保持。没有新增产品裁决，不将 reviewer 意见当作本次接受。

## 接受和取代范围

追加保持三操作及不透明载荷，`append` 增加必填 condition：显式 unconditional，或 tailEquals 的非负精确 tail。后者由实际追加提交点同时核尾并原子写整批；tailChanged 确认本次整批零写，不初始化租户／分配位置。表示、租户、栅栏、判重、尾条件的优先级明确。没有第四操作、业务回调或第二份 Run 真相。

所有消费者区分本次零写与先前未知。要求业务唯一性的结算者按稳定身份认回原完整批、保留先到者原值、在合法完整前缀和停止前提成立后重构未提交批；普通无键条件调用仍合法，不被追加身份或键要求，也没有无键未知结果可自动幂等重试的承诺。日志不拥有 Run 终结认法、late、批次业务键或重试／退避政策。

该新坐标供消费者显式采用，**旧SL2冻结资源和全部旧精确消费关系保持**。RT3规范依赖SL2，不能只改 provider或推荐版接线；新runtime消费规范、JSONL／runtime投影及全部实际响应写方须分别审阅和采用。condition自身不要求messages4／response4／call-accounts2升版；多值头G2-6由原表示owner另行处理。

## 证据和仍然开放的责任

[有限形式run1](../../evidence/2026-09-27-formal-session-log-v3/README.md)实际执行2SANY、3正TLC、15指定负控／可达，正distinct2784／17539／17539。执行绑定初稿f708正文；两TLA、十八cfg及formal README在最终包逐字未变，复评确认其限定性质范围继续适用。不是对最终新正文重跑，也不把新增无键普通调用实例扩大为TailSettlement完整覆盖。

真实共同文件提交／持久化／权威恢复、跨进程互斥、旧writer实际停止、合法完整前缀读权、生产Run终结认法、稳定共同键和完整批认回、全尾争用策略及耗尽责任、runtime／回复／runner实际版本传播仍未完成。本次提供者新增绑定0，不关闭B1 withRun、unknown opened、完整Agent Loop或总体交付；人的总体验收仍未发生。

全尾无关争用、合法读权及迁移成本仍为候选B的强反对理由；若后续可复核结果否定提交机会、合法前缀或三操作恢复承接，按D081改票条件重比原候选，不削弱准确late、整批唯一或实际停止保证。
