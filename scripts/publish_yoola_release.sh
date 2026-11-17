#!/usr/bin/env bash
# 发布《步步为营》Yoola 交付包到 GitHub Release（tag: yoola-1.0.0）
set -euo pipefail
cd /home/z/my-project

TOKEN=$(git remote get-url origin | sed -E 's#https://[^:]+:([^@]+)@github\.com/.*#\1#')
API="https://api.github.com/repos/43aquarius/quoridor"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")

TAG="yoola-1.0.0"
TITLE="步步为营 Yoola 交付包 1.0.0（快手互动玩法）"

BODY='## 快手 Yoola 互动玩法交付物

从 Web 版《步步为营》移植的快手小程序互动玩法包（竖屏、Canvas 渲染、离线运行），本地校验 `validate-package.mjs` 通过。

### 资产清单

| 文件 | 说明 |
| --- | --- |
| 步步为营-yoola-交付包.zip | 完整 Yoola 交付包（49 个文件）：游戏逻辑 + 快手开放能力封装（激励视频 / 转发分享 / 存档 / Toast）+ 平台素材，直接上传 Yoola 平台 |
| 步步为营-素材包.zip | 三张平台素材单包：logo 220×220 / 封面及分享图 510×350（29 KB）/ 加载图 640×1400 竖屏（52 KB） |

### 玩法

经典挡板棋 Quoridor：9×9 棋盘，每回合走子或放板二选一，先抵达对面底线者胜。内置学徒 / 排字师 / 总编三档 AI，支持双人同屏，一局 3-5 分钟。

### 上传流程

登录 [Yoola 平台](https://open.kuaishou.com/platform/minigame/yoola) → 创建互动玩法（名称"步步为营"）→ 素材页上传三张图 → 上传交付包 zip → 真机验证 → 提交审核。详见仓库 `docs/` 与上传材料文档。'

# 1. 创建 release（tag 同步创建于默认分支 HEAD）
CREATE_JSON=$(curl -s "${AUTH[@]}" -X POST "$API/releases" -d "$(python3 - "$TAG" "$TITLE" "$BODY" <<'PY'
import json, sys
print(json.dumps({
    "tag_name": sys.argv[1],
    "target_commitish": "main",
    "name": sys.argv[2],
    "body": sys.argv[3],
    "draft": False,
    "prerelease": False,
}, ensure_ascii=False))
PY
)")

RELEASE_ID=$(printf '%s' "$CREATE_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or ('ERROR:'+str(d.get('message'))))")
case "$RELEASE_ID" in ERROR:*) echo "创建失败: $RELEASE_ID"; printf '%s' "$CREATE_JSON" | head -c 500; exit 1;; esac
echo "release 已创建: id=$RELEASE_ID tag=$TAG"
HTML_URL=$(printf '%s' "$CREATE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['html_url'])")

# 2. 上传两个 zip 资产
upload_asset() {
  local file="$1"
  local name
  name=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$(basename "$file")")
  local resp
  resp=$(curl -s -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/zip" \
        --data-binary "@$file" \
        "https://uploads.github.com/repos/43aquarius/quoridor/releases/$RELEASE_ID/assets?name=$name")
  printf '%s' "$resp" | python3 -c "
import json,sys
d = json.load(sys.stdin)
if 'state' in d and d['state'] == 'uploaded':
    print(f\"  上传成功: {d['name']} ({d['size']/1024:.0f} KB)\")
else:
    print(f\"  上传失败: {d.get('message')} {d.get('errors','')}\"); sys.exit(1)"
}

echo "上传资产..."
upload_asset "download/步步为营-yoola-交付包.zip"
upload_asset "download/步步为营-素材包.zip"

echo "RELEASE_URL=$HTML_URL"
