.PHONY: test validate workflow-validate

TEST_FILES := tests/*.test.mjs

test:
	node --test $(TEST_FILES)

workflow-validate:
	cd .. && node develop/scripts/validate-workflow.mjs

validate: test workflow-validate
