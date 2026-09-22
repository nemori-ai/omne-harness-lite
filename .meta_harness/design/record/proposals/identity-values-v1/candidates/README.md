# 三份竞标原件

[`A/`](A/contract.md)、[`B/`](B/contract.md)、[`C/`](C/contract.md) 是三位起草者**各自独立**
交出的完整候选包。它们的比较与择优在 [alternatives.md](../alternatives.md)，**本页不重复**。

**这些是原件，不是现行契约。**现行契约（已接受）是
[`spec/data/identity-values` v1](../../../../spec/data/identity-values/README.md)，
它是三份的**合并件**，与这里任何一份都不相同。
**不要照这里的条款号或措辞去实现或引用**——条款在合并时被重新编号过。

## 迁入时改了什么，没改什么

原件来自任务区 `tmp/tenant-domain-design/bids/identity-values-{A,B,C}/`。
迁入 `design/` 之后，**正文一个字也没有改**；改的只有两类东西，逐类写明：

1. **相对链接的前缀重定位。**原件的链接是相对 `tmp/tenant-domain-design/bids/<X>/` 写的，
   搬到这里之后全部指错。按位置机械重写了三种前缀，**目标文件一个没换**：
   - `../../../../.meta_harness/design/…` → `../../../../../…`
   - `../../../../.claude/skills/harness-design-handbook/references/…`
     → `../../../../../../agents/skills/harness-design-handbook/canonical/references/…`
     （宿主产物换成 [skills 的 canonical 源](../../../../../agents/README.md)，同一份文件）
   - 两处指向 `tmp/tenant-domain-design/` 内任务材料的链接（`E-brief.md`、`D-reconciliation.md`）
     **去掉链接、保留文字并注明未迁入**——那两份是任务区材料，不进设计链。
2. **`B/contract.md` 一处原本就断的自链接。**
   正文里那句「租户角色」原本是一个指向 `#s-7--tenantrole-恰有两个取值` 的自链接，
   而这个锚点**在原件里就不存在**
   （B 的 S-7 是加粗段落，不是标题）。改成不带链接的「租户角色（本节 S-7）」。
   **这是原件的缺陷，不是迁移造成的**，记在这里是为了让下一个人不去找那个锚点。

## 迁移前后的 SHA-256

**逐文件可核对。**左列是原件在任务区时的摘要，右列是本目录当前的摘要；
**两列相同的行表示该文件逐字节未动**。

| 文件 | 迁移前 | 迁移后 |
|---|---|---|
| `A/contract.md` | `463a907f74160c098a638262ea0ac6ed8a6fd77a0378637c9c6e3618396c2528` | `35b88d95d864360f77af6ba282397fcd6d811bf09c32291ce13c8a94d74d2289` |
| `A/examples.md` | `61d1490118f919a6165f4ac9d5861774db1f1e83e17e85ce55bb418e03f18c9a` | **同左（未动）** |
| `A/identity-values.schema.json` | `d2e865a447665f509d97c4d01157ace368e0f49f1f2c475dcb9b3643eba3cdbc` | **同左（未动）** |
| `A/notes.md` | `0988aa0d5bd53f492f00fef57da907460a85edf65ade22658bdb015943bdac12` | `51878c3df89edec67f720ecf502abf36fd119e150eecb2875b872526a0dd76bc` |
| `B/contract.md` | `cb4aa4842eac3c06cb7d980c5976a7f584209c1cef4fa06a449f88edc370a176` | `24d25c3e802da81b1c3fa864ac9be567d98f86ab862520b2e900a4bdc890d2ab` |
| `B/identity-values.schema.json` | `ca5a83f882a1accecacda3a1bf02f25dde274c6392843a5f107056c6487b77ea` | **同左（未动）** |
| `B/notes.md` | `3ce139c13d8f3fcb26138e330b87bbccd62dfe0e8b419897d6e7fb30e3780888` | `6833180f78aeb3863dafbf0db0472277237ced8d6ab9f824b461b757dbbf6f48` |
| `C/contract.md` | `d4582887033f5f18473382a0c8f06af7b4382a5f2b886d94106f123d32b98025` | `ea16ae4fc00d19a075e99cd4b18c3ca76a1e008ece628d904521adab4782f224` |
| `C/identity-values.schema.json` | `d98f48033aa1cbb85f8a5d8cf271bc74734147e0f6a01e9b0e43a080e6b56890` | **同左（未动）** |
| `C/notes.md` | `a58f06670be866a7b30924632211c219becabac52567f98c50fb74c2d60e0c06` | `a119e10dbe1bd566a2cee3d6df176bd3b63ee9a31ddc117f78f5a54f3468758c` |

**三份 Schema 都逐字节未动**（JSON 里没有相对链接）。变了摘要的六份全是 `.md`，
变化原因只有上一节那两类。

## 三份包里各有什么

| | `contract.md` | Schema | `notes.md` | `examples.md` |
|---|---|---|---|---|
| **A** | 380 行 | 136 行 | 221 行 | **158 行，三份里唯一一份** |
| **B** | 375 行 | 134 行 | 138 行 | — |
| **C** | 730 行 | 147 行 | 206 行 | — |

`notes.md` 是**起草笔记**：每个非显然选择的理由、对施工简报的异议、登记为缺口的东西。
**它不是契约，任何地方都不得引它作依据**——三份笔记自己也都在开头写了这一句。

返回[本 topic 入口](../README.md)。
