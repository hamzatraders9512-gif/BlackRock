Vercel env helper scripts

These scripts set or update Vercel environment variables using the Vercel API.

Prerequisites
- Create a Vercel personal token: https://vercel.com/account/tokens and export it as `VERCEL_TOKEN` in your shell or CI secrets.
- `jq` is required for the bash script. Install via your package manager.

Bash usage

```bash
# set a single env var (production target)
export VERCEL_TOKEN=<<your_token>>
./scripts/vercel-set-env.sh my-project JWT_SECRET "my-strong-secret" production

# set multiple targets (production and preview)
./scripts/vercel-set-env.sh my-project API_KEY "abcd" "production,preview"
```

PowerShell usage

```powershell
# in Windows PowerShell
$env:VERCEL_TOKEN = "your_token"
.\scripts\vercel-set-env.ps1 -Project "my-project" -Key "JWT_SECRET" -Value "my-strong-secret" -Targets "production"
```

Notes
- `Project` is the Vercel project name (slug). If you prefer, you can use project ID instead for `Project`.
- Scripts will create the env var if it doesn't exist or update the existing one.
- Keep your `VERCEL_TOKEN` secret; in CI store it in the CI provider's secret store.
- For bulk updates, you can call the script in a loop or adapt it to read from a file.
