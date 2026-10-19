# tests 索引

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：根入口导出清单
- [cordis-entry.spec.ts](cordis-entry.spec.ts)：插件发布、空路径建库、撤除、配置校验与损坏文件上的不可用服务
- [credential.spec.ts](credential.spec.ts)：保管库与注入发送的行为，含发布路径关闭文件描述符
- [custodian-options.spec.ts](custodian-options.spec.ts)：建库采用、诊断容量、锁等待与 `ELOCKED`、不可用原因、快照字段类型与选项取值
- [deliver-injected.spec.ts](deliver-injected.spec.ts)：注入发送的模块边界，以及提供者缺席、恢复、重装后结果不变、更替与非服务对象
- [credential-service.spec.ts](credential-service.spec.ts)：服务实例经真实 Cordis 代理的暴露面
- [fixtures/](fixtures/index.md)：测试固定输入
