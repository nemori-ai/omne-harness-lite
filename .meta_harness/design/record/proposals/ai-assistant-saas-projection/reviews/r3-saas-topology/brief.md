请以architecture-reviewer独立只读评审外部AI助理SaaS候选投影。指定Claude Fable。不要实现、写文件或接受任何方案。
用户边界：本次是从真实产品165功能/23故事下投到已经承诺框架和外围工程，不重开harness设计可实现性。1万种子用户，主要并发压力在大模型，不搞常规高吞吐过度设计；持久化与分布式一致性必须细。

审阅对象（cwd=/Users/pandazki/orca/workspaces/omne-harness-lite/flyingfish）：
- tmp/ai-assistant-projection-20260930/saas/saas-design.md
- tmp/ai-assistant-projection-20260930/saas/alternatives.md
- tmp/ai-assistant-projection-20260930/saas/component-index.json
- tmp/ai-assistant-projection-20260930/saas/sources.json
- tmp/ai-assistant-projection-20260930/execution-topology.md
参考：framework/baseline.md与必要原始PF、用户产品需求两份md。

重点具体走查：
1 三种外围候选是否实质不同、推荐是否适合小团队；SP是责任不是强制微服务，不引入多活或万实例。
2 OIDC subject->框架person/member/tenant->设备/工作负载->委派动作->OAuth是否存在双权威、越权、凭据泄漏、共享BYOK密钥串户或自动收费fallback。
3 12条执行链提交点/接收/外部结果不明/重复处理；不可用时默认拒新效果但不抹掉既有事实；outbox不等于外部效果exactly once。
4 cell单写、迁移围栏、节点离线、恢复旧备份、撤权/删除/计费等不可随数据库回滚的现实。PF016 rev10 §5.6/6.17已有离线会话可继续且无离线时长上限，SaaS效果入口现查不能变成每次harness工具查治理中心/租约杀会话。
5 M05受限资料不外传包括OpenRouter请求、工具stdout、trace和结果，不偷用本地模型绕过统一路由。节点没有读权就不因接入获得全盘访问。
6 本地未发送草稿不上传；交互成果的隔离、app数据备份/分享撤回；用户退出登录与停止后台工作不同；删除不得直接擦framework不可擦历史。
7 遥测、审计、SLO、备份、升级、供应链、运营、账本、支持范围是否遗漏重要SaaS责任；数值/法规/云地域/价格待定不能变承诺。
8 架构可行性按框架承诺为前提，标未实现责任/具体接缝不等于挑战或让用户重答已决定问题。当前无运行实验，不要求本报告先上线来证明，但报告不得伪称验证。

输出中文markdown，四组发现：性质/正确性、边界与反向核对、成本/替代方案、表达引用影响判断的明确问题。每条用R3-Axx编号、严重性、具体路径/位置及因果、最小修订。最后列覆盖/未读范围以及可合并还是需返工。不能凭模板不齐或风格偏好造阻断。对单一推荐给实质反论点。
