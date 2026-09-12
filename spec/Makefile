.PHONY: check-tools

check-tools:
	@set -eu; status=0; \
	if command -v java >/dev/null 2>&1; then \
		java_version=$$(java -version 2>&1 | sed -n '1p'); \
		echo "[ok] $$java_version"; \
	else \
		echo "[missing] Java 11+ (required to execute declared TLA+/Alloy tasks)"; status=1; \
	fi; \
	if [ -n "$${TLA2TOOLS_JAR:-}" ] && [ -f "$${TLA2TOOLS_JAR}" ]; then \
		echo "[ok] TLA2TOOLS_JAR=$$TLA2TOOLS_JAR"; \
	else \
		echo "[info] TLA2TOOLS_JAR is not configured; no TLC task can run"; \
	fi; \
	if [ -n "$${ALLOY_ANALYZER_JAR:-}" ] && [ -f "$${ALLOY_ANALYZER_JAR}" ]; then \
		echo "[ok] ALLOY_ANALYZER_JAR=$$ALLOY_ANALYZER_JAR"; \
	else \
		echo "[info] ALLOY_ANALYZER_JAR is not configured; no Alloy task can run"; \
	fi; \
	echo "[info] JSON Schema validation: use make spec-check (uv/Python 3.12)"; \
	exit $$status
