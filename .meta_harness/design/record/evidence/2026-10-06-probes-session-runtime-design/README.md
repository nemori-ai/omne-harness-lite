# Session第一期候选设计的有限取证

2026-10-06，本工作树实际执行。HEAD `2fbc2fd515a5f50172cef0325cc2fcb24480f81d`加当次设计／探路材料。规范／算法作者和执行者均为主会话；独立设计评审只审提供文本，没有独立运行这些工具。此处是原始输入／输出快照，不是第二份承诺。

[输入manifest](inputs.json)逐份绑定来源、快照和SHA-256；快照在执行结束后保存，执行后模型／探针代码未再修改。原完整argv未单独存档，下文是可重跑入口，不冒充原argv。日志保留TLC版本、seed、fingerprint及原解析路径。该候选模型尚未登记为旧catalog正式契约任务；本run局部任务名不伪称registry已接受任务。

| 实际运行 | 输入／原始输出 | 结果及范围 |
|---|---|---|
| SessionWork有限模型 | [源码快照](session-work-draft/SessionWork.tla)、[正配置](session-work-draft/SessionWork.cfg)、[原输出](session-work-draft/tlc-positive.log) | TLC2 2026.09.12.025210；4957 generated／1356 distinct，安全及WF StartOrAdopt下的有限WorkEventuallyClaimed未见反例 |
| 去同提交／栅栏／收尾核验 | [半受理](session-work-draft/tlc-HalfAccept.log)、[旧attempt发起](session-work-draft/tlc-OldIssue.log)、[错收尾](session-work-draft/tlc-StaleFinish.log)，各配置同目录 | 分别得到AdmissionConserved、NoOldIssue、NoStaleFinish真正违例；不是语法错误。初次括号错误已修正后重跑；初次原输出未归档，本文不把后续正确违例运行冒充该次结果 |
| 简化投影算法 | [代码](projection/probe_projection.py)、[原输出](projection/projection-probe.json) | seed6241，3200差分步骤；N=1000/2000/4000/8000冷访问2N，单消息追加访问1并共享原前缀，旧视图不变 |
| Cordis原语／在途句柄 | [代码](cordis/probe_cordis.mjs)、[原输出](cordis/cordis-probe.json) | 官方npm Cordis4.0.4，独立Context事件／撤除／故障隔离；inject运行两次，旧句柄释放两次，受控原调用同一身份且未被cancel |
| SQLite协议原型 | [代码](sqlite-protocol/probe_transactions.py)、[原输出](sqlite-protocol/transaction-probe.json) | SQLite3.53.1真实临时文件；双参加方回滚，100个全tail乐观冲突与100次锁内承接对照，两个重复新执行owner均未成功 |
| 现有storage-sql | [构建](existing-storage/storage-build.log)、[原子测试](existing-storage/storage-atomic-tests.log) | 现有包及依赖构建成功；两文件16测试通过。不是新Session／日志参加接口已完成 |

## 结论的限制

模型只有两输入、两Run、一调用、两attempt，可信访问与原子步骤抽象；WF只对StartOrAdopt。SingleActive只检查单一当前指针，不能证明真实多owner无第二活跃Run；ResultsAttributed仅证明settled的Run已创建，不证明完整tenant／cost归因。没有无限append、公平SQL调度、网络或执行权claim的实现模型。
投影只用简化文本块，不是生产message decoder、原response/tool配对、全外部键、字节成本、缓存资源界或并发发布的证明。SQLite是确定交错原型，不是实际provider或无饥饿调度证明。Cordis使用受控Promise句柄，没有真实模型／工具取消、结算或Session provider；不能把primitive结果升级为IC17真实组合通过。
原storage测试只覆盖已存在原语。新provider、当前权限参加、ActualIssue桥／ACK、真实OpenRouter、复杂度和资源界仍由首卡实施增量提供。全部义务见[验证正文](../../../architecture/session-agent-runtime-phase1/verification.md)，独立评审与作者处置见[提案](../../proposals/session-agent-runtime-phase1/review.md)。

## 重跑入口

有限模型可直接对本run的快照执行`tlc -config SessionWork.cfg SessionWork.tla`；负配置换为HalfAccept／OldIssue／StaleFinish。状态目录和反例输出放新的任务目录，不改本run，也不把生成TTrace留在规范目录。新的结果使用新的run-id。
三份原探针有当次任务的固定输出位置；Cordis相对模块路径也以原任务布局解析。重跑时先按inputs.json核hash，在隔离任务区恢复原`tmp/session-agent-runtime-phase1`相对布局，从仓库根运行Python脚本／Node脚本；不要直接从本证据目录执行并假设路径等价。若适配为新的输出参数／位置，记录新代码hash与新run，不覆盖本次输入或输出。公开库通过本检出锁文件环境取得，不借主检出环境。
