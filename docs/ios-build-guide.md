# Mattermost iOS 构建与 TestFlight 部署指南

## 一、前置准备

### 1.1 必需的账号与文件

| 项目 | 说明 |
|------|------|
| Apple 开发者账号 | `wxwlhy@sina.com`，团队 `Beijing Yunzhi Technology Co., Ltd.` (DAR9DHG22M) |
| App Store Connect API Key | `ios/AuthKey_DM595WS6X6.p8`（存放于项目目录） |
| API Key ID | `DM595WS6X6` |
| API Issuer ID | `e7706107-38b3-4a7b-96c8-b108fddfdeed` |
| Match 证书仓库 | `ssh://git@118.195.136.154:2522/mattermost-codes/build-helpers/ios-certificates.git` |
| Match 加密密码 | `srcc-fwsz-xobt-nzxj` |
| App Bundle ID | `com.optibot.cn` |
| App Store Connect App ID | `6779247503` |

### 1.2 环境要求

- macOS 系统
- Xcode (含 Command Line Tools)
- Node.js 与 npm
- Ruby (通过 rbenv 管理)
- SSH 能访问证书仓库 `118.195.136.154:2522`

---

## 二、核心配置文件

### 2.1 `fastlane/.env.ios.release` — 环境变量

```ini
APP_NAME=Dedalix
APP_SCHEME=mattermost
BUILD_FOR_RELEASE=true
FASTLANE_TEAM_ID=DAR9DHG22M
FASTLANE_XCODEBUILD_SETTINGS_TIMEOUT=120
IOS_API_KEY_ID=DM595WS6X6
IOS_API_ISSUER_ID=e7706107-38b3-4a7b-96c8-b108fddfdeed
MAIN_APP_IDENTIFIER=com.optibot.cn
MATCH_APP_IDENTIFIER=com.optibot.cn.MattermostShare,com.optibot.cn
MATCH_PASSWORD=srcc-fwsz-xobt-nzxj
MATCH_READONLY=false
MATCH_TYPE=appstore
MATCH_USERNAME=wxwlhy@sina.com
SYNC_PROVISIONING_PROFILES=true
REPLACE_ASSETS=true
```

### 2.2 `fastlane/Matchfile` — Match 证书管理配置

```ruby
git_url("ssh://git@118.195.136.154:2522/mattermost-codes/build-helpers/ios-certificates.git")
storage_mode("git")
type("appstore")
team_id("DAR9DHG22M")
app_identifier(["com.optibot.cn", "com.optibot.cn.MattermostShare"])
readonly(false)
shallow_clone(true)
skip_docs(true)
```

### 2.3 `ios/Mattermost.xcodeproj/project.pbxproj` — Team ID

所有 `DevelopmentTeam` 已替换为 `DAR9DHG22M`。

---

## 三、一键构建与上传脚本

### 3.1 脚本位置

`scripts/build-and-upload.sh`

### 3.2 用法

```bash
# 仅构建 IPA（增量构建，跳过 npm install / pod install）
./scripts/build-and-upload.sh

# 完整构建（含 npm install / pod install 等 setup）
./scripts/build-and-upload.sh --full

# 构建并上传到 TestFlight
./scripts/build-and-upload.sh --upload

# 完整构建并上传到 TestFlight
./scripts/build-and-upload.sh --full --upload

# 仅同步证书（从 Apple Developer Portal 下载）
./scripts/build-and-upload.sh --match
```

### 3.3 脚本执行流程

```
┌─────────────────────────────────────┐
│  1. 同步证书 (Match)                │
│     fastlane match appstore         │
│     --env ios.release               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  2. 构建 IPA                        │
│     SKIP_SETUP=1 ./scripts/build.sh │
│     ipa                             │
│     ├── 更新 Plist / Entitlements   │
│     ├── 同步 Provisioning Profile   │
│     ├── 替换 Assets                 │
│     └── xcodebuild archive + export │
│     输出: Dedalix_2.39.0.ipa       │
└──────────────┬──────────────────────┘
               │ (如果指定 --upload)
               ▼
┌─────────────────────────────────────┐
│  3. 上传 TestFlight                 │
│     xcrun altool --upload-app       │
│     --apiKey DM595WS6X6             │
│     --apiIssuer e7706107-...        │
└─────────────────────────────────────┘
```

---

## 四、手动命令参考

### 4.1 同步证书

```bash
cd fastlane && MATCH_PASSWORD="srcc-fwsz-xobt-nzxj" \
  bundle exec fastlane match appstore --env ios.release
```

### 4.2 构建 IPA（增量，跳过 setup）

```bash
SKIP_SETUP=1 ./scripts/build.sh ipa
```

### 4.3 构建 IPA（完整构建）

```bash
./scripts/build.sh ipa
```

### 4.4 上传到 TestFlight

```bash
# 确保 API Key 在正确位置
mkdir -p ~/.private_keys
cp ios/AuthKey_DM595WS6X6.p8 ~/.private_keys/

# 上传
xcrun altool --upload-app \
  -f Dedalix_2.39.0.ipa \
  --apiKey DM595WS6X6 \
  --apiIssuer e7706107-38b3-4a7b-96c8-b108fddfdeed
```

### 4.5 查看 TestFlight 构建状态

访问：https://appstoreconnect.apple.com/apps/6779247503/testflight/ios

---

## 五、关键过程记录

### 5.1 解决过的问题

| 问题 | 解决方案 |
|------|----------|
| Team ID 不匹配 | 替换 `project.pbxproj` 中 `UQ8HT4Q2XM` → `DAR9DHG22M` |
| `.env` 文件未被加载 | 修改 `scripts/build.sh` 添加 `--env ios.release` 参数 |
| `MATCH_APP_IDENTIFIER` 为 nil | 通过 `--env` 参数正确加载 `.env.ios.release` |
| Match 用密码认证失败 | 改为优先使用 API Key 认证（`Fastfile` 第 678 行） |
| Distribution 证书数量上限 | 撤销旧的 Distribution 证书 |
| `altool` 找不到 `.p8` 文件 | 复制到 `~/.private_keys/` 目录 |
| `pilot` 上传用密码认证失败 | 改用 `xcrun altool` + API Key 直接上传 |

### 5.2 证书管理

- **证书类型**: Distribution (App Store)
- **管理方式**: Match (git 存储)
- **认证方式**: App Store Connect API Key (p8)，无需 2FA
- **证书仓库**: `ssh://git@118.195.136.154:2522/mattermost-codes/build-helpers/ios-certificates.git`

---

## 六、常见问题

### Q: 构建时 SSH 连接超时？

确认能访问 `118.195.136.154:2522`：
```bash
ssh -T -p 2522 git@118.195.136.154
```

### Q: Match 提示证书数量上限？

登录 [Apple Developer Portal](https://developer.apple.com/account/resources/certificates/list) 撤销不需要的 Distribution 证书。

### Q: 上传 TestFlight 失败？

确认 `~/.private_keys/AuthKey_DM595WS6X6.p8` 存在且内容正确。API Key 在 App Store Connect 中须有 **Developer** 权限。