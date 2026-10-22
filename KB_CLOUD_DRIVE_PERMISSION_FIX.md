# 启用知识库和云盘功能 - 权限配置

## 修改概述

根据权限配置启用知识库（Knowledge Base）和云盘（Cloud Drive）功能。

## 修改文件

### 1. 应用定义 - `app/screens/home/apps/api.ts`

#### 启用知识库应用定义
```typescript
// 第 60 行
{key: 'knowledge_base', labelId: 'workbench.tab.knowledge_base', defaultLabel: '知识库', iconName: 'book-outline', erpOnly: false, noPermission: false},
```

#### 启用知识库的 fallback tabs
```typescript
// 第 279-282 行
tabs: ['conversations', 'finance', 'sales', 'hotproducts', 'inventory',
    'orders', 'projects', 'approvals', 'price_list', 'cloud_drive',
    'knowledge_base',  // 取消注释
    'notebook'],
```

### 2. 应用可见性 - `app/screens/home/apps/apps.tsx`

#### 移除云盘的硬编码隐藏
```typescript
// 第 177-181 行
// 修改前：隐藏 price_list 和 cloud_drive
// 修改后：只隐藏 price_list
return APPS.filter((app) => {
    // Hide price_list (user request)
    if (app.key === 'price_list') {
        return false;
    }
    // ... 其他过滤逻辑
});
```

#### 启用知识库导航
```typescript
// 第 224-226 行
case 'knowledge_base':
    navigation.navigate(Screens.APPS_KNOWLEDGE_BASE);
    break;
```

### 3. 导航栈 - `app/screens/home/apps/apps_stack.tsx`

#### 启用知识库屏幕导入
```typescript
// 第 13 行
import KnowledgeBaseScreen from './knowledge_base/knowledge_base_screen';
```

#### 注册知识库 Stack 屏幕
```typescript
// 第 53 行
<Stack.Screen name={Screens.APPS_KNOWLEDGE_BASE} component={KnowledgeBaseScreen}/>
```

### 4. WebView URL 映射 - `app/screens/home/apps/app_webview.tsx`

#### 启用知识库 URL 映射
```typescript
// 第 83 行
const APP_URL_MAP: Record<string, string> = {
    // ... 其他映射
    cloud_drive: '/workbench/cloud-drive',
    knowledge_base: '/workbench/knowledge-base',  // 取消注释
    notebook: '/workbench/notebook',
};
```

### 5. 角色管理权限配置 - `app/screens/home/apps/role_management/role_management_screen.tsx`

#### 启用知识库权限配置项
```typescript
// 第 68-69 行
const CONFIG_ITEMS: ConfigItem[] = [
    // ... 其他配置项
    {key: 'cloud_drive', labelId: 'workbench.tab.cloud_drive', defaultLabel: '云盘'},
    {key: 'drive_write', labelId: 'workbench.permissions.drive_write', defaultLabel: '云盘写入', isFlag: true, parentFlag: 'cloud_drive'},
    {key: 'knowledge_base', labelId: 'workbench.tab.knowledge_base', defaultLabel: '知识库'},  // 取消注释
    {key: 'kb_write', labelId: 'workbench.permissions.kb_write', defaultLabel: '知识库写入', isFlag: true, parentFlag: 'knowledge_base'},  // 取消注释
    // ...
];
```

## 权限控制机制

### 应用可见性规则

1. **基于服务端权限 (`dashboardAccess.tabs`)**
   - 云盘和知识库都需要在服务端权限列表中存在
   - 通过 `allowedTabs.has(app.key)` 检查

2. **角色管理配置**
   - 管理员可以在角色管理中配置每个角色的权限
   - `cloud_drive`: 云盘访问权限
   - `drive_write`: 云盘写入权限
   - `knowledge_base`: 知识库访问权限
   - `kb_write`: 知识库写入权限

3. **父子权限关系**
   - `drive_write` 依赖于 `cloud_drive`（parentFlag）
   - `kb_write` 依赖于 `knowledge_base`（parentFlag）
   - 子权限只有在父权限启用时才显示

### 权限检查流程

```
用户请求访问应用
    ↓
检查 dashboardAccess.tabs 是否包含该应用
    ↓
检查角色权限配置
    ↓
允许/拒绝访问
```

## 服务端集成

### API 端点
- **权限查询**: `GET /plugins/com.mattermost.frappe-sync/api/dashboard/access`
- **返回字段**: 
  - `tabs`: 允许的标签列表（包含 'cloud_drive', 'knowledge_base'）
  - `drive_write`: 云盘写入权限标志
  - `kb_write`: 知识库写入权限标志

### WebView URL
- **云盘**: `{serverUrl}/workbench/cloud-drive`
- **知识库**: `{serverUrl}/workbench/knowledge-base`

## 测试验证

### 测试步骤

1. **权限配置测试**
   - 以管理员身份登录
   - 进入 应用 → 角色管理
   - 验证云盘和知识库权限项可见
   - 为不同角色配置权限

2. **应用可见性测试**
   - 以普通用户身份登录
   - 进入应用页面
   - 验证根据权限显示云盘和知识库
   - 点击应用验证导航正常

3. **写入权限测试**
   - 配置角色只有读取权限
   - 验证知识库/云盘的添加按钮不显示
   - 配置角色有写入权限
   - 验证添加按钮显示并可正常使用

### 预期结果

- ✅ 云盘应用根据权限显示
- ✅ 知识库应用根据权限显示
- ✅ 角色管理中可以配置云盘和知识库权限
- ✅ 写入权限正确控制添加按钮的显示
- ✅ 导航到知识库和云盘页面正常工作

## 相关文件

- `app/screens/home/apps/api.ts` - 应用定义和权限获取
- `app/screens/home/apps/apps.tsx` - 应用列表和导航
- `app/screens/home/apps/apps_stack.tsx` - 导航栈
- `app/screens/home/apps/app_webview.tsx` - WebView URL 映射
- `app/screens/home/apps/role_management/role_management_screen.tsx` - 角色管理权限配置
- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 知识库屏幕
- `app/screens/home/apps/cloud_drive/cloud_drive_screen.tsx` - 云盘屏幕

## 注意事项

1. **服务端配置**: 确保服务端正确配置权限
2. **权限继承**: 子权限（drive_write, kb_write）依赖父权限
3. **向后兼容**: Fallback tabs 确保 API 失败时仍可访问
4. **多语言支持**: 所有标签支持多语言显示
