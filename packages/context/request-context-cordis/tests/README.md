# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

本成员的测试在真实 Cordis 4.0.4 上装载插件，不用 Cordis 的替身。贡献者与监听者用测试内的最小插件代替真实的上层插件。机制实例用真实的 request-context 工厂。历史源读口、计量端口、转换件结果端口与请求序列化端口用替身，因为它们的真实实现不在本组。持久化、跨进程一致性与真实贡献者、协调者和持有者的端到端组合不在本目录。测试通过不代替规格或验收。

## 维护

SPEC 性质或验证义务变化时，同步对应测试与本目录 `index.md`。服务定义或机制工厂改变时，同步测试里的最小插件与替身。

## 本包事实

现在有两个测试：

- [public-entry.spec.ts](public-entry.spec.ts)：断言根入口没有导出。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：断言 `./cordis` 入口没有导出。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm turbo run test --filter=@omne-harness/request-context-cordis`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

当前缺口：[Cordis 说明的验证义务](../docs/cordis.md#验证义务)列出的八项都没有测试，随实现进入。具名维护者由负责人指定。

- [provider.spec.ts](provider.spec.ts)：信任键缺席时不装载、两个键由同一个插件 fiber 提供并同时撤除、登记只经信任授权。
