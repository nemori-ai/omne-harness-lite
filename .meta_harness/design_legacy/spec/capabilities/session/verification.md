# 长期会话、输入队列与到达账本验证范围

本主题没有迁入独立 Session 模型；入站与队列性质由 lifecycle/RunDriver 联合模型部分覆盖。

正文为条款级重基候选，旧执行结果、review、publication 与实现接受不进入新 baseline。
本轮只通过设计树 internal gate、来源哈希和依赖映射；候选接受、真实组合测试、形式工具运行
和 release evidence 仍是独立门。provider 事实见本主题入口所列映射。

E 联合边界修订要求 SE-03/10 的 SessionProjection 对 M attempt state 给出正文、明确无正文与未决，
并保持授权投影批水位。现有 Session 模型/实现不覆盖
unknown revision、retention gap、terminal-before-listener 或客户端 reducer，L reviewer 须重审。
round-2 另要求验证 changes/snapshot disposition payload 与 history 同批原子安装；用户 hold 与 RN-05
派生 scheduler barrier 分离；A 不占位 stopping+B running 时不撤 B，但阻止 supplement/C；settled unknown
exposure 不出门，错代/迟到/恢复未认回证据不清 barrier。

新结构链将 state 固定为 tagged union：durable business unknown 属于 settled_without_message，
closing/outcome_unresolved 只属于 in_progress，且无 terminal revision 也经 changes 完整交付；snapshot 不接收
guessed identity，只返回授权完整集合与 collection coverage。迟到 snapshot 必须以 replacementToken/
visibility/asOf CAS 拒绝回退。以上仍待 L/M/E 联合复评与形式证据；`9a58ae2` 已拒绝。

DR/CC runtime revision 协调另需核查同流三事实修订仅 +1，按 canonical StreamRef 跨流顺序与
append-local order 在在线/恢复生成同一 eventId；prepare 临时 identity/相对引用只在 commit 解析。
受信装配清单的 Session/Run/M required roots 必须同完整 watermark、同有效 generation 原子安装；缺一、
迟到旧代、旧 ExactUse/资源责任未核实或 blocked completion 未有新代 baselineRef 时 fail closed，
不得据单一 Session fold 发布队列/Run 或自动重试外部 attempt。

验证 `changes(after,to)` 的 `coveredThrough ≤ to`、`to=latest` 调用时固定 resolvedTo、hidden-only 无帧覆盖、closing.pending 的完整状态更新，以及 history 分页不可切开同一 commit batch；单批超过页限制时独占页，授权版本变动使 page token 失效。
