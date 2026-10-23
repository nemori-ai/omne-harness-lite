# M2 公开契约消费者

[English](README.md)

## 职责与状态

`@omne-harness/m2-contract-skeleton` 是 B3 的 private 临时验证应用。它运行治理编解码与公开 Model scripted conformance，并报告八个 M2 跳点及其缺口。首版内部检查通过时，`fullPath` 仍为 `incomplete`。

应用没有生产命令或部署角色。固定协议消息与 Model 脚本结果只是测试输入。[SPEC.md](SPEC.md) 拥有报告行为及唯一的[详细缺口清单](SPEC.md#h01)。

## 使用

在仓库根目录通过共享测试槽执行。先构建应用声明的依赖闭包，再运行检查。

```sh
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton... run build
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run test
```

`test:fast` 选择快层，`test:slow` 选择有界超时用例，`test` 运行两层。没有选中用例的成功退出不证明应用行为通过。

本地测试入口 `src/index.ts` 导出 `runContractSkeleton()`。结果包含场景、逐跳观察、结构诊断、`checksPassed` 与 `fullPath`。入口不输出标准输出，也不写入耐久状态。

## 契约

应用经公开 package exports 消费[治理协议](../../packages/access/public-contract/SPEC.md)与 [Model testing](../../packages/model/model-contract/docs/public-api.md#符合性断言)。直接依赖还提供已解析的法定标识、JSON 预算与 UTC 时间。[应用规格](SPEC.md#public-dependencies)列出导入及测试接缝。

`checksPassed` 只表示本次调用中的固定检查结果。Vitest、独立评审与 QA 各自保留结论。整跳状态与片段状态分别表达。协议片段或 Model 片段通过不表示业务跳点已经连接。

## 设计

固定场景表检出遗漏、重复及未执行。固定跳点表维护公开入口、责任、ownerCards 与缺口正文链接。聚合器保留缺失及重复诊断。Model 消费逐项要求所有公开义务恰好出现一次且状态为 `pass`，其中包括关闭与 abort 义务。单独检查 `report.ok` 不足。

## 配置与运行

应用要求 Node.js 24 及以上版本，以及仓库冻结的 workspace 依赖。应用没有环境配置、网络服务、凭据、数据库或后台进程。Model conformance 对每次操作采用 500 ms 上限。测试使用 15 秒外层上限，每次创建独立 subject。

## 验证

[测试](tests)通过真实编解码函数与公开 scripted suite 验证消费者。反例覆盖错误响应关联、缺失或重复的跳点及义务、缺 hook、异常、超时和释放失败。报告不保存凭据、登录证明、响应正文或 provider 原始错误。

这些测试只证明受控输入下的消费者行为。它们不证明真实身份执行、Session 持久性、真实 Model 供应商或完整 M2 部署。runner 发现和独立接受由仓库交付流程核验。

## 维护

B3 消费已采用的上游变化，并在 [SPEC.md](SPEC.md#h01) 保持缺口可见。[N1 #677](https://github.com/nemori-ai/omne-harness-lite/issues/677) 拥有最终归属裁决。[退出规则](SPEC.md#maintenance-and-exit)要求迁移时保留消费者断言，并删除被替代的临时入口。单次执行日志与独立评审证据留在任务 `tmp/`。
