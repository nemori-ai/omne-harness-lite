# 图片准备 scope 清理的提供者承接（候选附页）

2026-09-29 revision 2。补充 D109 已接受的 [v15 r4](v15-image-preparation-design.md)，不改受审字节。runtime 接口/失败顺序唯一在[对应附页](../model-request-runtime/image-preparation-scope-cleanup-candidate.md)。沿 RT10/MR9；无新领域契约、缓存服务、持久对象、业务操作或正式实现声明。

## 服务面与装配

`ModelTransportService` 增加必需 `readonly clearReuseScope: (scope: object) => void`，对外承接 runtime `ExactTransportAcquirer.clearReuseScope`。现成的固定 service acquirer 直接转发捕获的该实例方法；不能重新查 ctx 的当前 service。方法不受 `accepting`、entry.retiring 或已 release lease 条件阻挡；它是原 provider 所有资源的清理能力，不是模型请求准入。

`createModelTransportService` 已在一次 service generation 中拥有一个网络 transport；本轮图片 preparer 也由同一实际 construction owner 管。当前和 retiring adaptation entries 共用的 preparer 去重调用一次，不按 entry 生成额外图片缓存。不要求枚举全进程服务或所有租户；只覆盖该实例实际拥有的 preparer。调用无图 provider 时明确 no-op；不能通过 no-op 假装清掉实际存在的缓存。

本轮不增加图片 preparer 热替换 API。若同一实例装配已经允许多个仍活跃的准备代际，原 construction owner 的有界 owned-resource 集合必须覆盖其中每个仍可能持 cache 的 preparer；顺序遍历其快照，逐个 `clearScope(scope)`。不能仅清新代际，也不能在 retiring 时提前删除旧代际清理句柄。多个 entry 借用同一 preparer 只算一个资源，不按每次请求持续增加句柄。

## 生命周期、有界性与异常

- `clearReuseScope` 同步检查 object 非 null 后进行纯内存删除。错误输入 TypeError；不存在的 scope、已清理和已关闭且确实无缓存都幂等完成。不得把 native drain 塞入此 void 接口。
- 每个 preparer 的 clearScope 沿 v15：删当前表，旧任务不能向新表发布；不取消任务、不中断网络、不释放在途输出。
- provider stopAdmission/retire 不移除清理能力；真正 `preparer.close()` 完成并已清全部 cache 后才可从 owned 集合移除。只收到 abort、超时 waiting、cleanup_failed 或 rejected closed 都不足以作无缓存证明；这些状态留原 owner 责任。
- registry `closed` 的成功兑现必须晚于其所有 preparer 的实际 close/cache clear；不能先 resolve closed，再借它触发 acquirer 删除最后清理句柄。与 network pool 和 codec 的组合顺序仍沿 v15/v21，不新增第二个终结权威。
- 正常明确配置只有一个 preparer/服务代际；现有装配有限 provider retention 管理跨服务代际，不引入额外无限数组、全局 Set 或历史 tombstone。没有足够 retention 槽位时在对外返回新 lease 前拒绝新取得（沿已有 unavailable），不得先发送后才发现无清理承接。
- 可替换 preparer 可能违反协议而同步抛错：调用其他 owned preparer 后，再抛出包含各失败原因的 AggregateError；单个可保持原异常。不能空 catch 或当成功。不把这些 raw error 自动塞入诊断；runtime 沿对应附页保留责任并给已有 unavailable。关闭失败不删除 owned 句柄，也不关闭仍被在途任务借用的 codec。
- runtime 对只含其自行创建 scope 的清理 capability 有权调用；它不授予查看其他 scope 内容的能力。多 runtime 分享 provider 时，用不同 opaque scope，某个 runtime close 只清自己所持 scopes，不能调用共享 preparer.close 冒充 scope 清理。preparer.close 仍仅由真正 owner 在全部借用释放后调用。

## 必须验证

沿 runtime 附页 SC1～8，额外断言 registry：两个 adaptation entry 共用 preparer 时只清一次；retiring entry 不失去清理；一个失败其他仍清；成功 closed 后无 cache/任务且重复清理无操作；failed closed 不当作完成；关闭池/codec 不早于真实准备排空。若只实现固定代际，不可把未执行多代际验证声明成已覆盖。仅仅 TypeScript interface 通过或 mocked clear 调用次数不能关闭缓存真实释放验证。

新增实际 bindings 0，候选未采用；实施与实际验证由主线调度，本附页只补 D109 缺失的跨包资源边。

## revision 2：同步端口的实际返回值

service→preparer 及 acquirer→service 都执行 [runtime 附页的实际返回值规则](../model-request-runtime/image-preparation-scope-cleanup-candidate.md#revision-2同步端口的实际返回值)：只接受严格 undefined；Promise/thenable 等违约不能被 void 类型隐藏，不释放 owner，观察实际终结且 pending 不重复清理。SC9 覆盖这些提供者边界；规范唯一在该节，不重复定义异步清理协议。
