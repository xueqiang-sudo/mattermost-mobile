# Mobile知识库"添加文档"改造方案（修订版）

## 核心理念

**充分利用手机屏幕空间**，在当前选择的tab中显示对应的添加表单，无需额外的三个tab。

## 方案设计

### 当前状态
知识库主屏幕有四个tab：文件、文本、链接、提问

```
┌─────────────────────────────────────┐
│ 知识库                          [+] │  ← 右上角添加按钮
├─────────────────────────────────────┤
│ [文件] [文本] [链接] [提问]          │  ← 这四个tab
├─────────────────────────────────────┤
│                                     │
│  现在的内容列表...                  │
│                                     │
└─────────────────────────────────────┘
```

### 改造后的方案

#### 方案特点
1. **上下文无关**: 点击右上角的 `+` 按钮后，弹出Modal
2. **自适应内容**: Modal中的表单根据当前活跃tab自动适配
3. **屏幕友好**: 不增加额外tab，充分利用Modal空间

#### 工作流程

**场景1：用户在"文件"tab中点击`+`**
```
1. 点击 [+] 按钮
   ↓
2. 弹出Modal，标题："添加文件"
   ┌─────────────────────────┐
   │ 添加文件             [✕]│
   ├─────────────────────────┤
   │                         │
   │ 📄 选择文件              │
   │ （支持：PDF, Word, ...）│
   │ [选择文件按钮]          │
   │                         │
   │ ┌─────────┐ ┌────────┐ │
   │ │ 取消    │ │ 确定   │ │
   │ └─────────┘ └────────┘ │
   └─────────────────────────┘
   ↓
3. 确定后，新文件添加到"文件"tab
```

**场景2：用户在"文本"tab中点击`+`**
```
1. 点击 [+] 按钮
   ↓
2. 弹出Modal，标题："添加文本文档"
   ┌──────────────────────────┐
   │ 添加文本文档          [✕]│
   ├──────────────────────────┤
   │                          │
   │ 标题 *                   │
   │ [_____________ 必填]     │
   │                          │
   │ 内容 *                   │
   │ [_______________         │
   │  _______________  必填]  │
   │ [_______________         │
   │                          │
   │ ┌─────────┐ ┌────────┐  │
   │ │ 取消    │ │ 保存   │  │
   │ └─────────┘ └────────┘  │
   └──────────────────────────┘
   ↓
3. 确定后，新文档添加到"文本"tab
```

**场景3：用户在"链接"tab中点击`+`**
```
1. 点击 [+] 按钮
   ↓
2. 弹出Modal，标题："从链接导入"
   ┌──────────────────────────┐
   │ 从链接导入            [✕]│
   ├──────────────────────────┤
   │                          │
   │ 标题 *                   │
   │ [_____________ 必填]     │
   │                          │
   │ URL *                    │
   │ [_____________ 必填]     │
   │ (示例: https://...)     │
   │                          │
   │ ┌─────────┐ ┌────────┐  │
   │ │ 取消    │ │ 导入   │  │
   │ └─────────┘ └────────┘  │
   └──────────────────────────┘
   ↓
3. 确定后，新链接添加到"链接"tab
```

## 实现方案

### 一、创建改进的Modal组件

**新建文件**: `app/screens/home/apps/knowledge_base/kb_add_doc_modal.tsx`

#### 组件Props

```typescript
interface KBAddDocModalProps {
    visible: boolean;
    activeCategory: 'file' | 'text' | 'url' | 'ask';  // 当前活跃tab
    onClose: () => void;
    onSuccess: () => void;
    serverUrl: string;
    teamId: string;
    intl: IntlShape;
    theme: Theme;
}
```

#### 组件状态

```typescript
// 通用状态
const [isSubmitting, setIsSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);

// 文件tab专用
const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);

// 文本tab专用
const [textTitle, setTextTitle] = useState('');
const [textContent, setTextContent] = useState('');

// 链接tab专用
const [urlTitle, setUrlTitle] = useState('');
const [urlValue, setUrlValue] = useState('');
```

#### Modal标题根据category动态变化

```typescript
const getModalTitle = useCallback(() => {
    switch (activeCategory) {
        case 'file':
            return intl.formatMessage({
                id: 'kb.add_file',
                defaultMessage: '添加文件'
            });
        case 'text':
            return intl.formatMessage({
                id: 'kb.add_text',
                defaultMessage: '添加文本文档'
            });
        case 'url':
            return intl.formatMessage({
                id: 'kb.add_url',
                defaultMessage: '从链接导入'
            });
        default:
            return intl.formatMessage({
                id: 'kb.add_document',
                defaultMessage: '添加文档'
            });
    }
}, [activeCategory, intl]);
```

#### 验证逻辑根据category变化

```typescript
const canSubmit = useCallback(() => {
    if (isSubmitting) return false;
    
    switch (activeCategory) {
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
}, [activeCategory, selectedFile, textTitle, textContent, 
    urlTitle, urlValue, isSubmitting]);
```

#### 提交逻辑根据category调用对应API

