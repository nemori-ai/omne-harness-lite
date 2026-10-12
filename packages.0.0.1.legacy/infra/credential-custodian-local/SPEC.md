# Credential custodian boundaries

公开根拥有 sealBody／openBody 及其值形状，`./model-replica` 拥有当前 model-only 组件，`./migrations` 拥有 replica 表升级片段。当前没有 Cordis Service、generic 六操作、OAuth 或 sweep 实现。秘密不因品牌或 TenantId 字段而获得读取资格。运行时只经真实 directory 取值；仅可信装配创建和关闭组件。

## 当前 model-only 行为

预置 key 是绝对路径、普通 32 byte 文件且权限恰 0600；startup 与每操作都在同一已打开文件 handle 核实及读取。缺钥 startup 失败，不生成。组件返回前核迁移 readiness；依赖 storage／clock 借用，不拥有它们。replica 基础表及 nullable source_ref 升级与 directory 片段共用同一真实 storage；旧行不猜来源、不改密文／login／time，确认权归存储 owner。

body 是组件拥有、非空 Uint8Array，不猜编码或模型 key。AES-256-GCM 使用独立 12 byte nonce，格式为 version[1] | nonce[12] | ciphertext | tag[16]。v1 AAD 是 tenant，v2 是 tenant 与 source；各段有四 byte 大端 byte 长度及 UTF-16LE 内容，保留孤立 surrogate。换 tenant／source 或把旧 ciphertext 标成当前都不能成功 bound read。钥与密文同时被窃超出保护范围；清临时 buffer 不声称 JS／OS 内存可证明擦除。

trusted bootstrap 写入前核真实 Login／Tenant／source body 关系。storeBoundReplica 在当前 binding 缺席／漂移时仅 stored:false；真实 commit 后 stored:true，unknown 不反推无写入。整行替换 login／time／source／body，不半份。无隐式重试。内部输入和误用 unit 为 StorageDefect；不可用以 StorageUnavailable 穿 unit.run，污染到唯一外层终结者，caller catch 也不能提交部分。异常分类保留，值及 cause 在实际终结后去秘密，不能提前吞为业务 unavailable。

readBoundReplicaIn 在同一 live StorageUnit、同一实际 storage 核 current binding、expectedRef、stored source 三者相等，不读 clock。完整成功仅 {body}，无记录／不可解密或 source 失配为 absent；坏解密有诊断，不改 binding、不自动删行。key／closed／storage 不可用不是 absent，不跨 tenant 回退、不明文回退。reader 返回不结束 unit；外层须真实终结才给 body 或清错误。sameAtomicStorage 与真实 reader closure 的身份不能被形状相似对象冒充。

close 停新准入并等待真实 in-flight，多次共用 drain；不删 key／rows／bindings，不关借用 storage／clock。diagnostic 仅有限 stage／outcome／tenant／sourceMatch，不含 body／key／ref／ciphertext／cause；装配处理 sinkFailure、关联与保留。符号守卫是同进程调用边界，不是敌对代码 sandbox。

## 已接受而未实现的完整保管能力

以下属于秘密保管的未来业务义务，不是当前公开导出，也不由当前 model-only 测试证明。sourceRef 不是 OAuth CredentialRef，不建兼容别名。未来操作的 loginState、tenant、holding 各成员、binding、ref 缺席或非法均为 invalidInput，没有当前登录或租户默认。

| 面 | 终态义务及缺口 |
| --- | --- |
| generic replica | storeReplica 可信调用核 tenant 属于该 LoginState 的账号、body 等于中心 current binding；按 tenant 整行替换 body／login／time，后 commit 胜。readReplica 仅该 tenant，不因离线／新 login 重判旧归属 login，不跨 tenant 回退；无记录／不可解密 absent，存储或 key 不可判 unavailable。discardReplica 同 tenant 幂等；discardLoginState 在一次提交内删除当下归该 login 的全部 replica；重复调用或从未写过也返回同一成功。若同 tenant 被其他 login 重写则不删，不碰 OAuth。真实 login 结束观察源未建，不能凭 TTL 自创事件／后台清扫 |
| depositOAuth | 非 tenant scope 或 scope.tenant 不等于 holding.tenant 为 invalidInput。真实 binding 在同 commit 存在才密封；确定不存在为 bindingUnknown；绑定事实无法判定时返回 unavailable。只要条目仍指该 binding，binding 不得消失；每成功 mint 新不可猜、唯一且不复用 ref，不按当下 binding state 拒收。body／binding／holding 固定，重试可能留 orphan，不把新 deposit 当幂等。ref 仅成功返回，日志不留原 ref |
| resolveOAuth | 先拒非法身份或 holding scope：非 tenant scope 或租户不等为 invalidInput，不折入 notResolvable。同一 consistent read 核 ref 曾发且尚存、holding 恰相等、binding granted 且 currentRef 指此 entry，才交 body。其余统一 notResolvable（含坏 ciphertext），没有 tenant／ref／holding 回退；store／key／binding 不可判 unavailable，不伪不存在。未完成的 pending 或已换 ref 不交 body。已经判定交出的本次读取，随后 binding revoked 仍照常交出；下一次拒绝 |
| sweep | 仅 revoked、pending 且 now>since+TTL、granted 且 currentRef!=entry 三类。等于 TTL 不过期，pending 未过期／granted 当前不删；与桥完成按同 binding 排序后重读同 clock／TTL，binding 不可读 skip，不改 binding、不通知。坏 ciphertext 且 granted-current 不得擅加第四类；保留条目，桥报 credentialUnavailable，等重新授权 |
| sweep progress | 真正在场、存储／binding 可读、一轮≤interval/2 且每 interval/2 起轮，才有 sweepInterval 上界；TTL／interval 值待装配，缺值 startup 失败。没 sweep 不错误 resolve，只影响卫生；弱公平模型不证明真实耗时上界 |
| withdrawal | 持久事实不随撤除删。unknown 不证明无 commit；generic 真幂等写可按事实重做，OAuth 重 deposit 可能更多 orphan。当前 close／参与异常协议继续有效，不被旧“unavailable无commit”说法覆盖 |

仍未完成：静态 MCP 没 entry 时无法连通；续期／token writeback、中心传播及本地 login 结束源、key rotation／重新封存、完整 Service 和装配参数。当前 source pair 只约束本地 model 输入，不解决这些产品责任。body 只在 read／resolve 成功交出；其他所有输出不泄密。

有限 Sweep 模型归 [models](verification/models/README.md)，只覆盖未来 OAuth 三类清扫与桥完成的交错前提。当前验证、后端及真实组合责任见 [verification](verification/README.md)。
