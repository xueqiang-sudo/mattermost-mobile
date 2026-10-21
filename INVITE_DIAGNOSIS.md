# 邀请链接问题诊断报告

## 问题分析

### 日志显示
```
18:19:11.926 [[Login] Checking pending invite info after login]
18:19:11.927 [[Login] Pending invite info] {"hasPendingInvite":true,"invitedBy":"npxp3ccyrbybieqhc535rgmxnw"}
18:19:11.927 [[Login] Processing invite after login] {"inviteId":"","inviteType":"","invitedBy":"npxp3ccyrbybieqhc535rgmxnw"}
18:19:11.927 [[Login] Failed to process invite] Cannot read property 'getClient' of undefined
```

### 发现的问题

#### 问题 1: NetworkManager 未定义 ✅ 已修复
**原因：** `NetworkManager.getClient()` 调用失败
**解决：** 改用 `await getAutoClient(serverUrl)`

#### 问题 2: 没有 Deep Link 解析日志 ❓ 待确认
**现象：** 没有看到 `[parseDeepLink]` 日志
**可能原因：**
1. 用户是通过**手动输入邀请链接**进入的（登录页面的"有邀请链接？"按钮）
2. App 已经在前台，用户点击链接后触发了其他流程
3. Deep link 配置有问题

### 邀请信息的来源

日志显示 `hasPendingInvite: true`，说明邀请信息已经被存储。

**存储方式有三种：**

1. **Deep link 自动解析**（`app/utils/deep_link/index.ts`）
   ```typescript
   EphemeralStore.setPendingInviteInfo({...});
   ```
   - 会打印 `[DeepLink] Stored invite info in EphemeralStore`

2. **手动输入邀请链接**（`app/screens/invite_link/index.tsx`）
   ```typescript
   EphemeralStore.setPendingInviteInfo({...});
   ```
   - **不会**打印 `[DeepLink]` 日志

3. **其他方式**（如二维码扫描等）

### 最可能的情况

根据日志分析，**用户很可能是通过手动输入邀请链接的方式进入的**：

```
登录页面 → "有邀请链接？点击这里" → InviteLink 页面 → 粘贴链接 → 确认
```

这个流程：
- ✅ 会存储邀请信息到 EphemeralStore
- ❌ 不会触发 deep link 解析
- ❌ 不会打印 `[parseDeepLink]` 日志

## 修复内容

### 已修复
```typescript
// app/screens/login/phone_form.tsx
const client = await getAutoClient(serverUrl);  // ✅ 使用 getAutoClient
```

### 待验证

重新测试后，应该看到：
```
[Login] Calling acceptInvitation API {"invitedBy":"npxp3ccyrbybieqhc535rgmxnw"}
[Login] Successfully accepted contact invitation {"invitedBy":"npxp3ccyrbybieqhc535rgmxnw"}
```

## 测试步骤

### 方式 1: 手动输入邀请链接（推荐）

1. 打开 App
2. 进入登录页面
3. 点击 "有邀请链接？点击这里"
4. 粘贴邀请链接：
   ```
   https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw
   ```
5. 点击"确认"
6. 返回登录页面
7. 输入手机号和验证码
8. 完成登录

**预期日志：**
```
[Login] Checking pending invite info after login
[Login] Pending invite info {"hasPendingInvite":true,"invitedBy":"..."}
[Login] Processing invite after login {...}
[Login] Calling acceptInvitation API {"invitedBy":"..."}
[Login] Successfully accepted contact invitation {"invitedBy":"..."}
```

### 方式 2: Deep Link 打开（需要配置）

1. 确保 App 的 deep link 配置正确
2. 在浏览器或其他 App 中点击邀请链接
3. App 自动打开并解析链接
4. 跳转到登录页面
5. 完成登录

**预期日志：**
```
[parseDeepLink] Invite URL detected {...}
[parseDeepLink] Returning DeepLink.Invite {...}
[DeepLink] Processing invite deep link {...}
[DeepLink] Stored invite info in EphemeralStore {...}
[DeepLink] User login status {"isLoggedIn":false}
... (登录过程) ...
[Login] Checking pending invite info after login
[Login] Pending invite info {"hasPendingInvite":true,"invitedBy":"..."}
[Login] Calling acceptInvitation API {"invitedBy":"..."}
[Login] Successfully accepted contact invitation {"invitedBy":"..."}
```

## 验证结果

### 成功后应该发生：

1. **服务端创建联系人记录**
   ```sql
   -- 检查联系人记录
   SELECT * FROM employee_contacts
   WHERE (employee_id = 'A的用户ID' AND contact_id = 'B的用户ID')
      OR (employee_id = 'B的用户ID' AND contact_id = 'A的用户ID');
   ```

2. **服务端创建 GM 频道**
   ```sql
   -- 查找 GM 频道
   SELECT c.* FROM channels c
   JOIN channel_members cm ON c.id = cm.channel_id
   WHERE c.type = 'G'
     AND cm.user_id IN ('A的用户ID', 'B的用户ID');
   ```

3. **客户端显示**
   - A 的外部联系人列表中出现 B
   - B 的外部联系人列表中出现 A
   - A 和 B 的会话列表中出现 GM 频道
   - GM 频道中有系统消息

### 如果仍然失败

检查日志中的错误信息：

#### 错误 A: "No pending invitation found"
**原因：** 邀请记录不存在
**解决：** 让 A 重新生成邀请链接

#### 错误 B: "Self invite not allowed"
**原因：** A 和 B 是同一个用户
**解决：** 使用不同的账号

#### 错误 C: "Unauthorized" 或 "Session expired"
**原因：** 用户未登录或 session 过期
**解决：** 确保 `login()` 成功后再调用 API

#### 错误 D: "Network error"
**原因：** 网络问题
**解决：** 检查网络连接

## 下一步

1. ✅ **重新构建 App**
2. ✅ **清空 Debug 日志**
3. ✅ **按照"方式 1"测试**（手动输入邀请链接）
4. ✅ **查看 Debug 日志**
5. ✅ **截图或导出日志**

如果看到 `Successfully accepted contact invitation`，说明成功了！

如果仍然失败，请把完整的日志发给我。
