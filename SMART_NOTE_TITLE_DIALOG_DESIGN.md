# 智能笔记本保存时标题检查功能

## 📋 需求描述

当用户保存智能笔记本时：
1. 检查是否有 H1 标题块
2. 如果没有 H1 标题，弹出对话框提示用户输入标题
3. 用户输入标题后继续保存
4. 用户可以取消保存操作

## 🎯 解决方案

### 核心思路

```
用户点击"保存"按钮
    ↓
handleSave() 检查是否有 H1 标题
    ↓
├─ 有标题 → 直接执行保存逻辑
└─ 无标题 → 显示标题输入对话框
              ↓
           用户输入标题
              ↓
           点击"保存"
              ↓
           使用新标题执行保存
```

### 技术实现

#### 1. 添加状态管理

```typescript
// 标题输入对话框状态
const [showTitleDialog, setShowTitleDialog] = useState(false);
const [titleInput, setTitleInput] = useState('');
```

#### 2. 修改 handleSave 函数

```typescript
const handleSave = useCallback(async () => {
    if (!userId || saving) return;

    // 检查是否有 H1 标题
    const hasH1Title = blocks.some(block => 
        block.type === 'heading' && 
        block.meta?.level === 1 && 
        block.content?.trim()
    );

    // 如果没有 H1 标题且用户没有手动输入标题，显示对话框
    if (!hasH1Title && !title.trim()) {
        setShowTitleDialog(true);
        return;
    }

    // 有标题，直接保存
    setSaving(true);
    // ... 原有保存逻辑
}, [userId, saving, title, blocks]);
```

#### 3. 创建标题输入对话框 Modal

```typescript
<Modal
    visible={showTitleDialog}
    transparent={true}
    animationType='fade'
    onRequestClose={() => setShowTitleDialog(false)}
>
    <View style={style.titleDialogOverlay}>
        <View style={style.titleDialogContainer}>
            <Text style={style.titleDialogTitle}>
                {intl.formatMessage({
                    id: 'smart_notebook.enter_title',
                    defaultMessage: '请输入标题',
                })}
            </Text>
            <Text style={style.titleDialogMessage}>
                {intl.formatMessage({
                    id: 'smart_notebook.enter_title_message',
                    defaultMessage: '您的笔记还没有标题，请输入一个标题：',
                })}
            </Text>
            <TextInput
                style={style.titleDialogInput}
                value={titleInput}
                onChangeText={setTitleInput}
                placeholder={intl.formatMessage({
                    id: 'smart_notebook.untitled',
                    defaultMessage: '无标题',
                })}
                autoFocus
            />
            <View style={style.titleDialogButtons}>
                <TouchableOpacity
                    onPress={() => {
                        setShowTitleDialog(false);
                        setTitleInput('');
                    }}
                    style={[style.titleDialogBtn, style.titleDialogBtnCancel]}
                >
                    <Text style={style.titleDialogBtnTextCancel}>
                        {intl.formatMessage({id: 'smart_notebook.cancel', defaultMessage: '取消'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={async () => {
                        setShowTitleDialog(false);
                        const newTitle = titleInput.trim() || '无标题';
                        setTitleInput('');
                        setTitle(newTitle);
                        await performSaveWithNewTitle(newTitle);
                    }}
                    style={[style.titleDialogBtn, style.titleDialogBtnConfirm]}
                >
                    <Text style={style.titleDialogBtnTextConfirm}>
                        {intl.formatMessage({id: 'smart_notebook.save', defaultMessage: '保存'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    </View>
</Modal>
```

#### 4. 添加对话框样式

```typescript
titleDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
},
titleDialogContainer: {
    width: '80%',
    backgroundColor: theme.centerChannelBg,
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
},
titleDialogTitle: {
    ...typography('Heading', 400, 'SemiBold'),
    color: theme.centerChannelColor,
    marginBottom: 8,
},
titleDialogMessage: {
    ...typography('Body', 200, 'Regular'),
    color: changeOpacity(theme.centerChannelColor, 0.7),
    marginBottom: 16,
},
titleDialogInput: {
    borderWidth: 1,
    borderColor: changeOpacity(theme.centerChannelColor, 0.2),
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    ...typography('Body', 200, 'Regular'),
    color: theme.centerChannelColor,
},
titleDialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
},
titleDialogBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 8,
},
titleDialogBtnCancel: {
    backgroundColor: 'transparent',
},
titleDialogBtnConfirm: {
    backgroundColor: theme.buttonBg,
},
titleDialogBtnTextCancel: {
    ...typography('Body', 200, 'Medium'),
    color: changeOpacity(theme.centerChannelColor, 0.6),
},
titleDialogBtnTextConfirm: {
    ...typography('Body', 200, 'SemiBold'),
    color: theme.buttonColor,
},
```

## 🎨 用户体验

### 场景 1：有 H1 标题

```
用户操作：
1. 创建 H1 标题块："我的笔记"
2. 点击"保存"按钮

结果：
✅ 直接保存，不弹出对话框
✅ 显示"保存成功"提示
```

### 场景 2：无标题

