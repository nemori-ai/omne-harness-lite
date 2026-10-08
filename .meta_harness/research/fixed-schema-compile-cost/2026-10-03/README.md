# 2026-10-03 接续观察

原研究基线和转述边界保持；本目录只追加本次实际读数。源码基线4425061ce的无损交接、compiler-free机械提取探针，以及25c0b5e86的资源构造捕获分开记录。

- [原生身份探针结果](upstream/native-boundary-probe/results.json)：61 oracle case在src/dist共122次及6 meta case两域通过；helper仍导入旧编译器，不能据此声称compiler-free。旧raw-root的两个错误真实复现。首次strip-only模式失败的原日志保留。
- [compiler-free探针结果](upstream/compiler-free-probe/results.json)：65 case在两域共130次布尔与完整Ajv errors一致，6 meta case两域一致；即时errors快照不被后续调用改变，新进程消费generated/helper没有加载Ajv编译器。这里只用机械提取的现行函数，没有实际发布子入口、全图、构建事务或性能验证。
- [实际装配捕获](upstream/captured-graphs-65/index.json)：22源码、26图、435定义请求。编译器是记录器，未执行任何校验；CLI forms的假返回true调用显式记录在unvalidatedInvocations中，不能作为forms通过。首次ST require ESM失败的原件在upstream/captured-graphs-65-r1，r2只排除不参与初始化的函数/异常类导入。
- [摘要清单](upstream/provenance.json)保留原路径与SHA。生成探针CJS仍带原绝对helper坐标，是原run字节，不宣称可直接迁移运行；源码从仓库根执行可重建探路件。未复跑原第三方库或全量性能研究。

消费者是固定Schema提案，选择与实现接受不归本目录。

原始源码、JSON、日志和生成代码位于upstream，以保持run字节；原官方Markdown快照另存.md.txt，正文和SHA不变，上游相对链接不成为本仓库导航。原路径映射见父topic的upstream/source-paths.json。

追加[生成模块绑定式r2结果](upstream/compiler-free-bound-probe-r2/results.json)：生成CJS自身绑定receiver与关键字helper，消费者只调用文本函数；65 case两域布尔/errors及6 meta两域仍一致，独立进程未装载编译器。只是探针接线，不代表实际包导出或发布验证。
