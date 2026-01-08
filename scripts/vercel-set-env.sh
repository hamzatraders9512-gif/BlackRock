#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 <project-name> <ENV_NAME> <ENV_VALUE> <targets>
  project-name: Vercel project name (slug)
  ENV_NAME: Name of the environment variable to set
  ENV_VALUE: Value to set (wrap in quotes if contains spaces)
  targets: comma-separated list of targets: production,preview,development

Example:
  VERCEL_TOKEN=xxx $0 my-project JWT_SECRET "mysecret" production

Requirements: `curl` and `jq` installed, and `VERCEL_TOKEN` env var set (personal token).
EOF
  exit 1
}

if [ "$#" -lt 4 ]; then usage; fi
PROJECT="$1"
KEY="$2"
VALUE="$3"
TARGETS="$4"

: "${VERCEL_TOKEN:?VERCEL_TOKEN environment variable must be set}"

# resolve project id
proj_json=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v9/projects/$PROJECT")
projectId=$(echo "$proj_json" | jq -r '.id // empty')
if [ -z "$projectId" ]; then
  echo "Project '$PROJECT' not found. Ensure project name is correct and token has access." >&2
  exit 2
fi

# list existing envs
envs_json=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v9/projects/$projectId/env")
# find existing env id for key
envId=$(echo "$envs_json" | jq -r --arg K "$KEY" '.envs[]? | select(.key==$K) | .id' | head -n1 || true)

# build target array JSON
IFS=',' read -r -a arr <<< "$TARGETS"
# remove empty elements
targets_json=$(printf '%s\n' "${arr[@]}" | jq -R -s -c 'split("\n")[:-1]')

payload=$(jq -nc --arg k "$KEY" --arg v "$VALUE" --argjson t "$targets_json" '{key:$k, value:$v, target:$t, type:"encrypted"}')

if [ -n "$envId" ]; then
  echo "Updating existing env var '$KEY' (id: $envId) for project $PROJECT"
  curl -s -X PATCH -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" "https://api.vercel.com/v9/projects/$projectId/env/$envId" -d "$payload" | jq
else
  echo "Creating env var '$KEY' for project $PROJECT"
  curl -s -X POST -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" "https://api.vercel.com/v9/projects/$projectId/env" -d "$payload" | jq
fi
