[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$statePath = Join-Path ([System.IO.Path]::GetTempPath()) 'evaluate-molly-browser-acceptance.json'
if (-not (Test-Path -LiteralPath $statePath)) { throw 'Disposable acceptance state is missing.' }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$url = [uri]$state.isolatedUrl
if ($state.schema -notmatch '^codex_browser_acceptance_[0-9]+$' -or $url.Host -ne 'localhost' -or $url.AbsolutePath -ne '/evaluate_molly' -or $url.Query -notmatch 'schema=codex_browser_acceptance_') {
  throw 'Refusing to verify outside the disposable local schema.'
}

$base = 'http://127.0.0.1:4010/api'
if (-not (Invoke-RestMethod "$base/health").ok) { throw 'Disposable API is unhealthy.' }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = $state.credentials.'browser-admin' | ConvertTo-Json -Compress
$null = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType 'application/json' -Body $login -WebSession $session
$history = Invoke-RestMethod "$base/evaluation-rounds/history?employeeId=browser-regular" -WebSession $session
$open = Invoke-RestMethod "$base/employees/browser-regular/evaluation-rounds/current" -WebSession $session
$detail = Invoke-RestMethod "$base/roster-integration/employees/browser-regular" -WebSession $session
$list = Invoke-RestMethod "$base/roster-integration/stores/browser-store/employees?page=1&pageSize=20" -WebSession $session
$listed = @($list.employees | Where-Object id -eq 'browser-regular')
if ($history.items.Count -ne 1 -or $open.status -ne 'OPEN' -or $null -eq $detail.employee.officialScore) { throw 'Expected one CLOSED history row, one OPEN Round and an official score.' }
if ($detail.employee.officialScore.roundId -ne $history.items[0].id -or $detail.employee.officialScore.roundId -eq $open.id) { throw 'Integration detail used a provisional or wrong Round.' }
if ($listed.Count -ne 1 -or $listed[0].officialScore.roundId -ne $detail.employee.officialScore.roundId) { throw 'Integration list/detail official score mismatch.' }
if ($detail.employee.id -ne 'browser-regular' -or $detail.employee.officialScore.tier -ne $history.items[0].tier) { throw 'Canonical identity or Tier mismatch.' }
if (($detail | ConvertTo-Json -Depth 20) -match 'taxFile|bankAccount|bsb|dateOfBirth|visa|superannuation|textFeedback|evaluatorName') { throw 'Integration DTO contains unrelated PII.' }
Write-Output "PASS disposable HTTP: canonical employee ID, latest CLOSED score/Tier, OPEN exclusion, list/detail parity, PII check."
