# messages v4 增量实现设计（candidate）

## 输入与实施边界

本稿消费 catalog 已登记的 `omne-harness-lite-design-2026-09-15 · data.messages · v4` 和 `data.model-profile · v3`，两者均为 candidate。依据是[适配提案 revision 2](../../../../record/proposals/model-request-adaptation/design.md)及其[独立复审范围](../../../../record/proposals/model-request-adaptation/review.md)；复审没有接受本节点。需求依据沿 messages v4 所列版本，本增量直接关联 PF-009 rev 8 的消息责任、PF-013 rev 13 的模型调用留痕。原已接受的 [design.md](design.md) 及 v3 证据不改写。

源码包 `packages/core/messages` 已有 v3 实现；本稿的 v4、保留 v3 纯值入口和新增验收尚未实现。主线本批明确保留面：已公开的 v3 函数/类型转入显式旧入口，v2 只保留现有 Schema 及完整闭包，不新增从未公开的 messages v2 judge。延伸现有纯模块，不新建包、插件或服务。Cordis 采用 4.0.4 由 [D-025](../../../../record/decisions/cordis-adoption-version/decision.md) 决定；本节点不导入 Cordis，不依赖任何 basis 机制主张。新公开入口、内部方法及接线在下文均为候选，现有函数名只用于定位增量。

## 契约责任到兑现点

