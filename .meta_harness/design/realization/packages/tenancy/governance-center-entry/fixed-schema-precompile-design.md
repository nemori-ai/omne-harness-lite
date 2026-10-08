# 固定Schema的构建与装载

固定图机制只改变编译时机，不改变本节点契约版本、领域拒绝、原值或租户保证。服务端实现归 [governance-center-entry-node](../../../../../../packages/tenancy/governance-center-entry-node/SPEC.md)。本页保留尚未迁出的固定图承诺和验证义务，不保存某次运行结果。

固定图采用构建时编译和首次消费时加载。旧正文中固定图的导入时编译仅在该范围内由本页取代；作者/动态 port 构造和其他生命周期保持。

## 本节点的有限图

| 当前输入拥有者 | 图 | 种类 | 资源 |
|---|---|---|---|
| [src/schema-inputs.ts](../../../../../../packages/tenancy/governance-center-entry-node/src/schema-inputs.ts) | ordinary | ordinary-ajv | identity-values、offer-expiry、本包治理中心 Schema |

`schema-inputs.ts` 只装配资源和派生定义，不执行校验。它拥有资源、定义方法、keyword、options 及装配源码清单；build 须消费全部当前输入。定义集合来自本包 Schema 的 `$defs`，不以历史捕获数量限制当前集合。运行包装不再编译固定图。

## 构建、消费与生命周期

本owner的build先清dist/generated、真实tsc，再生成上述全部图与新鲜元数据；全部成功才交付。任何编译/资源/meta/后续定义/写盘失败非零并清两目录。运行首次实际校验原生加载，缺制品/helper原抛，不伪装拒绝；不回退旧版。发布files包含generated/dist。

普通图保留原unknown、复制/投影、错误格式和精确后置判断；exact/meta生成CJS自身绑定native receiver与keyword实例，raw validator私有、只暴露文本函数，手写包装不分别取helper。源码/dist经owner package坐标读取同一生成物。显式作者runtime仍构造当场检查、由owner持有和释放，没有调用值/作者的module增长cache。

固定制品是进程有界模块所有权，没有新service/plugin/fiber或存储。既有Cordis装配、启动/撤除/静止及租户责任仍归本节点原设计；生成文件不代替它们。

SC-2 的只读导入边界继续约束 `src/routing/schema.ts`。拆出的 `src/schema-inputs.ts` 同样纳入只读叶子检查，只装配既有三份 Schema 资源，不得导入治理服务或写入口。路由校验器通过以包根为坐标的 `createRequire`，加载唯一的 `./generated/ordinary.cjs`；这条有限制品入口不放开其他生成模块或相对导入。

## 验证义务与目前范围

- FS65-1：每个图的全部有限定义实际构建/加载；缺定义或坏固定资源为抛错，不是valid:false。
- FS65-2：原夹具与oracle的布尔/公开errors逐项对拍，原assertions/预期不变；ordinary unknown仍走原路径。
- FS65-3：按全部当前原始输入重算摘要，资源/options/派生/helper改变但未重建必须失败；两次相同输入重建确定。
- FS65-4：缺generated/helper真实反控原抛；共享事务的五类失败在代表性包实测；没有半套/旧制品回退。
- FS65-5：native src/dist身份、full exact/meta/B1/ref/dynamicRef/propertyNames/errors及故意分域反控归CB/messages共享扩散门；未通过不向其余图扩散。
- FS65-6：MR保留导入JSON变异保护；各owner不因晚加载而迟捕资源；运行期不编译固定图的采样及残留作者编译单列。

验证须分别覆盖有限定义、对拍、构建失败、新鲜性和原生消费；共享失败路径由代表性包检查。每次执行的输入、结果和未覆盖范围写本工作树 `tmp/<task>/`。此前旧实现的运行结果不能证明当前生成机制满足这些义务。
