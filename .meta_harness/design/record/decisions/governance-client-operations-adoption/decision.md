# D-047 · 治理客户端用例与安全公开结果

2026-09-25，主线依据用户治理CLI/TUI全链路授权作技术采用。延续D046 B边界，接受composition.governance-client-operations/v1 S1～15及规范资源，采用[同名提供者](../../../realization/packages/frontend/governance-client-operations/README.md)的固定使用/完整动作、借用CLS、D045协议消费及安全DTO路径。产品范围仍为单机治理；不包含Agent会话或灾备接受。

依据[CLI-TUI§11](../../proposals/cli-tui/governance-client.md#11-2026-09-25-共享治理用例组合接续)与独立评审：架构边界保留，不新立账号/组织/租户或授权机制；节点最终设计hash05752cb3c394205632196c727781e8f0ce62e07266d9420ef26798281f39670b无局部阻断。其后CG1表达修正明确真实EC2 notAuthorized路径、完整非秘密查询、独立缺陷及remote封闭映射，不改变节点机制。

spec-reviewer最终正文hash34fa8dd3c4bc1873b07235ec31461f0604feebe0f7b44ea9c1c305541724cd9a确认两项末次修订已闭合：health除固定version-mismatch外仅收PublicHealthReply，不把其他字符串当捕获登录已拒绝；OG36裸unavailable独立映射，不与health异常混淆。前轮同时闭合查证缺陷不得覆盖CAS unconfirmed、AR interrupted归unknown、查询来源/秘密过滤和明确的资格副本失效。

行为有限模型920 distinct、四负控及最终77个Schema场景通过，证据见[候选运行](../../evidence/2026-09-25-formal-client-operations/README.md)。模型不覆盖缓存权限、秘密或真实应用关闭，不冒充整个系统证明。发布只改规范状态提示，语义不再改动。

采用保留的限制：同一使用固定中心及登录；一次动作至多一次本地替换，CAS冲突/未知不重交；fresh成功不能复活旧盘副本，只有installed具体新条目可例外，后续失效再次撤销；客户端观察时间不作授权时钟；D045的跨连接中心稳定前提没有被预查消除。宿主必须先静止整个组合、再撤CLS，不能依赖Cordis并发effect自动排序。

源码须按[提供者验证义务](../../../realization/packages/frontend/governance-client-operations/verification.md)C1～7取证后再声明实现。plan-reviewer已独立核可执行性、无阻断；一次性执行顺序归任务区，C1～7长期义务归节点。若发现前提冲突，暂停依赖施工，不能以本语义接受代替实施验收。应用CLI/TUI输入与装配、安装分发、升级/备份恢复另接续；此决定不批准缺省跳过用户全链路目标。

2026-09-25证据索引补充：采用后的77例原始输出和最终冻结输入已归[后续运行](../../evidence/2026-09-25-formal-client-operations-2/README.md)；前次链接只拥有72例候选快照。后续运行逐字节对照五组r2模型/cfg与冻结输入相同，没有假称重新执行模型。
