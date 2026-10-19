# tool-host-local 内部架构

本页说明本地启动协调器（G5）的记录与先后。行为规则归 [SPEC](../SPEC.md#本地启动协调器g5)，公共协议归契约包的 [P04](../../tool-contract/SPEC.md#p04-实际发起围栏)。宿主时钟（G4）、绑定登记表（G7）、Cordis 插件与跨进程的启动排序域尚未交付。五档支持范围见[包入口](../README_ZH.md#支持范围)。

## 模块与依赖

本包只有一个实现模块 [start-coordinator.ts](../src/start-coordinator.ts)。它依赖 `@omne-harness/tool` 的记录仓端口 `ToolLedgerStore`、`host` 域、`recordKey`、`isTenantShape` 与 `canonicalDigest`，依赖 `@omne-harness/tool-contract` 的类型与身份解码。它不依赖 Cordis。

## 记录

每个租户一个 `host` 域，键是 `start-coordinator`。域里的每条记录是一个 `HostRecord`，值由本模块写入和校验，记录仓不解释它。键是各部分的 JSON 文本，所以含分隔符的身份不会落到别的键。

| 记录 | 键 | 内容 |
| --- | --- | --- |
| 守卫 | `guard:[拥有者, 资源]` | 当前修订号、最后一次失效的操作与证据 |
| 许可 | `permit:[调用, 启动]` | 该启动当前许可的摘要。新许可替换它，受理、拒绝与 `inspect` 收回它 |
| 受理 | `acceptance:[调用, 启动]` | 许可摘要、执行者回执与受理证据 |
| 启动拒绝 | `rejection:[调用, 启动]` | 原因与拒绝证据 |
| 整次调用的排除 | `rejection:[调用]` | `exclude` 的原因、操作与证据 |
| 排除标记 | `exclusion:[调用, 启动]` | `inspect` 回复 `not-started` 时的证据 |

## 先后

每个操作在进程内串行区里读域、决定、按域修订号条件提交，提交后才回复。先后由记录仓的条件提交裁定：按旧修订号做出的决定提交失败，重读后重新决定。串行区只让同一进程内的操作不必为修订冲突重试，它不是先后正确的前提。证据的 `revision` 是那次提交的域修订号，所以两条证据的修订号给出它们的先后。`consume` 与 `invalidate` 并发时，较早提交的一方决定结果：失效先提交则启动被拒绝，受理先提交则启动在途。

本包只测试了一个进程内的协调器。两个进程共用一个耐久记录仓时，条件提交仍然阻止两个写者同时成功，但这种装配没有验证，所以本包不声明跨进程的启动保证。
