param(
  [Parameter(Mandatory=$true)][string]$Project,
  [Parameter(Mandatory=$true)][string]$Key,
  [Parameter(Mandatory=$true)][string]$Value,
  [Parameter(Mandatory=$true)][string]$Targets
)

if (-not $env:VERCEL_TOKEN) { Write-Error 'VERCEL_TOKEN environment variable is required'; exit 1 }
$headers = @{ Authorization = "Bearer $($env:VERCEL_TOKEN)"; 'Content-Type' = 'application/json' }

# Get project
try { $proj = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$Project" -Headers $headers -Method GET } catch { Write-Error "Could not retrieve project $Project. Ensure name is correct and token has access."; exit 2 }
$projectId = $proj.id

# Get envs
$envs = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId/env" -Headers $headers -Method GET
$existing = $envs.envs | Where-Object { $_.key -eq $Key } | Select-Object -First 1

$targetsArray = $Targets -split ',' | ForEach-Object { $_.Trim() }
$body = @{ key = $Key; value = $Value; target = $targetsArray; type = 'encrypted' } | ConvertTo-Json -Depth 5

if ($existing) {
  Write-Host "Updating existing env var '$Key' (id: $($existing.id)) for project $Project"
  Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId/env/$($existing.id)" -Headers $headers -Method PATCH -Body $body
} else {
  Write-Host "Creating env var '$Key' for project $Project"
  Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId/env" -Headers $headers -Method POST -Body $body
}
