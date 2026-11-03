# 使用与定位

## 使用方式

独立宿主选择符合范围的 SQL 提供者，以本域 storage materials 注册迁移和组合，再构造发布与 supply-storage。将 repository、persistence、材料/journal、sources、当前资格与有效环境端口注入 calendar 工厂。不要直接写私表或用测试 authority 代替真实系统资格。

发行物宿主显式创建种子 registry，将 shippedCalendarSeedRelease 的完整 importSeed 输入交给供应初始化。只导入模块不会安装日历或联网。查询就绪必须等所声明种子可查询，之后再 best-effort 刷新。已有库模式可设 seed=null，但不能据此声称发行 profile 已完成。

Cordis 宿主分别装载两个 provider；配置和清理归[绑定说明](cordis.md)。独立 runner 的 contextSupplier 每周期提供新可信上下文，observer 读取业务结果与关闭残留。精确配置由根入口导出的 runner/configuration.ts 拥有。

## 消费者与定位

calendar 应用消费本包端口实现；独立本域测试装配选用真实 SQL 提供者并注入受限资格。它们不证明 settings、identity、notification、Tool 宿主或最终 harness 已正式采用。Schedule/Job 和跨域同提交守卫仍留 A2/M2 后。

依赖方向归[组架构](../../docs/architecture.md)，完整行为归 [SPEC](../SPEC.md)。
