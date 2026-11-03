# 采用来源与采用点

`adoption-sources` 行保留定义映射的 `prepare`。`create` 仍由该入口生成初始化守卫，不附冻结判定。

## create 的常驻工具

映射条目的 `residentCapabilities` 列出该定义纳入的常驻工具。`agent-adoptions` 的表从定义的引用取这一项：取 `resident` 为 true 的引用，按定义里的顺序取能力名。定义是唯一的声明，表不另存一份。`resident` 为 true 但类别不是 `Tool` 的引用使表构建失败。

`create` 时，`prepare` 用本次 `SessionAccess` 调用本行的规划器，`capabilities` 是这一项，`recorded` 为空。`toolBindings` 与 `toolGenerations` 每次调用时现取，行的 `inject` 仍只有 `definitionMappings`。规划结果写进初始化守卫的 `newResidents` 与 `residentBindings`。Session 按它们提交常驻工具，已提交快照的 `residents` 因此含这些工具。

首次定义取自受信发行快照（`releaseOf`，即 `config/tool-release.json`），不取自调用方：

- `authority`：官方层、发行资产，以及该资产的 holding 与 publication 证据。
- `version`：资产采用的修订。
- `admitted`：拥有者与摘要取资产采用，记录是 `tool-release.json#<名字>/asset`。

所以 J06 由常驻工具投影出的绑定 `{ owner, name, revision, digest }` 等于该发行工具的资产采用。

下列情形都答 `unavailable`，并带以 `resident tools:` 开头的诊断。不留下部分常驻工具：

- `prepare` 没有收到 access。
- 发行快照不受信。
- 某个名字不是发行清单里的工具。
- 登记表 `toolBindings` 缺席。
- 规划器不能为全部名字给出材料。例如某个工具没有唯一的 live 贡献，首装又不被允许。

创建自己声明的常驻工具，只要有一项不在条目的 `residentCapabilities` 里，就答 `invalid`。声明都在映射内时，本行照常出具守卫，由 Session 比较声明与守卫。条目没有 `residentCapabilities` 时，常驻工具为空，本行不读任何 Tool 服务。

**首装的限制。** 发行权威的 `admits` 只接受发行登记者登记官方作者。规划器用会话的 access 首装 Shell、Files 时得到 `denied`，所以创建答 `unavailable`。发行树里还没有一方在启动时以登记者装载这两个作者。在那之前，名字列了常驻工具的定义在发行树里不能创建会话。行用例先由登记者装载作者，再创建。

行目录另导出 `createAdoptionPlanner(options)`。它实现应用的采用点事实采集，通过 Tool 公开接口生成 Session 候选材料。采用规则归 [Tool 契约](../../../../packages/tool/tool-contract/SPEC.md#采用点判定)，交接责任归[工具运行时](../../../../docs/architecture/runtime/tool-runtime.md#冻结判定只随采用材料到达)。

## 输入与结果

`plan(access, input)` 接收原 `SessionAccess`。`input.recorded` 使用 `residentToolFacts` 产生的 capability、key、shape，`input.capabilities` 列出本次需要采用的能力。规划器在等待加载前复制输入，按已记录能力优先的顺序去重。登记表读取和首装使用同一个 access，不反查租户，也不使用 system 作用域。

构造参数提供三个按调用读取的端口。

- `readBindings()` 取得登记表的 `snapshot`。
- `readGenerations()` 取得协调者的 `ensureLoaded`。
- `definitionFor(capability)` 取得受信定义映射中的 `authority`、`version` 和 `admitted`。后两项是首次定义的采用依据，规划器不生成它们。

新能力没有 live 贡献时，规划器按映射中的 authority 首装。协调者返回 loaded 或 recognized 后，规划器重新取得登记服务并读取快照。只有唯一 live 贡献可采用。draining 不参与选择，多份 live 不按 ordinal 选版。

已有能力的 shape 经 `projectResidentReferences` 读取。已记录键必须匹配快照中的实际 key，或匹配受信映射 authority 的公开编码。规划器将事实交给 `planAdoption`，将可用键编码为 Session 材料。已有能力不再输出首次定义，避免覆盖 version、shape 和 admitted。

登记口缺席、快照失败、已记录键或首次 shape 不可解释、首次采用的必要定义缺失，以及任意一项失败，均返回整份 `unavailable`。可读空表仍是登记事实，受信映射能准确恢复已记录键时，可继续采用点判定。加载前产生的外部效果不因规划失败撤销，调用者不能把失败解释为未曾加载。

## 波 2 边界与接线

本模块采用 R2-D13 及修订、R2-D26 的波 2 范围。登记事实可读、已记录键与首次 shape 可恢复时，若 `planAdoption` 请求 reload，规划器以本波已批准的 reload 暂不可用策略再次调用该纯函数，取得 R3 replacement，不调用协调者重装。返回材料保留原键，residents 为空，不覆盖首次定义。Tool 运行时沿原键提供 unavailable 替换件。没有耐久失败依据时不生成 freeze，成功结果的 verdict 为 null。它不提交 Session，也不直接发布 Tool 贡献。

`create` 已由 `sources.ts` 调用本工厂，见上文。新 Run 与 reload 的采用点还没有接线：生产 `SessionAdoptionSource` 没有实现 `plan` 入口。接线时同样在每次调用时读取 `toolBindings`、`toolGenerations`，首次定义同样取自受信发行快照。没有这些输入时保持 `unavailable`，不能新增第二份定义配置或以 testing 替身装配生产。

## 验证

[规划器测试](../../tests/rows/adoption-sources/planner.spec.ts)使用 RD-COORD 的 `createScriptedToolGenerations` 驱动内存登记表，调用真实规划器。类型用例对照冻结的 AdoptionPointInput 与 Session 材料。原 `prepare` 的回归仍在[采用行测试](../../tests/rows/adoptions/adoptions.spec.ts)。

[create 常驻工具用例](../../tests/rows/adoption-sources/create-residents.spec.ts)在真实发行快照、登记者、`tool-bindings` 与 `tool-host` 上调用本行的 `prepare`，再交给 Session 核心 `decide`。

这些证据覆盖应用规划与 `create` 的组合，不证明新 Run 的采用点、Session C2 或端到端已接线。
