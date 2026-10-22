# 修改 knowledge_base_screen.tsx 指南

## 📋 概述

将 `knowledge_base_screen.tsx` 中的 Modal 改为使用 Navigation。

---

## 🔧 步骤 1: 移除 Modal 相关状态

在文件顶部，找到并删除以下状态：

```typescript
// 删除这些状态（大约在 580-610 行）
const [detailDoc, setDetailDoc] = useState<KBDoc | null>(null);
const [detailLoading, setDetailLoading] = useState(false);
const [showAddModal, setShowAddModal] = useState(false);
const [editingDoc, setEditingDoc] = useState<KBDoc | null>(null);
const [editTitle, setEditTitle] = useState('');
const [editContent, setEditContent] = useState('');
const [editLoading, setEditLoading] = useState(false);
const [addType, setAddType] = useState<AddDocType>('text');
const [addTitle, setAddTitle] = useState('');
const [addContent, setAddContent] = useState('');
const [addUrl, setAddUrl] = useState('');
const [addFile, setAddFile] = useState<any>(null);
const [addLoading, setAddLoading] = useState(false);
const [askQuestion, setAskQuestion] = useState('');
const [askAnswer, setAskAnswer] = useState('');
const [askSources, setAskSources] = useState<KBAskSource[]>([]);
const [askLoading, setAskLoading] = useState(false);
```

**保留：**
```typescript
const [showAskModal, setShowAskModal] = useState(false);  // Ask AI 保留 Modal
const [askQuestion, setAskQuestion] = useState('');
const [askAnswer, setAskAnswer] = useState('');
const [askSources, setAskSources] = useState<KBAskSource[]>([]);
const [askLoading, setAskLoading] = useState(false);
```

---

## 🔧 步骤 2: 修改打开详情的函数

找到 `openDetail` 函数（大约 720-740 行），替换为：

```typescript
// 修改前（Modal 方式）
const openDetail = useCallback(async (docId: string) => {
    if (!docId) return;
    setDetailDoc({docId, title: '...', content: '', category: '', tags: [], createdAt: '', updatedAt: ''});
    setDetailLoading(true);
    try {
        const doc = await getKBDoc(serverUrl, docId);
        if (doc) {
            setDetailDoc(doc);
        } else {
            setDetailDoc(null);
        }
    } catch {
        setDetailDoc(null);
    } finally {
        setDetailLoading(false);
    }
}, [serverUrl]);

const closeDetail = useCallback(() => {
    setDetailDoc(null);
}, []);
```

```typescript
// 修改后（Navigation 方式）
const openDetail = useCallback((docId: string, title?: string) => {
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
}, [navigation, searchQuery, doSearch, loadDocs]);
```

---

## 🔧 步骤 3: 修改添加文档

找到 `openAddModal` 和 `closeAddModal` 函数（大约 805-820 行），替换为：

```typescript
// 修改前
const openAddModal = useCallback(() => {
    setAddType('text');
    setAddTitle('');
    setAddContent('');
    setAddUrl('');
    setAddFile(null);
    setShowAddModal(true);
}, []);

const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setAddTitle('');
    setAddContent('');
    setAddUrl('');
    setAddFile(null);
}, []);
```

```typescript
// 修改后
const openAddScreen = useCallback(() => {
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
}, [navigation, teamId, searchQuery, doSearch, loadDocs]);
```

找到 `submitAdd` 函数（大约 830-870 行），**删除整个函数**（因为保存逻辑已移到 KBAddScreen）。

---

## 🔧 步骤 4: 修改编辑文档

找到 `openEditModal` 函数（大约 770-800 行），替换为：

```typescript
// 修改前
const openEditModal = useCallback((doc: KBDoc) => {
    setEditingDoc(doc);
    setEditTitle(doc.title);
    setEditContent(doc.content || '');
}, []);

const closeEditModal = useCallback(() => {
    setEditingDoc(null);
    setEditTitle('');
    setEditContent('');
}, []);

const submitEdit = useCallback(async () => {
    if (!editingDoc || !editTitle.trim() || !editContent.trim() || editLoading) return;
    setEditLoading(true);
    try {
        const result = await updateKBDoc(serverUrl, editingDoc.docId, {
            title: editTitle.trim(),
            content: editContent.trim(),
        });
        if (result?.error) {
            throw new Error(result.error);
        }
        closeEditModal();
        if (detailDoc && detailDoc.docId === editingDoc.docId) {
            setDetailDoc({...detailDoc, title: editTitle.trim(), content: editContent.trim()});
        }
        if (searchQuery.trim()) {
            doSearch(searchQuery);
        } else {
            loadDocs();
        }
    } catch (err) {
        Alert.alert(
            intl.formatMessage({id: 'workbench.kb.error', defaultMessage: 'Error'}),
            String(err),
        );
    } finally {
        setEditLoading(false);
    }
}, [editingDoc, editTitle, editContent, editLoading, serverUrl, closeEditModal, detailDoc, searchQuery, doSearch, loadDocs, intl]);
```

```typescript
// 修改后
const openEditScreen = useCallback((doc: KBDoc) => {
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
}, [navigation, searchQuery, doSearch, loadDocs]);
```

---

## 🔧 步骤 5: 修改删除文档

找到删除文档的代码（在 Detail Modal 中，大约 750-770 行），**删除**，因为删除功能已移到 KBDetailScreen。

