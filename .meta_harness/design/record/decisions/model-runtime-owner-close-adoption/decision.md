# D-102：统一 runtime 组合的收口实施面采用

2026-09-28，主线依用户持续实施、主调度及技术验收委托，技术采用 [v10 owner 装配增补](../../../realization/packages/model/model-request-runtime/v10-owner-assembly-design.md) 的“统一组合的全部调用收口”段，精确 SHA256 `9237c1744b3c3bec233274f50ad1ae0a7c039ca842880e30c765f57f95637be7`。其余已闭合公共组合、短 reservation、P-2 宿主预留 owner、诊断形状沿 [D-100](../model-runtime-current-generation-adoption/decision.md) 已采用 v7 与 [D-087](../model-runtime-v4-projection-adoption/decision.md)；本次不创造领域操作或规范版本，沿[适配提案](../../proposals/model-request-adaptation/design.md)及其中追加的[独立评审记录](../../proposals/model-request-adaptation/review.md)。

采用 store.close 关闭新准入、停止全部容器、保留未释放集合，以及 createModelRuntime 的统一在途登记与组合 close。只有实际全体释放才返回 released；unavailable 不缓存为永久终态，不清未知责任或先放 lease。并发关闭共用正在进行的尝试。组合 close 指本实例撤除；宿主仅 stopping、服务仍存活时，RT8 S36 对 interrupt 等操作照常的原规则不变。

同时明确现有 RT8 S27／SL3 S22、S35 的适用范围：无键 selection 命令不承诺恰一次认回。回执未知不能凭当前 route 推认原命令成功；原结果继续 unavailable，禁止自动重放。原追加及其相关回调均 actual stopped 后可释放其物理 registration，不给它制造待补 ModelResponse 或永久资源义务。仍活跃的写者必须继续持有。该解释不解除日志提供者自身 IO／恢复责任，也不放宽有唯一业务责任的 model invocation／完整批认回义务。

独立 architecture-reviewer 复评对新增收口段无阻断；对 selection 的上述区分给出条款依据和迟到覆盖反例：危险来自尚未停止的旧写者，而非已停止后的未知命令结果。主线采纳此判断。评审未运行产品测试，不等于实施验收。

原 B1（L1 永久撤除后经 L2 认回，原调用 owner 仍无法解除的交接）仍未闭合，**不在本次采用范围**。sentAt 恢复表示、S61/S62 当前公共端口、withRun 与 runner 真实结论另按其 owner 补齐。这里接受统一组合的独立施工增量，不声称十三操作、资源收口或真实恢复已全部交付；须执行 v10 所列的关闭竞争、部分失败、唯一释放和留责验收。
