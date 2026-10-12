# systemd mechanism probe

This opt-in probe starts a privileged disposable container with synthetic shell services. It does not run the product host or certify product backup, shutdown, or durability.

Build `Dockerfile.systemd` with an explicit local image tag. Its Node base has a digest, but apt packages are not version-pinned. Inspect the installed systemd version for each run.

Run `uv run --locked python apps/tenancy-host/tests/probes/systemd-lifecycle.py --out tmp/<task>/systemd --name <unique-container-name> --image <local-image-tag>`. The output directory must not exist. Use an unused container name. Results and generated units stay in that task directory.

The probe checks a stop that exceeds 30 seconds and a timer fired after the synthetic center stops. It does not establish a daily schedule, product drain, or recovery guarantee. Current product deployment rules belong to [deploy](../../deploy/README.md).
