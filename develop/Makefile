.PHONY: build test validate

TEST_FILES := tests/*.test.mjs

build:
	node ../scripts/compile-ajv-validators.mjs --schemas schemas --out dist/validators

test: build
	node --test $(TEST_FILES)

validate: test
