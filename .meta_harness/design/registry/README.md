# 身份、版本与关系清单


这里是设计链全部**坐标与关系**的唯一权威。任何会被机器 join 的事实住在这里，
其余目录只引用坐标，不复制一份同义登记。

失效事件：发布、接受、冻结、身份重分解。内容变化都由这些事件驱动，
不因某份正文改了措辞而变。

## 清单一览

| 文件                 | 持续含义与关键字段                                                                                               | 谁写           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------- |
| `baseline.json`      | `format=1`、稳定 `baseline_id`、Schema `schema_namespace`、旧谱系清单及显式 `version_policy` | 基线切换       |
| `catalog.json` | 每个契约版本一条：坐标、状态、资源清单、接受依据；依赖带精确坐标与消费 clauses。条数不在这里手写，看文件或 `make spec-retention` | 发布与接受 |
| `frozen.json` | 已接受版本的每个资源一项：路径 → SHA-256。过渡期里字节变了就判失败，修订出新版本目录（见规格入口的过渡规则） | 冻结 |
| `lineage.json`       | 旧→新 baseline 的条款关系、退出身份、`freeze_gate` 与实际产品消费者的旧/新谱系观察                                           | 重分解         |
| `formal-tasks.json`  | 模型种类、已登记工件、可注入 argv runner 和超时；结果不写回规范                                                  | 形式义务变化   |
| `id-namespaces.json` | 稳定编号前缀到拥有者的映射                                                                                       | 新增编号族     |
| `covers.json`        | 需求条款 ↔ 契约坐标的多对多覆盖关系                                                                              | 需求覆盖被复核 |

catalog 的稳定键是 `(baseline_id, contract_id, version)`。资源位置为
`spec/{family}/{topic}/v{version}/...`，路径相对设计根；同一坐标重复登记直接拒绝，
即使两个文件内容不同。`accepted` 条目必须内含确切当前采用范围：`acceptance.scope_path` 指向本行 contract_path，`scope_clauses` 保留原精确条款。
全部版本资源必须冻结；候选状态和接受状态不能靠文件存在相互提升。

## lineage

原名 `rebase-map.json`。改名是因为它记录的就是身份血缘——`retired_identities`
与旧新条款 relations——而「rebase」描述的是当初那次操作，不是这份事实的长期含义。
字段与语义不变。

关系声明源/目标 clauses、逐条 mapping、实际 consumers、current_bindings 及 freeze gate。
`freeze_gate.blocked=true` 会阻断采用；退出身份不能作为当前依赖复活，
先把其被消费条款映射到当前活体能力，再让 catalog 依赖当前坐标。

一个 source 可以出现在多条 relation 中，因此「一个旧契约拆成两个新契约」用两条关系表达。

## id-namespaces

登记每个稳定编号前缀属于谁，例如需求条款的 `PF-`/`SYS-`、防御指导的编号族。

它解决的是一类真实事故：独立分析在不知情时为新对象自造一个前缀，
恰好撞上已有契约正在使用的前缀，两套编号在同一篇引用里无法分辨。
新增编号族前先在此登记；登记表为空不等于前缀空闲。

```json
{
  "prefix": "PF-",
  "kind": "requirement-clause",
  "owner": "requirements/product",
  "description": "产品需求 topic 的稳定编号"
}
```

`prefix` 全局唯一，`owner` 指向实际维护它的目录或 topic。
同一 `kind` 可以有多个前缀，但一个前缀只能有一个 owner。

## covers

需求条款覆盖哪些契约条款。**一条需求可覆盖多个契约，一个契约被多条需求覆盖，
这是多对多关系，不属于任一端。**

放需求侧，契约重分解时要遍历全部需求；放契约侧，每个契约各存一份自己的需求列表，
需求改一次要改 N 个文件。两种做法都立刻产生第二份权威，所以它住在关系自己的家。

```json
{
  "requirement": { "topic": "PF-001-tenant-organization-context", "clause": "C1" },
  "target": {
    "contract_id": "capability.tenant-context",
    "version": 1,
    "clauses": ["S-3", "S-4"]
  },
  "reviewed": false,
  "note": "批量导入，尚未逐条复核"
}
```

`target` 用 catalog 的精确坐标；`clauses` 为空表示「覆盖该契约但尚未定位到条款」，
与「已确认不涉及任何条款」不同，后者不应登记为一条 cover。
**一种例外——缺口登记型 cover**：某条契约条款**明文声明**一条需求不归本契约、并点名一个具名缺口
（如入口契约 S-34 对 PF-017 §6.9 登 G-12），这条需求 → 该条款可以登记，`note` 必须写明
「为让缺口可见而登，不表示已覆盖」并指到缺口号；缺口闭合（有契约家）时把 `target` 改指真正的承接条款。
没有点名缺口的否定式提及仍不登。

**互引成环的登记口径（2026-09-25，D-060 §七 M2）**：两份 data 契约要共用同一形状而互相引用会成环时，一侧 `$ref` 并在 catalog 登依赖，另一侧**逐字自定义**、不登依赖，在自己的 `verification.md` 登「对齐义务」（指明以哪一侧为家、逐字同步）。定义性引用（只为说明形状、不据以写出承诺）同样不登。已用此法的：messages↔model-response 的 `ParameterAdjustment`／`droppedParameters`、`SelectedBy`／`CredentialScope`；content-blocks↔slash-command 的来路标记；content-blocks↔tool-definition 的 `ModelToolName`（家在 tool-definition S-6）。

每项覆盖带 `reviewed` 标记。批量导入时 `reviewed: false` 是诚实的初值——
它表示「声称覆盖但尚未逐条复核」，与「已复核确认覆盖」必须可区分；
不要为了让报表好看而默认填 true。以 `false` 计入缺口，由 [views/](../views/README.md)
的覆盖报告汇总。

契约拆分后，覆盖关系按 `lineage.json` 的条款级 mapping 自动仍然正确——
这正是覆盖以**契约条款**而非装配对象为键的原因：对象是会被重新分解的那一层，
以它为键，每次重分解整份索引作废。

## 维护边界

- 清单由发布、接受与复核动作驱动，不在设计正文里顺手改；改动须得到明确授权并保持当前精确状态；接受过程留工作树 tmp。
- 不在其他目录复制坐标清单。需要展示时由 [views/](../views/README.md) 派生，派生物不得被引为依据。
- `version_policy` 决定能否新增版本。`{"kind":"initial-uniform","version":1}` 下任何契约都只能有 v1；
  稳定演化阶段切换为 `{"kind":"evolving"}` 后可新增 v2，且不能改写 v1。这是过渡期的机制；
  终态的修订号模型见 D-113。
- 清单是当前数据，不是接受事件流水。必要理由归承诺拥有者，过程留工作树 tmp。


## 当前采用

精确条款、资源、状态、依赖与覆盖以机读清单为准，不手写每次接受的数量或轮次。
接受不提升实现、覆盖 reviewed 标记或实际验证状态。运行结果留执行工作树 tmp。

lineage 的 `current_binding` / `current_bindings` 只声明现行语义拥有者路径，不能包含提交、源哈希或历史快照。条款映射必须完整，实际消费者不得缺失；release 仍拒绝 unknown、blocked 或没有当前绑定的关系。
