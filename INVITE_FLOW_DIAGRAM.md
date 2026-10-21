# 邀请链接完整流程图

## 你的操作流程（手动输入方式）

```
┌─────────────────────────────────────────────────────────┐
│ 1. 打开 App，进入登录页面                                 │
│    - 没有登录                                            │
│    - 看到 "有邀请链接？点击这里"                           │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 2. 点击 "有邀请链接？点击这里"                            │
│    - 跳转到 InviteLink 页面                              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 3. 在 InviteLink 页面粘贴邀请链接                         │
│    https://ai.optibot.cn:8065/invite?invited_by=xxx     │
│    - parseInviteFromUrl() 解析链接                       │
│    - 提取 invited_by 参数                                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 4. 点击 "确认" 按钮                                      │
│    - 调用 handleConfirm()                                │
│    - 存储邀请信息到 EphemeralStore                       │
│      EphemeralStore.setPendingInviteInfo({              │
│        inviteId: '',                                     │
│        inviteType: '',                                   │
│        invitedBy: 'npxp3ccyrbybieqhc535rgmxnw'          │
│      })                                                  │
│    - 返回登录页面                                        │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 5. 在登录页面输入手机号和验证码                            │
│    - 点击 "获取验证码"                                    │
│    - 输入验证码                                          │
│    - 点击 "登录"                                         │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 6. 登录流程（signInWithCode）                            │
│    a. 验证验证码 ✓                                       │
│    b. 获取配置和许可证 ✓                                  │
│    c. 检查用户是否存在 ✓                                  │
│    d. 如果是新用户，自动注册 ✓                            │
│    e. 设置昵称（如果需要）✓                               │
│    f. 调用 login() API ✓                                 │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 7. 登录成功后，检查邀请信息                               │
│    - EphemeralStore.getPendingInviteInfo()              │
│    - 获取到：                                            │
│      {                                                   │
│        inviteId: '',                                     │
│        inviteType: '',                                   │
│        invitedBy: 'npxp3ccyrbybieqhc535rgmxnw'          │
│      }                                                   │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 8. 处理邀请（修复后）                                    │
│    a. 获取 API 客户端                                    │
│       const client = await getAutoClient(serverUrl)     │
│                                                          │
│    b. 调用 acceptInvitation API                         │
│       await client.acceptInvitation(invitedBy)          │
│       → POST /api/v4/invitations/accept                 │
│       → body: {inviter_id: 'npxp3ccyrbybieqhc535rgmxnw'}│
│                                                          │
│    c. 服务端处理                                         │
│       - 查找待处理的邀请记录                              │
│       - 更新邀请状态为 accepted                           │
│       - 创建联系人记录（A→B 和 B→A）                      │
│       - 创建 GM 频道                                     │
│       - 发送系统消息                                     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ 9. 进入 Home 页面                                        │
│    - 完成登录                                            │
│    - 清空 EphemeralStore 中的邀请信息                    │
└─────────────────────────────────────────────────────────┘
```

## 预期日志（完整流程）

### 步骤 3-4: InviteLink 页面
```
[InviteLink] Parsing invite URL
{
  "inputValue": "https://ai.optibot.cn:8065/invite?invited_by=npxp3ccyrbybieqhc535rgmxnw",
  "result": {
    "id": "",
    "type": "",
    "invited_by": "npxp3ccyrbybieqhc535rgmxnw"
  }
}

[InviteLink] Stored invite info
{
  "inviteId": "",
  "inviteType": "",
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw"
}
```

### 步骤 5-6: 登录过程
```
signInWithCode phone normalizedLoginId: 13800138000
signInWithCode phone username: 13800138000
...
```

### 步骤 7-8: 处理邀请
```
[Login] Checking pending invite info after login

[Login] Pending invite info
{
  "hasPendingInvite": true,
  "inviteId": "",
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw",
  "inviteType": ""
}

[Login] Processing invite after login
{
  "inviteId": "",
  "inviteType": "",
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw"
}

[Login] Calling acceptInvitation API
{
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw"
}

[Login] Successfully accepted contact invitation
{
  "invitedBy": "npxp3ccyrbybieqhc535rgmxnw"
}
```

## 服务端处理（acceptInvitation）

