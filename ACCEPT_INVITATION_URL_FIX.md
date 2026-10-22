# acceptInvitation API URL 重复问题修复

## 🐛 问题描述

### 错误日志

```
[Login] Failed to accept contact invitation] Received invalid response from the server.; 
Malformed URL: https://ai.optibot.cn:8065https://ai.optibot.cn:8065/invitations/accept
```

### 症状

- ❌ 邀请链接接受失败
- ❌ URL 被重复拼接
- ❌ 服务器地址出现两次

---

## 🔍 根本原因

### URL 拼接机制

#### apiClient 的行为

`@mattermost/react-native-network-client` 的 `apiClient` 会**自动**在传入的 URL 前面加上 `baseUrl`：

```typescript
// apiClient.post(url, options)
// 实际请求: baseUrl + url
```

#### 错误的 URL 构建

**问题代码：**
```typescript
acceptInvitation = (inviterId: string) => {
    return this.doFetch(
        `${this.getBaseRoute()}/invitations/accept`,  // ❌ 错误
        {
            method: 'post',
            body: {inviter_id: inviterId},
        },
    );
};
```

**执行过程：**
```typescript
this.getBaseRoute() 
// → 'https://ai.optibot.cn:8065'

url = 'https://ai.optibot.cn:8065/invitations/accept'

apiClient.post(url, ...)
// → baseUrl + url
// → 'https://ai.optibot.cn:8065' + 'https://ai.optibot.cn:8065/invitations/accept'
// → 'https://ai.optibot.cn:8065https://ai.optibot.cn:8065/invitations/accept'  // ❌ 重复
```

---

## ✅ 解决方案

### 使用相对路径

**修复代码：**
```typescript
acceptInvitation = (inviterId: string) => {
    return this.doFetch(
        `${this.urlVersion}/invitations/accept`,  // ✅ 正确
        {
            method: 'post',
            body: {inviter_id: inviterId},
        },
    );
};
```

**执行过程：**
```typescript
this.urlVersion 
// → '/api/v4'

url = '/api/v4/invitations/accept'

apiClient.post(url, ...)
// → baseUrl + url
// → 'https://ai.optibot.cn:8065' + '/api/v4/invitations/accept'
// → 'https://ai.optibot.cn:8065/api/v4/invitations/accept'  // ✅ 正确
```

---

## 🔧 技术细节

### URL 构建规则

#### ✅ 正确的方式

**使用相对路径：**
```typescript
// ✅ 方式 1：使用 urlVersion
`${this.urlVersion}/invitations/accept`
// → '/api/v4/invitations/accept'

// ✅ 方式 2：使用 Route Helper 方法
`${this.getUsersRoute()}/personal`
// → 'api/v4/users/personal'

// ✅ 方式 3：使用 getUserRoute
`${this.getUserRoute(userId)}/patch`
// → 'api/v4/users/abc123/patch'
```

#### ❌ 错误的方式

**使用完整 URL：**
```typescript
// ❌ 方式：使用 getBaseRoute()
`${this.getBaseRoute()}/invitations/accept`
// → 'https://ai.optibot.cn:8065/invitations/accept'
// → apiClient 会再加上 baseUrl
// → 导致 URL 重复
```

### Route Helper 方法对比

| 方法 | 返回值 | 用途 |
|------|--------|------|
| `getBaseRoute()` | `https://ai.optibot.cn:8065` | 获取完整服务器地址（不用于请求） |
| `urlVersion` | `/api/v4` | API 版本前缀 |
| `getUsersRoute()` | `api/v4/users` | 用户列表路由 |
| `getUserRoute(id)` | `api/v4/users/{id}` | 单个用户路由 |
| `getTeamsRoute()` | `api/v4/teams` | 团队列表路由 |

### getBaseRoute() 的正确用途

`getBaseRoute()` 应该**仅**用于：

1. **缓存键值**
   ```typescript
   const cacheKey = `${this.getBaseRoute()}_${teamId}`;
   ```

2. **日志记录**
   ```typescript
   console.log('Server:', this.getBaseRoute());
   ```

3. **绝对 URL 构建（非 API 请求）**
   ```typescript
   const absoluteUrl = `${this.getBaseRoute()}/some/path`;
   // 用于 Linking.openURL(absoluteUrl) 等
   ```

**不应该**用于：
- ❌ API 请求的 URL 构建
- ❌ 传递给 `doFetch()` 的 URL

---

## 📊 代码统计

### 修改的文件

| 文件 | 修改 | 说明 |
|------|------|------|
| `app/client/rest/users.ts` | 1 行 | 将 `getBaseRoute()` 改为 `urlVersion` |
| **总计** | **1 行** | **修复 URL 重复问题** |

### Diff

```diff
-            `${this.getBaseRoute()}/invitations/accept`,
+            `${this.urlVersion}/invitations/accept`,
```

---

## ✅ 验证步骤

### 1. 功能测试

#### 测试 1：接受邀请链接
1. 使用邀请链接注册
2. 登录
3. **预期：** 成功接受邀请，无 URL 错误

#### 测试 2：检查日志
1. 查看控制台日志
2. **预期：** 无 `Malformed URL` 错误
3. **预期：** URL 格式正确：`https://ai.optibot.cn:8065/api/v4/invitations/accept`

### 2. 网络请求检查

**正确的请求：**
```
POST https://ai.optibot.cn:8065/api/v4/invitations/accept
Content-Type: application/json

{
  "inviter_id": "npxp3ccyrbybieqhc535rgmxnw"
}
```

