# PF-013 · refusal 文字映射技术投影 v4

- 状态：**post-review，待主线精确技术采用；未实现、未验证**。这是已审候选的局部派生快照，不是产品新政策，也不覆盖 PF-013 的全部技术交付。
- 需求输入：PF-013 rev16、PF-009 rev9。范围仅为 OpenRouter Chat Completions 合法 refusal 文本到既有内容流的映射；十三操作、原终态和存储归属均不变。Session／Run／registry 后继候选不在本版范围。
- 已审来源：[transport v14 revision 2](../../../../realization/packages/model/pi-ai-transport/v14-refusal-design.md)，SHA256 `cf687f33d8d60270a1982ce0e7bfe36819ac520695b80f3d33143215f3015a0e`；[独立评审与表达修正回读](../../../../record/proposals/openrouter-refusal-mapping/review.md)支持 A，无架构阻断。
- [provenance.json](provenance.json)记录本次读数的精确源摘要。只有既有 registry 冻结资源标 frozen；其它摘要识别本次快照，不冒充已发布冻结。实施前须重新核对源及实际采用记录，变化时出后继快照。

## 1. 已确认需求与对象

[PF-013](../../design.md) §5.4 的首内容不可逆、§5.5 的故障重试边界、§5.13 的中断/失联，以及 [PF-009](../../../PF-009-context-message-types/design.md) 的完整内容、块和历史资格是输入。产品没有新增“raw 到期后永久辨认拒答字段”的承诺；不能因此扩 CB origin 或新增 MR 来源索引。领域对象仍为一次模型调用、模型响应体与内容块，沿[既有对象定义](../../../../domain_objects/objects.md)及其产品依据，不新增身份。

研究支持官方 refusal 是可缺席的 string/null；真实 Opus 那次值型、同帧关系及后帧账单仍未知。选择 A 是本项目的映射候选，不能将协议研究写成实际模型认证。

## 2. 契约、性质与默认答案

精确坐标的 baseline 都是 `omne-harness-lite-design-2026-09-15`；已有六契约 accepted 的来源路径与摘要见 provenance。其规范正文拥有含义，本页只定位本次消费范围。

| 来源 | 本次消费 |
|---|---|
| [CB3](../../../../spec/data/content-blocks/v3/contract.md) S8 | text 字面、origin 缺席不作来源断言；不扩字段 |
| [AR2](../../../../spec/data/arrival-events/v2/contract.md) S7–S13、S20/S21 | open/fill/close、首内容；open 及空值不冒充首内容 |
| [SA3](../../../../spec/capabilities/stream-assembly/v3/contract.md) | 原封口/截断/放弃与已交付部分组装 |
| [MS6](../../../../spec/data/messages/v6/contract.md) S10 | reply ending 仍为 complete/truncated_at_limit/interrupted_by_user |
| [MR9](../../../../spec/data/model-response/v9/contract.md) S12–S14、S20/S21、S42 | 四种 outcome、reply/delivered 关系、raw 与真实用量；raw 失败/到期不毁文字事实 |
| [RT10](../../../../spec/capabilities/model-request-runtime/v10/contract.md) S16/S51、S53、S80 | 首内容门、固定完整绑定、已取得计量的同次保留 |

对应已审 R1–R8：文字不丢、顺序可解释、首内容不可逆、收场真实、已知账不丢、有条件结束、来源处理范围不扩张、公开函数与服务使用同一 reader。进展前提为正常终点到达或已有取消/时限生效；不承诺坏网络最终自动给账。

refusal 缺席/null/空串无事件；非空字符串含纯空白是文字；任何数组、对象、布尔、数字为 protocol。每帧先检查 refusal 值型，再以 content→refusal→原 reasoning/tools 顺序处理。跨帧按读取顺序追加同一 text 通道，同帧排序是明确的本地规范化，不声称重建上游生成时间。

正常 stop/tool_calls/length 继续读取正常尾帧到 DONE，真实 usage/cost 沿原累积器。缺账保持未知。异常 finish、顶层 error、坏协议、取消/超时沿现有停止规则，仅保留已读事实；不为未来计量排空连接。正常非空 refusal 不是失败判据；content_filter 也不因有文字被改为成功。

## 3. 公开面与十三操作保持

公共 `planRequest/sendRequest/readStream/createPiAiTransport` 和独立 invoke 的参数与结果结构不变；本增量只改变 reader 解释合法字段的规则。十三个服务操作沿 RT10 以下完整条目，身份、前置/后置、失败集合、默认拒绝、并发、原子性及提交点都仍由原条款定义，本页不另建一套操作契约。

| 操作 | 精确条款 | 本次关系 |
|---|---|---|
| legalTargets | RT10 S24 | 不变 |
| displayList | RT10 S25 | 不变 |
| effectiveModel | RT10 S26 | 不变 |
| selectModel | RT10 S27 | 不变，不从拒答触发模型切换 |
| openCall | RT10 S28 | 固定本次完整新绑定，不新增身份/前置条件 |
| dispatch | RT10 S29 | 仍由原调用执行路径实际驱动发送、流交付和结算 |
| dispatchAgain | RT10 S30 | 沿原再发资格；首拒答内容后不再发 |
| interrupt | RT10 S31 | 按原设计先记意图再中止；等待/驱动责任不搬给传输或新操作 |
| releaseCall | RT10 S32 | 原终结路径不变 |
| reconcile | RT10 S33 | 原恢复事实不变，不重新解释历史原始流来伪造结果 |
| readAttempts | RT10 S34 | 原样读原响应，不补造拒答来源或费用 |
| settleReply | RT10 S49 | 原合法 reply 处置与同次追加，不将失败 delivered 升成消息 |
| canDispatchAgain | RT10 S50 | 原纯判定不变 |

