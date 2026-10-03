# 固定Schema的构建与装载

2026-10-03；技术采用D-116，当前机制实现／实际验证均待。这个补充只改变固定图的编译时机，不改变本节点契约版本、领域拒绝、原值或租户保证。

采用依据：[D-116](../../../../record/decisions/fixed-schema-precompile/README.md)；完整共享机制与有限公开面：[施工设计](../../../../record/proposals/fixed-schema-precompile/design.md)。旧正文里固定图的导入时编译句仅在该范围内由本页取代；作者/动态port构造和其它生命周期保持。

## 本节点的有限图

| 装配源码 | 图 | 种类 | 资源登记数 | 定义请求数 | 精确装配记录 |
|---|---|---|---|---|---|
| `packages/core/agent-definition/src/index.ts` | 0 | exact-runtime | 8 | 1 | [资源/选项/定义](../../../../../research/fixed-schema-compile-cost/2026-10-03/upstream/captured-graphs-65/packages__core__agent-definition__src__index.ts.json) |

记录器只执行资源/派生构造，没有校验；definitions含原getSchema/compile方法、keyword与options、资源内容及装配源码SHA。build输入须与其逐项对齐；新的src/schema-inputs只装配，运行包装不再编译固定图。

## 构建、消费与生命周期

本owner的build先清dist/generated、真实tsc，再生成上述全部图与新鲜元数据；全部成功才交付。任何编译/资源/meta/后续定义/写盘失败非零并清两目录。运行首次实际校验原生加载，缺制品/helper原抛，不伪装拒绝；不回退旧版。发布files包含generated/dist。

普通图保留原unknown、复制/投影、错误格式和精确后置判断；exact/meta生成CJS自身绑定native receiver与keyword实例，raw validator私有、只暴露文本函数，手写包装不分别取helper。源码/dist经owner package坐标读取同一生成物。显式作者runtime仍构造当场检查、由owner持有和释放，没有调用值/作者的module增长cache。

固定制品是进程有界模块所有权，没有新service/plugin/fiber或存储。既有Cordis装配、启动/撤除/静止及租户责任仍归本节点原设计；生成文件不代替它们。

## 验证义务与目前范围

- FS65-1：每个图的全部有限定义实际构建/加载；缺定义或坏固定资源为抛错，不是valid:false。
- FS65-2：原夹具与oracle的布尔/公开errors逐项对拍，原assertions/预期不变；ordinary unknown仍走原路径。
- FS65-3：按全部当前原始输入重算摘要，资源/options/派生/helper改变但未重建必须失败；两次相同输入重建确定。
- FS65-4：缺generated/helper真实反控原抛；共享事务的五类失败在代表性包实测；没有半套/旧制品回退。
- FS65-5：native src/dist身份、full exact/meta/B1/ref/dynamicRef/propertyNames/errors及故意分域反控归CB/messages共享扩散门；未通过不向其余图扩散。
- FS65-6：MR保留导入JSON变异保护；各owner不因晚加载而迟捕资源；运行期不编译固定图的采样及残留作者编译单列。

这些是尚待的具名验证义务，没有新bindings evidence指向未运行用例。此前旧实现run保持原坐标；本技术采用不把它们变成新生成机制证据。

## Ajv standalone运行辅助依赖

该owner显式声明当前catalog固定的Ajv依赖，供生成模块按需加载官方`ajv/dist/runtime/*`辅助函数；标准standalone产物可能引用equal等函数。CB生成器仍在build提供编译上下文，产品根入口与固定校验不加载Ajv编译器，不复制官方helper或经CB新增公开helper接口。依赖缺失仍原抛，不依靠别的成员偶然提供裸specifier解析。
