# v3 形状样例

[可执行样例](entry-examples.json)逐项指定Schema的definition、value、valid，凭据仅为合成占位。
包含expectedTenant缺席/多余、`capability.organization-governance/v2#S-55`读邀请的账号与租户两种分支、改密禁止传他人账号、两种拒绝以及按登录标识邀请；这里的OG2 S-55不是本契约S-55 backup。
形状合规不证明授权/时限/同提交；执行证据另存，不写在冻结候选中。

## 维护场景

新增80项机器形状样例覆盖4个输入、全部可达正常失败、成功、unknown、位置限制、元信息及字段封闭。示例所有标识、位置和摘要都是合成数据。
`examples.json` 的 `valid` 只判 Schema；下表判行为，不能用形状通过代替。执行状态均为未开始。

| 场景 | 前提/动作 | 必须观察到的结果 |
|---|---|---|
| 在线一致副本 | 业务并发改写时执行 backup | 观察区间内固定一个完整观察，各 owner 检查相同副本；业务仍服务，登录活动不因维护延长 |
| 在线部署单槽 | 一个部署属主已有backup或backup-status工作（含目录候选检查），再接另一维护请求 | busy且不排队，不能通过另一个操作名绕过部署单槽 |
| 离线共享工作区 | 两个进程使用同一维护工作区调用verify/restore-isolated | 同一工作区跨进程互斥，后到者busy且不排队；原工作真实收场前不交出工作区 |
| 离线不同工作区同源 | 两个独立调用在不同工作区并行verify同一封装 | 可并行；各自固定同一输入观察、独立持久隔离暂存，不因源文件相同要求全机排他 |
| 并行恢复竞争目标 | 不同工作区只读同一封装，但restore-isolated指定同一新目标 | 目标独占仍成立；不能覆盖或并入另一调用已取得的目标，目标存在者为target-exists |
| 到期的两道边界 | onlyIfDue=true，已确认最新副本年龄分别略少于20小时、恰20小时、恰24小时、超过24小时 | 第一项 not-due；后三项到期可补做；status 在恰24小时仍 current，超过24小时为 overdue |
| 相同时间 | 两个合格同中心文件 startedAt 相同 | 取 fileName 逐ASCII字典序最小；不借此声称较新事实 |
| 其他中心 | 目录只有中心B副本，运行中心A | status missing/latest=null/invalidCount=1；onlyIfDue 到期，不删改B副本 |
| 外中心未来时刻 | 目录只有完整合法B副本，startedAt晚于now；当前中心A、now可取得 | 先核完整性并排除B，再评价A的时间；status missing/latest=null/invalidCount=1，onlyIfDue到期，不因B未来时刻unavailable |
| 忽略非候选 | 配置目录直接条目含300个不匹配名的文件/隔离工作目录，其中子目录有匹配名文件；没有匹配名直接条目 | 不递归、不计候选上限或invalidCount；status missing/latest=null/invalidCount=0 |
| 候选数先判 | 配置目录有257个匹配名直接条目，即使均为目录、坏件或其他中心文件 | capacity，不能先排除它们把候选数降到256以内 |
| 匹配名非普通文件 | 一个匹配名目录和一个匹配名符号链接，链接所指是有效文件；另有非匹配名文件 | 不跟随或递归，前两者各计invalid；status missing/latest=null/invalidCount=2 |
| 类型或读取故障 | 匹配名条目无法判类型，或普通文件读取发生I/O故障 | unavailable；不把故障计invalid，不报missing |
| 当前中心未来时刻 | 完整合法且身份为当前中心的匹配名普通文件，startedAt晚于now | unavailable；与外中心未来时刻的先排除分支区分 |
| 缺失与坏文件 | 空目录／两个已知坏封装／读目录失败 | 分别 missing/0、missing/2、unavailable；不能全写空集合 |
| 上限 | 候选257个、头超过16KiB、数据超过1GiB、空间不足 | capacity；不能截断或删除旧成功副本后假成功 |
| 不可靠时间 | 取不到now，或now早于已通过完整性与当前中心核对的候选startedAt | unavailable，不算负年龄，不返回not-due |
| 发布未确认 | 输出已公开可见但持久确认失败 | backup unknown 指该fileName；文件保留，不自动重试或报 completed |
| 重取确认失败 | 一个较新完整候选确认失败，另有已确认较旧候选 | backup-status及onlyIfDue均unknown，不返回较旧 current，不另建备份 |
| 后续显式检查 | 上次unknown的文件完整，本次持久确认成功 | 新status可将它计有效；verify只能答verified，不提升其耐久状态 |
| 校验不开放 | verify通过一个原中心合法副本 | verified/businessOpen=false；源不变、原中心标识不换、登录与底线不重置 |
| 恢复不开放 | restore-isolated从有效文件到不存在目标 | restored-isolated/businessOpen=false；交付隔离封装、原身份原值；生产打开拒绝 |
| 已有空目标 | targetLocation是已有空目录 | target-exists；不覆盖、不合并 |
| 目标unknown | 恢复目标发布后确认失败 | outcome-unknown/fileName=null/targetLocation=请求目标；保留目标、不开业务 |
| 表示与结论分开 | 缺sourceLocation／位置含控制符／可读文件摘要不符／文件读不到 | 前两项invalid-input，后两项invalid-backup、unavailable |
| 关闭与断连 | 接纳导出后断连接并请求停止；超过原网络等待界，导出尚未结束 | 仍持有维护工作和源属主，拒绝新任务，保持stopping；不能报已关闭或启第二属主 |
| 取消与残余 | 取消发生在发布前，分别清理成功/失败 | cancelled仅前者；后者unavailable且本机无秘密诊断有残余位置，始终隔离 |
| 已发布但清理失败 | 输出耐久确认后，句柄已关闭，未发布暂存清理失败 | unavailable，诊断说明已发布输出保留和隔离残余位置；以后新status可重新确认输出。若耐久仍未知则unknown优先 |
| 取消后到 | 发布持久已确认后取消到达 | 报真实完成而非cancelled，不删除已发布物 |
| 隔离建立前故障 | 持久隔离尚未确认即失败/崩溃 | 没有明文出现 |
| 清理回退 | 明文删除后进程/OS崩溃使删除回退 | 隔离拒绝依据仍在，所有受支持生产打开路径拒绝 |
| 调度边界 | 中心有意停止或仍在停止时调度触发 | 不启动中心；运行且前提齐备时每小时尝试，实际24小时保证需核对剩余4小时预算 |
| 输出裁剪 | 扫描全部结果、元信息、日志、诊断 | 没有账号列表/凭据/出示物/原始查询语句；受保护副本不被打印 |

反例说明：`{status:'outcome-unknown',backup:...}`、unknown的两个位置都非null、verified/businessOpen=true、restored-isolated/businessOpen=true 均为形状错误。`startedAt>finishedAt` 或摘要与内容不符属于语义错误，即使 Schema 通过仍须 invalid-backup；不虚称 JSON Schema 能比较两个时间或验证文件内容。
