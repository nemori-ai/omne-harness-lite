# @omne-harness-lite/meta-files

[中文](README_ZH.md)

An independent Files tool with thirteen commands. Text replies use Unix result labels, tables and line numbers. Edit and patch replies include unified diffs. Open returns a confirmed image attachment.

Use `createFilesTool(options, {imageCodec})` from the public root. Supply explicit byte, page, patch, image and diff limits. Each executor call receives the current Runtime Context, selected file facility and call-bound attachment writer. The tool does not read the host filesystem directly.

Import `files` from `./cordis` to register the implementation in the original tool implementation registry. Config contains asset identity, policies and the attachment storage name. This binding explicitly constructs the shared Sharp adapter. The root factory accepts any conforming loaded codec and does not load Sharp or Cordis itself.

Run `help` for the overview or one command's parameters. Commands are `help`, `read`, `open`, `write`, `edit`, `patch`, `list`, `find`, `info`, `move`, `copy`, `delete`, and `mkdir`.

Patch precheck failure submits no target changes. Interrupted commits can be partial or unknown. Recognition observes the original batch and does not replay it. [SPEC](SPEC.md) states the behavior that public types cannot express. Tests use controlled facility ports and a real temporary host environment. Image delivery to a model is a consumer responsibility.

Build, type-check and test with this member's `build`, `typecheck` and `test` scripts. See the [development guide](../../../docs/development.md) for the shared toolchain and test queue.
