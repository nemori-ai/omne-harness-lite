# 防御指导的身份与复核记录

这里维护防御指导的稳定编号、适用范围和复核记录；当前指导正文在
[docs/defensive-patterns.md](../defensive-patterns.md)，系统保证仍由所属契约负责。
目录职责按[知识准入](../maintenance/organization.md#持久化知识的准入)划定。

## 准入与转出

需要稳定引用某条指导、解释其适用性或保存复核/退出依据时，在
[目录记录](catalog.md)及其关联材料中维护。证据应针对具体指导和适用范围，
不能只凭一次没有出错就认定提醒可以移除。

新事实研究按 research 准入；未整理经验和一般调试日志归 tmp；开发模型的对照
实验归 evaluation；产品不变量变化回到规格及其决定，不由提醒的保留/退出代选。

## 按任务进入

调整指导或复核时读[防御演化](../../.meta_harness/agents/evaluation/developer-model/README.md)，涉及开发
主力模型再读[评估入口](../../.meta_harness/agents/evaluation/developer-model/README.md)。指导正文与身份记录分别维护，
不复制一套要求。

仅修复记录引用时按当前对象检查，不因接触防御材料启动无关模型评估。
