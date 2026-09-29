# GPT-6 Sol public 与 service 基线证据（有限证据已核对）

整理 2026-09-29 已发生的 `openai/gpt-6-sol` definition `3`、`pi-ai:openai/mp4-6` 请求。本次整理没有重新调用模型或修改账本。场景使用 automatic cache、low effort、输出上限 256。

| 路径 | 结果 | input tokens | output tokens | 上游费用 USD |
| --- | --- | ---: | ---: | ---: |
| public | complete | 43 | 6 | 0.000146 |
| service 第 1 轮 | complete | 15 | 6 | 0.00009 |
| service 第 2 轮 | complete | 38 | 6 | 0.000136 |
| service 第 3 轮 | complete | 56 | 6 | 0.000172 |

四个唯一请求实际合计 **$0.000544**，原账本四条均 settled，与安全收据及 run-summary 逐值一致，没有这四笔的 unknown。四笔 cache_read_tokens 和 cache_write_tokens 都是 0，**本场景没有证明自动缓存命中**，不能由自动缓存配置推断已经使用缓存。`service-observed-*` 与同 ID 的 `service-*` 是同一请求的两次观察，唯一差异为 durable 从 false 变为 true，不重复计账。关闭收据和 summary 记录完整关闭，宿主在业务关闭后 released。每笔批准预留 $4.613840000000000000，不等于实际收费。

`inputs/` 保存批准场景与公开原价目；`outputs/` 保存全部顶层安全 JSON、仅四个选定原账本条目及整理复核；`scripts/` 保存 manifest 精确匹配的七份 runner-v2 原执行脚本。场景、价目、两个 raw 价目及脚本 SHA 全部核对，见 [inputs.json](inputs.json) 与 [pack-verification.json](outputs/pack-verification.json)。当前源码若已更新，保留执行 manifest expected SHA 与整理 observed SHA，不把当前 HEAD 冒充执行版本；源码观察不是并行仓库的原子快照。root 报告执行于 `7595c196`，本包原安全收据本身没有 commit/环境字段，故不把此报告冒充独立复核。

`root-preflight-observation.txt` 保留同套 runner-v2 在先前 Sonnet 生产入口的 root 现场记录，不是 Sol 失败请求或原 stderr：source 路径准入遗漏 budget，exit 1 发生于 openProductionLedger 和 HTTP 前；root 当场核原账本仍 327 条、无 lock。随后仅补预算／gate 的精确路径。该失败没有付费模型请求；本包七份脚本是成功 Sol 执行 manifest 对应的修正版，旧脚本／场景仍在原私有临时区，本包未复制或重演。

service 实际 live wire 摘要仍 unavailable，本机批准摘要不能当成生产抓线摘要。durable 是原收据事实，本次未读取任何 service-data/session logs，不声称已独立核对 M/R 物理同批、full/marginal 算法或回复文本。未读取 key/config/credentials，未复制全账本，也不判断其它历史 unknown 的变化。

本包只支持本精确绑定与基线输入下 public 调用和三轮 service 调用完成的事实，不覆盖缓存命中、长上下文、工具／图片、其它 effort、其它模型或完整首批交付。没有额外 dry/review/paid 原控制台输出；文件哈希和秘密标记检查不代替最终主线审查。本包已由主线按末节限定范围复核归档。`assemble.py` 只用于从原明确安全输入重新整理，不构成重新付费授权。

## 主线复核

原始文件SHA逐项回读通过；manifest记录的产品及预算工具源码SHA与`7595c196`逐项吻合，详见[root-source-verification.json](outputs/root-source-verification.json)。主线接受本包作为已发生的有限生产调用证据，不把未列入manifest的源码推定为已锁定，也不将本场景接受为整型号认证；物理批及其余适用门仍按上文保留。