---

## 🔧 步骤 6: 修改 Ask AI（保留 Modal）

找到 `openAskModal` 和 `closeAskModal`（大约 870-880 行），**保留不变**。

但找到 Ask AI Modal 的渲染（大约 1450 行），添加 `gestureEnabled={false}`：

```typescript
<Modal
    visible={showAskModal}
    animationType='slide'
    presentationStyle='pageSheet'
    gestureEnabled={false}  // ← 添加这行
    onRequestClose={closeAskModal}
>
```

---

## 🔧 步骤 7: 移除 Detail Modal 渲染

找到 `{/* ---- Detail Modal ---- */}` 注释（大约 1154 行），删除整个 Modal 块（到 1256 行的 `</Modal>`）。

---

## 🔧 步骤 8: 移除 Add Document Modal 渲染

找到 `{/* ---- Add Document Modal ---- */}` 注释（大约 1258 行），删除整个 Modal 块（到 1390 行的 `</Modal>`）。

---

## 🔧 步骤 9: 移除 Edit Document Modal 渲染

找到 `{/* ---- Edit Document Modal ---- */}` 注释（大约 1392 行），删除整个 Modal 块（到 1449 行的 `</Modal>`）。

---

## 🔧 步骤 10: 修改按钮点击事件

找到添加按钮（大约 1092 行和 1139 行）：

```typescript
// 修改前
<TouchableOpacity style={style.headerAction} onPress={openAddModal}>

// 修改后
<TouchableOpacity style={style.headerAction} onPress={openAddScreen}>
```

找到文档列表项点击（搜索 `openDetail` 调用）：

```typescript
// 修改前
<TouchableOpacity onPress={() => openDetail(item.docId)}>

// 修改后
<TouchableOpacity onPress={() => openDetail(item.docId, item.title)}>
```

找到编辑按钮（在 Detail Modal 中，已删除，无需修改）。

---

## 🔧 步骤 11: 移除 Modal 导入

在文件顶部（大约 12 行），删除 `Modal`：

```typescript
// 修改前
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    Modal,  // ← 删除这行
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// 修改后
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
```

---

## 🔧 步骤 12: 移除未使用的样式

在 `getStyleSheet` 函数中，可以删除以下样式（如果未在其他地方使用）：

```typescript
// 可以删除的样式（大约 1600-1900 行）
modalHeader
modalTitle
modalClose
modalBody
modalActions
detailCategory
detailDate
detailSourceUrl
detailContent
downloadBtn
editButton
addTypeSelector
addTypeButton
addTypeButtonActive
addInput
addTextArea
filePickerButton
filePickerInfo
editTextArea
```

**但建议先保留**，等确认没有其他地方使用后再删除。

---

## ✅ 验证清单

修改完成后，检查以下项目：

- [ ] 文件可以正常保存（无语法错误）
- [ ] 没有 `detailDoc`、`showAddModal`、`editingDoc` 等状态
- [ ] 没有 `openAddModal`、`closeAddModal`、`submitAdd` 等函数
- [ ] 没有 Detail Modal、Add Modal、Edit Modal 的渲染
- [ ] 有 `openDetail`、`openAddScreen`、`openEditScreen` 函数
- [ ] Ask AI Modal 仍然保留，并有 `gestureEnabled={false}`
- [ ] 导入了 `useNavigation` 和 `useRoute`（如果还没导入）

---

## 🧪 测试验证

### 功能测试

- [ ] 点击文档可以打开详情（使用导航）
- [ ] 详情页可以滚动
- [ ] 详情页下拉不会崩溃
- [ ] 详情页可以删除文档
- [ ] 点击"+"可以添加文档（使用导航）
- [ ] 添加文档支持文本/URL/文件
- [ ] 保存成功后自动返回
- [ ] 返回后列表自动刷新
- [ ] 详情页可以进入编辑（使用导航）
- [ ] 编辑文档可以修改标题和内容
- [ ] 编辑保存后自动返回
- [ ] 问 AI 功能正常（保留 Modal）

### iOS 手势测试

- [ ] 详情页侧滑返回
- [ ] 添加页侧滑返回
- [ ] 编辑页侧滑返回
- [ ] 详情页下拉滚动正常（不崩溃）
- [ ] 问 AI 页下拉不会崩溃
- [ ] 无崩溃或卡顿

---

## 💡 常见问题

### Q: 为什么 Ask AI 保留 Modal？

A: Ask AI 是对话界面，用户快速问答然后关闭，更适合 Modal 形式。但需要添加 `gestureEnabled={false}` 防止手势冲突。

### Q: 删除的样式可以恢复吗？

A: 可以先注释掉，等确认没有其他地方使用后再删除。或者保留，不影响功能。

### Q: 如果编译报错怎么办？

A: 检查是否有遗漏的函数调用或状态引用。搜索 `detailDoc`、`showAddModal`、`editingDoc` 等关键词，确保都已替换。

---

## 🚀 下一步

1. 完成上述修改
2. 保存文件
3. 运行 TypeScript 检查：
   ```bash
   npx tsc --noEmit
   ```
4. 修复任何错误
5. 提交代码：
   ```bash
   git add -A
   git commit -m "将知识库改为 Navigation 模式"
   git push origin main
   ```
6. 在 TestFlight 测试

---

祝修改顺利！🎉
