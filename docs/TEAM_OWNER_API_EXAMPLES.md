# 团队所有权 API 使用示例

## 概述

本文档介绍如何使用团队所有权相关的 API,包括:
- 创建团队时自动设置所有者
- 查询团队创建者信息
- 转移团队所有权(仅限创建者)
- 删除团队(仅限创建者)

**重要:** 只有团队创建者(`creator_id`)才能执行转移所有权和删除团队操作。

## 数据库迁移

在使用这些功能之前,需要运行数据库迁移以添加 `creator_id` 列到 `Teams` 表:

```bash
# MySQL
mmctl db migrate

# 或者手动执行
mysql -u root -p mattermost < server/channels/db/migrations/mysql/000155_add_creator_id_to_teams.up.sql

# PostgreSQL
psql -U postgres -d mattermost < server/channels/db/migrations/postgres/000155_add_creator_id_to_teams.up.sql
```

## API 端点

### 1. 创建团队 (自动设置所有者)

**端点:** `POST /api/v4/teams`

**描述:** 创建新团队时,系统会自动将 `CreatorId` 设置为当前认证用户的 ID。

**请求示例:**

```bash
curl --location 'http://your-server.com/api/v4/teams' \
--header 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
--header 'Content-Type: application/json' \
--data '{
  "name": "engineering",
  "display_name": "Engineering Team",
  "description": "Engineering department team",
  "type": "O",
  "email": "engineering@example.com",
  "allowed_domains": "example.com"
}'
```

**响应示例:**

```json
{
  "id": "abc123def456...",
  "create_at": 1234567890,
  "update_at": 1234567890,
  "delete_at": 0,
  "name": "engineering",
  "display_name": "Engineering Team",
  "description": "Engineering department team",
  "email": "engineering@example.com",
  "type": "O",
  "allowed_domains": "example.com",
  "invite_id": "xyz789...",
  "allow_open_invite": false,
  "creator_id": "current_user_id_here"
}
```

**说明:**
- `creator_id` 字段会自动设置为发起请求的用户的 ID
- 不需要在请求体中手动传递 `creator_id`

---

### 2. 转移团队所有权

**端点:** `POST /api/v4/teams/{team_id}/ownership/transfer`

**描述:** 将团队的所有权从当前所有者转移到另一个用户。只有团队管理员可以执行此操作。

**权限要求:**
- 必须是团队管理员 (Team Admin)
- 新所有者必须是该团队的成员

**请求参数:**
- `team_id` (路径参数): 团队的 ID
- `new_owner_id` (请求体): 新所有者的用户 ID
- `reason` (请求体,可选): 转移原因说明

**请求示例:**

```bash
curl --location 'http://your-server.com/api/v4/teams/abc123def456/ownership/transfer' \
--header 'Authorization: Bearer ADMIN_ACCESS_TOKEN' \
--header 'Content-Type: application/json' \
--data '{
  "new_owner_id": "user456def789...",
  "reason": "员工离职,转移团队管理权限"
}'
```

**响应示例:**

```json
{
  "team_id": "abc123def456",
  "old_owner_id": "user123abc456...",
  "new_owner_id": "user456def789...",
  "new_owner_name": "zhangsan",
  "transferred_at": 1234567890123,
  "reason": "员工离职,转移团队管理权限"
}
```

**错误响应:**

1. 新所有者不存在:
```json
{
  "id": "api.user.get_by_username.app_error",
  "message": "用户不存在",
  "status_code": 404
}
```

2. 新所有者不是团队成员:
```json
{
  "id": "api.team.transfer_ownership.not_member.app_error",
  "message": "新所有者必须是团队成员",
  "status_code": 400
}
```

3. 非创建者尝试转移所有权:
```json
{
  "id": "api.team.transfer_ownership.not_creator.app_error",
  "message": "只有团队创建者才能转移所有权",
  "status_code": 403
}
```

4. 团队没有创建者信息:
```json
{
  "id": "api.team.transfer_ownership.no_creator.app_error",
  "message": "团队没有创建者信息，无法转移所有权",
  "status_code": 403
}
```

---

### 2.5. 获取团队所有权信息

**端点:** `GET /api/v4/teams/{team_id}/ownership`

**描述:** 获取团队的创建者信息,以及当前用户是否为创建者。所有团队成员都可以访问此端点。

**权限要求:**
- 必须是团队成员

**请求示例:**

