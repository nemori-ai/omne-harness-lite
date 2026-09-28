# 精确传输取得结果的投影补正

2026-09-28，revision 1，candidate。持续消费者为 runtime 的 openCall 与既有调用重承载、demo 的 Cordis transport lease 装配。失效事件是取得端口或 RT9 S-53 变更。本补充仅纠正 [v7 共享端口](v7-current-design.md) 的遗漏，不修订冻结契约、不增加操作、政策或资源 owner。

## 依据与遗漏

[RT9](../../../../spec/capabilities/model-request-runtime/v9/contract.md) S-53.1 已要求版本、配置及路由一起判定：实现无法取得返回 unavailable，绑定或配置非法返回 invalidInput；S-28 的配置形状错误也保留 invalidInput。[transport v3](../pi-ai-transport/v3-design.md) 的 acquire 已负责解释完整模型配置。v7 端口表只列 lease/unavailable，无法表达既有契约的非法配置结果，故以本补充取代该行结果及参数的投影。

core 的档案形状检查只认 configuration 为合法 JSON object，不解释所选 definition 的 cache mode、TTL 或 breakpoints；后续 transport 的 invalidInput 不是不可达的内部错误。定义撤回、版本不存在与配置非法仍按各自既有判定顺序执行，不重新分类。

## 最小公开面与装配

`ExactTransportAcquirer.acquire(binding, routeName)` 返回 `{lease}`、`{unavailable:true}` 或 `{invalidInput:{reason:'malformed'}}`。binding 和 routeName 采用现有公开类型。成功 lease、signal、track、release 及其生命周期保持现有设计。破坏性更新当前消费者，不增兼容 adapter。

真实 Cordis model transport service 的 `{rejected:'invalidInput'}` 映射为上述 invalidInput，`{rejected:'unavailable'}` 映射为 unavailable，成功 lease 原样传递。runtime 新 openCall 和由原锚点重新取得 lease 的两处调用各自直接保留失败分支，不将 invalidInput 吞成 unavailable，不 plan/send，不创建后续调用容器或追加新的调用记录。该结果是一次操作的拒绝，不制造模型响应、费用或调用结束事实。各自已取得的准入与资源仍按原 finally 收口。

本补充不提供新注册表、动态配置策略或治理 Run，不改变 catalog、profile、tenant、凭据准入及重承载授权。对原锚点的可解释性、真实历史与 owner 校验仍先按既有顺序执行；不能绕过它们以非法配置代替更早的 unavailable。

## 验证义务与当前状态

1. core 形状合法但 exact definition 不接受的配置，真实 transport service 返回 invalidInput；经 runtime 新 openCall 仍为 invalidInput，HTTP/send 数为零，无新增 opened/ended/response。
2. 原锚点重承载在前置权限/历史检查通过后，取得结果为 invalidInput 时保留该结果；缺失/撤回实现仍 unavailable；更早失败保持原顺序。
3. 成功配置复用真实 lease，已有在途排空及关闭不回归；类型测试覆盖三种结果且双语公开面说明同步。

新增规范绑定 0；实现与实际验证尚未完成。这里只补一个既有服务边的结果，不新增能力边界，故不以完整领域重读替代这处明确契约修复。