```typescript
const handleSubmit = useCallback(async () => {
    if (!canSubmit() || !teamId) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
        switch (activeCategory) {
            case 'file':
                if (selectedFile) {
                    await createKBDocFile(
                        serverUrl, teamId,
                        selectedFile.uri || '',
                        selectedFile.name || 'unknown',
                        selectedFile.mime_type || 'application/octet-stream'
                    );
                }
                break;
            case 'text':
                await createKBDocText(
                    serverUrl, teamId,
                    textTitle.trim(),
                    textContent.trim()
                );
                break;
            case 'url':
                await createKBDocURL(
                    serverUrl, teamId,
                    urlTitle.trim(),
                    urlValue.trim()
                );
                break;
        }
        
        // 成功后关闭Modal并刷新
        dismissModal({componentId: 'kb_add_modal'});
        onSuccess?.();
        
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add document');
    } finally {
        setIsSubmitting(false);
    }
}, [activeCategory, selectedFile, textTitle, textContent, urlTitle, urlValue, 
    teamId, serverUrl, canSubmit]);
```

#### 渲染逻辑 - 根据category显示对应表单

```typescript
const renderContent = useCallback(() => {
    return (
        <View style={style.content}>
            {error && (
                <View style={style.errorBox}>
                    <Text style={style.errorText}>{error}</Text>
                </View>
            )}
            
            {activeCategory === 'file' && (
                <View>
                    <Text style={style.hint}>
                        {intl.formatMessage({
                            id: 'kb.supported_formats',
                            defaultMessage: '支持格式: PDF, Word, Excel, CSV, PowerPoint, TXT, Markdown, HTML, RTF, JSON, YAML, 代码文件, EML, MSG, 图片, EPUB, ODT'
                        })}
                    </Text>
                    <TouchableOpacity
                        style={style.fileButton}
                        onPress={() => showFilePickerFor('file')}
                    >
                        <CompassIcon name='plus' size={18} color={theme.buttonBg}/>
                        <Text style={style.fileButtonText}>
                            {intl.formatMessage({
                                id: 'kb.select_file',
                                defaultMessage: '选择文件'
                            })}
                        </Text>
                    </TouchableOpacity>
                    {selectedFile && (
                        <View style={style.fileSelected}>
                            <CompassIcon name='paperclip' size={16}/>
                            <Text style={style.fileSelectedText}>
                                {selectedFile.name} ({formatFileSize(selectedFile.size)})
                            </Text>
                        </View>
                    )}
                </View>
            )}
            
            {activeCategory === 'text' && (
                <View>
                    <Text style={style.label}>
                        {intl.formatMessage({id: 'kb.title', defaultMessage: '标题'})} *
                    </Text>
                    <TextInput
                        style={style.input}
                        placeholder={intl.formatMessage({
                            id: 'kb.title_placeholder',
                            defaultMessage: '请输入标题'
                        })}
                        value={textTitle}
                        onChangeText={setTextTitle}
                    />
                    
                    <Text style={style.label}>
                        {intl.formatMessage({id: 'kb.content', defaultMessage: '内容'})} *
                    </Text>
                    <TextInput
                        style={[style.input, style.textArea]}
                        placeholder={intl.formatMessage({
                            id: 'kb.content_placeholder',
                            defaultMessage: '输入文档内容...'
                        })}
                        value={textContent}
                        onChangeText={setTextContent}
                        multiline={true}
                    />
                </View>
            )}
            
            {activeCategory === 'url' && (
                <View>
                    <Text style={style.label}>
                        {intl.formatMessage({id: 'kb.title', defaultMessage: '标题'})} *
                    </Text>
                    <TextInput
                        style={style.input}
                        placeholder={intl.formatMessage({
                            id: 'kb.title_placeholder',
                            defaultMessage: '请输入标题'
                        })}
                        value={urlTitle}
                        onChangeText={setUrlTitle}
                    />
                    
                    <Text style={style.label}>URL *</Text>
                    <TextInput
                        style={style.input}
                        placeholder='https://example.com'
                        value={urlValue}
                        onChangeText={setUrlValue}
                        keyboardType='url'
                    />
                </View>
            )}
        </View>
    );
}, [activeCategory, selectedFile, textTitle, textContent, urlTitle, urlValue, error, theme, intl]);
```

### 二、修改knowledge_base_screen.tsx

#### 2.1 导入新Modal

```typescript
import KBAddDocModal from './kb_add_doc_modal';
```

#### 2.2 添加Modal状态

```typescript
const [showAddModal, setShowAddModal] = useState(false);
```

#### 2.3 修改右上角"添加文档"按钮

```typescript
{kbWrite && (
    <TouchableOpacity 
        style={style.headerAction} 
        onPress={() => setShowAddModal(true)}  // ← 改为显示Modal
    >
        <CompassIcon name='plus' size={24} color={theme.sidebarText}/>
    </TouchableOpacity>
)}
```

#### 2.4 在底部添加Modal渲染

```typescript
{showAddModal && (
    <KBAddDocModal
        visible={showAddModal}
        activeCategory={activeCategory}  // ← 传递当前tab
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
            setShowAddModal(false);
            loadDocuments();
        }}
        serverUrl={serverUrl}
        teamId={teamId}
        intl={intl}
        theme={theme}
    />
)}
```

