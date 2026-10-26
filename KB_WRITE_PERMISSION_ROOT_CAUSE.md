# 知识库添加文档按钮不显示 - 根本原因分析

## 问题描述

用户反馈：已给账号 `13103261688`（公司：诸暨新丝维纤维有限公司）分配了管理员权限，管理员应该有知识库写入权限，但知识库页面的"添加文档"按钮仍然不显示。

数据库：端口 5434

## 调查结果

### 1. 后端代码（已确认正确）

**文件**: `/home/work/mattermost-master/all-plugin/frappe-sync/server/dashboard_access.go`

#### 知识库权限判断逻辑（第 408-428 行）

```go
// Resolve Knowledge Base permissions
var kbAccess, kbWrite bool
if isAdmin {
    kbAccess = true
    kbWrite = true   // ✅ 管理员自动获得写入权限
} else {
    // 非管理员：从角色权限中读取
    for _, t := range visibleTabs {
        if t == "knowledge_base" {
            kbAccess = true
            break
        }
    }
    if kbAccess {
        businessRoleKeys := p.getUserBusinessRoleKeys(teamID, user.Id)
        perms, permErr := p.getWorkbenchPermissions(teamID)
        if permErr == nil {
            _, roleFlags := p.filterTabsByRoleKeys(perms, businessRoleKeys)
            kbWrite = roleFlags["kb_write"]
        }
    }
}
```

#### 管理员检测逻辑（第 122-153 行）

```go
// Check if user is team admin (before filtering — admins see everything)
isAdmin := p.isTeamAdmin(user.Id, teamID)

// Also check if user has the "admin" business role — treat as admin
if !isAdmin {
    businessRoleKeys := p.getUserBusinessRoleKeys(teamID, user.Id)
    for _, key := range businessRoleKeys {
        if key == "admin" {
            isAdmin = true
            break
        }
    }
}
```

#### `isTeamAdmin` 函数（workbench_permissions.go 第 434-459 行）

```go
func (p *Plugin) isTeamAdmin(userID, teamID string) bool {
    // Check if user is a system admin first
    user, userErr := p.API.GetUser(userID)
    if userErr == nil && user != nil {
        for _, role := range strings.Split(user.Roles, " ") {
            if role == "system_admin" {
                return true
            }
        }
    }

    // Check team-level admin
    member, appErr := p.API.GetTeamMember(teamID, userID)
    if appErr != nil || member == nil {
        return false
    }
    if member.SchemeAdmin {
        return true  // ✅ SchemeAdmin 返回 true
    }
    for _, role := range strings.Split(member.Roles, " ") {
        if role == "team_admin" {
            return true
        }
    }
    return false
}
```

### 2. 数据库验证（已确认用户是管理员）

#### 用户系统角色

```sql
SELECT username, roles FROM users WHERE username = '13103261688';
```

**结果**:
```
 username   |   roles    
------------+------------
 13103261688 | system_user
```

**结论**: 用户不是系统管理员（`system_user` 而非 `system_admin`）

#### 用户团队成员状态

```sql
SELECT tm.teamid, tm.schemeadmin, t.displayname as team_name
FROM teammembers tm
JOIN teams t ON t.id = tm.teamid
WHERE tm.userid = '4wei3a6j1jdjtm3topmombjpno'
AND tm.deleteat = 0;
```

**结果**:
```
         teamid         | schemeadmin |       team_name        
------------------------+-------------+------------------------
 jy1idicdyfrddbykeqy5ji8p1r | t           | 诸暨新丝维纤维有限公司
 ifd7f7kogirexrkimeneyy9jmy | t           | 新丝维
```

**结论**: 用户在两个团队中都是 `schemeadmin = true` ✅

#### 用户业务角色

```sql
SELECT team_id, role_key, role_name, source 
FROM team_business_roles
WHERE user_id = '4wei3a6j1jdjtm3topmombjpno';
```

**结果**:
```
         team_id          |    role_key     |    role_name    | source 
--------------------------+-----------------+-----------------+--------
 jy1idicdyfrddbykeqy5ji8p1r | admin           | 管理员          | manual
 7s4axnq3ebyi5fzxno9w315dea | sales_user      | Sales User      | erp
 7s4axnq3ebyi5fzxno9w315dea | general_manager | General Manager | erp
 7s4axnq3ebyi5fzxno9w315dea | system_manager  | System Manager  | erp
```

**结论**: 用户有 `admin` 业务角色 ✅

#### 工作台权限配置

```sql
SELECT team_id, role_key, tabs, flags, contact_scope 
FROM workbench_permissions
WHERE team_id IN ('jy1idicdyfrddbykeqy5ji8p1r', 'ifd7f7kogirexrkimeneyy9jmy');
```

**结果**: (0 rows)

