# tool-host-local 测试索引

- [测试范围与运行入口](README.md)。
- [根入口与导入方向测试](public-entry.spec.ts)。
- [未交付入口与依赖方向测试](entry-boundary.spec.ts)。
- [本地启动协调器测试](start-coordinator.spec.ts)。
- [租户串行与慢存储交错](start-tenant-isolation.spec.ts)。
- [实际环境入口的调度测试](environment-scheduling.spec.ts)。
- [凭据绑定与分层选择测试](credentials.spec.ts)。
- [协调器与 Tool runtime 的组合测试](start-composition.spec.ts)。
- [协调器对启动围栏套件的一致性测试](start-authority-conformance.spec.ts)。
- [宿主时钟的契约一致性](clock-conformance.spec.ts)、[时钟规则](clock.spec.ts)与[手动时间源](clock-values.ts)。
- [登记表的契约一致性与登记规则](bindings-conformance.spec.ts)。
- [Catalog 测试](catalog.spec.ts)。
- [缺席端口测试](absent-ports.spec.ts)。
- [部件对 createToolRuntime 的组合测试](runtime-composition.spec.ts)。
- [登记表与 Catalog 的测试构造器](binding-values.ts)。
- [测试构造器](coordinator-values.ts)。
- [导入图遍历工具](module-graph.ts)。
- [测试夹具](fixtures/index.md)。
- [包索引](../index.md)。

- [预占返还与诊断边界](environment-boundaries.spec.ts)及其[夹具](environment-boundary-fixture.ts)。
