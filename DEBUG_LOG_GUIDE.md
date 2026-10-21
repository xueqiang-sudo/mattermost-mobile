# DebugLog 查看指南

## 什么是 debugLog？

`debugLog` 是一个特殊的日志函数，会将日志存储到本地数据库，即使在真机上也能查看。

## 如何使用

### 1. 在 App 中查看 Debug 日志

App 内置了一个 Debug 页面可以查看日志：

1. 打开 App
2. 进入设置或调试菜单
3. 找到 "Debug Log" 或 "调试日志" 选项
4. 查看日志列表

### 2. 日志格式

所有邀请链接相关的日志都使用 `debugLog`，格式如下：

```
[parseDeepLink] Invite URL detected {...}
[parseDeepLink] Returning DeepLink.Invite {...}
[DeepLink] Processing invite deep link {...}
[DeepLink] Stored invite info in EphemeralStore {...}
[DeepLink] User login status {...}
[Login] Checking pending invite info after login
[Login] Pending invite info {...}
[Login] Processing invite after login {...}
[Login] Calling acceptInvitation API {...}
[Login] Successfully accepted contact invitation {...}
```

### 3. 测试步骤

#### Step 1: 清空旧日志
在 Debug 页面中点击 "清空日志" 或 "Clear Logs"

#### Step 2: 点击邀请链接
```
https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw
```

#### Step 3: 完成注册/登录

#### Step 4: 查看 Debug 日志

打开 Debug 页面，查找以下关键日志：

**预期的日志序列：**

```javascript
// 1. Deep link 解析
[parseDeepLink] Invite URL detected
{
  "url": "https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw",
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw",
  "serverUrl": "ai.optibot.cn:8065"
}

// 2. 存储邀请信息
[DeepLink] Stored invite info in EphemeralStore
{
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw"
}

// 3. 登录后检查
[Login] Checking pending invite info after login

[Login] Pending invite info
{
  "hasPendingInvite": true,
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw"
}

// 4. 调用 API
[Login] Calling acceptInvitation API
{
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw"
}

// 5. 成功接受邀请
[Login] Successfully accepted contact invitation
{
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw"
}
```

### 4. 常见问题诊断

#### 问题 A: 没有任何日志

**可能原因：**
- Deep link 没有被触发
- App 的 deep link 配置有问题

**检查：**
1. 确认 App 是通过邀请链接打开的
2. 检查 App 是否正确配置了 `https://ai.optibot.cn:8065/invite` 的路由

#### 问题 B: 只有 `[parseDeepLink]` 日志

**可能原因：**
- Deep link 被解析了，但没有被处理
- `handleDeepLink` 没有被调用

**检查：**
1. 查看是否有 `DeepLink.Invalid` 的日志
2. 检查 `launch.ts` 中的 `initialLaunch` 是否调用了 `launchAppFromDeepLink`

#### 问题 C: 有 `[DeepLink]` 但登录后没有 `[Login]` 日志

**可能原因：**
- 邀请信息存储在 EphemeralStore 中，但登录后丢失了
- 进程被杀死，EphemeralStore 被重置

**检查：**
1. 登录后立即查看 Debug 日志
2. 确认 `[Login] Pending invite info` 中的 `hasPendingInvite` 是否为 `true`

#### 问题 D: `[Login] Failed to accept contact invitation`

**可能原因：**
- API 调用失败
- 邀请记录不存在
- 网络问题

**检查：**
1. 查看错误信息：
   ```
   [Login] Failed to accept contact invitation
   {error message}
   ```
2. 常见错误：
   - `"No pending invitation found"` → 邀请记录不存在或已过期
   - `"Self invite not allowed"` → A 和 B 是同一个用户
   - `"Unauthorized"` → 用户未登录或 session 过期

#### 问题 E: 所有日志都成功，但联系人列表中没有显示

**可能原因：**
- 服务端没有创建 `employee_contacts` 记录
- 联系人列表没有刷新
- WebSocket 没有推送更新

**检查：**
1. 服务端验证：
   ```sql
   -- 检查邀请记录
   SELECT * FROM contact_invitations
   WHERE inviter_id = 'A的用户ID'
     AND status = 'accepted'
   ORDER BY create_at DESC
   LIMIT 5;

   -- 检查联系人记录
   SELECT * FROM employee_contacts
   WHERE employee_id = 'A的用户ID'
     AND contact_type = 'external'
   ORDER BY create_at DESC
   LIMIT 10;
   ```

2. 客户端验证：
   - 下拉刷新联系人列表
   - 退出登录后重新登录
   - 重启 App

### 5. 导出日志

如果需要在电脑端分析日志：

#### Android (adb logcat)
```bash
# 过滤 debug_log 相关的日志
adb logcat | grep -i "debug\|invite"

# 保存到文件
adb logcat > debug_logs.txt
```

#### 通过 App 导出
1. 打开 Debug 页面
2. 点击 "导出日志" 或 "Export Logs"
3. 选择导出方式（邮件、文件等）

### 6. 日志截图

为了方便分享，你可以：
1. 在 Debug 页面中截图
2. 或者导出为文本文件
3. 或者复制关键日志到聊天窗口

## 预期结果

### 成功流程的完整日志：

```
[parseDeepLink] Invite URL detected {"url":"https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw","invitedBy":"npxp3ccyrbybieqhc535rgmxnw","serverUrl":"ai.optibot.cn:8065"}

[parseDeepLink] Returning DeepLink.Invite {"inviteId":"","invitedBy":"npxp3ccyrbybieqhc535rgmxnw"}

[DeepLink] Processing invite deep link {"inviteId":"","inviteType":"","invitedBy":"npxp3ccyrbybieqhc535rgmxnw","serverUrl":"ai.optibot.cn:8065"}

[DeepLink] Stored invite info in EphemeralStore {"inviteId":"","inviteType":"","invitedBy":"npxp3ccyrbybieqhc535rgmxnw"}

[DeepLink] User login status {"isLoggedIn":false}

... (用户登录过程) ...

[Login] Checking pending invite info after login

[Login] Pending invite info {"hasPendingInvite":true,"inviteId":"","invitedBy":"npxp3ccyrbybieqhc535rgmxnw","inviteType":""}

[Login] Processing invite after login {"inviteId":"","inviteType":"","invitedBy":"npxp3ccyrbybieqhc535rgmxnw"}

[Login] Calling acceptInvitation API {"invitedBy":"npxp3ccyrbybieqhc535rgmxnw"}

[Login] Successfully accepted contact invitation {"invitedBy":"npxp3ccyrbybieqhc535rgmxnw"}
```

### 失败示例：

```
[Login] Checking pending invite info after login

[Login] Pending invite info {"hasPendingInvite":false,"inviteId":"","invitedBy":"","inviteType":""}

[Login] No pending invite info found after login
```

这说明邀请信息丢失了，需要检查：
1. Deep link 是否被正确处理
2. EphemeralStore 是否被意外清空
3. 进程是否被杀死

## 下一步

请按照以下步骤操作：

1. ✅ **重新构建 App**
2. ✅ **清空 Debug 日志**
3. ✅ **点击邀请链接并注册/登录**
4. ✅ **打开 Debug 页面查看日志**
5. ✅ **截图或导出日志发给我**

这样我就能准确定位问题所在了！
