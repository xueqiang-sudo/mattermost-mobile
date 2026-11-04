# 文件预览分步骤 Loading Modal - 实施完成

## ✅ 实施完成

### 📋 需求
1. **即时反馈**：点击文件立即显示 Loading Modal，不再有"无反应"的空白期
2. **分步骤提示**：根据文件状态动态显示所需步骤（转换/下载/打开）
3. **智能跳过**：已转换跳过转换步骤，已下载跳过下载步骤
4. **支持取消**：转换和下载过程中可以取消
5. **多场景复用**：聊天窗口、云盘、知识库统一使用

---

## 🎯 动态步骤逻辑

### 步骤判断规则
```
用户点击文件 → 动态计算步骤：
├─ Office 文件未转换 → [转换] [下载] [打开]
├─ Office 文件已转换，未下载 → [下载] [打开]
├─ Office 文件已转换且已下载 → [打开]
├─ PDF 文件未下载 → [下载] [打开]
├─ PDF 文件已下载 → [打开]
└─ 其他文件 → [下载（如需）] [打开]
```

---

## 📝 修改内容

### 1. 新建组件：`FilePreviewLoadingModal`

**文件**: `app/components/files/file_preview_loading_modal.tsx`

**功能**:
- 显示分步骤进度（转圈动画 + 绿色对勾 + 灰色圆圈）
- 显示文件名
- 支持取消按钮
- 透明遮罩 + 居中卡片样式

**Props**:
```typescript
type FilePreviewLoadingModalProps = {
    visible: boolean;
    fileName: string;
    currentStep: PreviewStep;   // 'idle' | 'converting' | 'downloading' | 'opening' | 'done'
    steps: PreviewStep[];        // 动态步骤列表
    canCancel: boolean;
    onCancel: () => void;
};
```

**界面示例**:
```
┌──────────────────────────────────────┐
│  📄 正在处理文件                      │
│  report.docx                         │
├──────────────────────────────────────┤
│                                      │
│  ✅ 转换文件格式                      │  ← 已完成
│  ⏳ 下载文件...         (转圈动画)   │  ← 当前步骤
│  ○  打开预览                         │  ← 待执行
│                                      │
│  [取消]                              │
│                                      │
└──────────────────────────────────────┘
```

---

### 2. 修改 Hook：`useDownloadFileAndPreview`

**文件**: `app/hooks/files.ts`

#### a) 添加 `triggerConversionAndPoll` 取消支持

```typescript
// 新增 onCancel 参数
const triggerConversionAndPoll = async (
    serverUrl: string,
    fileId: string,
    onCancel?: () => boolean,  // ✅ 新增：返回 true 表示已取消
): Promise<string | null> => {
    // ...
    for (let i = 0; i < 30; i++) {
        // ✅ 每次轮询前检查取消
        if (onCancel?.()) {
            return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // ✅ 等待后再次检查
        if (onCancel?.()) {
            return null;
        }
        // ...
    }
};
```

#### b) 添加动态步骤计算函数

```typescript
// ✅ 新增：根据文件状态计算需要的步骤
const getPreviewSteps = async (file: FileInfo, serverUrl: string): Promise<PreviewStep[]> => {
    const steps: PreviewStep[] = [];
    const ext = (file.extension || '').toLowerCase().replace(/^\./, '');
    const isOffice = isOfficeFile(ext);

    // 1. Office 文件且没有 pdf_preview_id → 需要转换
    if (isOffice && file.id && !file.pdf_preview_id) {
        steps.push('converting');
    }

    // 2. 检查本地是否已有文件 → 决定是否下载
    const downloadFileId = file.pdf_preview_id || file.id;
    if (downloadFileId) {
        const checkFile = file.pdf_preview_id ? {
            ...file, id: file.pdf_preview_id, extension: 'pdf',
        } : file;
        const localPath = getLocalFilePathFromFile(serverUrl, checkFile);
        const exists = await fileExists(localPath);
        if (!exists) {
            steps.push('downloading');
        }
    }

    // 3. 打开预览（总是最后一步）
    steps.push('opening');
    return steps;
};
```

#### c) 重写 `downloadAndPreviewFile` 主流程

```typescript
const downloadAndPreviewFile = useCallback(async (file: FileInfo) => {
    cancelToken.current = false;

    // ✅ 1. 动态计算步骤
    const steps = await getPreviewSteps(file, serverUrl);

    // ✅ 2. 显示 Loading Modal
    setPreviewLoading({
        visible: true,
        fileName: file.name,
        currentStep: steps[0] || 'opening',
        steps,
        canCancel: true,
    });

    // ✅ 3. Office 转换（如需要，带取消检查）
    if (isOffice && file.id && !file.pdf_preview_id) {
        setPreviewLoading(prev => ({...prev, currentStep: 'converting'}));
        const pdfPreviewId = await triggerConversionAndPoll(
            serverUrl, file.id, () => cancelToken.current
        );
        if (cancelToken.current) { hideLoadingModal(); return; }
        // ...
    }

    // ✅ 4. 下载（如需要，带取消检查）
    if (needsDownload) {
        setPreviewLoading(prev => ({...prev, currentStep: 'downloading'}));
        // ... 下载逻辑
        if (cancelToken.current) { deleteAsync(path); hideLoadingModal(); return; }
    }

    // ✅ 5. 打开预览（不可取消）
    setPreviewLoading(prev => ({...prev, currentStep: 'opening', canCancel: false}));
    openDocument(file);
    hideLoadingModal();
}, [...]);
```

