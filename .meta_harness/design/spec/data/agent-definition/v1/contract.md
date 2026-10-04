# data.agent-definition v1

> 候选规范。接受、冻结与执行结果只在版本外入口及 registry 记录。

- 坐标：`(omne-harness-lite-design-2026-09-15, data.agent-definition, 1)`；`family=data`，`topic=agent-definition`。
- 来源：PF-004 rev 12 的 [Agent 定义与装配](../../../../product/PF-004-agent-definition-and-assembly/design.md)、PF-002 rev 20 的 [属性声明与组合](../../../../product/PF-002-assets-settings-and-permissions/design.md)、PF-013 rev 13 的 [时限设置](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值)。两个正文槽位、三个项名、类别、规范取值域与本批窄范围由主线施工简报裁定；产品正文未规定它们的 JSON 拼写。
- 术语：[Agent Definition](../../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-agent-definition--agent-定义--agent-definition) 是资产的变体；本文不给它另一套身份。
- 编号 `S-n` 只在本坐标内有效；`rebase_relation` 均为 `null`，本版是新正文契约。

## 精确依赖

| 坐标（共同 baseline 同上） | 消费条款 | 用途 |
|---|---|---|
| `data.asset-model/v3` | S-2、S-3、S-8、S-9、S-10、S-12、S-13、S-15、S-18、S-26、S-27、S-28、S-36 | 能力标识、记录与所选版本、正文外壳、AttributeDeclaration、保留项、表示拒绝 |
| `data.tool-definition/v3` | S-14 | Duration 的唯一表示、单位与相等规则 |
| `data.model-profile/v3` | S-2 | model 设置的 RouteName 取值域；该依赖本批仍为候选 |
| `data.content-blocks/v3` | S-24 | 严格 JSON、重复键拒绝与十进制数无损读写口径 |

本契约不规范依赖任何求值能力、注册表或装配清单版本；它们对本契约的采用由各自登记。`capability.asset-evaluation/v3` S-6、S-7 C14 仅是既有 AssetReference 形状与约束的来源说明，不消费其操作或求值保证；本包按 registry 的 M2 口径逐字投影这份形状，S-3 拥有本窄投影的纯值规则。同形对齐义务见版本外 verification。

## 含义与使用范围

### S-1 只解释组合根的两个槽位

本契约只给 `AssetContent.category = "agent_definition"` 的 `body` 中 `references`、`attributes` 两个槽位建立读取规则。适用者是为一次装配或求值读取组合根的调用方，不是任意访问资产的调用者。

`body` 必须是 JSON 对象，两槽位必填；可分别为空数组，缺席、`null` 都不等于空数组。其他 `body` 成员仍不透明：读者不解释、不推属性、不赋予身份，也不删除或改写；持有完整正文的边界须能无损保留并回读它们。Schema 不关闭整个 `body` 的未知成员。

本契约没有 master 类目、委派、协作、上下文、子 agent 行为或完整 Agent Definition 的承诺；通过本窄校验不表示这些能力已支持。引用到根以外的 Agent Definition 时，不能据本契约宣称已有完整 sub-agent 正文规则。

### S-2 来源是所选不可变版本

根身份、资产记录号、版本号及正文外壳沿 `data.asset-model/v3` S-3、S-8～S-10、S-18。两个槽位必须同时取自调用方选中的同一份已发布 `AssetVersion.content.body`，不从不同版本拼接，不以草稿或调用时的最新版本替代。正文投影不另带 `id`、`name`、`version` 或运行时身份；不解释其余不透明成员也不使它们成为身份。

本契约只定义所选正文的值约束，不执行资产查找、权限判定或版本选择。取不到指定版本是调用能力的明确失败，不能交出两个空数组作为成功读数。

## 两条读取规则

### S-3 references

`body.references` 是 `AssetReference[]`：每项为 `{ capability: CapabilityId, resident?: boolean }`，没有其他成员。`AssetReference` 是既有共享表示名，不是新增领域对象；本节与 `capability.asset-evaluation/v3` S-6、S-7 C14 同形，同步义务见 verification。`CapabilityId` 引用 `data.asset-model/v3` S-2、S-3 的词法与精确相等规则，允许其八类类别。

