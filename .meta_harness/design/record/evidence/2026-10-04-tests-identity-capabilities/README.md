# R1-T2：身份与治理公共定义、提供者及管理生命周期

产品候选为 `cf4ce5874100c4271bd3b01327da7b81c443a39a`，实施 BASE 为 `67eecc1ae53be30efec473206e5d1926dd5d500f`。本批拆分账号、登录、凭据、注册及组织治理的公共定义与提供者，接入正式 Service 和八个管理绑定。真实 tenancy-host 使用共同生命周期与 EntryOpening，消费者同步迁移。

## 实际验证与语义保持

| 范围 | 结果及边界 |
|---|---|
| 独立 L3 QA | 38 项冻结标准均 Pass，0 Fail、0 未覆盖标准。原套件及选定消费者 1189 passed、19 skipped；判决 Pass with issues。不是全工作区一次测试总数。 |
| 公开能力 | 75 个原公开导出、十组操作面及 59 个 key、8 个事件载荷与 void 签名、8 个绑定元数据逐项接续。105 个原业务函数体保持，事件名称采用已接受的显式映射。 |
| 数据身份 | 8 个持久身份文件、两迁移 SQL 保持。11 个 BASE/候选业务观察逐字一致。候选真正打开冻结 BASE 库，8 张业务表记录一致，原库 SHA 不变。 |
| 租户与事务 | 实际 SQLite 注册、组织与成员、同一 StorageUnit、失败回滚、外国/已结束 unit、污染与提交后通知均通过。实际双 host 跨租户拒绝且无写；停 A 不停 B。 |
| 凭据与 IR-CC-1 | 固定合法盐反例保持；合法材料仍 match，错误输入 mismatch。实际材料、全部 SQLite 表、读面、事件及结构化日志不含唯一完整中文明文或真实出示物，4 类合成载荷经同一扫描观察器均检出。不是产品路径植入泄漏或无条件保密证明。 |
| 生命周期 | 真实 OS scrypt 后提交先于 SQL 撤完；同步停止准入、部分启动/双失败、缺依赖 PENDING、第二 apply 停全代、旧票据失效及 TLS/Unix 两面关闸均有观察。 |
| 四层公开入口 | 13 个实际 tarball；9 个纯根源码、声明和运行装载，加 9 个 cordis 入口与外部类型消费通过。旧包、旧插件根和私有 deep 入口拒绝。闭包设施独立 10 正负控及 18 条闭包通过。 |
| 主会话检查 | 最终 cf4 完整构建、类型、host 216 passed/11 skipped；跨域 1824 passed。后者使用修复前稳定 dist，不能证明修复后的 managed SQL，实际范围见核验记录。规则、文档、格式、生成一致性和共同硬线通过。 |
| 有限模型 | AI/OG/AR 原 TLC 11 配置、OG Alloy 原 4 命令与 3 变异、EC 原 22 配置实际执行。47 个冻结输入散列保持。进展依赖原公平性和 Failures/Abandoning 前提，不构成 SQL 实现细化证明。 |
| 冷恢复 | 原 17 场景在安静窗口通过，原 30/45 秒限值不变。真实数据、fault-hit、阶段耗时和系统负载保全；A5 原因仍未知。 |
| 实际架构 | 固定 Git 源 inputDirty=false；49 产品成员，独立全 workspace 口径为 53。0 方向违规、0 环、17 个静态 unknown 保留。逐条红项处置与原始读数一起读取。 |

CV 纯工厂仍是四个无 close 函数，运行时排空归独立/管理绑定和调用方。AI/OG close 停止新普通调用；参与面继续由调用方 StorageUnit 寿命负责，工厂不拥有或撤销借用事务。注册三步各自提交，撤除不伪造回滚，也不把其合并成单一事务。

## 发现、修复及保留问题

独立评审发现重入 close 漏记已准入工作的真实反例。修复 `9587dd5c8` 在调用依赖前登记完整 Promise，正常及重入路径独立复验通过。SQL managed inject 的首个空槽造成干净检出 host 99 项失败；`cf4ce5874` 删除空槽后，同组 113/113、实际 scrypt/SQL 和完整 host 均通过。原失败保留，未放宽断言。

旧闭包驱动三次失败后停止使用，接续既有成熟解析函数，逐字核对来源并独立运行磁盘正负控。安装次序、Unix 路径、Node 类型、SQLite row prototype 等设施失败均保留。首次形式包装器误判以原 trace 读回解释，不改写旧 exit。原始报告中“尚待”字样保留当时状态，最终状态由本页与接受记录接续。

A5/QA-N4-I1 冷恢复原因、EIS 原 5000ms 超时、完整历史 W6/QA-FAC-1、OG2/AR2 的 formal README 登记缺口仍有后继责任。19 项显式 skip 逐条见 QA JSON。未执行完整 PostgreSQL 治理部署、全部 52 成员测试、pytest、完整基准、付费模型、make check 或队列。

EC 提供者根的 22 个新增 IC-4 路径由 T4/T5 整改，前端/CLI 由 T3，模型与必要共享边界由 R2。六组读数分别为 3 个变化 CC、23 个既存 CC、25 对克隆、49 条新增依赖、130 条旧装配投影及 22 条 IC-4，逐项理由均保留。记录偏离不关闭领域验收。未迁业务契约和证据义务继续有效，N5/N6 才按精确消费者退役旧源。

## 接受、原件及恢复

主会话在负责人的实施委托内作出[限定技术接受](../../decisions/identity-capabilities-delivery/decision.md)。本次只接受 T2，不表示 R1、R2、两域联合或系统验收完成。

- [独立 QA 原报告](qa-report.txt)、[逐项结果](qa-report.json)、[冻结清单](qa-manifest.json)和[主会话散列读回](qa-root-readback.json)。
- [首轮实施审阅](implementation-review.txt)、[最终补审](implementation-final.txt)和[逐项读回](implementation-readback.json)。
- [主会话验证范围](verification-scope.txt)、[架构判断](architecture-reading.txt)、[逐条处置](dispositions.txt)和[机读处置](dispositions.json)。
- [公开导出对应](export-ledger.json)、[业务函数保持](business-body-preservation.json)、[数据身份](data-identity-readback.json)、[旧库重开](reopen-base-data.json)及[真实秘密与双宿主边界](secrets-isolates-tickets.json)。
- [原模型摘要](original-model-summary.json)、[最终形式输入读回](formal-final-readback.json)、[AI/OG/AR 原运行](formal/formal-base/runs.json)、[Alloy 原运行](formal/alloy-base/runs.json)与[EC 原运行](formal/entry-formal-base/runs.json)。
- [接受输入](acceptance-inputs.json)和[逐项保全收据](inputs-and-preservation.json)。

完整原件在当前工作树外归档并逐项散列读回。收据列明精确文件数、SHA、源码 bundle、恢复路径及排除项。只承诺本机留存，不声称远端备份。BASE 是恢复 bundle 的前提。仅排除已释放的干净 clone 和可由 tgz/锁重建的安装，实际冻结输入、synthetic node_modules fixtures、失败、原始日志和冷数据全部保留。

逐字报告中的相对路径按归档 `r1-t2/` 原布局解释，绝对路径记录当时来源。归档不是搬移后直接运行的保证，须恢复 Node 24.21.0、Cordis 4.0.4、SQLite 3.53.4 及各锁定环境。