| 契约责任 | 公开操作／构件 | 实现与精确采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| M4-P1：messages v4 S-37、S-49 必填形状 | 现有 `validate`、`isWireRecord`、`brandRecord` 的 v4 候选版本；`ModelCallDispatchedRecord` 类型 | `src/schema.ts` 固定图改用 messages4/profile3；`src/types.ts` 引用 profile3 的公共绑定类型，增加必填 `adaptation`，快照也采用 profile3 | Schema 只判形状；类型构造、Schema 原字节和定义全集验收见 M4-V1，尚无本版源码证据 |
| M4-P2：messages v4 S-49 的两个单条记录约束；profile3 S-29、S-31 | 现有 `judgeModelInvocationRecord` 的 v4 候选版本 | `src/judge.ts` 在形状有效后比较完整 `adaptation` 与 `profileSnapshot.adaptation`；再比较 `adaptation.definition.modelId` 与 `profile.routeName`。纯值比较不得现读目录、注册表或配置 | 不等统一 `{ rejected: 'malformed' }`，不补值、不决定哪个副本优先；M4-V2、M4-V3 待验 |
| M4-P3：messages v4 S-37、S-49；profile3 S-29、S-30 的精确 JSON 值 | 现有 `judgeModelInvocationRecordText`、无损快照与参数判定构件；绑定比较构件为候选 | 沿 CB3 公开 `readJsonStrict`／`writeJsonLossless`、`JsonValue` 与 CA2 `ExactDecimal`；对象成员无序、数组有序、JSON 类型保留、数字精确比较。可复用现有 `src/parameters.ts` 的精确比较算法并显式共享，不另造 JSON 代数 | 拒绝重复键必须早于 Schema；`1` 与 `1.0` 相等、相邻大整数不同；M4-V3、M4-V4 待验 |
| M4-P4：messages v4 S-39、S-40、S-49、S-50 | 现有全部消息与记录 judge 的 v4 候选版本 | 保留命名拒绝顺序、五种记录、参数处置重建与收场三支；新增绑定只影响 dispatched 分支。`validate`／`brandRecord` 仍是表示恢复入口，不能被称作完整 judge | Schema 有效而绑定不等时，表示恢复可成立而完整 judge 必须拒绝；M4-V2、M4-V5 待验 |
| M4-P5：messages v4 S-1、S-28～S-40 未变的纯值责任 | 现有消息 judge、`isReadable`、`judgeCompactionList`、`judgePairing` 的 v4 候选版本 | 沿原 v3 算法和显式只读前缀，不引入服务读面；相关形状仍消费 CB3 | v3 运行只说明旧版，v4 需按新固定图回归；M4-V5 待验 |
| M4-P6：messages v4 S-37 的无环定义对齐 | Schema 资源／构建时对齐测试 | `ResponseId`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment` 及 dropped 项形状仍按规范自定义；与 response4 逐项核对，messages 不反向 import response | 检查归双方消费闭包，response 节点拥有与源定义的对齐断言；M4-V6 待验 |
| M4-P7：精确版本采用及已公开面保留 | 候选 `./v3` 纯值入口，保留 `./schema/v2`、新增候选 `./schema/v3` | 按下面版本表固定类型、validator 和跨字段 judge，不把 v3 入口重导出 root4；实际旧3消费者显式接回其版本；v2仅保留Schema | M4-G2、M4-G3；旧Schema存在不表示曾有旧纯函数入口 |

## 公开面与版本生效

现有 `src/index.ts` 导出类型、`schemaId`、43 个定义名、`validate`、五个消息/记录 judge、三项日志前缀判定，以及 `brandMessage`／`brandRecord`、`isWireMessage`／`isWireRecord`、`Wire<T>`。v4 候选保持这些职责和名称；不把配置校验、版本注册或耐久写入塞进纯接口。

| 包入口 | 当前实际状态 | 本次候选结果与消费者义务 |
|---|---|---|
| `@omne-harness-lite/messages`、`./schema` | v3 | 在明确采用后切到 v4；类型、形状和完整 judge 同步采用，不能只换 JSON 资源 |
| `./v3`、`./schema/v3` | 均不存在 | 提供 v3 的完整纯值面和原字节 Schema；旧 root3 消费者逐一改到本入口，不随根入口升级 |
| `./schema/v2` | 原字节 Schema 已存在 | 保留原 Schema 的 `$id`、字节及完整解析闭包；不新增 `./v2` 函数/类型入口 |

root4 与 v3 两个函数入口分别持有固定 Schema 图和相应类型；共同的、经版本差异验收不变的纯算法可以共享。入口不探测输入后自动降版，也不接受新旧格式任意混用；旧 dispatched 无 `adaptation`，经 v4 完整边界即 `malformed`，不可推导或填入当前绑定。此包不提供日志迁移器、历史记录重写或“读到哪版算哪版”的入口。

版本选择在消费者装配/构建时显式确定。一个消费者同时读多版历史时，版本出处及路由归其已接受契约；本节点不给缺少版本信息的日志猜测政策。版本化入口不是热更服务，运行中的调用不会因另一个入口被 import 而改变自己的校验器。

## 固定 Schema 依赖闭包

以下是按 Schema `$id` 和相对 `$ref` 展开的完整资源图，包含根资源；不是只列 package.json 的直接依赖。v4 实施不得远程解析、复制 `$defs` 代替原资源或把 profile2 的 `$id` 指向 profile3 字节。

| 资源的精确契约版本 | root4 图（7 份） | v3 图（7 份） | v2 图（6 份） | 解析方式（候选增量） |
|---|---|---|---|---|
| messages | 4 | 3 | 2 | 本包 root Schema／`./schema/v3`／`./schema/v2` |
| model-profile | 3 | 2 | 2 | profile 根 Schema 切3；旧图显式用 profile `./schema/v2`，该端口待实现 |
| content-blocks | 3 和 2 | 3 和 2 | 2 | 当前公开根 Schema3 与保留 `./schema/v2`；2由 profile/call-accounts 传递引用，不能遗漏 |
| call-accounts | 2 | 2 | 2 | 当前公开 Schema2；精确数比较使用其公开实现 |
| identity-values | 1 | 1 | 1 | 当前公开 Schema1 |
| offer-expiry | 1 | 1 | 1 | 当前公开 `./schema/v1`，不取已演进的默认入口 |

Schema 技术引擎继续使用 CB 的现有公开 `./schema-runtime`；其固定图及精确数机制不迁入本包。profile3 的配置对象约束不假定 CB2 有 `JsonObject` Schema 定义。配置数值可经过 CB3 的无损纯函数读写，采用该机制不改变 profile3 对 CB2 S-24 的规范引用。

纯函数的语义依赖另外固定：root4 与 v3 共用 CB3 的公开内容块判定。root4 的档案类型采用 profile3，v3 的档案类型与参数校验显式采用 profile2；旧档案端口需由 [model-profile 节点](../model-profile/README.md)提供。v2 仅承诺现有 Schema 资源的保留，不新建 CB2 纯函数端口，也不在 messages 复制 CB2 领域判定。尚未实施、仍钉 messages2 的消费者，须凭独立采用决定选择其 Schema 读取责任或演进契约；旧契约状态不能自动变成一个从未存在的纯函数 API。

## 关键选择与取舍

| 选择 | 落选方的最强论证 | 本方弱点与重审条件 | 置信度 |
|---|---|---|---|
| 沿现有纯模块，不加 Cordis 插件 | 服务可统一注册与动态替换校验版本，消费者接线直观 | 每个消费者必须显式钉版本；本模块没有独立资源或授权行为，服务层会增加生命周期但不能新增保证。出现真正的动态校验服务契约再重审 | 高 |
| 固定 Schema 加完整纯 judge，保留表示恢复入口 | 非标准 `$data` 扩展可把字段相等塞入一次 Schema 调用，减少入口误用 | 两层入口需要明确文档与调用验证；Schema 标准跨语言承诺不应被扩展替换，完整拒绝值仍归 judge | 高 |
| 比较无损 JSON 值，不比较序列化字节、引用或修订字符串 | 修订比较成本低；规范化字节可稳定哈希并便于留痕 | 完整值遍历成本随输入大小增长；本包不自行加规格外大小上限。需优化时先测量，保持对象无序、数组有序、精确数语义 | 高 |
| 保留 v3 已公开纯值面与 v2 Schema，不让所有消费者自动采用4 | 一次迁移全部消费者能减少旧图和公开面维护；补齐 v2 judge 可给尚未实施的2消费者一个现成入口 | 多个固定图增加构建、声明与制品验收成本；v2未来消费者仍需明确其采用路径。保留针对实际公开面，移除需消费者逐一切换依据 | 中高 |

## 状态、并发、失败与装卸

本节点没有服务状态、提交点、I/O、凭据、时钟、后台任务或缓存配置默认值。单次判定只读调用者输入并生成分离值；成功返回后的配置对象不与调用者可变对象共享。消费者修改自己的原输入不得改变已返回记录；`readonly` 类型本身不充当这个运行时保证。

普通外部非法记录按既有 judge 收为 `malformed`。表示恢复函数在前提不成立时仍按既有 TypeError 接口收场，不增造运行时失败枚举。未注册实现、路由不支持配置、缺密钥和 TTL 缺席的业务判断由 runtime/transport 在出网前执行；本模块不会把这些未知信息猜成表示非法，或替它们提供默认值。构建产物的固定 Schema 图缺引用属于制品/初始化错误，不能静默降版。

| Cordis／存储问题 | 本节点责任 |
|---|---|
| 插件、服务键、inject、事件、effect | 全部不适用；零注册、零装载效应，不依赖内核清理或撤回行为 |
| 加载时取得及撤除时释放 | 无受管资源；版本化纯模块由调用者 import，固定校验器只含本包持有的 Schema。部分初始化错误立即可见，无外部状态需要回滚 |
| 对存储提供者的要求清单 | 空；没有表、锁、事务或跨 owner 同提交要求。messages v4 S-49 的出网前耐久、跨次发出同绑及 S-9 回复唯一归 runtime 写入者与共同日志提交点 |
| 身份、授权与秘密 | 消息/记录仍不携带租户壳；条目身份绑定、入口核实与秘密禁入由写入者接收边界承担。任意配置字符串无法被 Schema 普遍识别为秘密 |

## 消费者接续与实施清单

接受后按以下依赖顺序实施，每步的测试义务见 [verification](verification.md#v4-候选证据义务)：

1. 固定 messages4/profile3 候选的接受与原字节资源；完成 profile2 的保留纯值和 Schema 端口，支持真实旧消费者。
2. 增加 v3 纯值入口并固定三套 Schema 图；根4加绑定类型、无损复制与两个单条记录比较；保留完整参数处置、拒绝顺序和未变消息行为。
3. 接续消费者的明确采用。现有 loop-extension3 固定消费 messages3/profile2，须改为显式旧端口；model-response3 的保留面同样固定3/2，新 response4 才消费4/3。仍钉 messages2 的未来 capability 消费者不因此获得纯函数实现，按 M4-G3 独立处理；目录清单以 catalog 为准，不用源码 import 推断语义升级。
4. 运行本节点类型／Schema／跨字段反例／旧版本差异回归，在实际制品中同时消费3/4纯值面及2/3/4 Schema。响应节点完成副本对齐，runtime节点完成出门、重试、恢复及日志同提交演练后，才能声称整条留痕责任兑现。

此节点没有需要新建的独立应用装配。归装配事项明确交给消息的实际写入者及模型运行时验收装配：选择入口版本、每个接收边界调用完整 judge、条目身份核实、耐久 append 和历史版本选择。具体 runtime 验收装配尚待主线建立，不能由此纯节点给它填一个实现。缺口 M4-G1～M4-G4 与受阻消费在验证页登记。
