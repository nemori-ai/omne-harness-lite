# 治理 CLI/TUI 终审修补与最终制品

2026-09-26，依据D038～D057已接受范围，主线完成本次单机治理交付的代码、制品和限定环境验证。覆盖Linux中心、macOS/Linux客户端的治理CLI/TUI、有限登录、组织/成员/邀请/隶属与身份切换、改密撤销、升级、在线备份、离线校验和隔离恢复。没有安装真实公司中心、提交或推送；不含Agent工作会话、WebUI/desktop实施、凭据找回或旧数据安全重新开放。

本包追加在[维护验证](../2026-09-26-tests-governance-maintenance/README.md)之后，旧制品、旧评审和失败记录未覆盖。[摘要](summary.json)、[最终源码](source.tar.gz)、[源码摘要](source-sha256.json)、[原始运行及脚本](runs.tar.gz)、[运行摘要](runs-sha256.json)保存实际输入与结果。[P3修补前打包源](source-before-p3.tar.gz)及[其摘要](source-before-p3-sha256.json)对应D057r1和第二轮Fable读取的运行实现，不能与最终源混用。

## 最终交付物

预装Node **24.21.0**，通过可信渠道核摘要后解压到新目录。运行与配置说明在每个归档的`app/README.md`；中心另附`app/deploy/README.md`及三个systemd模板。BUILD_ID标识文件清单，不是来源认证或可复现构建保证。

| 制品 | SHA-256 | BUILD_ID |
|---|---|---|
| [中心 host r3](omne-host-d057-r3.tar.gz) | `bba5d17f650011058f0592752f83dc88f68095bc1c4a0209f5925fe2921d554a` | `9b23209932a02438a80b7a173df7cee3cc2d89ec85cc26747c31028a35d574cd` |
| [CLI/TUI r2](omne-cli-d057-r2.tar.gz) | `19bf675a5f8cee4ba39dc64829d2a54589df7871973217692648941a5b841929` | `bb367e5706b00b831200a05797c1013a9d109e9016902e288f1767f5b2763ea8` |

两归档从无dist/node_modules的独立源快照离线构建。主线与独立QA各核所有文件、软链与BUILD_ID：host 2950项、CLI 2922项。Vitest/Vite/rolldown等测试运行依赖不在生产闭包。严格普通Storage消费者与显式Vitest符合性消费者分别安装编译，`skipLibCheck:false`通过。符合性入口声明仍要求测试消费者自备Vitest，这是[D057](../../decisions/governance-conformance-runner-adoption/README.md)明确的边界。

另保留已实际验证的[host r1](omne-host-d057-r1.tar.gz)和[CLI r1](omne-cli-d057-r1.tar.gz)，仅用于还原P3修补前观察，不作为本次最终安装选择。中间host r2只完成构建，之后因诊断措辞收窄由r3替代。

## 源码与故障验证

18成员合计 **1926通过、34明确跳过**：17个非host成员取`fable-full-tests-r2.log`，最终host取`fable-host-full-r3.log`（187通过/11跳过）。不是一次最终源全绿命令：host措辞在前次host运行期间收窄，重建后独立完整重跑；前次通过日志保留但不作为最终host依据。最终类型、格式和20条边界规则检查通过。形式模型本轮明确skip，领域契约及冻结模型未改，不将旧有界模型结论扩展成无条件证明。

S59初始化资源反例落实在原storage属主：marker/root/parent句柄打开后立即登记；协调库从构造成功起保强引用，释放不先ROLLBACK；实际未关向原属主传播，业务句柄与已取得的源锁保留，host不接管资源。10个真实故障子进程检查GC、实际句柄状态、跨进程占用与退出后接手。PRAGMA故障发生在BEGIN前，工作根排他尚未取得，不能称十例始终持有两把锁。

旧FileHandle实现的有效负对照为5失败/1通过；最终父探针再现同样结果，另4个协调库场景故意过滤。原r1缺系统迁移的错误夹具及r3名称过滤漏选（10项跳过）均保留，均不计产品反例。运行包含旧实现、子夹具、最终父探针与重跑命令；协调库四例没有旧实现负对照，不冒称有。

两支升级恢复/放锁叠加故障保留两个原因；host真实首次启动marker.close未关时exit1，准确报告未确认恢复、保留标记，实际退出后正常重启可恢复。初次测试TS缺this注解、格式失败与修正记录均保留。独立architecture-reviewer确认无S59/恢复/持锁阻断；关于磁盘观察失败时只能说may remain的意见已落实。

## 制品与平台验收

[最终独立QA原文](independent-qa-final.txt)：**Pass，限定范围**。原47项一次通过，额外真实host关闭故障、准确诊断及退出后重启恢复通过；两份清单和生产依赖检查通过。其前一修订[独立QA原文](independent-qa-r1.txt)同样保留，两次新增QA判据错误及修正理由没有隐藏。QA未重新执行SQL双故障注入，原位源变动精确hash/fstat阶段仍Unable to verify，不计通过。

最终制品三组真实TLS旅程通过：macOS arm64与Linux Docker arm64双向访问；Linux amd64中心接受旧D054 CLI。覆盖注册登录、组织/成员/邀请/隶属、身份隔离、移除与改密撤权、退出、正常/强杀重启和停机不重放写。PTY观察不替代GUI终端验收；容器网络不等同公司DNS、防火墙或两台物理机器。

最终host在非root Linux systemd252.39容器中通过三模板验证、在线备份、状态、verify及隔离恢复。实际FileHandle读取被测试gate阻塞超过31秒时，服务仍deactivating且源占用；放行后才结束。加速timer不拉起已停中心，备份单元失败可见。没有声称实等24小时、物理断电或任意IO停机期限。所有自建服务进程和容器已退出。

近1GiB的业务连续性与clock续约观察沿用前一[维护验证](../2026-09-26-tests-governance-maintenance/README.md)的有限范围；本轮未重复大库性能测量。TUI仍沿[D054终端证据](../2026-09-25-tests-iterm-delivery/README.md)的有限profile与未覆盖项，不能承诺任意终端/输入法。

## Fable结论与保留边界

用户指定Claude Code `fable`，三轮实际均为claude-fable-5-1，无fallback：[初轮](../2026-09-26-review-governance-cli-fable/README.md)、[第二轮](../2026-09-26-review-governance-cli-fable-2/README.md)、[最后增量](../2026-09-26-review-governance-cli-fable-3/README.md)。七项初轮意见及新增P3处置经复核成立，最终无已发现阻断。成功工具仅读取，第三轮一次不可用Write尝试被工具拒绝，详情如实记于该轮；未成功写入或执行代码。私有推理不发布。评审没有运行测试，不等于无bug证明。

保留的操作边界：新工作根只能单命令首次初始化；并发或崩溃可能留无标记根，所有占用者退出后保留旧根并改选新路径，不手补marker。状态/到期检查完整校验全部候选，最多256个，五分钟只请求取消；保留窗口与旧task残余由运维按文档管理。凭据取完整UTF8内容（含换行），不trim，无忘记凭据/管理员重置。恢复只产隔离封装，`businessOpen:false`，没有回滚旧权限后重新开放的入口。

首批只有单机备份，整机/磁盘损毁灾备验收等待独立位置；本轮不承诺RPO/RTO。共享storage非maintenance路径中极窄的关闭失败再遇放锁失败可能覆盖首因，Fable记录为非本次范围的后续诊断项；有维护的中心路径本轮已保留叠加错误。上述范围外事项不伪装成通过，也不将其扩为本期新功能。
