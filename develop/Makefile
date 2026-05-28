.PHONY: build test validate

TEST_FILES := tests/*.test.mjs

build:
	@echo "JSON Schema validation uses runtime schema documents; no generated validators required."

test:
	node --test $(TEST_FILES)

validate: test
