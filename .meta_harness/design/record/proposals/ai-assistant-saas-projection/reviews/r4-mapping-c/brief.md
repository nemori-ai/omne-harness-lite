你以architecture-reviewer身份，使用Claude Fable独立只读评审逐feature投影。目标是完整外部个人AI助理SaaS，不实现，不重开已承诺harness可实现性；1万种子用户不搞吞吐过度架构，关注持久化/一致性。
本次分片M13–M18，请逐一通读本组所有feature，不以模块抽样替代。
正文：.meta_harness/design/record/proposals/ai-assistant-saas-projection/features/m13-m18.md
精确JSON：同包data/feature-projections.json（很大，只定点读需要条目）；所有具体框架条款/路径在framework_refs。
输入：.meta_harness/research/ai-assistant-saas-projection/source-inventory-v2.md、framework-baseline.md、framework-capabilities.json定点来源；必要时原稿sources/product-definition.source.txt、stories.source.txt。
共同执行规则：提案包execution-topology.md，data/work-plan.json和journey-acceptance.md。外围正文正在R3修订，不要把你读到的中间态当本组分片的依据。
审查每条：原文有没有漏子句；非建议/建议状态有没有提升或降级；FC承担的确是来源承诺还是误将占位/旧accepted/尚未实现冒充完成；产品自建与外围责任是否明确；动作链能到可观察结果而不只是贴FC标签；权威提交/失败/恢复/授权/外部副作用是否成立；验收是否feature特有；功能依赖/PWP/SWP/EP定位是否齐，故事细化是否吞掉。
共用规则尤其：PF012外部效果权威Run日志+(会话,Run,第几步)稳定键，adapter只观察；data.messages/v3 S18 source闭集，外部事件采用真实Schedule Job建新会话+工具读取产品待处理意图（事件原来源保留），或有原callId/backgrounded占位的真实后台完成，不新增system/user/extension伪来源；正常用户新发送不去重；控制库恢复fresh epoch且丢失授权时旧平台资格可疑；PF016离线会话不被SaaS租约杀死；OpenRouter统一路由且不外传受限原文；Connector搁置/Engram占位。
若缺口是明确留待接口/产品建设且路径已给，不因本次没有实施就造阻断。对S13本地确定性工具可完成的受限任务路径，不能擅自扩成‘任意需要外传原文的任务也保证成功’再判不满足。
输出中文：可合并/需修订；稳定R4-Cxx发现（严重度、feature id、出处、具体因果、最小修订）；明确列本组已逐条审到的ID范围与不能核实内容。架构review不是接受，不写文件/不spawn代理。