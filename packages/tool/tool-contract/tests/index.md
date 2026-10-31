# Tool 测试索引

- [测试范围与运行入口](README.md)。
- [根入口导出与导入方向测试](public-entry.spec.ts)。
- [品牌身份解码测试](identity.spec.ts)。
- [默认结果政策测试](result-policy.spec.ts)。
- [资产正文端口测试](contract.spec.ts)。
- [资产正文 programmable 测试](body-programmable.spec.ts)。
- [定义判定测试](definition-judgment.spec.ts)。
- [json-text 树检查的字段名测试](json-tree-judgment.spec.ts)。
- [固定请求判定测试](request-judgment.spec.ts)。
- [交付解除输入判定测试](release-judgment.spec.ts)。
- [状态判定测试](state-judgment.spec.ts)。
- [呈现与可用性测试](catalog.spec.ts)。
- [作者注册与等待契约测试](author-registration.spec.ts)。
- [定义派生、同形判据与采用点判定表的表驱动测试](dynamics.spec.ts)。
- [默认参数 codec 测试](parameter-codec.spec.ts)。
- [结果渲染与结构化判定测试](result-rendering.spec.ts)。
- [结果投影测试](result-projection.spec.ts)。
- [启动围栏套件自证](start-authority-conformance.spec.ts)。
- [环境套件自证](environment-conformance.spec.ts)。
- [外层调用方的启动围栏套件自证](start-fence-conformance.spec.ts)。
- [授权消费点套件自证与授权替身的受理记录](start-authorization-conformance.spec.ts)。
- [结果接收端口套件自证](result-receiver-conformance.spec.ts)。
- [结果推送的纯关系判定测试](result-delivery.spec.ts)。
- [结果推送、启动围栏视图与受理记录的编译用例](result-delivery.spec-d.ts)。
- 三个新套件的合法提供者：[启动围栏](start-fence-legal.ts)、[授权消费点](start-authorization-legal.ts)、[结果接收端口](result-receiver-legal.ts)。
- [执行者绑定套件自证](executor-binding-conformance.spec.ts)。
- [输出保管套件自证](output-custody-conformance.spec.ts)。
- [时钟套件自证](clock-conformance.spec.ts)。
- [决策桥套件自证](decision-bridge-conformance.spec.ts)。
- [资源应答套件自证](resource-responses-conformance.spec.ts)。
- [决策桥与资源应答共有用例的违约变体](external-association-variants.ts)。
- [自证运行器](conformance-harness.ts)。
- [合法值构造器](tool-values.ts)。
- [公开类型名导入测试](public-api-names.spec-d.ts)。
- [已替换名称的源码核对测试](removed-names.spec.ts)。
- [公开类型负编译测试](contract.spec-d.ts)。
- [导入图遍历工具](module-graph.ts)。
- [测试夹具](fixtures/index.md)。
- [包索引](../index.md)。

- [调用与操作引用 codec 测试](reference.spec.ts)。
- [测试租户构造器的合法编码与非法输入](testing-tenant.spec.ts)。

- [后台块 schema 与纯投影](background-calls.spec.ts)。
- [公开 RC 协议消费与撤除边界](background-calls-rc.spec.ts)，使用非耐久替身。
- [后台块测试原事实](background-calls-fixture.ts)，不作为生产来源。

- [后台块公开类型消费](background-calls.spec-d.ts)，核对 RC ContextBlocks 与 ProducerRegistration。

- [首次采用一致性与非耐久替身](environment-allocation.spec.ts)。

- [凭据一致性套件的独立违约自证](credentials-conformance.spec.ts)。
