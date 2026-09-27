# 验证覆盖与实际证据

本文件在版本目录之外，可更新；结果始终绑定实际的规范修订与实现修订。

## v3 候选与证据义务

2026-09-27：在 `panqiwei/model-request-runtime`、基线 `d4eaf767` 上起草
[`data.model-profile/v3`](v3/contract.md)。v2 已接受并冻结；v3 未接受、未冻结，不把 v2 的接受与既有证据提升为 v3 已验证。
版本目录仍只有契约、Schema 和规范实例三项；可变验证记录留在本文件。

| 规范/性质 | 证据方式与输入 | 当前状态 | 责任与受阻消费者 |
|---|---|---|---|
| S-29 必填、三组分量闭合、字符串边界 | Schema 正反实例第 11、12 节，及三个档案表示的必填回归；显式空白码点、尾随换行/U+FEFF 均检查 | 本地 Schema 自检通过；未归档，非实现验收 | 规格工具与 core/model-profile；缺绑定不得补默认 |
| S-31 模型 ID 一致及 S-25 优先级 | 表示层校验的纯计算检查；examples 第 12 节的 Schema 通过而完整校验拒绝、与空路由名和输出上限同时错误场景 | 未开始 | core/model-profile；只运行 Schema 不足以通过 |
| S-30 配置 JSON 与数无损 | 严格解析重复成员、NaN、尾逗号及精确大整数/小数的往返；以 content-blocks/v2 S-24 的共同语义为依据 | 未开始 | 配置接收边界与 core 公共 JSON 设施；不能由 Schema 实例检查替代 |
| S-29 修订命名域、不原地改义、值相等 | examples 第 13 节；同档案改值不改修订被阻止，不同租户可用同修订字符串但保留各自 values；对象次序不影响相等、数组次序与精确数值参与比较 | 未开始 | 实现/定义/档案写入者；不能仅测结构合法 |
| S-27/S-29 调用快照完整且不随更新变化 | 原样复制绑定和 values 后修改当前档案，旧调用、重试与历史回读仍得旧值；另测外部对象别名修改 | 未开始 | 运行时与持久化消费者；其状态机模型和真实组合证据不在本 data 包伪造 |
| S-30 秘密/凭据禁入、自建只取声明式配置 | 接收边界检查与写入路径审阅；嵌套合成秘密不被当成 Schema 已排除；自建不能通过配置载入任意代码、冒充 official | 未开始 | 档案写入与适配注册 owner；Schema 通过不证明此性质 |
| S-29/S-30/S-31 跨消费者同一定义 | Schema 指针与精确依赖检查，messages/response/extension 等只引用公共定义；注册可用性与配置适用性失败由行为消费者闭合 | 未开始 | 主线整批对齐；G-14 阻断实现采用，不阻断候选表达 |

### v3 变化的影响

- 必填 `adaptation` 加入 `ModelProfileContent`、`ModelProfile`、`ModelProfileSnapshot`；唯一公共定义为 `v3/model-profile.schema.json#/$defs/ModelAdaptationBinding`，对应 S-29。S-30、S-31 补配置义务与模型对应性。
- 五个字符串和配置 JSON 值一起构成绑定值比较；`configuration.revision` 不全局唯一。复制不得只留下修订，也不得按修订取别的档案值。
- S-1～S-28 保留原有身份、范围和参数承诺，更新字段集合、跨字段校验、快照复制与拒绝优先级。修订适配不改变 S-11 仅由五项上游属性推动 `updatedAt` 的规则。
- 产品前提复核到 PF-013 **rev 13**：rev 13 只修订 S5b/S10c 验收范围，未改档案数据语义；PF-001 rev 19、PF-004 rev 12、PF-010 rev 6 不变。本批新增要求来自用户授权方向与主线施工简报，不标成 PF-013 已有规则或新的已接受产品修订。
- 依赖保留 `identity-values/v1` 与 `offer-expiry/v1`；`content-blocks/v2` 除 S-6 再消费 S-24。该 Schema 没有 `JsonObject` 定义，主线裁定用 `type: object` 加精确语义引用，不新增同义 JSON 规范或悬空 `$ref`。
- 旧 v2 规范及历史证据保留原范围；新增绑定、跨字段拒绝和消费者快照证据必须重建。没有自动升级、默认绑定或兼容转换承诺。

| 现有消费者 | 必须随本批显式升级的部分 | 未升级时 |
|---|---|---|
| core/model-profile 实现 | 公共类型、Schema、解析/复制、相等、完整表示层校验及拒绝次序 | 继续消费 v2；不可声称能读 v3 |
| `capability.model-profile-directory/v2` | 建档、修订、官方清单、读取完整绑定；配置修订改义与注册配置校验的责任和失败 | G-14 未闭合，不得以 v2 接收新数据 |
| `capability.model-request-runtime/v2` 与公开模型函数 | 采用/冻结完整绑定、模型对应性、注册与配置可用性、版本更新后在途保持 | G-14 未闭合；形状合法不等于调用获准 |
| `data.model-response/v2`、`v3`；`data.loop-extension/v2`、`v3`；`data.messages/v2`、`v3` | 当前都精确引用 model-profile/v2；新候选须将相关快照与嵌套记录指到 v3，显式处理新增绑定字段 | 旧快照形状拒绝新成员或丢失绑定，不能混用 |
| `capability.modality-projection/v2`、`capability.asset-registry/v2` | 当前只消费 S-7 或 S-25；若输入改成完整 v3 档案则采用新版本并更新验证，否则保留既有精确依赖 | 不因推荐新版本自动升级；由主线逐入口判定采用 |

### v3 检查结果

2026-09-27 本地自检实际执行于该工作树 `.venv/bin/python`（`jsonschema 4.26.0`、`referencing`），读取本版 Schema、examples JSON 正例及第 9 节快照，构造绑定缺席、未知成员、类型错误、全部 26 个显式空白码点 × 五个字符串 × 首尾两端、三个表示缺绑定等反例。仅检查 Schema 的通过/拒绝；同时确认模型 ID 错配可被 Schema 放过，以免误报完整校验通过。
首次以 heredoc 执行；按主线补充授权将同一检查保存为脚本并重跑，命令为 `.venv/bin/python tmp/model-request-runtime/model-profile-v3/check_schema.py`，退出 0。

本次实际输出：

```text
PASS: model-profile/v3 candidate schema and examples; checks=321; definitions=12; clauses=31; jsonschema=4.26.0
SCOPE: Schema only. Cross-field refusal, secret exclusion, revision immutability and runtime freeze remain unexecuted implementation obligations.
```

