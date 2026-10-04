# Cordis 集成约定

本项目做出来的东西，怎样以 Cordis 插件与服务的方式接进系统：能力接缝怎么立、依赖怎么声明、事件怎么命名与派发、
登记怎么撤、配置怎么校验、一个进程挂哪些插件怎么写。

- 状态：已接受（[D-114](../record/decisions/cordis-integration-conventions/README.md)，2026-10-02）。
- 约束谁：新写或修订的提供者节点与装配节点，以及照这些节点写的代码。节点模板的「Cordis 符合性核对」表由本约定导出（见[最后一节](#与符合性核对表的对应)）。
- 它不是契约：不进 `spec/`，不改任何契约的语义。契约写性质；这里写装配时怎样满足 Cordis 的契约规范
  （[D-112](../record/decisions/cordis-as-assembly-contract/README.md)）。失效事件是实现换方案或上游换版本——
  Cordis 升版时先跑 [basis](../basis/README.md) 的全部 probe，失败的条目对应的规则跟着复核。
- 起点：DeepSeek Harness 在 `639ed015` 上的 17 条约定（[调研](../../research/dsh-cordis-integration-conventions/research.md)，下文记作「DSH #N」）。
  每条规则标一种处置：**采用**（照 DSH 做）、**改造**（取 DSH 的做法、改其中一处）、**自补**（DSH 没有）；不取的单列一节。
- 用词：能力接缝与它的三个角色、Cordis 插件树与插件树层，定义见[统一语言](../ubiquitous_language/terms/architecture-core-and-extension.md#ul-capability-seam--能力接缝--capability-seam)；
  本文的「插件」一律指 Cordis 插件，不是资产里的插件。

「怎么守」一栏写到这条规则靠什么被发现违反：内核（违反即抛错）、现有检查、读数（只报告；标「待建」的还没有）、评审问法、或归人。
**除内核与现有硬线外，读数一律只报告**，见[迁移与读数](#迁移与读数)。

## 一、能力接缝：服务定义在 `core`，键只写一次

| 编号 | 规则 | 处置 | 理由 | 依据 | 怎么守 |
|---|---|---|---|---|---|
| IC-1 | 每个能力接缝恰有一个 Cordis 服务定义，放在 `packages/core/` 的一个包里（下称定义包）。接缝出自一份能力契约（`capability.*` 或 `composition.*`）的，这份契约的全部接缝放同一个定义包，包名取契约 ID 去掉种类前缀（`capability.session-log` → `core/session-log`）。接缝出自某个 `core` 包拥有的协议形状、没有自己的能力契约的，定义放进那个包（`storage` → `core/storage`，`clock` → `core/offer-expiry`）。装配入口要交给插件的运行时对象（迁移提供者、启动信号、维护回调）同样经接缝交：定义放在拥有那份形状的 `core` 包，装配入口 provide、插件 inject（IC-16）。提供者与消费者都不持有服务定义 | 改造：DSH #1、#3 的三角色照用；定义一律进 `core`（DSH 允许定义留在领域包） | 服务键与接口今天写在提供者包里，消费者为拿它们 import 提供者——32 对注入边里 14 对因此同时是 import 边；`storage`、`clock` 的键常量各有三份，`memberships` 两份。按契约分包，因为契约是带版本的语义单位：按领域合成一包会让不相干的契约一起变，全放一包则谁都依赖全部 | 负责人 R6（D-114）；[调研：32 对中有 14 对](../../research/architecture-judgment-aids/research.md)；DSH #1、#3 | 读数：服务定义不在 `core`（待建）；评审 |
| IC-2 | 服务键只写一次：抽象 `Service` 以 `static readonly provide = '键'` 声明键，构造函数 `super(ctx, <类>.provide)`，定义包导出的键常量取自它。提供者 `extends` 这个抽象类，不另写键，也不自己 `ctx.provide` 这个键；消费者引用定义包的键常量。一个插件提供几个键（同一份实现的几个服务面）时，在插件体里逐个 `new` 各键的子类，它们都登记在这一条插件的 fiber 上；也可以把子类本身当插件装、一个键一条 fiber——按节点设计里的撤除与在途语义选，并写明理由 | 采用 DSH #3；`static provide` 与多键写法自补 | 键只有一处，改名不会漏；子类装上即在那个键上提供。`static provide` 让自建的插件树加载器与读数不必实例化就读得出这个类提供哪个键（Cordis 的插件元数据也认 `provide`） | [basis `service-subclass-provides-its-key`](../basis/cordis/service-subclass-provides-its-key.md)（含一个插件体里 `new` 两个子类的用例）；Cordis 4.0.4 `service.ts:43`、`registry.ts:107-108` | 读数：同一服务键在多个包里定义（待建） |
| IC-3 | 服务定义的形状：抽象 `Service`（不含实现），或具体的注册表 `Service`（含登记逻辑，本身可作提供者装上）；不是只有类型的 `interface`。抽象 `Service` `implements` 根入口里的操作类型，同一组签名不写两份。类上的 JSDoc 写 `@contract <契约 ID>`，只写 ID、不写版本；接缝出自协议形状、没有契约的，改写 `@owner <拥有它的 core 节点路径>`（如 `packages/core/storage`），二者必有其一 | 采用 DSH #3；`@contract`／`@owner` 自补 | 只有 `Service` 占键、方法里才拿得到调用方的 ctx（IC-13 靠它）；`@contract` 让读数能从代码走回契约；版本归节点的绑定，写进代码就要随契约升版改注释 | DSH #3；[basis `service-method-ctx-is-caller`](../basis/cordis/service-method-ctx-is-caller.md) | 读数：服务定义既没有 `@contract` 也没有 `@owner`（待建） |
| IC-4 | **包的两面**：每个包的根入口与 Cordis 无关——定义包的根入口放词汇类型、操作类型与纯函数；提供者包的根入口放不依赖 Cordis 的公开函数面（函数或工厂）。Cordis 绑定（键、`Service` 类、`Context` 与 `Events` 增补、插件）一律放同包的 `./cordis` 入口。根入口不 import `@deepseek-ai/cordis`，也不 import 本包的 `./cordis`。`core/kernel-basis` 与 `apps/` 不受此条约束 | 自补（DSH 不分面）；负责人 2026-10-02 同意（O1） | [SYS-OPEN](../foundation/cross-system-constraints/requirements.md#sys-open) 要求每个节点区分公开函数面与 Cordis 服务面、前者不被后者吞没；分成两个入口，这条就能机器核对，不用 Cordis 的使用者也不加载它（`@deepseek-ai/cordis` 仍作为依赖安装）；比拆成两个包少一半成员 | SYS-OPEN；R6 | 现有 lint `core-pure-imports` 只管登记在它清单里的纯 `core` 包、扫整个 `src/`。要守本条得扩三处：新定义包逐个登记、按入口区分根入口与 `./cordis`、只在 `./cordis` 放行 `@deepseek-ai/cordis`——首个照本条建的定义包随包一并扩；读数：根入口引入 Cordis（可做，未排期）；评审 |
| IC-5 | 消费者只依赖服务定义：按服务键取用，不 import 提供者包。别的成员为正确使用一份契约的数据而要用的纯函数（编解码、校验、比较）是契约的词汇，放定义包的根入口；提供者包只留实现自己的东西。非装配成员的跨成员 import 只指向 `core` 与 `util`；例外只有一类——为同一提交导出的事务内读函数——在节点设计里声明，并写出两个写入者共同触碰的存储对象 | 采用 DSH #1、#4，收紧成 import 方向 | 消费者 import 了提供者，换提供者就得改消费者，接缝形同虚设。现状另有成批纯函数在提供者之间 import（如 `loop-extension-runner` 从 `model-request-runtime` 取日志条目的编解码与比较），它们迁移时进对应的定义包，定义包因此不只是类型。写出共同存储对象，是为了把同一提交的例外与图方便的 import 分开 | DSH #1、#4；[调研：32 对中有 14 对](../../research/architecture-judgment-aids/research.md) | 意图对实现对照的 import 一侧（待建）；组间方向与环仍归 lint `group-direction`（硬线一） |
| IC-6 | 同一个 isolate 标签下，一个接缝只有一个提供者在场；要两份实现并存，分到不同的 isolate 标签下，并在装配节点写明谁看见哪一份 | 采用（Cordis 语义；DSH #3 末句） | 同标签下第二个提供者装载即失败 | [basis `isolate-hides-instances-not-data`](../basis/cordis/isolate-hides-instances-not-data.md) | 内核：第二个提供者装载时抛错 |
| IC-7 | 命名：定义包取契约名（IC-1）；提供者包取限定名，说出实现方式或后端（`storage-sql`、`session-log-jsonl`、`credential-custodian-local`），只有一个提供者时也一样。服务键用 camelCase 名词，说能力不说实现（`storage`，不是 `sqlStorage`） | 采用：DSH 的 shell 接缝即如此（定义 `dsh-shell`，提供者 `dsh-bash-local`／`dsh-bash-sandbox`）；本仓库 `core/storage` ↔ `infra/storage-sql` 同此 | workspace 的包名只取第二层、必须唯一，定义与提供者同名会撞；被 import 最多的是定义，简名给它，提供者只被装配引用。代价：与契约同名的存量提供者包迁移时要改名，连同节点目录与设计链里的链接（清单见[迁移与读数](#迁移与读数)）。不取「定义包带限定名、提供者不动」：那会让最常被 import 的名字最长，也与 DSH 的做法相反 | DSH `639ed015:.agents/notes/implemented/architecture/2026-06-13-capability-seams.md:17-19`；[两层布局](README.md#packages-的两层布局)；现状：服务键 23～24 个（正则粗读，精确值以语法树抽取为准），只有 `organization-purge` 是 kebab | 评审 |

## 二、依赖

| 编号 | 规则 | 处置 | 理由 | 依据 | 怎么守 |
|---|---|---|---|---|---|
| IC-8 | 必需依赖写在 `inject`：数组字面量，元素是字符串字面量或从定义包 import 的键常量；不在运行时拼、不经变量转手。写进去就等于「它换代或不在，我就卸载重跑」。插件里只有一段工作需要某个依赖时，用 `ctx.inject([...], cb)` 把那段放进子 fiber，不把整个插件挂在它上面 | 改造 DSH #5（它只许字符串字面量；本项目允许键常量，因为键在定义里只写一次，常量就是对那一处的引用） | 意图要能从源码静态读出来，读不出就无从对照 | DSH #5；[basis `inject-has-no-optional-form`](../basis/cordis/inject-has-no-optional-form.md)、[`plugin-body-reruns-on-provider-change`](../basis/cordis/plugin-body-reruns-on-provider-change.md) | 读数：`inject` 不是字面量（待建；常量在全 workspace 还原，还原不出的逐条报） |
| IC-9 | 可选依赖不写进 `inject`：调用时用 `ctx.get(键)` 或 kernel-basis 的 `resolveOptional` 现取，接受 `undefined`，按契约的缺席默认答案收场；`ctx.<键>` 只留给 inject 过的键；只要类型增补时写 `import type {} from '<定义包>/cordis'`。节点写明提供者换代时手上的旧引用怎么处置 | 采用 DSH #6；换代政策自补 | 插件里没声明就读 `ctx.<键>` 会抛错，能不能取到还取决于祖先 fiber 声明过什么；把可选依赖 import 成运行时依赖，又会把它变回必需 | DSH #6；[basis `ctx-property-is-not-ctx-get`](../basis/cordis/ctx-property-is-not-ctx-get.md)、[`inject-has-no-optional-form`](../basis/cordis/inject-has-no-optional-form.md) | 读数：可选依赖被运行时 import（待建）；核对表第 3 行 |

## 三、事件

| 编号 | 规则 | 处置 | 理由 | 依据 | 怎么守 |
|---|---|---|---|---|---|
| IC-10 | 事件名 `<范围>/<事件>`，全小写 kebab。范围是声明它的那个包的名字（不带 `@omne-harness-lite/`）；跨成员事件的范围取它所属定义包的名字，迁移途中暂时声明在别处也不改。通知（`emit`、`parallel`）的事件部分用过去分词，可带对象前缀（`session-log/appended`、`organization-governance/membership-changed`）；控制（`serial`、`bail`、`waterfall`）的事件部分用动词原形，说被问的那个动作（`tool-admission/admit`） | 改造 DSH #7（它只定了 `<scope>/<event>`；DSH #16 显示时态不齐） | 范围取包名，唯一且能机检；稳态下就是定义包名，迁移时不必改两次。时态一看就分出通知与控制。一个包里几个插件发的事件共用一个范围，事件名本身说不出是哪个插件发的——要分，写进事件部分 | DSH #7、#16；现状：13 个事件里 9 个用点分（`account.activated` 等），4 个斜杠写法里 `serving`、`listening` 是进行时、`defect` 是名词，`governance-center-ops/listening` 的范围也不是包名 | 读数：格式、范围是不是包名、`@mode` 与派发点是否一致（待建）；时态与词性只能启发式判，归评审 |
| IC-11 | 事件在声明它的包的 `./cordis` 入口增补 `Events`：跨成员监听的事件由拥有它的服务定义包声明，只在一个成员内部用的留在该成员。每个事件的 JSDoc 写 `@mode`（五种派发之一）与载荷的 `@param`；节点声明的派发模式与它一致 | 采用 DSH #8；与节点一致自补 | 派发模式是事件声明的一部分，写在声明处，监听者与发起方读的是同一句 | DSH #8；现状：13 个事件没有一个写了 `@mode` | 读数：缺 `@mode`、代码的 `@mode` 与节点声明不符（待建） |
| IC-12 | 派发：**可否决的异步控制用 `serial`，不用 `bail`**——`bail` 不等 Promise，Promise 本身被当成否决值；`bail` 只承载同步判定；`waterfall` 用于环绕改写。通知有两种：`emit` 的监听者同步执行、**不得返回 Promise**（要做异步的事自己起、自己兜住失败）；要等异步监听者的通知用 `parallel`。两种都由发通知的一方包住（`emit` 包 `try`，`parallel` 在 `await` 外包）：监听者失败只记一条诊断，不改变已提交操作的结果 | 自补（DSH 的事件分类笔记不列 `bail`，其源码仍有 5 处） | 授权检查返回 Promise 时，`bail` 会静默放行。`emit` 不隔离监听者，同步抛出会让已提交的操作对调用方报失败；`emit` 不等 Promise，异步监听者的 reject 包不住、成了未处理的拒绝；`parallel` 把任一监听者的 reject 合成 `AggregateError` 抛给发起方 | [basis `async-control-not-bail`](../basis/cordis/async-control-not-bail.md)、[`emit-listener-throw-propagates`](../basis/cordis/emit-listener-throw-propagates.md)；Cordis 4.0.4 `events.ts:183-187`（`parallel`）、`:194-196`（`emit`）；实现映射[红线](AGENTS.md#红线) | 现有 lint `no-bail-control`；读数：`@mode emit` 的事件有异步监听者（可做，未排期）；评审 |

## 四、登记与撤除

| 编号 | 规则 | 处置 | 理由 | 依据 | 怎么守 |
|---|---|---|---|---|---|
| IC-13 | 登记即效应：注册表 `Service` 的 `register()` 在方法里用 `this.ctx.effect(...)` 登记并返回撤除函数——登记落在**调用方**的 fiber 上，调用方撤除即撤掉；监听一律经 `ctx.on`。注册表不自己记「谁登记了什么」再等人注销。节点的验证义务里写一条：贡献者卸载后，它的登记不在了 | 采用 DSH #9；验证义务自补 | 撤除由内核随调用方自动发生，贡献者崩溃或被撤时登记不漏。这只对 `Service` 成立：用 `ctx.provide` 登记的普通对象拿不到调用方的 ctx。也只对插件里的调用成立：在根上下文（不在任何插件里）调 `register()`，效应落在根 fiber 上，不随谁撤除——只供测试与装配入口这样用 | DSH #9；[basis `service-method-ctx-is-caller`](../basis/cordis/service-method-ctx-is-caller.md) | 节点验证义务里的测试；评审 |

## 五、配置

| 编号 | 规则 | 处置 | 理由 | 依据 | 怎么守 |
|---|---|---|---|---|---|
| IC-14 | 插件配置用 Standard Schema 校验（函数插件经 kernel-basis 的 `definePlugin`，`Service` 子类写静态 `Config`；Cordis 4.0.4 对两种插件都按 Standard Schema 校验，`registry.ts:104`、`fiber.ts:50-53`）；可调参数——重试、退避、超时、限流、阈值——写成配置字段，默认值只是初值；配错在加载时失败（fiber `FAILED`），不静默跳过缺失的引用 | 采用 DSH #10，改造校验器（DSH 用 schemastery） | 配错晚发现，代价是运行中的静默错误 | DSH #10；[basis `plugin-throw-fails-fiber`](../basis/cordis/plugin-throw-fails-fiber.md)；研发品味「策略类的东西不写死」 | 现状已一致；评审 |

## 六、Cordis 插件树

| 编号 | 规则 | 处置 | 理由 | 依据 | 怎么守 |
|---|---|---|---|---|---|
| IC-15 | 一个进程挂哪些 Cordis 插件、各带什么配置，写成数据：[Cordis 插件树](../ubiquitous_language/terms/architecture-core-and-extension.md#ul-cordis-plugin-tree--cordis-插件树--cordis-plugin-tree)由两格[插件树层](../ubiquitous_language/terms/architecture-core-and-extension.md#ul-plugin-tree-layer--插件树层--plugin-tree-layer)叠出——发行层在前、运维者层在后；没有组织、租户或会话这几格 | 改造 DSH #11（它叠 bundle、profile、home 与 `--patch` 多级） | 装配写成数据，运维者不改代码就能换一个提供者或调一项配置；层数由负责人定为两格 | 负责人 R7；[UL-D-7](../ubiquitous_language/decisions.md#ul-d-7--能力接缝与-cordis-插件树--2026-10-02)；DSH #11 | 装配节点的机读声明；评审 |
| IC-16 | 插件树的一行 = 行 id ＋ 插件（包名与它 `./cordis` 入口里的导出名）＋ 配置。配置只放可序列化的数据；运行时对象（迁移提供者、信号、回调）不进树，由装配入口 provide 成服务、插件 inject（定义归属见 IC-1）。运维者层按行 id 整行替换配置、停用或插入新行；**指向不存在的行 id 即启动失败**；进程能打印最终的树，并标出每一行出自哪一层。发行层的行 id 因此是对运维者的稳定承诺：改名或删一行要写进装配节点的变更记录与发行说明 | 采用 DSH #11 的补丁语义（按行 id、整行替换、插入、打印最终的树）；改造两处：悬空补丁由告警改为启动失败，打印时标来源层 | DSH 的补丁函数遇到找不到的 id 只告警、跳过（`639ed015:vendor/include/src/index.ts:83`、`:111`），运维者写错一个 id 会静默不生效。代价是另一侧：发行层删或改名一行，给它打过补丁的部署升级时启动失败，必须同步改补丁——宁可大声失败，不要静默失效。加载器自建：[SYS-KERNEL](../foundation/cross-system-constraints/requirements.md#sys-kernel) 只采用 Cordis 本体，DSH 的 `cordis-plugin-loader`／`-include` 不在采用范围内，要引入须另立采用决定 | DSH #11；SYS-KERNEL | 装配节点的测试（悬空补丁即失败、打印出来源层）；评审 |

## 七、按会话装上的 Cordis 插件

| 编号 | 规则 | 处置 | 理由 | 依据 | 怎么守 |
|---|---|---|---|---|---|
| IC-17 | 运行中按会话为 agent 装上的 Cordis 插件**不进**插件树。原则：它们落在会话这一级的作用域里——事件按作用域过滤，撤除按作用域整体撤，故障不出作用域，登记不漏到别的会话。机制与正式名由「按会话装插件的作用域」这份设计定（UL-D-7 没有为它立词） | 改造：DSH #12、#13（agent preset 与 `dsh-scope`）只作那份设计的候选输入，不直接采用 | 机制要先过一遍需求与领域读数才定得下来；DSH 两处文档对「子作用域是否继承」说法相反 | UL-D-7；DSH #12、#13；[调研：两处文档说法相反](../../research/dsh-cordis-integration-conventions/research.md) | 归人 |

## 八、本项目自补

| 编号 | 规则 | 处置 | 理由 | 依据 | 怎么守 |
|---|---|---|---|---|---|
| IC-18 | 租户身份显式：跨边界操作的租户身份是操作的参数（或参数里的身份值），不从 `ctx`、isolate 标签、插件实例或「谁装了这个插件」推断；不把「不 inject 就够不着」当访问控制 | 自补 | isolate 隔的是实例的可见性，不是数据；`ctx.get` 看得见整棵树 | [SYS-TENANT](../foundation/cross-system-constraints/requirements.md#sys-tenant)；basis [`isolate-hides-instances-not-data`](../basis/cordis/isolate-hides-instances-not-data.md)、[`inject-has-no-optional-form`](../basis/cordis/inject-has-no-optional-form.md) | 评审（L3 逐行读的热点） |
| IC-19 | 装配给与协议给：契约里靠同一进程、同一 Context 才成立的保证，节点在核对表里写明此刻靠什么兑现；拆成多进程时，它们要由协议重新兑现 | 自补 | 单机先行，但不能让同进程才有的保证悄悄变成分布式后的缺口 | [SYS-DEPLOY](../foundation/cross-system-constraints/requirements.md#sys-deploy) | 核对表第 7 行；评审 |

## 九、不取的 DSH 约定

| DSH | 不取的理由 |
|---|---|
| #2 不预拆：只有一个提供者与一个消费者时留在一个包 | 被 IC-1 取代：服务定义一律进 `core`（R6） |
| #14 由声明生成服务图与事件矩阵、#17 手工维护的服务分类表 | 生成方式不照搬。对应物是两样：只画意图、从节点声明生成的 `system-map` 视图，与从代码抽取的审讯页依赖矩阵；分类信息来自节点声明，不另立一张手工表 |
| 与 DSH 自身产品绑在一起的约定：浏览器端与宿主两套编译面、Typert、i18n 元数据 | 本项目没有这些产品形态（[调研「代价与不适用」末条](../../research/dsh-cordis-integration-conventions/research.md)） |

DSH #15（包级没有方向规则、环不报错）是 DSH 的缺口，不是约定；本项目的方向与环是硬线，不受影响。

## 迁移与读数

- 新代码、新写或修订的节点照本约定写。
- 偏离的接收：本次变更新增的偏离进「要解释的红项」，由实施者交代；存量偏离与「缺失」进体检页，作迁移清单；
  **实施者不许改节点的装配声明来消红**。四条硬线不因本约定增减，本约定的读数只报告（负责人 R1、R2）。
- 存量代码不在本约定生效时回改（负责人 R8）。`main` `34bae69bf` 上的存量偏离：
  - 没有一个提供者用 `Service`：`packages/` 里 17 个成员、25 处 `ctx.provide(键, 对象)`，`apps/` 里 0 处；
  - 服务键常量定义在 16 个提供者包里，`storage`、`clock` 各三份、`memberships` 两份；`core` 里没有一个服务定义；
  - 13 个事件：9 个用点分，4 个斜杠写法里 3 个时态或词性不合；没有一个写了 `@mode`。那 4 个受 lint `ops-event-whitelist` 按导入名把关，改名要同步改规则；
  - 进程一级的装配：`apps/tenancy-host/src/manifest.ts` 是代码，运行时对象（迁移提供者、升级核对与守卫、启动信号、维护回调）经配置交进 `storage-sql`、治理中心入口与运维面三个插件；
  - 提供者之间成批 import 纯函数（如 `loop-extension-runner` 从 `model-request-runtime`、`session-log-jsonl`、`assembly-manifest-store` 取编解码与校验，`model-request-runtime` 从 `model-profile-directory` 取 `winningRow`，`pi-ai-transport` 从 `model-request-runtime` 取凭据脱敏与历史复制）。
- 迁移要付的价，逐项写在这里，免得被当成「照约定改改就行」：
  - **改名**：已建包且与契约同名的 7 个提供者要改成限定名——`tenancy/account-identity`、`tenancy/organization-governance`、`tenancy/account-registration`、`tools/asset-registry`、`model/model-profile-directory`、`model/model-request-runtime`、`agent-loop/loop-extension-runner`。每改一个，连带：包目录与 `package.json` 名、所有 import 方与装配、实现映射节点目录（节点路径与源码路径逐字相同）、设计链里指向它的链接、按路径写的 lint（如 `ops-event-whitelist`）。另有 5 个同名节点尚未建包（`tools/tool-execution-runtime`、`tools/mcp-bridge`、`assets/asset-governance`、`model/modality-projection`、`agent-loop/hooks-import`），建包时直接用限定名，只改节点目录；
  - **节点修订**：`tenancy-host` 迁到插件树时，`storage-sql`、治理中心入口与运维面三个节点已接受的配置形状要拆——可序列化的留在配置，运行时对象改成装配入口 provide、插件 inject 的服务，定义放进拥有其形状的 `core` 包（迁移片段与迁移前核对的形状已在 `core/storage`）。这三个节点因此各出一次修订，过设计评审；
  - **定义包变厚**：上面那批提供者之间的纯函数，属于契约词汇的进对应定义包的根入口；定义包不只是类型。
- 迁移另立方案，按成员一个变更做；先建定义包、再改提供者，事件名与键就只改一次。

## 与符合性核对表的对应

节点模板 `.templates/node/design.md` 的「Cordis 符合性核对」表，每一行对应下列规则；
只装了纯数据、没有任何 Cordis 插件的节点，整节写一句「不适用：纯数据不进 ctx」。

| 核对表行 | 对应规则 |
|---|---|
| 1 插件边界 | 手册步骤 F；本约定不另立 |
| 2 服务声明 | IC-2、IC-3、IC-4 |
| 3 注入 | IC-8、IC-9 |
| 4 装载与撤除成对 | IC-13 |
| 5 在途工作 | 手册步骤 F；本约定不另立 |
| 6 事件派发 | IC-12 |
| 7 内核不给的保证 | IC-19 |
| 8 作用域与可见性 | IC-6、IC-17、IC-18 |
| 9 上游语义有出处 | 各规则「依据」栏引的 basis 条目 |
| 10 机制没有回写契约 | D-112 |
| 11 接缝角色（新增） | IC-1、IC-5、IC-7 |
| 12 事件命名与声明（新增） | IC-10、IC-11 |
| 13 配置（新增） | IC-14 |
| 14 插件树（新增，只给装配节点） | IC-15、IC-16 |

返回[实现映射](README.md)。
