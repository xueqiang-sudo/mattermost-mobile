# 隐私合规修复验证指南

## 修复内容

**问题**：APP 在用户同意隐私政策前收集 Android ID、IP、传感器信息

**原因**：`MainApplication.onCreate()` 在应用启动时立即初始化 SDK（OkHttp、TurboLog、SoLoader 等），这些 SDK 会收集设备信息，但此时用户还未同意隐私政策。

**解决方案**：将 SDK 初始化延迟到用户同意隐私政策之后。

---

## 验证方法

### 方法 1：日志验证（推荐，最简单）

我已添加验证日志，tag 为 `PrivacyVerify`。

#### 测试步骤

**1. 清除应用数据**
```bash
adb shell pm clear com.optibot.cn
```

**2. 启动应用并观察日志**
```bash
adb logcat -s PrivacyVerify:* *:S
```

**3. 预期日志顺序**

```
# 阶段 1：应用启动，显示隐私政策（用户未同意）
=== Application.onCreate === hasConsent=false
=== 用户未同意，SDK 初始化已延迟 ===

# 阶段 2：用户点击"同意"按钮
=== 用户点击同意，保存同意状态 ===
=== 开始调用 initializeSdk() ===
=== 开始初始化 SDK（用户已同意） ===

# 阶段 3：第二次启动应用（用户已同意）
=== Application.onCreate === hasConsent=true
=== 用户已同意，立即初始化 SDK ===
=== SDK 已初始化，跳过重复调用 ===
```

#### 关键验证点

✅ **第一次启动**（未同意）：
- `Application.onCreate` 执行时 `hasConsent=false`
- **不应看到** "开始初始化 SDK" 日志
- **不应看到** TurboLog、OkHttp 等 SDK 的初始化日志

✅ **点击同意后**：
- 看到 "用户点击同意" → "开始调用 initializeSdk()" → "开始初始化 SDK"
- 此后才能看到 SDK 相关日志

✅ **第二次启动**（已同意）：
- `Application.onCreate` 执行时 `hasConsent=true`
- 立即看到 "开始初始化 SDK"

---

### 方法 2：网络监控验证

使用 Android Studio 的 Network Profiler 或 Charles/Fiddler 抓包。

#### 测试步骤

1. **清除应用数据**
2. **启动网络监控工具**
3. **启动应用**（显示隐私政策弹窗）
4. **观察网络请求**

#### 预期结果

✅ **用户同意前**：
- **不应有任何网络请求**
- 特别是不应有：
  - 极光推送的注册请求
  - 设备信息上报请求
  - IP 地址查询请求

✅ **用户同意后**：
- 开始出现正常的网络请求
  - 极光推送初始化
  - API 请求等

---

### 方法 3：Android Vitals / Google Play Console

如果应用已上架 Google Play，可以使用 Android Vitals 检查隐私合规性。

#### 检查项

- **数据访问审计**：查看应用何时访问敏感 API
- **网络流量报告**：查看首次网络请求时机
- **权限使用报告**：查看敏感权限首次使用时机

---

### 方法 4：第三方合规检测工具

使用专业的隐私合规检测工具：

#### 国内常用工具

1. **腾讯御安全**
   - https://yunanquan.qq.com/
   - 提供隐私合规检测服务

2. **阿里聚安全**
   - https://jaq.alibaba.com/
   - 隐私合规扫描

3. **梆梆安全**
   - https://www.bangcle.com/
   - 隐私合规检测

4. **爱加密**
   - https://www.ijiami.cn/
   - 隐私合规审计

#### 检测重点

提交 APK 后，检查报告中是否还有：
- ❌ "同意前收集 Android ID"
- ❌ "同意前收集 IP 地址"
- ❌ "同意前读取传感器"
- ❌ "同意前初始化极光 SDK"

---

### 方法 5：代码审计

#### 检查 SDK 初始化时机

```bash
# 搜索所有 SDK 初始化调用
grep -r "\.init\|initialize\|onCreate" android/app/src/main/java --include="*.kt" --include="*.java"
```

#### 验证清单

✅ 确认以下 SDK **仅在 `initializeSdk()` 中初始化**：
- [ ] OkHttpClient
- [ ] TurboLog
- [ ] SoLoader
- [ ] ExpoImageOkHttpClient
- [ ] ApplicationLifecycleDispatcher

✅ 确认以下 SDK **不在 `Application.onCreate()` 直接初始化**：
- [ ] JPush（已在 JS 层延迟初始化）
- [ ] WatermelonDB（在 RN 启动后初始化）
- [ ] 其他第三方 SDK

