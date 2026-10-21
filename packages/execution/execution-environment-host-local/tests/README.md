# tests

本目录承载本包适用的持续测试。测试种类的责任与边界见仓库[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)。

## 允许的内容

`*.spec.ts` 运行测试、`*.spec-d.ts` 类型测试、测试辅助代码，以及 `fixtures/` 下的固定输入。

## 边界

文件字节、符号链接与对象替换用真实文件系统，测试在系统临时目录下建文件，结束后删除。Cordis 装载用真实 Cordis 4.0.4。授权决定、账本与守卫用替身。替身就绪不证明真实授权或数据耐久。测试通过不代替规格或验收。

## 维护

SPEC 的行为变化时，同步对应测试与本目录 `index.md`。宿主文件使用的测试覆盖已接受的行为，改它们之前先确认对应的行为已重新接受。

## 本包事实

现在有七个测试文件，共七十二个测试：

- [host-file-results.spec.ts](host-file-results.spec.ts)：宿主文件使用的结果：点名、空字节、未解析、符号链接、对象替换、关闭失败、代次、尾部斜杠、目录、快照与错误路径的描述符保留。
- [host-files.spec.ts](host-files.spec.ts)：工作区目录外的读取、字节范围、查看、新建、父目录核对、预期版本与相对路径拒绝。
- [host-files-unsupported.spec.ts](host-files-unsupported.spec.ts)：八项未实现操作返回 `unsupported` 且不触碰文件系统。
- [host-file-edges.spec.ts](host-file-edges.spec.ts)：查看、写入与关闭不点名时的拒绝；新建前的各项拒绝与父目录缺失；宿主拒绝访问；未映射的打开错误为未知；关闭的绑定层与对象核对；多段读取、上限与文件末尾；同一文件状态在写入、读取、查看与新建后的版本一致；根目录查看；显式零起点。
- [host-provider.spec.ts](host-provider.spec.ts)：宿主提供者的事实、租约内容、拒绝、账本关闭后的 `closed` 与退役通知。
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：服务、`filesFacilityPlugin` 与 `hostFilesPlugin` 的装载与卸载，经租约读文件，恢复授权服务的现取，经服务撤除提供者的重试，待处置时卸载照常完成并记入 `ctx.logger`。
- [public-entry.spec.ts](public-entry.spec.ts)：根入口的导出集合，根入口可达的模块不导入 Cordis。

没有 `*.spec-d.ts` 类型测试。运行方式：在仓库根执行 `pnpm --filter @omne-harness/execution-environment-host-local test`，或在本包目录执行 `pnpm test` 与 `pnpm typecheck`。

运行记录：PanQiWei 接受时只在 Node v26.0.0、darwin 上运行过。2026-10-21 在 Node v24.18.0、linux 上，七十二个测试全部通过，退出码 0。

当前缺口：授予根限制、同一 isolate 标签下重复装载、配置校验失败，都没有测试。具名维护者由负责人指定。
