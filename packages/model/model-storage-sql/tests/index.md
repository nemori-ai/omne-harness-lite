# tests 索引

本文件列出本目录的用例。用例在 `node:sqlite` 内存库上运行真实的参加者、迁移与读 handler 模块。它们不覆盖提供者的 Worker、耐久性、队列与关闭。

## 内容

| 文件                                   | 内容                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| [schema.spec.ts](schema.spec.ts)       | 迁移建出的表、列、STRICT 与以 tenant 开头的主键                                        |
| [documents.spec.ts](documents.spec.ts) | 行解析：每一列都读到，拒绝缺列、多列、他租户行与乱序                                   |
| [commit.spec.ts](commit.spec.ts)       | 构造期核对、CAS 冲突重读、参加者拒绝超前版本、认回、份额、租户条件、待决标记与分片上界 |

## 运行

在本包目录运行 `NO_COLOR=1 pnpm exec vitest run --mode fast`。用例经包名导入 `dist`，改源码后先构建本包。
