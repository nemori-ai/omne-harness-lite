# messages v6 当前格式迁移（candidate）

## 输入、状态与范围

本稿为既有 `packages/core/messages` 纯模块的窄迁移候选，不新增 package、Cordis 插件、服务或工具平台。目标坐标为 `omne-harness-lite-design-2026-09-15 · data.messages · v6`（MS6），精确消费同 baseline 的 `data.model-profile · v5`（MP5）。两份候选正文位于 `spec/data/messages/v6/contract.md` 与 `spec/data/model-profile/v5/contract.md`；起草时尚未发布到本节点所在设计树的 catalog，最终资源及 hash 待契约 owner release、主线登记与采用，**不得据本稿宣称已接受或已实施**。

已接受输入为 [MS5](../../../../spec/data/messages/v5/contract.md)、[MP4](../../../../spec/data/model-profile/v4/contract.md) 与 D-099；需求沿 MS6 的 PF-009 rev 8、PF-013 rev 14 及其余精确依赖，不另立产品政策。最新发布前破坏性迁移要求由主线给定；本稿接续 [v4 设计](v4-design.md) 的纯模块、原数比较与拒绝次序，取代其保留旧运行入口的方向。[profile 破坏性增补](../model-profile/v4-breaking-migration.md)提供消费者范围；该增补的 MP4 坐标和兼容冲突仍由主线以后继采用收口，不把它当作 MP5 的接受依据。

Cordis 采用版本仍为 D-025 的 4.0.4。本节点不 import Cordis、没有 basis 机制依赖，不新推导生命周期保证。以下函数名定位现有公开面，其 MS6 版本均为候选。

## 契约责任到兑现点

| 契约责任 | 公开操作／构件 | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| M6-P1：MS6 S-37/S-49；MP5 S-27 | `validate`、`isWireRecord`、`brandRecord` 与 `ModelCallDispatchedRecord` | `src/schema.ts` 固定 MS6/MP5 图，`src/types.ts` 引用 MP5 root 类型；`src/values.ts` 的快照恢复完整保留 `inputConstraints`、`upstreamInputLimits`，连同所有原成员深复制，不以字段白名单遗失新值 | M6-V1/V2/V3 待验；表示恢复仍只保证 shape |
| M6-P2：MS6 S-39/S-49 | `judgeModelInvocationRecord`／文本入口及 `dispatchedValid` | 形状通过后保留完整 `adaptation` 与 `profileSnapshot.adaptation` 的深值相等、`adaptation.definition.modelId = profile.routeName`、实际参数重建判定；不以修订字符串代替完整配置比较 | M6-V3/V4；失败仍 `malformed`，不补默认、不读当前目录 |
| M6-P3：MS6 S-37；MP5 S-27/S-30 | `snapshot`、`brandRecord`、既有 `jsonEqual` | 沿 CB3 严格无损 JSON 与 CA2 `ExactDecimal`；两个新增对象及其 limited.value 在文本读取、复制、返回与序列化全过程保留原数；对象键无序、数组有序、数字按精确值比较 | M6-V3；不能先普通 JSON.parse 再声称大整数无损 |
| M6-P4：MS6 S-1～S-40/S-50 | 全部现有消息／记录 judge、可读性、名单与配对判定 | 算法职责不变，按当前固定图回归七种消息、五种记录、十四项拒绝及优先级、三支收场；cap/fact 不进入消息块或模型上下文 | M6-V4；日志实际唯一与耐久仍不在本节点 |
| M6-P5：MS6 S-37 的无环副本对齐 | Schema 资源与消费图 | `ResponseId`、`SelectedBy`、`CredentialScope`、`ParameterAdjustment`、dropped 项与 MR7 对齐；messages 不反向依赖 response | M6-V1/V4；对应 response owner 联合验收 |
| M6-P6：MS6 当前格式边界 | root、`./schema` 和全部实际消费者 | 仅执行当前 MS6，删除 `./v3`、`src/v3/` 及只服务旧 model codec 的判定/制品；`./schema/v2`、`./schema/v3` 仅作下述现行精确依赖资源；当前消费者同步迁移 | M6-V5/V6；不新增 `/v4`、`/v5` 或自动降级入口 |

**接收快照不重新判定档案。**MP5 S-27 把 S-18/S-33 关系留给快照写入方。本包校验快照成员集合与各成员域、执行 MS6 明订的单记录跨字段约束；不对收到的快照调用完整档案 judge，不把 cap 大于 fact 新造为快照接收拒绝。写入方须从已通过档案完整判断的值原样复制，runtime 负责该事实。新增字段不扩大 `jsonEqual` 的调用范围：这里只比较契约指定相等的绑定与参数；不得凭当前目录补出另一份快照再比较。

## 唯一当前 Schema 闭包

