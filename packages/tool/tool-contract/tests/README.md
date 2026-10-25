# Tool 成员测试

本目录维护单元、契约和类型测试，以及 `./testing` 一致性套件的自证。测试经包名导入本成员。除自证用的非耐久替身外，不使用模拟提供者。

| 文件 | 检查的行为 |
| --- | --- |
| [public-entry.spec.ts](public-entry.spec.ts) | 根入口的值导出清单，根入口不导出也不提及作者读取函数与槽类型，`./binding` 入口只导出这两个读取函数、`readOwnSlot` 及其类型。`./testing` 入口只导出套件、夹具、替身和不适用判别，名字都不在根入口，每个替身声明 `durability: 'none'`。根入口、`./binding` 入口与 `./testing` 入口的源码、产物和声明导入图都不含 Cordis、任何 `./cordis` 入口或其他 Tool 包。清单不依赖 Cordis 与其他 Tool 包；完整生产安装闭包不含 Cordis |
| [testing-primitives.spec.ts](testing-primitives.spec.ts) | `./testing` 的读取原语按提供者作者的用法检查：`isProgress` 把 `null`、`{ failure: null }` 等不是答复的值读作终局而不抛异常；`finalAnswer` 遇到进度而没有完成手柄时是断言失败，夹具缺手柄时报告的不适用名是夹具成员名，进度期间与手柄之后的终局按 `view` 比较、返回答复本身；`completionOf` 按名字取成员并带参数调用；`crossTenantAnswers` 在答复任一层的值和键里（含 symbol 键、`Map`、`Set`、`Error`）找到识别值，短于 8 的识别文本只按整段相等查，外租户提交的文本是回显、只回显一部分的识别值仍被查到，结构识别值按深相等查、外租户提交过的不查，忽略空的识别值，数组下标不算文本，读自引用的答复不死循环 |
| [identity.spec.ts](identity.spec.ts) | 八个品牌身份解码函数各自接受合法文本，并对非字符串、空串、超长和非法字符返回具名失败 |
| [result-policy.spec.ts](result-policy.spec.ts) | 默认结果政策的采用摘要可由规则集复算，规则集不可原地修改。判定只接受文本与共享引用块，拒绝原因取自规则集，整结果判定也检查卸载摘要与附件 |
| [contract.spec.ts](contract.spec.ts) | 资产正文端口的判定、资产引用（`references` 把正文里的组合引用记为按类别与名字的引用，不把它们当成必需依赖）、伪造文档拒绝和固定后的引用 |
| [body-programmable.spec.ts](body-programmable.spec.ts) | 资产正文的 `programmable` 只接受布尔值，只有 `true` 产生声明项 |
| [definition-judgment.spec.ts](definition-judgment.spec.ts) | 定义判定：命令重名、空白说明、缺参数说明、字符串 `programmable` 与未知字段被拒绝并给出字段，省略的 `programmable` 保持省略，P15 设置路径规则 |
| [request-judgment.spec.ts](request-judgment.spec.ts) | 固定请求判定：合法直接请求与已知不可用目标被接受并冻结；函数工具带命令、多命令工具缺命令或命令未声明、上限超范围、未知字段、非布尔 `complete`、非法定义与非对象都被拒绝并给出字段 |
| [release-judgment.spec.ts](release-judgment.spec.ts) | 交付解除输入判定：消费位置与交接证据是封闭值，多出字段、函数字段、空串、缺证据与非对象被拒绝并给出字段，读取时抛出的值是 `unreadable` |
| [state-judgment.spec.ts](state-judgment.spec.ts) | 状态判定：阶段与前后台分支，后台不接受 `no-response` 或 Ask，占位与 call 一致，`unavailable` 的效果是 `not-started` |
| [catalog.spec.ts](catalog.spec.ts) | 呈现摘要只把布尔 `true` 读作可编程许可。可用性判定列出全部未满足的条件 |
| [dynamics.spec.ts](dynamics.spec.ts) | RFC-0012 的纯函数：`deriveDefinition` 从资产取 name、adoption、requiredCapabilities 与 programmable，从实现取形状、description、backgroundAllowed 与 declarations；`shapeOf`/`sameShape` 只看 name、kind、规范化 schema、vocabulary 身份与按名排序的命令表；`sameSourceLayer`/`sameBindingKey` 按层与身份文本比较；`planAdoption` 按 SPEC 采用点判定表逐行（七行，含重装结果的每个分支：loaded/recognized 保持、missing/rejected 在不同形胜出者下冻结、暂时与撤权给替换件、conflict 按持有者是否可用）；`refreshAvailability` 只有可用、路由、不可用；`foldResident` 只增不减、同能力一次、shape 与定义一致 |
| [author-registration.spec.ts](author-registration.spec.ts) | 作者注册只收实现侧字段，产出 `ToolImplementation { facts }`；资产侧字段（name、adoption）出现在实现输入里以 `unknown-field` 拒绝；装载器用 `deriveDefinition` 与资产治理派生定义，`programmable` 省略则省略。空命令表、非法名称、返回模式与作者种类不符、程序契约不符和伪造句柄在构造时被拒绝。`./binding` 入口的 `readToolOperation` 与 `readToolRegistration` 读出句柄的作者与注册的操作表，未标记的值读作 `undefined`。等待契约不装载 schema，Ask 不接受到期 |
| [parameter-codec.spec.ts](parameter-codec.spec.ts) | 参数 codec：重复键、`complete=false`、半截 JSON 和超预算都不产生参数值。采用摘要覆盖预算。参数判定：两份文本都解析，任一失败指明是哪份，`complete=false` 不解析，坏输入或坏预算是 `shape` 拒绝 |
| [result-rendering.spec.ts](result-rendering.spec.ts) | 结构化判定：带 `content` 的普通对象对普通作者仍是普通值。普通返回按程序编码填 `data`，渲染失败不抛出 |
| [result-projection.spec.ts](result-projection.spec.ts) | `projectToolResult`：附件身份数量不等、重复或与已有块冲突时拒绝。地址文本使用固定前缀和 JSON 定位 |
| [start-authority-conformance.spec.ts](start-authority-conformance.spec.ts) | 启动围栏套件（P04）的自证：对守约替身全过且无不适用用例；每个违约变体让列明的用例失败；每条用例至少被一个变体命中 |
| [start-fence-conformance.spec.ts](start-fence-conformance.spec.ts) | 外层调用方的启动围栏套件（P04）的自证：对守约替身全过且无不适用用例；违约变体包括只回证据不失效、围栏与启动排序域分属两个排序域、失效追溯已受理的启动、失效后拒绝一切启动、重送当作新操作、一个租户的围栏移动所有租户的守卫、不核失效资格、拒绝时区分真守卫与不存在的守卫，每个变体让列明的用例失败；围栏视图只有 `invalidate` |
| [start-authorization-conformance.spec.ts](start-authorization-conformance.spec.ts) | 授权消费点套件（P04）的自证，形式同上：变体包括忽略绑定的许可、忽略撤权、先消费再再核、撤权追溯已受理的启动、每次 consume 都记新消费、not-started 也消费许可；另验授权替身的受理记录冻结 permit 的守卫并带所消费的许可引用 |
| [result-receiver-conformance.spec.ts](result-receiver-conformance.spec.ts) | 结果接收端口套件（结果推送与保存）的自证，形式同上：变体包括证据不归冻结的消费拥有者、每次推送都给新回执、异内容当作已保存、保留调用方的原对象、租户取自 access 而不取自引用、认回键不含租户、非法引用答 `denied`、不核纯关系表、忽略 `signal`、不守租户容量、所有租户共用一个容量桶、任何位置都当作有原消费关联、调用不绑定原位置 |
| [result-delivery.spec.ts](result-delivery.spec.ts) | `judgeToolDelivery` 按纯关系表的顺序返回第一个失败：未铸造的租户、非法引用、其他租户的引用、account 键与修订不符、账目 subject 不是原调用；合法输入原样返回 |
| [result-delivery.spec-d.ts](result-delivery.spec-d.ts) | 结果推送、启动围栏视图与受理记录的正负编译用例：push 的输入与回执形状，两种认回键，载荷不另带租户，键与载荷分支不能交叉，生产者种类只能是 `tool`，背压资源是封闭集合，围栏只有 `invalidate` 且启动排序域可以充当围栏，authorization 形状的许可引用与消费事实可以直接赋给 Tool 的许可类型 |
| [start-fence-legal.ts](start-fence-legal.ts)、[start-authorization-legal.ts](start-authorization-legal.ts)、[result-receiver-legal.ts](result-receiver-legal.ts) | 三个新套件的合法提供者：只有一个租户、不给 `settle`、没有无资格主体 `strangerAccess`、不绑定授权许可（全部用例不适用）、只登记一个消费位置、不告知租户容量。只从替身夹具去掉手柄，不调替身的控制手柄。不是测试文件 |
| [environment-conformance.spec.ts](environment-conformance.spec.ts) | 环境套件（P03）的自证，形式同上。另验：没有控制手柄的夹具把需要手柄的用例报告为不适用并指明手柄，其余用例仍通过 |
| [executor-binding-conformance.spec.ts](executor-binding-conformance.spec.ts) | live-only 执行者绑定套件（P05、P07）的自证，形式同上，含不适用报告 |
| [output-custody-conformance.spec.ts](output-custody-conformance.spec.ts) | 输出保管套件（P05）的自证，形式同上，含不适用报告；替身复制进出的字节 |
| [clock-conformance.spec.ts](clock-conformance.spec.ts) | 时钟套件（P07）的自证，形式同上，含不适用报告 |
| [decision-bridge-conformance.spec.ts](decision-bridge-conformance.spec.ts) | 决策桥套件（P06、P12）的自证，形式同上，含不适用报告 |
| [resource-responses-conformance.spec.ts](resource-responses-conformance.spec.ts) | 资源应答套件（P06、P12）的自证，形式同上，含不适用报告；另验提供者格式的期限 |
| [external-association-variants.ts](external-association-variants.ts) | 决策桥与资源应答共有的 21 条用例（S1–S21）的违约变体，叠在两个替身的共有调用上。含重送规则的违约：`ensure`、`invalidate` 在终局之后退回丢失回复，丢失回复期间重送答出与之后落地不同的终局。不是测试文件 |
| [external-association-legal.ts](external-association-legal.ts) | 同两个套件的合法提供者与生成的边界提供者（`externalGenerated`）：先答 `commit-unknown`、落地时才向替身要操作的延迟提供者（自带 `hold` 与 `excludeDeferred`），对未见过的操作答 `excluded` 的围栏提供者。只包装端口方法与自己定义的手柄，不调替身的控制手柄。不是测试文件 |
| [environment-legal.ts](environment-legal.ts) | 环境套件的合法提供者与手柄先于落地的夹具：生成的提供者，真正延迟分配的提供者（先答 `pending` 或 `unknown`，在下一拍或 `settle` 时才向替身要分配，自带 `hold` 与 `excludeDeferred`），首答 `pending` 的拒绝，先答 `pending` 的释放，只有一个租户的替身。不是测试文件 |
| [start-authority-legal.ts](start-authority-legal.ts)、[executor-binding-legal.ts](executor-binding-legal.ts)、[output-custody-legal.ts](output-custody-legal.ts)、[clock-legal.ts](clock-legal.ts)、[decision-bridge-legal.ts](decision-bridge-legal.ts)、[resource-responses-legal.ts](resource-responses-legal.ts) | 其余套件的合法提供者，以及违约变体与它们共用的构造函数（叠在替身端口上的 `variant`、生成的提供者 `generated`、把共有调用的提供者变成本端口夹具的 `makeShared`）。各 spec 的 `legal` 表只按名字引用这些文件里的提供者。不是测试文件 |
| [legal-source-rule.ts](legal-source-rule.ts) | 合法提供者的源码规则，读语法树：`controlReads` 找出合法文件里以任何写法点名替身控制手柄的地方（属性读取、可选调用、解构、字符串下标、装着名字的字符串），`inlineLegalProviders` 找出 spec 里 `itPassesLegal`、`itNeedsTheHandle` 的表中不是取自合法文件的提供者，以及由 spec 自己的函数调用给出的表、行或展开项。合法文件从非合法测试模块只能导入一份白名单里的值（`tool-values.ts` 的 `evidence`，`conformance-harness.ts` 的 `turns`、`keep`、`later`），否则 `controlReads` 报告这条导入；类型导入和包入口不受限。`tool-cordis-contract` 有一份同样的副本。不是测试文件 |
| [resend-violators.ts](resend-violators.ts) | 重送规则的两类违约，包在端口的一个方法上：终局之后退回进度（`regressesAfterFinal`），进度期间重送答出与之后落地不同的终局（`answersAnotherFinalDuringProgress`）。不是测试文件 |
| [conformance-harness.ts](conformance-harness.ts) | 自证的运行器：每条用例用新夹具，结果分通过、不适用、断言失败；用例崩溃不算失败，会让测试报错。另有：逐变体核对失败集（`itFailsExactly`）、逐合法提供者核对失败集为空且不适用集恰为所列（`itPassesLegal`）、按“用例实际调用了手柄”求出需要手柄的用例并核对无手柄时恰好是它们不适用（`itNeedsTheHandle`，不靠手写清单）、把夹具的一个手柄改成先 resolve、三拍后才开始工作（`resolvesEarly`，手柄先于落地的夹具）。夹具有意不等待的迟到工作经 `keep`（或三拍后启动的 `later`）登记，用例结束时一并等到；迟到工作拒绝时这条用例记为断言失败，不留下未处理的拒绝，也不延到下一条用例 |
| [generated-provider.ts](generated-provider.ts) | 按回答表生成的端口边界提供者（`maskedPort`）：遮住新操作每个方法的首答，用表中的每种进度与丢失回复，并在夹具的完成手柄 resolve 时揭开。它只包装端口方法，不碰替身的控制手柄。不是测试文件 |
| [testing-source.spec.ts](testing-source.spec.ts) | 套件源码的规则：`src/testing-*.ts` 没有 `askUntil`、轮询和 `QUIET_MS` 常量，唯一的定时等待是夹具给的期限（`within` 的 `milliseconds`、`quietMs`、`waitMs`、`readDeadlineMs`）；构造合法提供者的文件（`*-legal.ts`、`generated-provider.ts`）以任何写法都不点名替身的 `controls`、`hold`、`holdStop`、`excludeDeferred`、`rejectNext`、`failNext`、`dropNextAnswer`、`blindInspection`，只定义自己的同名手柄；各 spec 的合法表只引用合法文件里的提供者，各 spec 不用替身的 `controls`。规则自己的用例（“the source rule of the legal providers”一组）证明它拒绝已知的绕过写法：解构、改名解构、别名、可选调用、字符串下标、装着名字的字符串、模板下标、取替身的 `controls`、从非合法测试模块导入的辅助函数或名字，以及合法表里写在 spec 中的提供者、spec 自己的函数返回的行与表 |
| [tool-values.ts](tool-values.ts) | 契约函数测试用的合法值构造器，不是测试文件 |
| [public-api-names.spec-d.ts](public-api-names.spec-d.ts) | 已接受契约的 167 个类型名都能从根入口导入。名单从迁移前的 public-api 机械生成，拆包时 `ToolConfiguration` 与 `ToolDependencies` 移到 `@omne-harness/tool`。已实现的契约函数也能从根入口导入，并符合已接受的签名；作者读取函数与槽类型从 `./binding` 入口导入 |
| [contract.spec-d.ts](contract.spec-d.ts) | 公开类型的负编译用例，例如品牌身份不能互换、后台收场不接受 `no-response`、Ask 没有 deadline |
| [module-graph.ts](module-graph.ts) | 导入图遍历工具，读取静态导入、再导出、裸副作用导入和动态 `import()`。各 Tool 包各有一份同样的副本，因为测试不能跨包导入相对路径 |