---

### 方法 6：StrictMode 检测

使用 Android StrictMode 检测敏感操作。

#### 在 `MainApplication.onCreate()` 添加

```kotlin
import android.os.StrictMode

override fun onCreate() {
    // 开启 StrictMode 检测（仅 debug 版本）
    if (BuildConfig.DEBUG) {
        StrictMode.setThreadPolicy(
            StrictMode.ThreadPolicy.Builder()
                .detectNetwork()  // 检测网络操作
                .detectDiskReads()  // 检测磁盘读取
                .detectDiskWrites()  // 检测磁盘写入
                .penaltyLog()  // 记录日志
                .build()
        )
        StrictMode.setVmPolicy(
            StrictMode.VmPolicy.Builder()
                .detectLeakedSqlLiteObjects()
                .detectLeakedClosableObjects()
                .penaltyLog()
                .build()
        )
    }
    
    super.onCreate()
    // ... 其他代码
}
```

#### 预期结果

✅ **用户同意前**：
- StrictMode **不应报告**任何网络/磁盘操作
- Logcat 中不应看到 StrictMode 警告

✅ **用户同意后**：
- StrictMode 可能报告正常的初始化操作（这是允许的）

---

### 方法 7：权限监控

使用 `adb` 监控应用权限使用情况。

```bash
# 监控权限使用（Android 11+）
adb shell appops get com.optibot.cn

# 监控网络访问
adb shell dumpsys netstats | grep com.optibot.cn

# 监控传感器访问
adb shell dumpsys sensorservice | grep com.optibot.cn
```

#### 预期结果

✅ **用户同意前**：
- 不应有网络访问记录
- 不应有传感器访问记录
- 不应有设备 ID 读取记录

---

## 常见问题

### Q1: 清除数据后启动很慢，正常吗？

**正常**。因为：
1. 首次启动不初始化 SDK（等待用户同意）
2. 用户同意后需要初始化多个 SDK
3. MainActivity 启动后还需要加载 React Native

### Q2: 第二次启动比第一次快，正常吗？

**正常**。因为：
1. 用户已同意，SDK 立即初始化
2. 跳过了隐私政策弹窗
3. SharedPreferences 缓存了同意状态

### Q3: 如何测试"不同意"的场景？

**测试步骤**：
1. 清除应用数据
2. 启动应用，显示隐私政策
3. 点击"不同意"
4. 应用应直接关闭（`finish()`）
5. 不应有任何 SDK 初始化日志

### Q4: Deep Link 能绕过隐私政策吗？

**不能**。已在 `MainActivity.onCreate()` 添加二次检查：

```kotlin
val hasConsent = getSharedPreferences(PrivacyConsentActivity.PREF_NAME, MODE_PRIVATE)
    .getBoolean(PrivacyConsentActivity.KEY_CONSENT, false)
if (!hasConsent) {
    startActivity(android.content.Intent(this, PrivacyConsentActivity::class.java))
    finish()
    return
}
```

即使通过 Deep Link 直接启动 MainActivity，也会检查同意状态并跳转回 PrivacyConsentActivity。

---

## 验证报告模板

完成验证后，填写以下报告：

```markdown
## 隐私合规验证报告

**测试日期**：YYYY-MM-DD
**测试设备**：设备型号 / Android 版本
**APK 版本**：版本号 / Build ID

### 测试项目

- [ ] 方法 1：日志验证
  - [ ] 首次启动无 SDK 初始化日志
  - [ ] 点击同意后才初始化 SDK
  - [ ] 第二次启动立即初始化 SDK

- [ ] 方法 2：网络监控
  - [ ] 同意前无网络请求
  - [ ] 同意后有正常网络请求

- [ ] 方法 3：第三方工具检测
  - [ ] 腾讯御安全 / 阿里聚安全 检测通过
  - [ ] 无"同意前收集设备信息"警告

### 测试结论

- [ ] ✅ 通过：所有验证项均符合预期
- [ ] ⚠️ 部分通过：存在问题，需要进一步修复
- [ ] ❌ 未通过：仍存在提前收集数据的行为

### 发现的问题（如有）

1. 问题描述
   - 现象：
   - 原因：
   - 建议修复方案：

### 测试人员

签名：_______________
```

---

## 下一步

1. **立即验证**：使用方法 1（日志验证）快速验证基本功能
2. **全面测试**：使用方法 2-7 进行深度验证
3. **提交审核**：使用第三方工具生成合规报告
4. **持续监控**：上线后关注 Google Play Console 的隐私报告

---

## 联系方式

如有问题，请联系开发团队。
