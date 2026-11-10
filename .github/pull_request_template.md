<!-- 规则：../CONTRIBUTING.md 的「提交与 PR 表达」。开 PR 与 gate 的步骤见 omne-card 技能「进轨道」。填写后删除提示和不适用块，实质缺口须保留。 -->

## 改变

<!-- 具体问题与最终效果，必要的范围与消费者。卡与它的完成范围；不用 Closes，接受由负责人在卡上记录。 -->

## 验证

<!-- 实际执行、未执行、失败与未覆盖分别写清。改产品源码时附结构读数、差分变异与覆盖率；按 CONTRIBUTING.md 的报告义务填写。报告先写结论、范围与限制，长明细折叠。 -->

## 审阅重点

<!-- 具体路径、符号或条款，加上要核对的问题；有 demo 时写版本、准备与操作→预期。短改动可写一句。 -->

## 所含的卡

<!-- 个人分支进 integration/mainline 的 PR 只列本卡一行。mainline 提升 main 的 PR 列出自上一次提升以来合入 mainline 的全部卡。行格式见 github-gate 分支 gate/README.md 的「提升 PR 的说明」。进入 stable 的 PR 删去本节。 -->

## 契约变化

<!-- 每个改动过的契约成员一行：- <docs/engineering/delivery-lines.json 中的成员路径>：none、additive 或 breaking。additive 写新增的导出或字段，breaking 写承接它的卡。没有改动契约成员时只写一行「无」。进入 stable 的 PR 删去本节。 -->

<!-- 本地运行的检查及结果写在验证一节。发布由 gate-publish 流程在确认后完成，确认不等于交付接受。规则见 docs/engineering/integration.md 的「现行准入」。 -->
