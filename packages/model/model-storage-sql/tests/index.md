# tests 索引

本文件列出本目录的用例。用例在 `node:sqlite` 内存库上运行真实的参加者、迁移与读 handler 模块，`*.spec.ts` 中后五个经共享核心运行 `ModelCommands`。它们不覆盖提供者的 Worker、耐久性、队列与关闭。

## 内容

| 文件                                       | 内容                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [schema.spec.ts](schema.spec.ts)           | 迁移建出的表、列、STRICT 与以 tenant 开头的主键                                                                                            |
| [documents.spec.ts](documents.spec.ts)     | 行解析：每一列都读到，分片折叠回块，拒绝缺列、多列、他租户行与乱序                                                                         |
| [commit.spec.ts](commit.spec.ts)           | 按共享核心的用法驱动存储端口：构造期核对、CAS 冲突重读、参加者拒绝超前版本、认回、未定登记、份额、租户条件、待决标记、读关系进度与分片上界 |
| [fixture.ts](fixture.ts)                   | 共用夹具：`node:sqlite` 测试提供者（可注入回包丢失、提交前并发写、受理前拒绝、结论未定），核心选项，以及 SQL commands 的构造               |
| [accounts.spec.ts](accounts.spec.ts)       | M4-2：`checkCommandsAccounts` 对内存实现与 SQL 实现各跑一次并逐项对拍，打印两份原始报告                                                    |
| [admission.spec.ts](admission.spec.ts)     | M4-3：受理的资格结果、守卫声明、调用与容量同一次提交成立，提交失败时都不存在；N1 在提交处拒绝                                              |
| [tenant.spec.ts](tenant.spec.ts)           | M4-4：两个租户共用一个事务域，经 commands 的他租户调用与不存在相同；写路径不碰他租户的同名调用                                             |
| [unknown.spec.ts](unknown.spec.ts)         | M4-5：回包丢失后同 operation 重试认回、不重复写；未定 operation 进入待恢复扫描；按租户的登记上限；commit 须在 scope 的 operation 内        |
| [combination.spec.ts](combination.spec.ts) | M4-6 早期守卫：与 `sessionStorageMaterials()` 组成有效组合，构造期核对两方的 `codeDigest`                                                  |

## 运行

在本包目录运行 `NO_COLOR=1 pnpm exec vitest run --mode fast`。用例经包名导入 `dist`，改源码后先构建本包。
