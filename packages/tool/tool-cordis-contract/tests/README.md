# tool-cordis-contract 成员测试

测试经包名导入本包，不使用模拟容器。

| 文件 | 检查的行为 |
| --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 根入口不导出值。`./testing` 入口的值导出清单，替身声明 `durability: 'none'`，源码、产物和声明的导入图都不含 Tool 实现，产物不加载 Cordis |
| [cordis-entry.spec.ts](cordis-entry.spec.ts) | 21 个键逐对等于对应类的 `static provide`，含 RFC-0012 的 `toolContributionAuthority` 与 `toolGenerations`，以及外层调用方的启动围栏 `toolStartFence`。`./cordis` 的源码、产物和声明都不导入 Tool 实现。清单依赖 Cordis 与契约包。真实 Cordis 4.0.4 下抽象定义可被继承并按键取得，`ToolInstancesService` 返回具名失败而不抛出 |
| [registration-conformance.spec.ts](registration-conformance.spec.ts) | 登记语义套件（IC-3）的自证：对守约替身全过且无不适用用例；20 条用例各在一个只破坏一条规则的登记服务上失败，失败的用例恰好是表中列明的；每条用例至少被一个变体命中；没有控制手柄的夹具把需要手柄的用例报告为不适用并指明手柄 |
| [binding-registry-conformance.spec.ts](binding-registry-conformance.spec.ts) | G7 套件（绑定登记表）的自证：对守约的非耐久登记表全过且无不适用用例；十一个违约变体各恰好让列明的用例失败，每条用例至少被一个变体打红；没有 fiber 控制手柄的夹具把需要手柄的用例恰好报告为不适用（`binding-registry-legal.ts` 列出哪些）。动态性套件骨架按序给出 RFC-0012 十条判据，每条报告不适用并指明手柄 `generations`，用例体归 2.5 |
| [binding-registry-legal.ts](binding-registry-legal.ts) | G7 自证的合法提供者：守约替身与没有 fiber 控制手柄的替身。不是测试文件 |
| [flawed-bindings.ts](flawed-bindings.ts) | G7 自证用的有缺陷登记表：在守约替身的登记表边界上包一层，不设缺陷时与替身同语义，设一个缺陷就破坏一条规则（空 token、序号不递增、同 fiber 同 digest 不认回、冲突覆盖持有者、按键而非按 token 释放、fiber 结束不撤、键忽略资产版本、拒绝报成 unavailable、键不符报成 denied、close 等于释放、租户范围看到全部）。spec 里每个变体列明它让哪些用例失败，`expectEveryCaseIsCaught` 核每条用例至少被一个变体打红。不是测试文件 |
| [testing-source.spec.ts](testing-source.spec.ts) | 套件源码的规则：`src/testing.ts` 没有轮询，唯一的定时等待是夹具给的静默期 `quietMs`；合法提供者都在 `registration-legal.ts`，它不引用 `flawed-registrations.ts`，也不以任何写法点名替身的 `controls`；spec 的 `legal` 表只引用这个文件里的提供者，规则自己的用例证明它拒绝写在 spec 里的提供者 |
| [registration-legal.ts](registration-legal.ts) | 自证的合法提供者：生成的提供者、先做预核验再做最后核验的服务（`preChecked`，违约变体也把它叠在有缺陷的服务上）、核验自身租户的 authority（两个租户与只有一个租户）。不是测试文件 |
| [legal-source-rule.ts](legal-source-rule.ts) | 合法提供者的源码规则，读语法树，与 `tool-contract` 的副本相同，因为测试不能跨包导入相对路径。不是测试文件 |
| [flawed-registrations.ts](flawed-registrations.ts) | 自证用的登记服务：不设缺陷时与替身同语义，设一个缺陷就破坏一条规则。登记服务的规则是自己步骤的顺序，从外面无法破坏，所以变体在这里构造，不叠在替身上。无缺陷时它须通过套件，防止这份副本偏离替身。不是测试文件 |
| [conformance-harness.ts](conformance-harness.ts) | 自证的运行器，与 `tool-contract` 的副本同形，因为测试不能跨包导入相对路径。条款锚点接受 `IC-<编号>` |
| [cordis-entry.spec-d.ts](cordis-entry.spec-d.ts) | `Context` 增补的服务类型、键的字面量类型和 `tool-cordis-contract/call-changed` 的参数；启动围栏服务只有 `invalidate`，启动排序域服务可以充当它 |
| [residency.spec.ts](residency.spec.ts) | 常驻引用 Reader 套件（G7）的自证：守约的分页 Reader 全过；合并跨租户持有者、把中断页报成空页、丢 shape、重复项与不前进的游标各被套件的断言检出（只认 `AssertionError`）。另有 C7 的 Tool 侧定向测试（裁定 https://github.com/nemori-ai/omne-harness-lite/issues/675#issuecomment-6480754440 ）：两个租户各有同名持有者、首次 shape 不同，按各自租户经 Reader 取首次 shape、经登记表的租户读取取当前贡献，再 `planAdoption`，一方 `freeze`、另一方 `advance`；把另一租户的事实交叉代入时两方结论都改变；显式租户缺失或未铸造时登记表读取 `unavailable`，该租户没有同名持有者时拒绝 |
| [module-graph.ts](module-graph.ts) | 导入图遍历工具。各 Tool 包各有一份同样的副本，因为测试不能跨包导入相对路径 |

