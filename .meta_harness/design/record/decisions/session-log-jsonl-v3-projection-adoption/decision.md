# D-084：SL3 JSONL 三操作提供者的技术采用

2026-09-27，主线在用户“Implement the plan”、按已接受 spec／realization 实施及主调度／验收职责授权内，技术采用 [session-log-jsonl/v3-design.md](../../../realization/packages/session/session-log-jsonl/v3-design.md) rev 2，SHA256 `f8561eed58597fbb972d474b14648f74f74cafae3d1125f7813a45a4c241b351`。依据 [D-083](../session-log-tail-condition-adoption/decision.md) 已接受的 SL3 三操作与尾条件、[D-081](../model-late-coordination-direction/decision.md) 的共同日志提交方向及既有 D-062／D-065 JSONL 节点。没有新产品政策、日志业务操作或存储选型。

独立 architecture-reviewer 两轮无本次阻断，保留中高置信度及索引信任、停顿／全量扫描、文件机制取证成本的强反方。spec-reviewer 初轮 SLJ3-ER1 指出旧 V-5 的截回失败读旧确认尾与新三操作 unavailable 相冲突；rev 2 仅升修订号及两处明确替代说明，定向复核关闭 ER1，无新表达问题。28 项输入无漂移，旧设计／v2／四件套原字节在评审中保全。详见[评审及归档](../../proposals/model-request-adaptation/review.md#2026-09-27-sl3-jsonl-提供者投影独立评审)。评审意见不代替本次采用或实际验证。

采用范围为本页完整投影：沿既有属主文件锁、每本日志队列、一行一批、datasync 与首次目录同步，在同一 `entries.jsonl` 提交域执行租户、尝试栅栏、判重、尾比较及整批持久确认；固定失败优先级，tailChanged 仅该批零写、不初始化租户或占位置；无键及 unfenced 合法。纯判定／无损编解码和独立 openJsonlSessionLog 闭包公开，薄 Cordis 插件只提供三个服务操作及成对生命周期。

**明确局部取代**原 design 和 verification V-5 中“截回失败后仍经正常读面读取旧确认尾”的预期：SL3 不可信态的三个操作均 unavailable；必须实际停止旧任务／旧物理进程，独占重启并从权威日志字节零点扫描恢复。成功截回后恢复健康、其余故障注入、正常派生索引路径与原 SLJ/F 前提保持。旧正文和旧有限结果保留其原版本／事件范围，不改写成新版行为已经执行。未经物理停止的扫描、后次 tailChanged 或旧尾空读都不否定旧 unknown。

新面必填第四实参 condition，不保留三参数默认 unconditional。只有全部实际写方显式采用后才能切换同根 provider；关旧业务准入、停旧潜在写方，旧日志关准入／排空／关句柄／最后放锁或实际退出，新 owner 独占恢复后才开闸。原 RT3 仍规范消费 SL2，必须出新消费版本；不能以本次提供者采用直接换线。原历史 JSON 值不因接口升级被补成新版业务记录。

本事件允许按精确设计实施本纵线必要日志三操作包及其公开双语文档，不承担完整会话／Agent Loop／工具产品。共同 ResponseId／MessageId codec 和整批认回、生产 Run 认法、合法完整读权、所有潜在 unfenced 结算写者停止、MR4 多值 headers 投影、消费者争用策略及耗尽责任仍由对应 owner 交付。日志不解释 Run／late，不为这些缺口增加业务回调、恢复操作或假默认。

11 项新增 oracle 和原实际 IO 义务尚未执行；新增绑定 0，源码尚无。SL3 有限 TLC 只沿 D-083 的有限状态与前提，不证明物理锁、真实 IO、StopOld、生产 Run 或无限争用进展。此事件不是 P2/P4/P5 放行、37 官方认证或人的总体交付签收。
