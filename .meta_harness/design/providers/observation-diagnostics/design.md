# 工程诊断提供者设计映射

## 采用接口

提供者消费 `capability.engineering-observation@1` 的精确候选坐标，并在 Cordis Context 中以有生命周期的服务/插件装配。
tenant、operation、因果、epoch、修订与资源所有者必须显式；依赖撤除时先封闭新使用并收口已有责任。

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
