# Dynamis 的四个模型

规则归包组规格的[应然设计](../../SPEC.md#应然设计)与[不变式](../../SPEC.md#不变式)。模型在 `models/`，每份配置的预期登记在 [models.json](models.json)，由 [check.py](check.py) 判读，命令是成员目录下的 `pnpm run verify:formal`（要 `TLA2TOOLS_JAR`）。只跑一个模型时加 `-- --models MCPoints` 这样的入口模块名。

有限检查是模型检查，不是归纳证明，也不是源码符合性。每个模型是一个小世界，上界写在它的入口模块（`MC` 开头的那一份）与各配置里。模型假设 fiber 只经登记入口影响别人。租户维度、两棵树之间的传递都不在模型里。

配置的名字里带 `bad-` 的是负控：故意破坏一条规则，预期命中写明的那条性质。带 `witness-` 的是可达性见证：把「到不了某个状态」写成不变式，预期它被打破。其余是正控，预期跑完没有错误。

## Points：登记是一个集合

小世界：5 个 fiber，2 个拓展点，2 个键，每个 fiber 至多两代。一个宿主声明两个点，其中一个的键取自另一个；两对 fiber 各在一个键上撞；一个 fiber 在另一个的作用域里。

| 性质 | 规格规则 | 实现 | 用例 |
| --- | --- | --- | --- |
| `Functional`、`Canonical` | DY-1、DY-4：答案只由现在要哪些 fiber 决定 | `registry.ts` 的 `install` 输出正规次序；`catalog.ts` 的 `ask` 只读登记表 | `order.spec.ts` |
| `Exact` | DY-2：取走只按实例标签 | `registry.ts` 的 `remove` | `registry.spec.ts` |
| `OneInstance` | DY-3：一个 fiber 至多一代在服务 | `registry.ts` 的 `install` 拒绝 `generation-serving` | `registry.spec.ts` |
| `Granted`、`Closed` | 要了的都装得上；作用域与依赖闭合 | 不在本成员：装载归调用方 | 无 |

| 配置 | 规则 | 预期 |
| --- | --- | --- |
| `points-set-conflict` | 集合；同键多项答冲突 | 通过 |
| `points-set-rank` | 集合；同键多项按条目自带的次序 | 通过 |
| `points-cyclic-never` | 依赖成环 | 通过：环上的 fiber 永远装不上 |
| `points-bad-arrival` | 按到达先后选 | `Functional` 违反 |
| `points-bad-first-wins` | 先到的留下，后到的失败 | `Functional` 违反 |
| `points-bad-first-wins-granted` | 同上 | `Granted` 违反 |
| `points-bad-release-by-key` | 按键撤回 | `Exact` 违反 |
| `points-witness-all-live` | 见证：全部装上 | `NotAllLive` 被打破，即可达 |

## Adopt：引用在采用点解析并钉住

小世界：一个点上三份实现（一个键一份，另一个键两家），两份定义各点名一个键，每份实现至多两代，至多两轮同时在跑。

| 性质 | 规格规则 | 实现 | 用例 |
| --- | --- | --- | --- |
| `Pinned` | DY-8：一轮只在一个实例上执行 | `reference.ts` 的 `bound` 五样全对得上才答在 | `reference.spec.ts`、`adopt-walk.spec.ts` |
| `OnlyNamed` | DY-7：一轮只在它点名过的键上执行 | `reference.ts` 的 `resolve` 只试点名的键 | 同上 |

| 配置 | 规则 | 预期 |
| --- | --- | --- |
| `adopt-pin` | 采用点解析并钉住 | 通过 |
| `adopt-single-slot-never-coexist` | 一个点只容一份实现 | 通过：两份定义永远不能同时各用各的 |
| `adopt-bad-bind-at-call` | 每次调用重新解析 | `Pinned` 违反 |
| `adopt-bad-any-fallback` | 点名的没有时拿别的顶上 | `OnlyNamed` 违反 |
| `adopt-bad-single-slot` | 一个点只容一份实现 | `OnlyNamed` 违反 |
| `adopt-witness-coexist` | 见证：两份定义同时各用各的 | `NeverCoexist` 被打破，即可达 |

## Withdraw：撤下一份带副作用的贡献

小世界：3 个 fiber，每个至多两代，至多 3 次调用，至多 1 次突然没了。

| 性质 | 规格规则 | 实现 | 用例 |
| --- | --- | --- | --- |
| `Pinned` | DY-9：一次调用只在一个实例上执行 | `withdraw.ts` 的 `admit` 把调用钉在一个实例上，之后没有改实例的操作 | `withdraw.spec.ts`、`withdraw-walk.spec.ts` |
| `NoOrphan` | DY-9：名下还有在跑的不算撤完 | `withdraw.ts` 的 `complete` 拒绝 `in-flight` | 同上 |
| `NoLateAdmit` | DY-9：正在撤下的不接新的 | `withdraw.ts` 的 `admit` 拒绝 `retiring` | 同上 |
| `PlannedIsClean` | 计划内的撤下不产生未知 | 未知只由 `lost` 产生 | 同上 |
| 每步断言 `StepOK` | DY-10：结局不改写；认不回的保持未知；无关的调用不受影响 | `finish`、`reconcile`、`lost` 的全化 | 同上 |
| `Drains`（活性） | 排空会结束，前提是在途的会收场 | 不在本成员：等待归调用方 | 无 |

| 配置 | 规则 | 预期 |
| --- | --- | --- |
| `withdraw-ok` | 正向 | 通过 |
| `withdraw-live` | 正向，带公平性 | 通过 |
| `withdraw-bad-drop` | 不等在途的就撤 | `NoOrphan` 违反 |
| `withdraw-bad-reroute` | 把在途的挪到别的实例 | `Pinned` 违反 |
| `withdraw-bad-redo` | 把未知的再执行一次 | `Pinned` 违反 |
| `withdraw-bad-admit-draining` | 排空中仍接新的 | `NoLateAdmit` 违反 |
| `withdraw-witness-overlap` | 见证：旧的在排空且有在途，新的已在接 | `NoOverlap` 被打破，即可达 |

## SelfHost：起来先起底

小世界：资产层 3 份 plugin，其中 1 份会带倒进程，1 份是资产层的管理入口；连倒 2 次停在底上。

| 性质 | 规格规则 | 实现 | 用例 |
| --- | --- | --- | --- |
| `DownIsEmpty` | DY-11：倒着的时候没有装上的 | `floor.ts` 的 `crash` 清空装上的 | `floor.spec.ts`、`floor-walk.spec.ts` |
| `FloorHolds`（活性） | DY-11：一再倒下就一再回到「起来了、坏的不在场、管理入口可用」 | `floor.ts` 的 `boot` 只起底；`sweep` 到上限不再补装 | `floor-walk.spec.ts` 只核安全的那一半：次数到上限后装上的保持为空 |
| `NotStuck` | 不会卡在「起来了，但谁也动不了它」 | 不在本成员：管理入口属于底，由调用方守 | 无 |

| 配置 | 规则 | 预期 |
| --- | --- | --- |
| `selfhost-floor-kernel` | 先起底；管理入口在底里 | 通过 |
| `selfhost-bad-all-at-once` | 起来一次带上全部 | `FloorHolds` 违反 |
| `selfhost-bad-manager-in-assets` | 管理入口只在资产层 | `FloorHolds` 违反 |
| `selfhost-bad-manager-in-assets-stuck` | 同上 | `NotStuck` 违反 |
