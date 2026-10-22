# 测试运行器验证

变异测试的现行行为与限制归 [使用说明](../README_ZH.md#差分变异)。

| 资源 | 层与范围 |
| --- | --- |
| `mutation-guard.spec.ts` | 快层。公开 TestRunner 的 this、参数、结果与生命周期透传；声明不能在进程内重载；第一次拒绝直接报告 Error；全原始报告的 RuntimeError 门槛与形状校验。 |
| `mutation.spec.ts` | 快层检查范围、配置与报告，含 static 超时的分类。慢层启动真实 CLI、Stryker 10.0.0 与 Vitest 4.1.11，覆盖普通存活、Killed、文件收集错误与深层 suite 自身错误、预检、static 运行的类型测试、可控耗时注入下的 static 超时、多 worker、同 out 重跑及旧报告留存。 |

在仓库根运行，重验证须通过共享槽：

```sh
scripts/with-test-slot.sh pnpm --filter @omne-harness/test-runner exec vitest run --mode fast tests/mutation.spec.ts tests/mutation-guard.spec.ts
scripts/with-test-slot.sh pnpm --filter @omne-harness/test-runner exec vitest run --mode slow --typecheck.enabled=false tests/mutation.spec.ts
```

运行前清除外部 `BASELINE`，并按[开发环境要求](../../../docs/development.md#准备可用的检出)准备 Git 等工具。慢层夹具需要可执行真实仓库操作的 Git。慢层夹具独立创建仓库，不操作产品数据。设置 `OMNE_MUTATION_FIXTURE_EVIDENCE` 可保存静态收集错误的原始报告与 CLI 输出。

这些资源验证本工具的测量边界，不证明产品成员的测试质量，也不重算旧读数。
