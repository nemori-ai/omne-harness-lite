# Clock 公共集成承诺

本包继续拥有 offer-expiry 的公开词汇、纯函数、Clock 形状与精确 Schema 资源。
`./cordis` 增加 ClockService、唯一 CLOCK_SERVICE 和 Context 增补；根不加载此绑定。
抽象服务只定义 Clock.now，不选择墙钟、持久租约或恢复算法。

Clock.now 返回 Instant 或 unavailable。业务消费者仍按所采用的 offer-expiry 精确版本 S-16/S-17，
保持同一时间源、必要不可用拒绝及其自身操作的优先次序。服务存在不证明时钟可用，服务键也不是时间轴或租户身份。
本次不把 v2 的终结规则倒灌到仍消费 v1 的模块，不改变根纯函数与 Schema URI。

时钟资源、回拨检测及重启保证归实际提供者与装配。换代和撤除的旧引用由提供者按原生命周期处置。
本包没有独立的计时资源或自运行插件，也不新增 core/clock 能力。

提供者须验证不可用、回拨、恢复与撤除；公共分面须通过源码、声明、运行装载及打包消费验证。

## 依据及未迁责任

Clock 与纯值的原承诺继续按[旧节点设计](../../../.meta_harness/design/realization/packages/core/offer-expiry/design.md)采用的精确版本执行。
本页只接续本批公开集成承诺；不据本页退役其余旧正文。
集成边界依据 D-114，承诺归属依据 D-115。
