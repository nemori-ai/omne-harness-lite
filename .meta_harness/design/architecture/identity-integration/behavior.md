# 类型之外的承诺及薄规格归属

本页规定本批必须迁移的行为、最终唯一拥有者和切换条件。
所有真实装配的排空与资源保留按 [有序收尾](retirement.md) 实现，局部 close 不代替协调器。
业务仍由精确旧条款约束。下列条目补足集成承诺，不把摘要当作旧契约的完整替代。
实现时对应模块 SPEC 明确“已迁集成范围”和“继续有效的精确业务源”。
完整业务/Schema/形式资源逐条接续另按 N5/N6，不在 D0 提前删除。

## 账号、凭据与注册

`core/account-identity/SPEC.md` 拥有以下跨提供者承诺：

- Accounts/Logins 共用账号身份、凭据代际和有效性次序。prepareCredentialChange 的票据只供签发实例使用，
  一次 commit 尝试即消费，包括失败尝试；更换提供者不能让旧票据有效。
- 必需 storage/clock，credentials 仅在原凭据步骤按次解析。捕获到一个 credentials 实例后，
  同一次验证/派生不得中途换成新实例。缺席与凭据不匹配必须保持原区别。
- 参与面只操作调用方给出的 StorageUnit。unit 身份不一致、已污染或已结束按原规则拒绝。
  临时成功不能提前发通知。对存储异常的业务失败映射只在正确的事务边界外执行。
- account.read 允许按原条款记录单调过期事实；不得当成无写入纯读进行错误的隔离优化。
- 凭据代际变更不能凭空产生逐登录 revoke 通知。finalizeActivity 的最终时钟失败仍使原共同事务回滚。
- Service 撤除移除发现入口。已准入工作仍由原提供者/调用者拥有，等待实际完成再释放其依赖。
  停止前交出的参与对象不获得新代际身份；继续使用仍受原 unit 寿命与账号有效性限制。

`account-identity-sql/SPEC.md` 只写 SQLite/事务参与投影、实例寿命和公开工厂责任。
新增纯工厂 `createAccountIdentity(config, dependencies)` 返回 accounts、logins 和幂等 close。
dependencies 沿原 ServiceDeps 的 storage/clock/resolveCredentials/notifier/diagnostics/random，
公钥与 policy 由 config 校验后交入。同一引擎供独立调用与 Service 包装。
close 停止新普通调用，等待已准入完整 Promise；不能只等待 SQL 片段而漏掉外部 scrypt。
close 不关闭借入的 storage/clock/credentials，销毁本实例的准备票据。
停止期间新调用的异常不伪装成已提交业务失败，使用具名 `AccountIdentityStopped` 使用错误。
该错误只描述显式已关闭实例，与存储暂不可用和正常失败集合区分。

`credential-verification-scrypt/SPEC.md` 保持原 parse/policy/derive/verify、PHC 参数和不可用结果。
新增纯工厂导出原 createPasswordCredentials，限定算法及配置留此成员。
配置校验仍在接收任务前完成。Service 撤除不宣称已启动 scrypt 取消，等待已启动任务完成后才完成撤除。
IR-CC-1 的测试调整只消除随机编码偶含短子串的错误判据；原秘密不得出现在记录/诊断的保证保持。

`core/account-registration/SPEC.md` 的集成承诺：

- 原 AR2 主链是三次独立提交。登记/签名/激活的顺序、四种终结值、清除失败三分类保持。
- 每一代捕获 accounts、organizations、organizationPurge；停止后不进入下一步。
  已交出步骤等待真实完成，保留返回或未知结果，不能伪造回滚或补偿。
- 注册中断返回 interrupted；清除链的撤除仍以原 RegistrationStopped 拒绝。
  不把该拒绝加入正常结果联合。
- 纯工厂拥有代际与在途集合，公开 close 停准入并排空。Cordis binding 与独立用户调用同一关闭过程。
  借入依赖由装配在 close 完成之后释放。没有后台清扫调度器新增。
- 纯工厂保留显式 isActive 依赖，与自身关闭位共同检查。managed binding 加入 lifetime.isCurrent
  和原 fiber/绑定资格；停止请求立即废止续步，不等入口排空后才调用注册 close。
  该机制只阻止尚未交出的步骤，已交出步骤仍按 AR2 观察真实结果。

## 组织与成员

既有 `core/organization-governance/SPEC.md` 继续拥有四服务面的集成承诺。
本批补齐事件名/载荷唯一源，删除过时的 storage/clock 键复制描述。
组织、成员、邀请、隶属请求与当前租户的全部业务次序沿 OG2，旧模型保持适用。

`organization-governance-sql` 保留同一 runtime、多 Service 面、同一 AtomicStorage。
四面一起换代，不拆成各自有独立 storage 的服务。
成员角色/最后 superAdministrator、个人组织唯一成员和环检测均不能靠内存缓存替代同提交检查。
`createPersonal` 的账号读取参与、组织/成员写入仍在一个 unit。
已开始业务完整 Promise 的完成先于依赖释放；任何启动清理失败都必须报告。
独立工厂已有面的关闭协议统一到同一 runtime，不能让包装子类分别关共享引擎。
不增加新的自动 sweep 节奏；原 sweepStaleSelections 的装配责任保留。

