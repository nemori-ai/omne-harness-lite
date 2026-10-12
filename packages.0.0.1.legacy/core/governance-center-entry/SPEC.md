# 治理入口公共集成承诺

本包拥有已采用的两张治理网络面共用的准入信号。宿主实现该信号，资源关系与确认责任归[治理宿主](../../../apps.0.0.1.legacy/tenancy-host/SPEC.md)。

- 每个装配代际只有一个实例。`isOpen()` 直接求值为本代确认完成且 lifetime 仍 current，不依赖通知缓存。
- `wait()` 只在全部资源就绪、升级守卫确认完成且仍 current 后兑现。停止时尚未兑现的等待，以及停止后的新等待，以 `EntryOpeningStopped` 拒绝。
- 已兑现的 Promise 不会撤回。两张网络面必须在新请求准入处直接检查 `isOpen()`；运维操作开始前也复验共同开放条件。停止不取消已接纳工作。
- 宿主拥有实现、拒绝观察及代际生命周期。`./cordis` 的 `EntryOpening` 只绑定服务键，不拥有确认或关闭控制权。

## 维护资源和通知

EntryMaintenanceResources 由宿主提供同一次启动的 snapshotChecks 与完成回调。
ops 必需注入 entryMaintenance，已经开始的维护等待真实收场，完成通知不能代替等待责任。
资源对象不得放入序列化配置，宿主保持它们直到整代 closed 后再核对。

四个通知名及 ServingNotice 由本包纯根拥有，Events 增补只在 ./cordis。
入口开放时发 serving-started；运维监听重新就绪时，已开放入口重发。
停止准入时发 serving-stopped；每次缺陷观察发 defect-observed；
运维监听安装完成后发 ops-listening-started。通知是同步 emit，失败只记诊断，
不改变已提交业务结果或丢失清理责任。迁移保留原载荷、次数和时序。

维护资源由[治理宿主](../../../apps.0.0.1.legacy/tenancy-host/SPEC.md)交付，[服务端提供者](../../tenancy/governance-center-entry-node/SPEC.md)拥有真实启动与关闭。

## 当前治理协议与组织名称

`./schema` 是当前治理交换形状的唯一源，Schema 身份采用文件中的包级 `$id`。
提供者、HTTPS 客户端、本地缓存校验和 CLI 消费同一份源，不再保留包内冻结副本。
线上协议版本为字符串 `3`。旧协议 `2` 返回 `version-mismatch`，不保留无名称创建兼容路径。
公开体检仍跨版本，保留原请求/返回和中心绑定规则。

现存 operation 字符串作为稳定路由标识保持；其当前形状由本协议版本和本包 Schema 共同限定。
团队创建路由的载荷必须含 `name`，可选 `creationKey` 保持。名称语义归组织治理公共 SPEC。
组织读取结果必须含原身份、种类和中心持久名称，有上级时仍含 `parentOrganization`。
有效客户端不能以旧无名称读面或本机别名填充这项属性。保留原调用方推导、授权现读、
事务参与、拒绝/不可用/未知区分、一次调用和秘密保护，名称不改变任何授权。
服务端维护定义接续已迁 EC3 的形状，客户端采用本次明确的治理线上协议，不自动开放运维面。
当前运行消费者不再引用旧协议Schema；旧输入只作为各拥有者的限定验证夹具，不提供运行兼容。
下述业务承诺由所有入口提供者共同消费。线上字节与本地维护算法归[实际提供者](../../tenancy/governance-center-entry-node/SPEC.md)，不从类型齐全推断业务兑现。

## 判定、授权与结果