**结论**: `workbench_permissions` 表为空，但这不影响管理员（管理员自动获得所有权限）

### 3. 问题所在

#### 用户日志显示

```
16:38:52.704 [[Apps] Navigating to knowledge base] {"kbWrite":false}
                                                          ^^^^^^^^^^^^
                                                          ❌ kbWrite 是 false！
```

#### 预期后端返回

```json
{
  "is_admin": true,
  "kb_write": true,
  "drive_write": true,
  "contact_edit": true,
  "configurable": true,
  ...
}
```

#### 实际返回（推测）

```json
{
  "is_admin": false,  // ❌ 可能是 false
  "kb_write": false,  // ❌ 因为 is_admin 是 false
  ...
}
```

或者：

```json
// API 调用失败，使用了 fallback
{
  "tabs": ["conversations", "finance", ...],
  "is_admin": false,  // ❌ fallback 默认值
  "kb_write": undefined  // ❌ fallback 没有这个字段
}
```

## 可能的原因

### 原因 1: API 调用失败，使用了 fallback

**移动端代码** (`app/screens/home/apps/api.ts` 第 279-298 行):

```typescript
export async function getDashboardAccess(serverUrl: string, teamId?: string): Promise<DashboardAccess> {
    // ...
    try {
        const data = await client.doFetch(url, {method: 'get'});
        return data;
    } catch {
        // Fallback: return all tabs if API fails
        return {
            tabs: ['conversations', 'finance', 'sales', ...],
            is_admin: false,  // ❌ fallback 返回 is_admin: false
            configurable: false,
            // ❌ fallback 没有 kb_write 字段
            contact_edit: false,
            contact_scope: 'own',
            allowed_contact_types: ['internal'],
        };
    }
}
```

**可能原因**:
- 网络请求失败
- 服务器返回错误
- Token 过期或无效

### 原因 2: 移动端使用了错误的 team_id

**移动端代码** (`app/screens/home/apps/apps.tsx` 第 135 行):

```typescript
const currentTeamId = useMemo(() => currentTeam?.id, [currentTeam]);
```

**可能情况**:
- `currentTeam` 是 `新丝维` (ifd7f7kogirexrkimeneyy9jmy)
- 而不是 `诸暨新丝维纤维有限公司` (jy1idicdyfrddbykeqy5ji8p1r)

**但**: 两个团队的 `schemeadmin` 都是 `true`，所以应该都能检测到管理员。

### 原因 3: 后端 bug（不太可能）

**可能情况**:
- `p.API.GetTeamMember` 返回错误的 `SchemeAdmin` 值
- 数据库查询失败
- 权限判断逻辑有 bug

## 已添加的调试日志

### 文件: `app/screens/home/apps/apps.tsx`

```typescript
case 'knowledge_base':
    debugLog('[Apps] Navigating to knowledge base', JSON.stringify({
        is_admin: dashboardAccess?.is_admin,      // ✅ 新增
        kb_write: dashboardAccess?.kb_write,
        kbWrite: dashboardAccess?.kb_write === true,
        drive_write: dashboardAccess?.drive_write,  // ✅ 新增
        contact_edit: dashboardAccess?.contact_edit, // ✅ 新增
        configurable: dashboardAccess?.configurable, // ✅ 新增
    }));
    navigation.navigate(Screens.APPS_KNOWLEDGE_BASE, {
        kbWrite: dashboardAccess?.kb_write === true,
    });
    break;
```

## 下一步操作

### 1. 重新构建应用并测试

```bash
cd /home/work/mattermost-mobile
cd ios && pod install && cd ..
npx react-native run-ios
```

### 2. 测试步骤

1. 使用账号 `13103261688` 登录
2. 进入"应用"页面
3. 点击"知识库"图标
4. 打开"调试日志"页面
5. 查找以下日志：

```
[Apps] Navigating to knowledge base: {
  "is_admin": ???,
  "kb_write": ???,
  "kbWrite": ???,
  "drive_write": ???,
  "contact_edit": ???,
  "configurable": ???
}
```

### 3. 预期结果分析

#### 场景 A: `is_admin: true`（正常情况）

```json
{
  "is_admin": true,
  "kb_write": true,
  "kbWrite": true,
  "drive_write": true,
  "contact_edit": true,
  "configurable": true
}
```

**结论**: 后端正确返回权限，移动端应该显示"添加文档"按钮 ✅

**如果按钮仍然不显示**: 问题在移动端渲染逻辑

#### 场景 B: `is_admin: false`（问题情况）

```json
{
  "is_admin": false,
  "kb_write": false,
  "kbWrite": false,
  "drive_write": false,
  "contact_edit": false,
  "configurable": false
}
```

**结论**: 后端没有正确检测管理员身份

