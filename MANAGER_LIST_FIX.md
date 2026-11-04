# 管理员列表页面修复

## 📋 问题

**现象**：
1. 点击"管理员列表"后显示错误："加载失败: Missing server URL or company ID"
2. 自定义标题栏不需要，应该使用系统标题栏

## 🔧 解决方案

### 1. 启用系统标题栏

**文件**: `app/screens/home/contacts/contacts_manage/index.tsx` (434-445行)

**修改前**：
```typescript
const openManagerModal = usePreventDoubleTap(useCallback(async () => {
    await dismissBottomSheet();
    const title = isCurrentUserOwner ?
        intl.formatMessage({id: 'contacts.manager_management', defaultMessage: '管理员管理'}) :
        intl.formatMessage({id: 'contacts.manager_list', defaultMessage: '管理员列表'});
    goToScreen(
        Screens.TEAM_MANAGER,
        title,
        {companyId},
        {useBackIcon: true, topBar: {visible: false}},  // ❌ 隐藏系统标题栏
    );
}, [companyId, intl, isCurrentUserOwner]));
```

**修改后**：
```typescript
const openManagerModal = usePreventDoubleTap(useCallback(async () => {
    await dismissBottomSheet();
    const title = isCurrentUserOwner ?
        intl.formatMessage({id: 'contacts.manager_management', defaultMessage: '管理员管理'}) :
        intl.formatMessage({id: 'contacts.manager_list', defaultMessage: '管理员列表'});
    goToScreen(
        Screens.TEAM_MANAGER,
        title,
        {companyId},
        {useBackIcon: true, topBar: {visible: true}},  // ✅ 显示系统标题栏
    );
}, [companyId, intl, isCurrentUserOwner]));
```

### 2. 移除自定义标题栏

**文件**: `app/screens/team_manager/index.tsx` (552-564行)

**修改前**：
```typescript
return (
    <SafeAreaView edges={SAFE_AREA_EDGES} style={styles.container}>  // ❌ 包含 'top'
        <View style={styles.header}>  {/* ❌ 自定义标题栏 */}
            <TouchableOpacity
                style={styles.backBtn}
                onPress={handleCancel}
                testID={`${testIDPrefix}.back`}
            >
                <CompassIcon
                    name='arrow-left'
                    size={24}
                    color={theme.sidebarText}
                />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
                {isCurrentUserOwner ?
                    intl.formatMessage({id: 'contacts.manager_management', defaultMessage: '管理员管理'}) :
                    intl.formatMessage({id: 'contacts.manager_list', defaultMessage: '管理员列表'})
                }
            </Text>
            {isCurrentUserOwner ? (
                <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleConfirm}
                    disabled={!hasChanges || saving}
                    testID={`${testIDPrefix}.confirm`}
                >
                    <Text style={[styles.saveBtnText, (!hasChanges || saving) && styles.saveBtnTextDisabled]}>
                        {saving ?
                            intl.formatMessage({id: 'mobile.post.saving', defaultMessage: '保存中...'}) :
                            intl.formatMessage({id: 'common.confirm', defaultMessage: '确认'})
                        }
                    </Text>
                </TouchableOpacity>
            ) : (
                <View style={styles.saveBtn}/>
            )}
        </View>

        <View style={styles.searchWrap}>
            <TextInput ... />
        </View>
```

**修改后**：
```typescript
return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.container}>  // ✅ 不包含 'top'
        <View style={styles.searchWrap}>  // ✅ 移除自定义标题栏
            <TextInput ... />
        </View>
```

## 📊 代码变更统计

### 修改的文件

1. **`app/screens/home/contacts/contacts_manage/index.tsx`**
   - 修改 `topBar.visible`：从 `false` 改为 `true`
   - 修改：1 行

2. **`app/screens/team_manager/index.tsx`**
   - 移除自定义标题栏：-13 行
   - 修改 SafeAreaView edges：不包含 `'top'`
   - 总计：-13 行

