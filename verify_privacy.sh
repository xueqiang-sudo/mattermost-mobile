#!/bin/bash

# 隐私合规验证脚本
# 用于快速验证 SDK 是否在用户同意前初始化

PACKAGE="com.optibot.cn"
TAG="PrivacyVerify"

echo "======================================"
echo "隐私合规验证工具"
echo "======================================"
echo ""

# 检查 adb 连接
if ! command -v adb &> /dev/null; then
    echo "❌ 错误：未找到 adb，请确保已安装 Android SDK Platform Tools"
    exit 1
fi

if ! adb devices | grep -q "device$"; then
    echo "❌ 错误：未检测到已连接的设备"
    echo "请确保："
    echo "  1. 手机已开启 USB 调试"
    echo "  2. 手机已通过 USB 连接"
    echo "  3. 已在手机上授权 USB 调试"
    exit 1
fi

echo "✅ 已检测到设备"
echo ""

# 选择操作
echo "请选择操作："
echo "1. 清除应用数据并监控日志（推荐）"
echo "2. 仅监控日志（不清除数据）"
echo "3. 查看当前同意状态"
echo ""
read -p "请输入选项 (1-3): " choice

case $choice in
    1)
        echo ""
        echo "📱 清除应用数据..."
        adb shell pm clear $PACKAGE

        echo ""
        echo "🔍 开始监控日志..."
        echo "======================================"
        echo "预期日志顺序："
        echo "======================================"
        echo "1. Application.onCreate === hasConsent=false"
        echo "2. 用户未同意，SDK 初始化已延迟"
        echo "3. （显示隐私政策弹窗）"
        echo "4. 用户点击同意，保存同意状态"
        echo "5. 开始调用 initializeSdk()"
        echo "6. 开始初始化 SDK（用户已同意）"
        echo "======================================"
        echo ""
        echo "按 Ctrl+C 停止监控"
        echo ""

        # 监控日志
        adb logcat -s $TAG:* *:S
        ;;

    2)
        echo ""
        echo "🔍 开始监控日志（不清除数据）..."
        echo "======================================"
        echo "提示：请重新启动应用以观察日志"
        echo "按 Ctrl+C 停止监控"
        echo ""

        adb logcat -s $TAG:* *:S
        ;;

    3)
        echo ""
        echo "📊 检查当前同意状态..."

        # 获取 SharedPreferences 文件路径
        PREF_FILE="/data/data/$PACKAGE/shared_prefs/privacy_consent.xml"

        # 检查文件是否存在
        if adb shell "test -f $PREF_FILE" 2>/dev/null; then
            echo "✅ 找到隐私政策配置文件"
            echo ""
            echo "文件内容："
            adb shell "cat $PREF_FILE" 2>/dev/null | grep -E "boolean|name"
        else
            echo "❌ 未找到隐私政策配置文件"
            echo "说明：用户尚未同意隐私政策，或文件已被删除"
        fi
        ;;

    *)
        echo "❌ 无效的选项"
        exit 1
        ;;
esac

echo ""
echo "======================================"
echo "验证完成"
echo "======================================"
