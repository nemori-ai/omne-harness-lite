# 工程诊断提供者：验证边界

## 固定旧证据及其范围

| 对象与输入 | 实际观察 | 限制 |
|---|---|---|
| D-010 初始 D1，产品 `4b8125eb953c97893bdeeeeafac3fb77d276d208`、输入 `0e80245bf262b13d466b9ec18bec6f9bdf7eea65` | 旧 P1 的 O01～O08 记录被动记录、隔离上下文、安全投影、资源预算、输出健康、关闭、代际 guard 与独立制品消费；下表保留观察范围。 | 此时旧独立 factory/目录预算已被 D-011 取代；worker 结果不是当前新谱系 v1 的符合性。原始 RED/GREEN 和命令可在该修订的 `docs/proposals/core-capabilities/implementation/evidence/p1-diagnostics/` git 历史查到。 |
| D-011 目录 owner，已接受源码 `7e758f21f8f92c1d46fab194fdaf120239b8e11c` | 包内证据（`packages/observation/diagnostics/evidence/directory-owner/README.md`）记录 52 项 diagnostics 测试、真实 flock/目录/资源故障、独立 tarball 严格编译与运行、最终 `pnpm run check` 退出 0；原始输出（`packages/observation/diagnostics/evidence/directory-owner/check.log`）与清单（`packages/observation/diagnostics/evidence/directory-owner/manifest.json`）固定输入和产物。 | Linux 5.15 本地 ext-family、Node 24.18、`fs-ext@2.1.1`、GCC 10.5 的有限检查；不证明 NFS、敌对目录写入、业务宿主或任意崩溃交错。未按新 v1 catalog 坐标执行。 |
| 旧本机装配 HUB `31197742905a3c66fc3e650c153d65d014372c21` | [装配证据](../../assemblies/local-harness/verification.md)对应真实 JSONL/admission/D1 的 O09/O10：同时 fsync/diagnostics EIO 保留业务 unknown/quarantine；publication 失败加诊断失败保留 `committed/blocked` 与 ExactUse、晚拒绝和门外关联。 | 仅为固定 P1 切片及五包独立消费者；不证明新 DR/CC、完整 owner recovery 或 Account/Tenant/Run/Agent/Tools。 |

O01～O08 是旧 D1 结果的辨识编号，不能转成新 v1 通过标记：

| 编号 | 当时观察；现今复验仍需固定新实现与装配 |
|---|---|
| O01 | `within` 一次调用保持结果、throw、拒绝和 Promise 身份；10,000 个未结算业务 Promise 不占 span/scope 任务表或阻碍关闭，真实 EIO 不覆盖业务标记。 |
| O02 | 两个 tenant 的异步续段和 ROOT timer 无串归；显式 parent 保持 trace，独立 runtime 各持 ALS/provider。 |
| O03 | 真实文件与 OTel span 的 getter、`toJSON`、循环、超长 UTF-8/计数及正文、错误、URL、header、secret 哨兵被安全投影排除。 |
| O04 | 记录、活动 span、Sonic buffer、来源文件、目录和文件数超限触发；固定 reason 的 gap 有界聚合。 |
| O05 | 单条低流量输出无需下一条或 close 即可读；延迟真实 write 报 stalled，部分写只计可确认边界，EIO failed，旧非 clean-end 为 crash unknown。 |
| O06 | 未结束 span 与迟到磁盘回调阻止关闭；并发 deadline 加入同一清理；迟到记录不碰已释放流，未结算业务 body 不阻塞清理。 |
| O07 | 两个真实 factory、来源碰撞、新旧代交错、迟到旧引用和资源隔离；只是宿主原子切换所需的原语，不是宿主换代验收。 |
| O08 | 默认公开入口、依赖/声明、17 个独立包闭包与 packed file/log/span/close 消费；D-011 后唯一目录 owner 有单独包内制品证据。 |

## 当前 v1 符合性缺口

本轮只核对来源 SHA、D-010/D-011 接受范围、候选 OB v1 映射与旧结果局限；**没有**在新谱系 v1 固定实现 commit、应用装配和失败注入上重跑以上案例。后续至少须分别固定并执行：身份/跨 tenant parent 与排队恢复；投影泄密反例；共同预算、部分写和 unknown；同源 join/config conflict、历史同名、scan/cleanup；真实 flock、重启和 inode 稳定；迟到 open/span、close blocked、raw close unknown/fd 复用及最后锁释放未知后新 owner 判断。每项记录源码/制品修订、Linux/Node/native 版本、原始结果和覆盖边界。

真实 JSONL/Admission 门外发射和业务结果隔离由其提供者复验；应用宿主还须验证当前加至多一旧代的切换、生产者结算后关闭及 Cordis Context 撤除。OB 的关键审计、query/export、tenant 读权和保留管理仍是独立缺口；`fsync:false` 的本地来源与成功 write callback 都不是业务耐久回执。缺少这些结果时，本主题仍为部分映射，不以决定接受或旧 P1 通过声明 v1 符合。
