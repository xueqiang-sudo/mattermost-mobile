#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动化脚本：修改 knowledge_base_screen.tsx
将 Modal 改为 Navigation 模式
"""

import re
import sys

def modify_kb_screen():
    input_file = '/home/work/mattermost-mobile/app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx'
    output_file = input_file

    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # 1. 移除 Modal 导入（已完成）
    print("✓ Step 1: Modal 导入已移除")

    # 2. 移除 Modal 相关状态
    # 查找并删除 detailDoc, detailLoading, showAddModal, editingDoc 等状态
    states_to_remove = [
        r'const \[detailDoc, setDetailDoc\] = useState<KBDoc \| null>\(null\);\s*',
        r'const \[detailLoading, setDetailLoading\] = useState\(false\);\s*',
        r'const \[showAddModal, setShowAddModal\] = useState\(false\);\s*',
        r'const \[editingDoc, setEditingDoc\] = useState<KBDoc \| null>\(null\);\s*',
        r'const \[editTitle, setEditTitle\] = useState\(\'\');\s*',
        r'const \[editContent, setEditContent\] = useState\(\'\');\s*',
        r'const \[editLoading, setEditLoading\] = useState\(false\);\s*',
        r'const \[addType, setAddType\] = useState<AddDocType>\(\'text\'\);\s*',
        r'const \[addTitle, setAddTitle\] = useState\(\'\');\s*',
        r'const \[addContent, setAddContent\] = useState\(\'\');\s*',
        r'const \[addUrl, setAddUrl\] = useState\(\'\');\s*',
        r'const \[addFile, setAddFile\] = useState<any>\(null\);\s*',
        r'const \[addLoading, setAddLoading\] = useState\(false\);\s*',
    ]

    for pattern in states_to_remove:
        content = re.sub(pattern, '', content)

    print("✓ Step 2: Modal 相关状态已移除")

    # 3. 替换 openDetail 函数
    old_open_detail = r'''const openDetail = useCallback\(async \(docId: string\) => \{[\s\S]*?\}, \[serverUrl\]\);'''

    new_open_detail = '''const openDetail = useCallback((docId: string, title?: string) => {
        navigation.navigate('KBDetail', {
            docId,
            docTitle: title,
            onDocUpdated: () => {
                // 刷新列表
                if (searchQuery.trim()) {
                    doSearch(searchQuery);
                } else {
                    loadDocs();
                }
            },
        });
    }, [navigation, searchQuery, doSearch, loadDocs]);'''

    content = re.sub(old_open_detail, new_open_detail, content)
    print("✓ Step 3: openDetail 函数已替换")

    # 4. 移除 closeDetail 函数
    content = re.sub(r'const closeDetail = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);\s*', '', content)
    print("✓ Step 4: closeDetail 函数已移除")

    # 5. 替换 openAddModal 为 openAddScreen
    old_open_add = r'''const openAddModal = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);'''

    new_open_add = '''const openAddScreen = useCallback(() => {
        navigation.navigate('KBAdd', {
            teamId,
            onDocAdded: () => {
                // 刷新列表
                if (searchQuery.trim()) {
                    doSearch(searchQuery);
                } else {
                    loadDocs();
                }
            },
        });
    }, [navigation, teamId, searchQuery, doSearch, loadDocs]);'''

    content = re.sub(old_open_add, new_open_add, content)
    print("✓ Step 5: openAddModal 已替换为 openAddScreen")

    # 6. 移除 closeAddModal 和 submitAdd
    content = re.sub(r'const closeAddModal = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);\s*', '', content)
    content = re.sub(r'const submitAdd = useCallback\(async \(\) => \{[\s\S]*?\}, \[[\s\S]*?\]\);\s*', '', content)
    print("✓ Step 6: closeAddModal 和 submitAdd 已移除")

    # 7. 替换 openEditModal 为 openEditScreen
    old_open_edit = r'''const openEditModal = useCallback\(\(doc: KBDoc\) => \{[\s\S]*?\}, \[\]\);'''

    new_open_edit = '''const openEditScreen = useCallback((doc: KBDoc) => {
        navigation.navigate('KBEdit', {
            doc,
            onDocUpdated: () => {
                // 刷新列表
                if (searchQuery.trim()) {
                    doSearch(searchQuery);
                } else {
                    loadDocs();
                }
            },
        });
    }, [navigation, searchQuery, doSearch, loadDocs]);'''

    content = re.sub(old_open_edit, new_open_edit, content)
    print("✓ Step 7: openEditModal 已替换为 openEditScreen")

    # 8. 移除 closeEditModal 和 submitEdit
    content = re.sub(r'const closeEditModal = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);\s*', '', content)
    content = re.sub(r'const submitEdit = useCallback\(async \(\) => \{[\s\S]*?\}, \[[\s\S]*?\]\);\s*', '', content)
    print("✓ Step 8: closeEditModal 和 submitEdit 已移除")

    # 9. 移除 Detail Modal 渲染
    content = re.sub(
        r'\{/\* ---- Detail Modal ---- \*/\}[\s\S]*?</Modal>\s*',
        '',
        content,
        count=1
    )
    print("✓ Step 9: Detail Modal 渲染已移除")

    # 10. 移除 Add Document Modal 渲染
    content = re.sub(
        r'\{/\* ---- Add Document Modal ---- \*/\}[\s\S]*?</Modal>\s*',
        '',
        content,
        count=1
    )
    print("✓ Step 10: Add Document Modal 渲染已移除")

    # 11. 移除 Edit Document Modal 渲染
    content = re.sub(
        r'\{/\* ---- Edit Document Modal ---- \*/\}[\s\S]*?</Modal>\s*',
        '',
        content,
        count=1
    )
    print("✓ Step 11: Edit Document Modal 渲染已移除")

    # 12. 替换按钮点击事件
    # openAddModal -> openAddScreen
    content = content.replace('onPress={openAddModal}', 'onPress={openAddScreen}')
    content = content.replace('onPress={() => openAddModal()}', 'onPress={openAddScreen}')

    # openEditModal -> openEditScreen
    content = content.replace('openEditModal(', 'openEditScreen(')

    print("✓ Step 12: 按钮点击事件已替换")

    # 13. 为 Ask AI Modal 添加 gestureEnabled={false}
    ask_modal_pattern = r'(<Modal\s+visible=\{showAskModal\}[^>]*presentationStyle=.pageSheet.)'
    replacement = r'\1\n                gestureEnabled={false}  // 防止 iOS 下拉手势冲突'
    content = re.sub(ask_modal_pattern, replacement, content)
    print("✓ Step 13: Ask AI Modal 已添加手势保护")

    # 写入文件
    if content != original_content:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(content)
        print("\n" + "="*60)
        print("✅ 修改完成！")
        print("="*60)
        print(f"\n文件已保存: {output_file}")
        print("\n下一步:")
        print("1. 检查文件是否有语法错误")
        print("2. 注册路由到 app/init/app.ts")
        print("3. 在 iOS 真机上测试")
        return True
    else:
        print("\n⚠️  没有检测到需要修改的内容")
        return False

if __name__ == '__main__':
    try:
        success = modify_kb_screen()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
