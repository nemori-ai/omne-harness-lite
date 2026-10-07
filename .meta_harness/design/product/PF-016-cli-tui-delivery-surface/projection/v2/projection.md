# PF016 rev7 · 治理客户端及交互输入投影

2026-09-25，D048节点独立审查闭合后固化；本版覆盖CG2/CLS1/D045的共享客户端，取代v1仅health范围的实施导航，不改变冻结v1。来源hash与可变项见[provenance](../../design.md)。不覆盖尚待采用的CQ1/TUI装配。

输入为已确认的PF016 rev7治理CLI/TUI范围、PF001 rev18登录规则、PF017 rev4单机交付。领域对象仍为账号、组织、租户、治理中心、登录态与其公开句柄；交互参与面不新增持久领域身份。

采用CG2 S1～16、CLS1 S1～8及D045 EC2/HT2消费者。原有Input从CG1冻结表示引用。固定捕获中心/登录/账号与expectedTenant；跨租户授权归中心，客户端不凭预览放行。进入动作不假扮原登录账号；unknown账号只有原P的OG36可补足。

操作路径：configure捕获本地/安全配置→预览→health→原CAS绑定；health捕获→预览→health无写；register/login先health→预览/秘密→目标，只有login保存新P/句柄；invoke/logout捕获原使用→适用副本或health/必要OG36→预览→目标→一次原CAS。完整Input调用保留CG2 S1～15次序。缺席配置、登录、身份或输入时不得猜默认值，按契约明确阻断；先前准备访问或本地未知不抹去。

取消不等于完成，迟到continue不能发送目标或交付副本。远端效果不随本地CAS失败撤销；unknown查证一次、不重试写。已知失权先阻止副本，即使保存失败也不复活。观察时间只标读数时刻。进展以前置网络、回调和存储最终结束为前提；无此条件不能声称close完成。

实现仍是既有governance-client-operations插件/服务，借用clientLocalState，消费无状态协议客户端；没有新Context/事件/持久准备句柄。每动作登记整个实际Promise，根/use关闭先停止准入并取消输入，再等网络、结算、查证实际结束；装配必须先close CG再撤CLS，Cordis不提供该顺序。跨进程只靠完整捕获与CLS CAS，不靠本进程锁。

节点绑定与运行证据见[提供者](../../../../realization/packages/frontend/governance-client-operations/README.md)。实施顺序及判据：先保留两份精确Schema并完成安全Preview验证；再接入固定动作与取消/一次CAS；最后旧106回归、新33场景、两平台编译真实组合与规则检查。本增量已按该顺序完成；下一步CQ1终端恢复/输入协议和应用装配仍有显式gap，不能从此投影推导已能安装CLI。
