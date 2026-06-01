.PHONY: test test-workflow-e2e validate workflow-validate

TEST_FILES := $(shell find lib/tests lib/entities lib/use-cases -name '*.test.mjs' -type f | sort)
WORKFLOW_E2E_TEST_FILES := lib/tests/E2E/*.test.mjs

test:
	node --test $(TEST_FILES)

test-workflow-e2e:
	node --test $(WORKFLOW_E2E_TEST_FILES)

workflow-validate:
	cd .. && node develop/lib/entrypoints/cli/validate-workflow.mjs workflows/dev-harness/workflow.json workflows/research-critic/workflow.json

validate: test workflow-validate
