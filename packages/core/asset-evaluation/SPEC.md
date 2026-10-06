# Tool environment evaluation extension

This page owns the PR2 extension adopted under the user's 2026-10-06 implementation authorization, after choice and expression review. It does not retire the existing evaluation contract or migrate its other consumers. Public shapes belong to `src/index.ts`.

AE-E1 `evaluate` with `EvaluationOptions` derives an executionEnvironment permission declaration from each applicable tool body through the tool-definition owner. The factory permission is explicit. Missing options do not invent a permission declaration. Invalid options reject the input before evaluation.

AE-E2 The new declaration uses the same existing bounds, picks, holding selection and workspace rules as other declarations. It does not add a permission tier order, turn never-allow into the unrelated execute.forbid token, or select one member from an unresolved allowed set. Consumers must reject permission results that cannot determine one environment decision.

AE-E3 The effective targetEnvironment remains a setting of the actually selected tool version. Declaration defaults do not substitute for complete evaluation. Input identity, source version and the explicit factory option all belong to a consumer's adopted revision; an input-only fingerprint does not cover a changed option.
