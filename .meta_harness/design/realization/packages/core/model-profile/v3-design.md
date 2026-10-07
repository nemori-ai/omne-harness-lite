# model-profile v3 增量实现设计

本稿为 `candidate`。兑现 `(omne-harness-lite-design-2026-09-15, data.model-profile, 3)`；[catalog](../../../../registry/catalog.json) 已登记候选，尚无本版语义接受。S-n 均指 [v3 契约](../../../../spec/data/model-profile/v3/contract.md)。已接受 v2 的 [design.md](design.md) 与原证据保留原范围。

## 实现路径与来源

在现有 `packages/core/model-profile` 纯模块上接续。当前实际 `src/index.ts` 导出类型、`judgeModelProfileDocument`、`refMatches`、`parameterNames` 与固定 Schema 的 `validate`；`package.json` 只有 `.`、`./schema` 两个公开入口，均采用 v2。v3 的以下接口变化均是**候选，尚未实现**。

共同分工取 模型请求适配提案 revision 2及其独立评审范围：本节点持有绑定的纯值表示；目录持有档案写入及配置修订历史；runtime 与传输提供者持有可用性、准入、在途版本和释放。新增绑定没有独立生命周期，不立 LLM 基类、注册服务或模型插件。

需求背景为 PF-013 rev 13，沿契约所列产品接受边界读取；S-29～S-31 的新增承诺来自本批用户要求与提案，不追认为旧产品 rev 已有承诺。本稿不形成新的产品接受。

实现继续采用现有 Ajv 8.20.0 的 Draft 2020-12 入口与 content-blocks 公共无损 JSON 设施，不增加库。Schema 采用 v3 原件并逐字节核对；完整判定继续以具名条件次序为准，不从 Ajv 错误顺序推导拒绝值。Cordis 采用版本仍为 D-025 的 4.0.4，本模块不依赖 Cordis，也不依赖任何 basis 机制主张。

## 契约责任到实现的投影

表中接口名除“现有”说明外均为候选 v3 投影；“缺口”表示尚未取得本版实现证据。

| 编号与契约责任 | 插件、服务或公开操作 | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| MP3-1：S-1～S-2、S-4～S-9、S-12 的值形状 | 候选 root 类型与固定 Schema | 现有纯类型与验证模块升级采用 profile v3；保持逐码点路由名、四模态及精确数值域 | 旧 v2 结果不证明 v3；V3-1、V3-4。S-12 可变性由目录执行 |
| MP3-2：S-13～S-14 的引用与给定行匹配 | 候选 v3 `ModelProfileRef`、`refMatches` | 继续官方两参、自建显式 scope、联合支显式可缺 scope 的三条现有重载形状；接收 v3 档案 | 引用身份不增加 adaptation 分量；不比较版本来判断是否同一档案。V3-5；不回答目录可读、注册可用或授权 |
| MP3-3：S-15～S-20 的参数形状、精确界与词表 | 候选 v3 `ModelRequestParameters`、`parameterNames`、完整 judge | 复用现有无损数值判定；参数成员与 adaptation 配置分开处理 | V3-4。不在本包补模型参数、TTL、缓存模式或 retry 默认值；实际发出归 runtime/transport |
| MP3-4：S-27～S-30 的完整绑定与快照形状 | 候选 `ModelAdaptationBinding`；v3 `ModelProfileContent`、`ModelProfile`、`ModelProfileSnapshot`；固定 Schema 新增同名 `$defs` | 三个档案表示的 adaptation 均必填；配置 values 取 content-blocks 的 `JsonObject`，不另造 JSON 值代数；成员闭合按规范 Schema | V3-1、V3-3、V3-6。快照只有类型与 Schema 形状读面，仍不属于 judge 四种文档；原样复制与留存归写快照者 |
| MP3-5：S-24～S-26、S-29～S-31 的纯表示判定 | 候选 v3 `judgeModelProfileDocument`；现有 `{ ok: true }` 或 `{ rejected }` 返回形状 | 增加 M13 与 M14；M14 在 routeName 自身合法后比较 definition.modelId；之后才判参数越界与输出上限。十个拒绝值不扩充 | V3-2；Schema 通过仍不能代替 S-18、S-31 比较。未注册实现、路由不支持配置不被该 judge 误报 malformed |
| MP3-6：S-30 的严格 JSON 与数值保留 | 现有 content-blocks `readJsonStrict`、`writeJsonLossless`、`JsonNumber` 被候选实现消费；profile 公开值面保持无损 | 接收 JSON 文本的 owner 先严格读取；本包接收值后验证 JSON 形状并保留精确数字，固定 Schema 视图不返回或覆盖原值 | V3-3、V3-4。不能从已丢失重复键/精度的普通解析结果重建原文；上游文本边界由接收方负责 |
| MP3-7：版本差异与消费者明确采用 | 候选 root、`./schema` 采用 v3；候选 `./v2`、`./schema/v2` 保留 v2 | 两版类型、judge、固定 Schema 校验分别绑定各自规范；未改变的纯算法可复用，不能让 v2 验证器误用 root v3 Schema | V3-7；无自动升级、转换或补绑定。仅供仍精确采用 v2 的消费者 |

