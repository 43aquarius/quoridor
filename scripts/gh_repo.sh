#!/usr/bin/env bash
# GitHub 仓库元数据整理：描述 / 主页 / topics 标签
# 令牌从 git remote URL 中提取（不落盘、不回显）
set -euo pipefail

REMOTE_URL=$(git remote get-url origin)
TOKEN=$(printf '%s' "$REMOTE_URL" | sed -E 's#https://[^:]+:([^@]+)@github\.com/.*#\1#')
API="https://api.github.com/repos/43aquarius/quoridor"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")

case "${1:-}" in
  meta)
    curl -s "${AUTH[@]}" -X PATCH "$API" \
      -d '{"description":"一册会下棋的棋谱专著 —— Quoridor 网页对弈：单机四档 AI / 双人同屏 / 在线对战 / 四人围坐 · Next.js + socket.io","homepage":"https://d1n1c9rzwhe0-d.space.zhipuaidemo.cn/"}' \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print("description:", d.get("description")); print("homepage:", d.get("homepage"))'
    ;;
  topics)
    curl -s "${AUTH[@]}" -X PUT "$API" \
      -d '{"names":["quoridor","board-game","webgame","game","ai","minimax","alpha-beta-pruning","nextjs","react","typescript","tailwindcss","prisma","socket-io","zustand","bun","android","webview","github-actions","risograph"]}' \
      | python3 -c 'import json,sys; print("topics:", ", ".join(json.load(sys.stdin).get("names", [])))'
    ;;
  check)
    curl -s "${AUTH[@]}" "$API" \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print("description:", d.get("description")); print("homepage:", d.get("homepage")); print("stars:", d.get("stargazers_count"), " forks:", d.get("forks_count"))'
    curl -s "${AUTH[@]}" "$API/topics" \
      | python3 -c 'import json,sys; print("topics:", ", ".join(json.load(sys.stdin).get("names", [])))'
    ;;
  actions)
    # 查看最近工作流运行状态
    curl -s "${AUTH[@]}" "$API/actions/runs?per_page=6" \
      | python3 -c '
import json, sys
for r in json.load(sys.stdin).get("workflow_runs", []):
    rid = r["id"]
    name = r["name"]
    ref = r["head_branch"] or (r["head_sha"] or "")[:7]
    st = r["status"]
    cl = r.get("conclusion") or ""
    print(f"run {rid}  {name}  ref={ref}  {st}  {cl}")'
    ;;
  run-log)
    # 用法: gh_repo.sh run-log <run_id>
    curl -s "${AUTH[@]}" "$API/actions/runs/$2" \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["status"], d.get("conclusion"), d["html_url"])'
    ;;
  *)
    echo "用法: $0 {meta|topics|check|actions|run-log <id>}"
    exit 1
    ;;
esac
