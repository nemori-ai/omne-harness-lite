# Clock 公共集成承诺

本包继续拥有 offer-expiry 的公开词汇、纯函数、Clock 形状与精确 Schema 资源。
`./cordis` 增加 ClockService、唯一 CLOCK_SERVICE 和 Context 增补；根不加载此绑定。
抽象服务定义异步 Clock.now，并允许耐久提供者提供 checkpoint。它不选择墙钟、持久租约或恢复算法。

Clock.now 返回 Promise，结果为 Instant 或 unavailable。消费者必须等待结果。业务消费者仍按所采用的 offer-expiry 精确版本 S-16/S-17，
保持同一时间源、必要不可用拒绝及其自身操作的优先次序。服务存在不证明时钟可用，服务键也不是时间轴或租户身份。
declined 只用于已采用接收方拒绝的组织邀请与隶属请求；不倒灌到复制通知／分享邀请。不改变根纯函数与 Schema URI。

await 可以让停止、取消和代际切换先完成。消费者必须在时间取得后、取得新资源或开始新副作用前，复核其原准入条件。
已经确认的终局责任不得因新增等待而丢弃。纯时间值、比较函数和持续时长计算保持同步。

可选 checkpoint 返回已确认持久底线 writtenAt 与 upperBound，或 unavailable。两者都是 Instant，且 writtenAt ≤ upperBound。
提供者保证此前成功返回的时刻不超过 upperBound。接收者在恢复发布任何时刻前，必须持久接纳该底线，且不得降低更高的已有底线。
不提供 checkpoint 的 Clock 仍可用于普通取时；需要耐久备份的消费者必须明确拒绝缺少该能力的提供者。

本次不把 v2 的终结规则倒灌到仍消费 v1 的模块，不改变根纯函数与 Schema URI。
