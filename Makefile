PYTHON ?= python3

.PHONY: py-install py-cli-help py-exp-help

py-install:
	$(PYTHON) -m pip install -e .

py-cli-help:
	$(PYTHON) -m src.cli --help

py-exp-help:
	$(PYTHON) -m src.cli explainability build --help
