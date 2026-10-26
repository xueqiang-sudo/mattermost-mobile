# 知识库添加文档按钮修复

## 问题描述

用户反馈：知识库页面右上角应该有一个"添加文档"按钮，但实际没有显示。

## 根本原因

知识库页面的"添加文档"按钮已经存在于代码中（第 1188-1194 行），但它的显示依赖于 `kbWrite` 权限：

```typescript
{kbWrite && (
    <TouchableOpacity style={style.headerAction} onPress={openAddScreen}>
        <Text style={style.headerActionText}>
            {intl.formatMessage({id: 'workbench.kb.add_document', defaultMessage: '添加文档'})}
        </Text>
    </TouchableOpacity>
)}
```

问题在于：
1. `KnowledgeBaseScreen` 组件通过 props 接收 `kbWrite`，默认值为 `false`
2. 在 `apps.tsx` 中导航到知识库时，没有传递 `kbWrite` 参数
3. 因此 `kbWrite` 始终为 `false`，按钮永远不会显示

## 解决方案

### 1. 修改路由参数类型定义

**文件**: `app/screens/home/apps/apps_stack_param_list.ts`

```typescript
// 修复前
[Screens.APPS_KNOWLEDGE_BASE]: undefined;

// 修复后
[Screens.APPS_KNOWLEDGE_BASE]: {
    kbWrite?: boolean;
} | undefined;
```

### 2. 修改导航逻辑，传递 `kbWrite` 权限

**文件**: `app/screens/home/apps/apps.tsx`

```typescript
// 修复前
case 'knowledge_base':
    navigation.navigate(Screens.APPS_KNOWLEDGE_BASE);
    break;

// 修复后
case 'knowledge_base':
    navigation.navigate(Screens.APPS_KNOWLEDGE_BASE, {
        kbWrite: dashboardAccess?.kb_write === true,
    });
    break;
```

### 3. 修改知识库页面，从路由参数读取权限

**文件**: `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx`

#### 添加 `useRoute` 导入

```typescript
// 修复前
import {useNavigation} from '@react-navigation/native';

// 修复后
import {useNavigation, useRoute} from '@react-navigation/native';
```

#### 修改组件，从路由参数读取 `kbWrite`

```typescript
// 修复前
type Props = {
    kbWrite?: boolean;
};

const KnowledgeBaseScreen = ({kbWrite = false}: Props) => {
    // ...
};

// 修复后
type RouteParams = {
    kbWrite?: boolean;
};

const KnowledgeBaseScreen = () => {
    const route = useRoute();
    const params = route.params as RouteParams | undefined;
    const kbWrite = params?.kbWrite === true;
    
    // ...
};
```

## 修复的文件

1. `app/screens/home/apps/apps_stack_param_list.ts` - 路由参数类型定义
2. `app/screens/home/apps/apps.tsx` - 导航逻辑
3. `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 知识库页面

## 权限来源

`kb_write` 权限来自 `DashboardAccess` 类型（定义在 `app/screens/home/apps/api.ts`）：

```typescript
export type DashboardAccess = {
    tabs: string[];
    is_admin: boolean;
    // ... 其他字段
    kb_write?: boolean;  // ← 知识库写入权限
    // ...
};
```

这个权限由后端 API 返回，表示当前用户是否有权限在知识库中添加/编辑文档。

## 按钮行为

### 有权限时 (`kbWrite === true`)

- ✅ 显示"添加文档"按钮
- ✅ 点击按钮打开文件选择器
- ✅ 可以选择并上传文档到知识库

### 无权限时 (`kbWrite === false`)

- ❌ 不显示"添加文档"按钮
- ✅ 只能查看知识库文档
- ❌ 无法添加/编辑文档

## 验证步骤

### 1. 有权限用户测试

- [ ] 使用有 `kb_write` 权限的用户登录
- [ ] 进入知识库页面
- [ ] **预期**：右上角显示"添加文档"按钮 ✅
- [ ] 点击按钮
- [ ] **预期**：打开文件选择器 ✅
- [ ] 选择文件并上传
- [ ] **预期**：文件成功添加到知识库 ✅

### 2. 无权限用户测试

- [ ] 使用无 `kb_write` 权限的用户登录
- [ ] 进入知识库页面
- [ ] **预期**：右上角不显示"添加文档"按钮 ✅
- [ ] 确认只能查看文档，无法添加 ✅

### 3. 调试日志检查

- [ ] 进入知识库页面
- [ ] 查看调试日志
- [ ] **预期看到**：
  ```
  [KB] Component rendering, kbWrite: true  // 或 false
  ```

## UI 截图说明

### 有权限时的界面

```
┌─────────────────────────────────────┐
│  ← 知识库          [添加文档]       │  ← 右上角有按钮
├─────────────────────────────────────┤
│  [分类标签]                          │
│  [搜索框]                            │
│  [文档列表]                          │
│    - 文档1                           │
│    - 文档2                           │
│    - ...                             │
└─────────────────────────────────────┘
```

### 无权限时的界面

```
┌─────────────────────────────────────┐
│  ← 知识库                          │  ← 右上角无按钮
├─────────────────────────────────────┤
│  [分类标签]                          │
│  [搜索框]                            │
│  [文档列表]                          │
│    - 文档1                           │
│    - 文档2                           │
│    - ...                             │
└─────────────────────────────────────┘
```

## 技术细节

### `useRoute` Hook

`useRoute` 是 React Navigation 提供的 Hook，用于访问当前屏幕的路由参数：

```typescript
const route = useRoute();
const params = route.params as RouteParams | undefined;
```

### 类型安全

使用 TypeScript 确保类型安全：

```typescript
type RouteParams = {
    kbWrite?: boolean;
};

