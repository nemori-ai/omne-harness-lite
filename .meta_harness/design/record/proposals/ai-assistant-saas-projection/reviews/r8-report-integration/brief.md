只读独立Claude Fable review。用户最新纠正：不要单独补篇，不要呈现研究和review中间过程；有价值的内容直接合进原文，始终站在“产品需求→omne harness lite承接→外围实施与验收”的报告视角。已有文献/Plexus调查及三轮review均完成，不重新展开论文研究，不重做既有框架。

本轮对象：.meta_harness/design/record/proposals/ai-assistant-saas-projection/ 下README、CURRENT、design、execution-topology、peripheral-design、journey-acceptance、delivery-plan及两份JSON。输入index在本轮tmp/reviews/integrated-report/inputs。原报告23文件修改前快照在topic reviews/before-report-integration/inputs。report.html是10章生成阅读版，已从阅读路径移除评审往返、文献比较、单独补篇与issue筛选；内部研究/历史证据保留不删。

先zoom out：目标是让需求投影报告更完整清楚，不是证明新研究有价值或强塞其术语。重点仅核这次合入：
- design§3.1产品长期工作责任，§8简化依据；
- peripheral§4.5 Plexus/个人版复用资产、Python/TS、候选接口、上游内存结果/unknown、原Session终态不是通用事件订阅；
- EP04受限调查可选组合、EP11来源归属的产品策略和框架边界、EP12绑定代际；
- S02/04/22/23连续异常验收，JSON与正文一致；
- delivery已有包承接且明确验证/移植并非零成本，DAG和估算未重算，work-plan revision5。

需特别保护：PF010摘要内容明确归策略，不把关键指令归属升为框架已接受不变量；after_compaction stop只终止当前Run，摘要仍在；已授admission token冻结与新资源侧准入分开；Plexus接口仍candidate不是lite已接受、其续原Session经验不能覆盖lite的存活callId条件。三者此前原文已核，若疑问可读research/always-on-agents-plexus/notes/root-recheck.md，别从旧supplement初稿推本轮结论。

只判断本轮是否让报告偏离需求视角、引入新未授权政策/假保证、遗漏重要语义或人机材料漂移；如无真实问题不要扩大范围。输出中文简短：结论、需要修正的精确位置及原因、实际核查边界。不能编辑/实现/接受/外部发消息，不把评审当运行测试。
