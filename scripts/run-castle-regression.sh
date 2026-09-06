#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm -v "$PWD:/workspace" -w /workspace -v mir2-nuget:/root/.nuget/packages \
  mcr.microsoft.com/dotnet/sdk:8.0@sha256:bb32ba3ba3ea36e38572d9d8db76fa15f7cbf722f3f886e06bca6d528bd4fba8 \
  dotnet run --project tests/CastleRegression/CastleRegression.csproj -c Release
