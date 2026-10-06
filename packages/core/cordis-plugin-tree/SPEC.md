# Plugin tree

公开形状归 [src/index.ts](src/index.ts)。纯根拥有两层数据合成和安全描述；
`./cordis` 拥有准备、加载及实际 fiber 检查。采用依据为
[已接受的插件树设计](../../../.meta_harness/design/architecture/identity-integration/plugin-tree.md)
与[宿主接口补充](../../../.meta_harness/design/record/decisions/identity-t4-host-coordinates/README.md)。
本包的实现与验证状态不表示宿主或两域整改已经完成。

## 数据与来源

完整校验发行层和运维层后，按编辑顺序合成。id 是最多 128 字符的
`[a-z0-9][a-z0-9-]*`，整个字符串都须符合。引用只含 npm 包名和 JavaScript 导出标识符，
不能包含文件路径、URL、子入口或 `..`。配置只接受有限 JSON 值、普通数据对象及完整数组。
访问器、循环、非普通原型、非有限数、稀疏数组及 JSON 之外的值均拒绝，不通过 stringify 丢字段。

replace 整份替换配置，可整份替换插件引用；disable 保留行位置和 id；insert 只能定位启用行。
缺失目标、停用目标、重复 id、重复编辑和未知字段均失败。插入后的 id 也不能再次编辑。
结果捕获并冻结输入，保留来源与编辑位置，不重排依赖。安全描述保留所有行，配置恒为
`[redacted]`，不输出配置值、键、长度或摘要。错误只携带封闭 code 和合法定位，不附原异常文本。

## 准备

准备重新校验外部传入的合成行。解析器只解析启用行，取得所选 `/cordis` 具名插件对象或
Service 子类。配置 Schema 和 describeAssembly 必须同步、纯且确定；模块顶层不得启动资源。
准备不执行插件、不构造 Service，也不为受信部署代码提供沙箱。

声明使用一次配置校验的输出。实际加载仍接收捕获的原配置，避免把转换结果再次转换。
声明与原配置均捕获到不可伪造的准备结果；公开部分只含 ids、安全描述和进程内声明。
声明的 claim 配置可能包含秘密，不能打印。

每个必需键必须来自更早的启用行或外部服务。可选键缺席允许；本树存在提供者时也须前置。
各服务键集合由唯一非空字符串组成。声明恰含 provides、requires、optional、dynamicProvides、dynamicRequires 与 claims。
provides 与 dynamicProvides 不重叠；requires、optional、dynamicRequires 两两不重叠，
动态消费不能由本行提供。静态和动态提供不能重复同一键。所有当前提供者声明都使用这一形状。

dynamicProvides 表示固定 host 拥有可独立发布、撤除和替换的实际领域能力；dynamicRequires
表示 host 内部工作按原领域协议读取这种动态能力。准备仍要求动态提供角色前置，不要求该
能力在加载时或之后永久存在。其缺席和换代结果归原领域契约，不由 loader 补默认值。
静态 requires/optional 不能消费动态提供者，dynamicRequires 不能消费静态提供者；
混合投影以 invalid-declaration 拒绝。externalServices 仍只声明静态外部服务。
隐含 assemblyLifetime 不能动态提供或动态消费。
claim 的 name 非空、version 为正整数，同行 name/version 对不能重复；config 必须是有限 JSON。
重复提供、外部冲突和缺失依赖均拒绝，不作拓扑排序。assemblyLifetime 是隐含行端口，
不能声明提供。声明只说明提供者的承诺，真实行为仍须验证。

## 加载、停止和完成

加载先验证准备身份、lifetime 的完整有序 ids、未使用状态及外部服务可见性。
这些前置拒绝不接管或关闭资源。最后同步 tryClaim，同 tick 只有第一个调用能取得控制权。
句柄先于任何 apply 返回；准备后的导出不会再次按包名解析。

每行通过独立端口登记 OwnedWork，再开始副作用。就绪须同时满足登记、OwnedWork.ready 成功、
实际 fiber ACTIVE、静态 provides 声明的服务可见及代际仍有效。未开始的后缀在失败或停止后不再加载。
ready 立即报告首个观察到的终结原因；已成功的 ready 保留历史结果。内部始终观察拒绝。
固定 row/port 本身退出 ACTIVE，或静态 provides/requires/optional 的实际提供者丧失、
同键换代或改变可选依赖拥有关系，均结束整代，不能承接新代。判断比较真实提供者身份，
不能只比较是否仍可见。纯动态贡献子 fiber 退出不自动结束固定行；它撤掉静态声明服务时
仍结束本代。动态服务缺席和换代按原领域契约处理。内部工作的失败与收尾仍由 host 拥有，
动态声明不替代真实 OwnedWork.ready/close，也不授予租户或业务权限。

dispose 请求停止并返回同一个 closed Promise。先等待协调器完成真实 OwnedWork，
再逆序撤除行 fiber，最后逆序撤端口。setup、close、fiber 和端口失败分别保留。
未完成的工作继续由本代持有，不能用超时假报关闭完成。借入 Context 和外部资源由宿主保持到
closed 之后。隔离标签只路由端口，不提供租户授权。

inspectPluginTree 只返回已创建行的真实句柄快照，保留失败和已撤除行；伪造句柄拒绝。
它只能供受信进程内调试，不能作为安全打印入口。有限测试与机制模型不证明任意提供者遵守声明。

## 实现所采用的构件

npm 的 validate-npm-package-name 与 Babel 的 helper-validator-identifier 校验引用名称。
有限 JSON 捕获使用属性描述符检查，避免调用访问器；其他领域允许无损数字的 JSON 表示不适用此协议。
资源完成复用 assembly-lifecycle，Cordis 状态取自已验证的 kernel-basis 绑定，不另建关闭协调器。

六字段声明和固定 host 的动态贡献范围由[共享机制投影采用](../../../.meta_harness/design/record/decisions/identity-shared-mechanism-projection/decision.md)接续。行端口的 retainClose 仍交付原行控制；整体 closeControl 只归实际装配拥有者，行为归 assembly-lifecycle 的模块 SPEC。