#### d) 返回 Modal 组件

```typescript
// ✅ Hook 返回值新增
return {
    downloading,
    progress,
    toggleDownloadAndPreview,
    downloadAndPreviewFile,
    PreviewLoadingModal,           // ✅ 新增：Modal React 元素
    previewLoadingVisible,         // ✅ 新增：可见状态
};
```

---

### 3. 集成到各场景

#### a) 聊天窗口

**文件**: `app/components/files/file.tsx`

```typescript
// ✅ 解构 PreviewLoadingModal
const {downloadAndPreviewFile, PreviewLoadingModal} = useDownloadFileAndPreview(enableSecureFilePreview);

// ✅ 在 return 中渲染
return (
    <>
        {fileComponent}
        {PreviewLoadingModal}
    </>
);
```

**文件**: `app/components/files/document_file.tsx`

```typescript
const {downloadAndPreviewFile, PreviewLoadingModal} = useDownloadFileAndPreview(enableSecureFilePreview);

return (
    <>
        <Document ...>{icon}</Document>
        {PreviewLoadingModal}
    </>
);
```

#### b) 云盘

**文件**: `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx`

```typescript
const {downloadAndPreviewFile, PreviewLoadingModal} = useDownloadFileAndPreview(true);

// 在 FlatList 下方添加
<FlatList .../>
{PreviewLoadingModal}
```

#### c) 知识库主页面

**文件**: `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx`

```typescript
const {downloadAndPreviewFile, PreviewLoadingModal} = useDownloadFileAndPreview(true);

// 在 SafeAreaView 末尾添加
{PreviewLoadingModal}
</SafeAreaView>
```

#### d) 知识库详情页

**文件**: `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx`

```typescript
const {downloadAndPreviewFile, PreviewLoadingModal} = useDownloadFileAndPreview(true);

// 在 ScrollView 下方添加
{PreviewLoadingModal}
</SafeAreaView>
```

---

## 📊 场景对比

| 场景 | 修改前 | 修改后 |
|------|--------|--------|
| **Office 未转换** | 无反馈等待 2-60s | ✅ 立即显示 [转换] [下载] [打开] |
| **Office 已转换** | 无反馈等待下载 | ✅ 立即显示 [下载] [打开]（跳过转换） |
| **Office 已下载** | 直接打开 | ✅ 显示 [打开]（跳过转换和下载） |
| **PDF 未下载** | 无反馈等待下载 | ✅ 立即显示 [下载] [打开] |
| **PDF 已下载** | 直接打开 | ✅ 显示 [打开]（跳过下载） |
| **取消支持** | ❌ 无法取消 | ✅ 转换/下载可取消 |

---

## 🎨 UI 效果

### 场景 1: Office 文件未转换
```
用户点击 report.docx
↓
┌──────────────────────────────────┐
│ 📄 正在处理文件                   │
│ report.docx                      │
├──────────────────────────────────┤
│ ⏳ 转换文件格式...   (转圈)      │
│ ○  下载文件                      │
│ ○  打开预览                      │
│                                  │
│ [取消]                           │
└──────────────────────────────────┘
↓ (转换完成)
┌──────────────────────────────────┐
│ 📄 正在处理文件                   │
│ report.docx                      │
├──────────────────────────────────┤
│ ✅ 转换文件格式                   │
│ ⏳ 下载文件...       (转圈)      │
│ ○  打开预览                      │
│                                  │
│ [取消]                           │
└──────────────────────────────────┘
↓ (下载完成)
┌──────────────────────────────────┐
│ 📄 正在处理文件                   │
│ report.docx                      │
├──────────────────────────────────┤
│ ✅ 转换文件格式                   │
│ ✅ 下载文件                      │
│ ⏳ 打开预览...       (转圈)      │
└──────────────────────────────────┘
↓ (自动打开预览，Modal 关闭)
```

### 场景 2: Office 文件已转换且已下载
```
用户点击 report.docx
↓
┌──────────────────────────────────┐
│ 📄 正在处理文件                   │
│ report.docx                      │
├──────────────────────────────────┤
│ ⏳ 打开预览...       (转圈)      │  ← 只有这一步
└──────────────────────────────────┘
↓ (自动打开预览，Modal 关闭)
```

---

## 🔑 关键代码解析

