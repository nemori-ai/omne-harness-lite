# MR10 原响应证据与耐久未处分值

2026-09-29，candidate，未技术采用，新增绑定 0。接续 [v9](v9-usage-calibration-design.md)，输入为 [MR10](../../../../spec/data/model-response/v10/contract.md)、MS7、CA3 候选；当前语义锁定见 [引用设计 r4](../../../../record/proposals/model-runtime-reference-lifecycle/technical-choices-r4.md) 与其成组评审。原 MR9 的接受及实现证据保持原范围，本页不提升状态。

本节点仍为既有 `packages/core/model-response` 纯模块。当前源码已有 `judgeModelResponse`、`judgePendingModelResponse`、`copyInputCalibration` 和固定 Schema 资源图；本次迁移数据坐标并增加一处共享跨值关系，**不拥有**内容存储、CallKey 索引、授权、转换、读取 Session 日志或计费选择。Cordis 采用仍为 D025 的 4.0.4，但本模块不 import Cordis，没有新增 basis 行为主张。

## 契约投影与候选公开面

| 条款责任 | 公开操作/构件 | 实现投影 | 证据或缺口 |
|---|---|---|---|
| MR10 S26–28/S39/S46/S48 | 原 `validate`、两个 judge 与 PendingModelResponse/ModelResponse 类型 | root 当前 Schema 切 MR10；完整 Pending 作为内存值或不可变内容解析后的值均走同一个 Pending judge，不造 PersistentPending 同义类型 | R10-V1/V2；不证明内容来源/可取得 |
| S14/S45/S47 | 候选 `judgeResponseFinalization` | 对 Pending 和 final 各按原拒绝顺序验证，再比较去掉 final 的 replyDisposition/late 后的全部值；其余成员都须精确相同，包含 reply 和 inputCalibration | R10-V3；只判断两份显式值关系 |
| S41–45/S47 | 原 `copyInputCalibration`、类型与关系判定 | 计量原事实不因后继消息派生、后继 provider、重接或否决而重算；原 outputGroup 仍对应原 response.reply/delivered | R10-V4；原摘要的实际计算/来源由 transport/runtime 判断 |
| S14 与 MS7 S9 | 消费 messages 的唯一候选 `judgeModelReplyMessage`，由最终写方组合 | 本包不另造消息扩展判断；原响应证据与首次发布的唯一消息可存在受限合法派生差异，消息写方验证来源/权限/原子批 | R10-V5；不赋予 persisted 写权 |
| S19/S46/S47 与 CA3 S40–42 | 原 usage/cost 类型和精确数 | 当前 CA3 数据资源及纯值函数；ready/final 选择、原归账与补账定位归日志/成本读面 | R10-V6；单个响应判断通过不证明账收全 |
| 当前格式与精确依赖 | root、`./schema` 及资源闭包 | 仅 MR10 当前执行语义；当前依赖图必须保留所引用的精确旧 Schema 资源，不增加旧 judge/runtime 兼容入口 | R10-V7/V8 |

以下为**候选签名**，尚未实现：

```ts
export function judgeResponseFinalization(
  pending: unknown,
  final: unknown,
): ModelResponseJudgment
```

返回沿现有 `{ ok: true } | { rejected: ModelResponseRejection }`。先以共享严格无损 JSON 边界取得两个不变副本；pending 按 `judgePendingModelResponse` 完整顺序先判，再判 final 的 `judgeModelResponse`；任一拒绝原样返回。二者合法后只从 final 比较视图移除顶层 `replyDisposition` 与 `late`，与 pending 做全部成员的精确 JSON 值相等；不按字段白名单复制，不删除内层同名字段。对象键顺序不影响相等，数组顺序/重复和成员缺席有意义，数字按 CA3 ExactDecimal 精确值比较。任何其余差异返回既有 malformed，包括原 ResponseId、route、raw 引用、headers 值顺序、reply 的派生字段、usage/cost 或计量证据变化。

它不读取 MS7 marker、不认证摘要、不查询转换件、不推导 late，也不把 final.reply 的派生扩展视为合法。合法扩展发生在最终 AssistantMessage 与原回复之间，归 MS7 唯一 helper；final.reply 仍与 pending.reply 相同。本函数无存储、提交、事件、时钟或缺失默认，重复同输入同结果，不修改输入，不产生新回应或处分；依赖/Schema 初始化错误暴露为初始化失败，不能吞成业务 malformed。

## 数据图、依赖和资源

