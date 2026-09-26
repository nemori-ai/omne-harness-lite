# xml-format 实现设计

## 来源与采用边界

用户2026-09-26明确要求复用来源树XML格式包；该树实际名字是xml-format（消息中xml-mformat按此承接）。采用范围为 `minimal-runtime` 提交 `d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac` 的项目自有TypeScript格式化实现，其provenance指向omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`。来源只是代码血缘，既有差分golden作为有限开发fixture，不带入旧领域模型/上下文转换器/旧spec接受状态。

普通字段渲染的正确字符与属性约束以[W3C XML1.0第五版 §2.2](https://www.w3.org/TR/2008/REC-xml-20081126/#charsets)与[§3.1](https://www.w3.org/TR/2008/REC-xml-20081126/#uniqattspec)为技术依据。原实现实际会保留U+0000、会输出重复属性；迁入时修复这两处，记录新旧差异，不声称与所有原输入逐字节等价。主调度已读代码后建本映射，领域/机制双盲未达成；这是技术格式化迁入，不建立新产品能力。

## 公开面与技术要求

| 要求 | 公开入口与实际行为 |
|---|---|
| XF-1 声明式渲染 | `formatXml(value,schema,options?)`返回字符串，`XmlSchema`/`FieldSpec`/`FieldSpecs`/`FieldPresentation`/`IncludeWhen`声明字段；attr/element/content，always/not_nullish/not_empty，默认element/always。字段路径可读普通对象、实例或Map；requiredFields与所选optionalFields按声明顺序渲染，schema只是格式说明，不是JSON Schema |
| XF-2 转义和字符 | `escapeXmlContent`转义&/</>；`escapeXmlAttribute`另转义单双引号。普通文本和属性值只接XML1.0 Char字符范围，非法控制字符、孤立surrogate、U+FFFE/U+FFFF抛TypeError，保留合法tab/LF/CR与Unicode；不静默清洗或截掉非法字符。没有解析XML或实体取件 |
| XF-3 名称和属性 | `isXmlName`采用原实现保守ASCII名字子集，非法schema/选项名字抛错；不支持任意命名空间。每一实际生成元素的属性名不能重复：声明字段映射、元素attrs、manualAttributes及列表项字段产生的同名属性均抛TypeError；不能后值覆盖或输出两次 |
| XF-4 选项和类型 | `FormattingOptions`/`ResolvedFormattingOptions`/`RuntimeFieldOverride`与`resolveFormattingOptions`/`applyFieldOverride`；indentSize为0～8整数，默认2。未知extraFields/fieldOverrides拒绝；omitRootTag返回内片段而非完整文档。导出DEFAULT_INDENT_SIZE/MAX_INDENT_SIZE。嵌套toXml只接indentSize/formatDate，父级选字段/手工属性不扩给子对象 |
| XF-5 值与序 | null/undefined空文本，布尔与数字/bigint原值字符串，Date用formatDate（默认toISOString）；标量数组连接或按itemTag包元素，对象数组按itemFields/原有短标量属性规则；普通对象/Map列表原有格式保留。同确定数据和确定无副作用钩子输出同字节 |
| XF-6 主动扩展边界 | `XmlFormattable`/`isXmlFormattable`允许toXml原样嵌入，属于可信渲染钩子；调用方须确保输出是适当合法片段，本包不解析/验证或沙箱其内容。getter/toXml/formatDate可执行调用方代码，抛错原样到达；普通数据的转义不能证明任意主动对象或任意原样片段安全。字符拒绝至少覆盖普通渲染路径，原样片段合法性是调用方前提 |
| XF-7 独立消费 | 公共dist及全部声明类型严格消费；无运行依赖、无需Cordis/租户/会话。旧Pythongolden有限差分、新两个修正及边界负例独立验证；不据fixture声称所有XML语法或Python所有行为等价 |

## 投影、依赖与资源

零插件/service/inject/事件/存储/计时器/远程加载，装卸效应0；只产生字符串，没有提交点。采用Node>=24.18<25，TS/Vitest/@types/node沿根catalog开发依赖。输入和schema归调用方，不读取隐藏配置；不内联任何上下文块、工具结果或业务身份模型。

本版不加入XML解析器，不承诺DTD、namespace、规范化、实体解析、原样钩子权限隔离或任意对象安全。也不把formatter返回的字符串当业务JSON序列化边界：LosslessNumber/opaque等领域值需消费者沿各自契约显式交出合适字符串，不由本包猜其内部表示。用户选择包不自动改变十五core纯模块的既定依赖图。
