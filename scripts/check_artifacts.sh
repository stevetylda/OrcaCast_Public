#!/usr/bin/env bash

set -euo pipefail

forbidden_pattern='(^node_modules/|^dist/|(^|/)\.vite/|\.DS_Store$|(^|/)__pycache__/|\.pyc$)'

if git ls-files | rg -n "${forbidden_pattern}" >/dev/null; then
  echo "Forbidden tracked artifacts detected:"
  git ls-files | rg -n "${forbidden_pattern}"
  exit 1
fi

echo "No forbidden tracked artifacts found."
