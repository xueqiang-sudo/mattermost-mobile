# 邀请链接处理改动说明

## 概述
本次修改使 mobile app 能够像 webapp 一样处理内部邀请（`id` 参数）和外部联系人邀请（`invited_by` 参数）。

## 支持的邀请链接格式

### 1. 团队邀请（内部邀请）
```
https://server.com/invite?id={team_invite_id}
https://server.com/invite?id={team_invite_id}&type={internal|supplier|customer}
```

### 2. 外部联系人邀请
```
https://server.com/invite?invited_by={user_id}
```

### 3. 组合邀请
```
https://server.com/invite?id={team_invite_id}&type={type}&invited_by={user_id}
```

## 修改的文件

### 1. `/app/client/rest/users.ts`
**新增功能：**
- `acceptInvitation(inviterId: string)` - 接受联系人邀请
- `autoRegisterUser()` 和 `autoRegisterUserPersonal()` 现在支持 `invitedBy` 参数

**API 端点：**
- `POST /api/v4/invitations/accept` - 接受联系人邀请
- `POST /api/v4/users?invited_by={user_id}` - 注册时记录邀请人

### 2. `/app/utils/deep_link/index.ts`
**新增功能：**
- 添加 `/invite` 路径的 deep link 解析支持
- 添加 `DeepLink.Invite` 类型的处理逻辑
- 已登录用户：自动接受邀请
- 未登录用户：跳转到登录页面，登录后自动处理邀请

**解析逻辑：**
```typescript
const inviteMatch = matchInviteDeeplink(url);
if (inviteMatch) {
    const inviteId = parsedUrl.query.id || parsedUrl.query.invite_id || parsedUrl.query.iid || '';
    const invitedBy = parsedUrl.query.invited_by || '';
    const inviteType = parsedUrl.query.type || '';
    // ...
}
```

### 3. `/types/launch/index.ts`
**新增类型：**
```typescript
export interface DeepLinkInvite extends DeepLink {
    serverUrl: string;
    inviteId: string;
    inviteType: string;
    invitedBy: string;
}
```

### 4. `/app/screens/login/phone_form.tsx`
**改进功能：**
- 用户注册时传递 `invited_by` 参数
- 登录成功后分别处理：
  1. 接受联系人邀请（`acceptInvitation`）
  2. 加入团队（`joinTeam`）

## 用户流程

### 场景 1：用户未登录
```
用户点击邀请链接
    ↓
App 解析 deep link，存储邀请信息到 EphemeralStore
    ↓
跳转到登录页面
    ↓
用户输入手机号 + 验证码
    ↓
注册时传递 invited_by 参数（如果是新用户）
    ↓
登录成功
    ↓
接受联系人邀请（如果有 invited_by）
    ↓
加入团队（如果有 invite_id）
    ↓
跳转到 Home 页面
```

### 场景 2：用户已登录
```
用户点击邀请链接
    ↓
App 解析 deep link，检测到用户已登录
    ↓
立即接受联系人邀请（如果有 invited_by）
    ↓
立即加入团队（如果有 invite_id）
    ↓
导航到 Home 页面
```

### 场景 3：手动输入邀请链接
```
用户在登录页面点击"有邀请链接？点击这里"
    ↓
粘贴邀请链接
    ↓
App 解析链接，提取邀请参数
    ↓
存储到 EphemeralStore
    ↓
返回登录页面
    ↓
用户登录后自动处理邀请
```

## API 调用顺序

### 对于 `invited_by` 类型邀请：
1. `POST /api/v4/invitations/accept` - 接受联系人邀请
2. 如果有 `invite_id`：`POST /api/v4/teams/members/invite?invite_id={id}&invited_by={user_id}`

### 对于 `id` 类型邀请（团队邀请）：
1. `POST /api/v4/teams/members/invite?invite_id={id}`

### 新用户注册：
1. `POST /api/v4/users/personal?invited_by={user_id}` - 注册时记录邀请人

## 与 Webapp 的对齐情况

| 功能 | Webapp | Mobile (修改后) | 状态 |
|------|--------|----------------|------|
| `/invite` 路由解析 | ✅ | ✅ | 已对齐 |
| `invited_by` 参数支持 | ✅ | ✅ | 已对齐 |
| `acceptInvitation` API | ✅ | ✅ | 已对齐 |
| 注册时传递 `invited_by` | ✅ | ✅ | 已对齐 |
| 登录后自动加入团队 | ✅ | ✅ | 已对齐 |
| 已登录用户自动处理 | ✅ | ✅ | 已对齐 |
| Deep link 处理 | ✅ | ✅ | 已对齐 |

## 测试场景

### 测试 1：外部联系人邀请（未登录）
```bash
# 邀请链接
https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw

# 预期行为
1. App 打开，显示登录页面
2. 用户输入手机号和验证码
3. 注册时 URL 包含 ?invited_by=npxp3ccyrbybieqhc535rgmxnw
4. 登录成功后调用 acceptInvitation API
5. 进入 Home 页面，可以看到邀请人
```

### 测试 2：团队邀请（未登录）
```bash
# 邀请链接
https://ai.optibot.cn:8065/invite?id=abc123&type=internal

# 预期行为
1. App 打开，显示登录页面
2. 用户登录
3. 登录成功后调用 joinTeam API
4. 自动加入团队
5. 进入 Home 页面，可以看到新团队
```

### 测试 3：已登录用户点击邀请
```bash
# 预期行为
1. App 检测到用户已登录
2. 立即调用 acceptInvitation 和/或 joinTeam
3. 导航到 Home 页面
```

## 错误处理

- 邀请过期或无效：记录错误日志，但不阻塞登录流程
- `acceptInvitation` 失败：记录警告，继续处理团队邀请
- `joinTeam` 失败：记录错误，但用户仍可正常使用 App

## 向后兼容性

- 现有的 `id` 类型邀请链接继续正常工作
- 手动输入邀请链接的界面保持不变
- EphemeralStore 的数据结构兼容（添加了新字段但保持向后兼容）

## 注意事项

1. **邀请链接生成**：确保服务端生成的邀请链接格式正确
2. **Deep link 配置**：确保 Android/iOS 的 deep link 配置包含 `/invite` 路径
3. **服务器版本**：确保服务器支持 `acceptInvitation` 和 `invited_by` 参数
4. **测试覆盖**：建议添加单元测试覆盖新的 deep link 解析逻辑

## 相关文件

- `/app/client/rest/users.ts` - API 客户端方法
- `/app/client/rest/teams.ts` - 团队 API（已有 `joinTeam` 方法）
- `/app/utils/deep_link/index.ts` - Deep link 解析和处理
- `/app/screens/login/phone_form.tsx` - 登录流程中的邀请处理
- `/app/screens/invite_link/index.tsx` - 手动输入邀请链接
- `/app/store/ephemeral_store.ts` - 临时存储邀请信息
- `/types/launch/index.ts` - 类型定义

## 后续优化建议

1. 添加邀请确认页面，显示团队/邀请人信息
2. 添加邀请过期的用户提示
3. 优化错误消息，区分不同类型的邀请失败
4. 添加邀请链接的二维码扫描支持（已有基础设施）
