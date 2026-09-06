#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .runtime/reports
bash scripts/apply-patches.sh
if [[ "${MIR2_IN_CONTAINER:-}" != 1 ]]; then
  exec docker run --rm --name mir2-build \
    -e MIR2_IN_CONTAINER=1 -e DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    -v "$PWD:/workspace" -w /workspace \
    -v mir2-nuget:/root/.nuget/packages \
    mcr.microsoft.com/dotnet/sdk:8.0@sha256:bb32ba3ba3ea36e38572d9d8db76fa15f7cbf722f3f886e06bca6d528bd4fba8 \
    bash scripts/build-server.sh
fi
for mapping in \
  "GameSrv:Mir200" "DBSrv:DBServer" "LoginSrv:LoginSrv" \
  "LoginGate:LoginGate" "SelGate:SelGate" "GameGate:RunGate" \
  "Storeages/DBSvr.Storage.MySQL:DBServer"; do
  project="${mapping%:*}"
  destination="${mapping#*:}"
  project_name="${project##*/}"
  dotnet publish "vendor/openmir2/src/$project/$project_name.csproj" \
    -c Release --nologo -v minimal \
    -p:PublishTrimmed=false -p:PublishSingleFile=false -p:PublishAot=false \
    -o "$PWD/.runtime/server/$destination" \
    2>&1 | tee ".runtime/reports/build-$project_name.log"
done
