# @omne-harness/xml-format

[English](README.md)

按字段声明把值渲染成 XML 文本的纯函数。本成员从封存的 `packages.0.0.1.legacy/util/xml-format` 迁入。函数名和测试锁定的输出字节不变。包名是 `@omne-harness/xml-format`。

## 职责与状态

本成员拥有 XML 名字检查、文本转义和 `formatXml`。它不拥有模式注册表、解析器或应用命令。类型表达不了的行为在 [SPEC.md](SPEC.md)。`tests/` 下的表征测试锁定输出字节。

## 使用

```ts
import { formatXml, type XmlSchema } from '@omne-harness/xml-format'

const schema: XmlSchema = {
  tag: 'root',
  requiredFields: { x: { presentation: 'attr' } },
}

formatXml({ x: '😀' }, schema)
```

上面的调用返回 `<root x="😀"/>`。

## 契约

`formatXml(value, schema, options?)` 返回一个 XML 元素。属性和子元素的顺序跟随字段声明。文本被转义。带 `toXml` 的嵌套对象通过该方法嵌入。

`escapeXmlContent` 和 `escapeXmlAttribute` 转义文本。`isXmlName` 判断字符串是否为 XML 名字。非法的 XML 1.0 字符在每条渲染路径上抛出 `TypeError`。未声明为可选字段的 `extraFields` 名称会抛出错误。

## 设计

`src/format.ts` 选择字段并渲染。`src/escape.ts` 拥有转义和名字检查。`src/options.ts` 解析缩进和字段覆盖。`src/types.ts` 放模式类型。`src/index.ts` 再导出公开表面。调用方导入包名，不导入源码文件。

## 配置与运行

`FormattingOptions` 选择缩进和手工属性。默认缩进和最大缩进是导出的 `DEFAULT_INDENT_SIZE` 与 `MAX_INDENT_SIZE`。这些函数不读环境变量，也不读文件系统。

Node `>=24.18.0 <25`。没有运行时依赖。

## 验证

`pnpm test` 先构建，再运行从封存包迁来的表征测试。`pnpm run typecheck` 先构建，再对测试做类型检查。套件包含非法字符用例，以及用普通 Node 导入 `dist/index.js` 的用例。

## 维护

改变输出字符串或错误消息时，同一次修改 SPEC.md 和对应测试。不要依赖应用或 `unix-format`。不要从封存目录导入本包。
