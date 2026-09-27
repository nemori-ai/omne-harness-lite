# Session-log v3 候选：有限形式执行 run 1

2026-09-27 独立执行，主线核对并保全。结果是 **20／20 个指定入口符合判据**：2 个 SANY exit0、3 个正 TLC 配置 exit0、15 个负控／可达配置 exit12 且命中指定断言；没有工具或语法错误冒充负控成功。详细报告、实际 argv／cwd／进程终态、原始输出及逐份反例判读见 [REPORT.md](REPORT.md)、[RESULTS.json](RESULTS.json)、[commands.json](commands.json)、[trace-inspections.json](trace-inspections.json)和输入归档。

## 精确输入和范围

输入来自 `model-request-runtime-b1-spec` spoke，基线 `60c0652df9a396b5ef9af256809638be37b42c2a` 上未提交的 24 项候选资源及 2 项导航文件。**基线 commit 不能独自识别本候选**；实际 contract SHA256 `f7086724e58e736dc5dccc92dcd936eabda82c1cae5c0fbf523c966ed51e1fa8`，26 项快照摘要见 [input-snapshot.json](input-snapshot.json)。候选表达评审随后要求修正 S-35 通用调用者范围等措辞，本 run 不改写为新正文输入；模型／配置是否继续适用须另核精确字节和性质范围。

| 正配置 | generated／distinct／depth | 实际结论 |
| --- | --- | --- |
| session-log-v3-appends | 5846／2784／8 | queue0；无不变量反例 |
| session-log-v3-tail-attempt | 44385／17539／23 | queue0；无不变量反例 |
| session-log-v3-tail-run-end | 44385／17539／23 | queue0；无不变量反例 |

TLC `2026.09.12.025210` rev `867aefb`、SANY2.2、Temurin21.0.12.1+1；JAR SHA256 `db131ddb48e7004d823bef4493df7b35694babe37505b9d9fa5685e7a331f1f1`。实际工具版本／字节在归档 metadata。每任务1worker，最多3进程并行，300秒测量期限；没有超时／终止／重启。`-metadir` 仅改为独立证据目录，原 argv 和变更原因保留；模型、常量、断言不变。

SessionLog：两 attempt、一个不透明键、两个追加槽，MaxLen3，至多一次 crash，无条件追加投影。TailSettlement：两个结算者共用一个 response 身份，一方单响应、另一方消息＋响应；原 attempt1、MaxRequests2、最多一个边界及一条无关记录；分别测较新 attempt 与同 attempt 的终结。正配置启用 CheckTail／AtomicTail／CompleteRead／SafeRecovery；未声明公平性或 liveness，CHECK_DEADLOCK FALSE 不成为进展保证。

15 份负控／可达配置逐份读取，覆盖判重／栅栏／易失判重、无尾检查、分离比较、部分读取、未知回执误认零写及冲突／重复／late 可达。负控在首反例停止，未穷尽全图。UnknownAsNoWrite 的首反例是仍有待提交写者，并非“已提交但丢确认”分支；Reach-Late 是边界后直接 late，并非冲突后重试；Reach-Duplicate 首轨迹仅展示 actor1 赢。这些具体限制沿报告保留。

## 保全与未覆盖

主线核对执行者 202 项清单摘要一致；26 输入、40 份 raw output 和15份trace的原核对记录保留。`inputs-and-raw-outputs.tar.gz` 保存143文件及归档脚本，全部从压缩包逐字节读回；只排除可重算的 TLC metadir／Python cache，原始 argv、模型／配置、stdout／stderr、trace、工具状态和测量自检均保留。

- 原始输入及运行归档 SHA256：`2ee953b1599a83ec87c9e50ec75a90d49e5e4df5029600be9814b73d4de82f7c`。
- 最终 RESULTS SHA256：`36be162b28ef821b87073e70d9cb4aa928cb3799c61dead3d465969da9cbb583`。
- [input-and-output-hashes.json](input-and-output-hashes.json)给出完整保全摘要，九项测量解析自检见 [measurement-selfcheck.json](measurement-selfcheck.json)。

**这不是规格接受或实现验收。**批次原子性、稳定身份和 stopped-writer 在模型中是抽象前提。真实 JSONL IO／跨进程互斥／崩溃重开、旧 append／网络／回调真正停止、租户初始化零写、完整失败优先级、合法读取权限、生产 Run 终结认法、无损载荷、完整批认回及无限争用进展均未证明，也未做 refinement proof。RT3 仍精确依赖 SL2，withRun 仍须新规范消费和提供者投影；本次付费0。
