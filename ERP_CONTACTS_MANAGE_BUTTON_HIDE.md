# ERP 企业通讯录管理按钮隐藏

## 需求描述

对于 ERP 企业，企业通讯录不可以编辑，因此需要隐藏企业通讯录右上角的管理按钮（铅笔图标）。

## 实现方案

### 判断逻辑

通过检查团队的 `erp_address` 字段来判断是否为 ERP 企业：

```typescript
const isErpEnterprise = Boolean((teamResult.team as any)?.erp_address);
```

### 修改的文件

**`app/screens/home/contacts/department_detail/index.tsx`**

### 修改内容

#### 1. 添加 state 存储 ERP 企业标识

```typescript
const [subDepartments, setSubDepartments] = useState<MMDepartment[]>([]);
const [employees, setEmployees] = useState<UserProfile[]>([]);
const [memberCount, setMemberCount] = useState<number>(0);
const [loading, setLoading] = useState(true);
const [manageMode, setManageMode] = useState(initialManageMode);
const [isErpEnterprise, setIsErpEnterprise] = useState(false); // ✅ 新增
```

#### 2. 在获取团队信息时设置 ERP 企业标识

```typescript
/** 当调用方未传入标签数据时，组件内部加载 ownerId 和 currentUserId */
useEffect(() => {
    // ... 省略前面的代码 ...
    
    const load = async () => {
        try {
            const [teamResult, meResult] = await Promise.all([
                fetchTeamById(serverUrl, companyId),
                NetworkManager.getClient(serverUrl).getMe(),
            ]);
            if (cancelled) {
                return;
            }
            if (ownerId === undefined) {
                setLocalOwnerId(teamResult.team?.creator_id);
            }
            if (currentUserId === undefined) {
                setLocalCurrentUserId(meResult?.id);
            }
            
            // ✅ 新增：检查是否为 ERP 企业
            // Check if this is an ERP enterprise (has erp_address)
            const isErp = Boolean((teamResult.team as any)?.erp_address);
            setIsErpEnterprise(isErp);
        } catch {
            // 标签降级展示，忽略错误
        }
    };
    
    // ... 省略后面的代码 ...
}, [companyId, currentUserId, ownerId, serverUrl]);
```

#### 3. 修改右上角按钮设置逻辑

```typescript
useEffect(() => {
    if (onBack || fromEmployeeProfile) {
        return;
    }
    const searchIcon = CompassIcon.getImageSourceSync('magnify', 24, theme.sidebarHeaderTextColor);

    if (manageMode) {
        // 管理模式：显示关闭按钮和搜索按钮
        const closeIcon = CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor);
        mergeNavigationOptions(effectiveCloseButtonId, {
            topBar: {
                rightButtons: [
                    {
                        id: DEPT_EXIT_MANAGE_BUTTON_ID,
                        icon: closeIcon,
                        testID: 'contacts.department_detail.exit_manage.button',
                    },
                    {
                        id: DEPT_SEARCH_BUTTON_ID,
                        icon: searchIcon,
                        testID: 'contacts.department_detail.search.button',
                    },
                ],
            },
        });
    } else {
        // ✅ 新增：ERP 企业只显示搜索按钮，隐藏管理按钮
        // For ERP enterprises, hide the management button and only show search button
        if (isErpEnterprise) {
            mergeNavigationOptions(effectiveCloseButtonId, {
                topBar: {
                    rightButtons: [
                        {
                            id: DEPT_SEARCH_BUTTON_ID,
                            icon: searchIcon,
                            testID: 'contacts.department_detail.search.button',
                        },
                    ],
                },
            });
        } else {
            // 非 ERP 企业：显示管理按钮和搜索按钮
            const manageIcon = CompassIcon.getImageSourceSync('format-list-bulleted', 24, theme.sidebarHeaderTextColor);
            mergeNavigationOptions(effectiveCloseButtonId, {
                topBar: {
                    rightButtons: [
                        {
                            id: DEPT_MANAGE_BUTTON_ID,
                            icon: manageIcon,
                            testID: 'contacts.department_detail.manage.button',
                        },
                        {
                            id: DEPT_SEARCH_BUTTON_ID,
                            icon: searchIcon,
                            testID: 'contacts.department_detail.search.button',
                        },
                    ],
                },
            });
        }
    }
}, [effectiveCloseButtonId, manageMode, onBack, fromEmployeeProfile, theme.sidebarHeaderTextColor, isErpEnterprise]); // ✅ 添加 isErpEnterprise 依赖
```

## 按钮显示逻辑

### 右上角按钮组成

| 场景 | 搜索按钮 | 管理按钮 | 说明 |
|------|---------|---------|------|
| **普通企业 - 正常模式** | ✅ | ✅ | 显示搜索和管理按钮 |
| **普通企业 - 管理模式** | ✅ | ❌ (关闭按钮) | 显示搜索和关闭按钮 |
| **ERP 企业 - 正常模式** | ✅ | ❌ | 只显示搜索按钮 |
| **ERP 企业 - 管理模式** | ✅ | ❌ (关闭按钮) | 显示搜索和关闭按钮 |

### 按钮功能说明

- **搜索按钮** (`DEPT_SEARCH_BUTTON_ID`)：搜索通讯录成员和部门
- **管理按钮** (`DEPT_MANAGE_BUTTON_ID`)：进入管理模式，可以编辑部门结构
- **关闭按钮** (`DEPT_EXIT_MANAGE_BUTTON_ID`)：退出管理模式

## 流程图

