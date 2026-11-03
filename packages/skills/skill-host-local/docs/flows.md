# 关键流程

本文件写本包的两个流程。行为条款归 [SPEC.md](../SPEC.md)，失败映射归 [README「Behavior」](../README.md#behavior)。

## 取快照

```text
调用方 ──snapshot({kind:'directory', root})──▶ directory-source
  directory-source ──collect(fs, root)──▶ walk
    walk ──realpath(root)，UTF-8 解码，lstat──▶ 根     失败：ROOT 表；根名为空或不是目录 → package-not-found
    walk ──readdir(根)──▶ 名字的字节                   失败：ROOT 表
    每次列出：先把全部名字严格解码（失败 → entry-unreadable），再按码元序访问每个名字：
      访问计数 +1，超过 65536 ───────────────────────▶ entry-unreadable
      realpath(条目)，UTF-8 解码                       失败：RESOLVE 表；ENOENT 时 lstat 条目自己：
                                                         还在 → entry-unreadable，不在 → unavailable
      根内判定 ──────────────────────────────────────▶ 不在根内 → outside-package
      lstat(解析结果)                                   失败：RESOLVE 表
        目录 ──（不在祖先中，否则 entry-unreadable）readdir──▶ 下降   失败：READ 表
        文件 ──isPackagePath──▶ readFile（O_NOFOLLOW）  失败：READ 表；打开的是目录 → unavailable，其他 → entry-unreadable
        其他 ────────────────────────────────────────▶ entry-unreadable
    第一个失败结束遍历
  directory-source ──sealSnapshot(rootName, files)──▶ 快照或缺陷映射
调用方 ◀── 快照，或一种来源失败
```

前提：遍历期间目录不变。目录被并发修改时，快照可能混合新旧内容，见 [SPEC「所有权、失败与生命周期」](../SPEC.md#所有权失败与生命周期)。

## 读条目

```text
调用方 ──open({kind:'directory', root}, digest, path)──▶ directory-source
  directory-source ──readEntry(fs, root, path)──▶ walk
    walk ──realpath(root)，UTF-8 解码，lstat──▶ 根     失败：ROOT 表
    walk ──realpath(根/path)，UTF-8 解码──▶ 目标        失败：OPEN 表；不是 UTF-8 → entry-not-found
    目标不在根内 ─────────────────────────────────────▶ outside-package
    walk ──readFile(目标，O_NOFOLLOW)──▶ 字节           失败：OPEN 表；打开的是目录 → entry-not-found，其他 → unavailable
调用方 ◀── 此刻的字节，或一种来源失败
```

`open` 不使用 `digest`，也不比较字节与快照。调用方 `@omne-harness/skill` 按条目内容摘要核对字节，不符时报 `version-changed`，见[组工程设计「读取」](../../docs/architecture.md#读取)。
