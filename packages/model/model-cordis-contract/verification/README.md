# Model Cordis 验证责任

验证唯一 Service 身份、登记与条件撤除、caller-fiber 归属、通知及安装闭包。[场景](#model-cordis-持续验证)是交付义务。转换目录、实例目录和抽象服务已有真实 Cordis 测试。共同领域验证由 [model-contract](../../model-contract/verification/index.md)维护。

## 持续验证设施

设施放在 `tests/`。验证说明与场景都放在本页，因为模板的 `verification/` 只接受 README、index、models 和 proofs。设施只证明下表"能发现"一列。它们不证明登记、撤除或租约行为，那些归[转换目录测试](#转换目录测试)这类真实 Cordis 测试。

| 设施           | 位置与命令                                                                                                                                             | 能发现                                                                                                                                                                                                                                                          | 发现不了                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 导出清单比对   | `tests/fixtures/exports.json`、`tests/exports-inventory.ts`、`tests/exports.spec.ts`。运行 `pnpm --filter @omne-harness/model-cordis-contract test`    | 两个入口漏导出、多导出、值与类型种类错误、清单标 `pending` 但产物已有、纯类型在两个入口不是同一声明、`sameAs` 指向的入口没有列出该名字或种类不同、模块增补与清单不符、清单列出的章在 `docs/public-api.md` 缺失、不链接存在的源码文件、链接的文件不声明其名字、页面链接的源码或测试文件不存在或页面重复声明名字、`pending` 总数与 `expectedPending` 不符 | 声明的形状与行为                                           |
| 安装闭包       | `tests/install/`、`tests/fixtures/install-policy.json`。运行 `pnpm --filter @omne-harness/model-cordis-contract run install-closure --out <报告.json>` | 框架契约闭包里的默认 Model 与供应商实现、pi、厂商 SDK、分词引擎、存储引擎，协议残留，入口解析（含 CommonJS `require`）或类型解析离开消费目录，离线安装失败（除非明示允许联网），消费目录越界或删除无标记的目录                                                  | 类型面以外的语义；Service 类单一身份（归真实 Cordis 测试） |
| 根入口闭包     | `tests/root-entry-closure.spec.ts`。运行 `pnpm --filter @omne-harness/model-cordis-contract test` | 根入口的构建产物 `dist/index.js` 有 import，或 `dist/index.d.ts` 沿相对 import 到达 `@deepseek-ai/cordis`、`cordis.d.ts` 或 `converters.d.ts` | 安装后的解析结果（归安装闭包） |
| 夹具运行器骨架 | `tests/fixture-runner.ts`、`tests/fixture-runner.spec.ts` | 夹具没有声明正常路径或失败路径，失败路径没有写明改变的协调决策，必需角色缺夹具 | 夹具本身是否证明了行为（见下一行与[角色夹具](#角色夹具)） |
| Cordis 消费插件夹具 | `tests/fixtures/consumers/cordis-plugin/`、`tests/fixtures/consumers/roles.json`、`tests/fixtures-run.spec.ts`（慢层）。运行 `pnpm --filter @omne-harness/model-cordis-contract run fixtures`，详见[角色夹具](#角色夹具) | 一个只靠已安装制品和 Cordis 的插件能否取得唯一的运行时服务定义、监听带身份的变化通知、先按租户过滤再向服务取权威修订、不比已知新就不刷新、被服务拒绝就停止跟踪、监听失败由发送方记录而不改提交结果、卸载后不再响应；夹具依赖了本角色禁止的包（默认 Model、本地宿主、pi）、导入未声明的包、编译失败、缺失败路径或失败路径没有写明决策 | 生产的变化通知发送方与可信身份适配器（夹具里的发送方和主体是装配替代）；真实提供者上的行为；生产插件的生命周期 |

### 导出清单

清单读取构建产物 `dist/*.d.ts`，不读源码文本。比对使用 `@typescript/typescript6` 的编译器 API，它解析 `export *` 与再导出，并按符号标志区分类型、值和类。`make declarations-check` 不能复用。它只对全部成员的 `dist` 声明报告诊断，不枚举导出。

清单按入口分列，名字由 `src/` 声明，章标题与 [public-api](../docs/public-api.md) 一致。测试另解析该页，要求清单列出的每一章链接至少一个存在的 `src/` 文件，这些文件声明该章的每个名字，页面链接的源码与测试文件都存在，页面的 TypeScript 围栏代码块（`ts`、`typescript`、`tsx`、`mts`、`cts`）不声明清单里的名字，带不带 `export` 都算。在页面漏指文件、指错文件或文件改名时，该测试变红。根入口再导出的名字在两个入口里各列一次，按章节合并比较。

| 入口       | 内容                                           | 项数 |
| ---------- | ---------------------------------------------- | ---- |
| `.`        | 8 个纯类型（D-1），全部已落地                  | 8    |
| `./cordis` | 17 个 Service 类（含凭据服务）、17 个键、再导出的 8 个纯类型 | 42   |

`./cordis` 里的纯类型标 `sameAs: "."`。测试检查它们解析到根入口的同一声明，并且只读清单检查：带 `sameAs: X` 的每个名字，入口 X 的清单里必须也有它且种类相同。按章节名合并比较页面时，根入口整章被删而 `./cordis` 仍列着这些名字，页面对照发现不了，这条清单检查补上这一点。

`declare module '@deepseek-ai/cordis'` 的 `Context`（17 个成员，全部已落地）和 `Events`（1 个事件 `model-cordis-contract/call-changed`，已落地）是模块增补，不是导出。它们在清单的 `augmentations` 里单列，测试从 `dist/cordis.d.ts` 里读出成员比对。设施仍支持部分落地的增补：用 `landed` 列出已建成员，已建成员必须与它相等；现在没有部分落地的增补。成员类型和事件载荷由 `tests/cordis-entry.spec-d.ts` 检查，事件的 `@mode` 与 `@param` 标签由 `tests/call-changed-doc.spec.ts` 从构建产物读出核对。

每项有 `pending` 标记。`pending: true` 表示声明已接受但产物还没有。比对规则如下：

1. `pending: false` 的名字必须在产物里出现，种类相符。
2. `pending: true` 的名字必须不在产物里。已经出现就失败，提醒改标记。
3. 产物里清单没有的导出算多导出。
4. 测试输出每个入口的"已列出、待落地、已落地"计数，并要求两个入口的 `pending` 总数等于清单顶层字段 `expectedPending`（现为 0）。落地名字的阶段在同一次改动里降低该值。

### 安装闭包

流程、报告和退出码与 [model-contract 的说明](../../model-contract/verification/README.md#安装闭包)相同，两个成员各有一份字节相同的 `tests/install/`（D-2）。本成员的差别如下：

- 策略是框架契约：允许 `@deepseek-ai/cordis`，禁止默认 Model（`@omne-harness/model`、`@omne-harness/model-host-local`）和供应商实现。
- 探针导入两个入口：根入口与 `./cordis`。`./cordis` 在运行时导入 `@deepseek-ai/cordis`，该包与它的传递依赖从工作区锁定的精确版本安装进消费目录。
- 慢层测试 `tests/install-consumer.spec.ts` 另有一个传递依赖负例：策略禁止 `@deepseek-ai/cosmokit`（Cordis 自己的依赖）。声明闭包里看不到它，设施必须在安装后的列表里找到并失败。

- 安装步骤只用 `--offline`。失败时整次运行失败。只有明示 `--allow-network`（或 `OMNE_INSTALL_ALLOW_NETWORK=1`）才会再用 `--prefer-offline` 重试。报告字段 `install.mode`（`offline` 或 `network`）与 `install.allowNetwork` 记录这一点。
- 解析钩子是同步的 `module.registerHooks`，记录 ESM `import` 与 CommonJS `require`，`registerHooks` 不触发 DEP0205。
- `--work-dir` 必须在成员的 `tmp/` 或仓库的 `tmp/install-closure/` 之下，不得是符号链接，非空时须带标记文件 `.install-closure-consumer`；否则退出码 2，不删除内容。

负例都在慢层（起子进程）：

- `tests/install-closure.spec.ts` 在清单的临时副本里注入默认 Model、本地宿主、pi、厂商 SDK、分词引擎、存储引擎各一个，断言退出码为 1、报告点名被注入的包、没有打包。同一文件另证：`--work-dir` 护栏（成员目录、允许范围之外的目录、无标记的非空目录）退出码为 2 且内容保留，这几条都对测试自己在临时目录里造的成员运行，不指向任何仓库路径；空 pnpm 存储使 `--offline` 失败时退出码为 1、`install.mode` 为 `offline`。
- `tests/install-probe.spec.ts` 在手工搭的消费目录里证明祖先 `node_modules` 的 CJS、ESM 与类型依赖、解析到 `src/` 都使对应检查失败。
- `tests/install-consumer.spec.ts` 对未修改成员做真实打包与安装，断言报告的检查项 id 与预期的完整集合相等、`typeCheck.files` 大于 0、探针入口列表等于两个入口，并在 `afterAll` 里删除它创建的 `tmp/install-closure/` 目录。预期集合里每个被打包的闭包成员各有 `pack`、`tarball-no-source`、`tarball-no-workspace-protocol` 三项，成员列表写在测试里，现为 10 个：本成员、`legal-identity`、`modality`、`model-contract`、`operation-result`，以及 `model-contract` 闭包里的 `call-account`、`content-block`、`json-text`、`message`、`utc-instant`。生产依赖变化时这个列表同步改。model-contract 的同名测试用同一方法，但该成员只有一个入口、没有传递依赖负例，所以两份 `install-consumer.spec.ts` 不相同。

纯判断（`inside`、制品源码、锁文件残留、空类型文件列表、护栏、联网回退决策、必需检查项清单）在快层的 `tests/install-judgment.spec.ts`。`finish()` 在所有检查通过但缺少必需检查项时使报告 `ok` 为 false，所以漏接一个判断会使对真实成员的正例变红。

### 转换目录测试

真实 Cordis 4.0.4 的 `Context` 驱动，不用 Cordis 的替身。目录由一个宿主插件在自己的 fiber 里构造，贡献者是另外的插件，各在自己的 fiber 里调用 `ctx.modelConverters.register`。

| 文件 | 内容 |
| --- | --- |
| `tests/converters-harness.ts` | 宿主与贡献者插件的搭建，和替代的资格权威 |
| `tests/converters.spec.ts` | 查找顺序（媒体类型先于模态，未登记返回 absent，视频模态键只供视频）、状态不在实例上（`Reflect.ownKeys`）、登记随调用方 fiber 撤除、已退出的 fiber 不登记（两条失败路径）、授权方拒绝与同步询问、被拒绝与被认回的登记不在调用方 fiber 上留 effect、授权方抛出、相同贡献认回、同键冲突（含同一 fiber、同采用、另一个转换件对象）、adoption 不一致、退役（阻止新取得、退役期间返回 unavailable 且不回退到别的转换件、排空后才报告完成、租约重复释放只释放自己、重复释放同一结果）、后继登记与旧租约（旧租约上的 `convert` 仍跑在原转换件上）、晚到的旧释放与旧 fiber 卸载不删后继、突然撤除不阻塞 fiber 卸载 |
| `tests/converters-keys.spec.ts` | 键与查询输入的格式：非规范媒体类型键（大小写、带参数、首尾空白、缺子类型、空串）与未知模态键的登记各返回 `invalid` 且目录不变（已登记的件照常出借）、被拒的键不占位（之后的规范登记不冲突）、被拒的登记不在调用方 fiber 上留 effect、规范键（含 `video` 模态）照常登记与出借、授权方先于键格式被问；`acquire` 对非规范媒体类型与未知模态返回 `invalid`（`field` 为 `mediaType` 或 `modality`）且不出借租约、规范输入照常 |
| `tests/converters-conversion.spec.ts` | 出借的包装转换件：`adoption` 与登记的相同，把调用和调用方的取消交给登记的转换件；突然撤除时在途的和之后的 `convert` 以 `unavailable` 结束、不启用别的转换件、不阻塞 fiber 卸载；有序 `release` 不取消在途转换；每次转换结束后目录加在 abort signal 上的监听已移除（用对 `EventTarget.prototype.addEventListener` 的临时监视取得目录的 signal，因为它不经转换件暴露） |
| `tests/converters-release.spec.ts` | 提供者的释放钩子：最后一个租约归还后才运行且只运行一次、作为登记输入的方法调用、运行期间该键仍返回 unavailable、突然撤除后同样运行、没有在途租约时在 fiber 卸载完成时已开始、钩子永不完成时该键一直 unavailable 且 `release()` 一直挂起；钩子抛出或拒绝时 `release` 返回 `{ removed: true, failure }`，每次同一结果，诊断不含提供者的错误文本，后继可取键 |
| `tests/converters-bounded.spec.ts` | 有界贡献量：取得、撤除、排空后，目录不再持有任何一份 |
| `tests/service-definitions.spec.ts`、`tests/cordis-entry.spec.ts` | 十四个抽象 Service 的键与类只写一次、由提供者发布为 `ctx.<键>`、随提供者 fiber 撤除；`./cordis` 的运行时导出集合 |
| `tests/garbage.ts` | 有界测试共用的垃圾回收入口 |

**替代的资格权威。** `ModelConverterAuthority` 在真实装配里由 `ModelConverterAuthorityService` 的提供者实现，它不在本包。测试用 `tests/converters-harness.ts` 的 `grantingAuthority` 和 `surrogateAuthority` 代替它：前者放行一切，后者放行一切并记录被问到的请求，也可令其拒绝。两者不核任何真实的系统来源或当前权限，只证明目录对授权方答案的处理。

**有界贡献量的测量。** `converters-bounded.spec.ts` 登记 64 个贡献，每个取得 3 个租约。偶数序号的贡献用 `release()` 退出，同时 fiber 保持存活；奇数序号的用卸载 fiber 退出。全部租约释放后，该测试检查三件事：每个键的 `acquire` 返回 absent；偶数序号的 fiber 上登记产生的 effect 已移除；用 `WeakRef` 观察的 64 个 converter 对象在垃圾回收后全部被清除，证明目录和 fiber 都不再持有它们。测试通过 `v8.setFlagsFromString('--expose-gc')` 取得 `gc`，取不到时失败，不跳过。它把贡献量和实测值写到标准输出一行，前缀 `[bounded-contribution]`。默认的 agent 报告器不显示通过用例的输出，要看这一行，运行 `pnpm exec vitest run --reporter=default tests/converters-bounded.spec.ts`。不设阈值。

**能发现与发现不了。** 这些测试能发现：登记落在目录自己的 fiber 而不是调用方的 fiber、状态放到实例上、退役件被当成不存在或被别的转换件顶替、排空前报告完成、晚到的旧释放删除后继、卸载 fiber 被租约卡住、释放后仍有引用残留、突然撤除时在途转换不以 `unavailable` 结束或落到别的转换件、有序释放误取消在途转换、释放钩子提前运行或重复运行、钩子失败被吞掉；还能发现登记接受非规范的媒体类型键或未知的模态键、`acquire` 把非规范输入当作同一键或为它出借转换件、被拒的键占位或留下 effect、授权方在键格式之后才被问。它们发现不了：真实的授权核验、跨进程行为，以及租约被持有者遗忘时该键长期返回 unavailable 的后果（见 [SPEC](../SPEC.md#转换目录的未决项)第 5 项）。

### 实例目录测试

同样由真实 Cordis 4.0.4 的 `Context` 驱动。目录由一个宿主插件在自己的 fiber 里构造，登记者是另外的插件，各在自己的 fiber 里调用 `ctx.modelInstances.register`。

| 文件 | 内容 |
| --- | --- |
| `tests/instances-harness.ts`、`tests/identities.ts` | 宿主与登记者插件的搭建、替代的资格权威、由所有者的解码器生成的租户与调用身份 |
| `tests/instances.spec.ts` | 定义（键只写一次、发布为 `ctx.modelInstances`、随宿主 fiber 撤除）、状态不在实例上且没有 `get`（`Reflect.ownKeys`）、`connect`（未登记返回 no-live-route、返回登记的同一 handle、两个租户的同一调用各自分开、非解析身份的租户被拒绝）、登记随调用方 fiber 撤除、已退出的 fiber 不登记（读注入服务同步抛出，旧引用 Promise 拒绝）、授权方在登记调用内同步被问、授权方的拒绝原样返回且不登记、授权方抛出、认回、同身份下只改 handle 对象、只改实例、只改代次、只改证据的 owner／record／revision／digest 之一，或换一个 fiber 的冲突、后继、token 条件撤除、重复与并发释放、fiber 卸载先于释放、晚到的旧释放与旧 fiber 卸载不删后继、effect 随释放移除、从不调用 handle |
| `tests/instances-bounded.spec.ts` | 有界登记量：登记与撤除后目录不再持有任何一个 handle，effect 已移除 |

**替代的资格权威。** `ModelPublicationAuthority` 在真实装配里由 `ModelPublicationAuthorityService` 的提供者实现，它不在本包。测试用 `tests/instances-harness.ts` 的 `grantingAuthority` 和 `surrogateAuthority` 代替它：前者放行一切，后者放行一切并记录被问到的请求，也可令其拒绝。两者不核任何真实的来源证据、发布资格或宿主身份，只证明目录对授权方答案的处理。

**能发现与发现不了。** 这些测试能发现：登记落在目录自己的 fiber、状态放到实例上或增加 `get`、覆盖已持有的键、不同租户互相可见、晚到的旧撤除删除后继、重复释放报告成功、释放后 effect 残留、撤除后仍有引用残留。它们发现不了：真实的资格核验、登记失败到根 `ModelFailure` 的映射（目录不做，见 [SPEC](../SPEC.md#实例目录的未决项)）、`connect` 的主体授权（目录不核）、宿主 publish 与 withdraw 的组合行为。

### 角色夹具

Cordis 消费插件是交接 G3 表的第六个角色；其余五个归 [model-contract](../../model-contract/verification/README.md#角色夹具)。夹具在 `tests/fixtures/consumers/cordis-plugin/`，必需角色清单是同目录的 `roles.json`。设施与判定同 model-contract 的角色夹具（`tests/install/**` 与 `tests/fixture-runner.ts` 与那一份字节相同）。运行整组：`pnpm --filter @omne-harness/model-cordis-contract run fixtures [--out <报告.json>] [--work-dir <目录>]`，先要构建闭包内的全部成员：`pnpm test` 只构建本成员，依赖成员在干净检出上须先用 `pnpm exec turbo run build --filter=@omne-harness/model-cordis-contract...` 构建。夹具直接依赖 `@deepseek-ai/cordis`（工作区锁定的 4.0.4）、`@omne-harness/model-cordis-contract`、`@omne-harness/model-contract`（`./testing` 的受控替代提供者与身份解码）、`@omne-harness/legal-identity` 与 `@omne-harness/operation-result`（租户与结果类型）；`forbidden` 另禁 `@omne-harness/model`、`@omne-harness/model-host-local` 与 pi。

夹具里有两个插件，都在真实的 Cordis `Context` 里运行：

- 装配方的宿主插件（`host.ts`）：用 `createScriptedModelProvider` 建的替代提供者，经 `class extends ModelRuntimeService` 提供在 `modelRuntime` 键上，只在 `calls.inspect` 上加计数，不替插件作任何判断；`announce` 在根 Context 上用 `root.parallel('model-cordis-contract/call-changed', …)` 发出通知（不是宿主插件自己的 `ctx`），捕获监听者的失败并记录，不改已提交的结果（IC-12）。它只是装配，不是被测对象。
- 被测的消费插件（`plugin.ts`）：`inject: [modelRuntimeKey]`（字面量数组，键常量取自 `./cordis`，不用可选键），经 `ctx.on` 监听通知；先按配置里的租户过滤，修订不比已知新就不理，否则用 `ctx.modelRuntime.calls.inspect` 取权威修订，比已知新才刷新。主体由装配经插件配置交给它。订阅随插件 fiber 卸载撤除。

| 路径 | 种类与决策 | 在什么缺陷下变红 |
| --- | --- | --- |
| a notification is followed by a look at the runtime and the plugin takes the revision found there | 正常。通知只写第一次变化，运行时已到第二次：断言记录的租户、调用与修订是运行时给出的第二次修订，且只查询一次 | 插件采用通知里的修订而不是权威修订；不查询就刷新 |
| a notification of another tenant is dropped before the runtime is asked | 正常。别的租户的通知：查询次数为 0，已知修订不变，没有刷新 | 缺租户过滤，或先查询后过滤 |
| the runtime the plugin receives is the definition class on the key of its constant | 正常。`ModelRuntimeService.provide`、`modelRuntimeKey`、宿主类的 `provide` 相等；插件收到的服务是 `ModelRuntimeService` 的实例，也是宿主那个类的实例；Cordis 按键提供任何东西，识别归消费者：同一键上结构相同的另一个类会被 Cordis 交给插件，插件在写任何状态之前按定义类拒绝它（失败路径 `a class with the same members on the key of the definition is served by Cordis and refused by the plugin`） | 定义类在夹具与装配之间不是同一个；键常量与 `provide` 不一致；插件接受结构相同而不是定义类的服务 |
| a plugin that is unloaded no longer answers notifications | 正常。卸载前插件响应一次；卸载后再发通知，查询次数与刷新记录都不变 | 订阅没有随插件 fiber 撤除 |
| a notification that is not newer than the known revision is not refreshed | 失败。决策：插件保持已知修订，不为不比已知新的通知再向运行时查询。较旧的通知与重复的通知：已知修订不回退，没有新刷新，查询次数不增 | 采用较旧的通知而使修订倒退；每个通知都刷新或都查询 |
| a runtime that refuses the lookup ends the following of that call | 失败。决策：插件停止跟踪该调用，丢掉它的修订，之后同一调用的通知不再查询。拒绝不当作监听失败，发送方没有记录 | 拒绝被忽略后继续跟踪；拒绝被当作故障抛给发送方；停止后仍反复查询 |
| an admission that the runtime does not accept is raised to the sender of the notification and changes nothing | 失败。决策：运行时对不认识的 admission 给出权威的 `not-accepted`（成功值，不是查询失败），插件把它当作监听者的失败抛出，发送方记录并保留已提交的变化，插件保持跟踪与已知修订。查询一次，没有刷新，没有停止跟踪 | `not-accepted` 被当作找到而刷新；被吞成成功；失败后插件状态被改写或停止跟踪；改变了提交的结果 |
| a lookup that fails is left to the sender of the notification and changes nothing | 失败。决策：插件不捕获查询失败；用保留值 admission（主体以 `--` 开头）使运行时对 `inspect` 返回 `failure`（契约固定为 `invalid`，[SPEC](../../model-contract/SPEC.md)），夹具只断言不成功：发送方记录监听者的失败并保留已提交的变化，插件保持跟踪与已知修订 | 监听失败被吞成成功（插件对非 `denied` 失败的分支）；失败后插件的状态被改写或停止跟踪；失败改变了提交的结果 |

报告会逐条列出每条路径的名字与结果，路径数以运行报告为准。失败路径用保留值 admission 制造 `invalid`；`inspect` 的其他失败种类（例如 `unavailable`）脚本提供者没有受控的制造办法，插件对非 `denied` 的失败走同一分支，所以它们没有各自的路径。

#### 角色夹具的限度

- 变化通知的发送方是装配替代：契约没有指定谁发出（SPEC 只写「发送者捕获监听失败」），夹具里的宿主插件扮演发送方。所以这些路径证明消费插件怎样处理通知，不证明生产提供者按契约发出了通知。
- 主体由插件配置交给插件，放进 `Access`，可信身份适配器不在这里；夹具不验证主体怎样成为可信的。
- 替代提供者的结果由脚本给出，证明插件在契约面上看到的结果，不证明真实提供者的查询、持久与恢复。
- 页面没有规定可选依赖缺席时是等待还是失败，夹具的插件只依赖必需的 `modelRuntime`，不用可选的 `modelCredential`，所以这一条没有覆盖。
- 「失败路径的 `decision` 是给人读的说明」：设施不做机器比对，每条路径自己的断言执行并检查它所说的决策，评审时逐条核对。
- 「不从 model-host-local 或 model 导入 Service 定义，不靠全局容器发现内部对象」在依赖层由设施执行（`forbidden-declared`、`forbidden-installed`）；夹具只经 `ctx.modelRuntime` 与 `inject` 取得服务，没有 `ctx.get`、没有全局容器。导入层没有单独的设施检查，评审读 `tests/fixtures/consumers/cordis-plugin/` 下各文件的导入语句核对。路径与决策在同目录 `fixture.ts` 的 `fixture.paths`，对应关系见上面的[角色夹具](#角色夹具)路径表。

### 未覆盖

- 登记失败到根 `ModelFailure` 的映射没有测试，也没有实现，见 [SPEC](../SPEC.md#实例目录的未决项)。
- 页面与源码的声明逐字比对对 `ModelInstancesService` 与 `ModelConvertersService` 的 `register` 没有：它们在页面上以属性形式声明，类型相同由 `tests/cordis-entry.spec-d.ts` 检查。
- Cordis 消费插件夹具已写，只覆盖[角色夹具](#角色夹具)的八条路径与它列出的限度。Service 类单一身份只检查运行时服务一个（`ModelRuntimeService`），其余十四个抽象类与两个具体目录不在此内。已落地的 Context 增补与键常量的类型由 `tests/cordis-entry.spec-d.ts` 检查。
- 离线安装依赖本机 pnpm 存储里已有的精确版本，缺失时运行失败，设施不自行联网；`--allow-network` 路径只由替身运行器的单元测试覆盖。
- 检查项是否接进报告由对真实成员的正例核对。判断函数收到的输入是否真实不在其内，说明见 [model-contract 的未覆盖](../../model-contract/verification/README.md#未覆盖)末条。
- 类型断言检查放在 model-contract。本成员的 Service 实现可能合法地使用断言，所以不套用同一规则。
- 页面不保存声明，没有页面与源码的形状比较。本成员的 `tests/registration-types.spec-d.ts` 与 `tests/cordis-entry.spec-d.ts` 检查已导出名字的形状，不读页面。`sameAs` 检查只证明 `./cordis` 与根入口是同一声明。

## Model Cordis 持续验证

### 验证义务

本成员实现至少验证根入口无Cordis、定义入口不引具体提供者、静态键唯一、必需/局部/可选依赖的实际撤除范围、旧引用拒绝及当前身份核验。当前真实4.0.4探针仅支持共同页所列机制，根操作的持久性、跨进程、外部效果和业务接受须另由实际提供者证明。

领域外 Cordis 消费插件由角色夹具持续验证：夹具 `tests/fixtures/consumers/cordis-plugin/` 从打包的制品安装，只依赖各自声明的包，运行命令 `pnpm --filter @omne-harness/model-cordis-contract run fixtures`，报告逐条列出路径名与结果。它覆盖静态注入唯一的运行时服务定义、取得领域操作、处理带身份的变化通知，路径有：通知后取权威修订并刷新、别的租户的通知被过滤、插件收到的服务是定义类、同一键上结构相同的类被插件拒绝、卸载后不再响应，以及通知修订不比已知新不刷新、查询被拒绝则停止跟踪、查询失败留给发送方记录且不改提交结果。未覆盖：可信身份适配器（夹具里的主体由插件配置交给插件）、真实提供者作为通知发送方（夹具的宿主插件扮演发送方）、可选依赖缺席时的等待或失败。覆盖与限度见[角色夹具](#角色夹具)。

至少覆盖同步当前资格核验、caller-fiber 登记、同身份冲突、token 条件撤除、旧释放不删后继、转换器取得后固定采用及撤除排空。装配组合检查由[宿主设计](../../model/docs/cordis.md#接入检查)拥有。

当前有测试的是：凭据服务 `ModelCredentialService` 的发布、转发、随提供者撤除；十四个抽象 Service 的键与发布；实例目录 `ModelInstancesService`（见[实例目录测试](#实例目录测试)）；转换目录 `ModelConvertersService`（见[转换目录测试](#转换目录测试)）；另有 build、typecheck、导出清单与安装闭包。生产插件的生命周期尚无定义，也没有验证。两个目录的未决项见 [SPEC](../SPEC.md#实例目录的未决项)与 [SPEC](../SPEC.md#转换目录的未决项)。检查根值依赖、声明、实际 import 与安装闭包时，Cordis 契约可安装框架，但不得安装 Model 业务实现或厂商包。
