# Mobile知识库最终改造方案

## 完整功能设计

### 核心功能

1. **四个Tab** (文件、文本、链接、提问)
2. **右上角+号按钮** - 根据当前tab打开不同的界面
3. **删除按钮** - 每个文档项右侧显示垃圾桶图标（参考Webapp）
4. **删除确认** - 点击删除后需要确认

## 已完成

✅ `app/screens/home/apps/workbench_api.ts` - API修复和debugLog

## 待实施

### 方案设计

#### 第一步：在文档列表中添加删除按钮

**修改文件**: `knowledge_base_screen.tsx`

在renderItemCard中添加删除按钮：

```typescript
const renderItemCard = useCallback((item: DisplayItem) => {
    const ext = getExtension(item.fileName);
    const isFile = item.category === 'file';
    const iconInfo = categoryIconInfo(item.category, ext);

    return (
        <TouchableOpacity
            style={style.docCard}
            onPress={() => isFile ? openFilePreview(item) : openDetail(item.docId, item.title)}
            activeOpacity={0.7}
        >
            <View style={style.docHeader}>
                <CompassIcon
                    name={iconInfo.name}
                    size={20}
                    color={iconInfo.color}
                />
                <Text style={style.docTitle} numberOfLines={2}>{item.title}</Text>
                
                {/* 删除按钮 - 新增 */}
                {kbWrite && (
                    <TouchableOpacity
                        style={style.deleteButton}
                        onPress={(e) => {
                            e.stopPropagation();  // 阻止触发openFilePreview或openDetail
                            handleDeleteDoc(item);
                        }}
                    >
                        <CompassIcon name='trash-can-outline' size={18} color={theme.errorTextColor}/>
                    </TouchableOpacity>
                )}
            </View>
            
            {/* 其他内容保持不变 */}
            ...
        </TouchableOpacity>
    );
}, [style, theme, kbWrite, openDetail, openFilePreview]);
```

#### 第二步：实现删除逻辑

在`knowledge_base_screen.tsx`中添加删除相关的状态和函数：

```typescript
// 删除相关状态
const [deleteTarget, setDeleteTarget] = useState<DisplayItem | null>(null);
const [isDeleting, setIsDeleting] = useState(false);

// 显示删除确认
const handleDeleteDoc = useCallback((item: DisplayItem) => {
    Alert.alert(
        intl.formatMessage({id: 'workbench.kb.delete', defaultMessage: '删除文档'}),
        intl.formatMessage({
            id: 'workbench.kb.delete_confirm',
            defaultMessage: '确定要删除 "{title}" 吗？此操作无法撤销。'
        }, {title: item.title}),
        [
            {
                text: intl.formatMessage({id: 'workbench.kb.cancel', defaultMessage: '取消'}),
                onPress: () => setDeleteTarget(null),
                style: 'cancel',
            },
            {
                text: intl.formatMessage({id: 'workbench.kb.delete', defaultMessage: '删除'}),
                onPress: () => confirmDeleteDoc(item),
                style: 'destructive',
            },
        ]
    );
    setDeleteTarget(item);
}, [intl]);

// 执行删除
const confirmDeleteDoc = useCallback(async (item: DisplayItem) => {
    if (!teamId) return;
    
    setIsDeleting(true);
    try {
        await deleteKBDoc(serverUrl, teamId, item.docId);
        
        // 删除成功，刷新列表
        if (searchQuery.trim()) {
            performSearch(searchQuery);
        } else {
            loadDocuments();
        }
    } catch (err) {
        Alert.alert(
            intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
            intl.formatMessage({
                id: 'workbench.kb.error_delete',
                defaultMessage: 'Failed to delete document.'
            }),
        );
    } finally {
        setIsDeleting(false);
        setDeleteTarget(null);
    }
}, [serverUrl, teamId, searchQuery, performSearch, loadDocuments, intl]);
```

#### 第三步：+号按钮逻辑

```typescript
const openAddScreen = useCallback(() => {
    // 根据当前tab决定操作
    if (activeCategory === 'file') {
        // 直接打开文件选择器
        showModal(
            Screens.FILE_PICKER,
            intl.formatMessage({id: 'workbench.tab.knowledge_base', defaultMessage: '知识库'}),
            {
                onSend: onUploadKBFiles,
                channelId: '',
            },
        );
    } else if (activeCategory === 'text') {
        // 显示文本输入Modal
        setShowAddModal(true);
        setAddModalType('text');
    } else if (activeCategory === 'url') {
        // 显示URL输入Modal
        setShowAddModal(true);
        setAddModalType('url');
    }
}, [activeCategory, intl, onUploadKBFiles]);
```

#### 第四步：样式添加

在`getStyleSheet`中添加删除按钮的样式：

```typescript
deleteButton: {
    padding: 8,
    marginLeft: 'auto',  // 把按钮推到右边
},
```

修改`docHeader`样式，使其能容纳删除按钮：

```typescript
docHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    // 删除之前的 flex 限制，让标题能够自动换行
},
```

调整`docTitle`样式：

```typescript
docTitle: {
    ...typography('Heading', 100, 'SemiBold'),
    color: theme.centerChannelColor,
    flex: 1,  // 让标题占据剩余空间
},
```

## 完整的UI效果

### 文件列表（显示删除按钮）

