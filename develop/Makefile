.PHONY: build test validate

build:
	node ../scripts/compile-ajv-validators.mjs --schemas schemas --out dist/validators

test: build
	node --test tests/*.test.mjs

validate: test
