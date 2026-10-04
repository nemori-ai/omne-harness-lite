# scrypt 凭据提供者

公共凭据形状及四方法承诺归[身份定义](../../core/account-identity/SPEC.md)。
本包拥有 password-scrypt 算法、参数、PHC 编码、密码政策校验及 createPasswordCredentials。
根工厂可独立调用且不加载 Cordis；配置在接收任务前校验。

原 parse、checkPolicy、derive、verify 的拒绝和值保持。未知方案为 mismatch，
无法计算为 unavailable；缺政策或政策形状不符不能退化为放行。
材料只含方案、参数、盐和哈希，不含凭据明文。比对按材料参数，换配置不改旧材料含义。

`./cordis` 的 Credentials 实现委托同一纯算法。已启动 scrypt 不可假取消；
原调用持有真实结果，撤除须等待已启动任务结束。独立绑定仍要求先排空消费者。
管理装配必须保留旧实现到完整身份调用结束，不得把服务发现消失当作资源完成。

验证保持原 AI3 S-8/S-26 义务、参数边界及固定编码对照。
随机编码偶含短子串不是明文泄漏；消除该错误判据时必须保留真实明文泄漏负控。
IR-CC-1 未因本页或包改名而关闭。来源及接受范围见
[迁移行为](../../../.meta_harness/design/architecture/identity-integration/behavior.md)。
