# Model 使用示例

这五课教开发者通过公开入口受理、查询、观察并收场一次调用。每个脚本都可独立运行，关键 API、真实入参和返回判别直接留在脚本内。英文与中文准备步骤分别见[English](../README.md#run-the-learning-examples)和[中文](../README_ZH.md#运行教学示例)。凭据判定另见[消费指南](../docs/context.md#独立消费入口)。

## 准备并运行

在仓库根使用 Node.js 24 或更高版本和 pnpm 10.28.1。新检出先安装依赖，再构建 Model 及其依赖：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @omne-harness/model... -r run build
pnpm --filter @omne-harness/model examples
```

已有依赖且锁未变时复用依赖，不重复安装。修改源码后重新构建。这里尚无已发布的 npm 安装教学；示例解析 workspace 公开入口的构建产物。

单独执行一课：

```sh
pnpm --filter @omne-harness/model exec node --experimental-strip-types examples/01-submit-and-query.ts
pnpm --filter @omne-harness/model exec node --experimental-strip-types examples/02-observe-and-settle.ts
pnpm --filter @omne-harness/model exec node --experimental-strip-types examples/03-output-limit.ts
pnpm --filter @omne-harness/model exec node --experimental-strip-types examples/04-input-over-limit.ts
pnpm --filter @omne-harness/model exec node --experimental-strip-types examples/05-read-and-acknowledge.ts
```

## 按顺序学习

1. [提交与查询](01-submit-and-query.ts)。提交前先编码引用，再用 judgeAdmit 判断显式 principal、tenant、call、admission operation 及 payload，区分 ok 与 field/reason 失败。成功后调用 admit，随后以原引用 inspect。Reply 先判 ok 或 failure，Lookup 再判 found 或 not-accepted。accepted 只是受理，发送次数为零。
2. [观察与收场](02-observe-and-settle.ts)。由受信宿主调用 driver，普通消费者 connect 到 live handle 并观察。首事件为 snapshot，后续 changed 只含确认后的内容和状态。inspect 的 found.state.phase 为 settled 时，读取原 Settlement。
3. [输出限额](03-output-limit.ts)。传输提供实际 trim，终局保持 completed/limit。脚本打印的 `upstream trim` 是传输输入，**不是 runtime 结果读取返回的明细**。Snapshot 没有完整 trims；第五课通过公开消费取得实际 trims 并提交 processed ACK。内存 Commands 的实际保存另由行为测试验证。
4. [输入超限](04-input-over-limit.ts)。先经 judgeFixedModelRequest 固定请求，解析预算通过不表示供应商 token/context 限额通过。drive 本地成功仍可形成 failed 业务终局。fault.cause 为 input-over-limit，reported 只保存上游给出的 metric、limit 和 actual，未报告值保持 null。不能重发同一输入或自动换供应商。消费者决定调整输入后，以新 call 和 admission 发起新调用。

5. [读取与确认](05-read-and-acknowledge.ts)。按 started/acknowledged 区分结果，逐页处理 sealed/partial 和 trims，最后关闭读取。消费者保存完成事实后提交 processed ACK，重复同参数认回原回执。ACK 前保存 operation reference、原 result 和证据。恢复时解析该引用，commit-unknown 重入原 operation 和证据。输出包含 `read closed: ended`、原 ACK 身份、`pending` 清理状态及 `same ACK: true`。

[共享装配](../tests/example-support.ts)解释固定请求、消费者声明、当前资格、可信证据、有限容量、同步凭据围栏、脚本资源、手动时钟与 publication。此文件只整理重复适配，不封装 admit、inspect、connect、observe 或消费方法 的教学调用。

## 核对输出与返回形状

前四课依次输出以下语义值。第二课还打印实际 Settlement JSON，其中随机 version 和 source.record 每次不同，不比较它们的具体字节。

```text
admission: accepted
admission call/revision: mcall_example 1
phase: accepted
transport starts: 0
observation: snapshot
observation: changed
termination: completed stop
settlement: {"version":"mrver_...","termination":{"kind":"completed","reason":"stop"},"source":{"owner":"model-memory","record":"...","revision":"...","digest":"..."}}
transport starts/closes: 1 1
termination: completed limit
upstream trim: 7 output-limit
termination: failed input-over-limit
reported: {"metric":"context-tokens","limit":"2048","actual":null}
transport starts: 1
```

第五课依次打印两页的结果、关闭状态和 ACK 回执。以下输出用占位符表示随机 result version、receipt record 和 digest，不比较它们的具体字节。

```text
part: sealed text []
termination: failed
part: partial tool-arguments [ { removed: '2', reason: 'upstream-cut' } ]
termination: failed
read closed: ended
ACK: mcall_example mrver_... mop_example-ack {
  owner: 'example-consumer',
  record: '...',
  revision: '1',
  digest: '...'
} pending
same ACK: true
```

代码中的 `Reply<T>` 为 `{ok: T}` 或 `{failure: ModelFailure}`。Admission 返回 call、revision、recovered 和同一 reference。inspect 的 Lookup 返回 found.state 或 not-accepted.operation。CallState 以 phase 区分 accepted、running、retry-decision 与 settled。Settlement 的 version 是结果身份，termination 是原业务终局；source 的 owner、record、revision、digest 标识提供者保存的原终局依据。这些说明帮助阅读实际结果，精确定义仍归[公开类型](../../model-contract/src/result.ts)和[共同协议](../../model-contract/SPEC.md)。

## 失败和资源责任

脚本对每个关键 Reply 显式判别，失败时退出非零。生产调用还须区分 commit-unknown 与确定拒绝，unknown 只能按原 operation 核实，不能改 call 重发。脚本不注入 unknown；该接续由真实 runtime 行为测试覆盖。

第二课用 finally 归还观察器，再等待原 driver 并撤除 publication。观察器 signal 或 return 只结束观察，不取消业务。driver 消费唯一原流，preserve 确认终止后发起唯一释放，同时推进 settle。释放失败不撤销已确认业务终局，drive 失败时仍须 inspect，不能自动重发。完整支持边界归[实现规格](../SPEC.md#已实现的调用收场)。

本装配只信任它自己生成的 principal、租户与证据，凭据为合成字符串。生产环境需要真实身份、工作资格、来源/排除证明、Commands 后端和宿主实现。脚本不证明厂商发送、耐久、跨进程恢复或可靠消费。首内容前策略待定、无控制 interrupted、sender.not-started 和丢失原终止依据均不由示例补成默认成功。

先构建本成员与依赖，再运行 `pnpm --filter @omne-harness/model test` 执行行为测试和五个示例。`pnpm --filter @omne-harness/model typecheck` 也检查示例。独立验收继续由接受者判断，命令退出零不能替代教学内容复核。

契约范围见 [SPEC](../../model-contract/SPEC.md)，目录导航见 [index](index.md)。
