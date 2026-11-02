# 宿主文件工厂行

本行消费 [host-local 的公开工厂](../../../../packages/execution/execution-environment-host-local/docs/cordis.md)，采用 [HOSTFILE-FACTORY-ROW](../../../../docs/architecture/runtime/application-assembly.md#hostfile-factory-row) 的固定绑定。行提供 `host_machine` 的宿主提供者，不新增服务键。

## 入口持有责任域

每次 `runServe` 在任何行装载前创建一个 `HostFilesDomain`。该域保留在入口闭包中。工厂行重载继续使用同一个域。不同 `runServe` 调用创建不同域。域不进入配置、树记录、入口对象注册表或 Cordis 服务。

发行绑定只有 `executionHost` 导出与 `execution-host` 行。入口把绑定后的行声明交给现有 profile。生产导出表和测试导出表使用同一绑定路径。用户字符串不参与动态导入。

预检拒绝其他行使用该导出，也拒绝运维 `insert` 新增工厂行。检查发生在任何行体与入口对象安装之前，退出码为 2。运维 `replace` 可以修改发行行的配置。来源检查读取原始操作，因此不会把合法替换误当成插入。

## 行配置

`filesRoot` 与 `stateDirectory` 必须显式给出。Windows 使用带盘符的绝对路径，Linux 使用 POSIX 绝对路径。入口不补文件根。其余成员字段沿工厂的公开 Config 校验。未知字段与错误值在装载前以固定诊断拒绝，不输出原输入或错误原文。

`maintainIntervalMs` 是本行额外的正安全整数字段，初值为 60000。包装层消费该字段，其余字段交给成员工厂。原生计时器不能容纳的长间隔分段等待。

## 周期维护

行体成功登记提供者后启动周期。入口拥有维护队列和计时器。行重载不会创建第二个周期。前一次维护结束后，才开始等待下一段完整间隔。所有显式请求也经过同一队列，维护调用不重叠。

一次维护抛出时，入口只记录 `host-files-maintenance-failed`，之后的周期仍运行。停止开始后取消周期，迟到的行激活不能重新启动周期。入口关闭会等待已排队的维护，不用新的并发调用替代未结束的维护。

## 显式卸载与关闭

入口调用 loader 的 `disposeRow` 显式卸载宿主行。该操作先等待 fiber 卸载完成，再执行补维护回调。关闭器在 `business` 阶段之后调用入口结算钩子。入口先停止周期并等待已排队维护，然后显式卸载宿主行、补维护并做最终维护。最后一次结果写入关闭报告的 `hostFiles` 附录。

`maintain()` 只统计正在释放的获取，因此必须先卸载提供者。计数为 0 时附录为 `settled`，正值时为 `host-files-unsettled` 并附 `count`。维护失败或退役失败时为 `unavailable`，保留具名诊断，不填未知计数。附录不参与原 `overall` 和退出码计算。没有启用工厂行时不增加该附录。

结算超过 D 时，报告固定为 `unavailable` 与 `deadline`。迟到结果只写诊断。storage 仍在报告确定后收到确认，根撤除继续等待同一个结算任务，不启动并发替代维护。

依赖导致的自动卸载不保证随后补维护，这部分由波 3 接续。周期维护继续运行。实现不使用尚未交付的 `onRetired`，也不从 Cordis 效应嵌套推断退役完成。

关闭期限 D 约束 stop 与报告窗口。根撤除和维护清理可能继续等待，本实现不承诺整个进程在 D 内退出，也不调用 `process.exit` 掩盖未结束的清理。

## 验证范围

[行测试](../../tests/rows/execution-host/row.spec.ts)使用实际 Cordis 4.0.4、实际宿主工厂与责任域，验证重载后仍能查询原获取历史。[维护测试](../../tests/rows/execution-host/maintenance.spec.ts)使用可控维护函数与虚拟时钟，验证串行、异常、停止与长间隔。[入口测试](../../tests/rows/execution-host/run.spec.ts)验证每次运行独立创建域、启动失败与计时器清理。[预检测试](../../tests/rows/execution-host/binding.spec.ts)验证错行、运维插入、合法替换与配置拒绝。[关闭测试](../../tests/rows/execution-host/shutdown.spec.ts)验证真实 fiber 的等待屏障，以及受控维护下的顺序、残留计数、未知与迟到诊断。

[Linux 文件测试](../../tests/rows/execution-host/files.spec.ts)通过真实工厂装载行，检查根内读取和四种越界路径，并注入描述符关闭失败以检查重载后的配额保留。该故障替身只控制关闭失败，其余仍使用真实描述符。在 Windows 上这些测试跳过，不能计为通过。

Windows 可以创建责任域、登记提供者并重载。当前 F 后端在带文件根的读取上返回 `unavailable`，前提为 `unsatisfied`，原文件不变。这不表示 Windows 文件操作成功，也不表示越界拒绝矩阵通过。Linux 根内成功、根外、`..`、中间符号链接与硬链接的组合验证仍需独立平台证据。

本行保留 `HOSTFILE-FACTORY-ROW` 的具名偏离。`executionEnvironment` 依赖保留 `caller: provider`。域寿命由入口管理，提供者代次和文件责任仍由 host-local 管理。
