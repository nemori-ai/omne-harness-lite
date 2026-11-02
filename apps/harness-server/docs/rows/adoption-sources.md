# 采用来源与采用点

`adoption-sources` 行保留定义映射的 `prepare`。`create` 仍由该入口生成初始化守卫，不附冻结判定。

行目录另导出 `createAdoptionPlanner(options)`。它实现应用的采用点事实采集，通过 Tool 公开接口生成 Session 候选材料。采用规则归 [Tool 契约](../../../../packages/tool/tool-contract/SPEC.md#采用点判定)，交接责任归[工具运行时](../../../../docs/architecture/runtime/tool-runtime.md#冻结判定只随采用材料到达)。

## 输入与结果

`plan(access, input)` 接收原 `SessionAccess`。`input.recorded` 使用 `residentToolFacts` 产生的 capability、key、shape，`input.capabilities` 列出本次需要采用的能力。规划器在等待加载前复制输入，按已记录能力优先的顺序去重。登记表读取和首装使用同一个 access，不反查租户，也不使用 system 作用域。

构造参数提供三个按调用读取的端口。

- `readBindings()` 取得登记表的 `snapshot`。
- `readGenerations()` 取得协调者的 `ensureLoaded`。
- `definitionFor(capability)` 取得受信定义映射中的 `authority`、`version` 和 `admitted`。后两项是首次定义的采用依据，规划器不生成它们。

新能力没有 live 贡献时，规划器按映射中的 authority 首装。协调者返回 loaded 或 recognized 后，规划器重新取得登记服务并读取快照。只有唯一 live 贡献可采用。draining 不参与选择，多份 live 不按 ordinal 选版。

已有能力的 shape 经 `projectResidentReferences` 读取。已记录键必须匹配快照中的实际 key，或匹配受信映射 authority 的公开编码。规划器将事实交给 `planAdoption`，将可用键编码为 Session 材料。已有能力不再输出首次定义，避免覆盖 version、shape 和 admitted。

登记口缺席、快照失败、已有能力登记事实缺失、键或 shape 不可解释、必要定义缺失，以及任意一项失败，均返回整份 `unavailable`。加载前产生的外部效果不因规划失败撤销，调用者不能把失败解释为未曾加载。

## 波 2 边界与接线

本模块采用 R2-D13 及修订、R2-D26 的波 2 范围。需要 reload 时返回 `unavailable`，不调用协调者重装。没有耐久失败依据时不生成 freeze，成功结果的 verdict 为 null。它不提交 Session，也不直接发布 Tool 贡献。

当前生产 `SessionAdoptionSource` 只有 `prepare`，本模块尚未由它调用。接线需要该契约的 plan 入口，并由 `sources.ts` 委派给本工厂。服务来源应在每次调用时读取 `toolBindings`、`toolGenerations`。定义映射还需提供真实 authority、首次 version 和 admitted。没有这些输入时保持 `unavailable`，不能新增第二份定义配置或以 testing 替身装配生产。

## 验证

[规划器测试](../../tests/rows/adoption-sources/planner.spec.ts)使用 RD-COORD 的 `createScriptedToolGenerations` 驱动内存登记表，调用真实规划器。类型用例对照冻结的 AdoptionPointInput 与 Session 材料。原 `prepare` 的回归仍在[采用行测试](../../tests/rows/adoptions/adoptions.spec.ts)。

这些证据覆盖应用规划与内存组合，不证明真实工具宿主、Session C2 或端到端已接线。
