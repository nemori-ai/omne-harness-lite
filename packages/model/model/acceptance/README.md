# Model 持续验收

本目录验证已接受的 [PD-model-invocation revision 2 场景 S1、S2、S3](../../../../.meta_harness/design/product/model-invocation/acceptance.md)。场景由具名验收维护者维护。实施者只运行，不修改。作者自测不代替最终独立验收。

## 运行

从仓库根执行以下命令。先构建公开入口，再运行持续验收。

```sh
pnpm --filter @omne-harness/model... build
pnpm --filter @omne-harness/model acceptance
```

全仓入口 `make acceptance` 自动构建带验收脚本的成员及依赖。重负载检查使用仓库的测试槽。配置 `vitest.acceptance.config.ts` 仅选择本目录的 `.acceptance.ts`，不通过源码 alias 替换公开安装入口。`typecheck` 同时检查验收 TypeScript。

## 场景

- [成功调用](PD-model-invocation.success.acceptance.ts)驱动真实受理、发送、接收和收场。它观察正文及终局，读取全部分页结果，然后以消费者真实完成记录执行 processed ACK。
- [受理拒绝](PD-model-invocation.admission-rejection.acceptance.ts)核对 temperature 2.1 的精确拒绝、not-accepted 及零调度、零启动。
- [本地凭据拒绝](PD-model-invocation.credential-denied.acceptance.ts)从真实 driver 到 CredentialPort.resolve denied，核对 not-sent、零启动、无收场及无秘密。

## 真实路径与受控依赖

[装配](fixtures/runtime.ts)从 `@omne-harness/model`、`@omne-harness/model/testing` 和 `@omne-harness/model-contract/testing` 的公开入口取得运行时及依赖。真实 Model driver、sender、receiver 和内存 Commands 执行业务。包装器只转发调用并记录次数。

脚本传输只给出外部 block-open、block-delta、block-seal 和 ended 事实。内存身份授权与采用证据只适用于这个隔离装配。消费者完成表在完整读取并处理文本后保存本次 outcome，用于核对真实 ACK 的 handoff 输入。夹具不制造 settlement、读取页或 ACK。

`denied` 是无秘密值的凭据结果。S3 精确核对公开拒绝形状，并检查合成秘密 sentinel 不在返回中。这只证明该拒绝分支的返回边界，不证明已注入秘密的泄漏攻击。

观察者退出、读取关闭及实例发布撤除由场景显式执行。Model 仍拥有 ACK 后的 cleanup pending。本目录不证明真实厂商、磁盘耐久、生产调度、跨进程恢复、重试循环、quiesce、retained ACK 或后台清理。