输入 SHA-256：`model-profile.schema.json` 为 `fe5ef98ebd0902d0353dbc2ea8885d0bba24eff18912d8db9f8e9d6291790b8d`，`examples.md` 为 `0a4bd984ecabb46a4d448654d241d3ef48e0a3cbabca73817c0904fb18f1dc6d`。
脚本、真实标准输出/错误及含输入哈希和工具版本的 `schema-check-inputs.json` 暂存于本批工作树 `tmp/model-request-runtime/model-profile-v3/`，尚未归档到长期 evidence；它们是交接资产，不能当作已发布的持久证据入口。本地自检不能充作独立实现符合性证据，归档由本批主线统一负责。

同次执行 `.venv/bin/python .meta_harness/tooling/src/check_design.py --root .meta_harness/design --formal skip`，退出 1：

```text
FAIL: design validation found 9 error(s).
```

九处全树链接错误位于并行成稿中的 `capabilities/model-request-runtime/v3`、`data/messages/v4`、`data/model-response/v4`；本次输出未指向本包，但本次全树检查仍是失败，registry 集成和整批检查须由主线收口。`git diff --check` 通过，`v2/` 无字节修改。

保存脚本与输入后重跑同一全树命令，退出 1，实际输出为 `FAIL: design validation found 2 error(s).`：余下两处均为运行时 v3 契约及形式入口指向其尚未写完的 `verification.md#v3-候选变化与证据`。该次真实输出、错误和命令/退出码已保存为上述交接目录中的 `design-check.stdout.txt`、`design-check.stderr.txt`、`design-check-run.json`；仍不声明全树通过。

本包未建立 TLA+/Alloy 工件，也未运行形式工具；`--formal skip` 明确不执行形式任务。新增内容不引入 data 操作或并发状态机；注册、撤除、调用保持的形式义务由其行为 owner 承担。

## v2 起草期记录

以下保留 v2 起草、评审与本地自检的原始叙述。其“candidate/未接受”措辞是当时状态；当前接受与冻结以 registry 为准，不能据下段否定 v2 后续接受，也不能据旧自检声称 v3 已通过。