运行命令分快层 `pnpm turbo run test:fast --filter=@omne-harness/tool-contract` 与慢层 `pnpm turbo run test:slow --filter=@omne-harness/tool-contract`。turbo 先构建本包及其依赖，再运行本层的 vitest。`*.spec-d.ts` 的类型检查属于快层。`pnpm --filter @omne-harness/tool-contract typecheck` 单独检查全部测试源码。现有测试不覆盖独立执行、等待、控制、结果保管或恢复的实现；一致性套件的自证只用内存替身，不证明耐久。Cordis 定义的测试在 `tool-cordis-contract`。这些行为实现后须补齐验证，义务见 [verification](../verification/index.md)。

## 一致性套件的自证

每个套件（`@omne-harness/tool-contract/testing`）有五层自证。

1. 套件对守约替身全部通过，没有不适用用例。
2. 违约变体是守约替身加一个测试内的覆盖，只破坏一条规则，不导出。每个变体都断言“失败的用例恰好是列明的几条”，所以一条永不失败的用例会被发现；每条用例至少被一个变体命中，用 `expectEveryCaseIsCaught` 检查。失败的用例集合由 `itFailsExactly` 逐变体核对，标题带完整的变体名。
3. 承载独立规则的断言各由一个违约变体负责：删掉或削弱该断言，第二层就变红。类型收窄的断言由编译器守护，对应表里写作“类型收窄，由编译器守护”。这一层用断言删除变异证明，逐条结果、日志与前后哈希不随仓库保存。套件里把几条规则写在一条语句上的，已拆成各自带说明的断言。
4. 守约但与替身不同的提供者必须全过，各 spec 的 `legal` 表列出契约允许的类别：自表生成的提供者（首答每种进度、之后各种终局，包括被遮住的拒绝与排除）；真正延迟的提供者（环境：首答 `pending` 或 `unknown`，在下一拍或 `settle` 时才分配；外部对端：首答 `commit-unknown`，落地时才向替身要操作；二者自带 `hold` 与 `excludeDeferred`）；首答丢失回复的输出保管；围栏式的 `excluded`；合并就绪事实的执行者；首答 `pending`、之后读当前进度的停止；首答 `pending` 的拒绝与释放；先做预核验再做最后核验的登记服务；不带守卫的 permit；直接拒绝已撤回或已排除的 permit、已受理启动的第二张 permit、已排除调用与外租户的 prepare 的启动围栏；把过期 consume 答成 `not-started`、inspect 另给拒绝证据的启动围栏；自带 permit、先判 permit 而把另一输入答成 `invalid` 的执行者绑定；每次答 `prepared` 都给新重连能力的环境；只有一个租户的夹具（只有跨租户用例不适用）；核验自身租户的 authority。每一行断言“失败集为空，不适用集恰为所列”。这一层防止套件把契约允许的做法判成违约。
5. 回答模型的自证。每个端口的回答表（`*Answers`）由条款推出，套件只经 `finalAnswer` 与 `resendRecalls` 读取答复，跨租户的比较只经 `crossTenantAnswers`。生成的提供者在端口边界上遮住首答，不借替身的控制手柄，所以能在替身从不延迟的地方延迟。不给完成手柄时，需要手柄的用例恰好不适用，没有一条通过（`itNeedsTheHandle`）；手柄在工作落地前就 resolve 的夹具让读取落地状态的用例失败（各 spec 的 `lateSettle` 与 `lateHandles` 行，失败的都是“手柄之后只读一次”的用例）。`finalAnswer` 在首答是进度时，先在进度期间再问一次（重送或读取），再调用手柄、最后问一次：进度期间答出的终局必须与之后落地的相同，所以“进度期间重送答出另一个终局”的违约，在每个端口上由经过这个原语的用例抓住。

