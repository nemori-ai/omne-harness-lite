# D-106：runner 当前纯构件实施采用

2026-09-28，主线依用户持续实施、主调度与技术验收委托，部分技术采用 [runner v5 revision3](../../../realization/packages/agent-loop/loop-extension-runner/v5-current-design.md)，精确 SHA256 `1a85cfa993a42dc721e39a68ce1492e474d1be96c25067a16561fa1975db7f13`。来源接续[模型适配提案](../../proposals/model-request-adaptation/design.md)、[独立评审及处置](../../proposals/model-request-adaptation/review.md)，承载 Runner5/LC6 的现行接受及 D-076 原节点责任；不新增能力或业务政策。

## 采用范围

立即释放 `packages/agent-loop/loop-extension-runner` 中的 `passKeys`、`prepareRunnerConclusion`、`inspectRunnerConclusion`、`readRunnerRetryConclusions`、`composeEffect(initial, conclusions)` 独立纯构件。采用当前 runner/5 完整 Conclusion wrapper、同提交的 modelCallId／提醒副本、共享 mrr/3 MessageId 协议、按同一完整前缀读取的有序且保留重复值的 retry 历史。复用 core/loop-extension 当前公开 LC6 判定与处置表，不复制规范或存储权威。

本段显式消费 LC6、MS6、SL3 及 runtime 当前公共 codec／prefix 类型；规范精确依赖不被自动升级。v5输入表中的RT7→RT9、MR7→MR8、SL2→SL3差异按该节有限消费点核对；MR8 nullable恢复Timing不进入此纯结论含义。没有可序列化验证通行证或假Run。非before_persist_message的结论壳仍要求真实run/attempt；纯fixture须明确受控前提，不声称生产Run来源。

独立 architecture-reviewer 与 spec-reviewer 分别完成revision1、2及3窄复核。原 `composeEffect` 缺原主体、noRun after_model_call违反LC6，以及G5将合法竞争胜者误当不一致的反例均已在精确稿修正。两评审在本次范围无剩余阻断；均未执行产品或形式验证。主线逐字核三份交接SHA后技术采用上述纯构件，不把评审通过当实现已完成。

## 保留范围与消费者

完整 `runPass`、Cordis dispatch/replay、P-5贡献、G3失败主体同prefix实际接线、G5日志实际宿主／可信停止恢复、G28生产Run终结认法不因本次采用完成。G3/G5候选端口可供对应owner接续，但本次不授权用替身来源签收真实组合，也不把旧D-076接口直接冒作当前服务。纯构件是完整交付的前置增量，不改变最终十三操作与37模型双路径认证范围。

新包须有公开入口、严格类型、build/typecheck/test、README与README_ZH及可运行示例。验收至少覆盖键编码碰撞及非法输入、完整值/壳关联、MessageId冲突、非法runner标记、完整前缀与有序重复结论、空链/observed原主体、rewrite/select_model和控制效果；程序不可获取时钟、随机、网络或隐藏存储。消费者跨包仅用公开入口。无旧格式兼容分流。

新增bindings0。源码实施、真实日志往返、制品消费者与所有V5义务仍按实际运行分别核对；此记录不宣布节点完整实现或服务验收通过。
