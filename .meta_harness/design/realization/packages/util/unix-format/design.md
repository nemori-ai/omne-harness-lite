# unix-format 实现设计

## 来源与采用边界

用户2026-09-26在core实施期间明确要求复用 `minimal-runtime/packages/util/unix-format`，用于统一格式化策略。原树提交 `d79484d9f4b8c726b6d7e37a36ae5698f4c8ecac`，其项目自有移植来源登记为 omne-next `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5` 的 unix_format；后者只是来源说明，不把旧spec或Python实现当现行领域契约。逐文件来源hash与迁入差异由实际交付记录绑定，来源树只读保留。

本节点是无领域事实的技术格式化件，沿用户指定放在util；不进入core数据契约依赖图，不创造任何工具返回值、状态、权限或消息模型。主调度已经读过源码后起草本映射，领域/机制双盲未达成；本次窄技术迁入不能据此声称完成新产品能力建模。

## 公开面与技术要求

| 要求 | 公开入口与实际行为 |
|---|---|
| UF-1 信封和段落 | `formatError(message,{hint?})`、`formatSuccess`保留缺席和空hint差异；`formatHold(message,{steps?})`给按序步骤。`formatSection(title,body,options?)`用Markdown heading或纯文本heading、空正文行不加缩进；`formatUsage`原样嵌入synopsis；这些标签不等于产品Outcome/授权结论 |
| UF-2 列表和表格 | `formatCommandList`按码点列宽对齐；`formatTable(headers,rows,options?)`行长须和表头一致，否则抛Error，空表头返回空串；只收缩末列且末列至少容纳三点，故maxWidth是尽力界，不承诺任意宽前列也能压到界内。`formatKeyValue`接受记录或Map，前者用JS成员枚举顺序、后者保持插入序；`formatBulletList`逐项输出 |
| UF-3 行号 | `formatNumberedLines(lines,options?)`使用至少6列号码槽，start默认1且可为负整数；非整数拒绝。按给定绝对start递增，perLineCharLimit截正文并附标记，仍占一行；maxWidth再截整行，极小值可能截掉标记。空数组返回空串 |
| UF-4 选项 | `UnixFormatOptions`/`ResolvedUnixFormatOptions`、`DEFAULT_UNIX_FORMAT_OPTIONS`和`resolveUnixFormatOptions`；默认width120/indent2/Markdown true，width0不封顶。width/indent/perLineCharLimit不得负或非整数，非法值抛RangeError；不把signed start误写成非负要求。另导出`CommandEntry`/`NumberedLinesOptions` |
| UF-5 Unicode与确定性 | 宽度、补齐、截断按Unicode码点，非终端显示单元；保留调用者Unicode/换行，不声称纯ASCII或数据转义。渲染器不自行添加ANSI颜色或方框边线，但不充当输入控制字符清洗器；多行项不自动做续行缩进 |
| UF-6 独立消费 | 公共dist入口、严格类型消费者及全部声明类型可用，无运行依赖、不穿透兄弟src；同输入在固定选项和JS枚举语义下输出同字节。旧golden迁作开发fixture，并明确有限来源比对范围 |

## 投影、依赖与资源

自有TypeScript实现移植适配，Node>=24.18<25，TS/Vitest/@types/node只用根catalog开发依赖；没有运行依赖。无插件、service、inject、事件、存储、计时器或装卸效应（0）；输入/选项由调用者给出，结果是字符串，无提交点或恢复流程。配置只是一轮显式渲染参数，不取全局环境。

没有隐式业务消费关系。本阶段core包不因新增util而更改已接受依赖；未来消费者选择哪种格式和在哪个输入边界使用仍归其契约/映射。原分支说明中的纯ASCII及负start拒绝两处按真实行为校准；不整体合入旧分支，不保留旧docs/spec/research副本。