### 公开面与版本采用

候选 root 导出 `ModelAdaptationBinding` 类型并扩展上述三个档案类型；现有函数名称、judge 的四种文档与十个拒绝值集合保持。`SCHEMA_DEF_NAMES` 增加 `ModelAdaptationBinding`；`validate` 只判断所选固定 Schema 的结构，不承担 S-31 的跨字段相等，也不产生新的快照拒绝值。

候选 `./v2` 提供旧纯值/校验入口，`./schema/v2` 保存原 v2 Schema 及其 `$id`。它们是仍有精确版本消费者的采用端口；不接受 v3 文档、不剥离 adaptation、不将旧快照加空绑定后冒充 v3。旧函数不在运行时查询 root 的“当前版本”。

现有 messages、model-response、loop-extension 的源码同时存在 root 类型及 `./schema` 导入，不能仅换本包的 root 而留下这些消费者不动。集成前须按各自精确契约逐入口处理：新 messages v4、response v4 候选采用 profile v3；仍采用旧契约的实现和嵌套 Schema 明确使用候选 v2 端口。模块内同时读取多版记录时，按已知文档版本选择对应校验器，不用“先试新版、失败试旧版”推断版本。完整受影响消费清单由主线集成持有。

### 无损配置与固定 Schema 视图

沿 `data.content-blocks/v2#S-24` 处理 JSON。当前 content-blocks root 已采用 v3，但复用的 `JsonObject`、`JsonNumber`、严格读写设施不改变该共同语义；本节点的 `Modality` Schema 依赖仍精确引用其公开 `./schema/v2`。依赖对齐必须在 V3-3/V3-7 检查，不能以相同类型名代替。

配置 values 可含任意深度 JSON 数，包括超出 IEEE-754 精度或有限 Number 范围的合法十进制数。不得通过 `Number`、普通 `JSON.stringify` 或 Ajv 的 coercion/default/removeAdditional 改写值。实现若为固定 Schema 的 JSON 类型检查建立数值占位视图，该视图只归验证器，绝不能作为返回值、相等比较值或快照源；规范数值界限在原数上判断。配置对象内名为 `seed`、`temperature`、`maxOutputTokens` 的键不是统一请求参数，不能按成员名递归误套参数约束。

M13 的纯值形状不识别任意字符串是否秘密，也不解释配置是否适用于某个实现；本包不执行其中的字符串，不注册代码、不联网。对象成员次序不参与绑定值相等、数组顺序参与、数按精确数值比较；消费者不可用 `JSON.stringify` 文本相等或仅修订字符串相等替代 S-29。跨文档绑定比较及历史约束的执行分别归 messages/response 与目录，不在本节点新加持久注册表。

## 关键选择与取舍

| 选择 | 落选方的最强论证 | 本方案弱点与复查信号 | 置信度 |
| --- | --- | --- | --- |
| 继续纯模块，不建 Cordis plugin/service | 服务可集中切换校验版本，方便统一部署 | 静态消费者必须显式升级依赖；若将来出现实际独立资源生命周期，须重判该新增责任。本版 S-24 无资源、无提交，服务会引入未承诺可用性 | 高 |
| root/schema 采用 v3，同时保留精确 v2 端口 | 只留新版可减小代码和制品，也能强迫全树一次升级 | 双版需额外 fixture、Schema resolver 与独立制品检查；仅在已有 v2 消费者存在期间有价值，不能扩成无期限兼容承诺 | 高，采用发布仍待主线 |
| 复用无损 JSON 与 Ajv 固定 Schema，两步完整判定 | 全部改写专用判定器可避免 Ajv 占位视图；仅 Schema 最易复用 | 必须证明精确数字先判、视图不泄漏、M13/M14 与旧拒绝优先级一致。任一反例阻断采用 | 中高 |
| 不把引用匹配升级成注册/授权查询 | 合并查询可让调用者少调用一次，看似能及早拒绝不可用版本 | 使用方必须另外调用真实目录与 runtime 准入；漏接会导致不完整的调用链，需组合验收。纯函数不持有这些事实 | 高 |

