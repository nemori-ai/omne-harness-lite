# 本地工具运行时

根入口导出 `createToolInvoker`、`createToolImplementationRegistry`、`createToolRuntimeRegistry`、`createToolRuntime` 和 `createToolEnvironmentPlacementSource`。公开操作与构造类型归 [core/tool-execution-runtime](../../core/tool-execution-runtime/src/index.ts)。独立工厂不加载 Cordis。

`createToolRuntime(config, dependencies)` 返回 operations、ready、idle() 与 close()。发布操作前必须等待 ready。依赖包括共享日志代、完整动作历史、runtime context、结果存储及不可变 runner 链读取口。启动恢复使用应用的私有维护授权。

`./cordis` 承载普通与 managed 绑定。后者使用共享装配生命周期及启动服务，保留原实例的关闭控制。配置仅包含普通数据，不能塞入活体依赖或授权 token。恢复完成后才登记运行时，撤除等待原执行善后，不关闭应用物理日志或兄弟提供者。

观察者 release 不停止执行。冷恢复收场 queued、running、waiting 责任，不重新进入工具作者函数。未确认的资源停止会阻止就绪。存在 targetEnvironment 的工具采用实际资产输入和当前授权，持有同一个环境 lease；纯工具不获取环境。原始外部作用、逻辑终局和物理停止分别报告。

内置 host 尚无 OS 命令或文件后端。外部服务解析、其他声明依赖或设置、交互等待及费用报告仍有后续实现责任。作者函数返回不等于耐久结果已交付，A/B/C 协议由应用交付 owner 接续。完整范围见 [英文说明](README.md)、[本包薄规格](SPEC.md)及[公共行为](../../core/tool-execution-runtime/SPEC.md)。

## 开发与持久验收

从仓库根运行：

```sh
pnpm --filter @omne-harness-lite/tool-execution-local run build
pnpm --filter @omne-harness-lite/tool-execution-local run typecheck
pnpm --filter @omne-harness-lite/tool-execution-local run test
```

PF-006 S24/S69 独立验收使用模型示例的公开入口。先构建示例及其依赖，再执行验收，不能并行构建与验收：

```sh
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo... run build
pnpm --filter @omne-harness-lite/tool-execution-local run acceptance
```

独立验收拥有者维护 acceptance/ 的断言。网络场景需要本地 OpenRouter 配置，缺凭据或调用失败不算通过。本次模板改造不运行真实付费调用，也不将未运行场景标记通过。
