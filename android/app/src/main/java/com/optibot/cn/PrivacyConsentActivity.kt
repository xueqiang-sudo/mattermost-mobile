package com.optibot.cn

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.text.Html
import android.text.method.LinkMovementMethod
import android.util.TypedValue
import android.widget.ScrollView
import android.widget.TextView

/**
 * 隐私合规：在 React Native 初始化前显示隐私政策弹窗。
 * 用户同意后才启动 MainActivity（React Native），确保 SDK 不会在同意前读取传感器等敏感信息。
 */
class PrivacyConsentActivity : Activity() {

    companion object {
        const val PREF_NAME = "privacy_consent"
        const val KEY_CONSENT = "has_consented"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 已同意过，直接跳转
        if (hasConsented()) {
            startMainActivity()
            return
        }

        showConsentDialog()
    }

    private fun hasConsented(): Boolean {
        return getSharedPreferences(PREF_NAME, MODE_PRIVATE).getBoolean(KEY_CONSENT, false)
    }

    private fun saveConsent() {
        MainApplication.nativeLog(this, "PrivacyVerify", "=== 用户点击同意，保存同意状态 ===")
        getSharedPreferences(PREF_NAME, MODE_PRIVATE).edit().putBoolean(KEY_CONSENT, true).apply()
        // 隐私合规：用户同意后初始化 SDK
        MainApplication.nativeLog(this, "PrivacyVerify", "=== 开始调用 initializeSdk() ===")
        (application as? MainApplication)?.initializeSdk()
    }

    private fun showConsentDialog() {
        val htmlContent = "欢迎您使用允知智构！我们非常重视您的个人信息和隐私保护。" +
            "特别提示您阅读并充分理解" +
            "<a href=\"https://pipeline.optibot.cn/terms\">《用户协议》</a>" +
            "及" +
            "<a href=\"https://pipeline.optibot.cn/privacy\">《隐私政策》</a>" +
            "各条款。如您同意《用户协议》及《隐私政策》，请您点击&ldquo;同意&rdquo;开始使用我们的产品和服务，" +
            "我们将尽全力保护您的个人信息安全。<br/><br/>" +
            "为了向您提供稳定的消息推送服务，我们的产品集成了极光推送SDK。<br/><br/>" +
            "<b>关于极光推送SDK：</b><br/>" +
            "功能目的：用于在您授权后，向您推送及时、有用的消息通知，提升您的使用体验。<br/>" +
            "信息收集：为实现推送功能，该SDK可能会收集您的设备标识信息（如Android ID、OAID、IDFA等）、" +
            "网络状态及设备型号。这些信息将用于生成脱敏的设备标识，确保消息准确送达。<br/>" +
            "隐私保护：我们已与第三方SDK服务商签署数据安全保密协议，严格遵守法律法规及隐私政策要求。" +
            "除非得到您的明示同意，我们不会与其共享您的个人身份信息。"

        val textView = TextView(this).apply {
            text = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                Html.fromHtml(htmlContent, Html.FROM_HTML_MODE_COMPACT)
            } else {
                @Suppress("DEPRECATION")
                Html.fromHtml(htmlContent)
            }
            movementMethod = LinkMovementMethod.getInstance()
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(60, 20, 60, 20)
        }

        val scrollView = ScrollView(this).apply {
            addView(textView)
        }

        AlertDialog.Builder(this)
            .setTitle("服务协议和隐私政策")
            .setView(scrollView)
            .setCancelable(false)
            .setPositiveButton("同意") { _, _ ->
                saveConsent()
                startMainActivity()
            }
            .setNegativeButton("不同意") { _, _ ->
                finish()
            }
            .show()
    }

    private fun startMainActivity() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
