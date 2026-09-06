#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm -v "$PWD:/workspace" -w /workspace -v mir2-nuget:/root/.nuget/packages \
  mcr.microsoft.com/dotnet/sdk:10.0@sha256:e1ffd2a92ae84c1291bc1b6887501f8af98e6331e7af6d4c8d37168c5e87a64c \
  dotnet publish services/web-gateway -c Release -o .runtime/web-gateway --nologo
