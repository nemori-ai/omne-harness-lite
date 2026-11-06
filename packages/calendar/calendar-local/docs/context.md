# 使用与定位

## 使用方式

独立宿主选择符合范围的 SQL 提供者，以本域 storage materials 注册迁移和组合，再构造发布与 supply-storage。将 repository、persistence、材料/journal、sources、当前资格与有效环境端口注入 calendar 工厂。不要直接写私表或用测试 authority 代替真实系统资格。

发行物宿主显式创建种子 registry，将 shippedCalendarSeedRelease 的完整 importSeed 输入交给供应初始化。只导入模块不会安装日历或联网。查询就绪必须等所声明种子可查询，之后再 best-effort 刷新。已有库模式可设 seed=null，但不能据此声称发行 profile 已完成。

Cordis 宿主分别装载两个 provider；配置和清理归[绑定说明](cordis.md)。独立 runner 的 contextSupplier 每周期提供新可信上下文，observer 读取业务结果与关闭残留。精确配置由根入口导出的 runner/configuration.ts 拥有。

## 消费者与定位

calendar 应用消费本包端口实现；独立本域测试装配选用真实 SQL 提供者并注入受限资格。它们不证明 settings、identity、notification、Tool 宿主或最终 harness 已正式采用。Schedule/Job 的写入协调与执行验证由相应交付单独承担。

依赖方向归[组架构](../../docs/architecture.md)，完整行为归 [SPEC](../SPEC.md)。

## 读取日期环境

构造 `createCalendarSettingsEnvironment({settings, resolve})`，把结果注入 Calendar 的 environment 端口。settings 使用真实 SettingsReadPort；resolve 从原调用恢复真实主体及已采用映射，不能从模型字段发行主体。绑定指定一个目标、准确声明引用、时区与日历的配置项。runtime 模式仍需要 Settings 的合法 selectionRef。

适配器只读取一次，保留完整 basis 的 revision。两项配置均须存在，日历可显式为 null。声明默认值由 Settings 求值决定，适配器不补默认。查询错误不能解释成已经卸载目标或没有日历。使用资格仍由 Calendar authority 独立检查；写入守卫不能用这个读取结果代替。
