<!-- 规则：../CONTRIBUTING.md 的“提交与 PR 表达”。按主要结果选择 PULL_REQUEST_TEMPLATE/ 下 feature、docs、fix、refactor 模板；perf 复用 refactor。此入口适合小改动和其他类型。 -->
<!-- 先阅读执行仓库 CONTRIBUTING.md；需要组织正文时沿 docs/engineering/publication.md 加载对应 pstack 方法。填写后删除提示和不适用块。 -->

## 改变

<!-- 具体问题与最终效果，必要范围/消费者。实际关联的卡及完成范围；仅真正关闭的 Issue 才用 Closes。 -->

## 验证

<!-- 实际执行/未执行/失败/未覆盖分别写清。产品源码须附适用结构与复杂度、差分变异、覆盖率；profiling 按规则触发，不能因用了本入口而遗漏。 -->
<!-- 报告先结论/范围/限制，再入口。原样结构摘要与逐条红项可折叠，重大缺口外显；没有中间快照不造引入后解决数量。 -->

## 审阅重点

<!-- 具体路径/符号/条款＋要核对的问题；有 demo 给版本、准备、操作→预期，无可体验入口时说明。短改动可合并成一段。 -->

## 所含的卡

<!-- 个人分支进轨道的 PR 与提升 PR 每行一张卡：- #<Issue 编号> revision <交付修订> attempt `<attempt>`：<这张卡在上一层或 main 上要满足的条件，没有写“无”>。提升 PR 汇总自上一次提升以来进入来源轨道的全部卡。同步 PR 与进入 stable 的 PR 删去本节。 -->

## 契约变化

<!-- 每个改动过的契约成员一行：- <契约成员在线归属表中的路径>：none、additive 或 breaking。additive 写新增的导出或字段，breaking 写承接它的卡。没有改动契约成员时写“无”。契约成员见 docs/engineering/delivery-lines.json。同步 PR 与进入 stable 的 PR 删去本节。 -->

<!-- 本地运行的检查及结果写在验证或核对一节。发布由 gate-publish 流程在确认后完成，确认不等于交付接受。技术运输不自动生成 Closes。规则见 docs/engineering/integration.md 的“现行准入”与“进轨道 PR 的说明”。 -->
