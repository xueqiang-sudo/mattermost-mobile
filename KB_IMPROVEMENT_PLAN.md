# Mobile知识库改造完整方案

## 概述

当前Mobile知识库的添加文档功能与Webapp不一致，存在以下问题：

1. **直接显示文件选择器** - 没有先显示三个tab选择添加方式
2. **缺少category标记** - 导致上传失败（现已修复）
3. **功能不完整** - 只支持文件上传，不支持文本和URL

## 已完成的修复

### ✅ 在 `app/screens/home/apps/workbench_api.ts` 中修复

#### 问题
所有KB文档创建函数都缺少`category`字段，导致后端API处理失败。

#### 解决方案

1. **createKBDocFile** - 添加 `category: 'file'`
   ```typescript
   return kbPost(serverUrl, '/api/kb/create', teamId, {
       fileId: file_uuid,
       fileName,
       title: fileName,
       category: 'file',  // ← 新增
   });
   ```

2. **createKBDocText** - 添加 `category: 'text'`
   ```typescript
   return kbPost(serverUrl, '/api/kb/create', teamId, {
       title,
       content,
       category: 'text',  // ← 新增
   });
   ```

3. **createKBDocURL** - 添加 `category: 'url'`
   ```typescript
   return kbPost(serverUrl, '/api/kb/create', teamId, {
       title,
       sourceUrl,
       category: 'url',  // ← 新增
   });
   ```

4. **增强调试日志** - 所有函数都添加了debugLog便于诊断

## 待实施的改造方案

### 阶段1: 创建KB添加Modal（kb_add_modal.tsx）

#### 目标
替代直接的FILE_PICKER调用，创建一个包含三个tab的Modal，与Webapp保持一致。

#### 文件位置
`app/screens/home/apps/knowledge_base/kb_add_modal.tsx`（新建）

#### 三个Tab的设计

**Tab 1: 上传文件**
- 显示支持的文件格式列表
- 文件选择按钮（使用现有FILE_PICKER或原生文件选择）
- 显示已选文件信息（名称、大小）
- 自动设置 `category: 'file'`

**Tab 2: 输入文本**
- 标题输入框（必填）
- 内容输入框（必填，多行）
- 自动设置 `category: 'text'`

**Tab 3: 从链接导入**
- 标题输入框（必填）
- URL输入框（必填，需要URL格式验证）
- 自动设置 `category: 'url'`

#### 核心状态管理
```typescript
type AddKBModalMode = 'file' | 'text' | 'url';

interface KBAddModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
    serverUrl: string;
    teamId: string;
}

// 组件内状态
const [activeTab, setActiveTab] = useState<AddKBModalMode>('file');
const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
const [textTitle, setTextTitle] = useState('');
const [textContent, setTextContent] = useState('');
const [urlTitle, setUrlTitle] = useState('');
const [urlValue, setUrlValue] = useState('');
const [isSubmitting, setIsSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);
```

#### 验证逻辑
```typescript
const canSubmit = useCallback(() => {
    if (isSubmitting) return false;
    
    switch (activeTab) {
        case 'file':
            return selectedFile !== null;
        case 'text':
            return textTitle.trim().length > 0 && 
                   textContent.trim().length > 0;
        case 'url':
            return urlTitle.trim().length > 0 && 
                   urlValue.trim().length > 0 &&
                   isValidUrl(urlValue);
        default:
            return false;
    }
}, [activeTab, selectedFile, textTitle, textContent, urlTitle, urlValue, isSubmitting]);
```

#### 提交逻辑
```typescript
const handleSubmit = useCallback(async () => {
    if (!canSubmit() || !teamId) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
        if (activeTab === 'file' && selectedFile) {
            await createKBDocFile(
                serverUrl, teamId,
                selectedFile.uri || '',
                selectedFile.name || 'unknown',
                selectedFile.mime_type || 'application/octet-stream'
            );
        } else if (activeTab === 'text') {
            await createKBDocText(
                serverUrl, teamId,
                textTitle.trim(),
                textContent.trim()
            );
        } else if (activeTab === 'url') {
            await createKBDocURL(
                serverUrl, teamId,
                urlTitle.trim(),
                urlValue.trim()
            );
        }
        
        dismissModal({componentId: 'kb_add_modal'});
        onSuccess?.();
        
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add document');
    } finally {
        setIsSubmitting(false);
    }
}, [activeTab, selectedFile, textTitle, textContent, urlTitle, urlValue, 
    teamId, serverUrl, canSubmit]);
```

### 阶段2: 修改knowledge_base_screen.tsx

#### 修改点1: 导入新Modal
```typescript
import KBAddModal from './kb_add_modal';
```

#### 修改点2: 添加Modal状态
```typescript
const [showAddModal, setShowAddModal] = useState(false);
```

#### 修改点3: 修改openAddScreen回调
```typescript
const openAddScreen = useCallback(() => {
    setShowAddModal(true);  // 显示新的三tab Modal
}, []);
```

