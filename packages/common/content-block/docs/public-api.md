# 引用式内容块契约

本页拥有工具多模态结果所需的共享值契约，已接受设计。[源码](../src/index.ts) 已实现下列类型，`judgeContentBlock` 按本页规则判断 ref 分支的形状。message 的块校验转交 `judgeContentBlock`，因此也接受同一形状。Tool 投影归 Tool，发送阶段的加载归 Model。下列定义只表达新增部分；既有其他导出保持由源码拥有，实现接管后本页改为导航。

```ts
import type { BlockId, Visibility, ContentBlock as ExistingContentBlock } from '../src/index.js'

export type ContentReference = Readonly<{
  storage: string; key: string; mediaType: string; bytes: string; digest: string
}>
export type ReferenceContentBlock = Readonly<{
  kind: 'voice' | 'image' | 'file'
  id: BlockId
  visibility: Visibility
  ref: ContentReference
  transcript: string | null
}>
export type ContentBlock = ExistingContentBlock | ReferenceContentBlock
```

ref 是内容位置和完整性描述，不是下载 URL、读取能力或外传许可。storage/key 非空，bytes 是非负十进制整数字符串，digest 采用内容提供者具名的算法及编码。模型发送端按精确引用核长度、摘要和媒体类型，不按当前同名内容替换。引用式块不能同时带 inline、text 或另一个位置字段。transcript 只能是已有的可靠派生文本或 null，不授权装配阶段读取二进制生成它。

共享值校验只判断形状，不证明内容存在、来源归属、当前权限或模态可用。这些检查由消费领域及内容提供者执行。Tool 的许可集合独立于本包库存：当前面向模型的 Tool 内容由文本块和这些引用式块构成，不自动准入 thinking 或任意嵌套容器。已知媒体种类不表示所有 MIME 格式均能被每个模型消费。

ToolResult 的附件和内容 ref 都使用 ContentReference，但具有不同交付含义。附件区只生成告知地址的文本块，由 agent 决定是否另行取回；不能自动转成多模态块或二进制。内容中的多模态 ref 表示作者要求模型在采用该结果时直接感知，独立声明块身份、顺序和可见性，不要求同时登记到附件区。同一引用同时出现在两处时保留两种明确语义，不以地址相同提升或消除其中一种。ToolMessage 是现有 Message 的 tool 角色及工具结果关联，不另造第二套消息身份。

在面向模型的交付链中，Agent、Session、Request Context 只选择及保存内容 ref，不加载二进制。Model adapter 在实际请求发送前才加载、检查和编码这些模型可见块；文本中的附件地址不进入媒体读取计划。agent 决定读取附件时须发起新的合法读取，返回内容如何进入后续请求沿该次结果的声明处理。工具产出内容及人用界面的独立合法读取不因这条模型请求规则改变。Model 的载入、取消、外传和预算规则归 [Model 规范](../../../model/model-contract/SPEC.md)。

## 消费迁移与验证

实现时在同一波迁移 content-block 的类型/校验、message 的块校验、Tool 投影、Model 适配及真实消费者。现有 stream-arrival 的 inline 增量不是 ref 块的构造协议；本设计的 ref 是已封闭最终块，不据此新增流事件或嵌套语法。非 Tool 来源的现有 inline 路径没有被本页静默删除。

必须验证 ref/inline 混用拒绝、非法字节数和摘要、内容来源归属失配、私有地址未披露、附件仅文本且零媒体读取、无附件的内容 ref 可成立、模型请求前零二进制读取、发送前失权及内容不一致拒绝。值类型编译不能代替发送行为或持久保管验证。
