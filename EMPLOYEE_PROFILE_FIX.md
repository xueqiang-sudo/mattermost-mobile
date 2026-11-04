# 员工资料页崩溃和显示问题修复

## 📋 问题描述

### 问题 1: 员工资料页崩溃
**错误信息**：`Cannot read property 'nickname' of undefined`

**原因**：当 `employee` prop 为 undefined 时，组件内的 hooks 和回调函数直接访问 `employee.nickname`、`employee.id` 等属性导致崩溃。

**影响范围**：
- 企业通讯录点击员工
- 外部联系人点击联系人

### 问题 2: 昵称重复显示
**现象**：昵称显示为 "test(test)"，即 "昵称(昵称)" 的重复格式

**原因**：`username2Nickname` 函数在 `nickname` 和 `fullName` 相同时仍然拼接两个名称。

## 🔧 修复方案

### 1. 员工资料页崩溃修复

#### 1.1 修改 Props 类型
```typescript
type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    employee?: UserProfile;  // 改为可选
    // ...
};
```

#### 1.2 在所有 hooks 之后添加 early return
```typescript
// 保护：如果 employee 未定义，显示错误信息（必须在所有 hooks 之后）
if (!employee) {
    return (
        <SafeAreaView style={styles.flex} edges={SAFE_AREA_EDGES}>
            <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32}}>
                <CompassIcon name='alert-circle-outline' size={64} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                <Text style={{...typography('Body', 200), color: theme.centerChannelColor, marginTop: 16, textAlign: 'center'}}>
                    {intl.formatMessage({id: 'contacts.employee_not_found', defaultMessage: '员工信息不存在，请返回重试'})}
                </Text>
            </View>
        </SafeAreaView>
    );
}
```

#### 1.3 在所有 hooks 中添加 employee 检查
```typescript
// handleSaveProfile
if (!serverUrl || saving || !employee) {
    return;
}

// loadCompanyOwner useEffect
if (!companyIdProp || !serverUrl || !employee) {
    // ...
    return;
}

// loadRoles useEffect
if (!companyIdProp || !serverUrl || !employee) {
    return;
}

// handleSaveRoles
if (!companyIdProp || !serverUrl || !employee) {
    return;
}

// updateRelationFields
if (!relationType || !currentUserId || !employee) {
    return false;
}

// resolveMattermostUser
if (!serverUrl || !employee) {
    return null;
}

// handleDeleteMember
if (!canDeleteEnterpriseMember || deleting || !employee) {
    return;
}

// handleCopyBasicInfo
if (!employee) {
    return;
}

// handleChangeDepartment
if (!canChangeDepartment || !companyIdProp || !employee) {
    return;
}
```

#### 1.4 修改依赖数组
```typescript
// 将所有依赖数组中的 employee.id 改为 employee?.id
[serverUrl, saving, employee?.id, ...]
[companyIdProp, employee?.id, serverUrl]
[serverUrl, employee?.id, employee?.email, employee?.is_bot]
```

#### 1.5 修改计算属性
```typescript
const isSelf = Boolean(currentUserId && employee?.id && currentUserId === employee.id);
const canSendMessage = !isSelf && Boolean(employee?.email || employee?.id);
```

### 2. 昵称重复显示修复

#### 修改 `username2Nickname` 函数
```typescript
// app/utils/user/index.ts
if (includeFullName !== false && nickname && fullName) {
    // 如果昵称和全名相同，只显示一个，避免 "test (test)" 的重复显示
    if (nickname.toLowerCase() === fullName.toLowerCase()) {
        name = nickname;
    } else {
        name = `${nickname} (${fullName})`;
    }
} else {
    name = nickname || fullName || fallbackUsername;
}
```

## 📁 修改的文件

1. **app/screens/home/contacts/employee_profile/index.tsx**
   - 将 `employee` prop 改为可选
   - 在 early return 中显示错误 UI
   - 在所有 hooks 和 callbacks 中添加 `!employee` 检查
   - 修改依赖数组使用 `employee?.id`

2. **app/utils/user/index.ts**
   - 修改 `username2Nickname` 函数避免重复显示

## 🧪 测试场景

### 员工资料页崩溃
- ✅ 企业通讯录点击员工 → 正常显示
- ✅ 外部联系人点击联系人 → 正常显示
- ✅ employee 为 undefined → 显示错误页面
- ✅ employee 属性缺失 → 不崩溃

### 昵称显示
- ✅ 昵称和用户名相同 → 只显示一个 "test"
- ✅ 昵称和用户名不同 → 显示 "昵称 (全名)"
- ✅ 只有昵称 → 显示昵称
- ✅ 只有全名 → 显示全名
- ✅ 都没有 → 显示用户名

## 🎯 技术要点

### React Hooks 规则
- Hooks 不能在条件语句之后调用
- 解决方案：在所有 hooks 之后添加 early return
- 在 hooks 内部添加 `if (!employee) return;` 检查

### TypeScript 类型收窄
- 在 early return 之后，TypeScript 自动将 `employee?: UserProfile` 收窄为 `employee: UserProfile`
- JSX 中的 `employee.xxx` 引用是安全的

### 可选链在依赖数组中
- 使用 `employee?.id` 而不是 `employee.id`
- 避免在 employee 为 undefined 时触发 hooks 重新运行

## 📝 总结

### 修复的崩溃
1. ✅ `Cannot read property 'nickname' of undefined`
2. ✅ `Cannot read property 'id' of undefined`
3. ✅ `Cannot read property 'email' of undefined`
4. ✅ `Cannot read property 'phone' of undefined`

### 修复的显示问题
1. ✅ 昵称重复显示 "test(test)" → "test"
2. ✅ employee 不存在时显示友好错误页面

### 影响范围
- 企业通讯录
- 外部联系人
- 员工资料页
- 所有使用 `username2Nickname` 的地方

现在所有的崩溃和显示问题都已修复！🎉
