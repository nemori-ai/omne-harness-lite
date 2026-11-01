# @omne-harness/harness-server 行为规格

本页是 `apps/harness-server` 的长期行为规格。它写类型表达不了的行为：装载、可见性、就绪、进程输出、退出码和有序关闭。公开类型以 `src/types.ts` 为准，本页不重复类型定义。

## 采用状态

本页依据 S0 私有应用实施规格 r2（#1001 的输入，见 #991 的采用记录）。它只覆盖 S0 模式。规格状态是候选实施输入，不是已接受的产品承诺。正式服务定义未接受，S0 只用私有服务键 `s0.<名>`。

本页的每条行为都标出实现状态。当前提交只有冻结类型 `src/types.ts` 和成员文档。装载器、就绪、关闭协调器和进程入口分别由其他 S0 子闭包实现。没有实现的行为是目标，不是已有能力。

## 范围

S0 模式经真实 Cordis 4.0.4 装载标记替身，验证五件事：

1. 两层插件树的层叠、运维操作与来源打印。
2. 受信子树的可见性：子树行能 inject 受信名，根上不能按名取得，根上同名提供者不替换子树实现。
3. 就绪诊断：PENDING 与 FAILED 分开，直接缺项与阻塞链分开，启动门控在启动时可见。
4. 行清单与应用装配页的机读差分。
5. 有序关闭的阶段次序、截止时间与报告闩锁。

S0 不接 HTTP，不创建租户，不打开业务状态根，不读真实秘密，不实现任何业务方法，不提供默认 allow。S0 成功不表示首条路径可运行。

## 入口与输入

入口命令：

```text
node apps/harness-server/dist/bin.js s0 --distribution <绝对 JSON 路径> [--operator <绝对 JSON 路径>] --readiness-timeout-ms <正整数> --shutdown-deadline-ms <正整数>
```

`bin.ts` 只解析参数、调用 `runS0` 并设置退出码。它不是 `omne` 命令的一部分，也不注册全局二进制。

配置是 UTF-8 JSON，解析为 `unknown`，在边界经同步 zod schema 严格校验。校验拒绝未知键、非法值、重复行 id、未知插件导出、未知运维目标和异步 schema。插件清单是显式 allowlist，不按输入字符串动态 import。

## 插件树与运维层

树只有两层：发行层和运维层。租户与组织不是第三层。运维操作有三种：`replace` 替换一行的配置，`disable` 停用一行，`insert` 在已有锚点行之后插入一个 allowlist 内的行。

- 每行只装一个插件。
- 整行替换配置不改变该行的作用域。最终树打印的 `visibleSource` 仍是 `release-code`，`configSource` 标 `operator`。
- 运维操作的目标 id 不存在，或产生重复 id，装载前失败，退出 2，诊断写明目标与操作，零个插件体运行。
- 运维者插入的行可见集合为空。

## 装载与可见性

装配入口创建根 `Context`，为每个作用域创建一个不导出的 `Symbol` 标签。装载第一行前，入口提供根运行时对象的替身：`s0.principalIssuer`、`s0.sessionWorkPrincipals`、`s0.runtimeContextTrust`、`s0.requestContextTrust`、`s0.toolStartFence`、`s0.toolStartAuthority` 和 `s0.assemblyLifecycle`。测试参数 `omitEntryObjects` 可省去其中任意一项，CLI 不暴露它。

装载前检查，失败均退出 2，零个插件体运行：

- 行 inject 的受信名不在该行可见集合中。
- `sameProviderGroup` 相同的名不是由同一行提供。

之后按最终树顺序，对每行从根依次 `isolate(名, 标签)` 得到该行上下文，再 `plugin(...)`。`await ctx.plugin(...)` 完成不等于 ACTIVE：入口读取每行实际 `fiber.state`，并对 Cordis 4.0.4 的 `FiberState` 枚举做穷尽映射。

可见性规则：

- 子树行能 inject 受信名，得到入口创建的那个实例。
- 根上的插件体按受信名取值得到 `undefined`。
- 根上同名提供者与子树提供者并存，两者都 ACTIVE，子树消费者得到子树实现。
- 同一作用域内第二个同名提供者 FAILED，错误含 `has been registered`，不静默覆盖。

行 id 与受信成员的唯一源是应用装配页。S0 的行快照由脚本从该页抽取，抽取与差分归 S0-C。

## 就绪与诊断

- 直接缺项（`missing`）与阻塞链（`blockedBy`）分开报告。
- PENDING 与 FAILED 同时出现时都输出，整体为失败。
- 超时不把 PENDING 改为 FAILED。LOADING 超时单列 `readiness-timeout`。
- 私有 barrier 回调只在全部启用行 ACTIVE 时调用一次。随后入口按登记次序调用全部 `start`。
- 构造时的检查在启动时以 FAILED 可见，不推迟到首次使用。

`accepting` 恒为 false。S0 用私有 barrier 的调用次数证明启动门控，不靠常量。

## 进程输出与退出码

stdout 每行一条 JSON 记录：

