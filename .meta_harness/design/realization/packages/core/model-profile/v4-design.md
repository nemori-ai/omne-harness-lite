# model-profile v4 增量实现设计

本稿为 **candidate**，兑现 `(omne-harness-lite-design-2026-09-15, data.model-profile, 4)`；[catalog](../../../../registry/catalog.json) 登记为 candidate，无本版接受。下文 S-n 指 [v4 契约](../../../../spec/data/model-profile/v4/contract.md)。需求依据为 [PF-013 rev 14](../../../../product/PF-013-model-profiles-and-invocation/design.md)及 [D-096](../../../../record/decisions/model-profile-input-limits-product-adoption/decision.md)。[v3 增量](v3-design.md)和 [v2 设计](design.md)保持原文与采用范围。

## 实现路径与公开面

接续现有 `packages/core/model-profile`，不是新建包。起草时源码 root 已采用 v3，实际有 `.`、`./schema`、`./v2`、`./schema/v2`；旧入口的“v3 尚未实现”是当时记录。本增量未实施。沿用 Ajv 8.20.0、content-blocks 公共无损 JSON 设施与既有精确数值算法，不增加依赖。

以下为**候选公开变更**，接受后实施：

- root 的 `ModelProfileContent`（及继承它的 `ModelProfile`）新增必填 `upstreamInputLimits: UpstreamInputLimits`；`InputConstraints` 增加可选 `maxImages`、`maxRequestBytes`，数值均为公共 `JsonNumber`。模态条件由完整校验兑现，不能凭可选 TypeScript 成员认定 image cap 可缺。
- 导出 `InputLimitFact` 判别联合：`{ readonly status: 'unknown' } | { readonly status: 'unbounded' } | { readonly status: 'limited'; readonly value: JsonNumber }`；导出 `UpstreamInputLimits`，必填 `maxInputTokens`、`maxRequestBytes`，`maxImageBytes`、`maxImages` 按宿主 image 条件校验。所有成员 readonly，不另造数值或模态代数。
- `ModelProfileSnapshot` 的既有 Pick 增加 `inputConstraints`、`upstreamInputLimits`；不得继续沿用 v3 少了输入限制的成员集合。
- `SCHEMA_DEF_NAMES` 增加 `InputLimitFact`、`UpstreamInputLimits`；`validate` 可验证这两个固定定义。独立 `UpstreamInputLimits` 无模态输入，image 适用性由档案、建档内容和快照宿主 Schema 验证。
- `judgeModelProfileDocument` 名称、参数和返回联合保持；文档种类仍四种，拒绝值仍十个。`refMatches` 的现有三条重载、`parameterNames`、参数词表保持。不新增快照 judge、目录更新 API、自动 cap 生成器或 clone 服务。

## 契约责任到实现的投影

