# Cordis 启动中撤除与资源准备

状态：事实取证，候选补差机制通过本次有限交错；不是设计采用或提供者验收。

BASE 为 `67eecc1ae53be30efec473206e5d1926dd5d500f`，使用未提交的 T2-S1 协调器实现。
Node 24.21.0、官方 Cordis 4.0.4；源码与实际 dist 输入分别见 [inputs.json](inputs.json)。
执行时间、命令和退出码见 [execution.json](execution.json)，原输出见 [stdout.log](stdout.log)。
先构建该成员，再从仓库根运行 `node <本目录>/probe.mjs` 可复验。

[探针](probe.mjs) 使用真实 Cordis，setup/close 的外部资源由 deferred 控制。
[结果](result.json) 显示两条交错：

- async apply 内安装 effect 后等待 setup。撤除 fiber 时，它仍在 LOADING；effect 尚未执行，
  lifetime.current 仍为 true。释放 setup 后才触发停止，报告甚至把 setup 判为成功。
- apply 同步安装 effect，独立任务用 OwnedWork.ready 表示资源准备。fiber 先进入 ACTIVE。
  资源尚未准备时撤除，effect 请求停止，current 变 false；close 等 setup 真正收场，
  迟到取得的资源前缀恰关闭一次，并报告 setup 失败。

Cordis 4.0.4 的本地官方包 `lib/index.js` 中，`_setEpoch` 遇到已有 inertia 会返回。
`_reload` 等 apply 返回后才进入 `_unload`。本证据支持上述交错，不把内部实现当本项目新 API。
补差候选没有调用这些内部方法、改写 fiber 状态或 fork Cordis。

本次不证明同步 apply 足以代替资源就绪。装配还必须等待 OwnedWork.ready。
未覆盖真实 SQL/TLS、依赖换代、effect 安装失败和完整宿主启动；这些继续归实施与独立 QA。
触发本次调查的冻结 QA startup 场景失败及其原输入由任务证据拥有，未改断言求绿。

## 追加控制

19:22:56 另执行 [controls.mjs](controls.mjs)，原两条输入和结果不改写。
[三个结果](controls.json) 均符合所测 oracle：排队 setup 执行前撤除使 setup 零次；
必需依赖在 setup 中撤除仍先废止资格、再等取得的前缀关闭；
已失效 fiber 的 effect 安装失败使 setup 零次，并保留 setup/close 双失败。
这使用候选 helper 原型，不是正式 helper 或提供者验收。原执行及输出分别保留。
