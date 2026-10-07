## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 17 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
新原始运行与逐项签收记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# content-blocks 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.content-blocks/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/content-blocks` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**410 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。原始执行、制品与范围。
- 逐项技术接受：本节点 12 项 core-local、5 项 core-composition 的本阶段责任已经主调度接受；精确 ID、坐标和前提。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/content-blocks/verification.md`](../../../../spec/data/content-blocks/verification.md#证据义务)（V-1～V-11、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 带「校验对象」的各节逐行过包内校验；包内 Schema 副本与 spec 逐字节相同 | **已通过**：本 run `schema.spec.ts` 的162行（60合法／102拒绝）、22定义与副本相同；原 log，输入核对 | 本节点 |
| V-2 拒绝值的具名与次序 | 每个拒绝行逐字相同；第 12 节六行专验次序 | **已通过**：全部 ContentBlock 行具名判定、第12节六行、反转兄弟顺序、原输入不改；306/306 的 `schema.spec.ts` | 本节点；这是模块接收函数，真实接收／落盘仍另证 |
| V-3 Schema 管不到的形状约束 | 媒体类型两处不逐字相同、派生块与原块同模态、非规范写法不被改写；「一条消息内 `id` 重复」那一条归 messages 节点的接收边界 | **模块部分已通过**：`content.spec.ts`，含文本文件与无模态文件；逐项对应 | 本节点（前三条）；消息内唯一性归 messages |
| V-6 `opaque` 模块内原样往返 | 大整数、嵌套对象／数组、null、缺席各自保留；原输入不改，返回自有冻结值 | **模块部分已通过**：`json.spec.ts` 的原文相等断言与 built public consumer；原 log | 每一处日志／传输／存储读写边界仍属 CB-2 |
| V-11 模块内严格读、数无损 | 解码后重复成员名（转义／嵌套）交中性 failed，不挑键；块文本测试映射 malformed；大数原文字面往返；只证模块部分 | **已通过**：`json.spec.ts`；Node24.18.0 六原文 API／公开函数探针源码与原结果；深度128／长输入100000字符为有限测试 | stream-assembly 负责唯一参数解析及 unparseable 映射；各外部 JSON 跳点负责实际应用严格读写 |
| V-10 中的 SC-2、SC-3 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | **部分**：模块不提供 rawArguments 解析器且测试观察不解析；`types.spec-d.ts` 由 built exports 核 opaque 字段读取／索引负例。尚未核真实 stream 模块的参数调用白名单，也未核所有外部 opaque 消费者 | SC-2 的产品准入在 stream 实现后由 W6 关闭；SC-3 的公开品牌形状已验证，外部传输例外／消费者仍属各 owner |
| `ModelToolName` 副本对齐 | 放在 tool-definition 节点 | — | tool-definition |

**不在本节点**：V-4（规范场景，要真实接收边界与落盘）、V-5（合取取用，归组装）、V-7（落盘之后不变，归日志写入方）、V-8（走查，与消费者共同做）、V-9（跨进程，本版装配下无法演练）；SC-1、SC-4。

**公开面静态前提**：`core-pure-imports` 已有正反例与本包真实源码扫描。首次 HUB 对本包公开 `./schema` 导入误报而退出1；工具补齐本包 Schema 许可、保留运行时禁止依赖后，101/101 自测与24-rule scan通过，原失败未覆盖。spoke仅20条旧规则，不作为最终纯性gate。范围见逐项覆盖。

## 公开消费者追加验证（2026-09-26）

`w1.content.public-lossless-json`、`w1.content.public-block-judgment`、`w1.content.public-metadata-meaning` 三项通过，补 S-12／24 与 V-6／11 模块部分的六数字原文字面、解码／嵌套重复键中性 failed、opaque 往返、非法写入拒绝；完整调用大参数往返，自有冻结值、拒绝优先级、不修复、不完整 rawArguments 保留；规范媒体／无模态、CapabilityId 与 AttachmentRef 结构相等、精确非负整数 bytes。

`w1.types.content.opaque-and-call-forms` 核 opaque 成员读取／索引负例与 tool call 参数形状互斥、backgrounded 必带原因；三 opaque 品牌互赋负例与直接具名类型全表仍待后续实际运行。模块测试没有闭合 SC-2 真实 stream 唯一参数解析、外部 opaque 消费者、每一 JSON／日志跳点、铸号或附件租户解引用；本 run 没有重跑包内306项测试。

原始 正常 Node report、负向 report、HUB build／typecheck／12/12 log、逐项条款对应与实际源码／配置／环境分别保留。工具源码5140574b，HUB起点e0b6c212加当时未提交且与dc431fdf同字节的lock；期间文档提交不改变本轮产品／工具／配置。子场景不叠加进外层测试数，六组类型只覆盖具体断言。测试通过不提升语义接受或用户最终接受。

## 覆盖缺口

- **模块内已取得证据**：V-1／V-2／V-3前三项、V-6／V-11模块部分及公开opaque负向类型已验证；空绑定表是无formal task，并非无实现。
- **SC-2真实消费者准入尚待实施后检查**：模块内不解析rawArguments不替代stream-assembly唯一参数解析、失败映射与调用白名单；完整外部SC-3仍需消费者核对。
- **精度与重复键的端到端证据缺一半**：模块内往返测试证不了「每一跳都用了严格的无损读写」；那一半要在各读写边界节点各有一条会失败的用例（CB-2；存储那一跳按 M53 归 `infra/storage-sql`）。owner：各读写边界节点。

## D-068 当前验证epoch

当前设计输入为 `data.content-blocks · v3`，规范资源在 acceptance.json 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。