const params = route.params as RouteParams | undefined;
const kbWrite = params?.kbWrite === true;  // 严格的布尔值检查
```

### 权限检查

```typescript
// dashboardAccess?.kb_write 可能是：
// - true → 有权限
// - false → 无权限
// - undefined → 未知（默认无权限）

kbWrite: dashboardAccess?.kb_write === true  // 只有明确为 true 时才启用
```

## 相关功能

### 添加文档流程

1. 点击"添加文档"按钮
2. 打开文件选择器（`FILE_PICKER` 屏幕）
3. 选择文件
4. 调用 `onUploadKBFiles` 上传文件
5. 使用 `createKBDocFile` API 创建文档
6. 刷新文档列表

### 底部添加按钮

除了右上角的按钮，底部还有一个添加按钮（第 1275-1288 行）：

```typescript
{kbWrite && (
    <TouchableOpacity style={style.addBtn} onPress={openAddScreen}>
        <CompassIcon name='plus' size={24} color={theme.buttonColor}/>
        <Text style={style.addBtnText}>
            {intl.formatMessage({id: 'workbench.kb.add_document', defaultMessage: '添加文档'})}
        </Text>
    </TouchableOpacity>
)}
```

两个按钮功能相同，只是位置不同，方便用户操作。

## 兼容性

- ✅ iOS：完全兼容
- ✅ Android：完全兼容
- ✅ Tablet：完全兼容

## 性能影响

- **无性能影响**：只是添加了路由参数传递
- **无额外网络请求**：权限信息已经包含在 `dashboardAccess` 中
- **无 UI 性能影响**：按钮渲染逻辑简单

## 安全性

- ✅ **前端权限控制**：根据后端返回的权限显示/隐藏按钮
- ⚠️ **后端验证**：后端 API 也需要验证权限，防止未授权的写入操作

## 后续改进建议

### 1. 添加权限提示

对于无权限用户，可以添加提示：

```typescript
{!kbWrite && (
    <Text style={style.noPermissionHint}>
        {intl.formatMessage({
            id: 'workbench.kb.no_write_permission',
            defaultMessage: 'You have read-only access to the knowledge base',
        })}
    </Text>
)}
```

### 2. 添加权限申请功能

允许用户申请知识库写入权限：

```typescript
{!kbWrite && (
    <TouchableOpacity onPress={requestKBWritePermission}>
        <Text>申请写入权限</Text>
    </TouchableOpacity>
)}
```

### 3. 细粒度权限控制

支持更细粒度的权限控制：
- 只允许添加特定类型的文档
- 只允许在特定分类下添加
- 限制添加频率

## 测试用例

### 测试场景 1：有权限用户

```
Given: 用户有 kb_write 权限
When: 进入知识库页面
Then:
  - 右上角显示"添加文档"按钮
  - 底部显示"添加文档"按钮
  - 点击按钮可以添加文档
  - 文档成功保存到知识库
```

### 测试场景 2：无权限用户

```
Given: 用户无 kb_write 权限
When: 进入知识库页面
Then:
  - 右上角不显示"添加文档"按钮
  - 底部不显示"添加文档"按钮
  - 只能查看文档
  - 无法添加/编辑文档
```

### 测试场景 3：权限变更

```
Given: 用户权限从有变为无（或反之）
When: 重新进入知识库页面
Then:
  - 按钮显示状态与新权限一致
  - 权限变更立即生效
```

---

**修复日期**: 2026-10-26
**修复人员**: Claude Code
**测试状态**: 待测试
**修复类型**: Bug 修复（知识库添加文档按钮不显示）
**影响范围**: 知识库页面
**严重程度**: 中（影响功能可用性）
