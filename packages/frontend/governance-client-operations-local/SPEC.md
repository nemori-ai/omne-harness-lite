# 本地治理客户端操作提供者

本包实现公共 governance-client-operations。纯工厂显式接收 state、transport 和原可选timeoutMs。
默认10000毫秒、范围1～120000保持；配置验证先于依赖工作。`./cordis` 单独拥有绑定。

本批迁入公共形状和集成承诺。精确业务源、采用依据和仍有效的模型义务见
[身份迁移保持清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
本页不替代尚未迁移的完整操作条款；N5/N6 接续剩余旧源及资源登记。

同一纯引擎供独立调用与正式Service使用。状态机、缓存、结算、预备输入和观察时间
保留原算法；不把提供者实现搬进公共定义，不保留旧根的公共类型或插件转发。

根动作和use在任何依赖/输入回调前登记完整Promise。单use在开始实际工作前占据busy位。
关闭Promise在取消回调前保存，防止同步重入close产生第二关闭过程。
原网络、远端事实、本地CAS与一次查证完成后才释放本代引用，不关闭借入依赖。
管理拒绝保留及关闭观察资源按公共承诺与已采用CLI生命周期实现；独立调用者仍直接观察原close。
