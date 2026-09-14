# Budget 提供者设计

状态：`f98ac926` 映射已接受为最小运行基线施工输入；目标包尚未实现。
[来源入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)
保留历史与证据。当前实施只服务最小 allow 基线的真实本地预算。

采用 [BG v1](../../../spec/capabilities/budget-accounting/v1/contract.md) BG-01–04、
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md) 和
[治理接口](../../../docs/proposals/core-capabilities/implementation/governance-interfaces.md)
`058c77c`。金额、来源立场、period/attempt、事件与联合预留算法沿原稿；
BG-05–07、支付/订阅/模型价格与用量接入后置，不借迁移扩充范围。

## Host、公开入口与插件

候选默认入口 `@omne-harness-lite/budget` 拥有 `createBudgetHost`、`BudgetPlugin`
和 `registerChargeSourceFacts` 管理面；目标签名待在本包公开源码建立。包只消费
TG/data/records/admission/diagnostics 公共入口，不 import 执行或模型实现。

BudgetHost 持有本域分租户的 logical/durable 预算账目、原 operation、来源立场、
attempt/period 归集及所有 finite/unknown 暴露。应用单次创建并保有管理面；
同一 coordinator 再创建拒绝 `authority_already_bound`。多个 Context 只复用它。
业务只持窄 AdmissionCoordinator/RecordPreparation，不取得完整 writer。

`BudgetPlugin` 提供 `omneBudget`；required inject 为 `omneAdmission`、
`omneDiagnostics`、`omneIdentity`、`omneTenant`。options 接原 host，先在同一
已验证 Watermark 完成 decoder/fold、待结算责任和币种/周期校验，再 provide。
费用来源未核实时新预留 unavailable；可用管理范围不等待未来模型提供者。

apply 捕获 `c.fiber` 的精确挂载及 host 的 mount generation，不能用 ctx.plugin
返回外壳或 uid 认业务身份。生命周期观察调用本 host 同门关闭；末门另核原
mount/source stamp 及所有必需 provider 的代次/真实存活，覆盖 consumer 尚
ACTIVE、provider 已失效及 UNLOADING 到异步 effect 的窗口。每次 apply 新建
mount generation，同 Fiber 重载不能复活旧闭包，再核
实际调用者/TG 当前预算管理或本次动作资格。Fiber ACTIVE 不提供预算许可。

## 来源与效应

`registerChargeSourceFacts` 只交受信 TL/执行 link，未来 MC 同理。内容是原稿
的真实 CostSource、精确币种/价格质量、目标 attempt、start 墓碑和计量事实。
用户参数、声称 readonly 或本地工具不使来源自动免费。门外准备双方、同门
核代次后登记，原 source check 只查自身事实，不递归向 BG 求许可。
返回的 retire/inspect/waitReleased 绑定原 registration/generation；部分装载
只登记 held，双方未就绪不正向使用，旧 disposer 只能撤原来源。

| 装载建立的效应 | 撤除完成判据与保留事实 |
|---|---|
| `omneBudget` 服务、普通订阅 | 本次 Fiber 撤精确注册，host 先封闭本代新调用；预算账和原操作不删除 |
| 当前来源登记与准备 | 原 source owner 收口其准备/注册；失联关闭依赖的新 reserve，晚到事实仍走原来源核实通道 |
| action_execution 中本 owner 预留/审计 | BG 自己 prepare/check/publish，TL 只组一次完整 batch；卸载不撤已耐久预留，pending/unknown 不因断连释放 |
| 原 attempt 计量/释放 | BG 与原执行事实 owner 保有责任；确认未发出才按原协议释放，迟到费用仍归原 period/currency，不改到新实例 |

普通 AU/BG/link 重载不能抹原已准入工作。关闭、等待取消和重试分开；清理未完
保留原资源和诊断，恢复消费原日志/来源事实后再开放。facade 可重挂同一 host，
host 本体替换先排空 publication/确认清理或合法移交并冻结完整 durable 水位；
原 host 未释放不能开第二账本。P1 失联不报告未完成结算为 durable。

## 本地基线的验证

在真实 P1/TG/身份/执行来源上按原 B1–B5 推进 A26 本地切片：limit10，已有
unknown K7 后再 finite U7 或 unknown K7 都拒绝；C3+剩余4 保持已知暴露7。
USD-only 面对 EUR 来源具名拒绝，实际声明对应币种立场后才匹配全部适用预算；
changeBudget 不改 identity/币种/原 period。并发最后额度、取消早于迟到 start、
unknown、重复/迟到计量与重启必须观察真实账目及文件执行事实，不能只数 Map。
当前这些产品测试未运行；完成本地基线后停止，不自动接模型计费或账单框架。
