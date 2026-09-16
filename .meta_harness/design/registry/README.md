# 身份、版本与关系清单

这里是设计链全部**坐标与关系**的唯一权威。任何会被机器 join 的事实住在这里，
其余目录只引用坐标，不复制一份同义登记。

失效事件：发布、接受、冻结、身份重分解。内容变化都由这些事件驱动，
不因某份正文改了措辞而变。

## 清单一览

| 文件 | 持续含义与关键字段 | 谁写 |
|---|---|---|
| `baseline.json` | `format=1`、稳定 `baseline_id`、输入 `snapshot_id`、Schema `schema_namespace`、旧谱系清单及显式 `version_policy` | 基线切换 |
| `catalog.json` | 当前谱系的精确三元组、family/topic、状态、版本资源、接受决定和条款级依赖 | 发布与接受 |
| `frozen.json` | 已接受 catalog 资源的 SHA-256；发布后只追加，新内容必须新版本 | 冻结 |
| `lineage.json` | 旧→新条款关系、退出身份、`freeze_gate` 与实际产品消费者的旧/新谱系观察 | 重分解 |
| `formal-tasks.json` | 模型种类、已登记工件、可注入 argv runner 和超时；结果不写回规范 | 形式义务变化 |
| `id-namespaces.json` | 稳定编号前缀到拥有者的映射 | 新增编号族 |
| `covers.json` | 需求条款 ↔ 契约坐标的多对多覆盖关系 | 需求覆盖被复核 |

catalog 的稳定键是 `(baseline_id, contract_id, version)`。资源位置为
`spec/{family}/{topic}/v{version}/...`，路径相对设计根；同一坐标重复登记直接拒绝，
即使两个文件内容不同。`accepted` 条目必须链接实际 `record/decisions/` 文件，
全部版本资源必须冻结；候选状态和接受状态不能靠文件存在相互提升。

## lineage

原名 `rebase-map.json`。改名是因为它记录的就是身份血缘——`retired_identities`
与旧新条款 relations——而「rebase」描述的是当初那次操作，不是这份事实的长期含义。
字段与语义不变。

关系声明源/目标 clauses、逐条 mapping、实际 consumers、release evidence 及 freeze gate。
`freeze_gate.blocked=true` 会阻断采用；退出身份不能作为当前依赖复活，
先把其被消费条款映射到当前活体能力，再让 catalog 依赖当前坐标。

一个 source 可以出现在多条 relation 中，因此「一个旧契约拆成两个新契约」用两条关系表达。

## id-namespaces

登记每个稳定编号前缀属于谁，例如需求条款的 `PF-`/`SYS-`、决定的 `D-`、防御指导的编号族。

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

每项覆盖带 `reviewed` 标记。批量导入时 `reviewed: false` 是诚实的初值——
它表示「声称覆盖但尚未逐条复核」，与「已复核确认覆盖」必须可区分；
不要为了让报表好看而默认填 true。以 `false` 计入缺口，由 [views/](../views/README.md)
的覆盖报告汇总。

契约拆分后，覆盖关系按 `lineage.json` 的条款级 mapping 自动仍然正确——
这正是覆盖以**契约条款**而非装配对象为键的原因：对象是会被重新分解的那一层，
以它为键，每次重分解整份索引作废。

## 维护边界

- 清单由发布、接受与复核动作驱动，不在设计正文里顺手改；改动要能指出是哪次事件。
- 不在其他目录复制坐标清单。需要展示时由 [views/](../views/README.md) 派生，派生物不得被引为依据。
- `version_policy` 决定能否新增版本。`{"kind":"initial-uniform","version":1}` 下任何契约都只能有 v1；
  稳定演化阶段切换为 `{"kind":"evolving"}` 后可新增 v2，且不能改写 v1。
- 清单是数据不是叙述。为什么这样分解归 [record/decisions/](../record/decisions/README.md)，
  这里只登记结果。

## 当前状态

骨架已建，**清单尚未从 `design_legacy/` 迁入**，各文件为最小合法结构与占位 `baseline_id`。
迁入前它们不构成有效契约登记，也不能作为采用依据。

迁入涉及两处工具适配，须一并完成，否则检查器找不到清单：

- `tooling/src/check_design.py` 目前要求五份清单直接位于设计根，且文件名为 `rebase-map.json`；
  新结构下它们在 `registry/` 下，且该文件改名 `lineage.json`。
- `id-namespaces.json` 与 `covers.json` 是新增清单，检查器尚无对应校验。

返回[设计链入口](../README.md)。