按集合解释，数组次序不承载含义；同一能力标识至多一条，即使两条 `resident` 不同也不能并存。`resident` 仅能出现在引用 `tool`、`skill` 的条目上；缺席表示未标，不能在读取时补 `false`。本读取规则原样给出各条引用，既不判引用目标是否可用，也不丢掉求不出的目标。

引用集合不承载装配执行次序。需要顺序的消费者必须从拥有顺序语义的契约取得显式输入，不把这个数组的存储顺序变成顺序依据。引用自身或成环不是本值层的判定；组合求值拥有该失败。

### S-4 attributes

`body.attributes` 是 `AttributeDeclaration[]`，每项直接引用 `data.asset-model/v3` S-12 的同一形状和含义。本版正文的推出规则恰为：校验通过后，交出该数组表示的声明集合，内容不改写；同一正文必得同一集合，不读持有、租户、时间或环境。

项名只允许 `first_token_wait_limit`、`post_first_token_stall_limit`、`model`，每个至多一次；数组次序不承载含义。不要求声明任一个或全部三个，允许空数组。声明必须是 `kind: "setting"`，带相应 `category`、`domain` 和显式作者 `default`。`disabled`、`usableBy` 沿通用资产契约保留，不由本正文声明或复制；添加它们的责任仍归通用求值。

### S-5 两项时限

`first_token_wait_limit`、`post_first_token_stall_limit` 的 `category` 恒为 `preference`。两者 `domain` 的唯一规范 JSON 值是：

```json
{
  "kind": "open",
  "schema": {
    "allOf": [
      { "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/tool-definition/v3/tool-definition.schema.json#/$defs/Duration" },
      { "pattern": "[1-9]" }
    ]
  }
}
```

`default` 必须合该域：先是 S-14 定义的合法 Duration，按精确十进制数计算时长，值严格大于零。不能将 `PT0S`、`PT00H00M00.000S` 或任何全零时长作为默认；`PT0.001S` 合法。时长没有数值上界，不能引入某语言浮点或计时器范围作为本数据域限制。有限 JSON 字符串可表达的时长均是有限数值；`Infinity`、指数、负数、日历单位均不在 Duration 的表示内。

时长相等仍沿其唯一家：`PT60S` 与 `PT1M` 语义相等。读者保留作者的合法原文，不做单位转换或规范化改写。消费端无法调度某个合法时长时，由其契约明确失败，不能截断、溢出或当作无限等待。

### S-6 model

`model` 的 `category` 恒为 `binding`，`domain` 的唯一规范 JSON 值是：

```json
{
  "kind": "open",
  "schema": {
    "$ref": "https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/model-profile/v3/model-profile.schema.json#/$defs/RouteName"
  }
}
```

`default` 必须是 `data.model-profile/v3` S-2 的 RouteName。它是作者给出的设置默认，不是已解析的模型档案引用；本读取不查目录、不补来源或范围、不判断现在能否调用。该项可以不声明，声明时不能省略 `default`，也不能用空串或 `null` 表示未配。

### S-7 缺席不补

声明缺席意味着本正文没有声明该项，调用方交给求值的根声明集合里也没有它。不得从示例、宿主配置、上次调用、模型适配配置或另一版本补项或默认值。默认值仅来自实际存在且合规的声明；本契约不给任何数值或模型默认。

表示拒绝、取不到正文与合法空数组分别是三个事实，不能互换。合法空数组不会因此变成不可读；必需设置缺席是否使请求失败由运行时契约判定，不得把本投影成功误作可发出模型请求。

## 表示与边界校验

### S-8 无损输入和规范取值域比较

整个正文（含不透明成员）沿 `data.content-blocks/v3` S-24 的严格 JSON 口径：任一层重复成员名即 `malformed`；不能选一个成员继续。任一 JSON 数读入、保存、回读仍为同一个十进制数，不能把超出二进制安全整数范围的数字舍入。`true` 不等于 `1`；对象成员顺序不影响相等，数组次序影响 JSON 值相等。

S-5、S-6 要求的是所列 `domain.schema` 的确切 JSON 值，不是序列化字节相等，不接受任意语义等价的 Schema 拼法。不得解析作者额外给出的远程 Schema 来代替规范域，也不得因本包 Schema 校验器忽略了未知关键字就放行替换域。

### S-9 校验边界

本契约是纯数据契约，不新增操作名、能力、状态机、提交点、幂等键或事件。读取规则的九项边界如下：

