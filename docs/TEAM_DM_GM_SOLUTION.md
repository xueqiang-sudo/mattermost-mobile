# Direct Channel 和 Group Channel 关联 Team 的解决方案

## 背景

Mattermost 的 Direct Channel (DM) 和 Group Channel (GM) 默认是**跨团队**的，`team_id` 字段为空。这是 Mattermost 的架构设计，因为 DM/GM 是用户之间的对话，不应该受限于特定团队。

## 需求

1. 创建 DM/GM 时标记所属的 team_id
2. 可以根据 team_id 查询相关的 DM/GM 频道

## 解决方案

### 方案一：使用 Channel Props 存储 Team ID（推荐）

**优点**：
- 不修改核心数据结构
- 不影响现有功能
- 向后兼容

**实现步骤**：

#### 1. 创建 DM/GM 时添加 team_id 到 Props

```javascript
// 前端示例
POST /api/v4/channels/direct
{
  "user_ids": ["user1", "user2"],
  "props": {
    "team_id": "team_id_here"
  }
}

POST /api/v4/channels/group
{
  "user_ids": ["user1", "user2", "user3"],
  "props": {
    "team_id": "team_id_here"
  }
}
```

#### 2. 后端修改 - 在 API 层处理 props

修改 `createDirectChannel` 和 `createGroupChannel` 函数，从请求中提取 `props.team_id` 并保存。

#### 3. 查询时过滤

获取用户的所有频道后，在前端或后端根据 `props.team_id` 过滤。

---

### 方案二：创建自定义 API Endpoint

添加新的 API endpoint 来获取与特定 team 相关的 DM/GM：

```
GET /api/v4/users/{user_id}/channels/direct?team_id={team_id}
GET /api/v4/users/{user_id}/channels/group?team_id={team_id}
```

**实现逻辑**：
1. 获取用户的所有频道
2. 过滤出 type = "D" 或 "G" 的频道
3. 检查频道成员是否都属于该 team（通过团队成员关系）
4. 返回过滤后的结果

---

### 方案三：修改数据库结构（不推荐）

修改 `Channels` 表，让 DM/GM 支持 `team_id`。

**缺点**：
- 需要大量修改核心代码
- 可能破坏现有功能
- 升级维护困难

---

## 推荐实现：方案一 + 方案二组合

### 1. 修改创建 API 接受 team_id

在请求体中添加可选的 `team_id` 字段，保存到 channel 的 props 中。

### 2. 添加查询 API

添加新的 endpoint 来根据 team_id 查询 DM/GM 频道。

### 3. 前端使用

创建频道时传入 team_id，查询时使用新的 API。

---

## 注意事项

1. **DM/GM 的跨团队特性是有意义的**：用户可以在不同团队之间进行私聊，不应该被限制
2. **标记 team 只是元数据**：用于组织和筛选，不影响频道的实际功能
3. **向后兼容**：确保现有的不带 team_id 的请求仍然正常工作
