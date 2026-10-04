# data.agent-definition v1 规范实例

本页是 v1 规范的一部分。样例时限、路由名与资产名都是实验输入，不是产品初值或官方供给清单。除说明通用壳的场景外，各段都按 `AgentDefinitionBody` 检验。

## E-1 合法的空声明与不透明成员

```json
{
  "references": [],
  "attributes": [],
  "uninterpreted": { "integer": 9007199254740993, "decimal": 0.10000000000000000001 }
}
```

结果是两个明确的空集合；不从 `uninterpreted` 推出含义，保留其中两个数的精确十进制值。此处不表示该正文足以让运行时发出请求。

## E-2 合法的三项声明

```json
{
  "references": [
    { "capability": { "category": "tool", "name": "example:read" }, "resident": true },
    { "capability": { "category": "loop_extension", "name": "example:retry" } }
  ],
  "attributes": [
    {
      "item": "first_token_wait_limit",
      "kind": "setting",
      "category": "preference",
      "domain": {
        "kind": "open",
        "schema": {
          "allOf": [
            { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v3/tool-definition.schema.json#/$defs/Duration" },
            { "pattern": "[1-9]" }
          ]
        }
      },
      "default": "PT0.001S"
    },
    {
      "item": "post_first_token_stall_limit",
      "kind": "setting",
      "category": "preference",
      "domain": {
        "kind": "open",
        "schema": {
          "allOf": [
            { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v3/tool-definition.schema.json#/$defs/Duration" },
            { "pattern": "[1-9]" }
          ]
        }
      },
      "default": "PT1M"
    },
    {
      "item": "model",
      "kind": "setting",
      "category": "binding",
      "domain": {
        "kind": "open",
        "schema": {
          "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/model-profile/v3/model-profile.schema.json#/$defs/RouteName"
        }
      },
      "default": "example/model-a"
    }
  ]
}
```

引用按集合读，不用其数组次序排列拓展件；三项原样成为根声明，并由后续求值取得生效值。

## E-3 表示拒绝矩阵

下列变更分别施加于 E-1 或 E-2，互相独立。除最后两行外，预期局部拒绝都为 `malformed`。

| 变更 | Schema | 边界结果与依据 |
|---|---|---|
| E-1 删除 `references` 或 `attributes`；任一改成 `null` 或对象 | 拒绝 | S-1：不能补空集 |
| E-2 引用条目多出 `order` | 拒绝 | S-3：引用没有顺序槽位 |
| E-2 为 loop_extension 引用加 `resident: false` | 拒绝 | S-3：false 也不能出现在该类引用上 |
| E-2 tool 引用的 `resident` 从 true 改成缺席 | 接受 | S-3：成功，保留未标；不补 false |
| E-2 同一 tool 再引用一次，第二条 resident=false | 接受形状 | S-3：跨条目能力标识重复，边界拒绝 |
| E-2 同一时限项再声明一次，default 不同 | 接受形状 | S-4：item 重复，边界拒绝 |
| 任一声明缺 `default`、取 null、类别改 governance | 拒绝 | S-4～S-6 |
| 声明 `disabled`、`usableBy` 或未列出的项 | 拒绝 | S-4：不能扩张该窄声明集合 |
| 时限 default 为 PT0S、PT00H00M00.000S、PT-1S、P1D、PTInfinityS、PT1e3S 或带末尾换行 | 拒绝 | S-5：非法或零时长 |
| 时限 default 为 PT999999999999999999999999999999H | 接受 | S-5：无数据域上界；运行时调度能力另判 |
| domain.schema 用 sibling pattern，或 allOf 两项交换，或增加 description | 拒绝 | S-8：即使语义等价也不是规范 JSON 值 |
| model default 为空、null、首尾含空白 | 拒绝 | S-6：RouteName 词法 |
| 两槽位合法，其余成员含重复 JSON 键 | 解析后 Schema 看不到 | S-8：接收边界先拒绝，不挑后出现的键 |
| body 保持合规，完整记录的版本线为 1、3 | 局部 Schema 不负责 | 通用校验先给 `version_sequence_broken`，不进入局部投影 |
| 完整记录合规，选中版本不存在 | 局部 Schema 不负责 | 读取者按其契约明确失败，不交出 E-1 |

## CS-1 同一版本的两集合

资产记录有 v1 与 v2，持有明确选择 v1。调用方从 v1 的正文同时读 `references`、`attributes`，二者都原样交出；v2 新增声明不进入该次结果。使用 v1 引用加 v2 声明违反 S-2，即使两个数组分别通过 Schema 也不是合法输入来源。

## CS-2 缺项与实际默认

正文只声明 `model`，两项时限没有声明。投影成功且只交出 `model` 声明；求值输入没有时限声明。任何后续消费者不得引用 E-2 的时限补齐。正文明确声明时限时，只有该声明实际给出的合法默认能进入设置求值。

## CS-3 无损回读与未知正文

读入 E-1 后保留再回读，两个十进制数必须与输入精确相等。将 9007199254740993 变成 9007199254740992、将 decimal 舍入为 0.1，或删除 uninterpreted，均违反 S-1、S-8；两个投影集合相同不足以证明正文保留正确。

## CS-4 通用边界先行

读取完整 AssetRecord 时，先按 `data.asset-model/v3` 的闭合拒绝集合及固定优先级校验。通用壳已拒绝时，不把 body 单独通过作为整份资产有效的证据；通用壳合法后，body 的缺槽位、零时长或同名项使整个窄投影失败，不返回局部成功集合。
