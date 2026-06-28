.PHONY: test test-workflow-e2e validate workflow-validate check-workflow-run-leaks

TEST_FILES := $(shell find lib/tests lib/entities lib/use-cases -name '*.test.mjs' -type f ! -path 'lib/tests/E2E/*' | sort)
WORKFLOW_E2E_TEST_FILES := lib/tests/E2E/*.test.mjs
TEST_NODE := node --import ./lib/tests/setup-workflow-runs-root.mjs

# Cheap guard: tests must not leak workflow run artifacts into repository paths.
check-workflow-run-leaks:
	@if [ -e .workflow-runs ] || [ -e ../../develop/.workflow-runs ]; then \
		echo "test leaked workflow run artifacts into the worktree" >&2; \
		exit 1; \
	fi

test:
	@$(TEST_NODE) --test $(TEST_FILES); \
	status=$$?; \
	$(MAKE) --no-print-directory check-workflow-run-leaks || status=$$?; \
	exit $$status

test-workflow-e2e:
	@$(TEST_NODE) --test $(WORKFLOW_E2E_TEST_FILES); \
	status=$$?; \
	$(MAKE) --no-print-directory check-workflow-run-leaks || status=$$?; \
	exit $$status

workflow-validate:
	node ./lib/entrypoints/cli/validate-workflow.mjs ../../workflows/*/workflow.json

validate: test workflow-validate
