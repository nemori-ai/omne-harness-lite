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

## 2026-09-28 追加：core 纯主体入口技术采用

主线依本决定同一用户实施与技术验收委托，现技术采用 [core/loop-extension v7 纯主体增补](../../../realization/packages/core/loop-extension/v7-subject-judgment-design.md)，精确 SHA256 `53573d393e7fa61afdeb7d6d5abe3aaac93e2703626ced3214fda3835e7fd3a5`。依据为既有[模型适配提案](../../proposals/model-request-adaptation/design.md)及该提案[本次独立窄评与处置](../../proposals/model-request-adaptation/review.md)。实现反例是 runner 候选885ac84f的composeEffect为复用完整判定而制造固定执行壳；选定两完整公共纯判断入口复用同一个私有判定流水线，避免复制规则或制造执行事实。

释放 `judgePositionedSubject`、`judgeConclusionForSubject` 与 `ConclusionSubjectInputs` 公共纯面，以及 runner 删除固定Run/log/environment/attempt并直接消费它们。仅抽取现有core检查；不迁移LC6 S-14生产者/runner batch/result来源关联责任，不修改LC6规范/Schema，原完整judgeInput/judgeConclusion仍保留真实完整输入前提及既有错误顺序。新增绑定0，不新增Cordis服务、运行身份或存储。精确旧规范依赖不自动升级，故本次无registry契约冻结变化。

独立architecture-reviewer完成原稿及最终窄复核，无该范围剩余阻断；主线核对最终SHA、公共签名和责任范围后接受施工，候选正文的原“未采用”保留为起草时事实，以此追加限定当前采用。两入口及runner消费者必须完成SV-1～6、既有回归、严格类型、真实制品和双语示例，才能分别记实现与验证完成。完整runner、Run来源及G28等此前保留项仍未关闭。

## 2026-09-29 追加：完整公共 runPass 执行面技术采用

主线依同一用户持续实施、调度与技术验收委托，技术采用 [v6 公共 runPass 增补](../../../realization/packages/agent-loop/loop-extension-runner/v6-run-pass-design.md)，SHA256 `0ca2f23a21242d7d118ed978df27d86d11726b5fcd11377b5fb8fa8adf06240a`，及其明确继承的 v5 revision3 公共执行、日志适配与长期任务 owner 责任（原 SHA 不变）。依据为原模型适配提案、已接受 Runner5/LC6 和[本次独立窄复核](../../proposals/model-request-adaptation/review.md)。原 B1 已闭合，无该范围剩余阻断。

本次扩大先前五纯构件采用，释放完整 `runPass` 及其公共类型、受控执行/等待/日志端口、必要独立任务 owner 与真实 SL3 组合实现；包括 ask/replay、普通错误与控制偏离区分、竞争胜者、unknown 留存、取消/句柄失效、嵌套提醒和同 prefix 来源校验，不能只交一个正常 noRun 分支。实现复用既有 core 判定、五纯构件与 runtime 消息键/codec；缺实际来源具名失败，不以布尔通行证或隐藏全局服务替代端口。

不采用为已完成：Cordis dispatch/replay 服务装配、P-5 真实贡献登记、G3 runtime 同 prefix 接线、G5 生产日志宿主可信停止/恢复、G28 生产 Run 终结来源和卡片等待 owner。公共函数可在明确受控前提下验证有 Run 的分支，但 noRun after_model_call 及 producer=model/tool 的 before_persist_message 仍 invalidInput；不能据函数测试签收真实治理 Run。MR9/RT10 usage 候选不是此增量的依赖，不预先消费。

施工与技术签收按 V6-1～9 及仍适用 V5 义务：顺序确认、ask 四世界、多轮重演/偏离锁存、真实 JSONL 同键竞争/重开认回、未知保留与可信停止前不重求、共享提醒冲突、实际取消及迟到结果归属、严格公共类型、制品消费者和双语 README。生产接线与条件函数证据分别报告。新增绑定 0；此采用不是实现或完整 model runtime 纵线交付声明。
