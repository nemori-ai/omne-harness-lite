# 定义求值与装配交接文档目标

关闭协议已经实现。调用方从 `@omne-harness/assembly` 导入 `createCloseProtocol` 和 `LeaseId`。求值快照、绑定生效、缺依赖失败和旧新推进权尚未实现。

本目录存放采用依据、依赖绑定、就绪、撤除及换代交接的成员文档。依据为[上层责任](../../../docs/domains/assembly-and-handoff/README.md)和[目标包组织](../../../docs/package-organization.md)。导出条件 `source` 指向本包源码。发布时去掉这个条件。

## 阅读路径

要查一组租约的 `admit`、`release`、`detachObserver` 或 `close` 结果时，读[行为规格](SPEC.md)。其中从「一组租约」到「就绪、撤除和远端中断」的句子已由 [部分接受记录](https://github.com/nemori-ai/omne-harness-lite/issues/222#issuecomment-6162745308) 接受。两个实例和时钟由调用方提供的理由见[内部设计](docs/internals.md)。谁必须关闭见[Cordis 装配与服务生命周期](../../../docs/architecture/deployment/cordis-and-lifecycle.md)。

各能力提供者、原工作与应用装配是预期消费者。实际产品成员从[包入口](../../README.md)辨认。封存实现从[legacy 入口](../../../packages.0.0.1.legacy/README.md)查证。

## 边界与承接

服务定义随原能力契约维护。原工作与执行事实不归装配取代。求值快照、绑定生效、缺依赖失败和旧新推进权尚未实现。长期个人负责人尚未具名。

预期调用方有三类，都还没有单独的运行成员。

资源拥有者持有一组租约。他提供步骤和时钟，并调用 `close`。应用退出协调者把在途结果的交接放在关闭后端之前。观察者只调用 `detachObserver`。观察者离开不取消已持有的租约。
默认测试责任是单元和契约。`tests/public-entry.spec.ts` 从包名核对当前公开导出。集成测试和端到端测试不适用：本包还没有具体存储、应用服务或关键用户旅程。
