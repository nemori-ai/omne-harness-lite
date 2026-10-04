# Sonnet 5 public 与 service 缓存证据（有限证据已核对）

整理 2026-09-29 已发生的 `anthropic/claude-sonnet-5` definition `2`、`pi-ai:anthropic/mp4-5` 请求。本次整理没有重新调用模型或修改账本。场景显式配置 `ttl: 1h`、`last_message`、low effort、输出上限 256；配置不是产品写死策略。

| 路径 | 结果 | cache read | cache write | 上游费用 USD |
| --- | --- | ---: | ---: | ---: |
| public 冷 | complete | 0 | 8256 | 0.033068 |
| public 暖 | complete | 8256 | 0 | 0.0016952 |
| service 第 1 轮 | complete | 0 | 8222 | 0.032932 |
| service 第 2 轮 | complete | 8222 | 20 | 0.0017984 |
| service 第 3 轮 | complete | 8242 | 19 | 0.0017984 |

五个唯一请求实际合计 **$0.0712920**，原账本五条均 settled，与安全收据及 run-summary 逐值一致，没有这五笔的 unknown。`service-observed-*` 与同 ID 的 `service-*` 是同一请求的两次观察，唯一差异为 durable 从 false 变为 true，不重复计账。关闭收据和 summary 记录完整关闭，宿主在业务关闭后 released。每笔批准预留 $3.490560000000000000，不等于实际收费。

`inputs/` 保存批准场景与公开原价目；`outputs/` 保存全部顶层安全 JSON、仅五个选定原账本条目及整理复核；`scripts/` 保存 manifest 精确匹配的七份 runner-v2 原执行脚本。场景、价目、两个 raw 价目及脚本 SHA 全部核对，见 [inputs.json](inputs.json) 与 [pack-verification.json](outputs/pack-verification.json)。当前源码若已更新，保留执行 manifest expected SHA 与整理 observed SHA，不把当前 HEAD 冒充执行版本；源码观察不是并行仓库的原子快照。root 报告执行于 `7595c196`，本包原安全收据本身没有 commit/环境字段，故不把此报告冒充独立复核。

`root-preflight-observation.txt` 是 root 的现场记录，不是原 stderr：前置脚本 source 路径准入遗漏 `tools/model-probe/src/budget.mjs`，在 openProductionLedger 与 HTTP 前以 exit 1 拒绝；root 当场核原账本仍 327 条且无 lock。随后补入预算／gate 两个精确路径。此失败没有模型请求，不补造第六笔；本包保存的七份脚本是成功执行 manifest 对应的修正版，不伪称原失败版。旧脚本和旧生成场景仍在原私有临时区，本包未复制它们，也未独立重演失败。

service 实际 live wire 摘要仍 unavailable，本机批准摘要不能当成生产抓线摘要。durable 是原收据事实，本次未读取任何 service-data/session logs，不声称已独立核对 M/R 物理同批或 full/marginal 计算。未读取 key/config/credentials，未复制全账本，也不判断其它历史 unknown 的变化。

本包证明此精确绑定与场景下上游缓存实际写入和读取，不覆盖 TTL 到期、其它 TTL、工具／图片、其它 effort、其它模型、完整首批交付或本地 tokenizer 精确性。没有额外 dry/review/paid 原控制台输出；文件哈希和秘密标记检查不代替最终主线审查。本包已由主线按末节限定范围复核归档。`assemble.py` 只用于从原明确安全输入重新整理，不构成重新付费授权。

## 主线复核

原始文件SHA逐项回读通过；manifest记录的产品及预算工具源码SHA与`7595c196`逐项吻合，详见[root-source-verification.json](outputs/root-source-verification.json)。主线接受本包作为已发生的有限生产调用证据，不把未列入manifest的源码推定为已锁定，也不将本场景接受为整型号认证；物理批及其余适用门仍按上文保留。
