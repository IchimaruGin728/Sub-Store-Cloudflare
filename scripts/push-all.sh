#!/usr/bin/env bash
set -euo pipefail

echo "📤 Pushing to GitHub..."
git push origin main

echo "✅ Done! GitLab will auto-sync from GitHub (pull mirror)"
