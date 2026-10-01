# model-profile v4 破坏性迁移增补

状态：**candidate，待主线 D-100 采用**。用户明确要求现阶段不兼容旧版、直接破坏性重构；本稿据此替代 D-098 采用的 [v4-design.md](v4-design.md) 中 MP4-5 及历史消费段的兼容路径。已采用原件不改写。MP4-1～4、M15/M16、数值精度、纯值边界均保持；兑现的契约仍为 `(omne-harness-lite-design-2026-09-15, data.model-profile, 4)`，不修改其正文。

## 改动范围与不变量

候选公开面仅保留 root 与 `./schema`，直接采用 MP4。**不新增 `./v3`、`./schema/v3`；移除 model-profile 的 `./v2`、`./schema/v2` 以及只为这些旧端口服务的实现和分发制品。**本纵线当前数据包、目录、transport、runtime 和 demo 同步迁移，不用旧消费者 pin 保持运行。

新入口按 MP4 完整判断旧 shape，缺少上游事实或完整限制快照即拒绝；不按缺字段猜版本、不自动降级、不补默认 cap 或绑定、不查询当前目录修复历史快照。已有用户数据保留原样，版本不兼容由实际接收 owner 按其具名失败面明确报告；不得为启动成功原地改写、清空或迁移这些数据。开发 demo 验收使用显式新建的数据目录。

这不撤销 MP4 的精确语义依赖：identity-values/v1、offer-expiry/v1、content-blocks/v2 仍按既定坐标采用。保留这些依赖入口不是 model-profile 旧数据兼容；不顺带重做全系统版本、资产或会话平台。规范与历史证据原件照常保留，运行制品不因此保留旧 codec。

## 移除旧端口前的实际消费者处置

下表来自起草时源码导入，列的是本纵线必须同步处理的入口，不授权重写其冻结规格。消费者 owner 采用已成稿的后继契约，清除被替代旧实现的依赖；不能把旧 Schema 的 `$ref` 字符串改指 MP4 来假装兼容。

| 实际位置 | 当前依赖 | 本次实施处置与 owner |
| --- | --- | --- |
| `packages/core/model-profile/src/v2/`；`tests/{types.spec-d,behavior.spec,adaptation.spec,examples.spec}.ts` | 旧类型、校验与 `/schema/v2` | 本包移除旧运行面及对应兼容测试，保留 MP4 核心行为回归、增加旧 shape 拒绝与旧导出不存在检查 |
| `packages/core/messages/src/v3/{parameters,types,values,schema}.ts`；当前 `src/{types,parameters,values,schema}.ts` | 前者 profile v2，后者 profile root | messages owner 当前实现统一采用 messages v5/MP4，撤掉旧版运行 codec 和其分发依赖 |
| `packages/core/loop-extension/src/v3/{types,schema}.ts`；当前 `src/{types,schema}.ts` | 前者 profile v2，后者 profile root | loop-extension owner 当前实现统一采用 loop-extension v5/MP4，撤掉旧版运行 codec 和其分发依赖 |
| `packages/core/model-response/src/v3/{types,schema}.ts`、`src/v5/{types,schema}.ts`、`src/{types,schema}.ts` | v3 使用 profile v2；当前和 v5 Schema 同时加载 root 与 retained `/schema/v2` | model-response owner 当前实现统一采用 model-response v6/MP4，撤掉旧 codec 及其旧 Schema 注册图；取消原稿“v5 改 pin v3”方案 |
| `packages/model/model-profile-directory/src/{types,input,judgments,records,equality,runtime,plugin}.ts` | profile root | 目录 owner 采用 directory v4，完整保存/校验 MP4；六项值变化比较不遗漏，新写不补字段，旧存量不就地改写 |
| `packages/model/pi-ai-transport/src/{definitions,configuration,input,registry,plan}.ts` 与 `src/official-models/` | profile root | transport owner 传播 MP4 caps/facts；完整定义和官方声明显式给值，不能由旧配置推断 unknown 或 cap |
| `packages/model/model-request-runtime/src/` 的 selection、input、dispatch-guard、types 及会话前缀接收路径 | profile root 及嵌套消息/响应数据面 | runtime owner 同步采用 RT6/MS5/MR6/LC5 的精确采用组合，撤销旧 profile 读取/结算分支，版本不兼容明确失败且不修改旧事实 |
| `examples/model-invocation-minimal-demo/src/{prepare,types,bootstrap,migrations}.ts` 及测试 fixture | root 与目录装配 | demo owner 使用新声明和新数据目录验收；不保留旧 profile 数据自动迁移，不静默重置用户目录 |

集成者还须扫描全树实际导入与嵌套 Schema 注册，保证移除端口后无遗漏消费者；该扫描是消除悬空依赖，不是扩大产品能力或新增兼容层。

## 最小实施与验收

1. 本包 root/schema 升 MP4，新增字段、M15/M16 和原数检查按原增量实施；移除旧导出、源码、Schema 分发副本，清理旧 dist 后构建。
2. 同步完成表中当前消费者迁移和旧运行分支清理。保持各自规范制品 `$id` 与依赖图真实，不用强制断言消除新字段的类型错误。
3. 包 README/README_ZH 只演示当前 MP4：显式供给 cap、三态事实、完整 judge；说明不兼容旧档案且不改用户数据，不再列旧版读取示例。
4. 重跑 V4-1～4 对应 owner 检查。替代原 V4-5：独立制品仅新公开面可导入、旧导出解析失败；旧 profile/snapshot shape 经新真实接收入口明确拒绝；不产生默认字段或落盘修改。
5. 本包及表中当前消费者的 typecheck/build、公开示例、Schema 注册解析全部通过；新建 demo 数据目录的多轮请求贯通。旧数据拒绝场景前后逐字节比对，证明没有为迁移修改用户数据。

## 取舍与剩余责任

| 采用方向 | 被替代方案最强理由 | 当前代价与置信度 |
| --- | --- | --- |
| 仅提供本纵线当前格式 | 精确旧端口可继续读/结算开发期记录 | 用户已明确选择破坏性重构；旧开发记录将不能由当前运行面使用，必须明确拒绝。实施简单，消费迁移须同步；高 |

本节点仍无 Cordis 服务、存储、配置默认值或装卸资源。新增 binding 为 0。尚缺主线采用和上述实际实现证据；消费者迁移由表中 owner 承担，core 纯值测试不证明整个调用闭环。本稿不声称节点已接受或已验证。
