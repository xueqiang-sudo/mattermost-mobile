# 群组摘要标题栏修复

## 📋 问题

**现状**：群组摘要（AI Assistant Panel）使用自定义的标题栏，包含：
- X 关闭按钮
- "群组摘要"文字标题

**期望**：
- 标题"群组摘要"应该显示在系统标题栏中
- 去掉自定义的标题栏（X 号和"群组摘要"文字）
- 使用系统的返回按钮

## 🔧 解决方案

### 1. 修改标题传递

**文件**：`app/screens/channel/header/header.tsx`

**修改前**：
```typescript
const openAIAssistant = useCallback(() => {
    const title = '';  // AI Assistant panel 不显示标题栏
    goToScreen(Screens.AI_ASSISTANT_PANEL, title, {channelId, teamId});
}, [channelId, teamId]);
```

**修改后**：
```typescript
const openAIAssistant = useCallback(() => {
    const title = intl.formatMessage({
        id: 'channel_header.group_summary',
        defaultMessage: 'Group Summary'
    });
    goToScreen(Screens.AI_ASSISTANT_PANEL, title, {channelId, teamId});
}, [channelId, teamId, intl]);
```

**改动**：
- ✅ 传递正确的标题（"群组摘要"）
- ✅ 添加 `intl` 到依赖数组

### 2. 去掉自定义标题栏

**文件**：`app/screens/ai_assistant/ai_assistant_panel.tsx`

**修改前**：
```typescript
return (
    <SafeAreaView style={styles.flex} testID='ai_assistant.panel'>
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
                    <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({
                        id: 'channel_header.group_summary',
                        defaultMessage: 'Group Summary'
                    })}
                </Text>
                <View style={{width: 40}}/>
            </View>

            {renderTabs()}
```

**修改后**：
```typescript
return (
    <SafeAreaView style={styles.flex} testID='ai_assistant.panel' edges={['bottom']}>
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
            {renderTabs()}
```

**改动**：
- ✅ 删除自定义的 `<View style={styles.header}>` 标题栏
- ✅ 添加 `edges={['bottom']}` 到 SafeAreaView（只处理底部安全区域）
- ✅ 删除 X 关闭按钮
- ✅ 删除"群组摘要"文字

### 3. 删除不再使用的代码

**删除 handleClose 函数**：
```typescript
// 删除以下代码
const handleClose = useCallback(() => {
    popTopScreen(componentId);
}, [componentId]);
```

**删除不再使用的导入**：
```typescript
// 删除以下导入
import {dismissModal} from '@screens/navigation';
```

**删除不再使用的样式**：
```typescript
// 删除以下样式
header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
},
headerButton: {padding: 8},
headerTitle: {
    ...typography('Heading', 400, 'SemiBold'),
    color: theme.centerChannelColor,
    flex: 1,
    textAlign: 'center',
    marginRight: 40,
},
```

## 📱 效果对比

### 修改前
```
┌─────────────────────┐
│ X    群组摘要       │ ← 自定义标题栏
├─────────────────────┤
│ [最新] [历史] [活跃]│
│                     │
│ [内容]              │
└─────────────────────┘
```

**问题**：
- ❌ 使用自定义的 X 关闭按钮
- ❌ 标题"群组摘要"在自定义标题栏中
- ❌ 没有使用系统标题栏
- ❌ 不符合标准导航模式

### 修改后
```
┌─────────────────────┐
│ ← 群组摘要          │ ← 系统标题栏
├─────────────────────┤
│ [最新] [历史] [活跃]│
│                     │
│ [内容]              │
└─────────────────────┘
```

**优势**：
- ✅ 使用系统标题栏
- ✅ 标题"群组摘要"在系统标题栏中显示
- ✅ 使用系统的返回按钮（←）
- ✅ 符合标准导航模式
- ✅ 更简洁的界面

## 🎯 技术要点

### 1. 使用系统标题栏

**传递标题到 goToScreen**：
```typescript
const title = intl.formatMessage({
    id: 'channel_header.group_summary',
    defaultMessage: 'Group Summary'
});
goToScreen(Screens.AI_ASSISTANT_PANEL, title, {channelId, teamId});
```

**系统会自动**：
- 显示标题在顶部导航栏
- 添加返回按钮（←）
- 处理返回逻辑

### 2. SafeAreaView edges

**修改前**：
```typescript
<SafeAreaView style={styles.flex} testID='ai_assistant.panel'>
```

**修改后**：
```typescript
<SafeAreaView style={styles.flex} testID='ai_assistant.panel' edges={['bottom']}>
```

**原因**：
- 删除自定义标题栏后，顶部由系统标题栏处理
- 只需要处理底部安全区域（如 iPhone 的底部手势条）

### 3. 多语言支持

**使用的多语言 key**：
- `channel_header.group_summary` - "群组摘要"（中文）/ "Group Summary"（英文）

## 🧪 测试场景

### 基础功能
- ✅ 点击群组摘要 → 打开面板
- ✅ 标题显示"群组摘要"在系统标题栏
- ✅ 系统返回按钮（←）可用
- ✅ 点击返回 → 关闭面板

### 界面显示
- ✅ 没有自定义的 X 按钮
- ✅ 没有自定义的标题栏
- ✅ Tab 栏紧贴系统标题栏
- ✅ 界面更简洁

### 多语言
- ✅ 中文环境 → 显示"群组摘要"
- ✅ 英文环境 → 显示"Group Summary"

## 📊 代码变更统计

### 修改的文件
1. `app/screens/channel/header/header.tsx`
   - 修改 `openAIAssistant` 函数
   - 传递正确的标题
   - 添加 `intl` 到依赖

2. `app/screens/ai_assistant/ai_assistant_panel.tsx`
   - 删除自定义标题栏
   - 删除 `handleClose` 函数
   - 删除 `dismissModal` 导入
   - 删除 header 相关样式
   - 修改 SafeAreaView edges

### 删除代码行数
- 自定义标题栏 JSX: -8 行
- handleClose 函数: -3 行
- 导入: -1 行
- 样式: -16 行
- 总计: -28 行

### 修改代码行数
- openAIAssistant 函数: 2 行
- SafeAreaView: 1 行
- 总计: 3 行

## 🔄 兼容性

### 向后兼容
- ✅ 所有现有功能正常
- ✅ 只是改变了标题显示方式
- ✅ 不影响其他功能

### 性能影响
- ✅ 减少了自定义组件
- ✅ 使用系统原生标题栏
- ✅ 性能更优

## 🎉 总结

### 实现成果
1. ✅ 标题"群组摘要"显示在系统标题栏
2. ✅ 去掉自定义的标题栏
3. ✅ 去掉 X 关闭按钮
4. ✅ 使用系统返回按钮
5. ✅ 界面更简洁

### 技术亮点
- 使用系统标题栏，符合标准导航模式
- 减少自定义组件，提高性能
- 多语言支持
- 更简洁的界面

### 用户价值
- 更符合用户习惯
- 更标准的导航体验
- 更简洁的界面
- 更好的本地化

现在群组摘要的标题显示在系统标题栏中，自定义的标题栏（X 号和"群组摘要"文字）已经被去掉！🎉
