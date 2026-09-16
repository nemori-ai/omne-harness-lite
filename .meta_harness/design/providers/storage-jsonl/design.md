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
| tenant bootstrap | writer 仅接受由受信装配经 Admission 绑定精确操作、冻结输入、新 tenantId 与本代 writer 的窄凭据；核对两条固定 Tenant system streams 与一条匹配 `tenant:<id>` 的 tenant stream，同批原子同步 | 既有 writer epoch 不是 Tenant 初始化已发生的证据；writer 不解析业务事件决定个人/owner 资格 |

跨 stream prepare 输入顺序不承载业务关系；跨 owner 关系必须由完整 envelope 的引用及全部
owner 校验表达。format 升级若改变 canonical 编码须发布新版本并保留旧格式的解码/重放规则，
不能让同一历史 envelope 在重启后产生不同 recordIndex 或 eventId。
conflict 只写 system `operation-outcomes`，其 currents 只列实际 mismatch；同一
provider-owned outcome/record 必须额外持久化并核对原绑定的
`bootstrapTargetTenantId`，包括仅 system stream 冲突时；
prepare、提交、lookup 与重启读取均核对原 operation/input、scope 形状及绑定，不能
用自报字段取得新写入许可。坏前缀、错 stream、重放异输入保持隔离或冲突，不跳过。
重启时从唯一成功 tenant append 或冲突 outcome 的目标字段恢复历史目标，
按版本化严格编码核对 envelope 的 operation/input、受限 stream 形状及唯一前缀；历史数据只
用于重建原结果，不能被当作可导入的运行时受信写入凭据。未提交且无法证明的操作
继续 unknown；重新写入仍须当前宿主的窄绑定。
