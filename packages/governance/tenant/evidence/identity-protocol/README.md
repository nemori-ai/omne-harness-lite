# Identity and tenant-access protocol evidence

This evidence covers only the public identity-consumption and current tenant-access declaration
increment. The adopted sources are tenant-governance v1, core-work-coordination v1, durable-records
v1, core-work v1, the accepted tenant provider design, and the actual admission/records/work-data
public entries. Exact hashes are in [sources.txt](./sources.txt).

The focused public consumer first failed because the tenant entry did not export the seven protocol
symbols; [red.log](./red.log) retains that TypeScript output. After adding the opaque invocation and
candidate types plus the two-step access surface, the same leaf build and strict consumer typecheck
passed; [green.log](./green.log) retains the output.

The result is a declaration contract. It does not issue or authenticate credentials, recognize a
candidate at runtime, evaluate current membership, persist tenant state, or prove application IPC.
Those behaviors require the identity application owner and the later TenantHost implementation.