| 记录 | 字段 |
| --- | --- |
| `tree` | 每行：`id`、`plugin`、`source`、`configSource`、`visible`（受信名）、`visibleSource: 'release-code'`、`implementation: 's0-double'`。装载前完整输出 |
| `row-state` | `RowState` 的全部字段 |
| `startup-result` | `profile: 's0'`、`scope: 'loader-only'`、`accepting: false`、启用行数、`outcome` |
| `shutdown-step` | 序号、阶段、行 id、动作 |
| `shutdown-result` | `ShutdownReport` |

进程在输出 `startup-result` 之后自动发起计划停止。

| 退出码 | 含义 |
| --- | --- |
| 0 | 启动全部 ACTIVE 且关闭 settled |
| 2 | 配置、解析或装载前检查失败 |
| 3 | 至少一行 FAILED |
| 4 | 仍有 PENDING 或未完成 LOADING |
| 5 | 启动为 0 但关闭 incomplete |

启动码非零时取启动码。

## 有序关闭

本节规定计划停止时的协议。意外退出与非计划卸载不适用本节；那时各行的 disposer 只发起停止，其结果只进诊断，不能当作有序关闭成功。

**登记。**装配入口在装载第一行前，在根上下文提供 `assemblyLifecycle` 服务。需要参加关闭的行在插件体内调用 `register(handle)`，句柄声明阶段 `entry`、`business`、`composition` 或 `storage`。登记落在调用方 fiber；该 fiber 撤除时自动退登记。插件体重跑后，协调者只持有新句柄。句柄不进插件树，不发布为其他服务。

**预期登记者。**发行层为每行写明它是否须登记、登记哪个阶段。关闭时某个预期登记者没有句柄，记为 `not-registered`。预期登记者的句柄已随行撤除，记为 `disposed-before-stop`，并附 disposer 发起的关闭结果作诊断。

**步骤。**

1. 收到计划停止请求后进入停止状态。再次请求返回同一个结果，不再次调用任何句柄。此后不调用新的 `start`。
2. 计算截止时间 D：当前单调时钟加配置的 `shutdownDeadlineMs`。全部阶段共用 D。
3. `entry` 阶段：并发调用全部 `entry` 句柄的 `stop(D)`，等全部结束。接入停止接收新请求，结算在途请求与观察流。
4. `business` 阶段：并发调用全部 `business` 句柄的 `stop(D)`，等全部结束。各业务的停止准入、交接与等待真实结果的语义归各自拥有者。业务交接未决时，句柄返回 `incomplete`，原责任与可查询状态保留在耐久事实中。
5. `composition` 阶段：调用会话存储组合的句柄，得到「会话存储组合关闭结果」。该结果分别保留目录 `close()` 与 Session SQL 实例 `close()` 的结果。
6. `storage` 阶段：调用 SQL 提供者句柄的 `stop(D)`，即 G2 的 `close({ deadlineMonotonicMs: D })`，得到 SQL 关闭报告。
7. 形成最终装配关闭报告：逐句柄结果，加 `not-registered` 与 `disposed-before-stop` 各项。只有全部结果为 `settled` 时，整体为 `settled`；否则为 `incomplete`。报告写出后即确定，之后不再修改。
8. 报告确定之后，调用 `storage` 句柄的 `assemblyReportSettled()`。不得早于第 7 步。
9. 撤除 Cordis 根。disposer 的结果只进诊断。

**阶段规则。**一个阶段的全部句柄结束或到达 D 之后，才开始下一阶段。到达 D 时未结束的句柄记为 `incomplete`，协调者继续下一阶段，不等它。句柄抛出时记为 `failed`，继续下一阶段。报告确定后才结束的句柄只写诊断，不改变报告。协调者不关闭任何业务连接，不回滚提交；SQL 连接与 Worker 只由 SQL 提供者在第 6 步关闭。

**结果。**整体 `incomplete` 时，进程不能报告平滑退出成功。下次启动时，未决工作由原拥有者按原身份查询与认回。

**已知限制。**单实例部署。跨进程 writer 排除不由本协议提供。

实现要点：S0 用私有服务键 `s0.assemblyLifecycle`。正式定义归 kernel-basis，接受后迁移并删除私有定义。关闭协调器的时钟可注入。每次句柄调用与报告确定各写一条带单调序号的 `shutdown-step` 记录。

## 已知限制

- 正式服务定义（`definitionMappings`、`tenantDomainLookup`、`sessionWorkPrincipals`、`sessionPrincipalBindings`、`assemblyLifecycle`）未接受。S0 只用私有键。
- 暂停项（inbox、owner 解析器）不在 S0 中出现为服务。
- 生产插件 ABI、身份与授权、存储、真实回复和真实业务交接，都不由 S0 证明。
- 同进程反射遍历 `ctx.reflect.store` 可取得受信实例。这是 kernel-basis 已记录的非保证。S0 不测试它，也不宣称阻止它。
- 生产 Node 版本与服务模式的停止触发方式由后继任务固定。
- 本页除类型外的行为在当前提交尚未实现，见「采用状态」。
