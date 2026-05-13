param(
  [int] $Port = 9222,
  [switch] $Restart,
  [string] $TodoExe = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($TodoExe)) {
  $candidateDirs = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\todo-list'),
    'C:\Program Files\todo-list',
    'C:\Program Files (x86)\todo-list'
  )

  foreach ($dir in $candidateDirs) {
    if ([string]::IsNullOrWhiteSpace($dir) -or !(Test-Path -LiteralPath $dir)) {
      continue
    }
    $candidate = Get-ChildItem -LiteralPath $dir -Filter 'Todo*.exe' -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notlike 'Uninstall*' } |
      Select-Object -First 1
    if ($candidate) {
      $TodoExe = $candidate.FullName
      break
    }
  }
}

if (!(Test-Path -LiteralPath $TodoExe)) {
  throw "Todo executable not found: $TodoExe"
}

$escapedTodoDir = [WildcardPattern]::Escape((Split-Path -Parent $TodoExe))
$running = Get-CimInstance Win32_Process |
  Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath -like "$escapedTodoDir\Todo*.exe") -or
    ($_.CommandLine -and $_.CommandLine -like "*$escapedTodoDir\Todo*.exe*")
  }
if ($running) {
  if (-not $Restart) {
    Write-Host "Todo is already running. Re-run with -Restart to relaunch it with the debug bridge on port $Port."
    exit 2
  }

  Write-Host 'Stopping existing Todo processes...'
  foreach ($process in $running) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

$args = @(
  "--remote-debugging-port=$Port",
  '--remote-allow-origins=*'
)

Write-Host "Starting Todo with Chrome DevTools Protocol on 127.0.0.1:$Port ..."
$todoWorkingDirectory = Split-Path -Parent $TodoExe
Start-Process -FilePath $TodoExe -ArgumentList $args -WorkingDirectory $todoWorkingDirectory -WindowStyle Hidden
Write-Host "Started. Run: .\todo.ps1 doctor --port $Port"
