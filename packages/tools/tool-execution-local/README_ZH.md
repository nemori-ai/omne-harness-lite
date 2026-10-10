# 本地工具运行时

`createToolExecutionRecordReader` 借入原同Unit来源及按key读取，只提供固定租户的ToolExecutionRecords.readOriginalIn。它不读取完整会话前缀，不授予执行或恢复权；行为归 [SPEC](SPEC.md)。

根入口导出 `createToolInvoker`、`createToolImplementationRegistry`、`createToolRuntimeRegistry`、`createOriginalIssueToolRuntime` 和 `createToolEnvironmentPlacementSource`。公开操作与构造类型归 [core/tool-execution-runtime](../../core/tool-execution-runtime/src/index.ts)。独立工厂不加载 Cordis。

`createOriginalIssueToolRuntime(config, dependencies)` 复用原执行器。构造显式提供 `tenant`、`recoveryPageSize` 和 `originalIssue`，不接收完整历史、会话枚举、日志借用或Runner选链端口。工厂读取自身任务索引，原资源收场后才就绪；已选工具和after_action链由请求提供。构造前将 `toolOriginalIssueMigrations` 合入同库迁移。工厂不关闭借入资源，也不声称能恢复尚未进入原生索引的旧任务。

该工厂返回 `ToolPoolInstance`。`submit` 接收 `PreparedToolExecution`，包含原Source及已选 `after_action` 链。正常请求还包含选中定义和参数；不可执行请求包含原adoption及明确的 `unparseable` 或 `no_such_entry`，不能携带选中实现。Session生产者准备这些输入并核对原完成批次；原池核验正常请求的准入token，复用已有执行器，不可执行请求只形成失败结果，不调用作者。公开构造与冷恢复只使用原生任务路径；私有旧适配器及其单元测试仍须按[SPEC.md](SPEC.md)完成迁移，不据此宣称完整池边界已经验证。

原owner先保有完整job、输入和固定实现，再给Session提供同事务参加者。原意图和唯一claim先提交；原claim的消费确认后才进入作者。发起不明保留原job；消费已提交但回执丢失时，以未启动的unavailable终局收场，不补调作者。`stopped`只证明该job的实际工作和借用已收场，不代替结果交付凭证。目前组件验证使用真实SQLite与原执行器，Session准入仍为受控输入；完整Session保管／交付和动态Cordis驱动另行验证。

`./cordis` 的 `managedToolExecutionLocal` 通过 `ToolRuntimeStartupService.start(config)` 取得原执行池。受信应用根选择原生工厂并传入活体依赖；绑定只依赖启动服务、执行池注册表和共享装配生命周期，不再注入会话日志、动作历史或 Runner 选链。注册表只接收准备完成的请求。配置仅包含普通数据，不能传入活体依赖或授权 token。绑定先保留原关闭控制，恢复完成后才登记运行时；撤除后不再发布，并等待原执行善后，不关闭借入依赖。

观察者 release 不停止执行。冷恢复收场 queued、running、waiting 责任，不重新进入工具作者函数。未确认的资源停止会阻止就绪。存在 targetEnvironment 的工具采用实际资产输入和当前授权，持有同一个环境 lease；纯工具不获取环境。原始外部作用、逻辑终局和物理停止分别报告。

真实宿主提供者已通过原环境契约提供 OS 命令和文件设施；本包不实现具体后端。外部服务解析、其他声明依赖或设置、交互等待及费用报告仍有后续实现责任。作者函数返回不等于耐久结果已交付，A/B/C 协议由应用交付 owner 接续。完整范围见 [英文说明](README.md)、[本包薄规格](SPEC.md)及[公共行为](../../core/tool-execution-runtime/SPEC.md)。

## 开发与持久验收

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/tool-execution-local run build
pnpm --filter @omne-harness-lite/tool-execution-local run typecheck
pnpm --filter @omne-harness-lite/tool-execution-local run test
```

PF-006 S24/S69跨运行时验收归[正式CLI入口](../../../apps/cli/acceptance/README.md)，核对完整普通返回、真实Shell执行、持久结果和后继模型请求。旧Demo和对应验收适配器已删除；本成员保留执行池公开能力测试。

主会话及独立验收拥有者维护跨运行时验收。网络场景需要显式指定已配置的专用租户，通过其凭据访问OpenRouter；不打印凭据。缺少配置或调用失败不算通过。

真实宿主提供者通过原环境契约提供命令和文件设施，本包不实现OS后端。长期终端的resource_adopted在原会话日志提交边界确认；创建call释放后，原环境维护owner继续承担回收责任。冷恢复调用recoverOwned枚举该scope的原资源，不重放作者函数或用户命令。详见原接口拥有者的TE-29/30和本包LP-12。

受信根可从纯根入口调用 `createToolOriginalIssueVerifier(storage)`。其 `verifyIn` 只在调用者原 Unit 读取完整持久原身份，不发行 claim 或执行权。原 job 关闭后仍可供既有结果保管核验；共享 Storage 的存续由根负责。

`createToolExecutionObligations({ storage, tenant, maxPageSize })` 读取本租户原工具任务索引。一次借用使用同一已提交快照，回调可以独立写入。它只返回任务引用，不恢复 Session，也不发出执行权。该读取覆盖 native 原任务；旧路径、实际记录和资源收场仍须由后续冷恢复迁移核实，不能据此宣称完整执行池已就绪。
