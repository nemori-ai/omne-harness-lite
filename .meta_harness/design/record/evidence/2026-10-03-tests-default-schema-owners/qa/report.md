# D-116 三默认 owner 独立 L2 验收

**判决：Pass with issues。** 六项标准全部通过，已确认产品缺陷 0 项，必需未覆盖 0 项。保留一次 QA 负例输入修正，以及此前 ROOT 的 MRR 单次失败原因未知这一风险。判决不代表接受。

候选：`75c6a66eff119dc702224cab1265ba2564464dd8`，干净工作树 `/data/qiwei/repos/omne-harness-lite/.worktrees/test-tiers-mutation`。基线：`52bc6005dc168f2254d21ff79f6cd2df021676b8`，干净副本 `/data/qiwei/repos/omne-harness-lite/tmp/s65-c`。验证者 `qa`，实例 `/root/qa65_main`。Run ID：`qa65-default-owners-r1-20261003`。完成状态：规定 native、业务对拍、公开类型及额外 MRR 组合均已执行。最终验收退出码 `0`。完成时间见 [integrity.json](structure/integrity.json)。

依据为正式 ROOT 交接、D-116、construction-65-plan-r5、next-slice 输入与事先独立编写的 [六项判据](../preparation.md)。本轮接受有限的九处旧身份断言迁移：AE 四个 port，库存工具四个 port 与一个 LC3 schema；复制后的新身份、值、category、职责函数及原业务负控保持。没有再把“全部旧 assertion 不变”作为承诺。原冲突失败和正式例外仍保留原坐标。

构建由 ROOT 在冻结交付前完成。QA 独立消费真实 native src/dist，使用真实 SQLite 和既有装配设施。每个观察场景在新进程启动；观察真实 Ajv2020 prototype 的 compile/addSchema，记录实际 `$ref`、实例、阶段与成功/异常，继续调用原方法。没有用 getter 调用数或 mock judge 代替公开业务。默认主图 25 个定义与作者临时编译分开计数。

实际子进程均 CPU 7、nice 5，单次施加 nice；控制器 nice 0，worker/member/workspace 均为 1，C.UTF-8，外部 TMP `/tmp/odq-668ijc3a`。普通 native 步骤上限 360 秒；原 MRR 测试时限未改，进程上限 1,200 秒。不使用 make check、槽位包装器或固定 sleep。

逐条对照表：

| 标准 | 场景 | 机器证据 | 结果与次数 | 解释 |
| --- | --- | --- | --- | --- |
| 1. 三包导入无默认 owner、公开首用创建、后续复用 | worker.mjs lifecycle | semantic 中三包 src/dist 的 lifecycle 记录；[命令](structure/commands.json) | **Pass**，6/6。各 target import 新增 AM 主图请求为 0；公开首用各完成同一实例的 25 个定义；再次动作不增该 owner 主图 | AE 使用 readWorkspaceCarrier，再执行 evaluate；registry 准备真实 AE 业务夹具后，buildTableContents 创建自身 owner；EIS 非空 deployment factory 本来就是首用。首次 read 可另创建 AE owner，已分组记录 |
| 2. 五生产快照深冻结、职责捕获、LC3 原委派 | worker.mjs snapshot | [src](semantic/initial-candidate-src-ae-snapshot.json)、[dist](semantic/initial-candidate-dist-ae-snapshot.json) | **Pass**，2/2。每通道五个新 Schema 身份、值等价，1,422 个对象/数组递归冻结；每个节点 set/delete 均失败；五份原 JSON 仍可改并恢复 | 四个 judge、五个 deriveDeclarations/references 保持生产原函数。LC3 wrapper 的真实声明/能力名/Power 判断与原 judge 一致，越界定义 TypeError；captured judge 绑定同时经精确冻结源码只读核对。没有声称成功改写已冻结的生产 port |
| 3. AE 发布后、首用前原 LC3 变异不漂移，消费者共享快照 | worker.mjs cross | [src 消费者](semantic/initial-candidate-src-cross-cross.json)、[dist 消费者](semantic/initial-candidate-dist-cross-cross.json) | **Pass**，2/2。变异发生时 AM 请求为 0；改原 $id、Power enum、嵌套声明名约束；发布值与 Power 判断不变；真实 registry 与 SQLite EIS 都成功 | AE 从消费者实际 parentURL 解析，两个消费者拿到同一个公开 defaultBodyContracts。三默认 compiler 都使用原 LC3；含作者资源注册共观察到旧 LC3 5 次/通道，变异后的 id 注册 0 次。未把 AE/src 与 bare AE/dist 当成相同模块 |
| 4. 首次真实编译抛原对象，失败不缓存，可重试 | worker.mjs retry | semantic 中三包 src/dist 的 retry 记录 | **Pass**，6/6。首次真实 AM compile 注入唯一对象，公开动作捕获同一对象；恢复后另一实例完整编译 25 定义；随后复用成功 owner | 失败请求保留为 injected-original-error；没有包装成 unavailable 或 malformed。registry 的 AE 准备实例单列；EIS 在实际公开 factory 边界观察 |
| 5. 显式工厂当场拒绝、作者每次实际临时编译 | worker.mjs explicit | [src](semantic/initial-candidate-src-ae-explicit.json)、[dist](semantic/initial-candidate-dist-ae-explicit.json) | **Pass**，2/2。坏 Schema supply 当场 TypeError；有效显式工厂当场主图 25 次；相同作者声明两次调用产生两次真实 compile、两个临时实例 | 调用值/作者 Schema 字节表示未变，作者调用不增加默认主图。没有模块作者缓存 |
| 6. 公开业务基线、类型、依赖/结构范围 | native 业务 + public-types.template.ts + 冻结范围审视 | [首轮对拍](structure/initial-summary.json)、[EIS 定点对拍](structure/eis-r2-summary.json)、[公开类型](structure/finish-result.json)、[输入/制品](structure/integrity.json) | **Pass**。最终六通道 valid/invalid 业务文本与基线逐条相等；候选/基线公开类型 2/2；46 成员 2,882 制品摘要核验通过 | 42 个未重建成员与基线制品相同。ROOT 受影响类型/快慢层、共同硬线、结构读数按原坐标复用并保存摘要，不冒称由 QA 重跑九成员 |

