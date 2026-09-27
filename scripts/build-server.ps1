param(
    [string]$DotNetPath = "dotnet",
    [string]$NuGetPackages = $env:NUGET_PACKAGES
)
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    if ($NuGetPackages) { $env:NUGET_PACKAGES = $NuGetPackages }
    $env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"
    New-Item -ItemType Directory -Force -Path ".runtime/reports" | Out-Null
    $projects = @(
        @("GameSrv", "Mir200"), @("DBSrv", "DBServer"), @("LoginSrv", "LoginSrv"),
        @("LoginGate", "LoginGate"), @("SelGate", "SelGate"), @("GameGate", "RunGate"),
        @("Storeages/DBSvr.Storage.MySQL", "DBServer")
    )
    foreach ($entry in $projects) {
        $project = $entry[0]
        $projectName = Split-Path -Leaf $project
        $destination = Join-Path $repoRoot ".runtime/server/$($entry[1])"
        & $DotNetPath publish "vendor/openmir2/src/$project/$projectName.csproj" `
            -c Release --nologo -v minimal `
            -p:PublishTrimmed=false -p:PublishSingleFile=false -p:PublishAot=false `
            "-p:OutputPath=$repoRoot/.runtime/build/$projectName/" `
            -o $destination 2>&1 | Tee-Object -FilePath ".runtime/reports/build-$projectName.log"
        if ($LASTEXITCODE -ne 0) { throw "Publishing $projectName failed (exit $LASTEXITCODE)." }
    }
} finally {
    Pop-Location
}
