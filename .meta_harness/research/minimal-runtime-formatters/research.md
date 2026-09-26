# 固定来源的格式化与支持件行为

- 对象：minimal-runtime d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac，2026-09-26。
- 消费者：D-046与两util节点；不是现行领域规格。

## Unix 渲染保留 Unicode、码点宽度和尽力表格界

实际调用返回emoji完整截断、命令分隔emdash、负起始行号。表格仅收缩末列，宽前列可超过maxWidth。因此旧README纯ASCII/负start拒绝描述与源码不一致；这些值并不支持终端显示列宽保证。

来源：[16项实际调用](observations.json)，unix.*；固定提交全部文件。代价：视觉宽度与码点宽度不同，调用者控制字符不经清洗。

## XML 普通转义不能保证任意对象或原样片段合法

普通markup字符串被转义，toXml返回的markup原样嵌入；U+0000保留，字段与manualAttributes同名会生成重复属性。名称末尾换行实际拒绝，不把静态怀疑报成缺陷。原实现在这两类输入不能满足XML1.0字符/属性唯一性。getter与回调可执行调用者代码，代价与信任前提由消费方承担。

来源：observations.json的xml.*；采用字符事实由[XML1.0第五版](https://www.w3.org/TR/2008/REC-xml-20081126/#charsets)和[属性唯一性](https://www.w3.org/TR/2008/REC-xml-20081126/#uniqattspec)支持。

## Timeout 与 Brand 不是现有纯包的同义支持件

deadline公开接口的取消通知不证明工作已静止；本次只执行零deadline路径，未验证正超时。非法default/max可产生-1。brand函数原值返回且不校验空串/NaN，与当前identity品牌双向赋值均TS2322，不能替代身份准入。

来源：observations.json的timeout.*、brand.*及compatibility；不支持所有调度语义或未来使用必要性。

## 未覆盖

四包strict noEmit为有限编译观察，未跑来源完整Vitest/构建、原Python或所有输入差分；旧provenance中的golden数量是历史自述。项目自有formatter为private/UNLICENSED、零运行依赖；两DSH支持件固定上游源码和许可核对不授予设计接受。