#### 修改点4: 在底部添加Modal渲染
```tsx
{showAddModal && (
    <KBAddModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
            setShowAddModal(false);
            loadDocuments();
        }}
        serverUrl={serverUrl}
        teamId={teamId}
    />
)}
```

### 阶段3: 清理FILE_PICKER直接调用

移除或注释掉知识库对FILE_PICKER的直接调用。FILE_PICKER仍可用于其他功能（如云盘上传）。

## 对标Webapp的功能对比

| 功能特性 | Webapp | Mobile | 当前状态 |
|--------|--------|--------|---------|
| 三个tab (文件/文本/链接) | ✅ | ❌ | 待实施 |
| 文件上传category标记 | ✅ | ✅ | ✅ 已修复 |
| 文本category标记 | ✅ | ✅ | ✅ 已修复 |
| URL category标记 | ✅ | ✅ | ✅ 已修复 |
| 文件类型限制提示 | ✅ | ❌ | 待实施 |
| 表单验证 | ✅ | ❌ | 待实施 |
| 错误提示 | ✅ | ✅ | ✅ 已实现 |
| 调试日志 | - | ✅ | ✅ 已完成 |

## 样式设计建议

### Modal布局参考

```
┌─────────────────────────────────────┐
│ 知识库 - 添加文档                [✕]│
├─────────────────────────────────────┤
│ ┌─────────┬──────────┬────────────┐ │
│ │上传文件 │ 输入文本 │从链接导入  │ │  ← 三个tab
│ └─────────┴──────────┴────────────┘ │
├─────────────────────────────────────┤
│                                     │
│ 📄 选择文件                          │
│ （支持：PDF, Word, Excel, ...）    │
│ ───────────────────────────────────  │
│ 已选文件：document.pdf (1.2 MB)    │
│                                     │
│                                     │
│  ┌──────────┐  ┌────────────────┐ │
│  │  取消    │  │  上传 →        │ │
│  └──────────┘  └────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

## 实施清单

### Step 1: 创建kb_add_modal.tsx
- [ ] 创建新文件
- [ ] 实现三个tab的UI
- [ ] 实现状态管理
- [ ] 实现表单验证
- [ ] 实现提交逻辑
- [ ] 添加错误处理

### Step 2: 修改knowledge_base_screen.tsx
- [ ] 导入新Modal
- [ ] 添加Modal状态
- [ ] 修改openAddScreen逻辑
- [ ] 添加Modal渲染
- [ ] 测试Modal显示和关闭

### Step 3: 验证功能
- [ ] 文件上传功能正常
- [ ] 文本输入功能正常
- [ ] URL输入功能正常
- [ ] 各tab的category标记正确
- [ ] 错误处理正常

### Step 4: 清理代码
- [ ] 移除旧的FILE_PICKER直接调用
- [ ] 验证没有遗漏的地方

## 文件变更总结

### 已修改
```
app/screens/home/apps/workbench_api.ts
  - createKBDocFile: +category: 'file', +debugLog
  - createKBDocText: +category: 'text', +debugLog
  - createKBDocURL: +category: 'url', +debugLog
  - uploadKBFile: +debugLog
```

### 建议新增
```
app/screens/home/apps/knowledge_base/kb_add_modal.tsx
  - 三tab的添加界面
  - 完整的状态管理和验证
```

### 建议修改
```
app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx
  - 使用新Modal替代FILE_PICKER
```

## 测试验证

### 已可测试的（现在）
- [x] 文件上传是否成功
- [x] debugLog中是否显示 category: 'file'

### 待测试的（实施后）
- [ ] 三个tab是否正常显示和切换
- [ ] 文本输入是否成功创建文本文档
- [ ] URL输入是否成功创建URL文档
- [ ] 各类型文档的category标记是否正确
- [ ] 表单验证是否正常工作
- [ ] 错误提示是否正确显示

## 参考资源

### Webapp实现参考
`/home/work/mattermost-master/webapp/channels/src/components/sidebar/workbench_panel/knowledge_base_tab.tsx`
- 第823-846行：Modal tabs实现
- 第390-443行：表单验证和保存逻辑
- 第410-432行：三种创建模式

### Mobile现有实现
`/home/work/mattermost-mobile/app/screens/home/apps/workbench_api.ts`
- 第422-468行：文件上传和KB创建函数
- 已有详细的debugLog

## 好处总结

✅ **一致性**: 与Webapp UI保持一致  
✅ **完整性**: 支持三种添加方式  
✅ **正确性**: 每种方式都有正确的category标记  
✅ **可维护性**: 代码结构清晰，易于扩展  
✅ **用户体验**: 表单验证和错误提示完善  
✅ **调试性**: 详细的debugLog便于诊断问题

## 后续优化建议

1. **离线支持**: 考虑添加草稿保存功能
2. **预览**: 文本/URL添加时可以预览效果
3. **模板**: 为文本文档提供常用模板
4. **导入**: 从其他源导入内容的快捷方式
5. **协作**: 支持多人编辑的KB文档
