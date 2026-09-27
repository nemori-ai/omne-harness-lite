# D-085：SL3 JSONL 恢复识别增补采用

2026-09-27，主线依用户“Implement the plan”、遵循已接受 spec／realization 实施及主调度／验收职责授权，技术采用 [v3-recovery-design](../../../realization/packages/session/session-log-jsonl/v3-recovery-design.md) rev 2，SHA256 `ea205862968dbe54889d7ba4b80ffcb33e04318c5ba8a82fb09367c1bbd324ae`。来源为 [SLJ3-RG1 三候选比较](../../proposals/model-request-adaptation/log-recovery.md)，承接 [D083](../session-log-tail-condition-adoption/decision.md) 和 [D084](../session-log-jsonl-v3-projection-adoption/decision.md) 已接受的恢复前提；没有新增产品政策、业务操作、日志 Schema 或通用进程能力。

采用每日志在业务文件可能改写前耐久建立 active、健康关闭或逐出后耐久 clean；active 恢复须可信旧物理进程退出事实及独占锁，两者缺一不可。必填本地 processOwnership 输入不进入三操作业务面；同物理进程各实例必须有同一生命身份，不能用 PID、close、fiber 重跑、锁可取或新随机值冒充退出。未知历史保持 unknown，旧布局须实际全部旧写者退出证据。标记、next、文件任务、观察任务和句柄都由同一提供者生命周期持有。

保留正常索引路径、SLJ-11 信任前提及 V-1 反例；active 恢复从字节0全扫，进入 clean 前必须耐久替换正确索引或删除旧索引并同步目录。只有回执丢而耐久批／判定态已成时仍健康；实际 IO 已结束且成功截回并同步时后续恢复健康；真正不可信时三操作 unavailable，必须实际物理重启后恢复。清理失败不假成功、不提前放锁。原 D084 正文、四参数条件、失败优先级和同一 entries.jsonl 提交域不变，本增补只补此前未规定的恢复识别手段。

独立 architecture-reviewer 初审及定向复审无阻断，保持中等置信度；spec-reviewer 初审 ER1 阻断、ER2 非阻断，rev 2 仅修修订号、RG-V3、RG-V7 三行后两项闭合。38 输入及 SL3 原24冻结资源无漂移。完整初稿／修订／作者检查与归因摘要的 [61 文件归档](../../proposals/model-request-adaptation/reviews/session-log-jsonl-recovery-2026-09-27.tar.gz) SHA256 `f019adaad5ade451a7861a867bc2d987d41941b1d06a0031d0c150cad12f3495`，主线已逐字读回。评审未执行实际 IO 或形式工具；其意见不代替本次技术采用。

RG-G4 的候选技术采用由本事件闭合。RG-G1 真实宿主身份及跨主管重启退出观察、RG-G2 实际 FS／同步／SIGKILL／LRU／清理、RG-G3 所有实际闭包／插件调用者和双语 README 迁移仍未完成。允许原施工 owner 只在本包完成增补，不授权新进程平台或 apps 里填未定义治理责任。10项新 oracle 尚未执行，新增 bindings0；当前部分源码测试不能移作新恢复路径通过。平台／存储前提不能成立时返回主线重选，不能放宽 exited 的含义。

Run 认法、共同业务键／完整批认回、所有旧结算写者实际停止、合法完整读权、headers 投影及消费者预算策略仍由原 owner 承接。此事件不放行 P2／P4／P5、37认证或人的总体交付签收。

主线实际登记后 internal design／formal=skip 退出0（13.625秒）、diff check退出0；原argv／cwd／输出与归档读回见 [checks.tar.gz](checks.tar.gz)及接受摘要，不作为形式或IO运行。
