# tests 索引

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：根入口导出清单
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：插件发布、空路径建库、撤除、配置校验与损坏文件上的不可用服务
- [credential.spec.ts](credential.spec.ts)：保管库与注入发送的行为，含发布路径关闭文件描述符
- [custodian-options.spec.ts](custodian-options.spec.ts)：建库采用、诊断容量、锁等待与 `ELOCKED`、不可用原因、快照字段类型与选项取值
- [deliver-injected.spec.ts](deliver-injected.spec.ts)：注入发送的模块边界，以及提供者缺席、恢复、重装后结果不变、更替与非服务对象
- [credential-service.spec.ts](credential-service.spec.ts)：服务实例经真实 Cordis 代理的暴露面
- [send-resources.spec.ts](send-resources.spec.ts)：发送资源的凭据槽、物化传输归属、释放与关闭
- [assembly.spec.ts](assembly.spec.ts)：本地装配的配置拒绝与关闭
- [local-model.spec.ts](local-model.spec.ts)：慢层，经本地 HTTPS 服务驱动两个家族各一次调用，核对凭据、终止与账目
- [support/](support/)：测试支撑，读取家族录制夹具与起本地 HTTPS 服务
- [fixtures/](fixtures/index.md)：测试固定输入
