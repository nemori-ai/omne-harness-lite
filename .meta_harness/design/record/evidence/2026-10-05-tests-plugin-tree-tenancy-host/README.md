# R1-T4：插件树与真实治理宿主

本次接受候选为 `bca26b3043d9502dd829a9d91994d44cc04917a1`，BASE 为 `cdd05d1050dc9d7857f7eb3569d834ae4291c4d5`。`bca` 相对产品候选 `4123ccd32` 仅补已采用的精确角色投影，产品代码相同。实际 tenancy-host 使用发行层/运维者层插件树，先准备和校验，随后取得资源、加载、确认及开闸。公共资源与生命周期通过具名服务注入，原手写 manifest 已删除。

## 实际验证与保持范围

| 范围 | 结果与限制 |
|---|---|
| 独立 L3 QA | 52 冻结标准：50 Pass、2 Pass with issues，整体 Pass with issues。1273 所选测试通过、0失败、19原跳过。干净候选9成员构建、15类型检查；根补18成员，合计覆盖32声明消费者及额外kernel-basis。不是全56成员或整个模型域行为验收。 |
| 保持与消费者 | 独立重算1161原函数和3263原断言；59函数差量、29接口断言适配逐项核对。91现行保护文件仅3项类型归属变化，3历史Git链接和163形式输入保持。236原导出中231保留/迁移并经外部TS消费，5手装配结构面替代。432原源码边及109非源码路径有索引，无兼容别名。 |
| 真实行为 | 130能力观察，另有11真实SQLite身份/租户/事务、14中心CLI和4发布包观察。真实TLS/Unix工厂、同步订阅失败、关闭重入、启动前缀失败和真实closed责任均有原件。原31路由设施含能力桩，不能称31完整真后端场景。 |
| 插件树与宿主 | 稳定行id、两层替换/停用/插入及来源打印；缺插件/导出、非法配置、悬空修改和非法职责均拒绝。八实际角色来自七实际包的同一ESM dist。打印不创建DB/备份/socket目录且不等待shutdown。实际30秒仍停止场景约30.8秒，未缩短阈值。 |
| 四层公共入口 | 六纯根的源码、声明、运行闭包及外部类型验证通过；实际19个产品tarball，四项旧私有表面拒绝。冻结QA文字误写18，独立manifest、依赖及origin均为19，另附勘误而不修改原报告。 |
| 形式与机制 | 实际47 TLC：15正、31变异负控、1可达性；4 Alloy进程执行7逻辑配置；7有界机制控制。原163输入未变。Entry包装器原exit1保留，按原轨迹纠正两处结果分类，不改模型或重跑求绿。仅原有限规模、公平性/外部完成前提，不证明任意状态、OS或实际SQL实现。CQ13沿T3相同输入继承，未重跑。 |
| 共同硬线 | 根直接调度实际acceptance5项通过，任务独立home的STRICT四硬线及传感器通过。第一次因--out账本未发布而exit1，只发布实际同一5文件后重算失败的STRICT，账本SHA相同，原失败保留。 |

## 发现、结构与限制

独立限定设施曾因普通Error错误预期为clock、Service箭头返回、目录775、Python3.8 API及Unix路径过长失败，原件保留。按BASE分类器及已采用设计限定修正设施，不放宽45秒/5000毫秒/30秒等原阈值。真实 SQL `fiber.dispose()` 可返回void，旧`.catch`导致跳过closed观察的产品缺陷已修复，并经真实失败前缀复验。真实发布包缺生产依赖也已修复。实施审阅逐行核对租户、同提交、私有guard、秘密诊断和资源完成热点，最终补审无剩余产品阻断。

最终固定视图含53产品成员、8具体unknown。以T4 BASE预期判断为942 converged、66存量deviation、15587 unknown，T4没有新增已判IC偏离。66项为IC-1一项、IC-2十三项、IC-3一项、IC-4五十一项，位于后继模型/Session/资产/loop的九成员。八宿主职责unknown已补齐，并与八提供者直接inject数组的写法问题分别核对；其他动态键和解析器未知不提升为通过。

同一当前分析器在固定R0、T4 BASE和候选树上得到偏离128→88→66，净少62；84旧见证消失、22新见证保留。22个本批减少只有合入后才计主线。静态变化不代替行为接受。生产具名src单位总CC23731→24483（+3.2%），CC>12数量235→227，最大136未变；不能声称整体复杂度降低。T4自身总CC增加407、热点增加4。原不同口径趋势不作为本批因果证据。

108结构红项逐条处置：13复杂度、12依赖、18克隆、64旧装配映射和1全局意图变动。64旧映射不是108条；处置不等于完成整改，不扩大装配豁免、放宽IC或伪改旧映射求绿。旧源退役仍由N5/N6接续。

历史root和实施评审曾使用测试槽包装器及公共measurement home，违反本任务排除约束。实际调用和原输出保留，没有追认授权。最终QA与root补跑采用直接串行、独立home和实际资源锁；这不抹除历史流程偏离。QA最终封存时容量中断由同一QA接续，没有重跑绿测。

原A5冷恢复45秒因果、EIS5000、完整W6、PostgreSQL、完整终端矩阵及R1-T5/R2/R3仍开放。没有全量make check、检查/合并队列、付费模型、完整Python回归、Docker/systemd部署或完整基准结果。

## 接受与恢复

[限定产品接受](../../decisions/plugin-tree-host-delivery/decision.md)只覆盖R1-T4。身份领域尚待R1-T5，模型和旧范式退役尚待后继门。

- [原QA报告](qa-report.txt)、[逐项结果](qa-report.json)、[冻结manifest](qa-manifest.json)、[根读回](qa-root-readback.json)及[19制品勘误](qa-pack-count-erratum.json)。
- [实施审阅](implementation-review.txt)、[最终补审](implementation-final-supplement.txt)、[硬线](final-hard-lines.json)与[实际验证选择](verification-selection.json)。
- [逐条结构处置](structural-dispositions.json)、[总体读数限制](overall-dispositions.json)、[流程偏离](workflow-deviations.json)、[保持差量](preservation-dispositions.json)及[导出迁移](exports-migration.json)。
- [形式摘要](formal-summary.json)，原输入/输出在 `formal/`，实际旅程在 `observations/`，原命令收据在 `qa-receipts/`。
- [接受输入](acceptance-inputs.json)和[工作树外保全读回](inputs-and-preservation.json)。

工作树外 `primary/tmp/arch-intent/remediation/r1-t4-bca26b304/` 的6679项逐项读回，56MB压缩原布局及源码bundle保全。仅排除已释放的两个干净clone及两项可重建制品消费者安装；冻结上游输入和合成node_modules设施保留。实施评审完整原件已在primary/tmp独立留存。只承诺本机留存，不声称远端备份。复制报告的相对路径按归档 `r1-t4/` 解释，原坐标不改写。恢复需BASE和原锁定工具链。

交付文档首检发现33份原模型README的209个相对链接在快照位置失效。原`.md`和首失保留于归档/提交历史；本机读回后将复制的历史说明按原字节保存为`.txt`，不作为现行导航。路径和SHA对应见[原文路径](raw-document-paths.json)。没有修改模型、配置、原正文或放宽文档检查。