最终采用的 native 场景为候选 18 个、基线业务通道 6 个，见 [report.json](report.json) 的 final_native_cases 与 business_comparisons。原始命令/退出码/输出 SHA 在 [commands.json](structure/commands.json)，分层摘要在 [evidence-index.json](evidence-index.json)。语义记录使用真实无损 businessText，不靠 JSON.stringify 丢掉 OpaqueJson/精确数值后对拍。

额外 MRR：按正式派发，只执行一次原 model-request-runtime 慢层多文件组合，保留原 isolate:false、过滤方式和测试时限。结果 **148/148，通过**，墙钟 75.153 秒，原 T15 三条全部通过。[原报告](semantic/finish-mrr-original-slow.json)、[原始输出](raw/finish-mrr-original-slow.log)、[命令及摘要](structure/finish-result.json)。此前 ROOT r4 的 unavailable 失败本次未复现；原因仍未知。本轮组合通过增加了原多文件执行覆盖，不能证明所有顺序、模块状态或时序条件均安全，更不能宣称已确认环境根因。原 r4 失败和 r5 窄重测保留原坐标。

缺陷清单：已确认产品缺陷为空。历史观察 O1：MRR 单次 dispatch unavailable 原因未知，建议后续由该成员 developer 继续调查共享状态/顺序及真实失败因果链；当前不把推测写成根因，也不循环重跑掩盖它。

QA 设施问题 F1：首轮 EIS 负例使用字符串 `invalid session`，误把它当成表示层非法 SessionRef。候选与基线都走到找不到 session 的业务分支，正确返回 unavailable。改用非法类型 `null`，保持 invalidInput 断言不变；只补四个 EIS 候选场景及两个基线通道，全部通过。每个受影响场景共两次，所有首次失败记录仍在 initial/ 与 raw/，没有产品不稳定结果或三次以上重试。报告整理脚本曾有一个括号语法错误，仅修正证据整理脚本后完成，不重跑产品。

范围复用审视：ROOT self-r1..r6、common-r1、test-account、final-builds、clone-comparison、structural-disposition 按交接记录读取。输入摘要保存在 integrity.json；其中公开类型由 QA 再执行，本次 MRR 组合也独立执行。ROOT 账本的 4,319 名称键不等于 4,319 个唯一运行实例：部分重复组为 0，10 个无执行键分别为九个未变 tools 夹具复用和一个既有 PI 不适用项。结构的六组既有片段对照不是语义等价证明；九个原复杂函数与精确基线相比未变差。没有新依赖边、方向/环或新增装配偏离；全仓趋势引用最近祖先，不能把趋势变化归因本片。CLI 不受影响，只有真实 skip 账本，没有运行 CLI 验收声明。

未覆盖：六项必需标准及额外 MRR 要求无遗漏。没有重复主体 20 图完整矩阵、四项五组性能、全仓门禁。没有验证全部业务排列或真实远端模型/治理服务；此片没有这类新增承诺。非 TUI 交付面，终端八关不适用。

替身边界：没有替换应用判断或公开 factory。SQLite seed 用真实 storage/account/治理装配；既有 credentials fixture 的较低成本只属于外部依赖测试配置。Ajv 首次失败是明确故障注入边界，正常及恢复时都调用实际编译器与生产端口。职责函数通过真实引用和实际输出取证，没有为修改冻结 port 而替换它。

清理声明：所有子进程结束，SQLite reader/host/assembly/storage 已关闭，未启动后台服务、终端复用器或更改终端模式。两个冻结检出在收工时 HEAD 正确、git status 为空；candidate 2,063 与 baseline 2,056 个跟踪产品输入摘要及 2,882 个制品摘要已记录。历史 qa65-main-r1/r2 报告 SHA 保持原值。只写当前 QA 目录；没有安装依赖、改产品/已有测试/golden/预期/时限，没有提交、推送、委派或接受。真实 seed 数据库、类型临时文件和失败证据保留供复跑。唯一执行通道已明确释放给 ROOT。

任何相关输入发生变化，都须按本报告记录的边界补验，不能改写提交坐标后复用判决。