```
┌─────────────────────────────────────┐
│ 知识库                          [+] │
├─────────────────────────────────────┤
│ [文件] [文本] [链接] [提问]          │  ← 四个tab
├─────────────────────────────────────┤
│                                     │
│ 📄 document.pdf              [🗑️]   │  ← 文件项，右侧有删除按钮
│ 文件大小: 1.2 MB  创建: 2024-01-15 │
│                                     │
│ 📄 report.docx               [🗑️]   │
│ 文件大小: 2.5 MB  创建: 2024-01-14 │
│                                     │
│ 📄 data.xlsx                 [🗑️]   │
│ 文件大小: 3.1 MB  创建: 2024-01-13 │
│                                     │
└─────────────────────────────────────┘
```

### 删除确认对话框

```
┌─────────────────────────────┐
│ 删除文档                    │
├─────────────────────────────┤
│ 确定要删除 "document.pdf"   │
│ 吗？此操作无法撤销。        │
├─────────────────────────────┤
│  [取消]       [删除]        │
└─────────────────────────────┘
```

### 文本列表（显示删除按钮）

```
┌─────────────────────────────────────┐
│ 知识库                          [+] │
├─────────────────────────────────────┤
│ [文件] [文本] [链接] [提问]          │
├─────────────────────────────────────┤
│                                     │
│ 🗒️ 如何编写技术文档         [🗑️]   │
│ 创建: 2024-01-15                    │
│                                     │
│ 🗒️ Python最佳实践          [🗑️]   │
│ 创建: 2024-01-14                    │
│                                     │
│ 🗒️ 性能优化指南             [🗑️]   │
│ 创建: 2024-01-13                    │
│                                     │
└─────────────────────────────────────┘
```

### 链接列表（显示删除按钮）

```
┌─────────────────────────────────────┐
│ 知识库                          [+] │
├─────────────────────────────────────┤
│ [文件] [文本] [链接] [提问]          │
├─────────────────────────────────────┤
│                                     │
│ 🔗 Mattermost官方文档       [🗑️]   │
│ https://docs.mattermost.com        │
│ 创建: 2024-01-15                    │
│                                     │
│ 🔗 React官方文档            [🗑️]   │
│ https://react.dev                  │
│ 创建: 2024-01-14                    │
│                                     │
│ 🔗 TypeScript手册           [🗑️]   │
│ https://www.typescriptlang.org     │
│ 创建: 2024-01-13                    │
│                                     │
└─────────────────────────────────────┘
```

## 点击+号后的行为

### 在"文件"tab中点+号
```
→ 直接打开系统文件选择器
→ 选中文件后直接上传
```

### 在"文本"tab中点+号
```
→ 弹出"添加文本文档"Modal
→ 输入标题和内容
→ 点保存
```

### 在"链接"tab中点+号
```
→ 弹出"从链接导入"Modal
→ 输入标题和URL
→ 点导入
```

## 实现步骤

### Step 1: 创建kb_add_text_url_modal.tsx

处理文本和链接的输入表单。

### Step 2: 修改knowledge_base_screen.tsx

1. 在renderItemCard中添加删除按钮
2. 添加删除相关的状态和函数
3. 修改openAddScreen逻辑
4. 添加Modal渲染

### Step 3: 添加样式

在getStyleSheet中添加deleteButton样式。

### Step 4: 测试验证

- 在各tab中点+号，验证行为正确
- 点击删除按钮，验证确认对话框出现
- 确认删除，验证文档被删除并列表刷新

## API调用

需要导入和使用的API：

```typescript
import {
    deleteKBDoc,        // ← 新增：用于删除文档
    createKBDocText,    // 已有：创建文本
    createKBDocURL,     // 已有：创建链接
    createKBDocFile,    // 已有：创建文件
} from './workbench_api';
```

## 工作量评估

- 创建kb_add_text_url_modal.tsx: 150-200行，45分钟
- 修改knowledge_base_screen.tsx: 80-100行，1小时
  - 添加删除按钮: 20行
  - 添加删除逻辑: 40行
  - 修改+号逻辑: 15行
  - 样式: 10行
- 测试验证: 30分钟

**总计: 2小时15分钟**

## 代码框架速览

```typescript
// 删除确认
const handleDeleteDoc = useCallback((item) => {
    Alert.alert('删除文档', `确定删除 "${item.title}"?`, [
        {text: '取消', style: 'cancel'},
        {text: '删除', onPress: () => confirmDeleteDoc(item), style: 'destructive'},
    ]);
}, []);

// 执行删除
const confirmDeleteDoc = useCallback(async (item) => {
    setIsDeleting(true);
    try {
        await deleteKBDoc(serverUrl, teamId, item.docId);
        loadDocuments();  // 刷新列表
    } catch (err) {
        Alert.alert('错误', '删除失败');
    } finally {
        setIsDeleting(false);
    }
}, [serverUrl, teamId, loadDocuments]);

// 在renderItemCard中
{kbWrite && (
    <TouchableOpacity
        style={style.deleteButton}
        onPress={(e) => {
            e.stopPropagation();
            handleDeleteDoc(item);
        }}
    >
        <CompassIcon name='trash-can-outline' size={18} color={theme.errorTextColor}/>
    </TouchableOpacity>
)}

// +号按钮
{kbWrite && (
    <TouchableOpacity onPress={openAddScreen}>
        <CompassIcon name='plus' size={24}/>
    </TouchableOpacity>
)}
```

## 关键要点

✅ **一致性** - 删除按钮设计参考Webapp  
✅ **用户友好** - 删除前需要确认  
✅ **上下文相关** - +号按钮根据tab显示不同界面  
✅ **无须额外tab** - 充分利用屏幕空间  
✅ **功能完整** - 支持上传、创建、删除三种操作

## 参考

- Webapp实现: `/home/work/mattermost-master/webapp/.../knowledge_base_tab.tsx` (第609-618行)
- Mobile当前: `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx`
- API文件: `app/screens/home/apps/workbench_api.ts`
