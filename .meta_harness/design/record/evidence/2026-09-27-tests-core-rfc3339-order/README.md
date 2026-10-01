# W17：core 精确 RFC3339 比较的限定技术签收

2026-09-27，主线核验并技术签收 D089 B/R1 的公开 `compareRfc3339Instants` 增量。独立产品切片 **Pass**、证据 **Pass with issues**：首次产品执行前 oracle 元数据脚本失败缺独立 PID/完整本地 stderr，保留 ISSUE-1，不补造原始记录。人的总体接受与完整 model-request-runtime 纵线未完成。

受测 HUB `56d69e3647636cc13acb58d5ec0bd667fab3d191`，源码 `878f8bf8d4cca4483ea13624e88d09ec14619514`；正式依据为 [D089](../../decisions/model-time-order-projection-adoption/decision.md) 精确采用 [rev1 投影](../../../realization/packages/core/offer-expiry/rfc3339-order-design.md)，SHA256 `249c68ea3239977131cc44be3d75dbd31474e0659355258c2606833eb2bfaab2`。本次记录只更新证据和节点导航，产品源码、旧毫秒 Instant/Clock、Schema、锁和包元数据不变。

## 实际覆盖

| 范围 | 实际执行及限制 |
|---|---|
| 纯公开比较 | 任意小数精度、偏移同点与反字典序、年界、完整日历/原串拒绝、固定脱敏错误；R1以合法时点为前提，ok不认证闰秒公告或历史来源 |
| 两闭合制品 | 自己锁定build/fresh pack；每根878常规文件、零链接，63产品pack成员逐字一致。每根9475具名oracle：7662案例、1798三元顺序和15纯面/拒绝/旧面检查；两物理目录独立且仓库外 |
| 独立有限oracle | stdlib date/calendar的400年周期提升及Fraction，不复用作者expected；seed20260927，1800普通样本、300偏移别名、有限137/12002位小数。2015/2016闰秒夹具亲核IERS，合成边界只测条件内核 |
| 真编译负控 | 量化与原串字典序两项严格TS编译/语法0，真正公开根加载后分别命中TO-V1.submillisecond、TO-V4.reverse-lex-offset的AssertionError退出1；仅复制包dist/rfc3339-order.js一项delta |
| 文档与旧API | 六个英/中literal×两目录严格NodeNext/skipLibCheck:false编译和12实际执行；150测试=85旧+64行为+1类型。README_ZH来自冻结维护源，现有pack未发布它，不冒称tgz内含 |
| 纯资源 | 41主动拦截自检/40端口名称；全部向量/三元组在业务阻断区复核，effects/async/resources=[]，实际FD21→21；正常模块加载另列。所有owned产品子进程actual wait结束 |

主线亲读[独立报告原字节](independent-REPORT.txt)、[机器摘要](independent-summary.json)、两实际控制断言与wait，逐项核[198受测输入](input-hashes.json)与当时HUB匹配。完整读回3993常规文件、548目录及内嵌manifest共4542成员，并核每个原文件当前字节；[root核验](root-verification.json)与[实际脚本/PID/wait/raw](root-verification-runs.tar.gz)保全。现有七HUB集成检查与core150的原始运行已在独立归档的36派发输入中保留，不冒称又执行一次。

## 保全与限制

[完整归档（已外置）](../2026-10-01-checks-model-runtime-repository-cleanup/README.md#外置原件)36336882bytes，SHA256 `8cd8e512c714f10383ac6a4ab94636c92d6b90146efb825ae8563a0f8e0ed53a`；[成员清单](archive-manifest.json)SHA `4e37be7881a195e6eab66a0b51a6015479e1eae2c2941151903fd17e6a034ab3`。[独立外置封存回执](independent-archive.json)保持原绝对路径和实际archiver wait。报告以txt原字节保存，解出归档的evidence/consumers可独立回跑；不改原报告或旧失败。

首轮formatter误纳README、oracle缺Path和诊断期望修订、crypto非configurable拦截安装错误分开保留。ISSUE-1原首次raw/PID缺项不能补回，后续产品/编译/控制/最终测量命令记录完整。作者成本按brief允许亲核相同78源/dist的已有raw，未独立重跑成本，不作无限精度性能承诺。

[限定接受清单](acceptance-summary.json)只接受条件排序构件；新增规范bindings **0**。现有证据不能把helper比较提升为MR4完整时间关联或OE1/S22之外的新业务保证，故通过节点verification登记TO-V义务。

**未闭**：TL-G1实际生产时间/宿主/合法历史/公告、runtime timing和opened原值/来源、G28/G29-P/H/G30/G31、五结算构件、十三服务操作、37完整官方定义与认证、整体P2–P6及人的总体接受。没有模型请求/付费/发布，official仍0/37。

[逐文件校验](file-hashes.json)覆盖本记录封存工件；同一受测产品字节上的有限结果不证明完整monorepo或所有消费者。登记后 internal/formal=skip 结构检查实际退出0（PID127008），原命令、实际wait和raw保全于post-registration-checks.tar.gz；未运行形式工具。

## 2026-10-01 归档位置变更

原运行结论和原始摘要保持。成批源码、制品及依赖归档已按用户选择移出 Git，原文件逐 SHA-256 保全；取回位置、字节摘要及历史提交映射见[归档迁移记录](../2026-10-01-checks-model-runtime-repository-cleanup/README.md)。原清单中的路径是运行时地址，读取外置文件时按迁移清单恢复，不能把本机保全称为远程备份。
