# Opus 5.5 public 与 service 前缀缓存证据（有限证据已核对）

本包整理 2026-09-29 已发生的 OpenRouter → Anthropic `anthropic/claude-opus-5.5` 五次付费请求，没有重新调用模型。绑定为 definition revision `2`、`pi-ai:anthropic/mp4-5`；场景明确配置 `ttl: 1h`、`last_message`、low effort、输出上限 256。它们是本次输入配置，不是产品固定策略。本包不是接受决定。

| 路径 | 结果 | cache read | cache write | 上游费用 USD |
| --- | --- | ---: | ---: | ---: |
| public 冷请求 | complete | 0 | 8256 | 0.066144 |
| public 暖请求 | complete | 8256 | 0 | 0.0017472 |
| service 第 1 轮 | complete | 0 | 8222 | 0.065872 |
| service 第 2 轮 | complete | 8222 | 20 | 0.0019604 |
| service 第 3 轮 | complete | 8242 | 19 | 0.0019564 |

五笔原账本条目均为 settled，与收据逐笔一致，实际合计 **$0.1376800**；这五笔没有 unknown。没有检查或修改其它账本条目，不能据此声称全账本 unknown 为零、历史未知费用消失或全局 unknown 数量没有变化。每笔批准预留为 $6.981120000000000000，不是实际费用；manifest 上限是五次请求。

public 冷暖收据使用同一实际 wire SHA，实际缓存写入与读取均为 8256 tokens。service 三轮均记录 requestInput known、observedInput from_usage 和 durable true；关闭收据记录业务与整体 complete，宿主在业务关闭后 released。此处仅复核原安全收据，未独立读取 JSONL 物理批，不声称 M/R 物理同批重新验收通过，也没有从收据推断实际回复文本。

## 溯源与保全

`inputs/` 原样保存获准场景、公开目录与精确端点价目；场景/价目 SHA 与 manifest 匹配，价目引用的两个 raw SHA 也匹配。`outputs/` 原样保存五笔收据、冷暖对照、关闭收据及 manifest，并单独摘取唯一原账本的这五条原值。`scripts/` 保存六份与 manifest 精确匹配的原顶层脚本，没有用 runner-v2 等后继脚本替代。

[inputs.json](inputs.json) 给出本包文件 SHA、整理时 HUB HEAD、费用与来源；[pack-verification.json](outputs/pack-verification.json) 给出本次只读一致性复核及全部 17 个源码／脚本 SHA 对照。当前源码已有后续变化，各项保留 expected/observed 两个 SHA 与是否匹配的结果；这是并行推进中的一次读取观察，不是冻结 HEAD 原子快照。整理时 HEAD 不等于已执行源码版本；允许输入没有独立锁定执行 commit 或工具版本，因此不借用 Fable 的 commit／环境声明，也不把本次付费事实称为当前 HUB 全链验收。

`assemble.py` 是本次整理程序；它仅读取明确列出的公开输入、脚本、manifest 指定源码与唯一账本，并筛选五个 ID，没有读取凭据、配置、service-data 或 session logs，没有执行付费脚本。重新整理需保有原始私有目录，且不得把它理解为新的付费授权。脚本本身含依赖路径和凭据读取逻辑，未包含凭据值；若恢复原执行脚本，应放回对应源码修订的 `tmp/priority-certification/`，本包不是可直接重新付费运行的独立项目。

## 明确未覆盖

- 没有复制或读取密钥、配置、完整 service-data，也没有复制全账本。未另取 dry/review/paid 控制台日志或物理批结果；与参考 Fable 包的这些差异是遗漏边界，不伪造补齐。
- service liveWireSha256 原值为 unavailable；approvedLocalWireSha256 仅证明批准的本机输入摘要，不能冒称生产线路实际摘要。
- 本结果只支持本精确绑定、输入前缀与配置下缓存实际生效。没有验证 1h 到期、其它 TTL、工具／图片、全部 effort、其它模型或完整首批模型交付，也不证明本地 tokenizer 等于上游精确计数。
- SHA 一致性与安全标记扫描不构成任意秘密内容不存在的数学证明。公开输入／安全收据来源限定是保全边界；最终正式入 record 由主线审查。

## 主线复核

原始文件SHA逐项回读通过；manifest记录的11个产品源码SHA全部与`9959a47d`一致，详见[root-source-verification.json](outputs/root-source-verification.json)。这是对记录源码的匹配，不能推导未列入manifest的每个文件均被锁定。主线接受本包作为已发生的有限缓存结果证据，未接受为整型号完整认证；物理批及未覆盖输入门仍按上文边界保留。
