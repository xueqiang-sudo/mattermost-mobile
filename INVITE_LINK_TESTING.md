# 邀请链接测试指南

## 测试场景：外部联系人邀请

### 测试链接
```
https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw
```

### 预期流程

#### 1. 用户 B 点击邀请链接（App 未运行）

**预期行为：**
- App 冷启动
- Deep link 被解析
- 邀请信息存储到 EphemeralStore
- 跳转到登录页面

**查看日志：**
```bash
adb logcat | grep -E "DeepLink|parseDeepLink|Launch"
```

**预期日志：**
```
[parseDeepLink] Invite URL detected
  url: https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw
  invitedBy: npxp3ccyrbybieqhc535rgmxnw
  serverUrl: ai.optibot.cn:8065

[parseDeepLink] Returning DeepLink.Invite
  invitedBy: npxp3ccyrbybieqhc535rgmxnw

[DeepLink] Processing invite deep link
  invitedBy: npxp3ccyrbybieqhc535rgmxnw
  serverUrl: ai.optibot.cn:8065

[DeepLink] Stored invite info in EphemeralStore
  invitedBy: npxp3ccyrbybieqhc535rgmxnw

[DeepLink] User login status
  isLoggedIn: false
```

#### 2. 用户 B 输入手机号和验证码

**预期行为：**
- 注册成功（新用户）或登录成功（已有用户）
- 如果是新用户，需要设置昵称
- 登录成功后检查邀请信息

**查看日志：**
```bash
adb logcat | grep -E "Login|signInWithCode"
```

**预期日志：**
```
[Login] Checking pending invite info after login
  hasPendingInvite: true

[Login] Pending invite info
  hasPendingInvite: true
  inviteId: ""
  invitedBy: npxp3ccyrbybieqhc535rgmxnw
  inviteType: ""

[Login] Processing invite after login
  invitedBy: npxp3ccyrbybieqhc535rgmxnw

[Login] Calling acceptInvitation API
  invitedBy: npxp3ccyrbybieqhc535rgmxnw

[Login] Successfully accepted contact invitation
  invitedBy: npxp3ccyrbybieqhc535rgmxnw
```

#### 3. 用户 A 查看外部联系人列表

**预期行为：**
- A 打开通讯录
- 在"外部联系人"标签页看到 B
- 联系人类型为 "external"
- 来源为 "manual"（手动邀请）

#### 4. 用户 B 查看外部联系人列表

**预期行为：**
- B 打开通讯录
- 在"外部联系人"标签页看到 A
- 联系人类型为 "external"
- 来源为 "manual"

#### 5. GM 频道

**预期行为：**
- A 和 B 的会话列表中出现一个 GM 频道
- 频道成员为 A 和 B
- 频道中有一条系统消息："B的昵称 已注册登录到系统，现在可以聊天了"
- B 看到的消息是："您已注册登录到系统，现在可以聊天了"

---

## 调试步骤

### 问题 1：邀请信息没有存储

**症状：**
- 日志中没有 `[DeepLink] Stored invite info in EphemeralStore`
- 登录后日志显示 `hasPendingInvite: false`

**排查步骤：**
1. 检查 deep link 是否被正确解析
2. 检查 `parseDeepLink` 是否返回 `DeepLink.Invite`
3. 检查 `handleDeepLink` 是否处理 `DeepLink.Invite` case

**解决方法：**
- 确保 App 的 deep link 配置正确（Android/iOS）
- 检查 `AndroidManifest.xml` 中的 intent-filter
- 检查 iOS 的 `Info.plist` 中的 URL Types

### 问题 2：acceptInvitation API 调用失败

**症状：**
```
[Login] Failed to accept contact invitation
  error: "Some error message"
```

**常见错误：**

#### 错误 A: "No pending invitation found"
**原因：** 邀请记录不存在或已过期
**解决：** 让 A 重新生成邀请链接

#### 错误 B: "Self invite not allowed"
**原因：** A 和 B 是同一个用户
**解决：** 使用不同的账号测试

#### 错误 C: "Session expired" 或 "Unauthorized"
**原因：** B 还没有完全登录
**解决：** 确保 `login()` 调用成功后再调用 `acceptInvitation`

### 问题 3：acceptInvitation 成功但联系人列表没有更新

**症状：**
- 日志显示 `Successfully accepted contact invitation`
- 但 A 的联系人列表中没有 B

**排查步骤：**
1. 检查服务端是否创建了 `employee_contacts` 记录
2. 检查联系人列表的 API 调用
3. 检查联系人列表的刷新逻辑

**服务端验证：**
```sql
-- 检查邀请记录
SELECT * FROM contact_invitations
WHERE inviter_id = 'A的用户ID'
  AND invitee_id = 'B的用户ID'
  AND status = 'accepted';

-- 检查联系人记录
SELECT * FROM employee_contacts
WHERE (employee_id = 'A的用户ID' AND contact_id = 'B的用户ID')
   OR (employee_id = 'B的用户ID' AND contact_id = 'A的用户ID');
```

**手动刷新联系人列表：**
- A 打开通讯录
- 下拉刷新
- 或者退出登录后重新登录

### 问题 4：GM 频道没有创建

**症状：**
- 联系人列表中有 B
- 但会话列表中没有 GM 频道

