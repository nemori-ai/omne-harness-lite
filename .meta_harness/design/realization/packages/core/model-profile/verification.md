## v4 候选的证据义务

来源为 [v4 契约](../../../../spec/data/model-profile/v4/contract.md)及 [MP4-1～MP4-5](v4-design.md#契约责任到实现的投影)。下表全部为**未执行的产品验收义务**；不借用旧绑定或候选 Schema 自检宣称实现通过。

| 编号与条款 | 必须能失败的检查 | owner 与交付证据 |
| --- | --- | --- |
| V4-1：S-8/S-9/S-32，MP4-1 | v4 规范正反例经公开 Schema 与 judge；image 缺项目逐图 cap、缺任一上游 image 事实拒绝，非 image 带 image 指标拒绝；unknown/unbounded/limited 分支混值拒绝；合法 unknown + 明确有限 cap 通过，缺 cap 不补 | 本包实施者：真实公开入口测试及输入；`InputConstraints`、`UpstreamInputLimits` 独立定义与宿主条件分开验证，保持全部 14 defs |
| V4-2：S-24～S-26/S-33，MP4-2 | 四项 cap 分别小于/等于/大于有限事实；Schema 放行而完整 judge 拒绝的 S-33 反例；M15/M16 与参数越界/输出超限/未知 constraint 同时出现，先 malformed；只有未知 constraint 保持 constraint_unknown；四文档/十拒绝值及旧 M14 次序回归 | 本包实施者：移除 M16 或移至参数判定之后应使测试失败；文本档案可选 cap 缺席但上游 limited 仍为合法值，不伪造项目 cap |
| V4-3：S-27/S-30，MP4-3 | 新 snapshot 两对象完整且 image 条件生效；巨大相邻整数 cap/fact 比较、小数/零/负数拒绝、指数记数按原值判定；配置内部同名 `value`、maxImages 等任意 JSON 数不被误判；重复键在真实严格文本入口拒绝 | 本包负责类型、Schema、原数及不改输入；runtime 另在真实调用冻结后修改输入深层对象与目录，证明旧 snapshot 原样不变。普通浅拷贝或 readonly 不算这项行为证据 |
| V4-4：S-11/S-12/S-28，MP4-4 | 六项逐一改变推动目录 updatedAt；对象换序、模态换序及 1/1.0 保持时间；仅 adaptation/providers/parameters/registration 改变不推动；项目 cap 与上游 fact 各自改变都计入 | 目录实施者承担真实提交与可比时间检查；本包只验证新增成员在公开值中可无损消费，禁止将此项记为纯包已兑现 |
| V4-5：版本采用与全部精确依赖，MP4-5 | root/schema 为 v4 原件；v3/v2 入口的旧原件逐字节不变、各 `$id` 可共存解析；无 v4 事实的旧记录仅旧 codec 可读，新路径拒绝；独立打包消费者 strict/skipLibCheck=false，公开类型/函数/JSON 入口可导入，私有路径不可导入 | 本包及各数据/runtime/transport 消费者共同集成；保留历史 v5 response 等实现须固定 profile v3 导入，不能跟 root 自动升级。README/README_ZH 同步给出合法三态+显式项目 cap、完整 judge 与 Schema 的区别、精确旧版读取边界的可运行示例 |

### v4 覆盖缺口

- MP4-G1：主线负责精确契约及节点采用；本稿和上述候选接口未经本稿自我接受。
- MP4-G2：V4-1～V4-3、V4-5 尚缺本版源码与真实制品运行，阻断后继值包/目录/transport 对 v4 的正式使用。新增绑定 0 条，旧 1 条绑定不变。
- MP4-G3：V4-4 与 V4-3 的真实 snapshot、S-8/S-9/S-33 实际请求计量、事实来源、官方 cap 声明归外部 owner；本包不生成默认 cap，不用一次 HTTP 成功证明上游 unbounded，也不读取附件。归装配新增事项 0 项，既有目录/runtime/transport 分工保持。

## v3 候选的证据义务

本节只对应 [`data.model-profile/v3`](../../../../spec/data/model-profile/v3/contract.md) 与 [v3 候选投影](v3-design.md)。尚无本版产品实现和接受；下面计划中的测试名称只作义务编号，不登记为已存在的 `test:` 绑定。所有原 v2 结果保持原范围。

| 编号、来源条款与投影行 | 需要什么会失败的证据 | 当前状态 | owner 与闭合条件 |
| --- | --- | --- | --- |
| V3-1：S-1～S-2、S-4～S-9、S-12、S-27～S-30；MP3-1/4 | 三种档案必填 adaptation、三组闭合字段、五字符串非空/显式首尾空白、values 缺席/null/{}，全部规范正反实例；原件 Schema 逐字节及 `$id` 校验 | 仅候选 Schema 321 项自检通过；未执行产品实现测试 | 本包实施者：同一组输入分别走公开 Schema 与完整 judge，断言各自范围；不存在绑定时不能补默认 |
| V3-2：S-18、S-24～S-26、S-31；MP3-5 | Schema 放行的 modelId 错配由完整 judge 拒绝；错配+参数越界/输出超限为 malformed；空 routeName 加合法非空 modelId 保持 route_name_empty；额外 M13 错误仍优先 malformed；建档与档案都检查 | 未开始 | 本包实施者：移除 M14 比较、把它后移或把空路由错配抢先拒绝，各有可失败断言；继承十个拒绝值及旧次序回归全部过 |
| V3-3：S-30、content-blocks/v2 S-24；MP3-4/6 | 使用真实公开严格读取拒绝深层重复键、NaN、尾逗号；超大整数、极小小数和大指数无损往返；不接受函数、可执行对象冒充 JSON；判定不改输入 | 未开始 | 本包与 JSON 接收 owner：先解析原文本再 judge；明确普通 JSON.parse 已丢失的信息不能由本包修复。检查使用公开 JSON 设施，不能复制第二套值规则 |
| V3-4：S-8～S-9、S-16、S-18、S-29～S-30；MP3-1/3/6 | 原参数精确边界与跨字段比较回归；values 内同名 seed/temperature/maxOutputTokens 允许 JSON 值、不套参数界；比较 1/1.0、巨大相邻整数、对象换序、数组换序、true/1 | 未开始 | 本包实施者及绑定比较消费者：固定 Schema 视图不泄漏为返回或快照值，数值占位不能参与相等；有限 oracle 标清输入域 |
| V3-5：S-13～S-14、S-26；MP3-2 | 同路由不同 origin/scope 不匹配；给定同一身份的不同 adaptation 仍匹配同一档案；撤回档案、未注册实现的合法值不被 refMatches 当可用性检查；自建 scope 不从环境补 | 未开始 | 本包实施者：公开 v3 类型与三条重载的独立制品消费；boolean 不被写成已授权/已注册/目录找到 |
| V3-6：S-27、S-29～S-31；MP3-4 | 快照类型与 Schema 含完整 values、无 routeName/origin/registration；judge 文档种类仍恰四种；复制由实际 runtime 打开调用后修改/撤回档案及原输入深层值的场景验证 | 纯形状未实施；行为待 runtime | 本包验证公开形状与拒绝面；runtime 验证原样副本和在途保持。readonly、Schema 通过或纯副本示例都不能替代真实行为 |
| V3-7：版本差异及全部精确依赖；MP3-7 | 打包后的 root/schema 钉 v3，候选 v2 两入口钉原 v2；旧档案缺 adaptation 在 v2 通过、v3 拒绝；含 adaptation 的 v3 档案在旧闭合形状拒绝；双版嵌套 Schema 可同时解析 | 未开始 | 本包与主线集成：strict 且 skipLibCheck=false 的独立制品消费者、runtime import 和 Schema `$ref` 解析；全树旧消费者明确采用；旧测试不改成只测新版 |

### 外部 owner 的义务

| 来源条款 | 本纯模块不能独立证明的部分 | owner 与阻断范围 |
| --- | --- | --- |
| S-3、S-10～S-12、S-29 | 同格唯一、在册转移、updatedAt、同档案配置 revision 历史不改义，包括 c1→c2→c1 | model-profile-directory；阻断持久目录采用，不阻断纯值起草；在其真实提交对象上验并发及重启 |
| S-22、S-30 | 配置不含秘密、不载入代码、自建不冒充官方 | 档案写入/配置接收与注册 owner；Schema 不能识别任意秘密字符串；必须审查实际接收和持久路径 |
| S-5～S-6、S-17、S-21、S-27、S-29～S-31 | 实际路由、参数不静默改丢、缓存策略生效、精确实现/窄定义可用性、在途绑定与释放 | runtime/transport；本包 shape/ref 通过不证明支持任何官方模型 |
| S-23、S-30 | 每次外部 JSON 接收、跨进程范围重验与序列化 | 目录/runtime/消息与响应接收 owner；独立制品测试只证明本模块的公开读写组合 |

### v3 已有实际执行及范围

| 运行 | 输入与结果 | 证据 | 能支持的范围 |
| --- | --- | --- | --- |
| 2026-09-27 候选 Schema 自检（他方已执行，本次引用） | 321 checks、12 defs、31 clauses；原记录 jsonschema 4.26.0；退出 0 | [原输出](../../../../record/evidence/2026-09-27-probe-model-request-runtime/model-profile-v3/schema-check.stdout.txt)、[脚本](../../../../record/evidence/2026-09-27-probe-model-request-runtime/model-profile-v3/check_schema.py)、[输入摘要](../../../../record/evidence/2026-09-27-probe-model-request-runtime/model-profile-v3/schema-check-inputs.json) | Schema 对列举输入的接受/拒绝；明确模型错配仍会通过 Schema。不是实现测试、无损接收或目录行为 |

本次节点文档检查的命令、退出码与结果由交付报告给出；运行 design checker 不提升上述产品证据状态。原始运行的路径按其记录读取，归档不表示在归档位置执行。有限检查均不作无条件证明。

### v3 覆盖缺口

- MP3-G1：契约与节点仍是候选；主线负责独立评审和明确采用范围。
- MP3-G2：V3-1～V3-7 的产品测试、独立制品与本版代码尚无；旧 v2 的 185 项通过仍只支持 v2。
- MP3-G3：messages/model-response/loop-extension 的现有 root/schema 导入须按精确采用逐一处理，否则 root 切换会使旧消费者错误读取 v3；主线及消费者 owner 负责同步集成。
- MP3-G4：外部 owner 表中的行为均未由本纯节点取证；本节点不添加可用性判定、秘密识别或持久历史，以免掩盖未闭合消费路径。
- 当前绑定共 1 条、全部属于 v2。v3 没有 formal task，不因此免除上述可失败测试；取到真实实现运行后才按精确条款建立新增绑定。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 12 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# model-profile 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.model-profile/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/model-profile` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**185 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 12 项 core-local、0 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/model-profile/verification.md`](../../../../spec/data/model-profile/verification.md#证据义务)（按条款列）。
本页只登记**落在本节点上的那一部分**；目录的写路径与运行时的写入纪律归模型档案目录与模型请求运行时。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| S-24、S-25 表示层校验与拒绝值次序 | `examples.md` 正反实例逐条过judge；第6节四条、第10节一条次序回归；Schema副本同字节 | **已通过**：185/185中155fixture、`M-FIRST`、`SCHEMA-BYTES`；[具名JSON](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/vitest.json)、[输入audit](../../../../record/evidence/2026-09-26-tests-core-values/audit.json) | 本节点；不证明真实接收／写入路径 |
| S-18 `max_output_exceeds_profile`（Schema之外） | 档案与建档内容各一正一反 | **已通过**：`S18-ModelProfile`／`S18-ModelProfileContent`、`EXACT-LIMIT-*`；[原log](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/test.log)；显式断言Schema放行而完整judge拒绝 | 本节点；上游输出上限来源与发出留痕归runtime |
| S-28 建档内容M12 | 带registration／updatedAt即malformed，含listed | **已通过**：`EX-10-*`含规范次序例；[原JSON](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/vitest.json) | 本节点纯输入判定；真实建档／清单invalidInput且无写入归目录 |
| S-14 引用值精确匹配 | 名字对而scope／origin不对即不匹配 | **已通过**：`S14-MATCH`／`S14-SCOPE`、`TYPE-S13`与[HUB公开consumer](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-model-profile-consumer-runtime.log) | custom分支显式给目录scope；boolean只答给定行是否匹配，三种目录收场未由本模块证明 |
| Modality唯一定义 | type与Schema都取content-blocks | **已通过**：`TYPE-MODALITY-NUMBERS`／`EX-5.3-*`与153项[audit](../../../../record/evidence/2026-09-26-tests-core-values/audit.json) | 本节点 |
| M36精确数字、参数与快照公开形状 | 原数字字面核整数、值域、跨字段关系，Schema视图不丢语义；快照只形状不重judge | **已通过**：`EXACT-INTEGER-ORACLE`固定seed20260926的64样本、`EXACT-PARAM*`／`EXACT-EXPONENT`／`EXACT-SNAPSHOT`与[JSON](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/vitest.json) | 有限数值与模块形状；每个外部JSON边界和原样快照写入归对应owner |

**不在本节点**：撞名、在册转移、`updatedAt`、只发往允许的一家、不静默丢改、快照原样、缺席不补值等规范场景（模型档案目录与模型请求运行时）。

**公开面静态前提**：`core-pure-imports`规则已交付，[本次HUB24规则扫描](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-purity-scan.log)对model-profile／asset-model真实源码无违反；本包还实际消费独立公开dist声明与runtime。扫描只支持该修订和登记语法范围，不替代消费者行为保证。

## 实际执行

运行[`2026-09-26-tests-core-values`](../../../../record/evidence/2026-09-26-tests-core-values/README.md)：实现`cd67215b`、HUB merge`735ee728`；
作者[build](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/build.log)／[typecheck](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/typecheck.log)／[test](../../../../record/evidence/2026-09-26-tests-core-values/raw/model-profile/test.log)
与[HUB包原log](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-model-profile-hub.log)各退出0，**185/185**、3文件、0失败／跳过。
Node24.18.0／pnpm10.28.1／Vitest4.1.11／TypeScript6.0.3／Ajv8.20.0；155个冻结fixture参与，seed20260926的64个BigInt样本在一个测试内，不计成64独立测试。
HUB先install产生dirtylock，实际锁与稍后aa7c3d33同字节；后续W1证据／锁提交不改产品，不称全程固定HEAD。

HUB在aa7c3d33独立执行作者同字节[consumer](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/model-profile-consumer/consumer.mts)与[tsconfig](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/model-profile-consumer/tsconfig.json)，
strict、skipLibCheck=false，[types原log](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-model-profile-consumer-types.log)和[runtime原log](../../../../record/evidence/2026-09-26-tests-core-values/raw/hub/w2-model-profile-consumer-runtime.log)各0；类型stdout为空也不代替退出码，主调度实际exec结果另登记。
当时只有3导航文件dirty，末尾才提交633b2019，产品／工具／配置未变。
作者初始smoke原log保留，但新包写入与它并行发生，不作固定基线或本包验收；34阶段外skip不混入本包零skip。
17原件与153输入逐hash核对，Schema副本及规范冻结相符；[逐项覆盖与owner](../../../../record/evidence/2026-09-26-tests-core-values/coverage.md)。本次通过不提升最终接受状态。

## 覆盖缺口

- 本模块声称的形状／词表／精确匹配／表示层面已有本次证据；空绑定表是无formal task，不表示无实现。
- S-3同格判重原子性、S-10/11写入与时间、S-14三种读取收场与S-13持久／授权归目录及持有owner；未在本包演练。
- S-5/6实际出站供应商、S-17无补值、S-21处置留痕、S-27打开调用时原样复制及每一处JSON传递归runtime／adapter。未访问OpenRouter或真实模型。
- 数值oracle、纯性语法scan与外部dist消费者均是有界检查，不代表所有数值／交错／消费者符合。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