## UI效果

### 文件tab中添加

```
主屏幕（文件tab）                  点击+ 后

┌──────────────────────┐         ┌──────────────────────┐
│ 知识库            [+]│   →    │ 添加文件          [✕]│
├──────────────────────┤         ├──────────────────────┤
│[文件][文本][链接]...│         │                      │
├──────────────────────┤         │ 支持: PDF, Word...  │
│ 文档列表...          │         │ [选择文件按钮]      │
│                      │         │ 已选: doc.pdf       │
│                      │         │                      │
│                      │         │ ┌────────┐ ┌──────┐│
│                      │         │ │ 取消   │ │ 确定 ││
│                      │         │ └────────┘ └──────┘│
└──────────────────────┘         └──────────────────────┘
```

### 文本tab中添加

```
主屏幕（文本tab）                  点击+ 后

┌──────────────────────┐         ┌──────────────────────┐
│ 知识库            [+]│   →    │ 添加文本文档      [✕]│
├──────────────────────┤         ├──────────────────────┤
│[文件][文本][链接]...│         │                      │
├──────────────────────┤         │ 标题 *               │
│ 文档列表...          │         │ [______________]    │
│                      │         │                      │
│                      │         │ 内容 *               │
│                      │         │ [______________      │
│                      │         │  ______________ ]   │
│                      │         │                      │
│                      │         │ ┌────────┐ ┌──────┐│
│                      │         │ │ 取消   │ │ 保存 ││
│                      │         │ └────────┘ └──────┘│
└──────────────────────┘         └──────────────────────┘
```

### 链接tab中添加

```
主屏幕（链接tab）                  点击+ 后

┌──────────────────────┐         ┌──────────────────────┐
│ 知识库            [+]│   →    │ 从链接导入        [✕]│
├──────────────────────┤         ├──────────────────────┤
│[文件][文本][链接]...│         │                      │
├──────────────────────┤         │ 标题 *               │
│ 文档列表...          │         │ [______________]    │
│                      │         │                      │
│                      │         │ URL *                │
│                      │         │ [https://example]   │
│                      │         │                      │
│                      │         │ ┌────────┐ ┌──────┐│
│                      │         │ │ 取消   │ │ 导入 ││
│                      │         │ └────────┘ └──────┘│
└──────────────────────┘         └──────────────────────┘
```

## 关键优势

✅ **屏幕友好** - 不增加额外tab，充分利用Modal空间  
✅ **上下文相关** - Modal内容与当前tab同步  
✅ **用户友好** - 用户不需要理解复杂的tab切换  
✅ **维护简单** - 单一Modal处理所有情况  
✅ **扩展灵活** - 未来可轻松添加其他类型文档  

## 实现步骤

### Step 1: 创建kb_add_doc_modal.tsx
- [ ] 新建文件
- [ ] 实现通用Modal框架
- [ ] 根据activeCategory渲染对应表单
- [ ] 实现验证和提交逻辑
- [ ] 添加完整的styles

### Step 2: 修改knowledge_base_screen.tsx
- [ ] 导入KBAddDocModal
- [ ] 添加showAddModal状态
- [ ] 修改"+"按钮的onPress
- [ ] 添加Modal渲染
- [ ] 测试Modal显示和关闭

### Step 3: 测试验证
- [ ] 在不同tab中点击"+"按钮
- [ ] 验证Modal标题和内容正确
- [ ] 验证各类型文档创建成功
- [ ] 验证category标记正确

## 文件变更清单

### 已完成 ✅
```
app/screens/home/apps/workbench_api.ts
  - createKBDocFile: +category: 'file', +debugLog
  - createKBDocText: +category: 'text', +debugLog
  - createKBDocURL: +category: 'url', +debugLog
  - uploadKBFile: +debugLog
```

### 新增 (建议)
```
app/screens/home/apps/knowledge_base/kb_add_doc_modal.tsx
  - 单一Modal处理所有三种添加方式
```

### 修改 (建议)
```
app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx
  - 导入新Modal
  - 修改"+"按钮
  - 添加Modal渲染
```

## 工作量评估

- **创建Modal**: ~250-300行代码，1-1.5小时
- **修改主屏幕**: ~30-40行代码，20分钟
- **测试验证**: 30分钟

**总计**: 2小时

## 与原方案的对比

| 特性 | 原方案（三tab） | 新方案（单Modal） |
|------|---------------|-----------------|
| 屏幕利用 | ⚠️ 浪费空间 | ✅ 充分利用 |
| 学习成本 | 中等 | 低 |
| 代码复杂度 | 中等 | 低 |
| 维护难度 | 中等 | 低 |
| 扩展性 | 好 | 很好 |
| 用户体验 | 一般 | 优秀 |
| 手机适配 | 一般 | 优秀 |

## 总结

这个改进方案充分考虑了移动设备的屏幕限制，通过在单一Modal中根据当前tab动态适配表单内容，既保持了功能完整性，又提供了更优的用户体验。
