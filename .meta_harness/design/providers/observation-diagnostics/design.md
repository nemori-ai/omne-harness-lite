# 工程诊断提供者：设计映射

## 采用接口

提供者消费 `capability.engineering-observation@1` 的精确候选坐标。当前实现由应用创建目录 owner 与 source runtime，再把受限 `Diagnostics` 注入消费者；不新增 Cordis 服务、logger bridge 或全局 OTel manager。未来插件投影仍是 gap。
tenant、operation、因果、epoch、修订与资源所有者必须显式；有状态资源的实际 owner 在撤除时先封闭新使用并收口已有责任。

## 当前实现与缺口

来源设计固定为 `packages/observation/diagnostics/design.md`，SHA-256 `32e4c2f88dd2c3cc73462347c090ebe0c258fe936e15c0a9431defbc877c2ae6`。结构化被动诊断、Pino/Sonic/OTel 边界有实现；它不是 durable audit，也没有闭合 query/export 或全能力接入。
源码实现状态必须由 I/实施任务在精确 revision 核对；本文不复制源码内部结构，也不声称已通过新契约验收。

## 持续消费的映射


| 机制 | 当前映射 | 缺口 |
|---|---|---|
| `Diagnostics` / scope / span | 显式 tenant/operation/causal parent，被动且同步 | 身份先由可信入口核实；ALS context 不是授权 |
| Pino + SonicBoom | allowlist 后结构化写入、有界 buffer/文件代际 | `fsync:false`，不能作为 DR 回执或关键审计 |
| OTel API/SDK/ALS | 私有 provider/manager、显式 parent、同一日志流 | 不注册全局 manager，不证明跨进程传播 |
| health/gap | 尝试、接收、drop、pending、实际写入与关闭故障可见 | 崩溃尾部只能报 unknown；query/export/保留治理未实现 |
| close | 关新 scope，等待有限 span/flush/stream close，保留未释放责任 | 不等待业务 Promise；调用 destroy 不等于释放完成 |

D-011 的当前本地目录设计只有一个 owner：应用先经唯一 factory 打开部署控制目录内固定
`.diagnostics.lock`，核对 realpath、普通零字节文件及 fd/path inode 后取得 `flock(exnb)`，
才扫描原件或创建来源。锁文件在 generation、关闭和维护期间保持同一 inode，不 unlink、
替换或截断；同进程的第二个 open file description 也必须由真实内核锁拒绝。

目录 owner 统一计算所有来源的字节与 slot：默认最多 8 个来源文件，稳定锁另占一个零字节
目录项，总量上限 64 MiB。每次 create 在 I/O 前预留 slot/字节，短写、回调错误或超时无法
证明未写入时保留上界。只有确认文件从未创建且清理完成才退还 slot；文件一旦创建，须先静止
写入、关闭 fd 并核对最终大小，此后只能退还确认未使用的 byte reservation，文件、slot 与实际
字节继续计入目录用量，直到后续受治理的保留/删除流程处置，不能随失败清理一并退账。
初始化/扫描/open 失败若仍持 fd、文件或准备责任，必须返回可 inspect/close 的 cleanup，
不能以 unavailable/busy 遗忘资源。

关闭先封 create，接管迟到 open，等待所有 source runtime、pending write、扫描 handle 与 fd
实际收口并核对最终占用，最后才关闭持锁 fd；任一子资源或锁释放未知都返回 blocked/unknown，
不先 unlock 再清理。该保证只适用于合作调用者、部署控制路径和已验证的本机 Linux/ext4 +
`fs-ext@2.1.1` 环境；不覆盖 NFS、敌对目录写入或绕过唯一入口的程序。
