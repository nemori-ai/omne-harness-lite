# D-046 · 本地记录 / 治理组合分责与CLS1

2026-09-25，主线依据用户治理CLI/TUI完整交付授权作技术采用。采用CLI-TUI §10的B边界：本地记录能力独立拥有完整记录/CAS/耐久/未知恢复，组合拥有整次使用身份与网络/本地结算；A内部适配和C共享协调器仍是可行落选方案，B代价是多一份契约与副本/选择共同CAS竞争。

接受capability.client-local-state/v1 S1～8及登记规范资源；采用[同名提供者](../../../realization/packages/frontend/client-local-state/README.md)的SQLite FULL、私有目录/完整行、真实排空路径。spec-reviewer复核contract hash29b505871829be8ad09a7a7309bc2c7cdc9487d169510fa332eb4079d02bcd61无表达阻断；节点architecture-reviewer最终design hash5d6d444686d7cbf0a4a94e9b8d3c9e696f80f26dd2199275a696618b7237798d无局部架构阻断。规范发布仅改候选状态提示，语义未再修改。

四项表达修订已复核：关闭/非签发凭证/真实旧快照冲突分开；operationId唯一性由调用者承担；未确认重读原/空/新实例均保持原未知；已绑定不允许完整清空绕过换中心。整次TUI固定登录及全部适用治理读面缓存仍归后续组合，不因本地实现简单裁掉。

有限模型437distinct、三负控按预期反例，证据见[实际运行](../../evidence/2026-09-25-formal-client-local-state/README.md)。它不证明SQL/fsync/权限/operationId查证。SQLite打开失败未登记句柄关闭及失败读者名额修复已执行41项局部验证；该依赖是节点采用前提，不外推新提供者已验证。

实施须落实调用者可信父路径、本节点最后一级目录与父/私有目录同步、每个打开者自己完成就绪确认；不能凭别的进程已提交元记录假设目录耐久。installed前真提交及适用目录同步，后者失败unconfirmed；StorageDefect与未声明异常不吞成正常未知。节点要求的双平台、多进程、初始化竞争、未知提交和关闭故障均须取证。

不接受尚未起草的共享用例/命令输出/TUI，不开放正式生产CLI，不接受跨物理机灾备。原冻结规范不改，CLS1作为新坐标登记；本期一个目录一中心，没有新增多中心管理或账号领域权力。