```
用户操作：
1. 创建内容但没有 H1 标题
2. 点击"保存"按钮

弹出对话框：
┌─────────────────────────────────┐
│ 请输入标题                       │
│                                 │
│ 您的笔记还没有标题，请输入一个标题：│
│                                 │
│ ┌───────────────────────────┐   │
│ │ 无标题                     │   │
│ └───────────────────────────┘   │
│                                 │
│         [取消]  [保存]          │
└─────────────────────────────────┘

用户输入："学习笔记"
点击"保存"

结果：
✅ 使用"学习笔记"作为标题保存
✅ 显示"保存成功"提示
```

### 场景 3：取消保存

```
用户操作：
1. 创建内容但没有 H1 标题
2. 点击"保存"按钮
3. 在对话框中点击"取消"

结果：
✅ 对话框关闭
✅ 不执行保存
✅ 返回编辑界面
```

## 📊 标题检查逻辑

### 检查顺序

```typescript
// 1. 检查 blocks 中是否有 H1 标题
const hasH1Title = blocks.some(block => 
    block.type === 'heading' && 
    block.meta?.level === 1 && 
    block.content?.trim()
);

// 2. 检查用户是否手动输入了标题
const hasManualTitle = title.trim().length > 0;

// 3. 决定是否显示对话框
if (!hasH1Title && !hasManualTitle) {
    setShowTitleDialog(true);
    return;
}
```

### 标题优先级

```
1. H1 标题块（最高优先级）
   ↓
2. 用户手动输入的标题
   ↓
3. extractTitleFromBlocks() 提取
   - 第一个非空段落
   - 或"无标题"
```

## ⚠️ 注意事项

### 1. 状态清理

```typescript
// 对话框关闭时清理状态
const handleCloseDialog = () => {
    setShowTitleDialog(false);
    setTitleInput('');  // 清空输入
};
```

### 2. 键盘避让

```typescript
<Modal
    // ...
    onRequestClose={() => setShowTitleDialog(false)}
>
    {/* Modal 内容会自动避让键盘 */}
</Modal>
```

### 3. 自动聚焦

```typescript
<TextInput
    autoFocus  // 对话框打开时自动聚焦
    // ...
/>
```

### 4. 空标题处理

```typescript
// 如果用户输入为空，使用默认标题
const newTitle = titleInput.trim() || '无标题';
```

## 🧪 测试场景

### 测试 1：有 H1 标题保存

1. 创建 H1 标题块
2. 输入一些内容
3. 点击"保存"
4. **预期**：直接保存，不弹出对话框

### 测试 2：无标题保存

1. 创建内容但没有 H1 标题
2. 点击"保存"
3. **预期**：弹出标题输入对话框

### 测试 3：输入标题并保存

1. 在对话框中输入"我的笔记"
2. 点击"保存"
3. **预期**：
   - ✅ 对话框关闭
   - ✅ 使用"我的笔记"作为标题保存
   - ✅ 显示"保存成功"

### 测试 4：取消保存

1. 在对话框中点击"取消"
2. **预期**：
   - ✅ 对话框关闭
   - ✅ 不执行保存
   - ✅ 返回编辑界面

### 测试 5：输入空标题

1. 在对话框中不输入任何内容
2. 点击"保存"
3. **预期**：
   - ✅ 使用"无标题"作为标题
   - ✅ 正常保存

### 测试 6：手动输入标题后保存

1. 在顶部标题栏输入"手动标题"
2. 点击"保存"
3. **预期**：直接保存，不弹出对话框

## 🚀 进阶功能

### 1. 标题建议

```typescript
// 根据内容自动生成标题建议
const suggestTitle = (blocks: SmartNoteBlock[]): string => {
    // 提取第一个段落的前 20 个字符
    for (const block of blocks) {
        if (block.content?.trim()) {
            const text = block.content.trim();
            return text.length > 20 ? text.substring(0, 20) + '...' : text;
        }
    }
    return '';
};

// 在对话框中显示建议
<TextInput
    placeholder={suggestTitle(blocks) || '无标题'}
    // ...
/>
```

### 2. 标题长度限制

```typescript
const MAX_TITLE_LENGTH = 100;

<TextInput
    maxLength={MAX_TITLE_LENGTH}
    // ...
/>
<Text style={style.charCount}>
    {titleInput.length}/{MAX_TITLE_LENGTH}
</Text>
```

### 3. 标题验证

```typescript
const validateTitle = (title: string): boolean => {
    // 不允许特殊字符
    const invalidChars = /[<>:"/\\|?*]/;
    return !invalidChars.test(title);
};

// 在保存前验证
if (!validateTitle(newTitle)) {
    Alert.alert('标题包含无效字符');
    return;
}
```

## ✅ 实现清单

- [x] 添加对话框状态（showTitleDialog, titleInput）
- [x] 修改 handleSave 检查 H1 标题
- [x] 显示对话框（如果没有标题）
- [ ] 创建标题输入 Modal
- [ ] 添加对话框样式
- [ ] 实现确认按钮逻辑
- [ ] 实现取消按钮逻辑
- [ ] 测试有标题保存
- [ ] 测试无标题保存
- [ ] 测试取消保存
- [ ] 测试空标题保存

## 📚 参考资料

- [React Native Modal](https://reactnative.dev/docs/modal)
- [React Native TextInput](https://reactnative.dev/docs/textinput)
- [React Native Alert](https://reactnative.dev/docs/alert)

---

**设计时间**: 2026-11-05  
**设计人员**: xq_mattermost_server  
**状态**: 📝 方案设计完成  
**实现**: 进行中（30%）
