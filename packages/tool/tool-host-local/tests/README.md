# tool-host-local 成员测试

本目录维护本提供者的单元、契约和装配测试。测试经包名导入本成员。行为测试的名字以决定编号 `G5` 开头，`pnpm exec vitest run -t "G5 order"` 等前缀可单独运行。

| 文件 | 检查的行为 |
| --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 根入口只导出本地启动协调器与它的三个名字。根入口的源码、产物和声明导入图都不含 Cordis 和任何 `./cordis` 入口 |
| [entry-boundary.spec.ts](entry-boundary.spec.ts) | manifest 不声明 `./cordis`，实际 Node 导入以 `ERR_PACKAGE_PATH_NOT_EXPORTED` 拒绝。本成员以 `workspace:*` 依赖契约包、实现包与 Cordis 定义包 |
| [start-coordinator.spec.ts](start-coordinator.spec.ts) | SPEC 第 1–6 条：返回前的失效使 consume 永久拒绝，之后的新许可也被拒绝；受理之后的失效不影响在途启动；并发的失效与 consume 按提交先后裁定，回复与证据修订号一致；失效提交未知或不可用时不给证据；重送的失效认回原证据，历史操作在后续失效和重建后仍认回，异目标不推进守卫；完整守卫字段变化冲突，开放程序守卫在重建后仍绑定原父调用与范围，属性顺序与额外属性不影响认回；非法守卫、范围形状及程序身份不读写台账；历史失效与排除操作记录缺少必要字段时回复 `unavailable` 且不提交；已生效但回复未知的失效在重建后认回；`inspect` 收回旧许可后才回复 `not-started`，之后的新许可可以受理；未签发或被改动的许可是 `not-issued`；台账不可读是 `unavailable`；受理回复丢失后重送认回；`exclude` 永久排除，已受理的调用 `conflict`；排除别名仍回复首次证据，绑定各自理由，在重建及已提交但回复未知后保持认回与异理由冲突；同启动操作号的两个调用互不影响；他租户主体与缺租户在读记录仓之前 `denied`；另一租户的同名守卫不受失效影响，同失效操作号可在另一租户绑定另一守卫；资格不可读是 `unavailable`；重试上限非法时构造抛出 |
| [start-composition.spec.ts](start-composition.spec.ts) | 协调器在真实 Tool runtime、账本与推进协程下：受理前的失效使调用以 `unavailable` 收场，`effect` 与 `execution` 为 `not-started`，名额释放；受理后的失效不影响在途启动；`recordStart` 的提交失败后，下一次运行从协调器认回受理，绑定只启动一次 |
| [start-authority-conformance.spec.ts](start-authority-conformance.spec.ts) | 契约包 `./testing` 的启动围栏套件（P04）对本地协调器逐条运行，19 项一致性用例全部通过，包括 SA13 的完整守卫异输入冲突、SA14 的排除理由冲突与同输入认回。该套件不需要控制手柄，所以没有不适用用例；表 `NOT_APPLICABLE` 为空，某条用例将来变为不适用会让测试失败 |
| [coordinator-values.ts](coordinator-values.ts) | 测试构造器：租户与主体、固定请求、启动记录、按成员资格放行的资格守卫、协调器、下一次提交失败的记录仓 |
| [module-graph.ts](module-graph.ts) | 导入图遍历工具，读取静态导入、再导出、裸副作用导入和动态 `import()`。各 Tool 包各有一份同样的副本，因为测试不能跨包导入相对路径 |

运行命令为 `pnpm turbo run test --filter=@omne-harness/tool-host-local`。turbo 先构建本包及其依赖，再运行 vitest。测试使用 `@omne-harness/tool/testing` 的非耐久记录仓，不覆盖耐久性、进程崩溃与跨进程装配。

固定输入归 [fixtures](fixtures/index.md)。目录导航见 [index](index.md)。

## 与 Tool 教程的关系

[可运行教程](../../tool/examples/README.md)由 tool 成员拥有，使用公开内存 start authority。这里的 coordinator、start-composition 与 start-authority-conformance 测试运行真实 createLocalStartCoordinator。教程不能替代本包这些组合与提供者检查，二者仍只支持各自的单进程非耐久范围。

在仓库根按教程构建两个成员及其依赖后，执行 `pnpm --filter @omne-harness/tool-host-local run typecheck` 和 `pnpm --filter @omne-harness/tool-host-local run test`。生产宿主、耐久、多进程与断电恢复不在这些命令的证明范围内。

[environment-allocation.spec.ts](environment-allocation.spec.ts) 经公开调度工厂验证 allocated 的只读查询、策略消费、当前资格、并发唯一采用和已释放条目的迟到事实。提供者为非耐久替身。
