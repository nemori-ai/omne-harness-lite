# PR 正文的版式取舍

这里拥有呈现方法；报告触发、计数和交付政策从执行仓库的 CONTRIBUTING 读取。
语言按已加载的 `asd-ste100`，压缩须保留事实、条件、单位、未知和要求强度。

## 先组织阅读路线

开头用短段落说明问题及最终效果。接着展示本次最重要的边界/关系，给报告结论和缺口，最后指出具体审阅位置。
简单 docs 或小修复可以几句话；复杂交付按所需信息展开，不为填满模板制造内容。
正文以最终 diff 为准，删掉失效结论、占位、重复摘要和开发流水。

| 要表达什么 | 适合的形式 | 避免什么 |
|---|---|---|
| 动机与最终结果 | 短段落 | 文件目录流水、任务阶段史 |
| 产品卡完成范围、报告状态、前后读数 | 窄表格 | 长段落塞单元格、缺单位/分母/比较条件 |
| 依赖关系、调用链或生命周期 | 小型 Mermaid 图 | 整库地图、没有判断价值的装饰图 |
| 先后与在途责任、取消/失败交接 | 小型时序图 | 只画成功路径掩盖关键失败分支 |
| 实际 UI 变化 | 必要截图/短录屏加体验步骤 | 未运行的 mock 写成真实可体验环境 |
| 多条红项、原样变异明细、必要长输出 | 折叠块或实际可访问报告 | 把重大缺口藏起来、链接替代结论 |
| reviewer 的追问 | 短列表或位置/问题表 | “请重点看代码”“全部测试通过” |

同一信息选一种主形式，不逐字重复解释图或表。一项简单关系用短句更清楚时，不必画图。
不要规定正文长度或图表数量；以能否快速发现关键问题、判断证据边界为准。

## GitHub Markdown

表格和列表前留空行，表格尽量保持少量列。数值带单位，百分比说明分母；表里的 `|` 用 `\|` 转义。
代码/路径使用行内代码，报告与代码位置给实际可访问的链接；本地绝对路径只面向能访问它的读者。

关系图用 `mermaid` fenced block，采用简单标签和基础 flow/sequence 语法；检查当前目标页面的实际渲染。
紧邻文字保留关键关系，让无图形渲染的读者也能理解；图不证明实现关系或行为。
有 profile 曲线/热点图时使用实际工具产物，写范围、坐标/单位与采样前提，不从示例数值画“实测”图。

折叠块保持 Markdown 所需空行：

```markdown
<details>
<summary>逐条保留项与复跑结果</summary>

这里是应交付的明细。

</details>
```

展开前应能看到结论、重大红项和未知，展开后保留所要求的原样信息及处置。
检查链接、表格、折叠和图；创建前预览与实际 PR 渲染分别报告，不为检查模板创建试验 PR。

GitHub 官方依据：[图](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams)、
[表格](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-tables)、
[折叠](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections)。

## 示例与事实边界

按当前类型只读对应的[feature](examples/feature.md)、[docs](examples/docs.md)、[fix](examples/fix.md)或[refactor](examples/refactor.md)示例。
它们提供受控教学输入与正文，命令/符号/数字不代表当前仓库成果。不能复制成真实测试、卡接受或报告。
实际输入缺数据时保留未知/未执行；对照不可比就说明，不用漂亮数字补齐表格。
报告、图、demo 和审阅问题应相互支持，不应相互矛盾；压缩前后都核对这一点。