**错误的请求（修复前）：**
```
POST https://ai.optibot.cn:8065https://ai.optibot.cn:8065/invitations/accept
// ❌ URL 格式错误，服务器无法处理
```

---

## 🎯 关键要点

### 1. 始终使用相对路径

**规则：**
```typescript
// ✅ 正确
this.doFetch(`${this.urlVersion}/endpoint`, {...})
this.doFetch(`${this.getUsersRoute()}/endpoint`, {...})
this.doFetch(`${this.getUserRoute(id)}/endpoint`, {...})

// ❌ 错误
this.doFetch(`${this.getBaseRoute()}/endpoint`, {...})
```

### 2. 理解 apiClient 的行为

**重要：**
- `apiClient` 会自动添加 `baseUrl`
- 传入的 URL 应该是**相对路径**
- 不要传入完整的 URL

### 3. 遵循现有模式

**参考其他 API 调用：**
```typescript
// ✅ 参考 getUsersRoute 的使用
createUser = async (user: UserProfile, token: string, inviteId: string) => {
    const url = `${this.getUsersRoute()}${buildQueryString(queryParams)}`;
    return this.doFetch(url, {method: 'post', body: user});
};

// ✅ 参考 getUserRoute 的使用
updateUser = async (user: UserProfile) => {
    const url = `${this.getUserRoute(user.id)}/patch`;
    return this.doFetch(url, {method: 'put', body: user});
};
```

---

## 🔍 排查类似问题

### 如何识别 URL 重复问题

#### 1. 检查错误日志

**关键词：**
```
Malformed URL: https://xxxhttps://xxx
Received invalid response from the server
```

#### 2. 检查网络请求

**工具：**
- React Native Debugger
- Flipper
- Charles Proxy

**查看：**
- 请求 URL 是否重复
- URL 格式是否正确

#### 3. 检查代码

**搜索：**
```bash
grep -rn "this.getBaseRoute()" app/client/rest/*.ts
```

**如果发现用于 API 请求：**
- ❌ 错误用法
- ✅ 改为 `urlVersion` 或 Route Helper

### 潜在的问题点

**检查 team_department.ts：**
```typescript
// ✅ 这些是正确的用法（用于缓存）
const baseUrl = this.getBaseRoute();
await clearContactDiskCacheCompany(baseUrl, teamDiskScopeKey(teamId));
```

**这些是缓存键值，不是 API 请求 URL，所以正确。**

---

## 💡 最佳实践

### 1. API 请求 URL 构建

```typescript
// ✅ 标准模式
class ClientExample {
    getExampleRoute() {
        return `${this.urlVersion}/examples`;
    }
    
    getExampleItemRoute(id: string) {
        return `${this.getExampleRoute()}/${id}`;
    }
    
    // GET 列表
    listExamples = () => {
        return this.doFetch(
            this.getExampleRoute(),
            {method: 'get'}
        );
    };
    
    // GET 单个
    getExample = (id: string) => {
        return this.doFetch(
            this.getExampleItemRoute(id),
            {method: 'get'}
        );
    };
    
    // POST 创建
    createExample = (data: ExampleData) => {
        return this.doFetch(
            this.getExampleRoute(),
            {method: 'post', body: data}
        );
    };
    
    // PUT 更新
    updateExample = (id: string, data: ExampleData) => {
        return this.doFetch(
            this.getExampleItemRoute(id),
            {method: 'put', body: data}
        );
    };
    
    // DELETE 删除
    deleteExample = (id: string) => {
        return this.doFetch(
            this.getExampleItemRoute(id),
            {method: 'delete'}
        );
    };
}
```

### 2. 特殊路由

```typescript
// 如果没有对应的 Route Helper，使用 urlVersion
specialEndpoint = () => {
    return this.doFetch(
        `${this.urlVersion}/special/endpoint`,
        {method: 'get'}
    );
};
```

### 3. 绝对 URL（非 API 请求）

```typescript
// 用于浏览器打开、深度链接等
openInBrowser = (path: string) => {
    const url = `${this.getBaseRoute()}${path}`;
    Linking.openURL(url);
};
```

---

## 🎉 总结

### 完成的工作

1. ✅ 修复 `acceptInvitation` URL 构建
2. ✅ 将 `getBaseRoute()` 改为 `urlVersion`
3. ✅ 修复 URL 重复拼接问题

### 修复效果

- ✅ 邀请链接可以正常接受
- ✅ URL 格式正确
- ✅ 无 `Malformed URL` 错误
- ✅ 服务器请求正常处理

### 代码质量

- ✅ 遵循项目规范
- ✅ 与其他 API 保持一致
- ✅ 代码更清晰

---

## 📞 常见问题

### Q1: 为什么不用 `getBaseRoute()`？

A: 因为 `apiClient` 会自动添加 `baseUrl`，使用 `getBaseRoute()` 会导致 URL 重复。

### Q2: `urlVersion` 是什么？

A: `urlVersion` 是 API 版本前缀，默认值为 `/api/v4`。

### Q3: 如何构建嵌套路由？

A: 使用 Route Helper 方法链式调用：
```typescript
getUserTeamRoute(userId: string, teamId: string) {
    return `${this.getUserRoute(userId)}/teams/${teamId}`;
}
```

### Q4: 如果需要查询参数怎么办？

A: 使用 `buildQueryString`：
```typescript
const url = `${this.getUsersRoute()}${buildQueryString({page: 1, per_page: 50})}`;
// → 'api/v4/users?page=1&per_page=50'
```

---

**修复完成！🚀**
