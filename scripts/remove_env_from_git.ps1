if (!(Test-Path '.gitignore')) { New-Item -Path .gitignore -ItemType File | Out-Null }
$c = @()
try { $c = Get-Content .gitignore -ErrorAction Stop } catch {}
if ($c -notcontains '.env') { Add-Content -Path .gitignore -Value '.env' }

# Remove from git index if present
try { git rm --cached .env -f 2>$null } catch {}
try { git rm --cached .env.backup -f 2>$null } catch {}

# Stage and commit
git add .gitignore
$s = git status --porcelain
if ($s) { git commit -m "chore(secrets): remove local .env files from repository and add to .gitignore" } else { Write-Output 'No changes to commit' }

# Print current branch
git rev-parse --abbrev-ref HEAD
