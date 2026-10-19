# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。组级边界见[组架构](../../docs/architecture.md#凭据的现有装配边界)。

## 模块与依赖

| 模块 | 持有什么 | 依赖 |
| --- | --- | --- |
| [records.ts](../src/records.ts) | 磁盘记录的形状、解码与编码；解码时经 legal-identity 重新铸造租户值，经 model-contract 解码凭据身份 | model（状态类型）、model-contract、legal-identity |
| [store.ts](../src/store.ts) | 保管库句柄、内存快照、文件锁、刷新、原子发布、确认未知、关闭、诊断列表 | model（判定函数）、model-contract、proper-lockfile、records |
| [index.ts](../src/index.ts) | 根入口：保管库工厂与诊断类型 | store |
| [cordis.ts](../src/cordis.ts) | Cordis 绑定入口：`LocalCredentialPlugin`、配置校验，并转出 `deliverInjected` | model-cordis-contract、Cordis、store、deliver-injected |
| [deliver-injected.ts](../src/deliver-injected.ts) | `deliverInjected`：经静态注入取得 `modelCredential` 并调用 model 的 `deliver` | model（`deliver`）、model-contract、model-cordis-contract、Cordis |

依赖方向是 cordis.ts 到 store.ts 到 records.ts，反向没有。deliver-injected.ts 不导入 store.ts 与 records.ts：注入发送只经服务取得凭据，不打开保管库。根入口不导入 Cordis 或 cordis.ts。本包依赖 model 取得判定函数与状态类型；model 不依赖本包。

## 关键机制与理由

**判定与保管分离。** 存在性与解析的取舍是 model 的业务判定，只读一份状态快照。本包负责产生快照：每次判定前从磁盘刷新，再把快照交给 model 的判定函数。这样替换保管实现不改判定，判定的缺陷也只在 model 修复。代价是状态形状（绑定、寿命、工厂秘密、关闭标志）成为 model 的公开导出，本包必须按它构造。

**每次刷新而不是缓存。** 保留的句柄与 Cordis 服务要观察其他进程造成的轮换、撤销与损坏，因此 `present`、`resolve` 每次读盘。关闭标志是进程内的，刷新保留当前进程的决定，不从文件读取。

**文件锁不按时间过期。** 把 proper-lockfile 的过期接管设为最大安全整数，任何有限的时钟跳变都不会让活着的持锁者被接管，代价是崩溃后须人工清理锁文件。API 同步，所以等待锁用不让出事件循环的退避。

**两段式发布。** 临时文件 `fsync` 后重命名，再同步父目录。重命名之前的失败不改变已发布状态；重命名之后的失败只能报告「可能已发布」，由调用者核实。

**插件以闭包持有保管库。** Cordis 把服务实例的代理交给消费者，`#private` 字段经代理失败，实例属性可被任何能读 `ctx.modelCredential` 的插件取得，所以保管库只放在构造函数的闭包里，实例上只有 `present` 与 `resolve`。

## 验证与维护

保证与测试的对应见 [SPEC](../SPEC.md#组合与验证)。状态类型随 model 的判定变化时，同步 [records.ts](../src/records.ts)、[store.ts](../src/store.ts) 与测试。服务定义变化时同步 [cordis.ts](../src/cordis.ts) 与 [deliver-injected.ts](../src/deliver-injected.ts)。
