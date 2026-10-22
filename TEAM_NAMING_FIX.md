# 修复新用户团队名称显示问题

## 问题描述
新手机号用户登录后，内部群的第一个公共频道名字显示为"手机号 + 的空间"，而不是"昵称 + 的空间"。

## 根本原因
1. 客户端在 `fetchMyTeams` 函数中尝试从本地数据库读取用户信息来创建团队
2. 由于登录流程中用户信息尚未完全同步到数据库，导致读取到的是旧信息（手机号）
3. 服务端已有 `CreatePersonalTeam` API，使用最新的用户昵称创建团队

## 解决方案

### 1. 添加客户端 API 方法
**文件**: `app/client/rest/users.ts`

```typescript
createPersonalTeam = () => {
    return this.doFetch(
        `${this.getUsersRoute()}/personal-team`,
        {method: 'post'},
    );
};
```

### 2. 修改登录流程
**文件**: `app/screens/login/phone_form.tsx`

在用户设置昵称后，立即调用服务端 API 创建个人团队：

```typescript
// 如果用户输入了昵称，更新用户信息
const updateResult = await apiClient.patchMe({nickname: inputNickname});
userNickname = updateResult.nickname || inputNickname;

// 同步更新 loginedUser 对象的昵称
if (loginedUser) {
    loginedUser.nickname = userNickname;
}

// 调用服务端 API 创建个人团队（使用最新的昵称）
try {
    await apiClient.createPersonalTeam();
    debugLog('[Login] Personal team created successfully');
} catch (teamErr) {
    debugLog('[Login] Failed to create personal team:', getFullErrorMessage(teamErr));
    // 继续登录流程，团队创建失败不是致命错误
}
```

### 3. 简化 fetchMyTeams 逻辑
**文件**: `app/actions/remote/team.ts`

将本地创建团队的逻辑替换为调用服务端 API：

```typescript
// 新用户没有团队时，调用服务端 API 创建个人团队
if (teams.length === 0 && !fetchOnly) {
    debugLog('fetchMyTeams', 'No teams found, calling server API to create personal team');
    try {
        // 调用服务端 API 创建个人团队（服务端会使用最新的用户昵称）
        await client.createPersonalTeam();
        
        // 重新获取团队和成员信息
        [teams, memberships] = await Promise.all([
            client.getMyTeams(groupLabel),
            client.getMyTeamMembers(groupLabel),
        ]);
    } catch (createError) {
        debugLog('fetchMyTeams', `Failed to create personal team: ${getFullErrorMessage(createError)}`);
    }
}
```

删除了不再使用的导入：
- `getCurrentUser` from `@queries/servers/user`

## 服务端实现参考

服务端提供 `POST /api/v4/users/personal-team` 端点：

```go
func (a *App) CreatePersonalTeam(rctx request.CTX, user *model.User) (*model.Team, *model.AppError) {
    displayName := user.Nickname
    if displayName == "" {
        displayName = user.Username
    }
    team := &model.Team{
        DisplayName: displayName + "的空间",
        Name: "personal-" + strings.ToLower(user.Id[:8]),
        Type: model.TeamInvite,
    }
    return a.CreateTeam(rctx, team)
}
```

## 优势

1. **数据一致性**: 使用服务端的用户信息，确保使用最新昵称
2. **简化逻辑**: 移除了客户端复杂的团队名称生成逻辑
3. **多语言支持**: 服务端统一处理团队名称格式
4. **错误容忍**: 团队创建失败不会阻塞登录流程

## 测试步骤

1. 使用新手机号注册并登录
2. 在昵称输入对话框中输入昵称（如"小明"）
3. 登录成功后，检查内部群的第一个公共频道名称
4. 预期结果：显示"小明的空间"而不是"手机号的空间"

## 验证日志

登录时应看到以下日志：

```
[Login] Updating user nickname: 小明
[Login] patchMe result: {"nickname":"小明",...}
[Login] Updated loginedUser nickname: 小明
[Login] Creating personal team via server API
[Login] Personal team created successfully
fetchMyTeams: After re-fetch: teams=1, memberships=1
```

## 相关文件

- `app/client/rest/users.ts` - 客户端 API 方法
- `app/screens/login/phone_form.tsx` - 登录流程
- `app/actions/remote/team.ts` - 团队获取逻辑
- 服务端: `server/channels/app/team.go` - CreatePersonalTeam 函数
- 服务端: `server/channels/api4/user.go` - API 端点注册
