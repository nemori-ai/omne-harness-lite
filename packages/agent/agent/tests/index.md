# tests 索引

本文件列出本目录的文件、子目录与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：测试范围、真实依赖与替身、测试的组织
- [public-entry.spec.ts](public-entry.spec.ts)：入口导出名、导入图、清单依赖与 Cordis 路径
- [assembly.spec.ts](assembly.spec.ts)：测试装配的 17 项依赖，以及它交给工厂得到 idle 的 provider（C1）
- [factory.spec.ts](factory.spec.ts)：工厂的四种创建失败与成功的 idle（C1）
- [provider-access.spec.ts](provider-access.spec.ts)：四个面每个公开操作的租户核对与 `access.check`（C2）
- [factory-support.ts](factory-support.ts)：工厂测试共用的选项、调用记录与登记句柄替身
- [fixtures.spec.ts](fixtures.spec.ts)：每个替身的编排接口
- [memory-journal.spec.ts](memory-journal.spec.ts)：内存 Journal 的同形清单第 1 至 15 条与三项临时做法
- [journal-support.ts](journal-support.ts)：测试共用的契约值与步骤
- [module-graph.ts](module-graph.ts)：导入图遍历
- [fixtures/](fixtures/index.md)：测试固定输入
