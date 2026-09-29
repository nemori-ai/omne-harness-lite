# MR9 验证义务（candidate）

## 变化的影响

2026-09-29：在已接受 MR8 上追加 S-41～S-45；持久/待提交值共用 required inputCalibration。原 S-1～S-40 义务继承，不修改前驱冻结文件。消费 CA2 v2 S-6/S-7 的互斥输入口径，原 MP5/MS6/LC6 数据依赖不变。跨域状态由 RT10 拥有，MR 不反向登记 RT 依赖。

## 必需证据

| 性质 | 证据 | 当前实施状态 |
|---|---|---|
| 必填判别联合、known 分支与 CA2 条件、未知不零 | examples.json 的完整正反例，Draft202012Validator；类型/成员形状与关系拒绝分开 | 规格实例可执行；产品符合性未开始 |
| basis/route、projectionRevision 相等；known total 不小于分项和；provenance 原事实一致 | Schema 后纯关系校验的正反例 | 产品符合性未开始 |
| output group 顺序/数量/摘要、reply.response 关系 | 固定 provider 投影原件的同次输出对照，换序/漏块/partial/hidden 输出负例 | 真实适配证据未开始 |
| 上游 actual total 与模型输入范围吻合 | 真实 OpenRouter 固定 model/provider/参数观察；response-cache 与 prefix-cache 区分 | 本批未运行网络 |
| required 当前格式、旧数据不回填 | 缺字段拒绝与耐久 unreadable 不伪成功，原 responsibility 保留 | 产品符合性未开始 |
| 原批/append-only/unknown/recovery | RT10 formal/UsageCalibration.tla 与真实 SL3 故障注入 | 有限规格模型由 RT10 承担；本包不声称真实存储通过 |

examples.json 的 schemaValid/relationsValid 只描述可在单值上判的部分；摘要原件和真实上游来源不能靠示例中一个合法 hex 串证明。examples.md 继承前驱收场示例并显式添加 unavailable，不是兼容迁移算法。PendingModelResponse 同 required 条件另需完整有回复 fixture。保持 CA2/MR/MS 共享形状的原对齐义务，不复制这些数据定义。

## 工具与范围

Schema 工具需 JSON Schema draft 2020-12 与精确本地 $id 资源注册，禁止网络“最新版”解析。结果、源哈希、执行命令由本批版本外 evidence 保存；登记不是已运行，自检不是独立评审。无独立状态不造空形式任务或 Alloy 模型。

## 已知缺口

G-16（适配/计量提供者）：真实 projection/φ/observation 对应证据；G-17（产品/上下文主线）：compaction 硬 fit 与估算关系。继承缺口按 contract 保留。

## 报给主线

本候选没有自我接受。需独立 spec review、realization 映射、codec/适配/写入者实施和验收。术语只用既有词条，新增代码表示名无独立词条且不提升为领域对象。