运行命令分快层 `pnpm turbo run test:fast --filter=@omne-harness/tool-cordis-contract` 与慢层 `pnpm turbo run test:slow --filter=@omne-harness/tool-cordis-contract`。turbo 先构建本包及其依赖，再运行本层的 vitest。`*.spec-d.ts` 的类型检查属于快层。

## 登记套件的自证

套件有四层自证。第一层：套件对守约替身全部通过，没有不适用用例。第二层：违约变体是有一个缺陷的登记服务，每个变体都断言“失败的用例恰好是列明的几条”，所以一条永不失败的用例会被发现。第三层：守约但不同的提供者必须全过（spec 的 `legal` 表：先做预核验再做最后核验的服务、只认本租户 authority 的核验、不给第二个租户的夹具，后者只有两条跨租户用例不适用）。第四层：回答表 `registrationAnswers` 的 `register` 行没有进度行也没有丢失回复行（IC-3：同步核验作答，无法判定时拒绝为 `unavailable`），所以生成的边界提供者原样透传，没有手柄，用例读一次即完整；唯一的手柄 `endFiber` 的完成契约是“fiber 已结束且它的登记已撤，对之后的 `register` 与 `listing` 可见”，在撤除落地前就 resolve 的夹具让 R17、R18 失败（`lateEndFiber`）。拒绝之后有一次定时观察（R11），长度是夹具成员 `quietMs`（缺省 25 毫秒），用来看目录有无迟到的写入，不是对答复的轮询。用例编号 R1–R20 在 spec 的 `NAMES` 里，顺序与套件相同。条款见 [cordis](../docs/cordis.md#登记输入与撤除协议)（IC-3）。每个缺陷是 [flawed-registrations.ts](flawed-registrations.ts) 里的一个开关，spec 里每个变体列明它让哪些用例失败。

套件里承载独立规则的断言都由一个违约变体负责：删掉或削弱该断言，自证就变红。类型收窄的断言由编译器守护，对应表里写作“类型收窄，由编译器守护”。这一点用断言删除变异检查，工具和逐条结果不随仓库保存。

登记套件的几条规则：

- 认回比较 authority 与整份执行引用（代）。认回的回执取当前这一代，另一代或另一份资格对同一身份回 `conflict`，不接管，也不破坏原登记（R3、R4、R5）。
- 登记写入与最后一次核验在同一个同步步骤里。核验在飞行中被撤回的登记不写入；前面多做几次核验是允许的，最后一次必须在写入之前（R11、R13、R14、R15）。
- 一个租户的 authority 登记另一个租户的发布被拒，两个租户各用自己的 authority 分别登记，互不冲突（R19、R20）。夹具不给第二个租户时这两条报告不适用，手柄名是 `otherTenant`。
- 另有守约的登记服务：先做若干次预核验再做最后一次核验、核验识别租户的服务，它们必须全过。

## 断言与违约变体的对应

下表按断言列出：删掉该断言（或把它削弱）后，自证里哪些违约变体不再失败，也就是由哪些变体负责它。每一行是套件里一条断言语句，按源码顺序排列，不写行号以免随编辑漂移。语句同时是动作的，表里取的是只去掉判断、保留动作的结果。对应由断言删除变异产生（工具、逐条日志与前后哈希不随仓库保存），改动套件后须重新运行变异检查，再更新本表。

### registration (R)

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `if ('failure' in outcome) assert.fail(`${what}: expected success, got ${JSON.stringi` | 类型收窄，由编译器守护 |
| `if ('ok' in outcome) assert.fail(`${what}: expected a failure, got a registration`)` | 类型收窄，由编译器守护 |
| `if ('error' in ended) assert.fail(`register: the call rejected instead of answering:` | 类型收窄，由编译器守护 |
| `assert.notDeepEqual(other, fixture.tenant, 'the fixture names one tenant twice')` | must name another tenant, or the cross-tenant cases fail and say why；cordis: must name another tenant, or the cross-tenant cases fail and say why |
| `assert.deepEqual(registration.receipt.execution, published)` | the receipt names another execution；cordis: fails exactly the listed cases under: the receipt names another execution |
| `assert.ok(registration.receipt.registration.length > 0, 'the receipt names a token')` | the token of the receipt is empty；cordis: fails exactly the listed cases under: the token of the receipt is empty |
| `assert.equal(typeof registration.release, 'function')` | fails the first case for a receipt whose release is not a function；cordis: fails the first case for a receipt whose release is not a function |
| `s.recalls(again, first)` | a recall that comes alone answers another token；cordis: fails exactly the listed cases under: a recall that comes alone answers another token |
| `s.recalls(registration, first)` | a recall that meets another register in flight answers another token；cordis: fails exactly the listed cases under: a recall that meets another register in flight answers another token |
| `assert.deepEqual(await again.release(), { removed: true })` | the first release removes the entry and answers removed false；cordis: fails exactly the listed cases under: the first release removes the entry and answers removed false |
| `assert.deepEqual(await first.release(), { removed: false })` | a repeated release removes again；the second release answers removed true；cordis: fails exactly the listed cases under: a repeated release removes again（另 1 个） |
| `assert.equal(failure.kind, 'conflict')` | another handle is refused as unavailable；cordis: fails exactly the listed cases under: another handle is refused as unavailable |
| `s.recalls(recalled, first)` | a register that recalls takes a new token；a recall that comes alone answers another token；cordis: fails exactly the listed cases under: a register that recalls takes a new token（另 1 个） |
| `assert.equal(failure.kind, 'conflict')` | another qualification is refused as unavailable；cordis: fails exactly the listed cases under: another qualification is refused as unavailable |
| `s.recalls(recalled, first)` | a register that recalls takes a new token；another qualification removes the registration it conflicts with；a recall that comes alone answers another token（另 3 个） |
| `if ('ok' in outcome) assert.deepEqual(outcome.ok.receipt.execution, moved)` | a recall at another generation answers the receipt of the first；cordis: fails exactly the listed cases under: a recall at another generation answers the receipt of the first |
| `s.recalls(recalled, first)` | a register that recalls takes a new token；another qualification removes the registration it conflicts with；another generation takes the registration over（另 5 个） |
| `assert.equal(failure.kind, 'conflict')` | another fiber is refused as unavailable；cordis: fails exactly the listed cases under: another fiber is refused as unavailable |
| `s.recalls(recalled, first)` | a register that recalls takes a new token；a recall that comes alone answers another token；cordis: fails exactly the listed cases under: a register that recalls takes a new token（另 1 个） |
| `assert.deepEqual(await original.release(), { removed: true })` | the first release removes the entry and answers removed false；cordis: fails exactly the listed cases under: the first release removes the entry and answers removed false |
| `assert.notEqual(successor.receipt.registration, original.receipt.registration)` | the token of the receipt is empty；cordis: fails exactly the listed cases under: the token of the receipt is empty |
| `assert.deepEqual(await original.release(), { removed: false })` | a late release answers removed true and keeps the successor；cordis: fails exactly the listed cases under: a late release answers removed true and keeps the successor |
| `s.recalls(recalled, successor)` | a recall that comes alone answers another token；a recall after any release answers another token；cordis: fails exactly the listed cases under: a recall that comes alone answers another token（另 1 个） |
| `assert.deepEqual(await successor.release(), { removed: true })` | a late release mutes the successor；the first release removes the entry and answers removed false；cordis: fails exactly the listed cases under: a late release mutes the successor（另 1 个） |
| `assert.deepEqual(await first.release(), { removed: true })` | the first release removes the entry and answers removed false；cordis: fails exactly the listed cases under: the first release removes the entry and answers removed false |
| `assert.deepEqual(await first.release(), { removed: false })` | the second release answers removed true；cordis: fails exactly the listed cases under: the second release answers removed true |
| `assert.deepEqual(await first.release(), { removed: false })` | the third release answers removed true；cordis: fails exactly the listed cases under: the third release answers removed true |
| `assert.notEqual(again.receipt.registration, first.receipt.registration)` | the token of the receipt is empty；cordis: fails exactly the listed cases under: the token of the receipt is empty |
| `assert.equal(spy.observed(), 0, 'the directory used the handle of the work')` | a release ends the observation of the work；cordis: fails exactly the listed cases under: a release ends the observation of the work |
| `assert.deepEqual(listing.call(fixture), [])` | a refused check is written and taken back；cordis: fails exactly the listed cases under: a refused check is written and taken back |
| `assert.ok('failure' in outcome, 'a refused check registers')` | 类型收窄，由编译器守护 |
| `assert.equal(outcome.failure.kind, 'denied')` | a denied refusal is reported as unavailable；cordis: fails exactly the listed cases under: a denied refusal is reported as unavailable |
| `assert.deepEqual(listing.call(fixture), [])` | a refused check writes the entry after the answer, and keeps it；a refused check writes the entry 10 ms after the answer, and keeps it；cordis: fails exactly the listed cases under: a refused check writes the entry after the answer, and keeps it（另 1 个） |
| `assert.deepEqual(await s.refusal(published, `refusal ${refusal.kind}`), refusal)` | every refusal of the check is denied；a denied refusal is reported as unavailable；cordis: fails exactly the listed cases under: every refusal of the check is denied（另 1 个） |
| `assert.equal(failure.kind, 'denied')` | a refused recall answers conflict instead of the refusal；a denied refusal is reported as unavailable；cordis: fails exactly the listed cases under: a refused recall answers conflict instead of the refusal（另 1 个） |
| `assert.deepEqual( checkedAgainst.call(fixture).at(-1), [], 'the en` | the entry is written before the check；a refusal in flight leaves the entry that was written before the check；cordis: fails exactly the listed cases under: the entry is written before the check（另 1 个） |
| `assert.deepEqual(listing.call(fixture), [registration.receipt.registration])` | the token of the receipt is empty；cordis: fails exactly the listed cases under: the token of the receipt is empty |
| `assert.deepEqual( atCall, [outcome.ok.receipt.registration],` | the token of the receipt is empty；a register yields between the test and the write；registers that meet in flight all conflict, so none registers（另 5 个） |
| `assert.equal(outcome.failure.kind, 'stale-publication')` | a withdrawal in flight is answered denied by the final check；cordis: fails exactly the listed cases under: a withdrawal in flight is answered denied by the final check |
| `assert.deepEqual(listing.call(fixture), [])` | a refusal in flight leaves the entry that was written before the check；cordis: fails exactly the listed cases under: a refusal in flight leaves the entry that was written before the check |
| `assert.equal(won.length, 1, 'exactly one registration stands')` | registers that meet in flight all conflict, so none registers；cordis: fails exactly the listed cases under: registers that meet in flight all conflict, so none registers |
| `assert.equal(lost !== undefined && 'failure' in lost ? lost.failure.kind : null, 'conflict` | another fiber is refused as unavailable；cordis: fails exactly the listed cases under: another fiber is refused as unavailable |
| `assert.deepEqual(await original.release(), { removed: false })` | a late release answers removed true and keeps the successor；cordis: fails exactly the listed cases under: a late release answers removed true and keeps the successor |
| `s.recalls(recalled, successor)` | a register that recalls takes a new token；a recall that comes alone answers another token；a recall after any release answers another token（另 3 个） |
| `assert.notEqual(two.receipt.registration, one.receipt.registration)` | the token of the receipt is empty；cordis: fails exactly the listed cases under: the token of the receipt is empty |
| `assert.deepEqual(await two.release(), { removed: true })` | the release of another tenant removes nothing；cordis: fails exactly the listed cases under: the release of another tenant removes nothing |
| `s.recalls(recalled, one)` | a recall that comes alone answers another token；a recall after any release answers another token；a release rewrites the receipt of the other tenant, and removes by identity（另 3 个） |
| `assert.deepEqual(await one.release(), { removed: true })` | a release mutes the registration of the other tenant；cordis: fails exactly the listed cases under: a release mutes the registration of the other tenant |

