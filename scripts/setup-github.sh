#!/usr/bin/env bash
#
# One-shot helper: create the GitHub repo (if needed), push, and enable Pages.
#
# Prerequisites: git with a working credential manager (Git Credential Manager
# on Windows, or gh / a PAT on Linux).
#
# Usage:
#   ./scripts/setup-github.sh <repo-name> [owner]
#
# Example:
#   ./scripts/setup-github.sh Rok-Tracker

set -euo pipefail

REPO_NAME="${1:-Rok-Tracker}"
OWNER="${2:-$(git config user.name)}"
BRANCH="main"

cd "$(dirname "$0")/.."

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not a git repository. Run 'git init' first." >&2
  exit 1
fi

# Make sure main exists and is the current branch.
CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  git branch -M "$BRANCH"
fi

# Try to create the remote repository via the GitHub API using the
# credential helper's stored credentials. Falls back to a manual push.
REMOTE_URL=""

if command -v gh >/dev/null 2>&1; then
  if gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
    echo "Repository $OWNER/$REPO_NAME already exists."
  else
    echo "Creating repository $OWNER/$REPO_NAME..."
    gh repo create "$OWNER/$REPO_NAME" --public --source=. --remote=origin --push
    REMOTE_URL="set"
  fi
fi

if [ -z "$REMOTE_URL" ]; then
  if git remote get-url origin >/dev/null 2>&1; then
    echo "Remote 'origin' already set to $(git remote get-url origin)."
  else
    echo "Could not create the repository automatically."
    echo
    echo "Do this by hand:"
    echo "  1. Create https://github.com/$OWNER/$REPO_NAME (public, no README)"
    echo "  2. git remote add origin https://github.com/$OWNER/$REPO_NAME.git"
    echo "  3. git push -u origin $BRANCH"
    echo
    echo "Then set VITE_BASE_PATH=/$REPO_NAME/ under Settings > Secrets and"
    echo "variables > Actions > Variables, and enable Pages with source"
    echo "'GitHub Actions' under Settings > Pages."
    exit 0
  fi
fi

# Enable Pages if gh is available.
if command -v gh >/dev/null 2>&1; then
  echo "Enabling GitHub Pages..."
  gh api -X POST "repos/$OWNER/$REPO_NAME/pages" \
    -f source[branch]="$BRANCH" \
    -f source[path]=/ \
    2>/dev/null || echo "  (could not enable automatically - enable it in Settings > Pages)"
fi

echo
echo "Done. The site will be live at https://$OWNER.github.io/$REPO_NAME/"
echo "after the deploy workflow finishes."
