# W2 model-profile 交付

采用坐标：`omne-harness-lite-design-2026-09-15 · data.model-profile · v1`，
规格与节点采用由 D-041／D-042／D-045 和 registry 确认。执行树为
`/data/qiwei/repos/omne-harness-lite/.worktrees/core-delivery-model-profile`，
分支 `panqiwei/core-delivery-model-profile`，初始 HEAD `47c4990af0cb404054574daf9962164705fc5697`。

写范围只有 `packages/core/model-profile/**` 和本树 `tmp/w2-model-profile/`。
源码、Schema、包入口、测试及开发 README 已完成；共享 catalog／锁与设计回填由 root 负责。
content-blocks 44b84525 是当前初始 HEAD 的祖先；实际消费当前树构建出的公开 dist 与 ./schema。

公开入口：

```ts
judgeModelProfileDocument(kind: ModelProfileDocumentKind, value: unknown): ModelProfileJudgment
parameterNames(params: ModelRequestParameters): readonly string[]
refMatches(ref: Extract<ModelProfileRef, { origin: 'official' }>, profile: ModelProfile): boolean
refMatches(ref: Extract<ModelProfileRef, { origin: 'custom' }>, profile: ModelProfile, scope: ScopeLayerIdentity): boolean
refMatches(ref: ModelProfileRef, profile: ModelProfile, scope: ScopeLayerIdentity | undefined): boolean
validate(defName: SchemaDefName, value: unknown): { readonly valid: boolean }
```

`ModelProfileDocumentKind` 恰四种已接受文档，`ModelProfileJudgment` 是 `{readonly ok:true}`
或 `{readonly rejected:ModelProfileRejection}`。快照只导出类型与 Schema，不能传给 judge。
档案本身按 S-1 不带 scope，目录交出的 scope 是 custom 引用匹配的必需输入；
联合引用调用必须显式给 `scope | undefined`，缺 scope 的 runtime 情形返回 false，不默认到环境。
root 已在交接中采用该公开参数投影，需在节点设计回填三条重载与此 owner 来源。

所有参数数值、token 上限、图像字节上限用 content-blocks `JsonNumber`；
先核对原数字字面量的整数性、值域及大小关系，再投影给固定 Ajv 2020-12 Schema。
不把巨大合法数强转成有限 Number，也不把 LosslessNumber 当 JSON 对象。
`Modality` 的 type 和 Schema 都取 content-blocks；时间点使用原样 RFC3339 交换字符串。

最终检查：build、typecheck、test、独立 dist 消费者类型检查（skipLibCheck=false）与实际运行、
本包共享格式检查、24 条静态规则全返回 0。185 测试通过，零失败、零跳过，
包含 155 条冻结实例、两个文档种类各一正一反跨字段上限、5 个规范次序例，
身份范围反例、类型负例、巨大整数/长小数/巨大指数，以及固定 seed 20260926 的 64 个 BigInt oracle 案例。
原始 stdout、Vitest JSON、源码/配置/采用输入/依赖产物 SHA256 见 `results.json`。
Schema hash `4b3b1cb0cf76093d7c1d47be7d2f491cdfe44d2feb5a04c28af6483e6c4f8b24` 与冻结资源逐字节相同。

`baseline.log` 的 make check 虽退出 0，但启动后本包文件在同树创建，不能称作固定纯基线验收。
它包含阶段外既有包共 34 个 skip：storage-sql 4、credential-verification 2、account-identity 10、
organization-governance 4、account-registration 1、governance-center-entry 2、tenancy-host 11。
这些不在本包测试结果里；本包是 0 skip。本任务未做真正模型调用、目录写入或存储操作。

节点条款与阶段外 owner／闭合条件逐项见 `coverage.json`。目录承担唯一性、在册转移、
时间戳更新、三种读取收场；模型请求 runtime 承担原样快照复制、发出参数与留痕。
本包无状态、无提交点、无资源生命周期，函数只作本地判定和匹配。

root 接收源码与 ignored 证据目录后独立集成验收。worktree 保留供 root 读取、复验；
只有 root 已将整个 `tmp/w2-model-profile/` 保存到树外并校验 hash，且无活跃消费者时才可退休。
本交付不是独立评审或用户最终接受。
