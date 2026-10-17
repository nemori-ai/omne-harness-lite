# 图像预算推荐配置

状态：已接受。PanQiWei 于 2026-10-17 [接受](https://github.com/nemori-ai/omne-harness-lite/issues/277#issuecomment-6229705700) `model-input-balanced` 的格式列表和五个数值。接受范围是准备模型图片输入前的独立图像准入，由调用方显式传入。接受不扩大 Node 26 范围，也不授予任何平台、容器内存上限或原生终止保证。本成员仍不保存默认整数。行为条件在 [SPEC](../SPEC.md)。

## 名称与用途

推荐配置名为 `model-input-balanced`。它用于准备模型图片输入之前的独立图像校验：调用方拿到一份完整的 PNG、JPEG 或 WebP 缓冲，先在本成员打开，再编码或保存。

本配置没有真实业务负载作依据。下文的观测使用确定性生成的合成图像。它不代表全部未来消费者。保存附件或其他用途的调用方按自己的输入分布另选数值。

## 取值方法

PanQiWei 在 [#277 的取值授权](https://github.com/nemori-ai/omne-harness-lite/issues/277#issuecomment-6227912031)中定下以下取值顺序：

1. 先用 legacy 图像部分已调研并采用的默认值。
2. legacy 没有的维度，参考开源 harness 与业界通行做法。

六个维度都在 legacy 的模型图片准备策略 `modelImageBalancedV1` 中找到了对应值。该策略见 [preset.ts](https://github.com/nemori-ai/omne-harness-lite/blob/13bdf90ca2edcfcecc638f159f6867a6c7f2188d/packages.0.0.1.legacy/model/pi-ai-transport/src/image-preparation/preset.ts)。它的注释写明这些值是本地策略，不是上游限制。本成员只读取这些数值作来源，不运行、不导入、不依赖 legacy 代码。

## 六个维度

| 维度 | 值 | legacy 来源 | 换算与含义 |
| --- | --- | --- | --- |
| `formats` | `image/png`、`image/jpeg`、`image/webp` | `outputFormats`，以及 Files 打开的 [`imageTypes`](https://github.com/nemori-ai/omne-harness-lite/blob/13bdf90ca2edcfcecc638f159f6867a6c7f2188d/packages.0.0.1.legacy/tools/meta-files/src/open.ts#L48) | 与本成员契约的三种格式相同 |
| `maxWidth` | `8192` | `decodedMaxDimension: 8192` | legacy 在解码前用它拒绝过宽的输入 |
| `maxHeight` | `8192` | `decodedMaxDimension: 8192` | 同上，作用于高 |
| `maxDecodedBytes` | `64000000` | `decodedMaxPixels: 16_000_000` | 本成员按每像素 4 字节（RGBA）记解码字节。16,000,000 像素 × 4 = 64,000,000 字节 |
| `maxConcurrentDecodes` | `2` | `maxConcurrent: 2` | 本成员把持有中的打开句柄也算作占用，不只算正在运行的解码 |
| `maxInFlightBytes` | `268435456` | `maxInFlightBytes: 256 * 1024 * 1024` | 256 MiB |

legacy 策略中还有两项本配置不采用：

- `maxWidth: 2048` 与 `maxHeight: 2048` 是编码输出的外框，不是解码准入上限。本成员不缩放图像。
- `sourceMaxBytes: 16 * 1024 * 1024` 限制源字节数。本成员没有这个维度。需要源字节上限的调用方在调用 `open` 之前自己检查。

### 维度之间的关系

单张图像最多预留 64,000,000 字节。两份持有中的句柄最多预留 128,000,000 字节。这个值小于 `maxInFlightBytes`。因此在本配置下，并发上限先于在途字节上限起作用。`maxInFlightBytes` 只在调用方把 `maxConcurrentDecodes` 调高到 5 或更多时才会先拒绝。观测中的变体场景验证了这一点。

legacy 的在途字节除了解码光栅，还计入源字节和编码候选。本成员只计光栅预留。同一数值在本成员中因此更宽松。

宽高上限与像素上限同时生效。8192×1953 和 1953×8192 都可以打开。按同一规则，8192×8192 不超过宽高上限，但超过像素上限，会以 `decoded-bytes` 拒绝。观测没有单独运行 8192×8192。

## 与业界做法的对照

以下来源只作对照，不改变上表的值。三个本地安装程序的读数来自 2026-10-17 对安装文件的字符串和明文 JS 检查，不是可从远端复跑的证据。

| 来源 | 相关值 |
| --- | --- |
| [Anthropic 视觉文档](https://platform.claude.com/docs/en/build-with-claude/vision) | JPEG、PNG、GIF、WebP。单图最大 8000×8000 px。一次请求超过 20 张图时，每边不超过 2000 px。超过长边限制的图像先缩小再处理 |
| [OpenAI 视觉文档](https://developers.openai.com/api/docs/guides/images-vision) | PNG、JPEG、WebP 和非动画 GIF。多个模型的 `high` 细节档位把图像放进 2048×2048 以内，具体规则按模型不同 |
| [pi `image-resize-core.ts`](https://github.com/badlogic/pi-mono/blob/b30a6dd779340f7bc2f3ffa60f4c0a5f914ba9ae/packages/coding-agent/src/utils/image-resize-core.ts) | 默认缩放外框 2000×2000，base64 后不超过 4.5 MiB |
| [opencode 附件文档](https://opencode.ai/v2/docs/attachments/) | 默认 `max_width` 与 `max_height` 为 2000，`max_base64_bytes` 为 5,242,880 |
| Claude Code 2.1.302 安装文件 | PNG、JPEG、GIF、WebP。解码像素上限 8000×8000 = 64,000,000 像素。编码并发 4。这两项可能只在部分宿主模式下生效，生效条件没有确认 |
| Kimi Code 安装文件（2026-10-16 构建） | 长边 2000，可配置。解码字节保护 64 MiB，像素上限 100,000,000。没有找到解码并发上限 |
| Cursor agent 2026.10.01-e373342 安装文件 | JPEG、PNG、GIF、WebP。缩放外框 2048×2048。所选图像一起处理，没有并发上限 |
| [sharp 构造参数](https://sharp.pixelplumbing.com/api-constructor) | `limitInputPixels` 默认 268,402,689（16383×16383）。本成员不用这个默认值，见下一节 |

Kimi Code 的 64 MiB 解码保护与本配置的单图 64,000,000 字节接近。Claude Code 的上限按像素数计，换算成 RGBA 字节是 256,000,000，是本配置的 4 倍。只有 Claude Code 给出了并发值。这些来源都没有给出在途字节的默认值。Codex、DSH 和 LangChain 没有提供可对照的数值。本配置的 8192 宽高上限高于各家缩放外框，因为本成员的职责是准入与校验，缩放不在本成员。

## 原生库设置

本成员在每次解码时设置 `failOn: 'warning'`，并把 `limitInputPixels` 设成定向后宽高的乘积，见 [adapter.ts](../src/adapter.ts)。因此 sharp 默认的 268,402,689 像素上限在本成员里不生效。本成员不调用 `sharp.concurrency()` 或 `sharp.cache()`。下表是观测机器上读出的实际值。

| 设置 | 观测值 | 说明 |
| --- | --- | --- |
| `sharp.concurrency()` | `1` | glibc Linux 且没有 jemalloc 时，sharp 默认每图 1 个线程 |
| `sharp.cache()` | 内存 50 MB，文件 20，条目 100 | sharp 默认值 |
| `UV_THREADPOOL_SIZE` | 未设置 | libuv 默认 4 个线程 |

调用方改动这些设置时，下文的观测不再适用。

## 观测

观测脚本是 [verification/budget-profile-smoke.mjs](../verification/budget-profile-smoke.mjs)。它从包名 `@omne-harness/image` 导入构建后的公开入口，用 sharp 确定性生成合成图像，并逐个场景核对结果、声明、`verifiedBytes`、编码输出和预留。打开成功时，脚本核对声明的宽高、媒体类型和 `trusted: false`，并核对 `verifiedBytes` 与输入字节相同、但不是输入对象本身。编码成功时，脚本核对媒体类型、`orientation` 与 `exif` 为 `absent`，并用 sharp 重新读取输出，核对格式和宽高，确认输出中没有方向和 EXIF。任一场景的结果或预留与预期不符、场景抛出异常或超过 120 秒、或场景之外出现异常时，脚本退出码为 1，并仍然输出 JSON。输出 JSON 记录被导入的入口文件及其修改时间，用来发现没有重新构建的情况。目录入口见 [verification/README.md](../verification/README.md)。

多数夹具是纯色图。持有与编码场景使用固定种子生成的噪声图。噪声图压缩率很低，因此它的源字节和编码输出比照片更大。

### 环境

| 项目 | 值 |
| --- | --- |
| 成员源码 | `src/` 与 `13bdf90ca2edcfcecc638f159f6867a6c7f2188d` 相同 |
| 观测脚本 | 读数来自提交 `3fb18d1dfbb4e0e14309efc0846bba0aa4c740c1` 中的版本。之后只修改了场景超时计时器，场景与读数口径不变 |
| 机器 | Linux 5.15.0-1084-aws x86_64，Intel Xeon Platinum 8175M，8 个逻辑 CPU |
| 内存 | 31,292 MiB，cgroup 无内存上限 |
| 运行时 | Node v26.12.0，glibc 2.31 |
| 原生库 | sharp 0.35.3，libvips 8.18.3 |
| 负载 | 观测时机器 load average 约 1.6–1.9，有其他进程运行 |

Darwin 和其他 Linux 发行版没有用本配置运行。[SPEC 验证节](../SPEC.md#验证)记录的 Darwin 25.5.0 arm64 运行不覆盖本配置。

### 预算记账

下面的结果在三次运行中相同。

| 场景 | 结果 | `heldReservation()` |
| --- | --- | --- |
| PNG 1920×1080 打开、编码 JPEG、关闭 | 声明 1920×1080，输出是 1920×1080 的 JPEG | 关闭后 0 份 |
| JPEG 2048×1536、WebP 2048×1536 | 打开，声明 2048×1536 | 关闭后 0 份 |
| GIF 64×64 | `not-image` | 0 份 |
| PNG 8192×1953 与 1953×8192（各 15,998,976 像素） | 打开，声明与输入宽高相同 | 关闭后 0 份 |
| PNG 4001×4000（16,004,000 像素） | `decoded-bytes` | 0 份 |
| PNG 8193×64 / 64×8193 | `width` / `height` | 0 份 |
| 持有两份噪声 PNG 4000×4000 | 两次都打开 | 2 份，128,000,000 字节 |
| 两份持有时再打开 PNG 1920×1080 | `concurrent` | 2 份，128,000,000 字节 |
| 在持有的句柄上依次编码 PNG、JPEG、WebP | 输出格式、媒体类型与 4000×4000 宽高都正确。每次编码开始 10 ms 后读取预留，并再打开一次。三次运行中，读取时三次编码都还没有完成 | 编码进行中与结束后都是 2 份，128,000,000 字节。编码进行中的打开都是 `concurrent` |
| 关闭两份持有的句柄 | 两次都关闭 | 0 份，0 字节 |
| 持有一份时再打开一份噪声图，调用方 1 ms 后停止等待 | 计时器先完成。停止等待后再打开第三份，结果为 `concurrent`。原 Promise 之后返回打开 | 停止等待时 2 份，结果返回后 2 份，关闭两份后 0 份 |
| 变体：`formats` 去掉 webp，打开 WebP | `format` | 0 份 |
| 变体：`maxConcurrentDecodes` 改为 5，连续打开五份 4000×4000 | 前四份打开，第五份 `in-flight-bytes` | 4 份，256,000,000 字节 |
| 变体：关闭上一行的四份句柄 | 四次都关闭 | 0 份，0 字节 |

脚本没有覆盖以下行为。单元测试覆盖其中一部分，见 [SPEC 验证节](../SPEC.md#验证)：

- 编码进行中关闭返回 `still-open`。
- 在途字节正好等于上限时的边界。
- 编码输出的像素内容。

GIF 在容器检查阶段被识别为非图像，没有走到格式允许列表。这是现有实现与单元测试的行为。SPEC 没有规定 png、jpeg、webp 以外的已知图像格式归哪个拒绝原因。

每份噪声图句柄的 `verifiedBytes` 是 54,814,493 字节，与输入相同，但不是输入对象本身。这份副本在打开结果上，不在句柄上，也不计入预算预留。脚本只保存句柄，核对完副本后不再引用它，所以副本在下一个场景开始前就可以被回收。保存字节的调用方如果在句柄打开期间一直引用 `verifiedBytes`，进程会多持有这份副本。

### 进程内存

脚本每 5 ms 读一次 `process.memoryUsage().rss`。它只覆盖本 Node 进程，包括 sharp 和 libvips 在本进程内的原生分配。每个场景开始前调用一次 `gc()`，然后读一次 RSS 作为该场景的起点。下表的“峰值”是场景起点、采样值和场景结束时读数中的最大值。“关闭后”取关闭场景之后下一个场景的起点。

| 读数 | 第 1 次 | 第 2 次 | 第 3 次 |
| --- | --- | --- | --- |
| 首个场景起点（夹具已生成） | 276.9 MiB | 270.8 MiB | 270.8 MiB |
| 持有两份噪声图，峰值 | 458.7 MiB | 457.5 MiB | 459.0 MiB |
| 编码场景起点 | 406.6 MiB | 405.2 MiB | 406.7 MiB |
| 两份持有时依次编码，峰值 | 837.8 MiB | 777.0 MiB | 825.7 MiB |
| 关闭两份句柄后 | 562.7 MiB | 521.4 MiB | 530.2 MiB |
| 变体：持有四份 4000×4000，峰值 | 633.4 MiB | 644.0 MiB | 652.5 MiB |

编码的三个输出分别是 PNG 54,814,493 字节、JPEG 10,152,045 字节、WebP 10,964,756 字节。脚本核对完每个输出后只保留它的字节数，不保留输出本身。因此后一次编码开始时，前一次的输出已经可以被回收。读数对应的负载是：两份解码句柄一直打开，`verifiedBytes` 副本和编码输出在核对后都不长期保留。

限制如下：

- 只运行了三次，没有单独预热。编码峰值在三次运行之间相差约 61 MiB。
- 5 ms 采样依赖事件循环，可能漏掉更短的峰值。
- 峰值里叠加了前面场景已释放、但分配器还没有交还操作系统的内存，以及 sharp 缓存。读数不能全部归到当前场景。
- 关闭后 RSS 没有回到起点，但预算已归零。这说明分配器没有立即把内存交还给操作系统，不说明句柄没有关闭。预算归零也不证明全部原生分配已经归还。
- 这些读数不是 RSS 上限保证，也不是吞吐数据。

余量参考：两份满额句柄加依次编码时，RSS 峰值比编码场景起点高 371.8–431.2 MiB，比首个场景起点高 506.2–560.9 MiB。同时的预算预留是 128,000,000 字节，约 122 MiB。这些读数不包含长期持有 `verifiedBytes` 副本或多份编码输出的情况。调用方如果长期持有它们，进程内存会更高，这些读数不能证明那种负载的余量。调用方的进程或容器上限要在预算预留之外，为自己持有的副本与输出、编码临时分配和运行时本身留出余量。本页没有选定进程或容器内存上限。

### 复跑

在仓库根目录，用 Node 26 执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter "@omne-harness/image..." run build
node --expose-gc packages/execution/image/verification/budget-profile-smoke.mjs
```

脚本向标准输出写一份 JSON，含环境、被导入的入口、配置、各场景结果与 RSS 读数，以及 `mismatches` 列表。退出码 0 表示全部场景符合预期。

## 状态记录

- 观测已完成：2026-10-17，环境如上。
- 接受：2026-10-17，PanQiWei，[具名技术接受](https://github.com/nemori-ai/omne-harness-lite/issues/277#issuecomment-6229705700)。接受的对象是本配置的取值，不是本页的测量报告。