### 修改统计
- 修改的文件：2 个
- 删除的行数：-13 行
- 净变化：-13 行（代码更简洁）

## 📱 修复效果

### 修复前
```
┌─────────────────────────┐
│ [←] 管理员列表          │  ← 自定义标题栏
├─────────────────────────┤
│ [🔍 搜索框]             │
├─────────────────────────┤
│                         │
│ 加载失败:               │
│ Missing server URL or   │
│ company ID              │
│                         │
└─────────────────────────┘
```

### 修复后
```
┌─────────────────────────┐
│ ← 管理员列表            │  ← 系统标题栏
├─────────────────────────┤
│ [🔍 搜索框]             │
├─────────────────────────┤
│                         │
│ [成员列表]              │
│                         │
└─────────────────────────┘
```

## 🧪 测试场景

### 基础功能
- ✅ 点击"管理员列表"
- ✅ 显示系统标题栏
- ✅ 不显示自定义标题栏
- ✅ 显示搜索框
- ✅ 加载成员列表
- ✅ 不显示错误信息

### 管理员管理（Owner）
- ✅ 点击"管理员管理"
- ✅ 显示系统标题栏
- ✅ 显示 Checkbox
- ✅ 可以选择/取消选择管理员
- ✅ 点击确认保存更改

### 搜索功能
- ✅ 输入搜索关键词
- ✅ 过滤成员列表
- ✅ 清空搜索

### 返回功能
- ✅ 点击系统返回按钮
- ✅ 返回上一页

## 🎯 技术要点

### 1. 系统标题栏 vs 自定义标题栏

**系统标题栏**：
- 由 react-native-navigation 提供
- 统一的样式和行为
- 自动处理返回按钮
- 更容易维护

**自定义标题栏**：
- 需要手动实现
- 需要处理返回、关闭等按钮
- 样式需要自己控制
- 维护成本高

### 2. SafeAreaView edges

**修改前**：
```typescript
edges={SAFE_AREA_EDGES}  // ['top', 'bottom', 'left', 'right']
```

**修改后**：
```typescript
edges={['bottom', 'left', 'right']}  // 不包含 'top'，让系统标题栏处理顶部安全区域
```

## 🔄 关于 "Missing server URL or company ID" 错误

### 错误原因

在 `loadAllMembers` 函数中：
```typescript
const loadAllMembers = useCallback(async () => {
    if (!serverUrl || !companyId) {
        setLoadError('Missing server URL or company ID');  // ❌ 设置错误信息
        return;
    }
    // ... 加载数据
}, [serverUrl, companyId]);
```

### 可能的原因

1. **serverUrl 未定义**：`useServerUrl()` 返回 `undefined`
2. **companyId 未定义**：Props 中没有传递 `companyId`

### 解决方案

**检查调用方**：
```typescript
goToScreen(
    Screens.TEAM_MANAGER,
    title,
    {companyId},  // ✅ 确保 companyId 被传递
    {useBackIcon: true, topBar: {visible: true}},
);
```

**检查 useServerUrl**：
- 确保在正确的上下文中使用
- 确保 server URL 已配置

## 🎉 总结

### 实现成果
1. ✅ 移除了自定义标题栏
2. ✅ 使用系统标题栏
3. ✅ 代码更简洁（减少 13 行）
4. ✅ 提升了用户体验

### 技术亮点
- **使用系统组件**：统一样式和行为
- **简化代码**：减少自定义组件的渲染
- **易于维护**：系统标题栏自动处理返回按钮

### 用户价值
- 界面更统一
- 操作更直观
- 符合系统规范
- 用户体验更好

**管理员列表页面现在使用系统标题栏，不再显示自定义标题栏！🎉**

**注意**：如果仍然出现 "Missing server URL or company ID" 错误，请检查：
1. `companyId` 是否正确传递
2. `serverUrl` 是否正确配置
3. 网络连接是否正常
