# Session projection 提供者设计

状态：`f98ac926` 投影映射已接受为最小运行基线施工输入。现有
[src/index.ts](src/index.ts) 为 `/baseline`；目标公开服务尚未实现。
[来源入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)
保留历史与证据。

采用 [session v1](../../../spec/capabilities/session/v1/contract.md) SE-10（状态贡献注册）、
[run v1](../../../spec/capabilities/run/v1/contract.md) RN-07（驱动位置是投影）及
[Session 当前设计](../session/design.md#状态贡献投影和可观测性)中的
状态贡献/投影约定，原采用来源为 `cd16f1`。长期事实与业务授权归
[Session](../session/design.md)，可写 Run 归 [Run](../run/design.md)，本包只拥有可重建的
列表/历史/队列/运行视图。

[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 后本包新增两项责任：

- **接受外包 reducer。** [run-driver 包](../../agent/run-driver/design.md)以 stateKey
  `run.driver_position`、输入 run 流事件、`kind: projection` 注册驱动位置 reducer；本包
  按同 scope/key 重复拒绝、版本不符拒绝的既有规则登记，视图随 reducer 撤回而 unavailable。
- **投影缓存。** DSH 式 checkpoint 在本包降级为可选加速：fold 状态加水位，绑定 stateKey、
  reducer 版本、SessionRef 与源水位；越界、错 Session 或版本不符即弃用重建，不是第二份
  位置事实（用户裁决 [U-23](../../../docs/proposals/session-run-agent-lifecycles/README.md#裁决记录2026-09-14用户)）。

## 提供与装载效应

候选默认入口 `@omne-harness-lite/session-projection` 拥有
`SessionProjectionPlugin` 与所需投影贡献/受限查询适配。service key 为
`omneSessionProjection`，required inject 为 `omneDiagnostics`、`omneSession`。
options 由宿主提供已核实的源快照/变化输入和投影状态；目标签名由公开源码建立。
包依赖 Session 公共事件/fold 类型；SR 不反向 required inject 此服务。

插件先恢复明确 SessionRef、水位、inputVersions、fold/schema 与贡献 generation
的派生视图，再 provide；重建中查询显示 rebuilding/unavailable。宿主把本包
受限查询适配交 SR `registerProjection`，普通用户查询始终经过 SR 当前元数据/
正文权检查，服务可见性不授予独立披露权。不从旧摘要做准入，也不输出 raw reader。

| 建立的效应 | 拥有者与撤除责任 |
|---|---|
| 视图服务和 SR 查询适配登记 | 本次插件/精确贡献拥有；先关闭本代查询资格，撤原注册后相应视图 unavailable，Session 原事实仍在 |
| 变化订阅、重建任务及派生缓存 | projection owner 纳管，取消/失败时停止原输入并等待实际任务收口；晚到折叠不能改新 generation。原件无变更，不恢复“装载前全局快照” |
| stateKey/scope/schemaVersion 的投影贡献 | 同 scope/key 重复拒绝，不能同版本复用首个函数；旧 disposer 只撤自己的 registration，不删除新贡献 |

在受信 apply 捕获真实 `c.fiber` 和本次 generation，ctx.plugin 外壳仅供等待/
卸载控制。原挂载及依赖的最终当前检查覆盖 UNLOADING 先于 effect 的窗口和
同 Fiber 重载；再由 SR 检查实际披露资格。丢失该投影不会关闭原始数据的其他
合法读面或销毁 Run。普通监听随 Fiber 撤回，仍有任务/资源则具名 retained；
有先后依赖的清理置于一个复合过程，不以 disposer 被调用证明结束。

## 实施与验证

沿现有确定性 fold 演化，禁止第二 writer、任意 patch 和默认授权。真实 Session
源及受权查询适配接入后验证 S08/A09 的当前基线切片：删除投影后重建、错版本/
水位、同 key 同版不同贡献、并发更新/旧撤回器和撤读权后的订阅。缺视图与对象
不存在必须可区分但不泄漏无权对象。当前产品组合未运行，基线通过后不自动
扩成完整观测查询或导出平台。
