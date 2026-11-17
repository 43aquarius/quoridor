#!/usr/bin/env bash
# 修正 yoola-1.0.0 资产文件名：删除中文名被剥离的资产，改用 ASCII 名重传
set -euo pipefail
cd /home/z/my-project

TOKEN=$(git remote get-url origin | sed -E 's#https://[^:]+:([^@]+)@github\.com/.*#\1#')
API="https://api.github.com/repos/43aquarius/quoridor"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
RELEASE_ID=448585803

# 1. 列出并删除现有资产
ASSET_IDS=$(curl -s "${AUTH[@]}" "$API/releases/$RELEASE_ID/assets" | python3 -c "
import json, sys
for a in json.load(sys.stdin):
    print(a['id'], a['name'])")
echo "当前资产:"
echo "$ASSET_IDS"
echo "$ASSET_IDS" | while read -r aid aname; do
  curl -s "${AUTH[@]}" -X DELETE "$API/releases/assets/$aid"
  echo "  已删除: $aname (id=$aid)"
done

# 2. 以 ASCII 文件名重传
upload_asset() {
  local file="$1" name="$2"
  local resp
  resp=$(curl -s -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/zip" \
        --data-binary "@$file" \
        "https://uploads.github.com/repos/43aquarius/quoridor/releases/$RELEASE_ID/assets?name=$name")
  printf '%s' "$resp" | python3 -c "
import json,sys
d = json.load(sys.stdin)
if d.get('state') == 'uploaded':
    print(f\"  上传成功: {d['name']} ({d['size']/1024:.0f} KB)  下载: {d['browser_download_url']}\")
else:
    print(f\"  上传失败: {d.get('message')}\"); sys.exit(1)"
}

echo "重传资产（ASCII 文件名）..."
upload_asset "download/步步为营-yoola-交付包.zip" "quoridor-yoola-package.zip"
upload_asset "download/步步为营-素材包.zip" "quoridor-yoola-assets.zip"

# 3. 更新 release 说明中的文件名引用
BODY='## 快手 Yoola 互动玩法交付物

从 Web 版《步步为营》移植的快手小程序互动玩法包（竖屏、Canvas 渲染、离线运行），本地校验 `validate-package.mjs` 通过。

### 资产清单

| 文件 | 说明 |
| --- | --- |
| quoridor-yoola-package.zip | 完整 Yoola 交付包（49 个文件）：游戏逻辑 + 快手开放能力封装（激励视频 / 转发分享 / 存档 / Toast）+ 平台素材，直接上传 Yoola 平台 |
| quoridor-yoola-assets.zip | 三张平台素材单包：logo 220×220 / 封面及分享图 510×350（29 KB）/ 加载图 640×1400 竖屏（52 KB） |

### 玩法

经典挡板棋 Quoridor：9×9 棋盘，每回合走子或放板二选一，先抵达对面底线者胜。内置学徒 / 排字师 / 总编三档 AI，支持双人同屏，一局 3-5 分钟。

### 上传流程

登录 [Yoola 平台](https://open.kuaishou.com/platform/minigame/yoola) → 创建互动玩法（名称"步步为营"）→ 素材页上传三张图 → 上传交付包 zip → 真机验证 → 提交审核。'

curl -s "${AUTH[@]}" -X PATCH "$API/releases/$RELEASE_ID" -d "$(python3 - "$BODY" <<'PY'
import json, sys
print(json.dumps({"body": sys.argv[1]}, ensure_ascii=False))
PY
)" | python3 -c "import json,sys; print('说明已更新:', json.load(sys.stdin).get('name'))"