## 依赖、作用域与绑定

| 精确语义依赖 | 提供者与解析 | 生效点与缺席政策 |
| --- | --- | --- |
| `data.identity-values/v1` S-5、S-11～S-12、S-16～S-17、S-30～S-31 | 现有 identity-values 公共值、范围解析与显式空白集合；固定 Schema 引用 | 随制品静态绑定；不提供身份默认值。依赖缺失是构建/装载错误，不映射成档案不存在 |
| `data.offer-expiry/v1` S-22 与 `$defs/Instant` | 现有 offer-expiry 公共 Schema `./schema/v1` 及 Instant 形状检查 | 不读取时钟、不改时间；updatedAt 的写入仍归目录 |
| `data.content-blocks/v2` S-6、S-24 | 现有 content-blocks 公共 JSON 设施和 `./schema/v2`，按前文共同语义核对 | 静态依赖；不读取 Context、会话或租户环境 |

本包无服务键、inject、事件、每租户实例或全局可变配置。固定规范 Schema 的编译产物可随模块持有；不缓存调用方配置或按档案建立无界缓存。运行日志、诊断导出与租户授权归调用边界，纯值判断结果可由它们记录，本包不自行记录配置正文。

## 状态、并发与失败映射

本节点无领域状态、事务或提交点。输入错误按 S-25 收敛为一个拒绝值；不把 Schema 编译失败或实现内部不一致伪装为输入错误。无运行配置，因此本批“缺密钥/非法路由配置”的统一运行政策在本节点不触发：它们分别由凭据提供者、runtime/transport 在契约规定边界处理。

judge 和 refMatches 同步处理给定值，不改变调用方值。TypeScript `readonly` 只约束类型使用，不证明深层对象不可变；调用期间精确绑定和后续快照不变由 runtime 的复制/冻结与租约协议保证。配置 revision 不改义需目录在同一档案身份内比对历史值，本节点不根据一次文档输入承诺历史唯一性。

## 对存储提供者的要求清单

**无（0 项）**。S-3 的同格判重、S-10/S-11 的写入、S-29 的配置历史与 S-27 的调用留存，分别由目录和 runtime 的存储要求承担；本模块没有两个写入者，也不声称可由进程内锁兑现任何跨 owner 同提交保证。

## 成对的装载与撤除

**不适用（0 项受管效应）**。静态 import 不取得连接、密钥、监听、计时器或租约；无发布/撤除服务、部分资源初始化或等待排空。固定 Schema 编译成功后公开计算可用；规范副本不合法即暴露制品错误。已创建的值随调用者保留，消费模块卸载不回滚这些值；dynamic adaptation 的撤除归传输提供者。

## 实施缺口与消费者影响

| 缺口 | 条款与受阻消费 | owner 与闭合条件 |
| --- | --- | --- |
| MP3-G1：v3 语义及节点未接受 | 全部候选 API；messages v4、response v4、目录 v3、runtime v3 的实施采用 | 主线独立评审、明确技术采用并登记精确范围；本稿不接受自己 |
| MP3-G2：v3 产品源码与制品证据尚无 | S-24～S-31；任何要求读取 adaptation 的消费者 | 本包实施者完成 V3-1～V3-7；现有 185 项 v2 测试和 321 项候选 Schema 检查均不可替代 |
| MP3-G3：root 切换需消费者同步 | 版本差异；所有仍由 root/schema 读取 v2 的消费者 | 主线与各消费者 owner 完成公开入口审计及双版本独立制品消费；未迁移者不得随 root 自动升级 |
| MP3-G4：外部保证未由纯值实现承担 | S-3、S-10～S-12、S-21～S-23、S-27、S-29～S-31 的写入/可用性部分 | [目录节点](../../model/model-profile-directory/README.md)、[runtime 节点](../../model/model-request-runtime/README.md)、[传输节点](../../model/pi-ai-transport/README.md)完成具名行为及真实组合验收 |

本节点无需要归装配的存储、时钟、密钥或身份核实事项。调用方装配仍须把严格 JSON 接收与对应版本的纯判断接在真实边界上；该边界的 owner 是目录、runtime 及持久记录消费者，不由本纯模块增加一个应用节点。证据义务与状态见 [verification.md](verification.md#v3-候选的证据义务)。
