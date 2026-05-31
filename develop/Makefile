.PHONY: test test-workflow-e2e validate workflow-validate

TEST_FILES := tests/*.test.mjs
WORKFLOW_E2E_TEST_FILES := tests/E2E/*.test.mjs

test:
	node --test $(TEST_FILES)

test-workflow-e2e:
	node --test $(WORKFLOW_E2E_TEST_FILES)

workflow-validate:
	cd .. && node develop/lib/bin/validate-workflow.mjs

validate: test workflow-validate
