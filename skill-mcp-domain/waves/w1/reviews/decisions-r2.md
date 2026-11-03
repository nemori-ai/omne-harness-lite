# W1 第 2 轮裁定（草稿）

## Skill 第 2 轮交回（c3d693b48）写者自定事项

| # | 自定 | 裁定 |
| --- | --- | --- |
| 1 | `sealSnapshot` 新增缺陷 `invalid-root-name`，返回不抛 | 接受：TypeError 只给调用方编程错误 |
| 2 | 控制字节缺少或多出也答 `version-changed` | 接受 |
| 3 | `..` 段一律 `malformed`，只有绝对路径入口判 `outside-package` | 接受本轮；波末写回组页时把 `outside-package` 的含义写成「入口不是包内相对路径（绝对路径）或解析后落在包根之外」 |
| 4 | PS7（按定位存放的来源）与 PR4（无资产版本）答 `NotApplicable` | 接受 |
| 5 | 导入遍历用正则（TypeScript 7.0.2 没有 JS API） | 接受 |
| 6 | `unsupported` 只留 `no-readable-package` | 接受；reduce 作为组页拥有者确认，波末写回 |
| 7 | 「YAML 读不出时不判 name-mismatch」差异无裁定编号 | 补编号 C22′：接受该细化，波末写回组页 |
| 8 | `complete` 定义改为「实际范围终点不小于总长」 | 接受 |
| 9 | E8 优先于 decisions-r1 Skill #5 | 接受，decisions-r1 已改 |

待增量复审（代码、SPEC 表达）与 reduce 复跑结果。

## MCP 第 2 轮交回（a48f6bc09）写者自定事项

| # | 自定 | 裁定 |
| --- | --- | --- |
| 1 | 公开纯函数 `boundInstructions` | 接受：规则只有一处且可测 |
| 2 | 新类型名 `OperationFailure`、`ConnectionFailure`、`ConfigItem` | 接受 |
| 3 | `config-missing` 的项加 `credential` | 接受（C25 的要求本来就蕴含它） |
| 4 | `superseded` 覆盖写入冲突、`mergeListing` 答 stale、发布前换代三种；删 `newer-adoption` | 接受；E24 的措辞按此修正 |
| 5 | `inspect`/`release` 用 Extract 收窄失败联合 | 接受：两者不连接、不读配值 |
| 6 | spec-d 加正则，不用编译器 API（TS 7.0.2 无 JS API） | 接受 |
| 7 | 封闭集合的代码列表放测试里 | 接受 |
| 8 | `::1` 按 `URL.hostname` 的 `[::1]` 比较 | 接受 |
| 9 | `byName` 比较器「大于分支返回 0」的存活 | 判为等价：TimSort 只用 `compare < 0` 决定左右与归并取数，键唯一时返回 0 与返回正数不可区分。在比较器注释写明，不再追 |

待增量复审（代码、SPEC 表达）与 reduce 复跑结果。
