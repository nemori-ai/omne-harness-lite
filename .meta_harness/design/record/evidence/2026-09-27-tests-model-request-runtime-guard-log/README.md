# W15：诊断故障隔离与公开 dispatchGuard 的有限技术签收

2026-09-27，主线核对并技术签收两个明确增量：session-log-jsonl 对借用同步诊断 sink 异常的隔离，以及 runtime 根公开的纯 `dispatchGuard`。独立四态报告为 **Pass with issues**，受测产品 slice 为 **Pass**；首次环境 setup 的原 stream／wrapper PID 留存限制原样保留，不能把报告改写成无问题通过。人的总体交付接受、完整日志提供者及整个 runtime／P2 不由本次签收。

受测源码为 HUB `d7c44a262654e1237b5134badf25ea10087467b6`，包含修复 `0581656f43252b1d4760691c6df78265c1ec5ed6` 和 guard `476832b6496f47b2f34d61839a4a428c96c7eb59`。采用依据为 D083／D084／D085 的 SL3 与恢复投影、D086 的 RT4 S-60、D076／D087 保留的纯守卫投影。精确规格与提供者输入保存在归档 `evidence/inputs/` 和冻结清单；本次不改冻结规格或选择。

## 实际运行及可失败证据

| 范围 | 独立实际结果与边界 |
| --- | --- |
| 仓库外公开面 | 本树实际构建后重新 pack 16 包并 offline deploy，两目录的723个pack成员逐字匹配，各132个符号链接内闭合、无坏链／源码回链；真实 Cordis4.0.4 与 Node24.18.0 |
| 日志诊断隔离 | 原最小脚本 SHA256 `15ef9b109515992f127c628367d58768547cf01937c86768209fe7a497f1dde9` 未改，两目录健康重开／完整读取通过。真实 read/write/close EIO 继续失败，内部 Error 不被吞；取消编译代码中的 sink 隔离后同一断言失败 |
| 真实停止和所有权 | 真 close EIO 孩子退出前仍持文件和 SQLite 锁，报告保留非零快照；父观察 actual exit／close wait 后新 owner 才取锁读回并关闭。实际无 Cordis／kernel 的日志 IO 副本和真插件 blocked dispose 均检查；24个实际根最终重新 acquire／close、owned FileHandle／DB为0 |
| guard | 两目录各85条独立具名oracle，覆盖终结／reply_pending优先、跨attempt开口、unknown传播、wrongPhase／failure／provider顺序、完整原snapshot与严格自有JSON。调用时不读时钟、env、随机源、timer、IO，使用合法取得事实的前提不由函数建立 |
| 编译行为负控 | 四份独立compiled副本分别去掉诊断隔离、伪装真实read EIO成功、将opened unknown当false、将终态判定放到opened之后；均语法通过，同一正常oracle命中指定AssertionError，未将loader／fixture非零算作检出 |
| 双语公开示例 | 日志8块＋runtime4块逐字从README／pack提取，两目录TS6.0.3 strict NodeNext、skipLibCheck=false编译并实际执行24个模块；四个invokeOnce实际本地HTTPS/SSE调用，均complete、Agent销毁、server停止、socket0。无付费／公网模型调用 |

最终41条选定正向命令均有实际 child PID／wait／exit0，215个主具名oracle通过；真实故障child的两条断言记录另列，不混入主计数。HUB当时实际 log178／runtime21、拓扑build／typecheck／限定format／source rules通过，原始命令和首次错误在 [root集成归档](root-integration.tar.gz)。

## 原件、核对和留存问题

[独立报告字节快照](independent-REPORT.txt)、[机器摘要](independent-summary.json)、[原归档元数据](independent-archive.json)、[完整归档清单](archive-manifest.json)、[冻结hash](input-hashes.json)、[主线逐项核对](root-verification.json)及[限定签收结果](acceptance-summary.json)均保留。原Markdown作为txt保存，以保持原文和原相对路径；解开归档后报告仍位于原 `evidence/` 布局，不能把搬移后的摘要链接当原件。

主线亲核1204个输入／dist hash（含1个执行者自有ignored brief）、零漂移，并完整读回归档28893个常规文件，1140个符号链接全部在归档图内闭合；3029个目录＋1个内嵌manifest，共33063成员。[归档](closed-public-artifacts-and-runs.tar.gz) 86405265字节，SHA256 `b69b10ecd2a890f339c3cb84006a577bb11ec35987c8478473f62713f3f6b090`；manifest SHA256 `9d1862321911a72c8b2508be60c3f6ea1c5302049c41e1d44f3f1404296f2480`。主线另核root集成归档83个文件逐字相同；文件摘要见 [file-hashes.json](file-hashes.json)。

独立初次setup用了本机Git不支持的选项，原common-dir stdout被测量重试覆盖，wrapper PID未另存；实际tool transcript文本、child argv／PID／exit已在归档中明确归因保留。所有业务首次失败／fixture修订／原stdout／stderr／实际wait完整保留。主线核对也保留一次把执行者private brief误要求出现在HUB的测量失败；修正仅比较范围，没有改产品或oracle。

当前HUB `b6833514f9b4d4ecd7dbc8dbc59d5bfd4602eb17` 已另外合入retryDelay。相对受测冻结清单，仅runtime的双语README、package description、公开index及其四个dist文件变化；guard／日志生产源码和受测依赖字节相同，三个新纯函数公共面合并后的120项测试及6个TS块另由root实跑通过。**retryDelay仍待自己的独立验收，不由W15代签。**

[原804独立Fail字节快照](baseline804-REPORT.txt)原样保留；本次是修复后的新运行，未覆盖旧结论。原IO／并发／SIGKILL等证据只沿其旧输入和前提读取，本次未重新执行整套旧矩阵，不签收完整日志提供者。

## 未覆盖

生产RG-G1退出观察、PID复用／supervisor恢复、宿主C5健康监控及async sink完成、旧SL2全部写方迁移、D088完整codec及G29真实同批／来源／停止、G28／G30／G31、十三服务操作、五共同结算构件、P3～P6与整体P2仍未完成。纯guard的事实不构成当前权限或生产状态权威。Linux本地FS、实际进程与同步／锁测试不能证明机器掉电持久性，未运行形式工具，不声称无条件证明或全仓绿灯。37官方生产认证仍 **0／37**，本次付费0。