## 客户端公共操作与本地状态

`core/governance-client-operations/SPEC.md` 接续 CG2 S-1～16 全部操作，保留精确引用。
ActionIntent 在等待前捕获，InputPrompt 的调用次数、取消和晚返回、敏感槽精确集合保持。
客户端绑定只决定发送目标，不授予中心权限。原固定 use 身份、busy、local CAS、未知远端结果、
一次查证和副本过滤不因依赖注入改变。

close 停止新 use/action，取消仍在等输入的 prompt，等待网络、本地写与查证真正完成。
同一 close 重复调用返回同一完成过程。已关闭旧引用拒绝原 ClientUseUsageDefect。
换 transport/state 必须先结束旧客户端代际，不把新服务注入已开始的调用。
CLI 表示层只渲染 ActionReport，不获得本地记录秘密或原异常 message。

`core/client-local-state/SPEC.md` 接续 CLS1 S-1～8 的本地访问、CAS、快照资格、耐久、未知及停止承诺。
读到损坏不得自动重建，未确认不能当未安装，旧快照不能跨实例使用。
`client-local-state-sqlite/SPEC.md` 拥有目录/文件和传入 storage 工厂的责任。
原私有文件检查、exclusive creation、synchronous=full、5 秒受限打开等待及失败清理保留。
工厂拒绝时没有实例所有权转移；返回后由 CLS 负责 close。二次失败不得吞掉打开失败。

`core/governance-center-entry-https-json/SPEC.md` 拥有独立传输的单次调用承诺及原版本协议。
不替用户信任新证书，不附加重试，不保存登录，不记录请求秘密。
真正发出后取消/超时保留 sendAttempted，不能改称远端未发生。
Config 错误在请求前抛出具名错误，协议拒绝和网络 unavailable 保持原封闭联合。

## 服务端、宿主和资源

`core/governance-center-entry/SPEC.md` 拥有事件、只读开闸信号及维护资源接口。
业务仍沿 EC3，线协议沿 HT3，普通客户端兼容版本集合及 route ID 不变。
`governance-center-entry-node/SPEC.md` 拥有独立 HTTP/TLS/Unix 函数及其 Cordis 投影。
重构须抽出以显式依赖、日志和通知函数为参数的真实纯根工厂，不用 Context 类型藏在声明闭包里。
纯函数面保留原离线维护、迁移和快照检查导出。

准备就绪只表示已建资源且关闭准入；开闸必须等宿主完成升级确认及最终时钟检查。
网络排空有界不等于业务完成有界。断开连接后仍可能存在业务或维护工作，仍需等待其实际完成。
ops 不因客户端依赖失效而调用治理服务，收到 serving/stopped 的顺序及会话状态保持。
两面直接检查同一 EntryOpening.isOpen，监听撤除不能留住旧准入资格。
停止前已准入的工作仍由原行排空；原运维共同开放前置不能只靠通知缓存判断。

`apps/tenancy-host/SPEC.md` 持续拥有跨模块启停和升级保护，插件树不夺走该责任。
`core/cordis-plugin-tree/SPEC.md` 只拥有合层、准备/加载/逆序释放与安全诊断。
运行对象通道的详细切换按[装配协议](plugin-tree.md)，原 Storage/Clock 业务继续由原唯一源拥有。

## 必须验证的 IC 及层次

| 约束 | 静态/表达检查 | 行为或独立判断 |
|---|---|---|
| IC-1～7 | 定义源/键/类、包名、根与 cordis 闭包、允许 import | 替代提供者、同一 label 重复键、独立制品调用；边界和复用价值 |
| IC-8/9 | inject 字面量及可选 type-only 增补 | 依赖缺席、换代、旧捕获引用、仍在途 scrypt |
| IC-10～12 | 事件名/唯一声明/@mode/@param | 提交后通知抛错不改结果，无双发，无 Promise emit listener |
| IC-13 | effect、listener 拥有者 | 撤除后无旧监听；业务已提交效果不因撤除撤销 |
| IC-14～16 | Standard Schema、JSON、两层协议、无资源塞入配置 | 错误配置全拒绝，来源打印、替换/停用/插入及真实 host |
| IC-17 | 本树不接 Session 插件 | Session 候选留 R2，不能用树演示关闭该项 |
| IC-18/19 | 显式身份与同进程前提 | 跨租户拒绝、同提交及私有实例资格；不声称跨进程保证 |
| 分层/SOLID | 消费者→定义←实现，无人为扩大装配标签 | 单提供者替换不改业务消费者，独立函数不依赖内核，语义责任完整 |

复杂度读数只暴露风险，不替代以上行为和责任判断。
若新的关闭协议与原业务停止语义出现冲突，阻断依赖实现并修订本候选，不能由包装层自行添加失败。
