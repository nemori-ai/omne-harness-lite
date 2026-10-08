# @omne-harness-lite/session-runtime-local

[English](README.md)

本包提供Session操作的本机持久准入。根入口独立于Cordis；Session业务承诺由[公开定义](../../core/session-runtime/SPEC.md)拥有，提供者顺序及资源规则见[SPEC](SPEC.md)。

## 使用

在共享根库组合admissionMigrations，在每租户实际运行库组合admissionUseMigrations，然后以根Storage、可信治理核验端口及显式容量策略调用createLocalAdmission。调用者保管借入依赖。

先持久登记原目标，再只执行active核验；ready的原ticket在实际租户单元消费。使用与原业务回执共同提交，unknown沿原记录认回。ticket只定位记录；guard只在原回调中有效。

登录拒绝与成员拒绝作用域不同。新登录不能抹除未结算成员观察；原Run的连续性另沿持久grant及当前执行栅栏。

## 同单元状态

在租户运行库组合sessionStateMigrations。可信协调者以当前资格、显式容量策略和原工作结算读取端口构造createLocalSessionState。参加者使用调用者的实际StorageUnit；协调者须把日志事实及回执放入同单元。暂存结果不能证明公共受理或消费已成功。

参加者保留待处理位置直至采用，拒绝终态Run身份复用和复制／回滚permit。收尾要求无待处理输入且原工作已结算。完整Session操作和执行恢复仍在施工。

## 同单元回执

在租户运行库组合operationReceiptMigrations，以固定租户、可信当前授权和实际日志参加者构造createLocalOperationReceipts。完整OperationRef定位原回执，创建认回不要求预先知道Session。相同语义保留原快照，异语义拒绝。新回执核本单元日志坐标；协调者负责配对实际业务事实、状态及待处理资格，再统一提交。

## 创建和受理入口

根入口导出createLocalSessionIngress及sessionRuntimeMigrations。可信宿主固定原中心／来源／租户，并借入G28、实际日志及SessionBootstrap。创建先持久固定唯一身份，再在事务外初始化原Context，最后同提交发布事实、空状态和原回执。受理将原消息、事实、pending和回执共同提交；失败不留下半批，重放不重复追加。

operations提供创建、输入及只读查询。可信lifecycle分面另接新Run、首次attempt、输入承接和收尾；原grant、日志／状态／pending与StepReceipt共同提交。新Run验证登录，原Run沿持久授权继续。重放返回原回执，不重新签发permit。完整调用协调、恢复接管、取消／归档、真实资产与B2装配仍由各自施工和验收承担，不能从这个子集推定已经完成。

## 开发

按[开发指南](../../../docs/development.md)准备本树环境并先构建依赖。

```sh
pnpm --filter @omne-harness-lite/session-runtime-local build
pnpm --filter @omne-harness-lite/session-runtime-local typecheck
pnpm --filter @omne-harness-lite/session-runtime-local test
```

测试使用真实SQLite及真实进程崩溃，不替代完整CLI、OpenRouter、工具或宿主恢复验收。Cordis绑定仍在施工，尚未写模板采用标识。

可信tenancy读面从实际持久预留读取固定Session归属，不使用开发seed。./cordis导出createLocalSessionContext，建立独立Context及显式共享桥。应用以runtimeContext参数提供尚未挂载的新Runtime Context提供者，构造器使用其原plugin、ready、initializer及closeAdmission，不选择具体实现。私有initializer只接原Session，停止等待实际工作及日志borrow释放；释放失败保留责任，可重试原close。正式宿主仍须取得实际合法配方及seed，再确认初始化后发布Session。