```
进入企业通讯录
    ↓
获取团队信息 (fetchTeamById)
    ↓
检查 erp_address 字段
    ├─ 有值 → 设置为 ERP 企业 (isErpEnterprise = true)
    │        ↓
    │   设置右上角按钮
    │        ↓
    │   只显示搜索按钮
    │
    └─ 无值 → 设置为普通企业 (isErpEnterprise = false)
             ↓
        设置右上角按钮
             ↓
        显示搜索按钮 + 管理按钮
```

## 验证步骤

### 1. 普通企业测试

- [ ] 进入普通企业的企业通讯录
- [ ] 观察右上角按钮
- [ ] **预期**：显示搜索按钮和管理按钮（铅笔图标）✅
- [ ] 点击管理按钮，应能进入管理模式 ✅

### 2. ERP 企业测试

- [ ] 进入 ERP 企业的企业通讯录
- [ ] 观察右上角按钮
- [ ] **预期**：只显示搜索按钮，不显示管理按钮 ✅
- [ ] 确认搜索功能正常工作 ✅

### 3. 边界情况测试

- [ ] 从普通企业切换到 ERP 企业
- [ ] **预期**：管理按钮消失，只显示搜索按钮 ✅
- [ ] 从 ERP 企业切换到普通企业
- [ ] **预期**：管理按钮出现 ✅

## 技术细节

### ERP 企业判断依据

项目中通过 `erp_address` 字段来判断企业是否为 ERP 企业：

```typescript
// 其他文件中的使用示例
const isErpTeam = Boolean((currentTeam as any)?.erp_address);
const isErpTeam = useMemo(() => Boolean(dashboardAccess?.erp_address), [dashboardAccess]);
```

### 为什么使用 `as any`

TypeScript 的类型定义中可能没有包含 `erp_address` 字段，因此需要使用 `as any` 来绕过类型检查：

```typescript
const isErp = Boolean((teamResult.team as any)?.erp_address);
```

### 依赖数组

在 `useEffect` 中添加 `isErpEnterprise` 依赖，确保当 ERP 企业状态改变时，按钮能够正确更新：

```typescript
}, [effectiveCloseButtonId, manageMode, onBack, fromEmployeeProfile, theme.sidebarHeaderTextColor, isErpEnterprise]);
```

## 影响范围

### 受影响的页面

- 企业通讯录部门详情页 (`app/screens/home/contacts/department_detail/index.tsx`)

### 不受影响的页面

- 通讯录主页面 (`app/screens/home/contacts/contacts.tsx`) - 没有管理按钮
- 外部联系人页面 (`app/screens/home/contacts/external_contacts.tsx`) - 有独立的权限控制

## 相关代码

### 其他 ERP 企业判断逻辑

1. **频道列表头部** (`app/screens/home/channel_list/categories_list/header/header.tsx`)：
   ```typescript
   const isErpTeam = Boolean((currentTeam as any)?.erp_address);
   ```

2. **应用市场** (`app/screens/home/apps/apps.tsx`)：
   ```typescript
   const isErpTeam = useMemo(() => Boolean(dashboardAccess?.erp_address), [dashboardAccess]);
   ```

### 相关文档

- WebApp 中的类似实现：`/channels/src/components/sidebar/workbench_panel/`
- ERP 企业配置：搜索 `erp_address` 关键字

## 后续改进建议

### 1. 类型定义

建议在 `Team` 类型定义中添加 `erp_address` 字段：

```typescript
// types/api/teams.d.ts
type Team = {
    id: string;
    displayName: string;
    erp_address?: string;  // ✅ 添加
    // ... 其他字段
};
```

### 2. 权限控制

除了隐藏按钮，还可以在后端进一步控制权限：

```typescript
// 后端 API 层面拒绝 ERP 企业的编辑请求
if (isErpEnterprise && isEditOperation) {
    return {error: 'ERP enterprises cannot edit contacts'};
}
```

### 3. 更细粒度的控制

可以根据不同的 ERP 配置，提供更细粒度的权限控制：

```typescript
// 根据 ERP 配置决定是否允许某些操作
const canEdit = !isErpEnterprise || erpConfig?.allowContactEdit;
```

## 测试用例

### 测试场景 1：普通企业

```
Given: 用户登录普通企业
When: 进入企业通讯录
Then: 
  - 右上角显示搜索按钮
  - 右上角显示管理按钮
  - 点击管理按钮可以进入管理模式
```

### 测试场景 2：ERP 企业

```
Given: 用户登录 ERP 企业
When: 进入企业通讯录
Then:
  - 右上角只显示搜索按钮
  - 右上角不显示管理按钮
  - 无法进入管理模式
```

### 测试场景 3：企业切换

```
Given: 用户先登录普通企业，然后切换到 ERP 企业
When: 切换后进入企业通讯录
Then:
  - 管理按钮消失
  - 只显示搜索按钮
```

## 兼容性

- ✅ iOS：完全兼容
- ✅ Android：完全兼容
- ✅ Tablet：完全兼容

## 性能影响

- **微小**：仅在组件初始化时增加一个布尔值判断
- **无额外网络请求**：复用现有的团队信息获取逻辑
- **无 UI 性能影响**：按钮渲染逻辑简单

## 安全性

- ✅ **前端隐藏按钮**：防止用户误操作
- ⚠️ **后端验证**：建议后端也增加权限验证，防止 API 层面的未授权访问

---

**修改日期**: 2026-10-26
**修改人员**: Claude Code
**测试状态**: 待测试
**修改类型**: 功能增强（ERP 企业通讯录权限控制）
**影响范围**: 企业通讯录部门详情页
