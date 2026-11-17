param()

$ErrorActionPreference = 'Stop'
$statePath = Join-Path ([System.IO.Path]::GetTempPath()) 'evaluate-molly-browser-acceptance.json'
if (-not (Test-Path -LiteralPath $statePath)) { throw 'Isolated acceptance state is missing.' }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.schema -notmatch '^codex_browser_acceptance_[0-9]+$' -or $state.isolatedUrl -notmatch 'schema=codex_browser_acceptance_') {
  throw 'Refusing to test outside the isolated acceptance schema.'
}
$base = 'http://127.0.0.1:4010/api'
if (-not (Invoke-RestMethod "$base/health").ok) { throw 'Isolated API is unhealthy.' }

function Login($account) {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $payload = $state.credentials.$account | ConvertTo-Json -Compress
  $null = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType 'application/json' -Body $payload -WebSession $session
  return $session
}
function Expect-Status($session, $path, $expected) {
  try {
    $null = Invoke-WebRequest "$base$path" -UseBasicParsing -WebSession $session
    throw "Expected HTTP $expected for $path, received success."
  } catch [System.Net.WebException] {
    $actual = [int]$_.Exception.Response.StatusCode
    if ($actual -ne $expected) { throw "Expected HTTP $expected for $path, received $actual." }
  }
}

$admin = Login 'browser-admin'
$evaluator = Login 'browser-evaluator-a'
$otherEvaluator = Login 'browser-evaluator-other'
$initial = Invoke-RestMethod "$base/roster-integration/stores/browser-store/employees" -WebSession $evaluator
if ($initial.contractVersion -ne '1.3.0' -or $initial.employees.Count -ne 10) { throw 'Initial workforce contract failed.' }
if ((($initial | ConvertTo-Json -Depth 15) -match 'taxFileNumber|bankAccountNumber|dateOfBirth|visaType')) { throw 'PII leaked.' }
Expect-Status $evaluator '/roster-integration/stores/browser-other-store/employees' 403
Expect-Status $evaluator '/roster-integration/employees/browser-other-employee' 404
Expect-Status $evaluator '/employees/browser-regular/profile' 403

$jobPayload = @{ name = 'Water Bar QA'; code = 'water-bar-qa'; colorToken = 'teal'; displayOrder = 30 } | ConvertTo-Json -Compress
$job = Invoke-RestMethod "$base/stores/browser-store/jobs" -Method Post -ContentType 'application/json' -Body $jobPayload -WebSession $admin
$createdPayload = @{ id = 'browser-new-position'; storeId = 'browser-store'; displayName = 'New Position QA'; employmentType = 'Full-time'; employeeType = 'REGULAR'; jobIds = @($job.id) } | ConvertTo-Json -Compress
$created = Invoke-RestMethod "$base/employees" -Method Post -ContentType 'application/json' -Body $createdPayload -WebSession $admin
$createdRoster = (Invoke-RestMethod "$base/roster-integration/employees/browser-new-position" -WebSession $admin).employee
if ($created.id -ne 'browser-new-position' -or $createdRoster.positions.Count -ne 1 -or $createdRoster.positions[0].id -ne $job.id) {
  throw 'Create-with-position did not preserve the canonical employee identity and explicit assignment.'
}
$profileVersion = (Invoke-RestMethod "$base/employees/browser-new-position/profile" -WebSession $admin).updatedAt
$versionedPayload = @{ displayName = 'Versioned Position QA'; expectedUpdatedAt = $profileVersion } | ConvertTo-Json -Compress
$versioned = Invoke-RestMethod "$base/employees/browser-new-position" -Method Put -ContentType 'application/json' -Body $versionedPayload -WebSession $admin
if ($versioned.displayName -ne 'Versioned Position QA' -or $versioned.updatedAt -eq $profileVersion) { throw 'Versioned employee update did not advance the version.' }
try {
  $null = Invoke-WebRequest "$base/employees/browser-new-position" -UseBasicParsing -Method Put -ContentType 'application/json' -Body $versionedPayload -WebSession $admin
  throw 'Stale employee update unexpectedly succeeded.'
} catch [System.Net.WebException] {
  if ([int]$_.Exception.Response.StatusCode -ne 409) { throw 'Stale employee update did not return HTTP 409.' }
}
$afterConflict = Invoke-RestMethod "$base/employees/browser-new-position" -WebSession $admin
if ($afterConflict.displayName -ne 'Versioned Position QA') { throw 'Stale employee update changed the saved profile.' }
$renamePayload = @{ displayName = 'Regular Bob QA'; jobIds = @($job.id) } | ConvertTo-Json -Compress
$null = Invoke-RestMethod "$base/employees/browser-regular" -Method Put -ContentType 'application/json' -Body $renamePayload -WebSession $admin
$renamed = (Invoke-RestMethod "$base/roster-integration/employees/browser-regular" -WebSession $admin).employee
if ($renamed.id -ne 'browser-regular' -or $renamed.displayName -ne 'Regular Bob QA' -or $renamed.positions.Count -ne 1 -or $renamed.positions[0].code -ne 'water-bar-qa' -or $null -ne $renamed.officialScore) {
  throw 'Rename, position or null official score contract failed.'
}

$destinationJobPayload = @{ name = 'Front QA'; code = 'front-qa'; colorToken = 'blue'; displayOrder = 30 } | ConvertTo-Json -Compress
$destinationJob = Invoke-RestMethod "$base/stores/browser-other-store/jobs" -Method Post -ContentType 'application/json' -Body $destinationJobPayload -WebSession $admin
$transferPayload = @{ storeId = 'browser-other-store'; jobIds = @($destinationJob.id) } | ConvertTo-Json -Compress
$null = Invoke-RestMethod "$base/employees/browser-regular" -Method Put -ContentType 'application/json' -Body $transferPayload -WebSession $admin
$oldStore = Invoke-RestMethod "$base/roster-integration/stores/browser-store/employees" -WebSession $admin
$newStore = Invoke-RestMethod "$base/roster-integration/stores/browser-other-store/employees" -WebSession $otherEvaluator
if (@($oldStore.employees | Where-Object id -eq 'browser-regular').Count -ne 0 -or @($newStore.employees | Where-Object id -eq 'browser-regular').Count -ne 1 -or @($newStore.employees | Where-Object id -eq 'browser-regular')[0].positions[0].id -ne $destinationJob.id) {
  throw 'Store transfer contract failed.'
}
Expect-Status $evaluator '/roster-integration/employees/browser-regular' 404

$null = Invoke-RestMethod "$base/employees/browser-regular/archive" -Method Post -WebSession $admin
$archived = (Invoke-RestMethod "$base/roster-integration/employees/browser-regular" -WebSession $admin).employee
$newStore = Invoke-RestMethod "$base/roster-integration/stores/browser-other-store/employees" -WebSession $admin
if ($archived.isActive -or @($newStore.employees | Where-Object id -eq 'browser-regular').Count -ne 0) { throw 'Archive contract failed.' }

$null = Invoke-RestMethod "$base/employees/browser-training/promote-to-regular" -Method Post -WebSession $admin
$promoted = (Invoke-RestMethod "$base/roster-integration/employees/browser-training" -WebSession $admin).employee
if ($promoted.id -ne 'browser-training' -or $promoted.employeeType -ne 'REGULAR') { throw 'Promotion changed the canonical employee identity.' }

Write-Output 'PASS isolated API: auth, store isolation, PII exclusion, create with position, versioned update and stale 409, rename, transfer with destination position, archive, stable promotion ID, null official score.'
