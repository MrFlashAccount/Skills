.PHONY: test validate workflow-validate

TEST_FILES := lib/tests/*.test.mjs

test:
	node --test $(TEST_FILES)

workflow-validate:
	cd .. && node develop/lib/bin/validate-workflow.mjs

validate: test workflow-validate