各行是候选兑现点，尚无本版产品实现证据；验证义务编号见 [verification](verification.md#v4-候选的证据义务)。

| 编号与契约责任 | 插件／服务／公开操作 | 实现与采用版本 | 符合性依据或缺口 |
| --- | --- | --- | --- |
| MP4-1：S-8、S-9、S-32 的表示与适用域 | 纯类型与 `validate`，无插件或服务 | `src/types.ts`、`src/schema.ts` 对齐 v4 的全部 14 个 `$defs`；正整数在原值检查，宿主判断 image 条件 | V4-1；合法 unknown 不拒绝，不把缺键或空对象补成 unknown |
| MP4-2：S-24～S-26、S-33 的完整判定 | `judgeModelProfileDocument` | `src/profile.ts` 将 M15/M16 放在既有 malformed 阶段；其后九种拒绝值次序保持 | V4-2；Schema 不承担 S-33、S-31 或 S-18 的跨字段关系 |
| MP4-3：S-27、S-30 的快照形状和无损数值 | `ModelProfileSnapshot` 与固定 Schema | 两个新增完整对象进入公开类型及 Schema；复用严格读写，绝不把数值投影视图交给调用者 | V4-3；复制、深层隔离、保留及实际发送计量分别归 runtime/transport |
| MP4-4：S-11、S-12、S-28 的六项值变化 | 公开值供目录比较；本包不写时钟 | 不新增状态或提交操作；向目录交付包含六项的完整类型和无损值，比较交接见下文 | V4-4；目录的时间推进与持久提交不是本纯包可证明的性质 |
| MP4-5：精确版本消费、S-27/S-30 历史值保留 | 候选 root/schema v4；明确版本入口 | 原 v3 固定 Schema 与纯类型/判定收至候选 `./v3`、`./schema/v3`，现有 v2 入口保持；历史 codec 显式绑定旧版 | V4-5；不按缺字段猜版本，不补上游事实或当前目录 cap |

### M15/M16 的落点与次序

接续现有 `malformed` 条件，不用整体档案 Schema 失败替代拒绝值分类，否则未知 constraint、空 provider 或参数越界都会被抢报 malformed。新增 required 成员 `upstreamInputLimits`；对三个已登记项目 cap 的原值检查正整数，未知项目键仍留给末位 `constraint_unknown`。

M15 检查上游闭合字段、三支形状以及宿主 image 的必填/禁用条件：含 image 必有项目 `maxImageBytes` 及两项 image 上游事实；不含 image 禁止项目和上游的两项 image 指标。事实 unknown/unbounded 不得带 value，limited 必须带合法正整数 value。缺失 cap 不因本次请求无图而放行。

M16 只对结构、适用域和原数均合法的对应项执行精确比较：顶层 `maxInputTokens` 及 `inputConstraints` 中实际存在的三个 cap，分别对同名 limited.value 比较。任何 cap 大于 value 即 malformed，等于允许；可选 cap 缺席不补值，unknown/unbounded 不参与比较。M16 必须先于 `parameter_out_of_range`、`max_output_exceeds_profile` 和 `constraint_unknown` 返回。旧 M14 的 routeName 合法前提保持，不改空路由的既有答案。

`src/schema.ts` 的原数检查和投影须按所选定义及语义位置遍历：新增 cap、InputLimitFact.value 都检查原值；对合法有限数字再建立 Ajv 可接收的正整数占位。不能只把字段名 `value` 在整个任意 JSON 配置中一律当作 limit；`adaptation.configuration.values` 和 `parameters.extra` 仍接受其约定的任意 JSON 数。数值比较复用现有十进制源码算法，不转 Number、不增加 safe-integer 上限，不启用 coercion/default/removeAdditional。

### 六项比较、快照和历史消费的交接

目录维护者按 S-11/S-28 比较 `inputModalities`、`outputModalities`、`maxInputTokens`、`maxOutputTokens`、`inputConstraints`、`upstreamInputLimits`：两组模态按集合、数按精确数值、对象按 JSON 值（成员次序无关，嵌套数仍按数值）比较。unknown→limited 或 cap 独立改变都是变化；对象换序、1→1.0 不是变化。providers、parameters、adaptation、registration 单独变化不推动这个时间。输出 cap 的 S-18 例外保持；核心模块不读取时钟或声称完成目录更新。

runtime 从一次完整读取的合法档案复制快照全部成员，使用公共无损 JSON 复制设施保持嵌套对象与原输入隔离；readonly 或只展开顶层对象不能证明历史副本不变。core 只提供形状和判定，不新增专用克隆入口。新值缺限制一律拒绝；旧记录的读/结算由已有版本识别的 codec 选择对应旧 Schema，不能从当前目录补齐，也不能把旧快照作为新发送合规证据。

root/schema 切换与消费者迁移是同一集成增量：messages v5、model-response v6、loop-extension v5 采用 MP4；保留旧格式的 codec 明确引用 v3/v2。源码现有 `model-response/src/v5/schema.ts` 与旧版公共类型仍导入 profile root，必须钉到 v3，不能随 root 漂移。目录/runtime/transport 的新写路径切至 v4。版本入口只服务已存在的精确契约与历史读取，不提供自动探测、升级、降级、剥字段或缺省回填策略。

## Cordis、依赖、存储与装卸

本节点是纯值模块，无服务键、fiber、inject、事件、租户实例或存储要求（0 项），没有跨 owner 同提交承诺。本版不引入上游机制假设；项目 Cordis 采用仍为 [D-025 的 4.0.4](../../../../record/decisions/cordis-adoption-version/decision.md)，本包不依赖 Cordis，basis 绑定不适用。

精确语义依赖保持 identity-values/v1、offer-expiry/v1、content-blocks/v2，与 MP4 catalog 一致；Schema 分别使用已存在的固定公开入口，JSON 数值设施沿 content-blocks 公共语义。固定 Schema 按规范原件逐字节分发，编译成功后同步纯函数可用；缺依赖、坏规范副本或内部分类不一致暴露制品/实现错误，不伪装为用户 malformed 或档案不存在。

静态 import 不取得连接、计时器、密钥、监听或租约，无受管装载/撤除效应（0 对），无在途异步工作。模块撤除不删除已交给消费者的值。输入无效返回既有具名拒绝；没有运行配置或 cap 默认值，缺密钥的批次政策不在本节点触发。时钟、授权、目录持久化及调用资源仍归既有目录和 runtime/transport owner；本节点没有新增归装配事项。

## 关键取舍

| 选择 | 落选方的最强论证 | 本方案弱点／复查信号 | 置信度 |
| --- | --- | --- | --- |
| 延续纯值模块 | Cordis 服务可集中切换规则 | 静态消费者需显式采用新版本；本版没有独立生命周期，增加服务只添可用性边界 | 高 |
| 复用 Ajv 与原数比较，新增具名条件 | 全手写判定可避免投影视图；仅 Schema 更短 | 原数递归和 malformed 次序必须有负控，不能依赖字段名投影的偶然正确 | 高 |
| 精确版本入口只供已知消费者 | 删除旧版最省维护 | 多版需验证制品和 `$ref` 不串版；当历史消费退役后另行删除，不承诺通用兼容 | 高 |
| 不新增比较/克隆服务 | 统一 API 可减少调用者步骤 | 目录和 runtime 须在真实写入链证明比较与隔离；本包没有相应状态或提交权 | 高 |

## 缺口与受阻消费者

- MP4-G1：v4 契约与本节点增量尚未接受；主线负责独立评审与精确采用，阻断本版正式采用，不阻断已有 v3 执行。
- MP4-G2：MP4-1～MP4-5 尚无产品实现/制品验证；包实施者完成 V4-1～V4-5 和双语 README，才可交给后继数据包、目录及 runtime 使用。既有 v2/v3 测试不提升本版状态。
- MP4-G3：S-11/S-27/S-33 的跨调用行为、计量和来源核实属于[目录](../../model/model-profile-directory/README.md)、[runtime](../../model/model-request-runtime/README.md)及[transport](../../model/pi-ai-transport/README.md)。本纯模块不填写任何官方模型供给 cap、不猜事实、不证明缓存或真实请求已经合规。

新增 binding 为 0；既有 bindings.yaml 不变。下游实施和主线集成负责 [verification](verification.md#v4-候选的证据义务) 所列可失败检查，本稿不把尚未运行的测试登记为证据。
