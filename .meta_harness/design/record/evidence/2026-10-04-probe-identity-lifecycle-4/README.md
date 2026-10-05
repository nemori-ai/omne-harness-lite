# 启动控制与失败后的完成观察

本次核对结构修订中“先交出句柄，再启动资源”的控制路径。
BASE 为 `588628544ab92bd542f24efa1801634eb6eee56e`，精确命令与散列见 [run.json](run.json)。
[驱动](start-control-probe.mjs)使用真实 Cordis 和受控资源，沿用[关闭原型](lifetime-prototype.mjs)。

[实际输出](start-control-probe.stdout)的两个场景均通过断言：

- B 的 setup 失败先使 ready 拒绝，A 的 close 尚未结束时 closed 仍等待。
  A 随后关闭失败，最终报告同时保留 B setup 和 A close；C 从未启动。
- setup 进行中调用 dispose，ready 以 stopped 拒绝；closed 等真实 setup 返回后才完成。
  dispose 返回同一个完成 Promise。

句柄返回前没有 apply。驱动在登记 OwnedWork 时独立观察 setup Promise，
避免等 Cordis 失败卸载结束才报告启动错误。产品 loader 必须保留这条观察责任。

这只是新控制协议的可行性探针，不是正式公开 API、声明/schema 准备或完整插件树的验收。
它不覆盖任意拓扑、恶意/违规插件、端口错误、真实宿主守卫及完整网络服务。
没有修改产品或已冻结 QA 资源，也未调用付费模型。
