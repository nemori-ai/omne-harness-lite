.PHONY: check-tools

check-tools:
	@set -eu; \
	if command -v java >/dev/null 2>&1; then \
		java_version=$$(java -version 2>&1 | sed -n '1p'); \
		echo "[ok] $$java_version"; \
	else \
		echo "[missing] Java 11+ (required by TLC and Alloy Analyzer)"; \
	fi; \
	if [ -n "$${TLA2TOOLS_JAR:-}" ] && [ -f "$${TLA2TOOLS_JAR}" ]; then \
		echo "[ok] TLA2TOOLS_JAR=$$TLA2TOOLS_JAR"; \
	else \
		echo "[info] TLA2TOOLS_JAR is not configured; set it to tla2tools.jar to run TLC"; \
	fi; \
	if [ -n "$${ALLOY_ANALYZER_JAR:-}" ] && [ -f "$${ALLOY_ANALYZER_JAR}" ]; then \
		echo "[ok] ALLOY_ANALYZER_JAR=$$ALLOY_ANALYZER_JAR"; \
	else \
		echo "[info] ALLOY_ANALYZER_JAR is not configured; set it to the Analyzer jar to run Alloy"; \
	fi; \
	echo "[ok] JSON Schema dialect: Draft 2020-12 (validator integration is pending)"