> **当前状态：未开始。**`data.model-profile` v2 是 `candidate`（2026-09-23 起草），未接受、未冻结；
> 没有提供者、没有装配、没有源码。下表登记的是**已经触发的证据义务**，不是已完成的检查。
> 跑过的只有对 [`examples.md`](v2/examples.md) 正反实例的两次**本地自检**（未登记、未进 `record/evidence/`），
> 范围与局限见[下节](#结果与反例)；最近一次（2026-09-24）同时核「通过／拒绝」与表示层的四种文档「拒绝值是哪一个」，**不支持** S-3、S-10、S-14、S-21 任何一条。

## 证据义务

| 规范条款与性质 | 证据形式 | 实际证据入口、输入与范围 | 未完成义务、责任与受阻消费者 |
|---|---|---|---|
| [S-24](v2/contract.md#s-24-表示层校验是一次纯计算)、[S-25](v2/contract.md#s-25-拒绝值闭合一次恰一个) 表示层校验与拒绝值次序 | Draft 2020-12 校验器对 [`model-profile.schema.json`](v2/model-profile.schema.json) 求值加 S-18 那一步，再按 S-25 的表与次序得出拒绝值；输入是 [`examples.md`](v2/examples.md) 第 1～6 节与第 10 节全部实例 | **本地自检，未登记**（[下节](#结果与反例)）：「通过／拒绝」与「拒绝值是哪一个」两面都核过；后一面用的是自检脚本里按 S-25 手写的分类，不是一份独立实现 | 责任：规格工具（首次可由评审前的自检承担）。须覆盖两条引擎差异回归例（尾随换行、前导 U+FEFF）、第 6 节四条与第 10 节一条次序例、`input_text_missing` 一例、M12 各行，以及第 3 节官方／自建两支互斥的各行。**校验通过不支持** S-3、S-14、S-21 任何一条 |
| [S-18](v2/contract.md#s-18-档案参数的输出上限) `max_output_exceeds_profile` | **不由 Schema 兑现**：表示层校验在 Schema 之外那一步的单元检查；输入是 examples 第 2 节三行、第 6 节末行与第 10 节一行（建档内容） | 实例一面：**本地自检，未登记**；实现的单元检查**未开始** | 责任：表示层校验的实现者。**只跑 Schema 的实现会让这几行通过**——这一条必须单独断言，对档案与建档内容两种都要 |
| [S-28](v2/contract.md#s-28-建档内容产生一条档案时给的那一份) 建档内容不带在册状态与 `updatedAt`（M12） | Schema（成员集合闭合）＋ examples [第 10 节](v2/examples.md#10-建档内容)；外加场景：以带 `registration` 或 `updatedAt` 的建档内容分别调建档与装入清单，**两边都得 `invalidInput`、`reason = malformed`**，且什么都没写 | 实例一面：**本地自检，未登记**；场景**未开始** | 责任：`capability.model-profile-directory` v2（建档与清单装入收它）。**带了 `registration: "listed"` 也要被拒**——只挡 `withdrawn` 的实现会让那一行失败 |
| [S-18](v2/contract.md#s-18-档案参数的输出上限)／[S-21](v2/contract.md#s-21-不静默丢也不静默改) 上游输出上限已低于档案参数：`maxOutputTokens` 一项不跟着降，发出时改值并留痕 | 规范场景：假上游的输出上限低于档案 `parameters.maxOutputTokens`，发一次；**同时断言**档案的 `maxOutputTokens` 没变、出站请求里的 `maxOutputTokens` 是上游收得下的值、留痕的 `parameters` 里是实际发出的那个值、`parameterAdjustments` 记下了要求的与发出的两个值。**另一场景**：同一次同步里上游还改了窗口——断言窗口照常更新、`updatedAt` 动了、`maxOutputTokens` 仍是旧值；一份把 `maxOutputTokens` 降到参数值之下的修订整份被拒（`max_output_exceeds_profile`），什么都没写 | **未开始** | 责任：**模型请求运行时**（adapter）与维护档案的能力（写入面整份拒）；留痕形状在 `data.model-response` v2 S-11 |
| [S-3](v2/contract.md#s-3-撞名判定同一范围内唯一) 撞名拒建（只比同一格） | 规范场景演练：examples [第 7 节](v2/examples.md#7-判定撞名拒建不是-schema-实例)十二行——**同一格撞名、同一格撞已撤回行（要走恢复在册）、与官方同名照常建出、组织层与租户层同名照常建出、别的组织同名照常建出、新官方档案与自建同名照常建出、已撤回的官方档案在清单里重现时走恢复在册（`relisted`，不是 `route_name_taken`，也不另起一行）、只差大小写照常建出**，**并发三行**（同一格里并发同名恰一次成功、自建与官方发布并发都成功、组织层与租户层并发都成功）与读不到一行（故障注入） | **未开始** | 责任：`capability.model-profile-directory` v2（candidate，建档与装入官方清单的那两个操作）。并发那几行要么真并发演练、要么由那份能力的行为模型检查「判定读到的名字与写入同提交」，**两者择一，不能靠顺序执行的场景代替**。「照常建出」那几行同样要断言——**一个判到别的格去的实现会让它们失败**（P-11） |
| [S-10](v2/contract.md#s-10-registration) 两条转移、恢复的是同一行、行保留 | **静态检查**：维护档案的能力的写路径里，在册状态只有撤回与恢复在册两条边、没有删行、恢复不另起一行；外加场景：撤回后按引用读，仍读到这一条、`registration = withdrawn`；**单纯的恢复**（`relistProfile`）后按同一个引用读，读到**同一行**、`registration = listed`、其余成员与 `updatedAt` 不变；**清单装入的 `relisted`** 只断言同一行、身份分量不变、`registration = listed`，属性按清单改写、`updatedAt` 按 S-11 | **未开始** | 责任：`capability.model-profile-directory` v2 |
| [S-14](v2/contract.md#s-14-引用只精确解析不跨层) 引用只精确解析，三种收场不折叠 | 规范场景：官方引用读一次、自建引用读一次；再用**名字对、所在范围或来源不对**的引用各读一次（须是「查无此条」，不得顺着名字解析到那一条）；再对不存在的引用、存储不可用各读一次，**三种结果值须两两不同** | **未开始** | 责任：`capability.model-profile-directory` v2 的读面（失败值名在那里） |
| [S-5](v2/contract.md#s-5-providername-与允许的供应商)、[S-6](v2/contract.md#s-6-允不允许回退) 只发往允许列表里的一家；不允许回退时只走第一家；不把整份列表交给上游回退 | 规范场景：以可控的假上游让第一家失败，分别在 `allowFallback` 为 `true`／`false` 下观察第二次发往哪一家；**检查每一次出站请求只点名一家、且关掉了上游侧的回退** | **未开始** | 责任：`capability.model-request-runtime` v2。只看最终结果不够——上游自己回退成功时，结果与「我们换了一家」长得一样 |
| [S-21](v2/contract.md#s-21-不静默丢也不静默改) 不静默丢、不静默改 | 规范场景：假上游不认某一项（统一项一次、`extra` 项一次）、只认某项的更窄取值域，各发一次；比对「实际发出的请求体」与留痕 | **未开始** | 责任：模型请求运行时的 adapter；留痕形状在 `data.model-response` v2 S-11。**三条都要断言**：没发出去的项在 `droppedParameters` 里有名字（`extra` 项以键为名）；改了值的项在 `parameters` 里是实际发出的值；同一项在 `parameterAdjustments` 里记着要求的与发出的两个值 |
| [S-27](v2/contract.md#s-27-modelprofilesnapshot档案在某一刻的副本) 快照是原样副本 | 规范场景：打开一次调用之后改档案、撤回档案，断言那次调用的快照与打开那一刻的档案逐成员相等（[S-28](v2/contract.md#s-28-建档内容产生一条档案时给的那一份) 的相等规则），且 S-18 的关系在快照上成立 | **未开始** | 责任：`capability.model-request-runtime` v2（写快照的一方）。收快照的一方不重判，所以这一条只能在写的一方断言 |
| [S-17](v2/contract.md#s-17-缺席即不带没有人补值) 缺席不补值 | 规范场景：档案不给某一项、拓展件也不设，检查出站请求体里**没有**这一项 | **未开始** | 责任：模型请求运行时 |
| [S-22](v2/contract.md#s-22-凭据价格与实际用了哪条都不在档案上) 档案上没有凭据 | Schema（档案文档本身，examples 第 2 节的 `credential` 一行）＋**静态检查**（档案的一切交换表示与读面返回里不出现凭据） | Schema 部分**未运行**；静态检查**未开始** | 责任：维护档案的能力与展示列表的提供者 |
| [S-11](v2/contract.md#s-11-updatedat) `updatedAt` 何时动、不后退 | 规范场景：改 `providers`（它不动）、改 `maxInputTokens`（它动）、写回同值（它不动）、把两组模态换个次序写回（它不动：按集合比） | **未开始** | 责任：`capability.model-profile-directory` v2 |
| [S-13](v2/contract.md#s-13-modelprofileref) 引用的持久形状：`origin` 判别式原样存、自建那一支的 `scope` 存成带判别式的值 | **静态检查**：持久形状里有 `origin`，自建那一支是一个 `ScopeLayerIdentity`、不是两个可空列；**不存在「缺 `scope` 即官方」的读法** | **未开始** | 责任：凡持久化 `ModelProfileRef` 的 owner（Agent 定义、会话、响应留痕） |

## 对齐义务

**这一节登记本包与同批契约之间的对齐项。**整批对齐（2026-09-23）逐项核过，2026-09-24 第一轮评审修复与 2026-09-25 修复波 2 后更新，状态写在末列：

| 对齐什么 | 本包现状 | 另一边 | 状态 |
|---|---|---|---|
| **`Modality` 只有一份定义** | 两组模态 `$ref` `data.content-blocks` 的 `$defs/Modality`，本包不再自定义 | `data.content-blocks/v2#S-6` 是唯一的家 | **已对齐**：catalog 登记本包 → `data.content-blocks` [S-6] |
| **`ModelProfileRef` 的消费** | S-13 定形状：按 `origin` 判别两支，官方 `{origin, routeName}`、自建 `{origin, scope, routeName}` | `data.model-response` 的路由留痕取这个值（`data.loop-extension` 请求的 `target` 自 2026-09-24 起改取 `RouteName`） | 一律 `$ref` 本包 `$defs/ModelProfileRef`，**不各自复述两支、不各自加第三支**；核对结果记在那份的验证入口 |
| **撞名范围与大小写规则** | S-3：同一范围（同一格）内唯一，含已撤回行；不同格可同名（官方与自建、组织层与租户层、不同组织）；逐码点比较，不做大小写折叠与相似字判定 | `capability.model-profile-directory` 的建档与装入官方清单；任何按路由名去重、索引或展示的消费者（展示列表、`data.model-response` 的 `upstreamModel` 对照） | 目录那边按「S-3 定的范围」判、不复述范围；消费者不得自行加大小写不敏感的比较，**也不得假设路由名在格与格之间唯一**——同一个路由名可以出现在几条档案上，指认一条要带来源与所在范围（引用本身就带）；2026-09-24 规格修订批目录与运行时同批改 |
| **上游输出上限低于档案参数的收场** | S-18：`maxOutputTokens` 一项不跟着降（其余四项照常更新），义务归模型请求运行时 | `data.model-response` v2 S-11 的 `parameters` 与 `parameterAdjustments` | **已对齐**：`parameters` 记**实际发出的**（降过的）值，`parameterAdjustments` 记要求的与发出的两个值 |
| **`ModelRequestParameters` 与项名** | S-15～S-21；项名规则在 S-20；S-21 三种处置 | `data.model-response` v2 S-11 的三个成员（`parameters`、`parameterAdjustments`、`droppedParameters`）；`data.messages` v2 S-49「已出门」上的 `parameters`（要求的那一组）与同名两份处置清单；`data.loop-extension` 的「调模型之前」可改的参数 | **已对齐**：前两者用本包 S-20 的项名、`droppedParameters` 含 `extra` 项的键，`extra` 的键全没发出时实际发出的那一组里整个 `extra` 缺席（S-19 不许空，D-060 §七 M28）；三者都不得另起一份参数词表；合成规则落在 `capability.model-request-runtime/v2#S-7`，剩余一问是 [G-8](v2/contract.md#十已知缺口) |
| **建档内容** | S-28：`ModelProfile` 去掉 `registration`、`updatedAt`；带了即 `malformed`（M12） | `capability.model-profile-directory` v2 S-5、S-8、S-9、S-14 ①⑧、S-18 ①⑧ 引 `#S-28` | **已对齐**：那份契约已按本条写（`invalidInput{reason: malformed}`），它的 catalog 依赖已含 S-28 |
| **恢复与属性改写同提交** | S-10：转移本身只改 `registration`；清单装入的 `relisted` 可同时改属性；「其余不变」只对 `relistProfile` | `capability.model-profile-directory` v2 S-18 `relisted`、S-33 | **已对齐**：两边说法一致；本包 examples 第 7、8 节与上表 S-10 一行按此限定 |
| **快照照原样复制** | S-27：S-18 的关系在快照上由写的一方保证，收的一方不重判 | `capability.model-request-runtime` v2（写）；`data.model-response` 的 `route.profileSnapshot`、`data.loop-extension` 的「调模型之后 · 失败」主体（收） | 收的两份都 `$ref` 本包 `$defs/ModelProfileSnapshot`，不重判；写的一方的证据在上表 S-27 一行 |
| **`withdrawn` 两处同名** | `Registration` 的 `withdrawn` 是档案的在册状态 | `data.loop-extension` 的失败成因取值 `withdrawn`（已下架） | 两者含义一致（成因「已下架」的依据正是档案 `registration = withdrawn`）；那边的定义引用本包 S-10，不另下定义 |

## 结果与反例

### 已执行：第一轮评审修复后的本地自检（2026-09-24）

| 项 | 值 |
|---|---|
| 对象 | 第一轮评审修复之后的 `v2/model-profile.schema.json`（`$defs` 11 项，新增 `ModelProfileContent`）与 `v2/examples.md`（新增第 10 节），均未冻结，无 hash 可绑 |
| 工具 | CPython 3.12.13 ＋ `jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing` 0.37.0，工作区锁定 uv 环境（`uv run --locked`），未另装依赖；设计根下 `spec/*/*/v*/*.schema.json` 按 `$id` 登进同一个解析表，`Modality`、`ScopeLayerIdentity`、`Instant` 都解析到真身 |
| 做了什么 | **两种求值，逐行与表比对**：① 表示层校验 = Schema ＋ S-18 那一步（对 `ModelProfile` 与建档内容）；② 按 S-25 的表与次序手写的分类，给出拒绝值与命中的 M 编号——只对四种文档（档案、建档内容、引用、参数独立值）的行做。第 1 节四条正例（A、B、C 与第 10 节的 D）与三个引用、第 2／6／10 节「在正例上改一处」的行、第 3～5、9 节的字面实例、5.3 节表里每个取值各算一行 |
| 结果 | **151 行，与「预期」一列全部一致**（通过 44、拒绝 107）；其中 106 行做了分类，**拒绝值与表里写的逐行相同**，表里注了 M 编号的都在命中的 M 编号之中；四条正例与三个引用两种求值都通过 |
| 脚本在哪 | 会话暂存区，**未入库** |
| 范围与局限 | 分类是**同一个人按 S-25 写的第二种读法**，不是独立实现；它与表一致只说明表、Schema 与 S-25 三者自洽。第 7、8 节是判定与写路径场景，不参与。**不支持** S-3、S-10、S-14、S-21、S-27 任何一条 |

### 已执行：整批对齐时的本地自检（2026-09-23）

| 项 | 值 |
|---|---|
| 对象 | 对齐波改过之后的 `v2/model-profile.schema.json` 与 `v2/examples.md`（未冻结，无 hash 可绑） |
| 工具 | CPython 3.12 ＋ `jsonschema` 4.26.0（`Draft202012Validator`）＋ `referencing`，工作区锁定 uv 环境，未另装依赖；设计根下全部 `*.schema.json` 按 `$id` 登进同一个解析表，`Modality`（`data.content-blocks`）、`ScopeLayerIdentity`（`data.identity-values`）、`Instant`（`data.offer-expiry`）都解析到真身 |
| 做了什么 | 按表示层校验求值 = **Schema ＋ S-18 那一步跨字段比较**：第 1 节三条正例与它们的三个引用；第 2、6 节「在正例上改一处」的行按本页「怎么读」的规则生成文档；第 3～5 节的字面实例；5.3 节表里每个取值各算一行 |
| 结果 | **139/139** 与「预期」一列一致（通过 42、拒绝 97，含第 9 节快照六行）；三条正例与三个引用全部通过 |
| 脚本在哪 | 会话暂存区，**未入库** |
| 范围与局限 | 只核**通过还是拒绝**，**不核拒绝值是哪一个**（S-25 的次序一列未机核）；第 7、8 节是判定与写路径场景，不参与。**不支持** S-3、S-10、S-14、S-21 任何一条 |

### 尚无的记录

规范场景与静态检查尚无执行记录。首次执行时在此记录工具与版本、环境、输入范围、可复现步骤与原始结果位置；
原始产物归 [record/evidence/](../../../record/evidence/README.md)。
记录时必须分开陈述：Schema 校验的结果、Schema 之外那一步（S-18）的结果、规范场景演练的结果、真实组合的符合性。

## 独立评审

**第一轮**：reviewer 为 spec-reviewer（独立、只读），日期 2026-09-24，基线 HUB `765b01dc`；发现表是那一轮的任务区产物（MP-1～MP-14；与本契约相关的阻断 MR-1 记在 `data.model-response` 的验证入口，这里不重复计）。处置在 2026-09-24 第一轮修复里落（见[变化的影响](#变化的影响)第一条）：

| 发现 | 严重度 | 处置 | 落点 |
|---|---|---|---|
| MP-1 建档内容没有文档种类、带了两个成员拒成什么未定 | 应修 | **改**（主线裁定在本契约立）：新立 **S-28 建档内容**（`$defs/ModelProfileContent`）；带 `registration`／`updatedAt` 即 `malformed`（新 **M12**）；S-24 改为四种文档，S-25「适用于」一列逐行补上建档内容 | S-28、S-24、S-25、S-3 九件事第 2 行、S-10、S-12、第三节、P-12；Schema；examples 第 10 节 |
| MP-2 `relisted` 可同时改属性，与「其余不变」相抵 | 应修 | **改**：S-10 写明转移本身只改 `registration`、恢复可与属性改写同提交（那是改写，不是恢复）；「其余不变、`updatedAt` 不动」只对 `relistProfile` 断言 | S-10；Schema `Registration` 说明；examples 正例 C、第 8 节；本页 S-10 一行 |
| MP-3 第 7 节要求一个目录永远不返回的值 | 应修 | **改**：那一行的结果改为清单装入的处置 `relisted`，依据写明 `route_name_taken` 是 S-3 的判定结论、不是官方发布的返回值；第 7 节说明「结果」一列写的是操作的返回；官方发布两行补 `added`；S-3 后果表加一行 | examples 第 7 节；S-3；本页 S-3 一行 |
| MP-4 G-13 已闭合，实例与条款仍写「待确认」 | 应修 | **改**：去掉「待确认」，改指 PF-013 裁决 39、40 与 §4 | examples 第 7 节第 3、12 行；设计依据下的表；S-3；P-11；已关闭缺口 G-13 行 |
| MP-5 例外的范围是整份还是一项 | 应修 | **改**：例外只管 `maxOutputTokens` 这一项；另四项照常更新、照常推动 `updatedAt`；把这一项降到参数值之下的文档整份被拒，写的一方不带这一项的改动重写（规格层推导，理由写在 S-18） | S-18、S-11、S-12；本页 S-18／S-21 一行 |
| MP-6 PF-001／PF-004／PF-010 的 rev 过期 | 应修 | **改**：逐版复核后对到 PF-001 rev 19、PF-004 rev 12、PF-010 rev 6（复核内容见[变化的影响](#变化的影响)第一条），条款不改 | 抬头；covers 注记 |
| MP-7 开放缺口没有闭合条件 | 应修 | **改**：开放缺口表加「闭合条件」一栏，G-2、G-8、G-9、G-10 各写一条 | 第十节 |
| MP-8 已有词条仍被说成「不是词条」 | 应修 | **改**：第三节改为值名与词条的对应表（`Registration` ↔ 档案在册状态 · Profile Listing Status 等），链上八条词条；Schema 里有词条的定义给词条式标题或在说明里点名；本页「本分支看不到」一条删去 | 第三节、设计依据统一语言一行、S-4、S-5、S-6、S-10、消费者表；Schema；本页对齐义务 |
| MP-9 消费者表漏了几个消费方 | 应修 | **改**：补 `data.messages`（S-2、S-5）、`capability.modality-projection`（S-7、S-25）、`capability.asset-registry`（S-7）；`data.loop-extension` 一行补 S-27 快照与 S-5；`data.model-response` 一行按参数三处留痕改写；维护档案的能力一行补 S-11、S-28、S-25 | 消费者表；README「谁在等它」 |
| MP-10 covers 注记与条款语义相反 | 应修 | **改**：「选中模型与有效模型」那一条改写并补 S-2、S-14；§6.1 那一条改写、按设计依据表补 S-1、S-12、S-14；其余各条 rev 对到当前（`reviewed` 保持 false） | registry `covers.json` |
| MP-11 S-1「选择」易误读 | 建议 | **改**：换成「目录的读面、有效模型的留痕」，并注明切换选中模型记的是路由名 | S-1 |
| MP-12 快照要不要做 S-18 那一步 | 建议 | **改**：写明 S-18 的关系在快照上成立、由写快照的一方照原样复制保证；快照不是表示层校验的一种文档，收的一方不重判、没有拒绝值 | S-27、S-24；Schema `ModelProfileSnapshot` 注释；examples 第 9 节；本页新增 S-27 一行 |
| MP-13 「第 8 行」笔误 | 建议 | **改**：改为「S-25 第 8 行，先于第 9 行」 | examples 第 2 节 |
| MP-14 `Instant` 不在 offer-expiry S-22 的表里 | 建议（两份共有） | **改说明，不改登记**：抬头依赖写明依据是 S-22 末句加上它 Schema 的 `$defs/Instant`；offer-expiry 已冻结 | 抬头；README |

### 第二轮（2026-09-25）

reviewer：spec-reviewer，S25 第二轮批 R2b（另含批 R1 转来的一条批外观察）；基线 HUB `8ad37c50`。本批对本契约的总判是「可进 F 反向核对」。依据一律是 [D-060 §七](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#七s25-第二轮独立复评之后的主线裁定m1m292026-09-25-追加)。

| # | 发现（等级） | 处置 | 落点 |
|---|---|---|---|
| R2-MP-1 | 消费者表 `data.messages` 行只写 S-5、S-2，MRR 行漏 S-27；S-20 末条只点名 model-response；对齐义务那一行只列另两份（应修） | **改**：messages 行按 catalog 补全（S-13、S-15、S-20、S-27 都用在「已出门」上）；MRR 行补 S-27（照原样复制快照）；S-20 末条补「已出门」；对齐义务那一行加 messages S-49 | 消费者表；S-20；本页对齐义务 |
| R2-MR-4（本契约那一半） | S-23「不静默丢、不静默改」一行的协议列只要求随结果回传，停机会留下假留痕（应修，两份共有） | **改**：协议列写「在出网之前交回写『已出门』的一方」，与 MRR S-38 传输适配第 10 条、`data.model-response` S-25 同一句；「做不到会怎样」写明假留痕 | S-23 |
| R2-MP-2 | 「切换事实」仍作概念名（建议；R1 批外观察同指这一处） | **改**：一律改称「模型切换落下的那条记录」，首次出现链 UL-model-switch；covers 里那条 note 同改 | 消费者表两行；S-14；CS-1；实例第 3 节；registry `covers.json` |
| R2-MP-3 | S-10 末段说「引用仍解析到同一条」，与 CS-1 按名字的说法两种机理（建议） | **改**：会话记的是路由名；恢复在册之后那个名字按层覆盖重新落回它，与 CS-1 一致 | S-10 |
| R2-MP-4 | 对齐义务「建档内容」一行仍写「应补登 S-28」（建议） | **改**：状态改为已对齐 | 本页对齐义务 |

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建**，理由在[包入口](README.md#版本包)与[契约第十二节](v2/contract.md#十二版本差异与规范工件)。
**这不是把义务省掉**：会被并发反驳的那一条（S-3 的判定与写入同提交）登记在上表 S-3 那一行，落点是拥有建档操作的能力契约。
没有 Alloy 或 TLA+ 任务登记到 `formal-tasks.json`。

## 变化的影响

- **2026-09-25 修订波：pi-ai 传输节点反推**（仍是 `candidate`，未冻结，原地改；主线裁定 [D-060 §八 N-40](../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ④，节点 PAT-N11、PAT-N17）。
  [S-18](v2/contract.md#s-18-档案参数的输出上限) 那条「上游上限低于参数时改值再发」**标为有前提：上游此刻的上限这一事实有来源**——本版没有（档案不跟着降，传输不取上游模型目录），闭合之前不改值、按参数原样发；缺口记在 `capability.model-request-runtime` v2 的 G-22，来源候选是本契约新版本的档案属性。逐路由的线上差别（wire hints）同样候选为本契约新版本的档案属性，缺口记在那份契约的 G-23；[S-2](v2/contract.md#s-2-routename)「本系统不解析路由名」不变——本版由装配按路由名逐码点精确给。**表示与 Schema 不变**，没有证据因此作废。

- **2026-09-24 第一轮独立评审修复**（仍是 `candidate`，未冻结，改在 v2 原地）。依据：第一轮评审发现 MP-1～MP-14（处置表在[独立评审](#独立评审)）与主线对跨契约几处的裁定：
  参数留痕三处（`data.model-response` 的 `parameters` 记实际发出的值、新增 `parameterAdjustments`、`droppedParameters` 含 `extra` 项）、本契约立「建档内容」这一种文档、恢复在册可与属性改写同提交。

  | 改的是什么 | 条款 | 表示变化 | 对证据与消费者的影响 |
  |---|---|---|---|
  | **新立 S-28 建档内容**（`ModelProfileContent`）：`ModelProfile` 去掉 `registration` 与 `updatedAt`；带了即 `malformed`（新 **M12**）；逐成员相等的规则写在这里，S-11 的「值变了」与目录的「同内容认回」共用 | S-28、S-24（四种文档）、S-25（M3、M5、M10 措辞，M12，「适用于」一列）、S-3 九件事第 2 行、S-10、S-11、S-12、第三节、第七节（定义项 11）、P-12 | **有**：`$defs` 增 `ModelProfileContent`；examples 新增第 10 节（12 行） | 新义务：本页 S-28 一行。`capability.model-profile-directory` v2 已按 `#S-28` 写（S-5、S-8、S-9、S-14、S-18），它的 catalog 依赖要补 S-28 |
  | **恢复与属性改写同提交**：转移本身只改 `registration`；「其余不变」只对 `relistProfile` | S-10 | 无（`Registration` 说明改写） | examples 正例 C、第 8 节；本页 S-10 一行拆成两种断言 |
  | **S-18 的例外只管 `maxOutputTokens` 一项**；违反的写入整份被拒 | S-18、S-11、S-12 | 无 | 本页 S-18／S-21 一行加一个场景 |
  | **参数留痕三处**：S-21 的处置表改按 `data.model-response` v2 S-11 的三个成员写；CS-4 改写；S-23 那一行回传「改过的值」 | S-21、S-23、CS-4、消费者表 | 无（形状在 `data.model-response`） | 本页 S-21 一行三条断言 |
  | **快照上的 S-18**：由写快照的一方照原样复制保证，收的一方不重判 | S-27、S-24 | 无（注释） | 本页新增 S-27 一行（责任在模型请求运行时） |
  | **官方档案重新发布走 `relisted`**：S-3 后果表加一行；examples 第 7 节那一行改为恢复在册，官方发布两行补 `added` | S-3 | 无 | 本页 S-3 一行 |
  | **词条与依据**：第三节改为值名与词条对应表，链上八条已有词条；「主线裁定 2026-09-23，待产品负责人确认」一律改为 D-060 §S6 各编号（S-3 比较规则只取 S6-b 的那一半）、C-R1；G-13 相关处改指 PF-013 裁决 39、40；已关闭 G-6 去掉账本编号 | 设计依据、S-3、S-7、S-13、S-18、S-27、P-1、P-10、P-11、第十节 | Schema 各 `description` 与 `Registration` 的标题 | 无 |
  | **消费者表补齐**：`data.messages`、`capability.modality-projection`、`capability.asset-registry`；`data.loop-extension` 补 S-5、S-27 | 第一节 | 无 | 与 catalog 里七个消费方一致 |
  | **开放缺口加闭合条件**；S-1 删「选择」；examples 第 2 节「第 8 行」笔误；`Instant` 的依据写明 S-22 末句加 `$defs` | 第十节、S-1、抬头 | 无 | 无 |

  **产品依据复核（G1）**：
  - **PF-001 rev 16 → 17**：§6.1 两处措辞（工作区「会话创建时选定」；出厂默认一格「它们声明的默认设置与默认权限」）——本契约引 §6.1 的是「出厂默认层由系统充当」「同一范围是同一格」（S-1、S-3），**不受影响**：档案只在出厂默认、组织、租户三格，工作区不是一种身份、不在那张表里；§6.4 末句「实际费用拿不到时记什么，归 PF-013」与 S-22「价格不在档案上」一致；其余（权限锁的是界、提升不动持有）不涉及。**条款不改。**
  - **PF-004 rev 10 → 12**：rev 11 写明 I-4 的时间尺度，rev 12「构成变小也重新装配」——本契约只引 §6.6（实际用了哪条是可追溯组成、不在档案上），未变。**条款不改。**
  - **PF-010 rev 5 → 6**：系统提示词本版只含文本；要求五第二行改为「原件 / 派生表示 / transcript」三选一——本契约引要求五的是「组装的输入里有当下生效的那份档案、窗口、模态、送进去之前的限制是同一份记录里的三项」（S-8、S-9、CS-5），未变；取哪一份归组装。**条款不改。**
  - **PF-013 rev 12**：已是当前；抬头状态说明改为产品正文自己的接受状态。

  **registry**：catalog 本包条目不变（依赖仍是 identity-values、offer-expiry、content-blocks）；covers 本包各条的 note 对到当前 rev、过时说法改写，「选中模型与有效模型」补 S-2、S-14，§6.1 补 S-1、S-12、S-14，flows §3.1 补 S-28（均 `reviewed: false`）。
  **没有既有证据失效**：上一次本地自检的 139 行全部保留、结果不变；本轮重跑为 151 行（[结果与反例](#结果与反例)）。

- **2026-09-24 规格修订批（PF-013 rev 10 之后）**（仍是 `candidate`，未冻结，改在 v2 原地）。依据：PF-013 rev 10 [裁决 35–38](../../../product/PF-013-model-profiles-and-invocation/decisions.md#2026-09-24--档案的身份是所在范围加路由名列表每条带来源已撤回的可以恢复在册)（账本 U-2）与主线施工简报第三节：

  | 改的是什么 | 依据 | 对证据与消费者的影响 |
  |---|---|---|
  | **S-3 改为「同一范围内唯一」**：只比同一格（含已撤回行）；官方与自建、组织层与租户层、不同组织都可同路由名并存；「自建撞官方拒建」删去；不读隶属关系。S-3 改名（锚点 `#s-3-撞名判定同一范围内唯一`），旧锚点 `#s-3-路由名在全部档案里唯一` 的小节保留；九件事第 1、3、4 行改写（提交边界只需覆盖那一格） | 裁决 35、38；D-058 Q11 的「拒建」被裁决 38 撤回（D-058 已追加一节「2026-09-24 修正」） | **语义变化**：S-1、S-13（官方那一支的前提改为「官方档案全在出厂默认层、同一格里不重复」）、S-14、S-23 第 1 行（按格分片成立）、P-1、P-11 改写；examples 第 7 节改为十二行；catalog 本包对 `data.identity-values` 去掉 S-15（不再读有共同上级） |
  | **组织层与租户层的自建档案同名并存**这一读法按产品正文写，另立 **G-13**（待产品负责人确认） | 主线账本「请你确认」一行 | 若另裁为树内唯一，S-3 与目录的建档判定同改、S-15 依赖回来 |
  | **S-10 加转移 `withdrawn → listed`（恢复在册）**：没有终态；恢复的是同一行、其余成员与 `updatedAt` 不变；谁撤得了谁恢复得了；同一格要再用已撤回行的名字是恢复、不是另建。S-12 那一行、S-23 第 3 行（副本读按写入先后单调）、P-3 随之改；Schema 里 `Registration` 的说明改写（取值不变） | 裁决 37；PF-013 §6.4、flows §3.1 | **语义变化**：上表 S-10 那一行由「没有这条边的静态检查」改为「只有两条边、恢复是同一行」；examples 第 8 节改写、正例 C 加一句、5.3 节 `relisted` 一行的理由改写（仍拒） |
  | **G-6 关闭**（撤回可恢复、新官方档案与自建同名并存）；G-1 的前提改写、G-4／G-5 的旧结论注明已被改判 | 裁决 35–38 | 无新证据义务 |
  | S-22「凭据的家」改为「租户身上的一项属性，组织那一层不持有」 | 裁决 33 | 表述变化，本契约不拥有凭据 |
  | 设计依据改指 PF-013 rev 10；新增「档案的身份」一行；§6.3 一行改为来源标注（不再是撞名拒建的理由） | PF-013 rev 10 | covers.json 同步：§6.3 → S-4、S-13；新增「档案的身份」→ S-1、S-3、S-13、S-14；flows §3.1 → 加 S-3 |

  **没有既有证据失效**：唯一跑过的本地自检不涉及 S-3、S-10 的转移（第 7、8 节不参与），`Registration` 的取值域没变。

- **2026-09-23 整批对齐**（仍是 `candidate`，未冻结，改在 v2 原地）：

  | 改的是什么 | 依据 | 对证据与消费者的影响 |
  |---|---|---|
  | **S-3 撞名范围改判**：官方名对所有层保留（官方发布与全部档案比、自建建档与全部官方档案比）；自建名在所在组织的隶属树内唯一、**不跨树**，按 `data.identity-values/v1#S-15` 的 `shareAncestor` 在判定那一刻读；**只在登记那一刻核**，隶属合并后的树内同名被接受。S-3 改名，锚点随之改；九件事第 1、3、4 行改写（隶属读不在提交边界里、判不出共同上级即明确失败） | 主线裁定 2026-09-23，待产品负责人确认（账本 RP-22 改判 S6-b；PC-2） | **语义变化**：S-1（`(所在范围, 路由名)` 唯一、只有官方名单独指得清）、S-10、S-13（自建引用的 `scope` 是消歧所需）、S-14、S-23 第 1 行、P-1 改写，新增 P-11；examples 第 7 节改为十三行；catalog 本包对 `data.identity-values` 增 S-15。`capability.model-profile-directory` 的 G-2 由此关闭（那边同波改） |
  | **`Modality` 改 `$ref` `data.content-blocks`**；本包 `$defs` 由 10 项减为 9 项；S-7 只留指路与本契约的拒绝值 | 整批对齐简报 §A（`Modality` 的家是 content-blocks） | **表示不变**（同样四个 token）；catalog 增依赖 `data.content-blocks` [S-6] |
  | **G-11 关闭**：维护档案的能力 = `capability.model-profile-directory` v2；正文里原指 G-11 的执行面改指它 | 那份能力契约已成稿（candidate） | 上表原「阻断在 G-11」的各行改为那份契约的责任 |
  | **G-8 收窄**：合成规则（逐项替换、合并后校验输出上限）已落在 `capability.model-request-runtime/v2#S-7`；只剩「覆盖能否去掉一项」 | 主线裁定 2026-09-23，待产品负责人确认（账本 S6-e） | S-18 末条改写 |
  | **G-6 描述按新 S-3 改写**，仍归产品负责人（账本 U-2），**未替他裁** | —— | 无 |
  | 依据行统一写「主线裁定 2026-09-23，待产品负责人确认」；产品负责人的 Q11 补成 D-058 链接；消费者表里并行起草的几份改为坐标 | 整批对齐简报 §B | 无 |
  | **新增 S-27 `ModelProfileSnapshot`**（`$defs` 增至 10 项）：档案在某一刻、发出与重试要用到的属性的副本；examples 新增第 9 节 | 主线裁定 2026-09-23，待产品负责人确认（账本 C-R1：快照落响应体路由留痕、不加修订身份）；**家放在本契约是对齐者推导**——`data.model-response` 与 `data.loop-extension` 都要用它，而前者引用后者，只有本契约是两边都能引用的家 | 新消费者：`data.model-response` 的 `route.profileSnapshot`、`data.loop-extension` 的「调模型之后 · 失败」主体 |
  | **本地自检**：139 行与预期一致（[上节](#结果与反例)） | 整批对齐简报 | 首次有实例求值记录；拒绝值次序仍未机核 |

- **2026-09-23 主线裁定后就地修订**（仍是 `candidate`，未冻结，改在 v2 原地）。五条裁定，关掉六个缺口：

  | 改的是什么 | 怎么改的 | 对证据的影响 |
  |---|---|---|
  | **G-1 关闭：引用两支** | `ModelProfileRef` 改为按 `origin` 判别的 `oneOf`：官方 `{origin, routeName}`、自建 `{origin, scope, routeName}`；S-13、S-14 重写，S-14 改名「引用只精确解析，不跨层」 | **表示变化**：examples 第 3 节整节重写、第 1 节三条引用加 `origin`；Schema 那一行（未运行）输入随之变 |
  | **G-3／G-4／G-5 关闭：路由名全局唯一** | S-3 改为「全部档案（所有层、含已撤回行）里唯一，逐码点比较，不做大小写折叠与相似字判定」，新官方档案撞自建名同样拒建；S-3 改名「路由名在全部档案里唯一」；S-23 两行并一行，提交边界覆盖整个名字空间 | **语义变化**：examples 第 7 节改为九行（跨层、撞已撤回、新官方撞自建、只差大小写照常建出、跨范围并发）；上表 S-3 那一行随之改 |
  | **G-7 关闭：上游收紧输出上限** | S-18：不改档案，发出时按 S-21「改了值再发出」处理并留痕，义务归模型请求运行时；S-11、S-12 写明这一刻起记载落后于上游 | **新增一条义务**（上表 S-18／S-21 那一行） |
  | **G-12 关闭：必含 `text`** | S-7 写成约束；新增拒绝值 `input_text_missing`，排在 `modalities_empty` 之后（拒绝值十个）；Schema 加 `contains` | **表示变化**：examples 第 2 节加两行（缺 `text` 被拒、输出一侧不受约束）、原「`["Text"]`」一行改为 `["text", "Text"]`，第 6 节加一条次序例 |
  | **G-6 不动** | 仍归产品负责人；描述按全局唯一改写（任何一层都再建不出） | 无 |

  **当时仍然未运行的**：Schema 对实例的自检——那一轮只获准跑 `make design-check` 与 `make docs-check`（整批对齐时补跑，见上）。
- **2026-09-23 起草**（`candidate`）。首版，无前身，无消费者迁移。
  **起草时就知道、现在仍会动本包的事**：
  - **`data.content-blocks` 定型**：`Modality` 改为 `$ref`，catalog 增一条依赖；语义不变。
  - **产品负责人与主线 2026-09-23 的撞名裁决落进 PF-013 正文**（PF-013 升 rev）：S-3 与设计依据表的出处改指正文，语义不变。
  - **G-6 若裁为允许重新上架**：S-3 与 S-10 的「已撤回行仍占名」要改，属语义变化。
- 本包**未产生任何证据**：catalog 登记与 covers 登记只是把坐标与覆盖关系放进发现面。
- **（2026-09-24 整批对齐收尾，不改语义）**：README 的依赖行补上 `data.content-blocks`（S-6，与 catalog 一致）与 `S-15`；「维护档案的能力、模型请求运行时都还没有契约」改为两份候选的坐标。
- **2026-09-24 产品负责人裁定 G-13（候选，未冻结，原地改）**：原话「允许并存，它就像资产一样，路由名就是能力，从下往上（租户 -> 组织 -> official）在运行时覆盖」。
  - [S-3](v2/contract.md#s-3-撞名判定同一范围内唯一)：组织层与租户层同名并存正式化，去掉「待产品负责人确认」；新增一条说明——并存之后谁生效是运行时按层覆盖，链的先后归 `capability.model-profile-directory` v2 S-17、求有效模型归 `capability.model-request-runtime` v2 S-10，本条只保证同一格不重名（所以最具体一格至多一条）。后果表那一行同改。
  - [S-14](v2/contract.md#s-14-引用只精确解析不跨层)：补「同名按层覆盖不是解析」——它产出另一个引用，不放宽本条禁止的跨层回退（同日随主线裁定「先滤已撤回」改写措辞）。
  - **G-13 闭合**，原话记在已关闭缺口表；设计依据表、P-11 的「待确认」随之去掉；「发布后」一段删去「尤其 G-13」。
  - **对证据的影响**：没有既有证据；S-3 的判定不变（只比同一格），场景与实例不改。covers 里 PF-013 §4「档案的身份」那一条的 note 改为已裁。
- **（2026-09-24 产品依据升 PF-013 rev 11，不改语义）**：契约头部产品依据改为 rev 11；rev 11 只动转换件呈现的落点（decisions P40，落在 PF-016 §6.21），不涉及本契约任何条款；对证据无影响。
- **（2026-09-24 主线裁定「范围不允许的也滤」，不改语义）**：[S-3](v2/contract.md#s-3-撞名判定同一范围内唯一) 与 [S-14](v2/contract.md#s-14-引用只精确解析不跨层) 里对覆盖的转述补「这个范围不允许的也先滤掉」；本契约的判定不变。
- **2026-09-24 PF-013 rev 12 最后一轮简化（候选，未冻结，原地改）**：产品正文定「用哪个模型」**记路由名**；主线裁以产品为准。
  - 「用哪个模型」那项设置与会话选中模型的取值域改为 `RouteName`（[S-2](v2/contract.md#s-2-routename)）：拥有清单第 2 项、消费者表两行、「不是什么」表「有效模型 ≠ 选中模型」一行、值名说明、设计依据表三行改写。
  - [S-13](v2/contract.md#s-13-modelprofileref)：引用**只在目录内部与治理面上指认一行**（含有效模型那一行与它的留痕）；设置与选中模型不取它。G-10 的「一组」改为若干个路由名。
  - [S-14](v2/contract.md#s-14-引用只精确解析不跨层)：补「引用只在目录内部指认一行；设置与切换事实记路由名，落到哪一行由按层覆盖定」，从名字到一行只有 `capability.model-profile-directory` v2 S-17 末段一个入口；精确解析、不跨层不变。
  - CS-1 按名字改写：选中的是名字，最具体那一行撤回、链上另有在册同名的就落到那一行；都撤回了才「已下架」。
  - Schema：`ModelProfileRef` 的 description 与 $comment 改写（后者去掉「官方名对所有层保留」「隶属树内唯一」两句旧前提），形状不变。实例第 3 节「裸名字」那一行补说明：设置与切换事实记的正是 `RouteName`。
  - 头部对到 PF-013 rev 12。`data.messages` 的切换事实同日改记 `routeName`（那份契约 S-49）。**对证据的影响**：没有既有证据；Schema 形状不变。
- **2026-09-25 修复波 2（候选，未冻结，原地改）**——逐条处置见[独立评审「第二轮」](#第二轮2026-09-25)：R2-MP-1（消费者表 messages、MRR 两行与 S-20 末条补全）、R2-MR-4 的本契约一半（S-23 协议列：出网之前交回写「已出门」的一方，只随结果回传不够）、R2-MP-2（「切换事实」→「模型切换落下的那条记录」，链 UL-model-switch；实例第 3 节一行、covers 一条 note 同改）、R2-MP-3（S-10 末段按名字写）、R2-MP-4（对齐义务状态）。**语义与表示都不变**：Schema 与实例 JSON 未改，自检不重跑；catalog 不变。

结果不改写规范。发现语义问题回到来源设计（PF-013），不在这里改契约。

## v3 报给主线

1. **已获裁定**：修订命名域、绑定完整值比较、`JsonObject` 引用冲突以及模型 ID 必须等于路由名，均按本批简报与后续消息落到 S-29～S-31，没有自行增加别名或租约政策。
2. **登记交接**：本批 registry 唯一 owner 是主线；候选 catalog/covers 建议随本次交接返回，本 agent 不写四份共享清单。规范工件三份，条款 S-1～S-31；未增加编号族，未增加 formal task，不冻结资源。
3. **G-14，owner 主线及各行为消费者**：数据候选定型不等于目录、函数、运行时或嵌套历史已升级；上表列出当前坐标与采用义务。注册/配置失败值及并发版本保持不能由本 data 包补造。
4. **继承缺口**：G-2（供应商词法，传输适配 owner）、G-8（覆盖去掉参数，运行时/拓展数据 owner）、G-9（extra 同义参数收场，运行时 owner）、G-10（将来模型组，产品负责人）保留，不在本批数据改动中暗关。
