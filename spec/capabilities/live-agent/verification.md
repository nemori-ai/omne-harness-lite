# 目标运行时 v1 的验证

对象：[capability.live-agent v1](v1/contract.md)及
[data.agent-runtime-identity v1](../../data/agent-runtime-identity/v1/contract.md)。
规范场景和形式配置随 v1 冻结，运行输出位于 [evidence/v1](evidence/v1/model-runs.json)。
上游 [46 项测试和两份源模型](evidence/validation.md)仍只说明固定上游源码基线。

## 行为抽象和映射

Runtime.tla 表达任意常量集合上的关系；RuntimeMC.tla 与 cfg 将其实例化为两个
租户、A 的两个 Session 和 B 的一个 Session、四个不复用生命期、同解析键的两代 Factory，
以及一个可反复使用的工作槽。a1/a2 为 A 的 sa，a3 为 A 的 sb，b1 为 B 的 sc。
sa/sc 代表不同租户的同一局部 Session ID；sb 是 A 的另一个 Session。这是有限检查边界，不能
推论任意规模、进程故障、真正线程内存模型或 TypeScript 实现精化。

| 规则/场景 | 模型动作或性质 | 没有由本模型证明的部分 |
|---|---|---|
| AR-1/2，S02/03 | Admit；TenantSafe、IndexExact、Reservation | 可信认证、对象级权限、列表/订阅隐私、序列化入口实现 |
| AR-4/5/6/7，S01/04/06/23 | Reserve、Prepared、Close；Unique、Reservation | Session attachment 当前性屏障、实际 setup 资源登记和事件重入 |
| AR-8/10/12，S07/08 | Admit、Settle、Release、Cleanup；OwnedWork、NoEarlyRelease、NoLeak | 工作槽抽象为完整受管工作树；子工作真实结束、授权门、外部事实及所有权移交须由提供者验证 |
| AR-11/13，S10 | closing/releasing、CleanupFailure；占位与资源不提前消失 | 逐资源清理依赖、不可重试/永久丢失、多个等待者、等待超时及取消 |
| AR-15/16，S11/20 | Bind、RetireFactory、DropFactory；ProviderHeld、ReadyBound | 多解析键/作用域独立性、任意 Cordis HMR、必要服务的非计划物理丢失 |
| AR-2/7/10，S03 | LateCleanup 的精确实例判断 | 跨重启 ID 分配、旧 Run 执行权、外部迟到效果归属 |

正常配置将四个 Unsafe 选择（AllowCrossTenant、EarlyRemove、StaleRemove、
EarlyProviderDispose）全部设为 FALSE；TRUE 仅用于证据目录中的故意错误变异，
不属于规范允许的产品行为。模型把授权抽象为已通过对象操作验证后的租户核对，
不能据 TenantSafe 宣称完整权限系统已证明。

prepared 合并准备完成与发布；未发布失败由 Close 表达。资源集合抽象成一项
owned 标记；published 是已发布事实而非事件队列。永久故障不保证进展，正常
Cleanup 表示提供者已经实际完成且安全的清理，不能仅因它在模型可执行就允许
实现强制释放。AR-3/9/14/17、AR-16 可选贡献的工作级撤除及信任前提等超出模型的语义按场景映射后续实现证据。

## 执行与进展前提

[原始安全检查](evidence/v1/safety.log)遍历 142,476 个不同状态，所有列出不变量通过；
[进展检查](evidence/v1/progress.log)遍历 86,716 个不同状态，使用 ProgressSpec，要求在途准备/工作最终
结束、清理确实能完成且相应动作获得弱公平调度。只在这些前提下检查 Drains 与
ProvidersDrain。它不承诺停止超时上限、进程故障恢复或永久资源故障下最终成功。

四份变异分别允许跨租户工作、提早删占位、旧清理按 Session 删除、先卸载仍被
使用的 Factory；要求对应不变量产生反例且 TLC 退出码为 12。
[运行清单](evidence/v1/model-runs.json)记录期望、实际退出码和完整命令；反例
不是正常任务，不注册为预期成功。具体错误可检出不表示所有错误可检出。

工具版本、文件哈希、Schema 样例及组合检查结果归
[验证清单](evidence/v1/validation.json)。没有产品源码，因此本轮没有运行时实现
符合性测试、官方 Cordis 发行包兼容测试、Alloy 或真正恢复/中断闭环试验。
结构范围已由此 TLA+ 模型表达，不为凑工具另建 Alloy 模型。

复现：在当前检出准备其自身 uv 环境，并设置实际工具路径后运行：

```sh
JAVA_BIN="$PWD/tmp/formal-toolchain/jdk-21.0.12.1+1-jre/bin/java" \
TLA2TOOLS_JAR="$PWD/tmp/formal-toolchain/tla2tools.jar" make check BASELINE=f580718
```

正式任务登记在 [formal-tasks.json](../../formal-tasks.json)。工具可位于其他实际
路径；版本和完整性应与记录核对。缺少 Java/JAR 必须失败，不能静默跳过。
