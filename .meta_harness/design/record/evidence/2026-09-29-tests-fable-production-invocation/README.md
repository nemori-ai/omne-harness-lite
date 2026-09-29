# Fable 5.1 生产公开调用与三轮 service 验证

2026-09-29，在 HUB 的正式 `invokeModel` 与示例真实认证／Cordis／SL3 装配上，经固定 OpenRouter → Anthropic 路由实际执行。首个完整场景的源码状态为 `b19d6bd3`，definition 2／`pi-ai:anthropic/mp4-5`，显式 1h last_message 缓存配置、low effort、可见文本、显式 tokenMargin。本记录是有限生产验证，不是整模型 D7 或全部 37 型号的接受。

[inputs.json](inputs.json)记录版本、SHA、环境、物理批次检查和费用；`inputs/`保存实际执行脚本及实时端点价目原件。`outputs/`保留三次运行的原始安全收据、场景、清单、关闭事实、本机演练结果及原失败日志。执行脚本恢复到仓库 `tmp/priority-certification/` 后按实际相对公开制品入口运行；正式账本始终是唯一已授权账本，不能以归档收据建立替代账本。

## 实际结果

| 运行 | 已发生的请求与结果 |
|---|---|
| run1，输出上限16 | public 截断，48 input／16 output，$0.00128；账单已结清，未继续 service |
| run2，输出上限256 | public 完成，48／165，$0.00873；service 首轮截断，14／256，$0.01294，原回复和 Response 已耐久，业务／诊断／宿主关闭完成，未继续后两轮 |
| run3，明确短答记忆场景，上限256 | public 完成，70／75，$0.00445；真实 service 三轮完成，分别36／4、59／7、81／7，费用$0.00056／$0.00094／$0.00116；原回复为 OK、LANTERN、LANTERN |

共7笔，实际费用$0.03006，全部 settled，未新增 unknown；此前11笔 unknown 的既有费用保留与预算占用未改变。每次请求前经同一预算门持久预留，前两次遇非 complete 后停止，没有自动重试；后续属于重新冻结并本机验过的新有界场景。

run3 的三个响应原物理 JSONL 行各自包含完整 `[message,response]`，reply 与 response.reply 相同；计量依据随原响应保存，prefixBoundary 依次1／3／5。原工程诊断 [actual-planning.jsonl](outputs/actual-planning.jsonl)显示 `full → marginal → marginal`，观察 provenance 为实际 `Anthropic` 与精确模型；诊断不是替代上游账量。关闭收据确认 businessComplete、complete、hostReleasedAfterBusiness 均为 true。原数据库、完整日志与密钥材料保留在任务私有目录，不发布；临时生产密钥副本在执行进程结束后已删除。

## 前提与未覆盖

实时目录在2026-09-29T05:58:31Z取得，端点 anthropic 可用；脚本采用872000输入上限及各价目最高写缓存费保守预留，每笔结束结清后才预留下一笔，未并发占用四笔全额。请求实际输入很短，所有 cache_read/write 都为0；这不是缓存命中、TTL到期、图片、工具、其它effort或故障恢复全门认证。缓存长前缀及其它三款 Anthropic 另验。

service 未提供 live pre-send wire 观察口，所以清单中的 service SHA 明确是本机演练预期，**不声称已取得生产 service wire SHA**。实际证明来自生产返回、原SL3响应、诊断与真实关闭。public wire 在发送前由实际 planner 核SHA。本机演练两轮8次TLS、unknown费用停止和6项预检负控只证明相应本地门；这里没有将其冒称线上请求。
