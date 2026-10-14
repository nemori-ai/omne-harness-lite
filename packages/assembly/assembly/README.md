# 定义求值与装配交接文档目标

本目录预留采用依据、依赖绑定、就绪、撤除及换代交接的成员文档。依据为[上层责任](../../../docs/domains/assembly-and-handoff/README.md)和[目标包组织](../../../docs/package-organization.md)。目前没有 manifest、源码、公开导出或运行支持。

## 阅读路径

要查一组租约的 `admit`、`release`、`detachObserver` 或 `close` 结果时，读[行为规格](SPEC.md)。其中从「一组租约」到「就绪、撤除和远端中断」的句子已由 [部分接受记录](https://github.com/nemori-ai/omne-harness-lite/issues/222#issuecomment-6162745308) 接受。两个实例和时钟由调用方提供的理由见[内部设计](docs/internals.md)。谁必须关闭见[Cordis 装配与服务生命周期](../../../docs/architecture/deployment/cordis-and-lifecycle.md)。

各能力提供者、原工作与应用装配是预期消费者。实际产品成员从[包入口](../../README.md)辨认。封存实现从[legacy 入口](../../../packages.0.0.1.legacy/README.md)查证。

## 边界与承接

服务定义随原能力契约维护。原工作与执行事实不归装配取代。求值快照、绑定生效点和缺依赖失败仍待确定。长期个人负责人尚未具名。

预期调用方有三类，都还没有单独的运行成员。

资源拥有者持有一组租约。他提供步骤和时钟，并调用 `close`。应用退出协调者把在途结果的交接放在关闭后端之前。观察者只调用 `detachObserver`。观察者离开不取消已持有的租约。