**排查步骤：**
1. 检查服务端是否创建了 GM 频道
2. 检查 WebSocket 是否推送了频道创建事件

**服务端验证：**
```sql
-- 查找 GM 频道
SELECT c.* FROM channels c
JOIN channel_members cm1 ON c.id = cm1.channel_id AND cm1.user_id = 'A的用户ID'
JOIN channel_members cm2 ON c.id = cm2.channel_id AND cm2.user_id = 'B的用户ID'
WHERE c.type = 'G';  -- G = Group Message
```

**客户端验证：**
- 检查 WebSocket 连接状态
- 检查是否收到 `channel_created` 事件
- 手动刷新会话列表

---

## 完整测试流程

### 准备工作
1. 准备两个测试账号：A（邀请者）和 B（被邀请者）
2. 确保 A 已经登录到 App
3. 准备一个未注册过的手机号用于 B

### 测试步骤

#### Step 1: A 生成邀请链接
1. A 打开 App
2. 进入通讯录
3. 搜索一个不存在的手机号（B 的手机号）
4. 点击"复制邀请链接"
5. 保存链接，确认包含 `invited_by={A的用户ID}`

#### Step 2: B 点击邀请链接
1. 确保 B 的手机上安装了 App 但**未登录**
2. B 点击邀请链接
3. 观察 App 是否打开并跳转到登录页面

**检查日志：**
```bash
adb logcat -c  # 清空日志
adb logcat | grep -E "DeepLink|parseDeepLink|Launch|Login"
```

#### Step 3: B 注册并登录
1. B 输入手机号
2. 获取验证码
3. 输入验证码
4. 设置昵称（新用户）
5. 完成登录

**检查日志：**
```bash
# 查找以下关键日志
[parseDeepLink] Invite URL detected
[DeepLink] Stored invite info in EphemeralStore
[Login] Checking pending invite info after login
[Login] Calling acceptInvitation API
[Login] Successfully accepted contact invitation
```

#### Step 4: 验证联系人关系
1. A 打开通讯录 → 外部联系人 → 查看是否有 B
2. B 打开通讯录 → 外部联系人 → 查看是否有 A

#### Step 5: 验证 GM 频道
1. A 查看会话列表 → 查看是否有与 B 的 GM 频道
2. B 查看会话列表 → 查看是否有与 A 的 GM 频道
3. 打开 GM 频道 → 查看系统消息

---

## 常见问题解答

### Q1: 为什么 App 没有自动打开？
**A:** 可能是 deep link 配置问题：
- Android: 检查 `AndroidManifest.xml` 中的 `<intent-filter>`
- iOS: 检查 `Info.plist` 中的 `CFBundleURLTypes`
- 确保域名 `ai.optibot.cn:8065` 被正确配置

### Q2: 为什么登录后没有自动接受邀请？
**A:** 检查日志，可能的原因：
1. `EphemeralStore.getPendingInviteInfo()` 返回 null
2. `acceptInvitation` API 调用失败
3. 邀请记录不存在或已过期

### Q3: 为什么联系人列表中没有显示？
**A:** 可能原因：
1. `acceptInvitation` 调用失败（查看日志）
2. 服务端没有创建 `employee_contacts` 记录
3. 联系人列表没有刷新（下拉刷新或重启 App）

### Q4: 为什么 GM 频道没有出现？
**A:** 可能原因：
1. `notifyInviterAccepted` 没有被调用（服务端问题）
2. WebSocket 没有推送频道创建事件
3. 频道列表没有刷新

---

## 日志收集命令

### Android
```bash
# 清空日志
adb logcat -c

# 实时监控邀请相关日志
adb logcat | grep -E "DeepLink|parseDeepLink|Launch|Login|invite|Invite"

# 保存到文件
adb logcat > invite_debug.log

# 搜索关键日志
grep -E "Stored invite info|Calling acceptInvitation|Successfully accepted" invite_debug.log
```

### iOS (使用 Console.app)
1. 打开 Xcode → Window → Devices and Simulators
2. 选择设备 → Open Console
3. 过滤关键词：`DeepLink`, `Login`, `invite`

---

## 回滚方案

如果测试中遇到问题需要回滚：

```bash
git diff app/
git checkout app/screens/login/phone_form.tsx
git checkout app/utils/deep_link/index.ts
git checkout app/client/rest/users.ts
git checkout types/launch/index.ts
```

---

## 测试完成检查清单

- [ ] Deep link 被正确解析（日志确认）
- [ ] 邀请信息存储到 EphemeralStore（日志确认）
- [ ] 注册时传递了 `invited_by` 参数（日志确认）
- [ ] 登录后调用 `acceptInvitation` API（日志确认）
- [ ] API 调用成功（日志确认）
- [ ] A 的外部联系人列表中有 B（UI 确认）
- [ ] B 的外部联系人列表中有 A（UI 确认）
- [ ] GM 频道已创建（UI 确认）
- [ ] 系统消息已发送（UI 确认）

---

## 联系支持

如果以上步骤都完成但仍有问题，请提供：
1. 完整的 adb logcat 日志
2. 测试用的邀请链接
3. A 和 B 的用户 ID
4. 服务端日志（如果有权限）