固定图含以下 **7 个原字节资源**。root 类型、Schema `$id`、运行时校验器和文本入口一起切换；禁止远程解析，禁止将旧 `$id` 映射为新字节。

| 精确资源 | 包公开来源与用途 |
| --- | --- |
| `data.messages/v6` | 本包 `./schema`，43 个定义全部可实际编译 |
| `data.model-profile/v5` | model-profile `./schema` 与 root 类型／参数表示校验 |
| `data.content-blocks/v3` | content-blocks root Schema 与纯值判定、严格 JSON |
| `data.content-blocks/v2` | content-blocks `./schema/v2`；MP5/CA2 精确传递依赖 |
| `data.call-accounts/v2` | call-accounts root Schema 与 `ExactDecimal` |
| `data.identity-values/v1` | identity-values root Schema |
| `data.offer-expiry/v1` | offer-expiry `./schema/v1`，不换成其默认新版本 |

继续复用 content-blocks `./schema-runtime`，不另造 Schema 引擎。CB2/OE1 留在图中是当前契约的精确依赖，不是 messages 旧格式兼容。移除的是 messages、profile 旧运行分发，不顺带升级 IV/CB/OE/CA。现行 [connector/v2 S-4](../../../../spec/data/connector/v2/contract.md#s-4-投递目标) 与其 Schema 的 `DeliveryTarget.session` 仍精确引用 messages2 的 `SessionRef`，`packages/core/asset-model/schema/resources/connector.schema.json` 也保存该引用；因此保留 messages `./schema/v2` 的原字节资源，仅用于这些现行规范的闭包，不保留对应旧 messages 执行 codec、自动路由或旧 model 记录恢复入口。`session-tenancy-table/src/values.ts` 也只编译这份资源的 `SessionRef`。MS6 当前运行图仍恰为上表七资源，不把这些被明确保留的资源注入其图。另有现行规范闭包 `MR7 → LC6 → AM3 → LC3 → MS3/MP2`：AM3 Schema 的 `$defs.AssetContent.oneOf` 中 `loop_extension` 分支的 `extension`引用 LC3 的 `LoopExtensionDefinition`，LC3 的消息／事件定义再精确引用 MS3；保留 `./schema/v3` 原字节资源供该闭包解析，不恢复 `/v3` 执行入口。依据为 [AM3 Schema](../../../../spec/data/asset-model/v3/asset-model.schema.json) 与 [LC3 Schema](../../../../spec/data/loop-extension/v3/loop-extension.schema.json)。另有 `LC6 → AM3 → skill-package2 → AM2 → LC2 → MS2` 分支，因此 MS2 资源用途不限于 SessionRef。MS3/MS2 传递所需 MP2、CB3/CB2、CA2、IV1、OE1 原字节资源由各自 owner 保留公开 Schema 面；该分支依据 [AM2 Schema](../../../../spec/data/asset-model/v2/asset-model.schema.json) 与 [LC2 Schema](../../../../spec/data/loop-extension/v2/loop-extension.schema.json)；完整图由 response/loop-extension owner 构建并实编译，messages 不造通用版本解析器、不把旧 model record 带回当前运行面。其余冻结引用不得悄悄改指新字节，若实际闭包还有遗漏，由集成者点名具体条款；不以删除版本数字为由扩大无关规格演进。

## 当前消费者与删除清单

清单按源码基线 `11c6c5b0` 的实际 imports；集成前再扫描新增调用方。源码路径是定位，不替代各消费者的契约采用。

| 当前位置 | 本次迁移与 owner |
| --- | --- |
| `packages/core/messages/src/v3/`、package exports；tests 中旧入口导入、`versioned-schema` 与 `adaptation` | messages owner 删除旧 codec/无现行依赖的资源/制品，保留上段具名 `schema/v2`、`schema/v3` 精确资源；旧行为仍适用于当前规范的用例迁到 root，旧入口可用性断言改为不存在断言，不能整批丢弃原语义回归 |
| `packages/core/model-response/src/{types,schema}.ts`、`src/v3/`、`src/v5/` 及 copies/type 测试 | response owner 采用 MR7/MS6/MP5，删除被替代执行分支；按 MR7 完整精确闭包保留必要 MS3/MP2 等 Schema 资源注册，不当作旧 model codec；保留无环副本对齐 |
| `packages/core/loop-extension/src/{types,values,schema,judge}.ts`、`src/v3/` 与测试 | extension owner 采用 LC6/MS6/MP5；旧执行分支删除；LC6→AM3→LC3 的现行精确 Schema 图仍保留，root judge 的完整输入传播仍受真实测试约束 |
| `packages/model/model-request-runtime/src/` 中 log-codec、anchored-invocation、settlement、call-history、input、types、response-construction、call-tools 等 root imports | runtime owner 采用 RT7 组合；完整快照写入、读取、跨记录相等及拒绝旧数据由真实边界证明，删除旧 codec 分流，不只让 TypeScript 通过 |
| `packages/model/pi-ai-transport/src/input.ts` 与各厂商/工具集成 tests | transport owner 采用当前 messages root，保留工具、图片等消息语义与测试；不因格式迁移缩成文本模型 |
| `packages/session/session-log-jsonl/src/types.ts`、`tests/model-data.spec.ts` | 日志 owner 对齐当前 SessionRef 类型与模型记录测试；本包不替日志修改存量字节或定义日志恢复政策 |
| `packages/session/session-tenancy-table/src/values.ts` 的 `/v3` 与 `/schema/v2` | 会话身份 owner 将 `/v3` 类型改用 root，核对 SessionRef 形状同构；`/schema/v2` 仅编译现行精确 SessionRef，不为模型记录提供旧运行面 |
| `packages/assets/evaluation-input-store/src/{registry-inputs,publication,reader}.ts` 的 `/v3` | 三处均仅判 `SessionRef`；资产 owner 改用 root 并验证该定义同构，不升级资产领域语义，不引入消息/模型记录的旧版 fallback |
| `examples/model-invocation-minimal-demo/src/{types,bootstrap,demo,model-request-text}.ts`，bootstrap 的 `/schema/v2` | demo owner 当前模型格式统一接线，bootstrap 的 MS2 SessionRef 资源按同一现行精确依赖保留并仅编译该定义；新数据目录验收；不自动改写、重置或清空旧用户数据，不为保住旧数据运行加过渡层 |
| `tools/core-verification/src/{w6-asset-consumer,w6-stream-consumer}.ts`、相关 public types；`tools/ts-checks` 的旧 schema 子路径规则/测试；core/stream-assembly 的旧 fixture引用；上述成员及 messages README/README_ZH | 验证/各包 owner 更新当前消费者与制品规则，历史 evidence 不改标。旧 fixture 按实际消费分类：现行精确依赖仅保留必要原字节资源，其余仅作拒绝样本或独立规范历史输入，不要求当前包重新分发旧 codec |

构建前清空各被替代输出目录，独立制品检查旧入口与私有旧文件均不可导入；单改 exports 留旧 dist 不算完成。同步迁移清单不授权改写消费者被冻结的规范。保留原字节规范资源与保留旧执行兼容是两回事；禁止让 model runtime 利用这些资源认回、结算被替代格式。

## 状态、失败、生命周期与存储

本节点无 I/O、可变业务状态、租户授权、密钥、时钟、网络请求、后台任务、提交点或跨 owner 事务。输入仍由调用者所有，返回为分离值；拒绝不修改调用者数据。旧格式缺少必填成员按既有 `malformed` 返回，恢复品牌入口沿原 TypeError 前提，不增加错误枚举或版本推测。

| 装载贡献／资源 | 所有者与可用时点 | 部分失败 | 撤除 |
| --- | --- | --- | --- |
| 固定纯模块与 Schema 校验器，无 Cordis 注册 | 模块持有固定资源图，完整编译后可调用 | 缺 Schema 引用属于构建/初始化错误，直接失败，不降版 | 无外部资源释放或在途异步取消；同步调用按本次输入返回，已产出值不变 |

存储提供者要求清单为空。S-49 的发前耐久及跨次同绑归 `model-request-runtime` 与 `session-log-jsonl`；它们必须自己的共同提交边界内兑现，本稿不据纯值校验声称已兑现。入口层身份核实、密钥与网络配置仍归这些消费者的装配；本节点不配置上述值，故无新增配置错误政策。验收 demo 是开发示例，不新增产品 app。

## 关键选择与缺口

| 候选选择 | 落选方最强理由 | 本方弱点／置信度 |
| --- | --- | --- |
| 沿用纯模块 | 新增服务可统一切换校验实现 | 每个消费者需显式采用；本节点没有资源或生命周期责任，服务无新增保证。高 |
| 当前 root 单轨、删除旧运行面 | 旧入口可减少消费者同时迁移工作 | 需一次收齐所有 imports 和 Schema 图；这是用户明确要求，不为方便保留过渡层。高 |
| shape 与完整 judge 分开，精确值比较 | 一次 Schema 扩展判断能减少入口误用 | 文档和真实调用方必须区分两面；不增加非标准 Schema 或快照跨字段拒绝。高 |

缺口及六项验收见 [verification](verification.md#v6-当前格式迁移候选义务)。本候选新增 binding 为 0；MS6/MP5 catalog 登记、独立审阅、精确采用及最终原字节核对尚缺，消费者不得仅依据候选切换语义。现有源码不是本候选的验证结果。