```bash
curl --location 'http://your-server.com/api/v4/teams/abc123def456/ownership' \
--header 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

**响应示例:**

```json
{
  "team_id": "abc123def456",
  "creator_id": "user123abc456...",
  "is_creator": true,
  "created_at": 1234567890,
  "creator": {
    "id": "user123abc456...",
    "username": "zhangsan",
    "first_name": "San",
    "last_name": "Zhang",
    "email": "zhangsan@example.com"
  }
}
```

**字段说明:**
- `team_id`: 团队ID
- `creator_id`: 创建者用户ID
- `is_creator`: 当前用户是否为创建者(true/false)
- `created_at`: 团队创建时间戳
- `creator`: 创建者的详细信息(如果可获取)

**使用场景:**
- 客户端判断是否显示"转移所有权"按钮
- 客户端判断是否显示"删除团队"按钮
- 显示团队创建者信息

---

### 3. 获取团队信息 (包含所有者)

**端点:** `GET /api/v4/teams/{team_id}`

**描述:** 获取团队详细信息,包括当前所有者 ID。

**请求示例:**

```bash
curl --location 'http://your-server.com/api/v4/teams/abc123def456' \
--header 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

**响应示例:**

```json
{
  "id": "abc123def456",
  "name": "engineering",
  "display_name": "Engineering Team",
  "description": "Engineering department team",
  "email": "engineering@example.com",
  "type": "O",
  "creator_id": "user456def789...",
  ...
}
```

---

### 4. 删除团队 (仅限创建者)

**端点:** `DELETE /api/v4/teams/{team_id}`

**描述:** 删除团队。**只有团队创建者才能执行此操作**。

**权限要求:**
- 必须是团队创建者 (`creator_id`)
- 必须是团队成员

**请求示例:**

```bash
curl --location 'http://your-server.com/api/v4/teams/abc123def456' \
--header 'Authorization: Bearer CREATOR_ACCESS_TOKEN' \
--request DELETE
```

**响应示例:**

```json
{
  "status": "OK"
}
```

**错误响应:**

1. 非创建者尝试删除:
```json
{
  "id": "api.team.delete.not_creator.app_error",
  "message": "只有团队创建者才能删除团队",
  "status_code": 403
}
```

2. 团队没有创建者信息:
```json
{
  "id": "api.team.delete.no_creator.app_error",
  "message": "团队没有创建者信息，无法删除",
  "status_code": 403
}
```

---

## 完整使用流程示例

### 场景:创建团队并后续转移所有权

```bash
#!/bin/bash

# 配置变量
SERVER="http://your-server.com"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="password123"
NEW_USER_EMAIL="zhangsan@example.com"
NEW_USER_USERNAME="zhangsan"
TEAM_NAME="engineering"
TEAM_DISPLAY_NAME="Engineering Team"

# 1. 登录获取管理员 token
echo "=== 步骤 1: 管理员登录 ==="
LOGIN_RESPONSE=$(curl -s --location "$SERVER/api/v4/users/login" \
  --header 'Content-Type: application/json' \
  --data "{
    \"login_id\": \"$ADMIN_USERNAME\",
    \"password\": \"$ADMIN_PASSWORD\"
  }")

ADMIN_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "管理员 Token: $ADMIN_TOKEN"

# 2. 创建新用户(未来的团队所有者)
echo -e "\n=== 步骤 2: 创建新用户 ==="
USER_RESPONSE=$(curl -s --location "$SERVER/api/v4/users" \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "{
    \"email\": \"$NEW_USER_EMAIL\",
    \"username\": \"$NEW_USER_USERNAME\",
    \"first_name\": \"San\",
    \"last_name\": \"Zhang\",
    \"password\": \"NewPassword123!\"
  }")

NEW_USER_ID=$(echo $USER_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "新用户 ID: $NEW_USER_ID"

# 3. 创建团队(管理员作为初始所有者)
echo -e "\n=== 步骤 3: 创建团队 ==="
TEAM_RESPONSE=$(curl -s --location "$SERVER/api/v4/teams" \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "{
    \"name\": \"$TEAM_NAME\",
    \"display_name\": \"$TEAM_DISPLAY_NAME\",
    \"type\": \"O\",
    \"email\": \"$NEW_USER_EMAIL\"
  }")

TEAM_ID=$(echo $TEAM_RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
CREATOR_ID=$(echo $TEAM_RESPONSE | grep -o '"creator_id":"[^"]*"' | cut -d'"' -f4)
echo "团队 ID: $TEAM_ID"
echo "初始所有者: $CREATOR_ID"

# 4. 将新用户添加到团队
echo -e "\n=== 步骤 4: 添加用户到团队 ==="
curl -s --location "$SERVER/api/v4/teams/$TEAM_ID/members" \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "{
    \"team_id\": \"$TEAM_ID\",
    \"user_id\": \"$NEW_USER_ID\"
  }" > /dev/null

echo "用户已添加到团队"

# 5. 将用户提升为团队管理员
echo -e "\n=== 步骤 5: 提升为团队管理员 ==="
curl -s --location "$SERVER/api/v4/teams/$TEAM_ID/members/$NEW_USER_ID/roles" \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data '{
    "roles": "team_admin"
  }' > /dev/null

echo "用户已提升为团队管理员"

# 6. 转移团队所有权
echo -e "\n=== 步骤 6: 转移团队所有权 ==="
TRANSFER_RESPONSE=$(curl -s --location "$SERVER/api/v4/teams/$TEAM_ID/ownership/transfer" \
  --header "Authorization: Bearer $ADMIN_TOKEN" \
  --header 'Content-Type: application/json' \
  --data "{
    \"new_owner_id\": \"$NEW_USER_ID\",
    \"reason\": \"团队交接给新员工管理\"
  }")

echo "转移响应:"
echo $TRANSFER_RESPONSE | python3 -m json.tool 2>/dev/null || echo $TRANSFER_RESPONSE

# 7. 验证所有权已转移
echo -e "\n=== 步骤 7: 验证所有权 ==="
TEAM_INFO=$(curl -s --location "$SERVER/api/v4/teams/$TEAM_ID" \
  --header "Authorization: Bearer $ADMIN_TOKEN")

echo "团队信息:"
echo $TEAM_INFO | python3 -m json.tool 2>/dev/null || echo $TEAM_INFO

echo -e "\n=== 完成 ==="
echo "团队所有权已成功转移给用户: $NEW_USER_USERNAME"
```

