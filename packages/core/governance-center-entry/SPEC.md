# EntryOpening

本包拥有两张治理网络面共用的准入信号。采用依据为[身份集成设计](../../../.meta_harness/design/architecture/identity-integration/retirement.md#开闸的代际约束)及其链接的接受决定。

- 每个装配代际只有一个实例。`isOpen()` 直接求值为本代确认完成且 lifetime 仍 current，不依赖通知缓存。
- `wait()` 只在全部资源就绪、升级守卫确认完成且仍 current 后兑现。停止时尚未兑现的等待，以及停止后的新等待，以 `EntryOpeningStopped` 拒绝。
- 已兑现的 Promise 不会撤回。两张网络面必须在新请求准入处直接检查 `isOpen()`；运维操作开始前也复验共同开放条件。停止不取消已接纳工作。
- 宿主拥有实现、拒绝观察及代际生命周期。`./cordis` 的 `EntryOpening` 只绑定服务键，不拥有确认或关闭控制权。

本包不接替未迁 EC3/HT3 的业务规则、ActionIntent、事件和其余运行资源。它们仍由原有效承诺约束。
