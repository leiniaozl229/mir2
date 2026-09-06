#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for patch in "$PWD"/patches/openmir2/*.patch; do
  if git -C vendor/openmir2 apply --ignore-space-change --unidiff-zero --reverse --check "$patch" 2>/dev/null; then
    continue
  fi
  git -C vendor/openmir2 apply --ignore-space-change --unidiff-zero --check "$patch"
  git -C vendor/openmir2 apply --ignore-space-change --unidiff-zero "$patch"
done
