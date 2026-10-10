# 本地工具运行时

`createToolExecutionRecordReader` 借入原同Unit来源及按key读取，只提供固定租户的ToolExecutionRecords.readOriginalIn。它不读取完整会话前缀，不授予执行或恢复权；行为归 [SPEC](SPEC.md)。

根入口导出 `createToolInvoker`、`createToolImplementationRegistry`、`createToolRuntimeRegistry`、`createToolRuntime` 和 `createToolEnvironmentPlacementSource`。公开操作与构造类型归 [core/tool-execution-runtime](../../core/tool-execution-runtime/src/index.ts)。独立工厂不加载 Cordis。

`createToolRuntime(config, dependencies)` 返回 operations、ready、idle() 与 close()。发布操作前必须等待 ready。依赖包括共享日志代、完整动作历史、runtime context、结果存储及不可变 runner 链读取口。启动恢复使用应用的私有维护授权。

`createOriginalIssueToolRuntime(config, dependencies)` 选择同一个原工具执行器，并要求传入 `originalIssue`。该可信输入携带实际共同存储、日志参加者、日志权限、当前资格和Session准入。装配须先将 `toolOriginalIssueMigrations` 合入同库迁移。工厂不关闭这些借入资源；普通工厂和既有Cordis绑定不会隐式取得此协议。

该工厂返回 `ToolPoolInstance`。`submit` 接收 `PreparedToolExecution`，包含原Source及已选 `after_action` 链。正常请求还包含选中定义和参数；不可执行请求包含原adoption及明确的 `unparseable` 或 `no_such_entry`，不能携带选中实现。Session生产者准备这些输入并核对原完成批次；原池核验正常请求的准入token，复用已有执行器，不可执行请求只形成失败结果，不调用作者。构造与冷恢复仍须完成[SPEC.md](SPEC.md)要求的迁移，返回类型本身不证明完整池边界已成立。

原owner先保有完整job、输入和固定实现，再给Session提供同事务参加者。原意图和唯一claim先提交；原claim的消费确认后才进入作者。发起不明保留原job；消费已提交但回执丢失时，以未启动的unavailable终局收场，不补调作者。`stopped`只证明该job的实际工作和借用已收场，不代替结果交付凭证。目前组件验证使用真实SQLite与原执行器，Session准入仍为受控输入；完整Session保管／交付和动态Cordis驱动另行验证。

`./cordis` 承载普通与 managed 绑定。后者使用共享装配生命周期及启动服务，保留原实例的关闭控制。配置仅包含普通数据，不能塞入活体依赖或授权 token。恢复完成后才登记运行时，撤除等待原执行善后，不关闭应用物理日志或兄弟提供者。

观察者 release 不停止执行。冷恢复收场 queued、running、waiting 责任，不重新进入工具作者函数。未确认的资源停止会阻止就绪。存在 targetEnvironment 的工具采用实际资产输入和当前授权，持有同一个环境 lease；纯工具不获取环境。原始外部作用、逻辑终局和物理停止分别报告。

真实宿主提供者已通过原环境契约提供 OS 命令和文件设施；本包不实现具体后端。外部服务解析、其他声明依赖或设置、交互等待及费用报告仍有后续实现责任。作者函数返回不等于耐久结果已交付，A/B/C 协议由应用交付 owner 接续。完整范围见 [英文说明](README.md)、[本包薄规格](SPEC.md)及[公共行为](../../core/tool-execution-runtime/SPEC.md)。

## 开发与持久验收

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/tool-execution-local run build
pnpm --filter @omne-harness-lite/tool-execution-local run typecheck
pnpm --filter @omne-harness-lite/tool-execution-local run test
```

根模型示例已物理删除。PF-006 S24/S69断言仍在acceptance/保留，但尚未迁到正式CLI入口，当前不可运行，也不算通过。交付前必须完成消费者迁移并验证全部原断言。迁移完成前，验收配置明确拒绝启动。

独立验收拥有者维护 acceptance/ 的断言。网络场景需要本地 OpenRouter 配置，缺凭据或调用失败不算通过。本次模板改造不运行真实付费调用，也不将未运行场景标记通过。

真实宿主提供者通过原环境契约提供命令和文件设施，本包不实现OS后端。长期终端的resource_adopted在原会话日志提交边界确认；创建call释放后，原环境维护owner继续承担回收责任。冷恢复调用recoverOwned枚举该scope的原资源，不重放作者函数或用户命令。详见原接口拥有者的TE-29/30和本包LP-12。

受信根可从纯根入口调用 `createToolOriginalIssueVerifier(storage)`。其 `verifyIn` 只在调用者原 Unit 读取完整持久原身份，不发行 claim 或执行权。原 job 关闭后仍可供既有结果保管核验；共享 Storage 的存续由根负责。

`createToolExecutionObligations({ storage, tenant, maxPageSize })` 读取本租户原工具任务索引。一次借用使用同一已提交快照，回调可以独立写入。它只返回任务引用，不恢复 Session，也不发出执行权。该读取覆盖 native 原任务；旧路径、实际记录和资源收场仍须由后续冷恢复迁移核实，不能据此宣称完整执行池已就绪。