```
POST /api/v4/invitations/accept
{
  "inviter_id": "npxp3ccyrbybieqhc535rgmxnw"
}

服务端逻辑：
1. 获取当前登录用户 ID（invitee_id）
2. 查找 inviter_id 的待处理邀请
3. 如果找到：
   - 更新邀请状态：pending → accepted
   - 设置 invitee_id
4. 如果未找到：
   - 创建新的邀请记录（status = accepted）
5. 创建联系人记录：
   - employee_contacts (inviter → invitee, type=external)
   - employee_contacts (invitee → inviter, type=external)
6. 创建 GM 频道：
   - channel (type=G, members=[inviter, invitee])
   - channel_member (inviter)
   - channel_member (invitee)
7. 发送系统消息：
   - post (type=system, message="B的昵称 已注册...")
8. 返回成功响应
```

## 验证结果

### A（邀请者）看到的结果

1. **通讯录 → 外部联系人**
   - 显示 B（type=external, source=manual）
   - 公司：B 的团队名称

2. **会话列表**
   - 显示与 B 的 GM 频道
   - 频道名称："A, B" 或类似
   - 最后一条消息："B的昵称 已注册登录到系统..."

3. **打开 GM 频道**
   - 系统消息："B的昵称 已注册登录到系统，现在可以聊天了"

### B（被邀请者）看到的结果

1. **通讯录 → 外部联系人**
   - 显示 A（type=external, source=manual）
   - 公司：A 的团队名称

2. **会话列表**
   - 显示与 A 的 GM 频道
   - 频道名称："A, B" 或类似
   - 最后一条消息："您已注册登录到系统，现在可以聊天了"

3. **打开 GM 频道**
   - 系统消息："您已注册登录到系统，现在可以聊天了"

## 数据库验证

### 邀请记录
```sql
SELECT
    id,
    inviter_id,
    invitee_id,
    parent_invitation_id,
    phone,
    status,
    create_at,
    update_at
FROM contact_invitations
WHERE inviter_id = 'npxp3ccyrbybieqhc535rgmxnw'
  AND status = 'accepted'
ORDER BY create_at DESC
LIMIT 5;
```

### 联系人记录
```sql
SELECT
    ec.id,
    ec.employee_id,
    ec.contact_id,
    ec.contact_type,
    ec.company,
    ec.source,
    u.nickname as contact_nickname,
    u.username as contact_username
FROM employee_contacts ec
JOIN users u ON ec.contact_id = u.id
WHERE (ec.employee_id = 'npxp3ccyrbybieqhc535rgmxnw'
       OR ec.contact_id = 'npxp3ccyrbybieqhc535rgmxnw')
  AND ec.contact_type = 'external'
ORDER BY ec.create_at DESC;
```

### GM 频道
```sql
SELECT
    c.id,
    c.type,
    c.display_name,
    c.create_at,
    p.message as system_message
FROM channels c
LEFT JOIN posts p ON c.id = p.channel_id AND p.type = 'system_generic'
WHERE c.type = 'G'
  AND c.id IN (
    SELECT channel_id
    FROM channel_members
    WHERE user_id = 'npxp3ccyrbybieqhc535rgmxnw'
  )
ORDER BY c.create_at DESC
LIMIT 10;
```

## 常见问题

### Q: 为什么没有 `[parseDeepLink]` 日志？
**A:** 因为你是通过"手动输入邀请链接"的方式，而不是通过点击链接自动打开 App。这是正常的，不影响功能。

### Q: `acceptInvitation` 失败了怎么办？
**A:** 查看具体错误信息：
- "No pending invitation found" → 邀请记录不存在，让 A 重新生成链接
- "Self invite not allowed" → A 和 B 是同一个用户
- "Unauthorized" → 用户未登录或 session 过期

### Q: 成功了但联系人列表没有显示？
**A:** 尝试：
1. 下拉刷新联系人列表
2. 退出登录后重新登录
3. 重启 App
4. 检查服务端是否创建了 `employee_contacts` 记录

### Q: GM 频道没有出现？
**A:** 尝试：
1. 刷新会话列表
2. 重启 App
3. 检查服务端是否创建了 GM 频道
4. 检查 WebSocket 连接状态

## 总结

你的操作流程是正确的：
1. ✅ 登录页面 → "有邀请链接？"
2. ✅ 粘贴邀请链接
3. ✅ 确认并返回登录
4. ✅ 输入手机号和验证码
5. ✅ 完成登录
6. ⏳ **等待 acceptInvitation 调用成功**（修复后）

修复后应该能看到：
```
[Login] Successfully accepted contact invitation
```

然后去检查 A 和 B 的联系人列表和会话列表！🎉
