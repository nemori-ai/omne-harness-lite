# 模型适配探针

[English](README.md)

此开发工具用于公开目录查询和受控的 OpenRouter 缓存、提醒实验，不提供生产适配器，不认证模型，也不替代最终运行时验收。模型策略和研究结论归 `.meta_harness/`。

工具只使用 Node 标准库，无外部依赖或构建步骤；[自动化入口](../../scripts/model-probe.mjs)直接运行它。

```sh
node --test tools/model-probe/tests/*.test.mjs
node scripts/model-probe.mjs catalog --output tmp/model-request-runtime/catalog.json
node scripts/model-probe.mjs run --config tmp/model-request-runtime/probe.json --snapshot tmp/model-request-runtime/catalog.json --credential-file /absolute/path/to/.env --ledger tmp/model-request-runtime/ledger.json --output tmp/model-request-runtime/run-01
```

`catalog` 只进行公开读取；`run` 必须显式提供配置、凭证文件、账本和输出目录。没有隐式付费请求、环境凭证回退、重定向或重试。同一次交付的运行必须共用一个账本。批准总额度为 100 USD；研究额度应低于总额度，为最终实现验收留出资金。

配置示例：

```json
{
  "format": 1,
  "stage": "research",
  "budget": { "limitUsd": "100", "researchLimitUsd": "50" },
  "timeoutMs": 60000,
  "maxResponseBytes": 4000000,
  "probes": [{
    "model": "openai/gpt-6-luna",
    "provider": "openai",
    "prefixLines": 256,
    "maxOutputTokens": 128,
    "repetitions": 3,
    "cache": { "mode": "automatic" }
  }]
}
```

provider 标签必须出现在已经检查的端点目录中。前缀大小、输出上限、推理参数和显式缓存 TTL 应按已检查的模型选取；显式缓存模式必须给出 `cache.ttl`，工具没有默认 TTL。示例不代表对所有模型的推荐。记录只含合成测试内容、不含凭证的请求体、原始响应和用量事实。

预留估算使用最高的公开输入、写入、输出价格档位，以及测试输入的保守字节上界。估算不是真实账单，价格变化或意外费用可能使其失效；超支会中止当前运行。费用缺失、请求中断或遗留预留会阻断后续发送，直到取得实际费用并对账，或显式确认下述预算预留。被强制终止的进程会留下独占锁；未核查请求及账本前，不应删除锁后重跑。

对于实际费用仍不可得的既有 `unknown` 或 `reserved` 条目，`acknowledgeBudgetHold` 提供显式维护操作。以 `{ reconciliation: true }` 打开同一个批准账本，提供既有条目 ID、正数十进制字符串金额，以及非空审计理由和来源。金额不得低于原始估算。它是**预算额度预留，不是实际费用，也不是保证费用不会超过的上界**；操作不填写 `actualUsd`，保留条目的未决状态，不发请求、不替代账单对账、不改额度，也不清除遗留锁。

```js
import { openProductionLedger } from './tools/model-probe/src/production-gate.mjs'

const ledger = await openProductionLedger(
  approvedLedgerPath,
  approvedLedgerPath,
  { limitUsd: '100', researchLimitUsd: '50' },
  { reconciliation: true },
)
try {
  await ledger.acknowledgeBudgetHold(existingEntryId, '5', {
    reason: '历史费用凭据暂不可得，显式批准此预算预留',
    source: '此次额度批准的可追溯来源',
  })
} finally {
  await ledger.close()
}
```

金额应按明确授权选择，示例中的 `5` 不构成批准。生产账本入口仍检查批准路径、仅所有者可读写的普通文件和独占锁。普通打开及预留操作仅在未决条目具有针对当前状态的有效确认时放行。每项当前预留计入总额；研究条目还计入研究额度；已结算条目计入实际费用。维护检查也会计入其他未确认条目的原始估算。求和与比较保留所有小数位，超限预留在修改前被拒绝。

每次确认向 `budgetHoldAcknowledgments` 追加金额、理由、来源、请求状态和时间。修订金额必须再次显式确认，并保留历史。新出现的未知费用仍会报错，阻断后续发送，直到另行确认。已经确认的 `reserved` 条目若变为 `unknown`，同样需要新的确认。损坏的持久化确认记录不能绕过门禁。

对 `reserved` 条目调用 `settle(id, actualUsd)`，或在维护模式调用 `reconcile(id, actualUsd, { evidence, sha256 })`，会以精确实际费用替换当前预算占用，保留确认历史，且不再重复计入预留。对账仍需上游证据及其 SHA-256。实际费用若超过当前预留（无有效确认时为原始估算）或任一预算，工具会先持久化真实费用，再报错；后续预留始终核对两个预算。不会自动填写零费用或退款。

目录、定价和缓存配置字段的存在不构成缓存命中证据。结果区分 `cached_tokens = 0` 与字段缺失；自动缓存可能不报告写入数量。消息角色、工具、重试、取消和生产生命周期验收需要额外实验。

生命周期可行性实验可从 `src/lifecycle.mjs` 导入 `probeLifecycle`，传入 `packages/core/kernel-basis/node_modules/` 中已安装的 `@deepseek-ai/cordis` 4.0.4 的 `Context`。实验以模拟调用所有者检查真实 effect 释放，不验证生产注册表、HTTP 取消或超时策略。
