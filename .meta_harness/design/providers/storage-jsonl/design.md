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
| prepare/commit | 门外校验预编码；commit 同步排位，I/O 退出当前栈后串行 | 修订冲突也须耐久后返回；不读授权 |
| operation identity | 相同 key/input 认回原结果；异 input 冲突；unknown 保留原 key | unavailable/rejected 不伪称已接纳 |
| read/watermark | 只返回完整批次与精确前缀 | 落后/坏前缀不得用于授权或恢复成功 |
| writer/lock/recovery/close | epoch、原生锁、尾部核实、排空关闭有实现 | 网络 FS、硬件故障、目录 fsync 与提供者换代仍需环境验收 |
