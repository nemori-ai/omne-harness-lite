# 图像预算推荐配置

状态：候选，尚未获接受。PanQiWei 接受之前，本页的数字不是已采用的生产配置。本成员仍不保存默认整数。调用方显式传入六个维度。行为条件在 [SPEC](../SPEC.md)。

## 名称与用途

推荐配置名为 `model-input-balanced`。它用于准备模型图片输入之前的独立图像校验：调用方拿到一份完整的 PNG、JPEG 或 WebP 缓冲，先在本成员打开，再编码或保存。

本配置没有真实业务负载作依据。下文的观测使用确定性生成的合成图像。它不代表全部未来消费者。保存附件或其他用途的调用方按自己的输入分布另选数值。

## 取值方法

PanQiWei 在 [#277 的接手评论](https://github.com/nemori-ai/omne-harness-lite/issues/277#issuecomment-6227912031)中授权以下取值顺序：

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

legacy 的 `maxWidth: 2048` 和 `maxHeight: 2048` 是编码输出的外框，不是解码准入上限。本配置不采用它们。本成员不缩放图像。

### 维度之间的关系

单张图像最多预留 64,000,000 字节。两份持有中的句柄最多预留 128,000,000 字节。这个值小于 `maxInFlightBytes`。因此在本配置下，并发上限先于在途字节上限起作用。`maxInFlightBytes` 只在调用方把 `maxConcurrentDecodes` 调高到 5 或更多时才会先拒绝。

legacy 的在途字节除了解码光栅，还计入源字节和编码候选。本成员只计光栅预留。同一数值在本成员中因此更宽松。

宽高上限与像素上限同时生效。8192×1953 可以打开。按同一规则，8192×8192 不超过宽高上限，但超过像素上限，会以 `decoded-bytes` 拒绝。观测没有单独运行 8192×8192。

## 与业界做法的对照

以下来源只作对照，不改变上表的值。

| 来源 | 相关值 |
| --- | --- |
| [Anthropic 视觉文档](https://platform.claude.com/docs/en/build-with-claude/vision) | JPEG、PNG、GIF、WebP。单图最大 8000×8000 px。一次请求超过 20 张图时，每边不超过 2000 px。超过长边限制的图像先缩小再处理 |
| [OpenAI 视觉文档](https://developers.openai.com/api/docs/guides/images-vision) | PNG、JPEG、WebP 和非动画 GIF。多个模型的 `high` 细节档位把图像放进 2048×2048 以内，具体规则按模型不同 |
| [pi `image-resize-core.ts`](https://github.com/badlogic/pi-mono/blob/b30a6dd779340f7bc2f3ffa60f4c0a5f914ba9ae/packages/coding-agent/src/utils/image-resize-core.ts) | 默认缩放外框 2000×2000，base64 后不超过 4.5 MiB |
| [opencode 附件文档](https://opencode.ai/v2/docs/attachments/) | 默认 `max_width` 与 `max_height` 为 2000，`max_base64_bytes` 为 5,242,880 |
| Claude Code 2.1.302（本机安装的单文件程序，按字符串取证） | PNG、JPEG、GIF、WebP。解码像素上限 8000×8000 = 64,000,000 像素。编码并发 4。这两项可能只在部分宿主模式下生效，取证没有确认其生效条件 |
| Kimi Code（本机安装，2026-10-16 版本，按明文 JS 取证） | 长边 2000，可配置。解码字节保护 64 MiB，像素上限 100,000,000。没有找到解码并发上限 |
| Cursor agent 2026.10.01-e373342（本机安装） | JPEG、PNG、GIF、WebP。缩放外框 2048×2048。所选图像一起处理，没有并发上限 |
| [sharp 构造参数](https://sharp.pixelplumbing.com/api-constructor) | `limitInputPixels` 默认 268,402,689（16383×16383） |

Kimi Code 的 64 MiB 解码保护与本配置的单图 64,000,000 字节接近。Claude Code 的上限按像素数计，换算成 RGBA 字节是 256,000,000，是本配置的 4 倍。只有 Claude Code 给出了并发值。这些来源都没有给出在途字节的默认值。Codex 的数值常量没有取到，DSH 在本机没有可读源码，LangChain 没有找到图像尺寸默认值。本配置的 8192 宽高上限高于各家缩放外框，因为本成员的职责是准入与校验，缩放属于模型请求一侧。

## 原生库设置

本成员不调用 `sharp.concurrency()` 或 `sharp.cache()`，使用 sharp 的默认值。下表是观测机器上读出的实际值。

| 设置 | 观测值 | 说明 |
| --- | --- | --- |
| `sharp.concurrency()` | `1` | glibc Linux 且没有 jemalloc 时，sharp 默认每图 1 个线程 |
| `sharp.cache()` | 内存 50 MB，文件 20，条目 100 | sharp 默认值 |
| `UV_THREADPOOL_SIZE` | 未设置 | libuv 默认 4 个线程 |

调用方改动这些设置时，下文的观测不再适用。

## 观测

观测脚本是 [verification/budget-profile-smoke.mjs](../verification/budget-profile-smoke.mjs)。它从包名 `@omne-harness/image` 导入构建后的公开入口，用 sharp 确定性生成纯色合成图像，并逐个场景核对结果。任一场景的结果或预留与预期不符时，脚本退出码为 1。

### 环境

| 项目 | 值 |
| --- | --- |
| 源码 | `13bdf90ca2edcfcecc638f159f6867a6c7f2188d` 加本页所在提交 |
| 机器 | Linux 5.15.0-1084-aws x86_64，Intel Xeon Platinum 8175M，8 个逻辑 CPU |
| 内存 | 31,292 MiB，cgroup 无内存上限 |
| 运行时 | Node v26.12.0，glibc 2.31 |
| 原生库 | sharp 0.35.3，libvips 8.18.3 |
| 负载 | 观测时机器 load average 约 1.6–1.9，有其他进程运行 |

Darwin 和其他 Linux 发行版没有用本配置运行。原作者在 Darwin 25.5.0 arm64 上的测试不覆盖本配置。

### 预算记账

下面的结果在三次运行中相同。

| 场景 | 结果 | `heldReservation()` |
| --- | --- | --- |
| PNG 1920×1080 打开、编码 JPEG、关闭 | 打开、编码、关闭 | 0 份，0 字节 |
| JPEG 2048×1536、WebP 2048×1536 | 打开 | 关闭后 0 份 |
| GIF 64×64 | `not-image` | 0 份 |
| PNG 8192×1953（15,998,976 像素） | 打开 | 关闭后 0 份 |
| PNG 4001×4000（16,004,000 像素） | `decoded-bytes` | 0 份 |
| PNG 8193×64 / 64×8193 | `width` / `height` | 0 份 |
| 持有两份 PNG 4000×4000 | 两次都打开 | 2 份，128,000,000 字节 |
| 两份持有时再打开 PNG 1920×1080 | `concurrent` | 2 份，128,000,000 字节 |
| 在持有的句柄上编码 PNG、JPEG、WebP | 三次都编码 | 2 份，128,000,000 字节，不变 |
| 关闭两份持有的句柄 | 两次都关闭 | 0 份，0 字节 |
| 调用方 1 ms 后停止等待，之后等原 Promise 并关闭 | 计时器先完成 | 停止等待时 1 份，结果返回后仍是 1 份，关闭后 0 份 |

GIF 在容器检查阶段被识别为非图像，没有走到格式允许列表。这是现有契约的行为。

### 进程内存

脚本每 5 ms 读一次 `process.memoryUsage().rss`。它只覆盖本 Node 进程，包括 sharp 和 libvips 在本进程内的原生分配。每个场景开始前调用一次 `gc()`。读数包含夹具生成留下的内存、sharp 缓存和编码输出。

| 场景 | 三次运行的 RSS 峰值 |
| --- | --- |
| 进入首个场景前（夹具已生成） | 159.5–168.0 MiB |
| 打开并关闭 PNG 8192×1953 | 266.0–269.4 MiB |
| 持有两份 PNG 4000×4000 | 333.2–336.8 MiB |
| 两份持有时连续编码 PNG、JPEG、WebP | 440.3–445.7 MiB |
| 关闭两份句柄之后 | 379.4–384.8 MiB |

限制如下：

- 只运行了三次，没有单独预热。范围很窄，但样本少。
- 5 ms 采样可能漏掉更短的峰值。
- 关闭后 RSS 没有回到起点。预算已归零。这说明分配器没有立即把内存交还给操作系统，不说明句柄没有关闭。预算归零也不证明全部原生分配已经归还。
- 这些读数不是 RSS 上限保证，也不是吞吐数据。调用方的进程上限应在预算预留之外为编码临时分配、输出字节和运行时本身留出余量。在本次观测中，两份满额句柄加编码时，RSS 峰值比首个场景前高 276.9–283.5 MiB。同时的预留是 128,000,000 字节，约 122 MiB。

### 复跑

在仓库根目录，用 Node 26 执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter "@omne-harness/image..." run build
node --expose-gc packages/execution/image/verification/budget-profile-smoke.mjs
```

脚本向标准输出写一份 JSON，含环境、配置、各场景结果与 RSS 读数，以及 `mismatches` 列表。退出码 0 表示全部场景符合预期。

## 状态记录

- 观测已完成：2026-10-17，环境如上。
- 接受：尚未接受。PanQiWei 决定后在此处记录接受链接。
