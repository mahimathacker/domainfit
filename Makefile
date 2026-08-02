.PHONY: install dev test test-python test-web lint typecheck build verify

install:
	python3 -m pip install -e '.[dev]'
	npm install

dev:
	npm run dev

test: test-python test-web

test-python:
	python3 -m pytest

test-web:
	npm run test

lint:
	python3 -m ruff check scripts tests
	npm run lint

typecheck:
	npm run typecheck

build:
	npm run build

verify: lint typecheck test build