| 项 | 承诺 |
|---|---|
| ① 前置 | 调用方明确取得所选已发布版本；完整资产先经过通用 `data.asset-model/v3` 形状及跨字段校验，再检验本正文的窄约束 |
| ② 授权 | 调用方拥有资产读取与版本选择的权限边界；本纯值规则不授予权限，也不推断当前租户 |
| ③ 输入 | 同一所选版本的完整 JSON body；已解析输入必须来自满足 S-8 的接收边界 |
| ④ 状态与提交 | 无写入、无状态变化、无提交点；不修改输入正文或任何保存的版本 |
| ⑤ 成功结果 | S-3 的引用集合与 S-4 的声明集合，完整、确定、来自同一正文；不附加求值后的设置值 |
| ⑥ 失败 | 通用校验沿 `data.asset-model/v3` S-27 的既有闭合集合及次序；通过通用校验后，违反本包 S-1～S-8 的局部拒绝值只有 `malformed`，不新增拒绝枚举 |
| ⑦ 缺席 | 任一必填槽位缺席即 `malformed`；某个声明缺席按 S-7；尚未取得所选版本不得调用本规则并假造成功结果 |
| ⑧ 原子性与重放 | 只读纯值；失败不交出局部成功集合。相同 body 给出相同结果，不读取外部状态，无恢复动作 |
| ⑨ 观察与交接 | 只交付两集合；表示拒绝不是引用目标不存在、无权限或设置求值结果。调用方保留正文来源和版本依据，错误诊断不得替代输入事实 |

`data.asset-model/v3` S-10 对不透明正文的禁止解释仍有效；本契约及消费者对它的精确采用成立后，才有这两个槽位的正文规则。仅接受通用壳、仅存在一份 fixture 或本候选文件，都不足以授权字段读取。

### S-10 Schema 的表达范围

规范 Schema 是 [agent-definition.schema.json](agent-definition.schema.json)，Draft 2020-12，绝对 `$id` 按本坐标派生。它登记 `AgentDefinitionBody` 与 `AssetReference` 两个形状名；前者是整个 `body` 的局部约束，不是另一个对象或完整正文承诺。根模式不约束任何文档，消费者显式引用定义。

Schema 表达必填槽位、项类别、规范域、默认取值、resident 适用类别以及逐字相同的重复元素。它不能独自发现解析前重复 JSON 键、跨条目同一 capability 的不同 resident、不同声明内容的同名 item、来源版本错误、输入被浮点舍入或未知成员被读写器丢失。这些由 S-2、S-3、S-4、S-8、S-9 的边界校验和消费者符合性证据兑现。

本契约没有并发、共享状态或生命周期协议；不建立空行为模型。结构约束以 Schema、反例与真实消费者场景验证，不把数据域构造正确当作实现证明。

## 已知缺口

| 编号 | 缺口与阻断范围 | owner |
|---|---|---|
| G-1 | 完整 Agent Definition 正文及根以外 Agent Definition 的规则未成立；本版不关闭 `asset-model/v3` G-6 的全部范围，也不宣布支持 sub-agent、master 类目等 | PF-004 owner 与后续正文契约 |
| G-2 | 选中版本的实际读取、通用校验后按本包校验、两集合到求值输入的真实交接与来源一致性尚需消费者契约采用及提供者证据；fixture 不替代它 | 资产注册表、装配清单与资产求值的消费者/提供者 owner |
| G-3 | `data.model-profile/v3` 仍为候选；本包依赖的 RouteName 采用须与本批一起经独立评审及接受 | 本批主线与规格接受者 |

## 版本边界与规范工件

v1 新建窄正文规则，不修改或覆盖已接受 `data.asset-model/v3`。旧消费者保持原版本与不透明解释边界，新消费者显式采用本契约。规范工件恰为本文件、Schema 与 [examples](examples.md)。条款、Schema 或规范场景发布后不可原地覆盖；实际结果和变化影响在版本外 [verification](../verification.md)。

## 报给主线

本包没有自行选择新产品政策。完整正文未覆盖范围见 G-1，实际来源链见 G-2。`AgentDefinitionBody` 与 `AssetReference` 是表示名称，不是新增领域对象；后者与既有 evaluation/v3 的正式名同一。registry 由任务指定的唯一集成者写入，候选登记元数据随本次交接提供，不得将起草当作接受。
