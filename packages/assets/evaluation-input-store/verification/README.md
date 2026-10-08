# 验证义务与边界

[SPEC](../SPEC.md) 约束本地来源与 reader；共享形状/求值归 [asset-evaluation](../../../core/asset-evaluation/SPEC.md)。本页描述可复跑资源，不保存单次执行结果。

| 资源 | 应验证 |
|---|---|
| [source.spec.ts](../tests/source.spec.ts) | 实际账户/登录/治理/STT，发布捕获、重开、明确空/缺源、current/pinned、独立返回值、两个发布者、同 SQLite 排序、完整连续版本、draft/坏源、原角色与撤销、workspace拒绝、当前锁/配值变化 |
| 同文件的诊断/锁/生命周期场景 | sink失败、真实锁及事务后纯观察、参与异常经过实际终结、阻塞 drain、Cordis撤除后的旧引用 |
| [crash-worker.mjs](../tests/crash-worker.mjs) 与 source.spec.ts | SIGKILL before_commit/after_commit_before_ack，核真实 revision及完整旧/新发布，不自动重试；不是断电证明 |
| [deployment.spec.ts](../tests/deployment.spec.ts) | meta iff、更新局部scope仍核factory、配置复制、旧裸格式显式重发布、实际锁再检查、缺项零写 |
| [registry.spec.ts](../tests/registry.spec.ts) | 实际C16/selector、等值版本、无fallback、reload/refresh角色、unheld固定正文不伪造holding、missing/unresolved/cycle、参与失败及drain |
| [history.spec.ts](../tests/history.spec.ts) | 精确旧版、unheld/换表/重开、错tenant零MF、原tuple必要、reuse移除、撤销、闭合失败/缺陷、阻塞MF及close、实例换代、双sink、同SQLite与OG竞争 |
| [default-owner.spec.ts](../tests/default-owner.spec.ts) 与 default-owner worker/seed | src/dist首用失败原抛可重试、成功复用、import零编译、生产快照不受原资源变异影响、实际SQLite对拍 |
| ts-checks的 registry-input/history 与 evaluation-publication boundary | 精确公开入口及可信实际路径；拒绝reexport、别名/动态绕过；不扩大写权或工厂分发 |

历史 MF 表项包含明确组件 fixture。组件场景不能证明真实 AR producer 的原完整填表定位、旧 report 的完整成功恢复、真实 OS 权限、外部 npm 打包消费或完整模型链的两次求值性能。相应组合责任归实际 registry/runner/assembly；不得用本包测试代替。

当前采用为同一 SQLite AtomicStorage 对象及 BEGIN IMMEDIATE 排序。NORMAL 同步策略的 SIGKILL 场景不证明掉电耐久性；不推广为 PostgreSQL或跨库相干。没有新增TLA+/Alloy模型或强制取消协议。

```sh
pnpm --filter @omne-harness-lite/evaluation-input-store... run build
pnpm --filter @omne-harness-lite/evaluation-input-store run typecheck
pnpm --filter @omne-harness-lite/evaluation-input-store run test
```

制品和真正消费者检查使用所属工具/装配的入口。报告区分 source/dist worker、组件 fixture、实际 consumer 与打包外部消费。
