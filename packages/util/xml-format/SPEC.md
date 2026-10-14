# xml-format 行为

本页记录类型没有写明的行为。输出字节以 `tests/` 中从封存包迁来的表征测试为准。

## 渲染

`formatXml` 按 `schema.tag` 输出一个元素。字段按声明顺序出现。`presentation: 'attr'` 写成属性。`presentation: 'content'` 写成文本内容。未指定时按实现的默认呈现，测试锁定该默认。

空元素写成自闭合标签，例如 `<root x="😀"/>`。

`Set` 与等值数组走同一条渲染路径。一列对象只有在每一项都自己渲染时，才不再额外包一层字段元素。混合了自渲染对象和普通对象的列表保留字段元素。

路径默认只读自有属性。字段名 `__proto__` 仍可读，因为表征测试要求这个显式字段名能渲染出来。

`FieldSpec` 按呈现方式分开。`attr` 和 `content` 不能携带 `attrs`、`itemTag` 或 `itemFields`。未写 `presentation` 时按元素处理。嵌套 `toXml` 只收到 `indentSize` 和 `formatDate`。

## 拒绝

XML 1.0 不允许的码位在内容、属性、手工属性和嵌套字段上抛出 `TypeError`。制表符、换行、回车和普通空格保留。

`extraFields` 中的名字必须已经声明为 `optionalFields`。未声明时抛出错误，消息包含 `extraFields not declared as optionalFields`。

## 依赖

函数不读环境，不读文件，不导入 Cordis 或其他成员。
