# App 版本更新检测 —— 后端接口说明文档

> 本文档供后端开发人员参考，说明移动端 App 强制/非强制更新功能所需的后端 API 接口。

***

## 1. 接口概述

| 项目       | 描述                                     |
| -------- | -------------------------------------- |
| **接口名称** | 移动端 App 版本检测                           |
| **接口路径** | `GET /api/v4/mobile/app_version_check` |
| **调用时机** | App 冷启动时、从后台恢复到前台时                     |
| **调用频率** | 每次冷启动最多 1 次；前台恢复有冷却间隔（默认 1 小时）         |
| **超时时间** | 建议 5s 内响应（客户端超时 10s）                   |

***

## 2. 请求参数

### Query Parameters

| 参数名            | 类型     | 必填 | 示例        | 说明                        |
| -------------- | ------ | -- | --------- | ------------------------- |
| `platform`     | string | ✅  | `android` | 平台标识：`android` 或 `ios`    |
| `app_version`  | string | ✅  | `2.38.5`  | 客户端当前 App 版本号（语义化版本）      |
| `build_number` | string | 否  | `478`     | 客户端当前 Build 号（可选，用于更精细控制） |

### 请求示例

```
GET /api/v4/mobile/app_version_check?platform=android&app_version=2.38.0&build_number=450
GET /api/v4/mobile/app_version_check?platform=ios&app_version=2.38.5
```

***

## 3. 响应格式

### 成功响应 (HTTP 200)

```json
{
    "update_type": "suggest",
    "latest_version": "2.40.0",
    "latest_build_number": "500",
    "min_supported_version": "2.38.0",
    "update_title": "发现新版本 v2.40.0",
    "update_description": "本次更新：\n- 修复了若干已知问题\n- 优化了消息加载速度\n- 新增了暗黑模式支持",
    "download_url_android": "https://download.your-company.com/app/v2.40.0/app-release.apk",
    "app_store_id_ios": "1234567890",
    "package_name_android": "com.mattermost.rn",
    "release_date": "2026-05-01T10:00:00Z",
    "force_update_until": null
}
```

### 无需更新响应

```json
{
    "update_type": "none",
    "latest_version": "2.38.5",
    "latest_build_number": "478",
    "min_supported_version": "2.30.0",
    "update_title": null,
    "update_description": null,
    "download_url_android": null,
    "app_store_id_ios": null,
    "package_name_android": null,
    "release_date": null,
    "force_update_until": null
}
```

***

## 4. 字段详细说明

### 4.1 `update_type` —— 更新类型（核心字段）

| 值         | 含义            | 客户端行为                               |
| --------- | ------------- | ----------------------------------- |
| `none`    | 已是最新版本，无需更新   | 不做任何提示，正常进入 App                     |
| `suggest` | 存在新版本，建议用户更新  | 弹出「建议更新」弹窗，用户可选择「立即更新」或「稍后再说」       |
| `force`   | 当前版本过低，必须强制更新 | 弹出「强制更新」弹窗，用户只能选择「立即更新」，关闭弹窗则退出 App |

### 4.2 其他字段说明

| 字段                      | 类型           | 必填 | 默认值    | 说明                                                   |
| ----------------------- | ------------ | -- | ------ | ---------------------------------------------------- |
| `latest_version`        | string       | ✅  | -      | 当前平台的最新版本号，格式 `x.y.z`                                |
| `latest_build_number`   | string       | 否  | `""`   | 最新 Build 号                                           |
| `min_supported_version` | string       | ✅  | -      | 最低支持的版本号，低于此版本将触发强制更新                                |
| `update_title`          | string       | 否  | `null` | 更新弹窗标题，`null` 时使用客户端默认文案                             |
| `update_description`    | string       | 否  | `null` | 更新弹窗详细描述，`null` 时使用客户端默认文案                           |
| `download_url_android`  | string       | 否  | `null` | Android APK 直接下载地址（企业内部分发场景），`null` 时跳转应用商店          |
| `app_store_id_ios`      | string       | 否  | `null` | iOS App Store 的 Apple ID（数字字符串），用于跳转 App Store       |
| `package_name_android`  | string       | 否  | `null` | Android 包名，用于跳转 Google Play 或国内应用商店                  |
| `release_date`          | string       | 否  | `null` | 新版本发布日期，ISO 8601 格式                                  |
| `force_update_until`    | string\|null | 否  | `null` | 强制更新的截止时间，超过此时间后 `force` 可降级为 `suggest`。`null` 表示不降级 |

***

## 5. 后端判断逻辑（推荐实现）

```
function determineUpdateType(platform, appVersion):
    // 1. 从配置中获取当前平台的版本策略
    config = getAppVersionConfig(platform)
    
    // 2. 如果未配置该平台，返回无需更新
    if config == null:
        return "none"
    
    // 3. 比较版本号（使用 semver 语义化版本比较）
    currentVersion = semver.parse(appVersion)
    latestVersion = semver.parse(config.latest_version)
    minSupportedVersion = semver.parse(config.min_supported_version)
    
    // 4. 判定逻辑
    if currentVersion >= latestVersion:
        return "none"           // 已是最新
    else if currentVersion < minSupportedVersion:
        return "force"          // 低于最低支持版本，强制更新
    else:
        return "suggest"        // 有新版本但高于最低支持，建议更新
```

### 版本比较注意点

