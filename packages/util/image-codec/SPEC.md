# Loaded image codec behavior

Public types belong to [src/types.ts](src/types.ts). This module owns generic byte guards and the explicit Sharp adapter. It owns no model request policy, persistent cache, permission or service lifecycle.

- The caller supplies an explicitly loaded supported Sharp version. Importing this module does not load Sharp. Codec identity includes the native implementation version and supported input/output types.
- Inspect checks input descriptors before reading them. It reports metadata without allocating the raster. PNG animation declarations use validated chunk framing and CRC rather than an assumption about the default raster.
- Decode checks actual metadata and finite native pixel limits before producing an oriented sRGB RGBA raster. The original input remains unchanged. Unsupported input, invalid input and internal failures remain distinct.
- Each decoded handle owns its raster and tracks its actual encode tasks. Close prevents new encoding, awaits existing encoding and then releases the raster. Repeated close returns the original completion. Cancellation of a caller does not cancel native work or replace the close obligation.
- The codec object is borrowed and has no global shutdown operation. Model preparation policy, candidate budgets and caches remain with their consumers.