用例编号在各 spec 的 `NAMES` 里，顺序与套件相同，由测试核对。启动围栏视图、授权消费点与结果接收端口三个套件已有第一、二、四层自证；第三层的断言删除变异尚未运行，下文的对应表不含这三个套件。条款与能力的对应见 [coverage](../verification/README.md#端口一致性套件)，用例名见 spec，每个变体让哪些用例失败写在变体旁边，本页不抄一份。

几条跨套件的规则及其自证：

- 夹具带第二个租户的 `otherAccess` 时，每个有租户记录的套件有跨租户用例：真实记录与不存在的记录对另一租户的答复同类（成功或同一种失败，两边成功时 kind 也相同），对真实记录的答复里任何一层的值和键都不带出该记录的识别值（本租户的 `TenantId`、组织文本与账户文本，回执与证据的 `record` 和 `digest`，用例另给的本租户操作号等）：先去掉外租户自己提交的值（`submitted`），再做等值检查，长度不小于 8 的识别文本另做子串检查。自己的记录事后不变。这些都经 `crossTenantAnswers` 读取：首答查一次；首答是进度时调用完成手柄，再读两边，再比一次、再查一次。夹具没有 `otherAccess` 时这些用例不适用，手柄名是 `otherAccess`；夹具把同一个租户给了两次时用例失败，各套件有一条测试证明。
- 首个答复可以是回答表里的进度或丢失回复（`pending`、`unknown`、`accepted`、`commit-unknown`）：用例经 `finalAnswer` 调用推进手柄（`settle`、`completeStop` 一类）取得最终答复，没有手柄则不适用，不判失败，不轮询。手柄的完成契约是：只在延迟工作落地且对端口的每次读取可见之后才 resolve。事实按条数判，不按批数判。
- 同一身份换了动作或输入，回 `conflict` 且没有效果（P01）：外部对端的共有用例 S18–S21，资源应答的 RX16，环境的 E14、E15，启动围栏的 SA13、SA14，执行者绑定的 B20、B21，输出保管的 C10、C11，登记的 R3、R4。守约替身的操作账本比较动作种类与输入摘要（登记另加 authority 与资格）。
- 执行者绑定的替身核验 permit 的调用与启动，另一调用、另一启动、另一租户的 permit 被拒（B4–B6）。
- 启动围栏的 permit 没有守卫时，SA4、SA5、SA7、SA12、SA13、SA17 报告不适用（手柄 `guard`），其余用例照常检查；有自证：没有守卫的守约提供者全过且恰有这六条不适用，没有守卫又违约的提供者在 SA2、SA3 上失败而这六条仍不适用。
- 执行者绑定读取事实的期限来自夹具的 `readDeadlineMs`，有自证：较晚的事实在较短的期限下使 B3 失败，期限提高后通过。
- 夹具不带控制手柄时，需要手柄的用例报告不适用并指明手柄名，不需要的用例照常通过，各套件有自证。

## 回答模型的不变量与证明

下表列出回答模型的八条不变量，以及证明每条的测试。“每个套件”指环境、启动围栏、执行者绑定、输出保管、时钟、决策桥、资源应答（本包）和登记（`tool-cordis-contract`）。

| 不变量 | 内容 | 证明的测试 |
| --- | --- | --- |
| I1 | 用例只经 `finalAnswer`（首读）与 `resendRecalls`（后续读）读取答复，跨租户用例只经 `crossTenantAnswers` 读取外租户的答复；进度与丢失回复的划分只在每个端口的回答表里，每行引用条款；源码没有 `askUntil` 与轮询，唯一的定时等待是夹具给的期限 | [testing-source.spec.ts](testing-source.spec.ts)（本包与 `tool-cordis-contract`）；每个 spec 的“generated: every first answer is …”合法行全过且不适用集为空；`itNeedsTheHandle` 对每种进度核对无手柄时恰好是用到手柄的用例不适用。源码里的四处定时器都是夹具给的期限，不是轮询：`testing-case.ts` 的 `within`（期限是参数）、`testing-executor-binding.ts` 的 `drain`（`quietMs`）、`testing-clock.ts` 的 `quiet`（`quietMs`），登记套件的静默期（`quietMs`），由 testing-source.spec.ts 逐行核对 |
| I2 | 手柄的完成契约写在夹具接口里；手柄先于落地 resolve 的夹具至少让一条用例失败，守约夹具全过 | 各 spec 的 `lateSettle` 与 `lateHandles` 行，每个落地手柄至少一行：`settle`（环境“settle resolves 3 turns before the work lands”、“… 50 ms …”、“a rejection is lifted on the next tick and settle is not involved”，启动围栏、输出保管、决策桥、资源应答、执行者绑定各一行）；`completeStop`（执行者绑定两行）；`endFiber`（登记）；`excludeDeferred`（环境恰好让 E8、E9 失败，决策桥与资源应答恰好让 S12 失败）；`reachDeadline`（资源应答，恰好让 RX6、RX7、RX11、RX15、RX16 失败）；`finish`（执行者绑定，恰好让 B9、B19 失败）；`loseContinuity`（执行者绑定，恰好让 B10 失败）。`emit` 不是落地手柄：它把事实交给事实流，套件读事实流时最多等夹具的 `readDeadlineMs`，所以迟到几拍的 `emit` 不让任何用例失败（试跑过，失败集为空），这是事实流作为真正异步通道的预期，不另设一行。`decide` 与 `respond` 回的是证据，不是“稍后落地”的工作，不在本行。时钟没有这一行：它的 `advance`、`setBack`、`changeEpoch` 是时间控制，只在时间源已变、之后每次读取都看到它之后才 resolve，没有“稍后落地”的工作；时钟稍后才到的答复是 `waitUntil`，它是真正异步的通道，期限是夹具的 `waitMs` 与 `quietMs`，由时钟自己的自证核对 |
| I3 | 每个端口一条重送规则：进度单调、终局逐字节认回。三类违约和合法的“首答进度、重送读当前进度”见下面的对应表 | 下面“重送规则的对应”一节；原语本身在进度期间多问一次，由各端口的“进度期间重送答出另一个终局”变体抓住 |
| I4 | 每个套件有 `legal` 表，列出契约允许的提供者类别，每行断言失败集为空且不适用集恰为所列 | 每个 spec 的 `itPassesLegal(cases, legal)`；类别见上文第 4 层 |
| I5 | 替身对每个改变状态的方法按身份认回，比较动作种类与输入摘要（登记另加 authority 与资格），异值答 `conflict` 且没有效果 | 用例 E14、E15、SA13、SA14、B20、B21、C10、C11、S18–S21、RX16、R3、R4；违约变体（操作账只按身份认、先答 conflict 再照做、改用 invalid）恰好让它们失败。不带操作号的方法不适用，理由见 [public-api](../docs/public-api.md#端口一致性套件testing) |
| I6 | 不适用不是通过；首答进度而没有手柄的用例是不适用 | 每个 spec 的 `legalWithout…` 行与 `itNeedsTheHandle`；启动围栏的 SA7–SA9 没有静默通过的分支 |
| I7 | 每个取 `access` 的入口有跨租户用例，缺第二租户时不适用；外租户对存在的记录与从未存在的记录得到同类答复，对真实记录的答复不带该记录的识别值，首答是进度时在完成手柄之后仍是如此 | 每个 spec 的 `CROSS_TENANT` 表逐方法列出用例，测试核对用例存在、缺 `otherAccess` 时报告不适用；夹具把一个租户给两次时这些用例失败。跨租户的比较都经 `crossTenantAnswers`：先答进度、手柄之后才泄露的提供者，答出同类答复却在诊断里写出本租户回执的提供者（首答就写，或先答进度、手柄之后才写），以及答复里带本租户 `TenantId`、在诊断里写出本租户账户文本、把回执藏在对象键、`Map` 键、`Error` 的 message 或 symbol 键下的提供者，恰好让对应用例失败（见下面[评审发现的回归](#评审发现的回归)表中失败用例为 S7 与 SA16 的各行）。记录以顺序号（`1`、`2`）命名的合法决策桥全过：外租户回显的操作号 `ensure-1` 不算泄露，与它提交的证据里的 `revision: '1'` 相同的文本也不算。原语本身由 [testing-primitives.spec.ts](testing-primitives.spec.ts) 检查 |
| I8 | 合法提供者只在端口边界构造，不借替身的控制手柄；合法提供者只覆盖端口方法与它自己定义的手柄。替身的 `hold` 只留给违约变体、不适用映射与替身自检 | [testing-source.spec.ts](testing-source.spec.ts) 用 [legal-source-rule.ts](legal-source-rule.ts) 读语法树：全部合法提供者在 `*-legal.ts` 与 `generated-provider.ts` 里，这些文件以任何写法都不点名替身的控制手柄（属性读取、可选调用、解构、字符串下标、装着名字的字符串，不认变量名）；各 spec 交给 `itPassesLegal`、`itNeedsTheHandle` 的表只引用这些文件导出的提供者，行里不写提供者代码，也不把 spec 自己的函数交给合法构造函数；各 spec 没有 `.controls`（只有“两个替身不共享状态”一条自检例外）；`generated-provider.ts` 不引用任何替身。规则自己的用例（“rejects … in a legal file”与“rejects … in a legal table of a spec”）逐条拒绝已知的绕过写法：解构后可选调用、别名、字符串下标、合法表里写在 spec 中的提供者等。登记套件同样，另查合法文件不引用 `flawed-registrations.ts`。真正延迟的提供者自己定义 `hold`（每个操作本来就延迟，等于空操作）与 `excludeDeferred`，不适用集因此为空 |

### 重送规则的对应

重送规则：同一操作的后续读取（重送、检查、落地后的答复）进度单调，不退回；终局逐字节认回。三类违约，每个有重送路径的方法各有一个变体，失败的用例恰好是那些重送用例（以变体旁的 `fails` 表为准）：

- 甲：终局之后重送，答出另一个终局。
- 乙：终局之后重送，退回进度（含 `accepted` 退回 `pending`）。
- 丙：进度期间重送，答出的终局与之后落地的不同。

| 端口与方法 | 甲 | 乙 | 丙 |
| --- | --- | --- | --- |
| 环境 `prepare` | a resent preparation answers another resource | a prepared preparation is answered pending on the next ask | a resend during pending answers another prepared than the one that lands |
| 环境 `release` | a resent release answers other evidence | a resent release goes back from released to pending | a resend of a release during pending answers another released than the one that lands |
| 启动围栏 `consume` | consume mints a fresh acceptance each time | a resent consume goes back from started to unknown | a resend of a consume during unknown answers another acceptance than the one that lands |
| 执行者绑定 `stop` | a resent stop answers other evidence | a resent stop goes back from accepted to pending | a resend during progress answers another final than the one that lands |
| 输出保管 `preserve` | a resent preserve answers fresh custody | a resent preserve goes back from the raw output to a lost reply | a resend of a preserve during its lost reply answers another raw output than the one that lands |
| 输出保管 `retainResult` | a resent retainResult answers fresh evidence | a resent retainResult goes back from the evidence to a lost reply | a resend of a retainResult during its lost reply answers another evidence than the one that lands |
| 外部对端 `ensure`（决策桥与资源应答共有） | a resent ensure answers a fresh registration | a resent ensure goes back from the registration to a lost reply | a resend of an ensure during its lost reply answers another registration than the one that lands |
| 外部对端 `invalidate`（同上） | a resent invalidation answers fresh evidence | a resent invalidation goes back from the evidence to a lost reply | a resend of an invalidation during its lost reply answers another evidence than the one that lands |
| 资源应答 `expire` | a resent expire answers a fresh expiry | a resent expire goes back from the expiry to a lost reply | a resend of an expire during its lost reply answers another expiry than the one that lands |

不在表里的方法没有“终局之前的进度”：启动围栏的 `prepare`、`invalidate`、`exclude`，执行者绑定的 `start`、`acknowledge`，登记的 `register` 和时钟的各方法，首答都是终局，没有乙、丙两类。读取方法（`inspectPreparation`、`inspectRelease`、`inspectOperation`、`inspectStart`、`inspectControl`、`inspect`）按同一条规则由 `resendRecalls` 判。

合法的“首答进度、重送读当前进度”：执行者绑定的“a stop answers pending first and a resend reads its current progress”（`pending` 之后读到 `accepted`，再到终局）。其他端口的进度种类互不排序，这一形状由生成的行证明：“generated: every first answer is … until settle”首答进度，进度期间的重送读到同一个进度，`settle` 之后读到终局；环境另有真正延迟的两行（首答 `pending`，下一拍落地后重送读到终局；首答 `unknown`，`settle` 落地）与首答 `pending` 的释放。

### 评审发现的回归

下表每一行是一种曾经漏过套件的违约实现。它们都有对应的违约变体，现在都让套件失败，失败的用例恰好是列出的那些。其中四个独立写成的违约提供者也在现行套件上逐字运行过：它们各恰好让一条用例失败（SA3、SA9、E3、SA5），没有一个整套通过。另一个异步释放的违约提供者仍让 5 条用例失败（E11、E12、E15、E18、E19），这是预期的：它的释放队列键里不带租户，也不检查输入，`settle` 也不等它的计时器，这三处都违约；`legal` 表里的“every release answers pending first and is carried out on the next tick”是修正后的版本，键带租户、按 P01 检查输入、`settle` 等释放落地。

| 违约实现 | 违约变体 | 失败的用例 |
| --- | --- | --- |
| 失效复用 ensure 的操作号，答出登记却什么也没失效 | a reused operation identity answers the receipt of the first action（决策桥与资源应答） | S18、S19、S20、S21 |
| ensure 的操作号换了 wait，答出第一个 wait 的登记 | a reused operation identity answers the registration of the first wait | S20 |
| 同一启动的第二张 permit 又得到一份受理 | a second permit of an accepted start is accepted again | SA3 |
| not-started 之后，新 permit 永远被拒 | not-started forbids any later first start | SA9 |
| pending 期间重送 prepare，又分配了第二份资源 | a resend of a pending preparation allocates again | E3 |
| 受理之后失效，再重送原 consume，答成 `rejected` | a resent consume after an invalidation answers rejected | SA5 |
| 读模型落后，`settle` 之前对谁都答 `pending`，之后不认租户，把本租户的回执交给外租户 | inspectOperation answers pending until settle, then ignores the tenant（决策桥与资源应答） | S7 |
| 外租户的 consume 在 `settle` 之前答 `unknown`，之后对真实 permit 答 `rejected`、对不存在的 permit 答 `invalid` | a foreign consume is unknown until settle, then tells that the permit exists | SA16 |
| 截止前本应拒绝的 expire 答成丢失回复，`settle` 时照样到期 | an expire before the deadline answers a lost reply and lands an expiry at settle | RX5 |
| 外租户的 `inspectOperation` 答 `unknown`（与不存在的操作同类），诊断里却写出本租户的回执 | a foreign inspectOperation answers unknown and names the receipt of the tenant（决策桥与资源应答） | S7 |
| 同上，但先答 `pending`，`settle` 之后才写出回执 | a foreign inspectOperation is pending until settle, then names the receipt of the tenant（决策桥与资源应答） | S7 |
| 不提供 permit 的绑定，把另一输入的 start 答成 `invalid` | a binding that offers no permit answers a start with another input as invalid | B21 |
| 自带 permit 的绑定，把另一输入的 start 答成 `denied`，既不是 conflict 也不是 invalid | a binding that offers its own permits answers a start with another input as denied | B21 |
| expire 只认本次调用写明 `supported` 的声明，不看登记时的声明 | expire takes only a call that declares expiry supported | RX13 |
| 拒绝之后约 10 毫秒才写入目录（在 25 毫秒的静默期之内） | a refused check writes the entry 10 ms after the answer, and keeps it（登记，`tool-cordis-contract`） | R11 |
| 登记在途时核验改变，`register` 直接拒绝（Promise 被拒）而不是答复 | a register rejects when the check changes while it is in flight（登记，`tool-cordis-contract`） | R15 |
| 外租户的输出保管 `inspect` 答 `unknown`，另一个字段写出本租户输出的保管记录 | a foreign inspect answers unknown and names the custody of the tenant | C12 |
| 外租户的 `resolve` 与不存在的回应同样被拒，拒绝原因却写出本租户的资源值 | a foreign resolve is refused with a reason that names the value of the tenant | RX14 |
| 对不存在的登记照样给出到期证据，外租户的两次 expire 因而同类 | expire answers an expiry for a registration that is none | RX15 |
| 外租户的 `inspectOperation` 答 `unknown`，另一字段带本租户的 `TenantId` 对象 | a foreign inspectOperation answers unknown and names the tenant as a TenantId（决策桥与资源应答） | S7 |
| 同上，诊断里写出本租户的账户文本 | a foreign inspectOperation answers unknown and names the account of the tenant in its diagnostic（决策桥与资源应答） | S7 |
| 同上，本租户的回执作为对象的键 | a foreign inspectOperation answers unknown and names the receipt as an object key（决策桥与资源应答） | S7 |
| 同上，本租户的回执作为 `Map` 的键 | a foreign inspectOperation answers unknown and names the receipt as a Map key（决策桥与资源应答） | S7 |
| 同上，本租户的回执写在 `Error` 的 message 里 | a foreign inspectOperation answers unknown and names the receipt in an Error message（决策桥与资源应答） | S7 |
| 同上，本租户的回执放在 symbol 键下 | a foreign inspectOperation answers unknown and names the receipt under a symbol key（决策桥与资源应答） | S7 |

最后六行由 `assertNothingTold` 里的 `if (told !== undefined) assert.fail(…)` 抓住，决策桥与资源应答各一次，见[共用原语与判定助手](#共用原语与判定助手testing-case)一节。

评审也发现了套件对合法提供者的误判。下面两个合法提供者在各自 spec 的 `legal` 表里，现在全过：

- 环境：preparation 首答 `pending`，重送时已落地，每次 `prepared` 给新的重连能力（“a preparation is pending first, lands on the resend, and every prepared answer hands out a fresh reconnect capability”）。`finalAnswer` 在进度期间与手柄之后都按环境的视图比较终局，视图不含重连能力。
- 决策桥：记录名是顺序号 `1`、`2`（“the records are named by a sequence number”）。短于 8 的识别值只按整段相等查，外租户提交的文本是回显，所以外租户回显的操作号 `ensure-1`、与它提交的证据里的 `revision: '1'` 相同的文本都不算泄露。

## 断言与违约变体的对应

下表按断言列出：删掉该断言（或把它削弱）后，自证里哪些违约变体不再失败，也就是由哪些变体负责它。下表由最近一次完整的断言删除变异生成，「共用原语与判定助手」一节在其后对 `testing-case` 单独重跑过；之后新增或改写的变体与用例，以各 spec 里变体旁的 `fails` 表为准，下次完整变异后重生。每一行是套件里一条断言语句，按源码顺序排列，不写行号以免随编辑漂移。语句同时是动作的，表里取的是只去掉判断、保留动作的结果。共用原语的行也可能写 [testing-primitives.spec.ts](testing-primitives.spec.ts) 里的用例名：那条断言由原语的单元用例负责。对应由断言删除变异产生（工具、逐条日志与前后哈希不随仓库保存），改动套件后须重新运行变异检查，再更新本表。

### 共用原语与判定助手（testing-case）

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `if ('failure' in outcome) assert.fail(`${what}: expected success, got ${JSON.stringify` | 类型收窄，由编译器守护 |
| `if ('ok' in outcome) assert.fail(`${what}: expected a failure, got ${JSON.stringify(outcom` | 类型收窄，由编译器守护 |
| `if (value.kind !== kind) assert.fail(`${what}: expected ${kind}, got ${value.kind}`)` | inspectOperation answers excluded for an invalidation that arrived before the registration landed；inspectOperation does not know an applied ensure；an excluded operation lands after all（另 29 个） |
| `assert.ok( kinds.includes(value.kind), `${what}: expected ${kinds.join(' or ')}, g` | inspectStart reports a start never made as lost；invalidate confirms without invalidating；a retry of a refused consume starts（另 2 个） |
| `assert.notDeepEqual(other.tenant, fixture.access.tenant, 'the fixture names one tenant twi` | must name another tenant, or the cross-tenant cases fail and say why |
| `if (completion === undefined) assert.fail( `${what}: ${JSON.stringify(answer)} i` | 类型收窄，由编译器守护 |
| `resendRecalls( row, { earlier: view(first), later: view(during) }, `${what}: a` | fails when the resend during progress goes back in the course of the operation |
| `if (isProgress(again, row)) assert.fail(`${what}: still ${JSON.stringify(again)} after` | completeStop resolves 3 turns before the stop lands (generated)；a resent consume goes back from started to unknown；settle resolves 3 turns before the authority decides (generated) |
| `resendRecalls( row, { earlier: view(during), later: view(again) }, `${what}: t` | a resend of an ensure during its lost reply answers another registration than the one that lands；a resend of an invalidation during its lost reply answers another evidence than the one that lands；a resend of a release during pending answers another released than the one that lands（另 7 个） |
| `assert.equal(shapeOf(real), shapeOf(ghost), `${what}: the answer tells that the record exi` | a foreign inspect is denied when the registration exists；a foreign invalidate is denied when the registration exists；a foreign resolve is denied when the decision exists（另 8 个） |
| `assert.equal(kindOf(real), kindOf(ghost), `${what}: the answer tells that the record exist` | a foreign inspectOperation answers pending when the operation exists；a foreign inspectPreparation answers pending when the preparation exists；a foreign inspectRelease answers released when the release exists（另 4 个） |
| `if (told !== undefined) assert.fail(`${what}: the answer carries ${JSON.stringify(told` | a foreign inspectOperation answers unknown and names the receipt of the tenant；a foreign inspectOperation is pending until settle, then names the receipt of the tenant；a foreign inspectOperation answers unknown and names the tenant as a TenantId（另 23 个） |
| `assertNothingTold(first, secrets, `${what}: the first answer`)` | inspect ignores the tenant；a foreign inspect is denied when the registration exists；inspectOperation ignores the tenant（另 36 个） |
| `assertNothingTold(landed, secrets, `${what}: the answer after ${finish.name}`)` | a foreign inspectOperation is pending until settle, then names the receipt of the tenant；inspectOperation answers pending until settle, then ignores the tenant；a foreign inspectOperation is pending until settle, then names the receipt of the tenant（另 2 个） |
| `assert.deepEqual(later, earlier, `${what}: an answer that was final is not recalled as it` | a resent ensure goes back from the registration to a lost reply；a resent invalidation goes back from the evidence to a lost reply；a resend of an ensure during its lost reply answers another registration than the one that lands（另 62 个） |
| `assert.ok( rankOf(later, row) >= rankOf(earlier, row), `${what}: the operation wen` | a resent stop goes back from accepted to pending；fails when the resend during progress goes back in the course of the operation |
| `if ((row.recalled ?? []).includes(kind) && kindOf(later) === kind) assert.deepEqual(la` | an accepted stop is read with another evidence |

### clock (K)

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `assert.match(answer.milliseconds, /^\d+$/u, 'elapsed milliseconds are a decimal count')` | elapsed counts in a decimal with a fraction |
| `assert.equal(segment.operation, 'segment-1')` | the marker names another operation |
| `assert.ok(segment.source.length > 0, 'the source of the marker is named')` | the marker names no source |
| `assert.ok(segment.epoch.length > 0, 'the epoch of the marker is named')` | the marker names no epoch |
| `assert.ok(marker.owner.length > 0, 'the owner of the marker is named')` | the marker has no owner of its evidence |
| `assert.ok(marker.record.length > 0, 'the record of the marker is named')` | the marker has no record of its evidence |
| `assert.ok(marker.digest.length > 0, 'the digest of the marker is named')` | the marker has no digest of its evidence |
| `assert.equal(await s.milliseconds(first.marker), before)` | a begin of another segment disturbs the next read of a running segment；the second read of a marker is a millisecond off |
| `assert.equal(await s.milliseconds(first.marker), before + 50)` | a segment stops counting once another segment begins；the third read of a marker is a millisecond off |
| `assert.equal(await s.milliseconds(second.marker), 50)` | elapsed counts a millisecond too little |
| `assert.equal(await s.milliseconds(segment.marker), 0)` | the first read of a marker counts a head start |
| `assert.equal(sampled.milliseconds, '250')` | the second read of a marker is a millisecond off |
| `assert.ok(sampled.evidence.owner.length > 0 && sampled.evidence.digest.length > 0)` | elapsed names no evidence of its sample |
| `assert.equal(await s.milliseconds(segment.marker), 250)` | the third read of a marker is a millisecond off |
| `if ('ok' in answer) assert.ok(Number(answer.ok.milliseconds) >= before)` | elapsed follows the wall time；the first read of a marker counts a head start |
| `refused( await s.clock.elapsed(segment.marker), 'elapsed across an epo` | elapsed answers zero across an epoch that cannot be compared |
| `assert.equal(await s.milliseconds(fresh.marker), 0)` | a begin of another segment disturbs the next read of a running segment；the first read of a marker counts a head start |
| `assert.ok( await s.quiet(waiting), 'waitUntil answered before the instant` | waitUntil answers cancelled before the abort |
| `assert.equal(await within(waiting, s.waitMs, 'waitUntil after abort'), 'cancelled')` | waitUntil answers elapsed when the signal aborts |
| `assert.equal(answer, 'cancelled')` | waitUntil answers elapsed at once |
| `assert.equal(await within(waiting, s.waitMs, 'waitUntil at the instant'), 'elapsed')` | waitUntil answers cancelled before the abort |
| `assert.ok(await s.quiet(waiting), 'waitUntil answered before its instant')` | waitUntil answers elapsed at once；waitUntil answers cancelled before the abort |

### decision bridge (D)

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `assert.deepEqual(await s.ensure('ensure-2'), first)` | ensure registers again for another operation of the same wait |
| `assert.deepEqual((await s.inspect()).registration, first)` | inspect answers another registration |
| `assert.deepEqual(await s.inspect(), { registration, decision: null })` | inspect answers another registration；inspect shows a decision before the owner decided |
| `assert.deepEqual(await s.inspect(), { registration, decision })` | inspect answers another registration；inspect forgets the decision |
| `assert.deepEqual(succeeded(await s.resolve(decision), 'resolve'), APPROVAL)` | resolve answers another value than the decision |
| `assert.deepEqual(succeeded(await s.resolve(decision, wait), 'resolve'), value)` | resolve answers another value than the decision；resolve turns a no-answer and a declined decision into an answer |
| `refused(await s.resolve(evidence('never-decided')), 'resolve of evidence that is no decisi` | resolve answers a default for evidence that is no decision |
| `refused(ghost, 'resolve of evidence that is no decision')` | resolve answers a default for evidence that is no decision |
| `assert.deepEqual(succeeded(await s.resolve(decision), 'resolve'), APPROVAL)` | resolve answers another value than the decision |
| `refused(await s.resolve(other, 'wait-1'), 'resolve of the decision of wait-2 for wait-1')` | resolve answers a default for evidence that is no decision；resolve ignores the wait that asks |

### environment (E)

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `expectKind(first, 'prepared', 'prepare')` | every preparation is rejected |
| `resendRecalls( environmentAnswers.prepare, { earlier: preparationView(first), late` | a resend that comes alone answers another resource |
| `resendRecalls( environmentAnswers.prepare, { earlier: preparationView(first),` | resends that meet in flight answer other resources |
| `assert.equal(allocations.call(fixture), 1)` | a resent preparation allocates again |
| `assert.ok(isProgress(first, environmentAnswers.prepare), 'prepare under hold is progress')` | the first answer under a hold claims a resource |
| `assert.ok( isProgress(resent, environmentAnswers.prepare), 'prepare again while pe` | a resend of a pending preparation is answered prepared；a resend during pending answers another prepared than the one that lands |
| `assert.equal(allocations.call(fixture), 1)` | a resent preparation allocates again；a resend of a pending preparation allocates again |
| `assert.deepEqual(inspected.environment.evidence, first.evidence)` | inspectPreparation answers other evidence |
| `assert.deepEqual(inspected.environment.preparation, record)` | inspectPreparation answers the record of another operation |
| `if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'prepared')` | inspectPreparation fabricates prepared for what is not prepared |
| `if ('ok' in inspected && inspected.ok.kind === 'prepared') assert.notDeepEqual(inspect` | inspectPreparation hands the resource of one call to another call |
| `assert.notDeepEqual(foreign.evidence, original.evidence)` | prepare hands the resource of one call to another call |
| `assert.ok(isProgress(first, environmentAnswers.prepare), 'prepare under hold is progress')` | the first answer under a hold claims a resource |
| `assert.ok( isProgress(pending, environmentAnswers.inspectPreparation), 'inspectPre` | inspectPreparation fabricates prepared for what is not prepared |
| `assert.deepEqual(again.evidence, prepared.environment.evidence)` | inspectPreparation answers other evidence；a resend that comes alone answers another resource |
| `assert.ok(isProgress(first, environmentAnswers.prepare), 'prepare under hold is progress')` | the first answer under a hold claims a resource；every preparation is rejected |
| `assert.ok(excluded.exclusion.digest.length > 0)` | the exclusion is answered without evidence |
| `resendRecalls( environmentAnswers.inspectPreparation, { earlier: excluded, later:` | an excluded preparation is prepared on the next ask |
| `assert.ok(isProgress(await s.prepare(record), environmentAnswers.prepare), 'prepare under` | the first answer under a hold claims a resource；every preparation is rejected |
| `expectKind(succeeded(await s.inspect(record), 'inspectPreparation'), 'excluded', 'inspect'` | inspectPreparation fabricates prepared for what is not prepared；an excluded allocation lands after all |
| `assert.equal(allocations.call(fixture), 0, 'the excluded preparation allocated')` | an excluded preparation allocates anyway |
| `assert.ok(rejected.reason.includes('the image is missing'), 'the rejection names the failu` | a rejection does not name the failure |
| `resendRecalls( environmentAnswers.inspectPreparation, { earlier: rejected, later:` | inspectPreparation fabricates prepared for what is not prepared |
| `resendRecalls( environmentAnswers.prepare, { earlier: rejected, later: await s.pre` | a rejected preparation degrades on the second ask |
| `resendRecalls( environmentAnswers.release, { earlier: first, later: succeeded(awai` | a resent release answers other evidence；a resent release goes back from released to pending |
| `resendRecalls( environmentAnswers.inspectRelease, { earlier: first, later: succeed` | inspectRelease answers other evidence |
| `if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'released')` | inspectRelease fabricates a release |
| `assert.equal( refused( await fixture.environment.prepare({ ...fixture.ac` | a preparation operation reused with another input is refused as invalid |
| `assert.deepEqual(inspected.environment.evidence, original.evidence)` | inspectPreparation answers other evidence |
| `if (allocations !== undefined) assert.equal(allocations, 1, 'the conflict allocated')` | a resent preparation allocates again；a conflicting preparation operation still allocates |
| `assert.equal( refused(await s.release(other), 'release with another input under the sa` | a release operation reused with another input is refused as invalid |
| `resendRecalls( environmentAnswers.inspectRelease, { earlier: first, later: succeed` | inspectRelease answers other evidence |
| `assert.deepEqual(again.environment.evidence, original.evidence)` | inspectPreparation answers other evidence |
| `if (answer.kind === 'prepared') assert.notDeepEqual(answer.environment.evidence, origi` | prepare ignores the tenant |
| `assert.deepEqual(again.evidence, original.evidence)` | a resent preparation answers another resource；a resend that comes alone answers another resource；a foreign prepare replaces the allocation of the tenant |
| `if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'released')` | inspectRelease fabricates a release；release ignores the tenant |
| `resendRecalls( environmentAnswers.inspectRelease, { earlier: first, la` | inspectRelease answers other evidence |

### executor binding (B)

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `assert.equal(launches.call(fixture), 1)` | a resent start launches again；a resent start gets an independent execution |
| `assert.equal(launches.call(fixture), 1)` | a resent start gets an independent execution；starts that meet in flight launch twice |
| `assert.ok(factsOf(one).length >= 1, 'the fact reached the reader')` | the facts of a start end at once |
| `assert.deepEqual(two, one)` | a second reader of a start is handed other batches |
| `refused(await s.startWith(moved), 'start with the permit of another call')` | a start with the permit of another call is answered with another start |
| `expectOneOf(await s.lookup(), ['not-started', 'unknown'], 'inspectStart after the refusal'` | inspectStart reports a start never made as lost |
| `refused(await s.startWith(moved), 'start with the permit of another start')` | a start with the permit of another start is answered with another start |
| `expectOneOf(await s.lookup(), ['not-started', 'unknown'], 'inspectStart after the refusal'` | inspectStart reports a start never made as lost |
| `refused(await s.startWith(moved), 'start with the permit of another tenant')` | a start with the permit of another tenant is answered with another start |
| `expectOneOf(await s.lookup(), ['not-started', 'unknown'], 'inspectStart after the refusal'` | inspectStart reports a start never made as lost |
| `assert.deepEqual( await readBatches(live.execution, null, 1, deadline(fixture)),` | a second reader of a start is handed other batches；the live execution of inspectStart reads other batches |
| `expectOneOf(await s.lookup(), ['not-started', 'unknown'], 'inspectStart before any start')` | inspectStart reports a start never made as lost |
| `assert.deepEqual(settled.fact, final)` | inspectStart alters the final of a settled start |
| `assert.ok(settled.event.length > 0, 'the event of the final is named')` | the event of a settled start is blank |
| `assert.ok(settled.source.owner.length > 0, 'the source of the final is named')` | the source of a settled start is blank |
| `assert.ok(lost.continuity.owner.length > 0, 'the owner of the continuity is named')` | the owner of the continuity of a lost start is blank |
| `assert.ok(lost.continuity.digest.length > 0, 'the digest of the continuity is named')` | the digest of the continuity of a lost start is blank |
| `assert.ok(unknown.diagnostic.length > 0)` | an unreadable inspection is unknown without a diagnostic |
| `assert.equal(launches.call(fixture), before)` | inspectStart starts again when it cannot tell |
| `assert.equal(facts.length, 3)` | a fact is delivered twice |
| `assert.equal(new Set(facts.map(fact => fact.event)).size, 3, 'the events are distinct')` | every event has the same event identity |
| `assert.equal(new Set(batches.map(batch => batch.batch)).size, batches.length)` | every batch has the same batch identity |
| `assert.equal(new Set(batches.map(batch => batch.cursor)).size, batches.length)` | every batch has the same cursor |
| `assert.equal(batches[0]?.after, null)` | the first batch has an after cursor |
| `assert.deepEqual(batch.start, s.start)` | a batch names another start |
| `assert.deepEqual(batch.source, batches[0]?.source)` | every batch has another source |
| `if (index > 0) assert.equal(batch.after, batches[index - 1]?.cursor)` | facts break the chain of after cursors |
| `assert.ok(saved !== undefined, 'the stream gave a first batch')` | 类型收窄，由编译器守护 |
| `assert.deepEqual( factsOf(await readBatches(execution, saved, later.length, dead` | facts ignore the cursor of a reconnect |
| `assert.ok(batch !== undefined)` | 类型收窄，由编译器守护 |
| `assert.deepEqual( succeeded(await execution.acknowledge(receipt), 'acknowledge a` | a resent acknowledgement answers fresh evidence |
| `assert.ok(batch !== undefined)` | 类型收窄，由编译器守护 |
| `assert.ok(before >= 1, 'the source waits for the receipt of the batch')` | the source owes no duty before the receipt |
| `assert.equal(pending.call(fixture, s.start), before - 1)` | an acknowledgement releases the source only when resent |
| `assert.equal(pending.call(fixture, s.start), before - 1)` | a resent acknowledgement releases the source twice |
| `expectKind(await s.lookupFinal(), 'live', 'inspectStart after the stream was closed')` | inspectStart hides a running start；a closed channel settles the start |
| `resendRecalls(answers.stop, { earlier: first, later: resent }, 'stop again')` | a resent stop goes back from accepted to pending |
| `resendRecalls( answers.inspectControl, { earlier: resent, later: inspe` | the stopped execution has no evidence；a resend during progress answers another final than the one that lands |
| `expectKind(await s.lookupFinal(), 'live', 'inspectStart while the stop is only accepted')` | inspectStart hides a running start |
| `resendRecalls( answers.inspectControl, { earlier: first, later: during },` | a held stop is reported as stopped；an accepted stop is read with another evidence |
| `assert.ok(isProgress(during, answers.inspectControl), 'the executor has not ended')` | inspectControl claims stopped while the stop is only accepted |
| `assert.equal(stopped.kind, 'stopped')` | inspectControl keeps saying accepted after the executor ended |
| `assert.ok('evidence' in stopped && stopped.evidence.digest.length > 0)` | the stopped execution has no evidence |
| `assert.notEqual((await s.lookupFinal()).kind, 'live')` | inspectStart keeps reporting a stopped start as live |
| `assert.equal(progress.kind, 'already-ended')` | a stop after the final is reported as stopped；finish resolves 3 turns before the execution ends |
| `assert.equal( refused(await execution.stop(other), 'stop with another input').ki` | a stop operation reused with another input is refused as invalid |
| `resendRecalls( answers.inspectControl, { earlier: first,` | inspectControl keeps saying accepted after the executor ended；the stopped execution has no evidence |
| `assert.ok( failure.kind === 'conflict' \|\| (fixture.permit !== undefi` | a start with another input is refused as denied；a binding that offers no permit answers a start with another input as invalid；a binding that offers its own permits answers a start with another input as denied |
| `assert.equal(launches.call(fixture), 1, 'the conflict launched')` | a conflicting start still launches |
| `expectKind(await own.lookupFinal(), 'live', 'inspectStart by the own tenant')` | inspectStart hides a running start |
| `assert.deepEqual( await drain(foreign, fixture.quietMs ?? DEFAULT_QUIET_MS),` | start ignores the tenant；is taken from the fixture: a fact later than it fails the case that waits |

### shared P06 cases (S)

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `assert.ok(value.owner.length > 0, `${what}: the owner of the evidence is named`)` | the registration has no owner of its evidence；the receipt of a commit has no owner of its evidence；the registration has no owner of its evidence（另 1 个） |
| `assert.ok(value.record.length > 0, `${what}: the record of the evidence is named`)` | the registration has no record of its evidence；the receipt of a commit has no record of its evidence；the registration has no record of its evidence（另 1 个） |
| `assert.ok(value.digest.length > 0, `${what}: the digest of the evidence is named`)` | the registration has no digest of its evidence；the receipt of a commit has no digest of its evidence；the exclusion of a deferred operation has no digest（另 5 个） |
| `assertEvidence(first, 'the registration is evidence of its owner')` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 3 个） |
| `resendRecalls( answers.ensure, { earlier: { ok: first }, later: await p.en` | a resend that comes alone answers another registration；a resend that comes alone answers another registration |
| `resendRecalls(answers.ensure, { earlier: { ok: first }, later: again }, 'concurrent ensure` | concurrent ensures of one operation answer distinct registrations；concurrent ensures of one operation answer distinct registrations |
| `assert.deepEqual(succeeded(await p.inspect(), 'inspect'), registration)` | inspect answers another registration；inspect answers another registration |
| `refused(answer, 'inspect of a wait that was never ensured')` | inspect fabricates a registration for a wait never ensured；inspect fabricates a registration for a wait never ensured |
| `assert.notDeepEqual(two, one)` | the waits of one call share one registration for ensure and inspect alike；the waits of one call share one registration for ensure and inspect alike |
| `assert.deepEqual(succeeded(await p.inspect('wait-1'), 'inspect wait-1'), one)` | inspect answers another registration for the first wait of two；inspect answers another registration for the first wait of two |
| `assert.deepEqual(succeeded(await p.inspect('wait-2'), 'inspect wait-2'), two)` | inspect ignores which wait of the call is asked；inspect ignores which wait of the call is asked |
| `if ('ok' in ensuredByOther) assert.notDeepEqual(ensuredByOther.ok, registration)` | the waits of one call share one registration；ensure ignores the tenant；the waits of one call share one registration（另 1 个） |
| `assert.deepEqual(succeeded(await own.inspect(), 'inspect'), registration)` | inspect answers another registration；inspect answers another registration |
| `refused(ghost, 'inspect of a wait that is none')` | inspect fabricates a registration for a wait never ensured；inspect fabricates a registration for a wait never ensured |
| `assert.deepEqual(succeeded(await own.inspect(), 'inspect'), registration)` | inspect answers another registration；inspect answers another registration |
| `assert.deepEqual(byOwner.receipt, registration)` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 9 个） |
| `assert.deepEqual(invalidations(), [], 'the invalidation reached the registration')` | invalidate ignores the tenant；invalidate ignores the tenant |
| `assert.deepEqual(succeeded(await own.inspect(), 'inspect'), registration)` | inspect answers another registration；inspect answers another registration |
| `assert.equal(found.operation, 'ensure-1')` | inspectOperation names another operation in a commit；inspectOperation names another operation in a commit |
| `assertEvidence(found.receipt, 'the receipt of the original operation')` | the receipt of a commit has no owner of its evidence；the receipt of a commit has no record of its evidence；the receipt of a commit has no digest of its evidence（另 3 个） |
| `assert.ok( isProgress(answer.ok, answers.inspectOperation) \|\| answer.ok.kind ===` | inspectOperation fabricates a commit for an operation never sent；inspectOperation fabricates a commit for an operation never sent |
| `if (answer.ok.kind === 'excluded') { refused(await p.ensure('never-sent'), 'ensu` | an operation that was excluded as a fence is applied after all；an operation that was excluded as a fence still registers its wait；an operation that was excluded as a fence is applied after all（另 1 个） |
| `assert.ok(isProgress(lost, answers.ensure), 'a deferred ensure answers a lost reply')` | a deferred ensure answers a registration；a deferred ensure answers a registration |
| `assert.ok( isProgress(pending, answers.inspectOperation), 'inspectOperatio` | inspectOperation reports a deferred operation as committed；inspectOperation reports a deferred operation as committed |
| `expectKind(landedAnswer, 'committed', 'inspectOperation after the ensure landed')` | inspectOperation does not know an applied ensure；inspectOperation does not know an applied ensure |
| `assert.deepEqual(succeeded(await p.inspect(), 'inspect'), registration)` | inspect answers another registration；a resend that comes alone answers another registration；inspect answers another registration（另 1 个） |
| `assertEvidence(found.exclusion, 'the exclusion is evidence')` | the exclusion of a deferred operation has no digest；the exclusion of a deferred operation has no digest |
| `refused(await p.inspect(), 'inspect: the excluded ensure registered nothing')` | inspect fabricates a registration for a wait never ensured；inspect fabricates a registration for a wait never ensured |
| `assertEvidence(first, 'the invalidation is evidence')` | the evidence of an invalidation has no digest；the evidence of an invalidation has no digest |
| `resendRecalls( answers.invalidate, { earlier: { ok: first }, later: await` | a resent invalidation goes back from the evidence to a lost reply；a resent invalidation answers fresh evidence；a resent invalidation goes back from the evidence to a lost reply（另 1 个） |
| `assert.deepEqual(found.receipt, first)` | inspectOperation answers another receipt for an invalidation；inspectOperation answers another receipt for an invalidation |
| `resendRecalls( answers.invalidate, { earlier: { ok: first }, later: aw` | a resent invalidation goes back from the evidence to a lost reply；a resent invalidation answers fresh evidence；a resent invalidation goes back from the evidence to a lost reply（另 1 个） |
| `assert.deepEqual(invalidations(), [registration])` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 5 个） |
| `assert.deepEqual(invalidations(), [one])` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 7 个） |
| `assert.deepEqual(succeeded(await p.inspect(), 'inspect'), registration)` | inspect answers another registration；inspect answers another registration |
| `assert.deepEqual(invalidations(), [registration])` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 5 个） |
| `expectKind( await decided(p, 'invalidate-1'), 'committed', '` | inspectOperation answers excluded for an invalidation that arrived before the registration landed；inspectOperation answers excluded for an invalidation that arrived before the registration landed |
| `assert.deepEqual(succeeded(await p.inspect(), 'inspect'), registration)` | inspect answers another registration while an invalidation is deferred, ask 1；inspect answers another registration while an invalidation is deferred, ask 1 |
| `assert.deepEqual(succeeded(await p.inspect(), 'second inspect'), registration)` | inspect answers another registration while an invalidation is deferred, ask 2；inspect answers another registration while an invalidation is deferred, ask 2 |
| `assert.deepEqual(invalidations(), [])` | inspect invalidates the registration it reads；inspect invalidates the registration it reads |
| `assert.ok( isProgress( succeeded(await p.inspectOperation('invalidat` | inspectOperation reports a deferred operation as committed；inspectOperation reports a deferred operation as committed |
| `assert.deepEqual(invalidations(), [registration])` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 7 个） |
| `assert.equal(failure.kind, 'conflict')` | a reused invalidation identity for another wait is refused as invalid；a reused operation identity for another action is refused as invalid；a reused invalidation identity for another wait is refused as invalid（另 1 个） |
| `assert.deepEqual(found.receipt, registration)` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 11 个） |
| `refused(await p.invalidate('ensure-1'), 'invalidate under the identity of an ensure')` | a reused operation identity answers the receipt of the first action；a reused operation identity answers the receipt of the first action |
| `assert.deepEqual(invalidations(), [], 'the refused invalidation was carried out')` | a conflicting reuse of an operation identity is still carried out；a conflicting reuse of an invalidation identity still invalidates the other wait；a conflicting reuse of an operation identity is still carried out（另 1 个） |
| `assert.equal(failure.kind, 'conflict')` | a reused operation identity for another wait is refused as invalid；a reused operation identity for another wait is refused as invalid |
| `refused(await p.inspect('wait-2'), 'inspect: the refused ensure registered nothing')` | inspect ignores which wait of the call is asked；inspect fabricates a registration for a wait never ensured；a conflicting reuse of an operation identity still registers the other wait（另 3 个） |
| `assert.deepEqual(succeeded(await p.inspect('wait-1'), 'inspect wait-1'), registration)` | inspect answers another registration；inspect answers another registration |
| `assert.equal(failure.kind, 'conflict')` | a reused invalidation identity for another wait is refused as invalid；a reused operation identity for another action is refused as invalid；a reused invalidation identity for another wait is refused as invalid（另 1 个） |
| `assert.deepEqual(invalidations(), [one], 'the refused invalidation was carried out')` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 11 个） |
| `assert.deepEqual(found.receipt, first)` | inspectOperation answers another receipt for an invalidation；a conflicting reuse of an operation identity overwrites its receipt；inspectOperation answers another receipt for an invalidation（另 1 个） |

### output custody (C)

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `assert.deepEqual(raw.codec, s.codec)` | the raw output names another codec |
| `assert.equal(raw.content.bytes, String(BYTES.length))` | the bytes of the content are counted wrong |
| `assert.ok(raw.content.storage.length > 0, 'the storage of the content is named')` | the storage of the content is blank |
| `assert.ok(raw.content.key.length > 0, 'the key of the content is named')` | the key of the content is blank |
| `assert.ok(raw.content.digest.length > 0, 'the digest of the content is named')` | the digest of the content is blank |
| `assert.ok(raw.custody.owner.length > 0, 'the owner of the custody is named')` | the owner of the custody is blank |
| `assert.ok(raw.custody.digest.length > 0, 'the digest of the custody is named')` | the digest of the custody is blank |
| `assert.deepEqual(Array.from(await readBytes.call(fixture, raw)), Array.from(BYTES))` | the kept bytes are shorter than the preserved bytes |
| `resendRecalls( answers.preserve, { earlier: first, later: await s.pres` | a preserve resent alone answers fresh custody |
| `resendRecalls(answers.preserve, { earlier: first, later: again }, 'concurrent preserve')` | preserves that meet in flight answer fresh custody |
| `assert.deepEqual(inspected.raw, raw)` | inspect answers another raw output |
| `if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'retained')` | inspect fabricates a retained output for an unknown operation |
| `refused(await s.preserveOutcome(), 'preserve that failed')` | a failed preserve answers a raw output |
| `if ('ok' in inspected) assert.notEqual(inspected.ok.kind, 'retained')` | inspect fabricates a retained output for an unknown operation |
| `assert.ok(isProgress(lost, answers.preserve), 'the lost answer is a lost reply')` | a failed preserve answers a raw output；a preserve whose answer was to be lost answers the raw output |
| `assert.deepEqual(recalled, inspected.raw)` | a preserve resent alone answers fresh custody；inspect answers another raw output；a preserve resent after a lost answer answers fresh custody |
| `resendRecalls( answers.retainResult, { earlier: first, later: await s.` | a resent retainResult answers fresh evidence |
| `assert.deepEqual(inspected.raw, raw)` | inspect answers another raw output；retainResult replaces the preserved original |
| `assert.equal( refused(other, 'preserve of other bytes under the same operation')` | a failed preserve answers a raw output |
| `assert.deepEqual(inspected.raw, raw)` | inspect answers another raw output |
| `assert.equal( refused(other, 'retain of another result under the same operation'` | a retainResult operation reused for another result is refused as invalid |
| `resendRecalls( answers.retainResult, { earlier: first, later: await s.` | a resent retainResult answers fresh evidence |
| `assert.deepEqual(again.raw, raw)` | inspect answers another raw output；a foreign inspect changes the raw output of the tenant |
| `if ('ok' in foreign) assert.notDeepEqual(foreign.ok, raw)` | preserve ignores the tenant |
| `resendRecalls( answers.preserve, { earlier: raw, later: await own.pres` | a resent preserve answers fresh custody；a foreign preserve replaces the output of the tenant；a preserve resent alone answers fresh custody |
| `resendRecalls( answers.retainResult, { earlier: first, later: await ow` | a resent retainResult answers fresh evidence；a foreign retainResult changes the retention of the tenant |

### resource responses (RX)

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `assert.deepEqual(await s.inspect(), { registration, response: null })` | inspect answers another registration；inspect shows a response before the owner answered |
| `assert.deepEqual(await s.inspect(), { registration, response })` | inspect answers another registration；inspect forgets the response |
| `assert.deepEqual(resolved.value, GIVEN)` | resolve answers another value than the response |
| `assert.ok(resolved.source.owner.length > 0, 'the owner of the source is named')` | a resolved response names no owner of its source |
| `assert.ok(resolved.source.digest.length > 0, 'the digest of the source is named')` | a resolved response names no digest of its source |
| `refused( await s.resolve(intent, evidence('never-given')), 'resolve of evi` | resolve answers a value for evidence that is no response |
| `refused(await s.expireFinal(intent, registration), 'expire before the deadline')` | expire before the deadline answers evidence and changes nothing |
| `assert.deepEqual(await s.inspect(), { registration, response: null })` | inspect answers another registration；inspect shows a response before the owner answered |
| `if ('ok' in found) assert.notEqual(found.ok.kind, 'committed')` | inspectOperation fabricates a commit for an operation never sent |
| `assert.deepEqual(await s.inspect(), { registration, response: expiry })` | inspect answers another registration；inspect forgets the response |
| `assert.ok(resolved.source.owner.length > 0, 'the owner of the source is named')` | a resolved expiry names no owner of its source |
| `assert.ok(resolved.source.digest.length > 0, 'the digest of the source is named')` | a resolved expiry names no digest of its source |
| `resendRecalls( resourceResponsesAnswers.expire, { earlier: { ok: first },` | a resent expire goes back from the expiry to a lost reply；a resent expire answers a fresh expiry |
| `assert.deepEqual(found.receipt, first)` | inspectOperation answers another receipt for an expire |
| `refused(await s.expireFinal(intent, registration), 'expire after an earlier response')` | expire overrules an earlier response |
| `assert.deepEqual(await s.inspect(), { registration, response })` | inspect answers another registration；inspect forgets the response |
| `expectKind( succeeded(await s.resolve(intent, response), 'resolve'), 'reso` | a refused expire turns the response into an expiry |
| `refused(await s.expireFinal(intent, registration), 'expire of a wait with no deadline')` | expire before the deadline answers evidence and changes nothing；expire of a registration that has no deadline answers evidence and changes nothing；expire expires a wait that has no deadline |
| `assert.deepEqual(await s.inspect(), { registration, response: null })` | inspect answers another registration；inspect shows a response before the owner answered |
| `assert.equal(failure.kind, 'unsupported')` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 1 个） |
| `assert.ok( isProgress(lost, resourceResponsesAnswers.expire), 'a defer` | a deferred expire is answered with evidence |
| `assert.ok( isProgress(unsettled, resourceResponsesAnswers.inspectOperation),` | inspectOperation reports a deferred operation as committed |
| `resendRecalls( resourceResponsesAnswers.expire, { earlier: { ok: found` | a resent expire after a lost reply answers fresh evidence |
| `assert.deepEqual(await s.inspect(), { registration, response: found.receipt })` | inspect answers another registration；inspect forgets the response |
| `refused( await s.expireFinal(s.wait(), registration), 'expire by a dea` | expire of a registration that has no deadline answers evidence and changes nothing |
| `assert.deepEqual(await s.inspect(), { registration, response: null })` | inspect answers another registration；inspect shows a response before the owner answered |
| `assert.equal(failure.kind, 'unsupported')` | the registration has no owner of its evidence；the registration has no record of its evidence；the registration has no digest of its evidence（另 1 个） |
| `assert.deepEqual(await s.inspect(), { registration, response: null })` | inspect answers another registration；inspect shows a response before the owner answered |
| `refused(ghost, 'resolve of evidence that is no response')` | resolve answers a value for evidence that is no response |
| `expectKind( succeeded(await s.resolve(intent, response), 'resolve'), '` | a foreign resolve turns the response of the tenant into an expiry |
| `refused(ghost, 'expire of a registration that is none')` | expire answers an expiry for a registration that is none |
| `assert.deepEqual(await s.inspect(), { registration, response: null })` | inspect answers another registration；inspect shows a response before the owner answered |
| `assert.equal(failure.kind, 'conflict')` | the waits of one call share one registration for ensure and inspect alike |
| `assert.deepEqual(await s.inspect(two), { registration: registrationTwo, response: null })` | inspect answers another registration；inspect ignores which wait of the call is asked；a conflicting reuse of an expire identity still expires the other wait（另 1 个） |
| `assert.deepEqual(found.receipt, first)` | inspectOperation answers another receipt for an expire |

### startup fence (SA)

| 断言（语句） | 让它失败的违约变体 |
| --- | --- |
| `if ('ok' in answer) assert.notEqual(answer.ok.kind, 'started', `${what}: the start` | consume resurrects a start that was excluded；consume answers started after an exclusion；exclude confirms without excluding（另 3 个） |
| `expectOneOf(progress, ['rejected', 'not-started'], what)` | invalidate confirms without invalidating；a retry of a refused consume starts；the first consume after an invalidation starts（另 1 个） |
| `assert.ok(guard.owner.length > 0, 'the owner of the guard is named')` | the guard of a permit has no owner |
| `assert.ok(guard.resource.length > 0, 'the resource of the guard is named')` | the guard of a permit has no resource |
| `assert.ok(guard.revision.length > 0, 'the revision of the guard is named')` | the guard of a permit has no revision |
| `assert.ok( isProgress(inspected, answers.inspect) \|\| inspected.kind === 'not-started',` | a permit that is only issued counts as started；inspect answers rejected for a start that nobody decided |
| `resendRecalls( answers.consume, { earlier: first, later: await s.consume(permit) }` | a consume that comes alone is answered a fresh acceptance |
| `resendRecalls(answers.consume, { earlier: first, later: progress }, 'concurrent consume')` | consumes that meet in flight are answered fresh acceptances |
| `if ('ok' in answer) resendRecalls(answers.consume, { earlier: first, later: answer.o` | consume mints a fresh acceptance each time；a second permit of an accepted start is accepted again；a consume that comes alone is answered a fresh acceptance（另 1 个） |
| `resendRecalls(answers.inspect, { earlier: first, later: await s.inspect() }, 'inspect')` | inspect forgets an acceptance；inspect answers unknown for ever although settle resolved |
| `assertRefusal(refusal, 'consume after invalidation')` | the first consume after an invalidation starts |
| `expectOneOf(await s.inspectFinal(), ['rejected', 'not-started'], 'inspect after invalidati` | a stale consume is refused as not-started and inspect then says started |
| `assertRefusal(await s.consumeFinal(permit), 'second consume after invalidation')` | a retry of a refused consume starts |
| `resendRecalls(answers.inspect, { earlier: accepted, later: await s.inspect() }, 'inspect')` | an invalidation revokes an accepted start；inspect forgets an acceptance；inspect answers unknown for ever although settle resolved |
| `resendRecalls( answers.consume, { earlier: accepted, later: await s.consume(permit` | consume mints a fresh acceptance each time；a resent consume after an invalidation answers rejected；a consume that comes alone is answered a fresh acceptance（另 1 个） |
| `resendRecalls(answers.inspect, { earlier: accepted, later: await s.inspect() }, 'inspect')` | inspect forgets an acceptance；inspect answers unknown for ever although settle resolved |
| `assertRefusal(refusal, 'consume after invalidation')` | the first consume after an invalidation starts |
| `resendRecalls(answers.inspect, { earlier: refusal, later: inspected }, 'inspect')` | inspect turns a rejection into not-started |
| `assertRefusal(inspected, 'inspect after a refusal that was not-started')` | a stale consume is refused as not-started and inspect then says started |
| `expectKind(await s.inspectFinal(), 'not-started', 'inspect of an undecided start')` | inspect answers rejected for a start that nobody decided |
| `await s.neverStarts(permit, 'consume of the withdrawn permit')` | consume resurrects a start that was excluded；a permit that was withdrawn by not-started starts |
| `expectKind(await s.inspectFinal(), 'not-started', 'inspect of an undecided start')` | a permit that is only issued counts as started；inspect answers rejected for a start that nobody decided |
| `expectKind( await s.consumeFinal(await s.prepare(), 'capsule-2'), 'started', '` | not-started forbids any later first start；the guard of a permit has no owner；the guard of a permit has no resource（另 1 个） |
| `await s.neverStarts(permit, 'consume after an exclusion')` | the permit issued before an exclusion starts after it；a resent consume goes back from started to unknown |
| `if ('ok' in again) await s.neverStarts(again.ok, 'consume of a new permit after an exc` | a new permit after an exclusion starts；a resent consume goes back from started to unknown |
| `refused(await s.exclude('exclude-1'), 'exclude after acceptance')` | exclude confirms without excluding |
| `resendRecalls(answers.inspect, { earlier: accepted, later: await s.inspect() }, 'inspect')` | inspect forgets an acceptance；inspect answers unknown for ever although settle resolved |
| `assert.deepEqual(await s.invalidate(first, 'revoke-1'), evidenceOne)` | a resent invalidation answers fresh evidence before another permit is issued |
| `assert.deepEqual(await s.invalidate(first, 'revoke-1'), evidenceOne)` | a resent invalidation answers fresh evidence after another permit is issued |
| `assert.deepEqual( third.guards.map(guard => guard.revision), second.guards.map(gua` | a resent invalidation moves the guard again；the revision of the guard grows with every prepare |
| `expectKind(await s.consumeFinal(third), 'started', 'consume of a permit after a resend')` | a consume after a resent invalidation is rejected |
| `assert.equal(other.kind, 'conflict')` | an invalidation operation reused for another guard is refused as invalid |
| `assert.deepEqual(await s.invalidate(first, 'revoke-1'), original)` | a resent invalidation answers fresh evidence after another permit is issued |
| `expectKind(await s.consumeFinal(second), 'started', 'consume after the conflict')` | a resent invalidation moves the guard again；a consume after a resent invalidation is rejected |
| `assert.equal(other.kind, 'conflict')` | an exclusion operation reused for another reason is refused as invalid |
| `assert.deepEqual(succeeded(await s.exclude('exclude-1'), 'exclude again'), original)` | a conflicting reuse of an exclusion identity changes the evidence of the original |
| `await s.neverStarts(permit, 'consume after an exclusion under another reason')` | consume answers started after an exclusion；the permit issued before an exclusion starts after it；a resend of a consume during unknown answers another acceptance than the one that lands（另 1 个） |
| `resendRecalls( answers.inspect, { earlier: accepted, later: await own.inspect() },` | inspect forgets an acceptance；a foreign inspect makes the acceptance forgotten；inspect answers unknown for ever although settle resolved |
| `expectKind(await own.consumeFinal(permit), 'started', 'consume by the tenant after the att` | a foreign consume gets the permit of the tenant refused |
| `if ('ok' in foreignFinal) assert.notEqual(foreignFinal.ok.kind, 'started', 'the permit` | consume ignores the tenant |
| `expectKind(await own.consumeFinal(permit), 'started', 'consume by the tenant after the att` | invalidate ignores the tenant |
| `expectKind(await own.consumeFinal(permit), 'started', 'consume by the tenant after the att` | exclude ignores the tenant |
| `assert.deepEqual(permit.ok.tenant, otherAccessOf(fixture).tenant, 'the permit names the te` | a foreign prepare issues a permit that names the first tenant |
| `if ('ok' in answer && answer.ok.kind === 'started') assert.notDeepEqual(answer.ok, a` | consume ignores the tenant |
| `resendRecalls( answers.inspect, { earlier: accepted, later: await own.inspect() },` | inspect forgets an acceptance；inspect answers unknown for ever although settle resolved |


[reference.spec.ts](reference.spec.ts) 验证调用与操作引用的规范往返、闭合拒绝、最坏长度、合法租户与跨租户解析。contract.spec-d.ts 保留旧普通入口不存在和两种引用品牌不可互换的负编译断言。

[contract.spec-d.ts](contract.spec-d.ts) 验证释放成功不含本次 operation，receipt 不能为 pending。

[testing-tenant.spec.ts](testing-tenant.spec.ts) 核对 testingTenant 产生可由 tenantCodec.encode 编码的真实租户，并拒绝非法组织或账户文本。
