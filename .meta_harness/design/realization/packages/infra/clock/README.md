# clock

- kind：`provider`
- 源码位置：本旧映射坐标为 `packages/infra/clock`；当前实现归[实际成员](../../../../../../packages/infra/clock-lease/README.md)。本坐标不声明旧路径仍是源码位置。
本节点维护尚未迁出的租约业务与验证义务。公开集成承诺按[共享 Storage/Clock 归属表](../../../../architecture/pilots/shared-storage-clock-ownership.md)定位：Clock 形状与 `Instant` 归 `packages/core/offer-expiry`，ClockService 与服务键归其 `./cordis` 入口，租约提供者的绑定、限定名称与装卸归 [`packages/infra/clock-lease/SPEC.md`](../../../../../../packages/infra/clock-lease/SPEC.md)。源码在 `packages/infra/clock-lease`。上述迁移只取代原公开键、根入口与 raw 发布投影；原租约表、时间源、窗口、回拨和关闭算法及消费者业务承诺继续有效。

本节点的设计说明租约机制；公开集成边界由成员旁 SPEC 维护，不在此保留另一份插件定义。采用 Cordis 4.0.4。租约提供者拥有进程内用过的最晚时刻、存储中的一行高水位、续约定时器与迁移前只读核对；它借用 Storage，不拥有 `Instant` 的表示或消费者遇 `'unavailable'` 后的业务收场。高水位是写在前的租约：先持久化上界，再返回不超过该上界的值。依据与代价见[实现设计](design.md#高水位为什么是写在前的租约不是写在后的节流)。

## 分层状态

- **承诺归属与采用范围**：本节点不作为独立契约 provider。它承接 `data.offer-expiry` v1 [S-16](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源) 的时间源形状与 [S-17](../../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 中 `now` 不后退的装配前提；offer-expiry 仍是协议拥有者。入口 [S-36](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) 末行与 [S-34](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁) 经 [tenancy-host 时钟装配](../../../apps/tenancy-host/design.md#时钟装配) 转交。公共集成迁移已完成限定技术接受，其精确范围沿[承诺归属表](../../../../architecture/pilots/shared-storage-clock-ownership.md)，不据此提升未迁租约行为、所有消费者或下面的验证范围。
- **实现责任**：提供同一 Clock 实例只承担“`now` 与 `expiresAt` 同源可比”的提供者一半；消费者不得另用 `Date.now()` 由 offer-expiry 的 SC-OE-3 约束。租约机制承担进程内不后退、进程崩溃后重启追上持久租约前不可用、启动回拨 fail-closed；运行中每次现读墙钟并与用过的最晚时刻比较，回拨时返回 `'unavailable'` 直到追上，不因此自行撤除。启动租约窗口、入口等钟上界与迁移前只读核对见 [design.md](design.md#能力到-cordis-的投影)。提供者撤除中的准入、在途续约与实际关闭责任沿当前 `clock-lease/SPEC.md`，不由服务存在或 fiber 状态代证。
- **明确不承诺的范围**：操作系统崩溃或断电后不后退；`synchronous=NORMAL` 下可能丢失上次检查点以来尚未被操作系统回写的全部续约，空闲窗口约 55 分钟是所述条件下的估计，实际取决于回写延迟。重启墙钟若落在丢失区间，回拨可能检不出，过期判定可能复活，见 [R-C2](design.md#对存储提供者的要求清单)。墙钟前跳后被校正回来会停摆相应跳幅，重启不能绕过，没有运维出口；出口归产品。提供者不承诺真实时间偏差上界，也不承诺多个进程间的单调性，各进程分别维护用过的最晚时刻。消费者在 `'unavailable'` 时各操作如何失败，仍由各消费者拥有。
- **绑定与验证范围**：[`bindings.yaml`](bindings.yaml) 有实际断言绑定。它们按各自精确条款、版本和 assumptions 使用，只能证明所列有限范围；绑定不是整包验收或所有时钟行为的认证。回拨、重启后租约、写失败、启动失败、迁移前核对与装卸义务归 [verification.md](verification.md)。进程崩溃模拟不能代替操作系统崩溃、断电或真实系统休眠验证，注入墙钟不能证明真实时钟准确。

## 按当前问题展开

| 当前问题 | 阅读入口 |
| --- | --- |
| 公开根、服务键、限定插件名称、资源拥有/借用与实际关闭 | [共享承诺归属](../../../../architecture/pilots/shared-storage-clock-ownership.md)、[租约提供者 SPEC](../../../../../../packages/infra/clock-lease/SPEC.md) |
| `now()`、写在前的高水位、回拨、续约失败与租约收回 | [实现设计](design.md) |
| 运行中回拨的代价、启动租约窗口与入口等待上界、迁移前只读核对 | [运行中回拨](design.md#运行中回拨每次现读墙钟比对用过的最晚时刻)、[启动租约窗口](design.md#启动时的租约窗口与入口层等钟)、[迁移前核对](design.md#迁移前的只读回拨核对) |
| 实际断言与其有限适用前提 | [绑定表](bindings.yaml) |
| 回拨、重启、失败、装卸与覆盖限制 | [验证义务](verification.md) |

获准采用的终态写回当前承诺拥有者；比较、接受过程与每次验证输出留本工作树 `tmp/`。文件存在、公开接口齐全或局部测试通过均不自行授予更广接受状态。