---

## 注意事项

1. **数据库迁移**: 确保在部署代码后运行数据库迁移,否则 `creator_id` 字段不存在会导致错误。

2. **向后兼容**: 对于迁移前已存在的团队,`creator_id` 字段为 `NULL`。可以在迁移后手动设置:
   ```sql
   -- 将每个团队的创建者设置为第一个加入的团队管理员
   UPDATE Teams t
   SET CreatorId = (
     SELECT UserId FROM TeamMembers tm
     WHERE tm.TeamId = t.Id
     AND tm.SchemeAdmin = 1
     ORDER BY tm.CreateAt ASC
     LIMIT 1
   )
   WHERE t.CreatorId IS NULL;
   ```

3. **权限控制**: 
   - **只有团队创建者**才能转移所有权和删除团队
   - 团队管理员不再具有这些权限(除非他们同时也是创建者)
   - 这确保了团队的所有权和删除权归属于真正的创建者

4. **客户端集成**: 
   - 使用 `GET /api/v4/teams/{team_id}/ownership` 端点检查当前用户是否为创建者
   - 根据 `is_creator` 字段决定是否显示"转移所有权"和"删除团队"按钮
   - 示例:
     ```javascript
     const ownership = await fetchTeamOwnership(teamId);
     if (ownership.is_creator) {
       showTransferOwnershipButton();
       showDeleteTeamButton();
     } else {
       hideTransferOwnershipButton();
       hideDeleteTeamButton();
     }
     ```

5. **审计日志**: 所有所有权转移操作都会被记录到审计日志中,包括旧所有者、新所有者和转移原因。

6. **API 版本**: 这些 API 属于 v4 版本,确保在请求中使用正确的 URL 路径 `/api/v4/...`。

7. **安全性**: 
   - 即使拥有系统管理员权限,如果不是团队创建者,也无法转移所有权或删除团队
   - 这防止了误操作或恶意操作

---

## 常见问题

**Q: 创建团队时可以指定不同的所有者吗?**
A: 不可以。`creator_id` 会自动设置为发起请求的用户。如果需要其他所有者,可以在创建后立即调用转移所有权 API。

**Q: 可以将所有权转移给非团队成员吗?**
A: 不可以。API 会验证新所有者必须是团队成员,否则会返回错误。

**Q: 转移所有权后,原所有者会被移除团队吗?**
A: 不会。原所有者仍然是团队成员,只是不再是所有者。如需移除,需要单独调用移除团队成员 API。

**Q: 如何查询某个用户拥有的所有团队?**
A: 可以通过遍历用户的团队列表并检查每个团队的 `creator_id` 字段来实现。使用 `GET /api/v4/users/me/teams` 获取用户的所有团队,然后检查每个团队的 `creator_id` 是否等于当前用户ID。

**Q: 团队管理员可以删除团队吗?**
A: 不可以。只有团队创建者(`creator_id`)才能删除团队,即使你是团队管理员也不行。这是为了防止误操作和确保团队的安全性。

**Q: 如果创建者离职了怎么办?**
A: 在创建者离职前,应该先使用转移所有权 API 将团队所有权转移给其他人。如果创建者已经离职且无法操作,系统管理员可以通过数据库手动更新 `creator_id` 字段。

**Q: 客户端如何判断是否显示"删除团队"按钮?**
A: 调用 `GET /api/v4/teams/{team_id}/ownership` 端点,检查响应中的 `is_creator` 字段。如果为 `true`,则显示删除按钮;否则隐藏。