本次没有新原子提交：首内容交付前的“已开口”提交归原 runtime；response/reply 结算仍是原 SL3 追加批；raw 留存仍在原附件边界。未知提交结果沿原责任认回，不能凭拒答映射决定重发。

## 4. Cordis 投影、依赖与装卸

既有 `modelTransport` 服务由 transport 提供者提供，可信模型贡献通过既有注册/租约组合；公开函数保持独立。没有新 plugin/fiber/service/isolate/inject/event/store。原调用执行 owner 固定整组 reader/definition/meter，消费者不能热改正在使用的闭包；dispose/abort 沿原 stop→stopped 收口，外部付费效果不回滚。不存在新增跨 owner 同提交或后台 drain。

原依赖重载及实际停止边界沿 [v3](../../../../realization/packages/model/pi-ai-transport/v3-design.md)、[v12](../../../../realization/packages/model/pi-ai-transport/v12-usage-calibration-design.md) 已采用范围。本映射不实现完整 Session/Run，不引入 T29 引用注册表设计，也不改变既定 interrupt 与 dispatch 分工。

持久 reply 与故障 delivered 均保存已有文字，但 delivered 只是留痕。只有依现有规则选入上下文的合法 reply 才完整回放，不因为来自 refusal 另行过滤。raw 留存失败或过期不影响这项回放；文字不承诺还原上游 refusal 字段。

## 5. 共享 reader 与完整绑定修订

[v3 的公开函数、家族与模型定义](../../../../realization/packages/model/pi-ai-transport/v3-design.md#公开函数家族与模型定义) 已明确：公共解析器与家族行为同属 implementation revision，禁止同 revision 偷换。故本次共享 reader 行为改变需要**所有采用新 reader 的官方绑定重新发布实现修订**；当37模型一并切换此共享实现时就是37项，不只 Anthropic。

这不是37套 parser，也不是37次自动付费请求。所有型号仍共享一份实现。definition 本身引用 implementation，若该引用改变则其不可变内容改变，必须发布新的 definition revision；profile/definition/meter/usage-scope 等精确引用由实施批统一迁移。配置值、tokenizer/算法没有因此自动改变，不机械虚构新 TTL 或计量算法。计数依据包含的绑定身份改变后，若没有明确的兼容依据，照现有校准规则重算，不靠沿用旧标签维持复用。

本快照不分配任何 `mp4-*` 新号码。主线须先收齐同期模型窄适配，再由唯一发布者为实际合成后的实现分配未占用修订；不得覆盖其它模型工作正在使用的修订。旧租约沿原固定旧组件完成，重载不能用新 reader 偷换。旧记录和证据保留原坐标；工程证据可按明确差异复用，但不能把旧 tuple 的真实证据冒称新 tuple 已认证。

## 6. 绑定、验收与实施顺序

新增 bindings 0。独立架构评审支持边界，不等于实现符合。精确正反样例权威在 [v14 的 RF-V1–V9](../../../../realization/packages/model/pi-ai-transport/v14-refusal-design.md#验收义务与采用前置)，本页只列交付顺序与完成判据。

| 阶段 | 工作与完成判据 |
|---|---|
| 采用门 | 主线确认 v14 revision2、三候选和评审的精确字节，形成技术采用；核本页 provenance；在此之前不按候选改代码 |
| 共享读取 | RF-V1/V2：值域、空白、同帧/交错次序、终止后内容；RF-V4/V5/V6：正常三种结束/异常、真实无损计量、已读保留与未知；反例必须能使错误实现失败 |
| 实际停止与公开消费 | RF-V3/V7/V8：首内容门/零提前交付/不重发、取消超时真实停止、原来源政策及固定诊断不泄原值 |
| 固定绑定迁移 | 所有实际采用新 reader 的37绑定发布新精确实现/定义坐标；旧lease固定、错配拒绝、公开profile/meter/usage-scope一致；不改无关配置语义 |
| 服务与制品 | RF-V9：受控 TLS 的公开 invoke 与真实 Cordis service，持久后 reopen/下一请求回放合法 reply，delivered 不自动回放；raw不可取不毁文字；公开制品及 README/README_ZH、类型检查 |
| 最终主线验收 | 汇总实际源码/制品/输入 hash、命令和退出状态；保留真实模型认证原范围与未决，不能用共享 parser pass 宣称37模型全部完成 |

## 7. 明确未决

技术采用、代码实现、RF-V1–V9 和新绑定的实际交付证据尚未完成；当次 Opus 的真实 refusal 值型及未知费用不由此设计补全。共享规格无需因本次映射升版；永久来源区分、生成内容秘密保证、错误后等待未来账单都没有在本次获得新承诺。所有技术判断回指受审节点，投影不是第二份权威。
