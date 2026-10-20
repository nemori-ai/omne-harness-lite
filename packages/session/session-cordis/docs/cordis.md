# Session 的具体 Cordis 装配

本包是具体提供者草稿，尚无插件实现。唯一 Service、键、增补、事件及登记协议消费 [Cordis 定义](../../session-cordis-contract/docs/cordis.md)，不得复制或重声明。以下接续既有候选的装配责任，未授予技术接受。

## 注入、配置与生命周期

Session 没有每会话根Context或实例目录。长期服务与恢复协调者服务全部显式tenant/session操作。门面权威读依赖transactions；身份和证据准备按命令在子fiber取得，核心读与已有控制核对不因无关资产源撤除全站停机。纯工厂依然得到完整identity/evidence/clock/idle/context接口，局部缺失映射为相应命令失败，不把必要guard当可选。notifier.current在调用点解析当前sessionNotifier。

每个实际插件的inject使用定义键常量数组字面量。局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

maximumPageBytes、maximumPendingPage 为正整数，reconciliationDelayMs 为非负整数。分页容量不改变逻辑输入批界；会话模式、工作区、自动归档政策属于具名管理操作及原事实，不是Cordis配置层。

Session的控制先经原子操作形成逻辑事实及传播责任，再由当前恢复协调者联系Model/Tool。不能用事件监听调用成功代替共同提交，不能把所有领域对象作为Session子插件。

Session 不登记运行实例。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 验证义务

实现时验证静态 inject、局部依赖撤除、旧引用拒绝和先业务交接后 dispose。模板入口测试只验证未实现状态，不证明这些性质。
