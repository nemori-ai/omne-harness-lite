# 受理时比对所见的模型

规则归包组规格的[解析](../../SPEC.md#解析受理的解析一步)与[不变式](../../SPEC.md#不变式) C-I6、C-I7。模型在 `models/`，每份配置的预期登记在 [models.json](models.json)，由 [check.py](check.py) 判读，命令是成员目录下的 `pnpm run verify:formal`（要 `TLA2TOOLS_JAR`）。

有限检查是模型检查，不是归纳证明，也不是源码符合性。小世界：一个会话、一个发送方、两份 Skill。发送方打字的同时，清单（发布、禁用、移除）与读取权（授予、收回）都在变；客户端随时可能重读清单，也可能没读。

| 性质 | 规格规则 | 实现 | 用例 |
| --- | --- | --- | --- |
| `AsShown`：受理的含义等于发送方看到的含义 | C-I6 | `src/view.ts` 的 `judge` 比对所见 | `tests/judge.spec.ts`；`tests/properties.spec.ts` 的 `changedIsRefused` |
| `NoRevoked`：受理时绑不上已经收回或拿掉的项 | C-I7 | `src/recognize.ts` 按当下的清单认 | `tests/properties.spec.ts` 的 `removedNeverBinds` |

| 配置 | 规则 | 预期 |
| --- | --- | --- |
| `intake-compare` | 受理侧比对所见 | 跑完没有错误 |
| `intake-bad-no-compare` | 负控：受理侧不比对 | `AsShown` 被打破 |