- 使用语义化版本比较（Semantic Versioning 2.0.0），格式为 `MAJOR.MINOR.PATCH`
- 版本号比较时应忽略预发布标识（如 `-beta.1`、`-rc.2`）
- 如果 `app_version` 参数格式不合法（如缺少 PATCH 位），应返回 `400 Bad Request`

***

## 6. 管理后台配置建议

建议在管理后台新增一个 **「移动端版本管理」** 配置页面，包含以下配置项：

### 按平台独立配置

| 配置项              | 类型       | 说明            | 示例                     |
| ---------------- | -------- | ------------- | ---------------------- |
| 平台               | 下拉选择     | Android / iOS | `android`              |
| 最新版本号            | 文本输入     | 当前发布的最新版本     | `2.40.0`               |
| 最新 Build 号       | 文本输入     | 当前最新 Build    | `500`                  |
| 最低支持版本           | 文本输入     | 低于此版本必须强制更新   | `2.38.0`               |
| 更新标题             | 多行文本(选填) | 弹窗标题文案        | `发现新版本 v2.40.0`        |
| 更新描述             | 多行文本(选填) | 弹窗描述文案        | `- 修复了若干问题...`         |
| Android 下载地址     | URL(选填)  | APK 直链        | `https://...`          |
| iOS App Store ID | 文本(选填)   | 苹果商店应用ID      | `1234567890`           |
| Android 包名       | 文本(选填)   | 应用包名          | `com.mattermost.rn`    |
| 强制更新时间           | 日期时间(选填) | 强制更新截止时间      | `2026-05-10T00:00:00Z` |
| 启用状态             | 开关       | 是否启用该平台的更新检测  | `是`                    |

### 数据库表结构建议 (MySQL)

```sql
CREATE TABLE mobile_app_versions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    platform VARCHAR(20) NOT NULL COMMENT '平台: android/ios',
    latest_version VARCHAR(20) NOT NULL COMMENT '最新版本号',
    latest_build_number VARCHAR(20) DEFAULT '' COMMENT '最新Build号',
    min_supported_version VARCHAR(20) NOT NULL COMMENT '最低支持版本',
    update_title VARCHAR(200) DEFAULT '' COMMENT '更新弹窗标题',
    update_description TEXT COMMENT '更新弹窗描述',
    download_url_android VARCHAR(500) DEFAULT '' COMMENT 'Android下载地址',
    app_store_id_ios VARCHAR(50) DEFAULT '' COMMENT 'iOS App Store ID',
    package_name_android VARCHAR(100) DEFAULT '' COMMENT 'Android包名',
    release_date DATETIME COMMENT '发布日期',
    force_update_until DATETIME DEFAULT NULL COMMENT '强制更新截止时间',
    is_enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_platform (platform)
);
```

***

## 7. 接口实现伪代码 (Go 示例)

```go
// GET /api/v4/mobile/app_version_check
func (a *App) checkAppVersion(c *gin.Context) {
    platform := c.Query("platform")
    appVersion := c.Query("app_version")
    buildNumber := c.DefaultQuery("build_number", "")

    // 参数校验
    if platform != "android" && platform != "ios" {
        c.JSON(400, gin.H{"status": "ERROR", "message": "invalid platform"})
        return
    }
    if !semver.IsValid(appVersion) {
        c.JSON(400, gin.H{"status": "ERROR", "message": "invalid app_version format"})
        return
    }

    // 查询平台配置
    config, err := a.store.GetMobileVersionConfig(platform)
    if err != nil || config == nil || !config.IsEnabled {
        // 未配置或未启用，返回无需更新
        c.JSON(200, newNoneUpdateResponse())
        return
    }

    // 判定更新类型
    updateType := determineUpdateType(appVersion, config)
    
    // 若为强制更新但已过强制期，降级为建议更新
    if updateType == "force" && config.ForceUpdateUntil != nil && time.Now().After(*config.ForceUpdateUntil) {
        updateType = "suggest"
    }

    c.JSON(200, gin.H{
        "status": "OK",
        "data": buildResponseData(updateType, config),
    })
}
```

***

## 8. 注意事项

1. **缓存策略**: 该接口不需要客户端频繁调用，服务端可对同一 `platform + version` 组合做短期缓存（如 5 分钟），减轻 DB 压力。
2. **向后兼容**: 如果后端暂时无法实现此接口，客户端已做了伪实现和 fallback 处理：
   - 可在 `assets/base/config.json` 中配置 `EnableAppUpdateCheck: false` 关闭功能
   - 接口调用失败（超时、404、500）时客户端静默处理，不影响正常使用
3. **灰度发布支持（可选扩展）**: 如需支持灰度，可在请求参数中增加 `device_id` / `user_id`，服务端根据灰度策略返回不同结果。
4. **安全考量**: 本接口不需要认证（冷启动时可能未登录），建议：
   - 对该接口做简单的限流（如 IP 级别 1 req/s）
   - 不要返回敏感信息

***

## 9. 客户端伪实现说明

在等待后端接口就绪期间，前端已实现了以下伪接口 fallback 机制：

- 在 `assets/base/config.json` 中配置本地的版本策略
- 客户端内置了一个 `checkAppVersionMock` 函数，读取本地配置并进行版本比较
- 当 `EnableAppUpdateCheck: true` 但后端接口不可用时，自动降级使用本地伪实现
- 后端接口就绪后，只需在 config.json 中配置正确的 URL，即可无缝切换到真实接口

这样后端可以先准备接口，前端可以先完成 UI 和逻辑开发，双方可以并行推进。
