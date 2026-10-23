# Runtime Context Cordis 定义测试

## 运行

先构建契约，再通过全局测试名额执行：

```sh
./scripts/with-test-slot.sh pnpm turbo run build typecheck test --filter=@omne-harness/runtime-context-cordis-contract
```

## 覆盖与限制

真实 Cordis 4.0.4 测试验证服务装载与撤除、调用方 effect 归属、显式清理、旧代晚撤除、intercept 配置与祖先继承、按扩展 ctx 过滤事件、监听随 fiber 撤除，以及 set 不通知服务消费者。资格一致性测试使用已经签发的资格。

`support.ts` 是测试提供者，委托纯契约的非耐久替身，不是产品 Service 实现。测试不证明真实提供者的持久恢复、来源取消或在途读取结算。basis 的共同登记是另一项责任。

清单测试复用共享 CLI，检查根入口类型重导出的符号身份、cordis 导出、Context/Events 增补和公开页导航。根入口运行导出必须为空；源码、构建声明和实际产物均不导入实现成员。
