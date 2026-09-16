# JSONL 存储提供者：设计映射

## 采用接口

提供者消费 `capability.durable-records@1` 的精确候选坐标。当前实现由受信应用直接调用 `createJsonlProvider`，取得 provider/writer 后交给唯一 admission；没有 Cordis 服务键或插件，未来生命周期包装是候选 gap。
tenant、operation、因果、epoch、修订与资源所有者必须显式；有状态资源的实际 owner 在撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为 `packages/storage/jsonl/design.md`，SHA-256 `78d8eb48075d91af05f5b009d5200594193feea3700f309fc3705df482a85ab9`。有受限真实 JSONL/锁/恢复实现；支持文件系统、fsync、unknown、换代和全部 DR 条款仍需真实验收。
源码实现状态必须由 I/实施任务在精确 revision 核对；本文不复制源码内部结构，也不声称已通过新契约验收。

## 持续消费的映射


| 接口/机制 | 当前映射 | 验收限制 |
|---|---|---|
| `createJsonlProvider` | 返回受信 reader 并取得唯一 writer | 只覆盖单机一个 coordinationDomain |
| prepare/commit | adapter 先合并每流唯一 append、保留流内事实顺序，再按当前 format 的 canonical `StreamRef` 编码严格排序；门外校验预编码，commit 同步排位，I/O 退出当前栈后串行 | writer 拒绝重复/非 canonical appends，不静默重排；修订冲突也须耐久后返回；不读授权 |
| operation identity | 相同 key/input 认回原结果；异 input 冲突；unknown 保留原 key | unavailable/rejected 不伪称已接纳 |
| stream revision / fact identity | 每个 accepted append 令目标 stream revision 恰好 `+1`；同 append 多 facts 共享 revision；commit 以 canonical flatten 位置分配 `(domain,batchSeq,recordIndex)` eventId | owner fact sequence 不参与 CAS；prepare correlation 与 `(stream,revision)` 都不能冒充逐 fact eventId |
| read/watermark | 只返回完整批次与精确前缀；在线、扫描和恢复复用同一 revision、canonical order 与 eventId 算法 | 落后/坏前缀不得用于授权或恢复成功；不得探测或兼容两套 revision 算法 |
| writer/lock/recovery/close | epoch、原生锁、尾部核实、排空关闭有实现 | 网络 FS、硬件故障、目录 fsync 与提供者换代仍需环境验收 |
| personal creation | writer 只接受受信 Admission/Tenant Host 在当前代为一笔冻结原操作颁发的资格，绑定来源、原 operation/摘要、`UserRef`、target、domain、精确 expected revisions、host/owner/writer 代际。`account_registration` 恰是 personal-index system + `tenant:<target>` 二流；`deployment_init` 另含 bootstrap system 三流，同批原子同步 | writer 不解析 Account 授权或 Tenant 业务事实；客户端来源、owner/operationKind 字符串、旧 session、反序列化 envelope 与历史 epoch 均不能铸造资格 |

跨 stream prepare 输入顺序不承载业务关系；跨 owner 关系由完整 envelope 的引用及全部
owner 校验表达。personal creation 使用严格 `core-journal/3` canonical 编码、摘要和
版本标记，在线写入与重启 replay 使用同一顺序、revision 和 eventId 算法。
target 协调域若存在旧候选格式或未知格式字节，须保全原件并拒绝按 v3 可写恢复；
本候选不增加旧格式读取、转换或继续写入兼容层，也不就地重释历史 envelope。

成功批次只接受资格规定的完整二/三流集合。CAS conflict 是**同原操作的另一个
provider-owned outcome envelope**：仅写 system `operation-outcomes`，不伪造成功
批次的 personal-index、bootstrap 或目标 tenant append；绑定原 operation/摘要、来源、
`UserRef`、target 和原资格，按原操作身份去重。`conflict.currents` 只列实际 mismatch；
即使只冲突 system index，也要把原 target 写入 outcome 与同一 provider-owned
`operation.conflict` fact。两者采用 v3 封闭形状，fact version `3`，其 data 恰为
`{conflict, personalTargetTenantId, source, operationRef, inputDigest, userRef}`，并与
资格及 outcome 逐字段一致。普通 conflict 不接受这些扩展字段。

prepare/commit 时 writer 核当前代不可伪造资格、二/三流完整形状、CAS 与结果；
lookup/replay 从唯一成功 tenant append 或 conflict target 字段核历史身份和原结果，
严格拒绝错字段、额外字段、错版本、错 stream、非 canonical 顺序、坏前缀和同键异
输入。历史记录不重新颁发资格。unknown 不释放占位，临时 `not_seen` 不证明未提交；
旧 writer 完整前缀、原操作未提交和占位安全解除都可核实后，才能以同原操作/摘要/
target 在当前代重新准备。
