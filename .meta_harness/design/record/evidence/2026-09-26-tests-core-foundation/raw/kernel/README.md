# W1 kernel-basis probe 交付证据

- 执行检出：`/data/qiwei/repos/omne-harness-lite/.worktrees/core-delivery-kernel`
- 分支：`panqiwei/core-delivery-kernel`
- 基线：`0bf83cd71e734cd315f2266555517b52175fed19`
- 交付：`1a229204abd9180c9e8078997b0697309c50184c`
- 环境：Node `v24.18.0`、pnpm `10.28.1`、Vitest `4.1.11`；锁定的官方 Cordis 发布物 `4.0.4`。
- 变更：仅三份 `packages/core/kernel-basis/tests/basis/*.test.ts`；没有改产品源码、依赖、冻结契约或设计正文。

## 实際核对来源

采用依据为 D-025、kernel-basis 节点 README/design/verification，以及 basis 条目 `isolate-hides-instances-not-data`、`inject-has-no-optional-form`。
实际读取本检出 `node_modules/.pnpm/@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/cordis/` 中发布的源码和运行产物：

- `src/fiber.ts`：状态枚举与 `_setEpoch`/`_unload`；异步 disposer 完成前维持 UNLOADING，同一 generator effect 内逆序释放。
- `src/reflect.ts`：Context 代理属性读取在父标签不同时抛错；`get`/`_getImpl` 默认检查提供者 ACTIVE；`provide` 经 effect 注册/撤除。
- `src/context.ts`：`isolate` 为指定服务创建或采用 label。

这些是官方发布物的 4.0.4 事实，不借当前 upstream HEAD 代替版本。网页工具访问官方 docs 入口被限制，未取得额外在线文档；发布物源码已随锁安装，可直接复查。`metadata.json` 登记输入、发布物和最终输出的 SHA-256。

## 新增稳定测试 ID 与判别能力

1. `fiber-state-readable > 异步 disposer 未完成时真实状态为 UNLOADING（5），完成后才为 DISPOSED`
   - 实际 `fiber.dispose()` 启动异步 disposer，进入后由 Promise 屏障保持未完成，观察真实状态 5 与镜像一致，`fiberIsActive` 为 false，dispose 尚未完成；释放后 DISPOSED。
   - 若不暴露 UNLOADING、镜像错误、提前完成 dispose 或活动判定错误，断言失败。
2. `isolate-hides-instances-not-data > 子 isolate 属性解析抛错，不回退父标签已注入的服务`
   - 父消费者真实 inject 服务，同标签子插件无独立 inject 时可读取；新标签子插件的属性读取抛错。三个插件的执行路径均在外部核对，避免未执行而空过。
   - `ctx.get` 和 `ctx.get(..., false)` 均返回 undefined；「抛错」只指 Context 属性读取，不能泛化为 get 的行为。若恢复跨标签祖先回退，抛错断言失败。
3. `inject-has-no-optional-form > 可选读取过滤 PENDING、LOADING 与 UNLOADING，只在提供者 ACTIVE 时返回服务`
   - 缺必需服务时真实 PENDING；引入前置服务后进入受屏障控制的 LOADING；就绪后 ACTIVE；撤去前置服务进入受屏障控制的 UNLOADING，最终回 PENDING。
   - LOADING/UNLOADING 时严格 get 与 resolveOptional 均为 undefined；非严格 get 能读到实际注册实例，证明差异来自状态过滤而非服务已经注销。消费者整个过程保持 ACTIVE 且只执行一次。
   - 若移除严格状态过滤、改变默认 strict、resolveOptional 忽略 strict 或使可选解析登记依赖，断言失败。

所有新增时序使用 Promise.withResolvers 协调，不使用 sleep、不直接设置 fiber 状态、不替换内核函数。未另做运行时源码变异测试；上述失效判别来自正反路径断言。

## 运行结果

全部命令在执行检出运行，退出码均为 0：

| 命令 | 原始输出 | 结果 |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | `install.log` | 本树锁定依赖安装完成 |
| `pnpm --filter @omne-harness-lite/kernel-basis run test`（基线） | `baseline-test.log` | 11 文件、27/27 通过 |
| `pnpm --filter @omne-harness-lite/kernel-basis run build` | `build.log` | 构建通过，源码无修改 |
| `pnpm --filter @omne-harness-lite/kernel-basis run typecheck` | `typecheck.log` | 无类型错误 |
| `pnpm --filter @omne-harness-lite/kernel-basis exec vitest run --reporter=verbose --reporter=json --outputFile.json=<本目录>/test-results.json` | `test-final.log`、`test-results.json` | 11 文件、30/30 通过，0 跳过、0 失败 |
| `pnpm format:check -- <三份修改的测试>` | `format.log` | 全部通过 |
| `git diff --check` | 空输出 | 通过 |

原有 probe、Outcome、definePlugin、bootAssembly 用例全部包含于最终运行。`test.log` 是首次修改后的普通结果；最终具名结果以 `test-final.log` 与 JSON 为准。

## 交接与范围

- 只核实 Cordis 4.0.4，不推断后续版本或完整业务闭环。
- 不宣称独立验收；HUB 集成验证和节点证据回填由主调度负责。
- 无遗留阻断或本任务未覆盖验收项。basis 条目是否升格、历史设计措辞归主调度处理。
- 本目录为唯一的临时证据集合。spoke 退休前需保存完整目录并核对哈希；本 agent 完成后无运行中的测试或检出使用者。
