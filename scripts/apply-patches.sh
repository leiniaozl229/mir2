#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# The build container mounts the workspace with the host UID. Allow Git to
# inspect the submodule there without requiring a host-specific configuration.
git config --global --add safe.directory "$PWD/vendor/openmir2" >/dev/null 2>&1 || true
patches=("$PWD"/patches/openmir2/*.patch)
# The recorded submodule commit already contains the first integration batch.
# Rechecking those historical patches after a later patch changed shared files
# can produce a false conflict even though their behavior is present.  Keep the
# fallback for the original upstream baseline so a clean checkout remains
# reproducible from either supported state.
submodule_head="$(git -C vendor/openmir2 rev-parse HEAD)"
if [[ "$submodule_head" == "6ae4cb3011af654e3c9fa09e57f98d0f07befdfe" ]]; then
  patches=()
  for patch in \
    "$PWD"/patches/openmir2/0015-seed-animal-harvest-meat.patch \
    "$PWD"/patches/openmir2/0021-harden-cross-server-switch-state.patch \
    "$PWD"/patches/openmir2/0022-fix-buff-status-bit.patch \
    "$PWD"/patches/openmir2/0023-saturate-equipment-durability.patch \
    "$PWD"/patches/openmir2/0024-fix-conflicting-skill-identities.patch \
    "$PWD"/patches/openmir2/0025-protect-safe-zones-from-monsters.patch; do
    patches+=("$patch")
  done
fi
for patch in "${patches[@]}"; do
  if git -C vendor/openmir2 apply --ignore-space-change --unidiff-zero --reverse --check "$patch" 2>/dev/null; then
    continue
  fi
  git -C vendor/openmir2 apply --ignore-space-change --unidiff-zero --check "$patch"
  git -C vendor/openmir2 apply --ignore-space-change --unidiff-zero "$patch"
done
