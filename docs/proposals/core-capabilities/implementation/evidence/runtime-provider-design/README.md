# 运行提供者设计的有限机制证据

对象：[runtime-provider-interfaces](../../runtime-provider-interfaces.md)，设计基线
`61e732b979098f568ccd5d21d21939ff0c5036c4`。证据不接受设计、不证明产品完成。

`mechanism-artifacts.tar.gz` 保存专属 tmp 的固定来源、采集脚本、探针、原始运行
输出与 manifest；`manifest.json` 记录归档成员的 SHA-256。探针读取已有的官方
Cordis 4.0.2 安装，无产品库安装、业务运行、模型请求、凭据或真实文件工具。

固定 DSH 为 `c291e7961a515f6d7af9304e7fd1d257929aef26`，从官方 raw URL 取得
Service、Services、Lifecycle 文档与 fiber/reflect/service 源码。采集 manifest
记录 URL、长度、哈希；三份源码与实际使用的 4.0.2 安装源文件字节相同。
实际执行其 `lib/index.js`，SHA-256 为
`1729cdbf8ee40b17c8839e06bf96491490548559e11ef7e411271e0754e751c5`。
不据三文件相同推导整个 tarball 等价；既有发行物身份沿 agent/provenance.json。

最终命令 `node tmp/runtime-provider-design/cordis-probe.mjs` 在 Node v24.18.0
通过三个断言组，原始结果 `cordis-probe-3.log`：

- 显式恢复 Promise 结束前不 provide，消费者没有进入；发布后进入一次。
- dispose 调用时同步进入 UNLOADING，effect 尚未执行；随后清理才开始。
- required 服务失去使消费者 PENDING，重现挂新实例；外部捕获的旧普通值仍存在。

前两次探针失败来自验证脚本自身：JS 不能读取已擦除的 TS const enum，以及
把 plugin 返回对象与 status 中的 Fiber 裸比较不匹配。最终脚本在说明处记录
所用枚举值来源，并在仅一个 provider 的隔离场景观察状态；没有把这两个失败
当作产品 RED。它们的原始 stderr 分别保留在 `cordis-probe.log` 与
`cordis-probe-2.log`。采集脚本第一次因系统 Python 3.8 无 removeprefix 失败，
改为切片后成功；两份原始采集输出均保留。早先定位的无 Git 快照未作为固定
源码依据，最终所有采用的上游输入从精确 revision URL 取得。

本稿候选的生命周期观察、同 gate 撤代和当前授权检查**没有产品实现或组合
测试**；三项探针只支持相应内核机制选择。RP01–RP07、S01–S18 和 A01–32
保留为原版本覆盖目录；本会话只执行最小 allow 基线所依赖的真实 P1 与业务
子场景，不能用本文抵扣产品验证，也不自动继续完整批次。

## 当前正文迁移与后续来源校正

原设计全文保留于 Git `5ffba4bb55aa9514ebd7f3c2b48f0d26fc9a8e18`；当前具体
映射已迁到各包/应用 design.md，由上方施工入口导航。本归档和原日志不重写。
迁移后实施终点按更新的最小 allow 基线收束，不自动执行完整 M1/M2 或 HD。

原稿曾把第二次探针的身份不匹配泛称为 traced proxy。工具作者固定
`0a6e91ea643497f309f1a69f8adecc8a98751df3` 的
`evidence/tool-decision-design/cordis-source-check.json` 进一步定位：registry.ts
返回 `Object.create(fiber)` 的 PromiseLike 外壳，不能靠 symbols.original 将该
外壳认作 status 中的真实 Fiber。其固定 registry.ts 官方 c291 与实际 4.0.2
源码 SHA-256 同为 `34bbd60ae502b4f85201c204afb52a9acabde6878d9278493478c1b2183debd3`；
发行入口与本文相同。两组新原始结果保留在该提交的
`cordis-current-window-output.json`，当前设计据此在受信 apply 捕获 `c.fiber`
与本次 mount generation，并在最终门核全部必需 provider。此次直接复用，
没有另跑同问题或把机制结果当产品 RED/GREEN。
