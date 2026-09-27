# AR2 提供者增量 · 候选

输入AR2候选、D040 AI3、D042 OG2、IV1及原节点design。注册仍是无持久链状态的薄Cordis插件；沿原registration服务、三个必需依赖及签名配置，不新增业务能力。未采用/未实施。

## 交接与信任绑定

只用AI普通produce/activate/purge、OG普通createPersonal和独立organization-purge，不调用参与面，不合并三步事务。原activation私钥仍仅交注册组合，匹配公钥仍只在AI核验；用途activation、绑定AccountId与②确认成功后签发规则不变。清除依据仍由OG签发、AI核验，本组合逐字携带。内部expired-record只由本组合消费，不扩展到远端。改用AI3/OG2不是引入新的凭证产出方。

提交未知沿原storage-unavailable/unavailable映射为interrupted或transient；不得签发没有确认成功的②所需依据。真实提交后的回执未知可留下完整记录，重试依原标识/AccountId幂等读取当前状态。返回identifier-taken不意味着此前清除没有发生。

## 生命周期

保留装配时依赖快照、代标志和每步前检查；不按调用动态解析新服务。插件为每个接纳的register/purgeExpired跟踪完整Promise，成功/失败都从集合移除；拒绝从接纳时即被观察，但调用者仍接收原结果/异常。撤除的同一个effect先置本代失活，再等待已接纳工作真实结束；不只发取消，不声称运行时会按依赖顺序等待。

已交给AI/OG的普通步骤由它们完成或回滚，回来后旧代际不再开始下一步。最终步骤完成后若代际已撤除，注册回执按AR2 S22给interrupted；已提交激活不撤销。清除链同理以RegistrationStopped结束旧调用，不制造无效果断言。

entry持有从接收请求开始的完整注册Promise；host有序关闭入口准入并等业务静止后才释放clock/storage。可信直接调用方/清扫触发者也必须停止新调用并等待其完整Promise，entry的集合不能代替这些拥有者。本期无自动清扫。单个Cordis disposer等待不构成其兄弟资源不会提前关闭的证明；整装另行验证。

## 实施与证据门槛

旧无孤儿/不误激活/幂等重试断言保持；更强OG内部边界可排除旧快照窗口，但不放宽性质。分别在每步提交前、提交后丢回执和步骤间卸载注入；被暂停步骤未结束前卸载不得报告业务静止，释放后不开始下一步；快换代不能让旧引用复活。两个签发/核验关系仍用真实密钥、SQLite跨包演练。模型复用仅覆盖原有限状态，不声称证明Promise排空或真实提交未知。
