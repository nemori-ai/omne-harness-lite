核查完成，正在整理结论。

**结论**：本轮合入没有让报告偏离「需求→lite 承接→外围实施与验收」视角，也没有引入新的未授权政策或假保证。四项受保护语义全部成立：PF-010 摘要内容归策略、不升为框架不变量（EP-11、S02、共同取证规则）；after_compaction stop 只结束当前 Run、摘要仍在（EP-11）；已授框架 token 冻结语义与资源侧新准入分开（S22、取证规则）；Plexus/个人版接口仍为候选、续原 Session 经验不覆盖 lite 的存活 callId 条件（peripheral §4.5 第 4 行、EP-12、取证规则）。design §3.1 与 §8、EP-04 可选调查角色、EP-12 代际语句、delivery「已有资产」段与 work-plan revision 5、估算与节点数未重算，均与正文一致。发现两处需要修正，一处可选。

**需要修正**

1. **S22/S23 的「必须注入的异常」是替换而非合并，丢了原注入项。** journey-acceptance.md:413 与 data/journey-acceptance.json:4191 文本一致，所以人机材料没有漂移，但对照快照，S22 原有的「进程重启、恢复旧快照、不补造漏跑记录」从故事级注入消失，其中「不补造漏跑记录」现在整份正文都找不到。S23（md:432 / json:4394）原有的「丢旧设备、重装、停费、关闭账号」注入和「动作后果分开」判据也被替换掉，X26/X27 只覆盖其中一部分。S04（md:75 / json:615）丢了「用户纠正后不重复同一低价值动作」，X05 部分覆盖，较轻。建议三处改为新旧并集，md 与 JSON 同步。

2. **peripheral-design.md:202「调用委派不等于BOT工作委派」用了未定义术语。** BOT 是 omne-next/Plexus 的词，本报告与 lite 统一语言里没有词条，全报告仅此一处，来源是旧补篇 analysis.md。读者无法理解，应改为报告既有说法，如「框架内助理/agent 的工作委派」，report.html:7787 同步。

**可选**

- design.md:151 把研究内部笔记 root-recheck.md 当作「资源接入事实」入口。该笔记一半内容是论文与 issue 核对，research topic 的正式入口是 always-on-agents-plexus/README.md 或 evidence.md。不阻塞，但更符合「topic 是信息包」的约定。

**实际核查边界**

- 本工作树不存在 tmp/reviews/integrated-report/inputs，基线改用 topic 下 reviews/before-report-integration/inputs 快照逐段比对。
- 读了全部 7 份正文和两份 JSON 的相关字段（JSON 只核 S01–S04 全文及全部 fault_scenario 行，S05–S21 正文行未逐条读）。report.html 只用标题 grep 确认新段落已同步，未通读。
- Plexus/个人版的提交号、版本、60 分钟默认、内存 run、撤销语义等事实以 root-recheck.md 和 evidence.md 为准，未重新读源码。
- 未运行 verify 脚本，未核对 final-artifacts.json 的字节摘要是否对应当前文件；verification.json 计数与正文一致是靠阅读比对，不是重新机械检查。