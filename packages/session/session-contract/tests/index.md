# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身
- [public-entry.spec.ts](public-entry.spec.ts)：两个入口的导出集合
- [decide-reduce.spec.ts](decide-reduce.spec.ts)：首条路径的判定与归约
- [transactions-conformance.spec.ts](transactions-conformance.spec.ts)：事务端口套件的自证与违例变体
- [dependency-direction.spec.ts](dependency-direction.spec.ts)：构建产物的依赖方向
- [conformance-harness.ts](conformance-harness.ts)：套件自证的运行器
- [module-graph.ts](module-graph.ts)：构建产物的导入图遍历
- [fixtures/](fixtures/index.md)：测试固定输入，现在为空

- [extended-behavior.spec.ts](extended-behavior.spec.ts)：冻结、执行历史、结果与作用域
- [management-behavior.spec.ts](management-behavior.spec.ts)：管理命令、生产者事实与压缩
- [providers-conformance.spec.ts](providers-conformance.spec.ts)：提供者套件自证
- [scene.ts](scene.ts)：测试中的会话操作辅助

- [result-integrity.spec.ts](result-integrity.spec.ts)：原执行与位置、结果依据不变、迟到保管、后继隔离及归档提醒。