**排查步骤**:
1. 检查后端日志（查看 `isTeamAdmin` 函数的返回值）
2. 直接调用 API 测试：

```bash
curl -X GET "https://ai.optibot.cn:8065/plugins/com.mattermost.frappe-sync/api/dashboard/access?team_id=jy1idicdyfrddbykeqy5ji8p1r" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

3. 检查后端代码是否有 bug

#### 场景 C: 部分字段为 `undefined`

```json
{
  "is_admin": undefined,
  "kb_write": undefined,
  "kbWrite": false,
  "drive_write": undefined,
  "contact_edit": undefined,
  "configurable": undefined
}
```

**结论**: API 调用失败，使用了 fallback

**排查步骤**:
1. 检查网络连接
2. 检查 Token 是否有效
3. 检查服务器日志
4. 检查移动端网络请求日志

## 直接 API 测试

### 获取用户 Token

1. 登录 Mattermost
2. 打开浏览器开发者工具
3. 查找 `Authorization: Bearer xxx` 请求头
4. 复制 Token

### 调用 API

```bash
curl -X GET "https://ai.optibot.cn:8065/plugins/com.mattermost.frappe-sync/api/dashboard/access?team_id=jy1idicdyfrddbykeqy5ji8p1r" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 预期返回

```json
{
  "tabs": ["conversations", "overview", "finance", "sales", ...],
  "is_admin": true,
  "configurable": true,
  "user_phone": "13103261688",
  "user_type": "supplier",
  "is_supplier": true,
  "kb_access": true,
  "kb_write": true,
  "drive_access": true,
  "drive_write": true,
  "contact_edit": true,
  "contact_scope": "all",
  ...
}
```

## 相关文件

### 后端文件

- `/home/work/mattermost-master/all-plugin/frappe-sync/server/dashboard_access.go` - Dashboard Access API
- `/home/work/mattermost-master/all-plugin/frappe-sync/server/workbench_permissions.go` - 权限管理
- `/home/work/mattermost-master/server/channels/db/migrations/postgres/000200_create_workbench_permissions.up.sql` - 数据库表结构

### 移动端文件

- `app/screens/home/apps/api.ts` - DashboardAccess API
- `app/screens/home/apps/apps.tsx` - 应用页面
- `app/screens/home/apps/knowledge_base/knowledge_base_screen.tsx` - 知识库页面

### 数据库表

- `users` - 用户信息
- `teammembers` - 团队成员关系
- `teams` - 团队信息
- `team_business_roles` - 业务角色分配
- `workbench_permissions` - 工作台权限配置

## 技术细节

### 管理员检测流程

```
用户请求 /api/v4/dashboard/access
    ↓
[1] isTeamAdmin(userID, teamID)
    ├─ 检查 system_admin 角色
    ├─ 检查 team_admin 角色
    └─ 检查 SchemeAdmin 标志
    ↓
[2] 如果不是管理员，检查业务角色
    ├─ getUserBusinessRoleKeys(teamID, userID)
    └─ 检查是否包含 "admin"
    ↓
[3] 设置 isAdmin 标志
    ↓
[4] 根据 isAdmin 设置权限
    ├─ isAdmin = true → kbWrite = true
    └─ isAdmin = false → kbWrite = roleFlags["kb_write"]
```

### 权限层次结构

1. **系统管理员** (system_admin): 拥有所有权限
2. **团队管理员** (team_admin / SchemeAdmin): 拥有团队内所有权限
3. **业务角色 "admin"**: 拥有等同于管理员的权限
4. **普通用户**: 从 `workbench_permissions` 表读取权限

### 数据库连接

```bash
PGPASSWORD='wxw654321!' psql -h localhost -p 5434 -U mmuser -d mattermost
```

## 总结

### 已确认的事实

1. ✅ 后端代码正确：管理员自动获得 `kb_write: true`
2. ✅ 用户是管理员：`schemeadmin = true` 且有 `admin` 业务角色
3. ❌ 用户日志显示 `kbWrite: false`

### 可能的原因

1. API 调用失败，使用了 fallback（最可能）
2. 移动端使用了错误的 team_id
3. 后端 bug（不太可能）

### 下一步

1. 重新构建应用
2. 查看详细日志（包括 `is_admin` 字段）
3. 根据日志确定根本原因
4. 实施修复

---

**调查日期**: 2026-10-26  
**调查人员**: Claude Code  
**状态**: ⏳ 待验证  
**优先级**: 高  
**数据库**: 5434  
**账号**: 13103261688  
**公司**: 诸暨新丝维纤维有限公司  
**用户ID**: 4wei3a6j1jdjtm3topmombjpno  
**团队ID**: jy1idicdyfrddbykeqy5ji8p1r (诸暨新丝维纤维有限公司)