MR10 替代 MR9 根资源，直接采用 MS7/CA3，仍采用 MP5 响应快照。MS7 的 created 支路另引用 MP6；资源注册必须从精确 `$ref` 的可达闭包导出并逐项核对，不能只改根 `$id`。当前 LC6、AE3 及所需保留资源仍可能引用 CA2：按 [CA3 节点](../call-accounts/v3-design.md) 使用候选 `@omne-harness-lite/call-accounts/schema/v2` 保留原字节 CA2，同时注册 root CA3。LC6 仍精确引用 MS6，因此还须使用 messages 提供的候选 `./schema/v6` 原字节资源；MS7 根资源不能冒充 MS6。MP5 响应快照与 MS7 新 created 引用的 MP6 也各具名注册：model-profile 现行 `./schema` 保持 MP5，本批仅补 `./schema/v6` 原字节资源。MP5/MP6 的全部 Schema 断言和 S-27 快照值相同，无值转换；token 准入语义由 runtime 实现，见 [资源增补](../model-profile/v6-schema-resource-design.md)。当前图中的 MP5/MP6、MS2/MS3/MS6/MS7、LC2/LC3/LC6 等各保留自身 `$id`，不把旧 URI 重定向为新 Schema。具体闭包以最终规范图检查为准，不沿旧“22 份资源”数量假定仍足够。

所有资源跨包走具名公开入口；使用现有 createSchemaRuntime、strict/lossless JSON 与 ExactDecimal，不引入新第三方依赖或网络 resolver。必要旧 Schema 是**现行精确依赖的规范工件**，不是旧格式自动识别、旧 judge 或执行兼容。没有现行依赖的历史资源不因本稿新增保留。

既有两阶段拒绝顺序不变：成员层、具名跨成员拒绝、其余 malformed 各守本位；Schema-only `validate` 不升级为来源/跨记录认证。冻结原资源不覆盖，新规范复制为本包当前资源，制品声明与元数据同步。原 MR9 不再作为当前 root 的运行版本；消费者在同批迁移，不加 `/v9` 执行入口。

## 所有权、存储与装卸

本节点存储要求 **0**、插件服务 **0**、装载贡献 **0**、撤除任务 **0**。同步处理显式值，输出判定或原 copy 的分离无损值；不存在消费者离开便能取消的模型请求。跨进程只需忠实传递规定值，进程内对象引用不成为持久身份。

MR10 S46/S47 的不可变字节、引用存续与来源核查由 model runtime/内容存储承担。ready marker、final 与首次持久消息涉及的同提交对象是**同一本 Session 日志的整批追加**；内容保留/发布/回收的共同记录按 RT11 S85 由 runtime 投影。本包不执行“读一个 store 再写另一个”而宣称原子性。

装配提供当前授权、真实转换来源、原始字节及完全来源前缀，最终写方先组合两个纯关系判断和真实来源检查，再提交原消息/final 批。unknown 重送原批不重跑转换；这些不是 core helper 的执行副作用。生产 Session/Run 与转换提供者未实现时保留对应缺口，不在本包造 caller=true/trusted 默认。

## 选择与反例

| 选择 | 落选方最强理由 | 本方弱点与置信度 |
|---|---|---|
| MR 单一共享最终化关系 helper | runtime 直接删两个字段比较，改动最少 | 多一项小公开面，但将完整原事实关系留在数据 owner，防字段遗漏和多写方分叉；高 |
| 消息扩展只归 MS7 helper | MR 增一个同时判断消息的入口，调用更方便 | 写方组合两次判断和真实来源；避免 MR 复制 messages 的结构规则或将表示误当授权；高 |
| 同一个 Pending 表示用于不可变内容 | 新建 durable Pending 类型可突出存储角色 | 存储真实性必须由外层明确承担，不能靠类型名证明；避免同义模型和第二份字段集；高 |
| 固定原校准，当前回放由消费方判断 | final 改成转换后 reply 再重算摘要可保持逐 JSON 相等 | 需要明确模型证据与消息来源关系；不依赖迟到时仍可取旧 provider，也不重造历史证据；高 |

## 施工、消费者和验证边界

先接受成组候选及节点，再迁移 core/accounts/messages 所需规范资源公开面，随后迁移 MR10 Schema 图/类型和共享判断，最后由 runtime 使用；MR 与 MS 纯实现可在共同签名固定后并行。runtime/transport、日志 codec、最终消息写方、core-verification 与全部当前 fixture/类型消费者同批核对。runner 仅传播既有消息写方责任，不因读到 ref 得到新写权；不新建正式 app。

README 与 README_ZH 同步说明当前 MR10/Pending、来源与纯判定区别、final 只增加两个字段、合法消息派生由另一关系判断、原计量不重算，提供从 Pending 构造合法 final 的明确示例、错误费用/原回复变更反例和 unknown 不填零示例。示例不得伪造已获当前权限；全部通过实际包制品编译/执行。

R10-G1：本候选未技术采用。R10-G2：MR10 图迁移和新关系 helper 未实现、未验，原 MR9 证据不闭合。R10-G3：内容字节/真实来源/合法转换/原子最终批及实际 selected G/N 的组合证据由 runtime、消息写方、transport 提供者承担。验证义务见 [verification](verification.md#mr10-原响应与未处分内容候选义务)，不把纯 Schema 案例或有限 TLA 当物理持久证明。