### 1. 动态步骤计算
```typescript
const getPreviewSteps = async (file, serverUrl) => {
    const steps = [];

    // 检查是否需要转换
    if (isOffice && file.id && !file.pdf_preview_id) {
        steps.push('converting');
    }

    // 检查是否需要下载
    const checkFile = file.pdf_preview_id ? {...file, id: file.pdf_preview_id} : file;
    const localPath = getLocalFilePathFromFile(serverUrl, checkFile);
    if (!await fileExists(localPath)) {
        steps.push('downloading');
    }

    // 打开预览总是最后一步
    steps.push('opening');
    return steps;
};
```

### 2. 取消机制
```typescript
const cancelToken = useRef(false);

// 取消回调
const cancelPreview = useCallback(() => {
    cancelToken.current = true;
}, []);

// 在转换轮询中检查
for (let i = 0; i < 30; i++) {
    if (onCancel?.()) return null;
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (onCancel?.()) return null;
    // ... 轮询
}

// 在下载后检查
if (cancelToken.current) {
    deleteAsync(path, {idempotent: true});
    hideLoadingModal();
    return;
}
```

### 3. Modal 通过 Hook 返回
```typescript
const PreviewLoadingModal = React.createElement(FilePreviewLoadingModal, {
    visible: previewLoading.visible,
    fileName: previewLoading.fileName,
    currentStep: previewLoading.currentStep,
    steps: previewLoading.steps,
    canCancel: previewLoading.canCancel,
    onCancel: cancelPreview,
});

return {
    downloadAndPreviewFile,
    PreviewLoadingModal,  // 调用方直接渲染
};
```

---

## 🧪 测试场景

### 场景 1: Office 文件未转换
1. ✅ 点击 .docx 文件（未转换）
2. ✅ **验证**：立即显示 Modal，三个步骤 [转换] [下载] [打开]
3. ✅ **验证**：转换完成后自动进入下载
4. ✅ **验证**：下载完成后自动打开预览

### 场景 2: Office 文件已转换
1. ✅ 点击 .docx 文件（已有 pdf_preview_id）
2. ✅ **验证**：Modal 只显示两个步骤 [下载] [打开]（跳过转换）
3. ✅ **验证**：下载完成后自动打开

### 场景 3: Office 文件已下载
1. ✅ 再次点击已预览过的 .docx 文件
2. ✅ **验证**：Modal 只显示一个步骤 [打开]
3. ✅ **验证**：几乎瞬间打开预览

### 场景 4: PDF 文件
1. ✅ 点击 .pdf 文件
2. ✅ **验证**：Modal 显示 [下载] [打开]（无转换步骤）
3. ✅ **验证**：下载完成后自动打开

### 场景 5: 取消转换
1. ✅ 点击 .docx 文件（开始转换）
2. ✅ 点击"取消"按钮
3. ✅ **验证**：Modal 关闭，不继续转换

### 场景 6: 取消下载
1. ✅ 点击文件（开始下载）
2. ✅ 点击"取消"按钮
3. ✅ **验证**：Modal 关闭，已下载的部分文件被清理

### 场景 7: 云盘文件预览
1. ✅ 打开云盘
2. ✅ 点击文件
3. ✅ **验证**：显示同样的 Loading Modal
4. ✅ **验证**：行为与聊天窗口一致

### 场景 8: 知识库文件预览
1. ✅ 打开知识库
2. ✅ 点击文件
3. ✅ **验证**：显示同样的 Loading Modal
4. ✅ **验证**：行为与聊天窗口一致

---

## 🎉 总结

### 实现成果
1. ✅ 即时反馈：点击后立即显示 Loading Modal
2. ✅ 动态步骤：根据文件状态智能计算所需步骤
3. ✅ 智能跳过：已转换/已下载的文件跳过对应步骤
4. ✅ 取消支持：转换和下载过程中可以取消
5. ✅ 多场景复用：聊天/云盘/知识库统一体验
6. ✅ 代码复用：核心逻辑只维护一份

### 修改的文件
1. `app/components/files/file_preview_loading_modal.tsx` — **新建** Modal 组件
2. `app/hooks/files.ts` — 修改 hook 支持动态步骤和取消
3. `app/components/files/file.tsx` — 集成 Modal
4. `app/components/files/document_file.tsx` — 集成 Modal
5. `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` — 集成 Modal
6. `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` — 集成 Modal
7. `app/screens/home/apps/knowledge_base/kb_detail_screen.tsx` — 集成 Modal

### 技术亮点
- **动态步骤计算**：`getPreviewSteps` 异步检查文件状态
- **取消令牌**：`cancelToken` ref 实现异步取消
- **React Element 返回**：Hook 直接返回 Modal 组件，调用方无需关心状态
- **步骤状态机**：`idle → converting → downloading → opening → done`

**文件预览 Loading Modal 已在所有场景完成集成！🎉**
