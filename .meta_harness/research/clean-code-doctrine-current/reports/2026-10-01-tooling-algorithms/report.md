# Martin 的度量与审讯工具：算法、常量与提交历史里的坑（2026-10-01）

这是一份**子代理报告的整理稿，是模型输出，不是证据**。它读的是 `unclebob` 六个仓库在下列提交上的源码，全程只读（GitHub API），没有 clone。
主会话亲自读过原文字节并钉了副本的只有三份文件，见[证据记录的 V-T 组](../../evidence.md#v-t-工具源码)；其余条目标「仅转述」，引用前按提交与路径回查。
行内没有标记的结论是读码所得，带「推断」的是读码推出、未运行验证。

读到的版本：uml-viewer@0171682、crapper@4909ad2、mutator@21d6d6f、dependency-checker@61097ea、arch-view@66064d3、swarm-forge main@f4f5fbc 与 six-pack@066a62f。
这些仓库都没有 LICENSE 文件；本报告只记做法、常量与数据形状，不保存源码正文。

本报告的消费者是执行仓库的结构度量工具（`tools/ts-checks/src/metrics/`）：它按这里的做法用 TypeScript 重写，差异逐条记在该工具的中文说明里。

## A. uml-viewer

### A1 数据形状与生成流程

policy 的键（README.md:279-292）：`:title :prefix :src :lang :sources[{:lang :root :prefix?}] :out :hierarchical :order :levels :foreign :edge-kinds{[from to] kind} :omit-edges[[f t]] :omit :proposals`。

生成流程（application/ir_generator.clj:32-63，domain/policy.clj:400-429）：

1. 扫描。每个 source 得到 `{classes edges invokes commands}`；合并时两个非 foreign 类 id 相同直接报错。
2. `collapse-graph`。foreign 类按 `:foreign` 里最长的匹配前缀归并；没列出的 foreign 连同它的边一起丢掉。然后去自环、合并同一对端点的边。
3. 由 `:levels` 给边打 `:violating`、给类打 `:level`。

各键的作用：`:levels` 决定 rank、违规判定与分行；`:order` 只在根视图当初始顺序，之后的重心排序还会改它；`:omit` 按前缀把该 id 及其后代从视图里拿掉。`:edge-kinds`、`:omit-edges`、`:omit` 在每次出视图时才应用，所以键要写成该视图折叠后的 id。

### A2 布局与走线（application/hierarchy.clj，engine/layout.clj、route.clj、curve.clj）

常量（layout.clj:5-16、125-130）：字符宽 8，行高 18，内边距 12，标题栏 32，类间距 40，包间距 40，rank 间距 80，类 rank 间距 140，外边距 40，箭头长 16，通道间距 10。

分行与行内顺序（layout.clj:286-358）：

- 有 `:level` 时按 level 分行，行按 level 降序，**level 0 在最底下**；没有 `:level` 时用广度优先的最短路 rank，根是没有入边的节点。
- 行内顺序：位置 = 下标 × 80；做 5 轮，每轮从上到下逐行，按「无向邻居当前位置的平均值」稳定排序（没有邻居就用自身位置），再重排为下标 × 80。**只有重心法，不统计交叉数。**
- 落位：左对齐，横向累加宽度加 40；行间累加行高加 140。

走线（route.clj:499-551）：先给出若干候选折线（走几何间隙里的通道、从侧面绕、贴着中间各行包围盒绕、直线），再过滤——线段不穿过任何非端点矩形；首末段与端面夹角不小于 45°；不越过目标 12 像素再折回——在合格者里取弯最缓的一条。之后把同一面的端口沿面均匀铺开（两端各留 12%），倒角，套 B 样条，把首末控制柄转到与端面不小于 45°。曲线本身不避让盒子：只在候选折线阶段测碰撞，画线时在框外 5 像素处断开。

合并与简化：

- 同一对端点只留种类等级最高的一条边；合并结果是依赖时，被合并的任一条违规则结果违规（policy.clj:58-60、238-250）。
- 显示模式循环：全部 → 只画包间箭头 → 三角标记 → 元素 → 类（hierarchy.clj:271-277、402-409）。包间箭头模式下每条聚合边保留它捆住的叶子边清单，供悬停与高亮。
- 三角标记（hit.clj:28-77）：画在框的顶边或底边中点，边长 12；捆住的任一条违规就红。
- 提案图的边映射（hierarchy.clj:425-448）：端点可见就用自己 → 嵌套组的拥有者可见就用它 → 最长的可见点分祖先 → 都没有就丢弃。

### A3 违规判定

- rank 先查完全匹配，再查最长点分前缀（policy.clj:196-203）；rank = 组在 `:levels` 中的下标，0 为最内层。
- **违规 ⇔ 边是依赖 ∧ 两端都有 rank ∧ 起点 rank < 终点 rank**（213-220）。同 rank 不算；foreign、无 rank、`:implements`、`:association` 永远不算。
- 全仓没有环检测。互相依赖时画两条箭头，其中「内 → 外」那条是红的。
- 没列进 `:levels` 的节点没有 level、永不违规；但同一视图里只要有节点带 level，它就按 0 被放进最底行（layout.clj:295），和最内层挤在一起。（推断：这是隐性错位。）
- （推断）合并时若违规的依赖与 `:implements` 落在同一对端点上，留下的是 `:implements`，违规标记丢失。包间箭头模式修了这一点，普通视图没有修。

### A4 度量叠加与着色（application/overlay.clj，domain/config.clj，engine/draw.clj）

- 类的 CRAP 统计：取该命名空间下所有有 CRAP 的函数；均值 μ、**总体标准差 σ（除以 n）**、最大值，各自四舍五入到 0.1（overlay.clj:103-113）。风险值 = μ + σ。
- CRAP 评分（config.clj:63-70，**主会话已复核**）：风险值在 8、12、20 三个点上分段线性地映到 10、5.5、1；不超过 8 为 10，超过 20 为 1。色带：不超过 8 绿，不超过 12 黄，其余红。
- 变异分 = 杀死 ÷（杀死 + 存活），**未覆盖的不进分母**；分母为 0 视为缺失。评分在 0.80、0.90、1.00 上映到 1、5.5、10。
- 缺数据 = 评分 1。类的颜色等级 = 两个评分的平均。
- 父节点汇总：CRAP 取最差的 μ + σ，没有 CRAP 的子节点算最差；变异取最差的已测比率，**没测过的子节点让位给测过的**，全部没测才红。README 那句「无数据算最差」对变异已经过时。
- 取色（draw.clj:34-48）：评分不超过 5 时在「差 → 中」之间取色，否则在「中 → 好」之间取色。卡片单元格：覆盖率 ≥ 0.8 绿、≥ 0.5 金、否则橙。

### A5 下钻与交互（adapters/sketch.clj:721-776，application/events.clj:113-139）

- 双击可下钻的盒进入下一层；双击叶类打开卡片；Esc 返回上一级。
- 卡片字段（application/detail.clj:177-226）：名称、Level、模块命名空间、`Crap μ max σ` 一行；表格分 CRAP（Crap／CC／Cov）与变异（杀死／存活／未覆盖）两组；之后是字段与关系（「depends on／used by」）。
- 卡片里点成员打开整个文件并滚到该声明；点关系行选中那个类。
- 边：悬停弹出它捆住的全部「从 → 到」，违规的排前面并标红（draw.clj:373-402）。

### A6 与伴随 agent 的命令（adapters/mailbox.clj，sketch.clj:28-102）

- 队列文件 `{:next-id n :queue [...]}`，写临时文件再改名；只保留最近 32 条；处理一条弹出一条。tmux 只当门铃。
- 发给 agent 的命令：`:regen`、`:refresh-crap`、`:refresh-mutate`（差分）、`:refresh-mutate-all`、`:omit`、`:context`。
- 常驻规则要点：policy 只能反映命名空间嵌套，不得发明层，也不许把命名空间搬家去凑层；每次源码或 policy 改动后跑 CRAP、只对改过的源文件做差分变异、重新生成 IR；未覆盖是覆盖缺口，不要因此重跑，也不要全量变异；没让提交就不提交。

### A7 TypeScript 扫描器（typescript_language/graph_typescript.clj）

用正则加注释掩码，不用语法树。每个文件一个类；跳过 `.d.ts`、测试文件与 `node_modules`、`dist`、`target`。相对导入解析为依赖（`import type` 与 `export … from` 也算）；裸说明符记为 foreign。类上的 `extends`／`implements` 不识别。

（推断，移植时的坑）`./foo.js` 实际指向 `foo.ts` 时解析不到，这条内部边直接丢失；tsconfig 路径别名与 workspace 包名都被当成 foreign，没列进 `:foreign` 就被丢弃；`user.service.ts` 这样的文件名会多出一级假的命名空间。

### A8 提交历史里的坑（原来怎么做 → 出了什么问题 → 改成什么）

1. fea175f7 → eb03c8b4：先改成「缺失变异算红并参与汇总」，结果没测的类在组件汇总里胜出。最后改成「没测的让位给测过的」。
2. 1c494efc → ef9897f4：旧快照没有位点数字段被当成 0，每行都显示「无变异位点」。改为三项计数之和大于 0 就显示计数。
3. 84414884：端口朝向原来按 rank 选，跨包时方向会反。改为按几何中心比较。
4. e8e422f2：跨包边原来用包内 rank 选通道，结果绕到目标下方再折回来。改为几何通道，并拒绝「越过目标再折回」。
5. bcab922f → c0e9e68d：先做「末段垂直于端面」，后来改成「任意角度但不小于 45°」。
6. b77c32d9、6da6eaca：急弯处出现尖角，侧绕的线跑出画布。加了倒角，场景边界改为包含样条控制点。
7. d9790962：大图每帧算样条太慢。改为加载时预先算好，跳过屏幕外的元素。
8. 2f532e27：简化显示后有边的端点没有框，空指针卡死。改为跳过这类边。
9. 8e1c88d4：标题被箭头盖住。改为先画箭头，再画标题。
10. 372caf6c：rank 原来只看顶段，嵌套 id 没法放到不同层。改为最长前缀匹配。
11. 3ac448d8：提案图的箭头连到根视图的折叠框上，和画布上实际显示的叶子对不上。改为映射到可见叶子或可见祖先。
12. 33bcf8ae、8927607c：邮箱原来是单条命令文件，连续点击互相覆盖。改成队列，读完就弹出。
13. f340674d：度量原来有一个按项目名拼出的回退键，换个项目就对不上。改为只认命名空间。
14. 70fffa0c：模块标题原来是拼接名。改为只用最后一段。
15. 97b2fdec 与 README 的「Wrong／Right」一节：从「在 policy 里发明分区」改成「命名空间树就是结构，不在代码里的分组用提案表达」。
16. 7f688f54 → 79cc1ef4：起子进程被包装器挂起，窗口出不来。改为直接后台运行。
17. a8c7a1b0、da417cab：多个项目共用一个 tmux 会话，关一个就杀掉所有 agent。改为每个项目一个会话。
18. 744844d6：Esc 触发图形库默认行为直接退出。改为吞掉并返回上一级。

## B. crapper（TypeScript 部分）

计分单元（languages/typescript.py:168-181，**主会话已复核**）：遍历所有节点，取顶层的 `function_declaration`、类里的 `method_definition`、顶层 `lexical_declaration` 里值为箭头函数或函数表达式的声明。回调和嵌套函数不单独成条目，它们的判定点算进外层函数。`var` 声明、对象字面量里的方法、类字段箭头函数不计分。

圈复杂度（languages/treesitter.py:50-67、typescript.py:23-38，**主会话已复核**）：`1 + 子树中 {if、for、for-in（含 for-of）、while、do、catch、三元、switch case、switch default} 的个数 + 含 && 或 || 的二元表达式的个数`。进入类或接口声明的子树时整棵计 0。`else if` 是又一个 if；`??`、`?.`、逻辑赋值、默认参数都不计。它自己的单测：`if(a&&b)`、`for` 里的 `if`、`try/catch`、三元 → 7。

每函数覆盖率（coverage.py:67-116、272-282）：函数覆盖率 = 区间内命中的行数 ÷ 有记录的行数。**文件不在覆盖率报告里 → 无值**，CRAP 也无值；**文件在、但区间内没有记录行 → 0%**。嵌套函数的行不从外层扣除。

公式与输出（crap.py:6-47）：`CRAP = CC² × (1 − 覆盖率)³ + CC`。排序：有分的按 CRAP 降序，无分的排后面按 CC 降序。每次运行整份覆盖快照文件；`--threshold` 在最大值严格大于阈值时退出码为 2。

（推断，与 uml-viewer 对接的坑）crapper 的命名空间不带前缀、不去掉 `index`，类方法挂在「模块.类」下；uml-viewer 一个模块只有一个类、键是模块命名空间，所以这些方法全部关联不上。对子集运行 crapper 会把其它模块的条目全部清掉。

## C. mutator

- 快照一个命名空间一个文件，每个函数记 `:hash :killed :survived :uncovered :sites`。
- 函数级变更检测（functions.py:24-26、161-178；engine.py:61-98）：`摘要 = sha256(该函数各行去尾部空白后用换行拼接)`；同名多个函数时按行号顺序拼接各摘要再取一次。摘要与上次快照不同才重跑；没变且上次已杀死的跳过。**不用 git diff，也不用文件级哈希。**
- （推断，坑）变异体 id 用绝对字节偏移，函数上方任何编辑都会让 id 变掉，「摘要没变」的函数里已杀死的变异体被重跑。

## D. dependency-checker 与 arch-view

dependency-checker（core/graph.clj:114-140，stats.clj，config.clj:6-40）：

- 扇入、扇出 = 去重后的相邻组件个数。不稳定度 `I = 出 ÷（入 + 出）`，都为 0 时取 0。抽象度 `A = 抽象定义数 ÷ 公开定义数`。主序列距离 `D = |A + I − 1|`。
- 区域：`A + I < 1 − t` 为痛苦区，`> 1 + t` 为无用区，其余健康；`t` 默认 0.3。
- 环：在组件图上跑 Tarjan 强连通分量，大小大于 1 的算环。
- `--init`：把实际观察到的跨组件依赖直接写成允许名单。
- （推断）稳定而没有抽象的叶子组件一律被判进痛苦区。

arch-view（layout/layers.clj:128-340）：先求强连通分量；小的环精确求最小反馈边集，大的用贪心；删掉反馈边后按最长路分层。它后来删掉了整个箭头走线栈（89907df8，删了一千五百多行），改用三角标记加悬停列表。uml-viewer 为什么改用显式 `:levels`，源码和提交里没有明说；（推断）从实际依赖拓扑推出来的层，除了环以外所有边天然向下，依赖规则就查不出任何违规。

## E. swarm-forge

- main 的 `engineering.prompt`：工具一次跑一个；变异是差分的，不传全量参数；按职责拆文件，不为凑位点数拆；不发明项目自己的 CRAP、DRY、变异或覆盖率替代品。main 的这份文件里没有 CRAP 阈值。
- 提交 27f596ad 在 six-pack 分支，不在 main。它把 cleaner 的阈值从 6 提到 10 且检查全部文件，QA 与 hardender 是改动过的文件不超过 10。原文：「A single `cond` or `case` that answers one question may stay above 10; do not split it into helpers that take booleans the caller already knew. Nested or mixed-duty functions over 10 must split, and an extract must own its inputs.」

## 与首轮研究正文的出入

- 研究正文 C-18 把 27f596ad 记为 swarm-forge 的提交而没有写分支；它在 six-pack 分支，main 的宪法里没有 CRAP 阈值。
- 方法论综合第 4 节把 uml-viewer 的着色写成「CRAP／变异着色」；精确规则是上面 A4 的分段线性评分，缺数据的汇总规则对 CRAP 与变异不同。
