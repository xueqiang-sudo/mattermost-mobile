#!/bin/bash
# 快速修复脚本：为所有 Modal 添加 gestureEnabled={false}

echo "========================================="
echo "Modal 手势保护快速修复"
echo "========================================="
echo ""

# 需要修复的文件列表
FILES=(
    "app/screens/add_user_to_friends/index.tsx"
    "app/screens/consultation/consultation_panel.tsx"
    "app/screens/external_profile_card/index.tsx"
    "app/screens/home/ai_agent/index.tsx"
    "app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx"
    "app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx"
    "app/screens/home/apps/mes/mes_screen.tsx"
    "app/screens/home/channel_list/categories_list/header/header.tsx"
    "app/screens/home/contacts/contacts_manage/index.tsx"
    "app/screens/login/PhoneInput.tsx"
    "app/screens/manage_enterprise/detail.tsx"
    "app/screens/search_chat_history/components/date_picker_modal.tsx"
)

echo "将检查以下 ${#FILES[@]} 个文件："
for file in "${FILES[@]}"; do
    echo "  - $file"
done
echo ""
echo "按 Ctrl+C 取消，或按 Enter 继续..."
read

# 备份当前状态
echo "创建备份..."
git add -A
git commit -m "Backup before modal gesture fix" || echo "Nothing to commit"

# 修复每个文件
for file in "${FILES[@]}"; do
    full_path="/home/work/mattermost-mobile/$file"

    if [ ! -f "$full_path" ]; then
        echo "⚠️  文件不存在: $file"
        continue
    fi

    echo "处理: $file"

    # 检查是否已经有 gestureEnabled
    if grep -q "gestureEnabled" "$full_path"; then
        echo "  ✓ 已经有 gestureEnabled 配置"
        continue
    fi

    # 检查是否有 Modal
    if ! grep -q "<Modal" "$full_path"; then
        echo "  - 没有 Modal，跳过"
        continue
    fi

    # 使用 Python 修复（更安全）
    python3 << PYEOF
import re

with open('$full_path', 'r', encoding='utf-8') as f:
    content = f.read()

# 查找 Modal 标签
pattern = r'(<Modal[^>]*?)(\s*/>|>)'

def add_gesture_enabled(match):
    modal_tag = match.group(1)
    closing = match.group(2)

    # 如果已经有 gestureEnabled，不添加
    if 'gestureEnabled' in modal_tag:
        return match.group(0)

    # 添加 gestureEnabled={false}
    return modal_tag + '\n            gestureEnabled={false}  // 防止 iOS 下拉手势冲突' + closing

new_content = re.sub(pattern, add_gesture_enabled, content, flags=re.DOTALL)

if new_content != content:
    with open('$full_path', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('  ✅ 已添加 gestureEnabled={false}')
else:
    print('  - 无需修改')
PYEOF

done

echo ""
echo "========================================="
echo "修复完成！"
echo "========================================="
echo ""
echo "查看修改："
git diff --stat
echo ""
echo "如果满意，请执行："
echo "  git add -A"
echo "  git commit -m '为所有 Modal 添加手势保护'"
echo "  git push origin main"
echo ""