- public-health唯一操作先于version识别；其他请求依次判version→envelope/operation→auth→payload→derive→supplementary authorization→domain。register/login免auth且忽略presentation。确定的表示拒绝不读数据库，库坏也保持最早出口。
- 只有AI exchange认出示物。裸ID、证书、IP或过去连接均不代替；缺失/重复/表示错误、未签发/撤销/其他中心的六种认证拒绝在线逐字相同。每请求δ=0现读，不缓存跨请求资格/tenant，不凭IP、UA或客户端版本差别对待。
- 所有发起方AccountId/LoginStateId只能取AI exchange所得；presentation不交给其他领域面。需要行事TenantId才以该LoginStateId现读当前choice，每请求捕获一次向下传；仅需AccountId的路由不额外查choice。payload身份仅为目标，不作为发起授权。
- 四种组织读取按认证Account分别核目标组织，不用当前selection等于目标作额外门。双组织读取在unit仍有效时全部核，不因ineffective短路；合成依次defect→unavailable→任一ineffective为notAuthorized→全部effective。storage已poisoned则退出不继续SQL，既有defect不被后拒绝遮蔽；不存在组织在线同notAuthorized以免枚举。
- domain声明unavailable映射入口unavailable。AI `invalid-input` / OG `invalidInput`按本次实际交给领域的输入判断：包含payload项时答invalid-input；全部为入口产出的身份值时答unavailable并记defect。不按被拒绝的单个字段猜来源。迟到发起登录失效同login-state-rejected。
- 结构上不可达的具名值（注册的identifier-held-by-expired-record、创建组织/接受邀请/拒绝邀请/拒绝隶属申请对已认证本人返回accountNotActivated/accountDoesNotExist）答unavailable并记defect。与承诺矛盾的返回另有封闭清单，恰三样，此外不检：成功结果不合本路由Schema；OG我的租户或AI列有效登录返回空列表；OG当前TenantId的account不等于认证AccountId。均答unavailable并记defect，未提交的共同边界回滚。
- 未声明值、返回无值、未声明异常和结果编码缺陷答unavailable并记defect。共同边界已声明的存储不可用须待真实终结后答unavailable，不增defectCount；失效作用域、跨域、重入、游离并发等声明为缺陷的条件仍记defect。一直不返回属于进展前提，不由此伪造出口。注册不可判定保留AR interrupted，不泛改unavailable；其他具名业务拒绝原样投影，无reason。
- 四种入口答案不带requestId/time/cause。unavailable不证明零效果，未知不自动重放非幂等请求。

## 同提交与预期tenant

- 普通认证操作的认证、choice、expected比较、补授权和业务临时结果属于同一次真实atomic。成功Schema、编码及final clock均先于实际commit；临时result不是commit。意外、编码或final clock失败不能提交/notify。
- 前置拒绝不做业务、不touch；AI首次未激活到期事实的例外由AI拥有。成功读取与幂等认回也须finalize，自撤销/改密不复活原login。提交已经成立但receipt/send未知，不回滚既有事实；未知不重放。
- expected只比较，不授权、不派生身份。所需expected缺失在认证后判payloadinvalid；禁带者多带也invalid，没有server默认。compare和business同提交，mismatch不泄漏实际tenant、不切换/touch/自动重试。切当前组织的expected指切前而非target，Account部分由AI认出。用户重新读choice再确认。
- 按identifier邀请先核当前effective、非personal tenant的超管，再AI resolve；不能先查Account。unknown/unactivated映射accountDoesNotExist，resolve成功后OG又称未激活为矛盾defect。
- 改密：初auth→payload→无write-lock prepare→原ticket finalcommit先重核原账号/凭据代次G，再核原发起login。准备间隙G已变时先报current-credential-rejected；G未变而发起登录被撤销时答login-state-rejected。不extra exchange掩盖G变化、不用旧auth。ticket不上wire/log，不跨call复用，没有新login、补活、重放或逆操作。两种decline沿OG自身资格规则，不新增后台清扫。

## 健康、身份及保密

- public-health无auth/数据库/clock，只有三项；reachable只说明能答，不说明业务健康。其唯一operation确定后其他层duplicates忽略但仍受解析限额。
- full-health只有十项及五个deployment参数，不含业务事实、技术参数或秘密。数据库/clock每次现probe，不缓存；读不到或clock回拨对应false而非健康调用失败。密钥present/complete是启动载入事实，删文件不改变；startedAt是开闸成功时真实clock，不是构造时刻。
- 五个正millis参数都必给，无出厂默认；其中两个TTL即使未被当前业务消费也须验证/可见。defectCount只累计入口自身观察，启动非负、重启归零，不汇总提供者缺陷；零不证明系统无缺陷。
- centerId稳定于同一数据库，地址、密钥、配置、重启及迁移不改变，备份恢复保留。它不是秘密，也不证明对端真实性；实际铸造/读取和拒绝启动的存储责任归提供者。
- 答复、健康、维护metadata、错误及日志不泄秘密，只有成功login交新presentation的例外。受保护数据库副本可含凭据，不许进入文本/log/meta；没有宿主不可读或加密保证。
- 请求运行记录可定位阶段、答案、entry defect或不可判定及实际观察的读失败，不擅自细分provider unavailable。无peer地址，Account/Tenant只不可逆correlation，无body/presentation；AI不区分的拒绝不凭空细分。运行记录不是可提交的开发日志。

## 整体面与换代

31路由和两张网络面共用准入，required面缺席表示问不到，不提供部分路由。数据库/clock暂不可用是业务返回，不使面消失。能力可热换，当前不支持storage/clock换代；旧admitted工作真实结束、新两面问不到，换代本身不记defect。

普通认证与外部revoke串行，prepare间隙最终重核。事实在数据库，未commit/待notify临时值不跨重启；network drain不等于业务终结或依赖释放。模型、故障/并发及固定字节义务见[提供者验证入口](../../tenancy/governance-center-entry-node/verification/README.md)。
