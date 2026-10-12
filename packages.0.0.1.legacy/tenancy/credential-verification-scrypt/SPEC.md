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

managedCredentialsPlugin 的纯 describeAssembly 声明提供 credentials，无业务依赖，
投影已校验的完整参数及缺省值为 tenancy-host/credentials v1。声明沿[插件树协议](../../core/cordis-plugin-tree/SPEC.md)。
算法参数仍由本包 Config 校验；声明不能替代凭据行为验收。

验证保持原 AI3 S-8/S-26 义务、参数边界及固定编码对照。
随机编码偶含短子串不是明文泄漏；消除该错误判据时必须保留真实明文泄漏负控。
IR-CC-1不因本页或包改名关闭；仍须保留原秘密保护及真实明文泄漏负控，验证责任沿[身份验证入口](../../core/account-identity/verification/README.md)。

## 绑定入口与生命周期坐标

`@omne-harness-lite/credential-verification-scrypt/cordis`导出`credentialsPlugin`和`managedCredentialsPlugin`，限定name分别为`credential-verification-scrypt`和`credential-verification-scrypt-managed`。两者使用同一纯实现和配置Schema；管理版声明`assemblyLifecycle: 1`并必需注入`assemblyLifetime`，先登记后开始资源效果，缺端口不回退独立模式。独立版由调用方先排空消费者再撤依赖，管理版由[装配生命周期](../../core/assembly-lifecycle/SPEC.md)安排真实逆序收场。
