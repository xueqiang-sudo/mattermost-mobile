#!/usr/bin/env bash

# 获取 Android Debug 和 Release 签名证书的 SHA256 指纹
# 用法: ./scripts/get-sha256.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYSTORE_DIR="$PROJECT_DIR/android/app"
DEBUG_KEYSTORE="$KEYSTORE_DIR/debug.keystore"
RELEASE_KEYSTORE="$KEYSTORE_DIR/optibot-release.keystore"
PROPERTIES_FILE="$PROJECT_DIR/android/keystore.properties"

# 检查 keytool 是否可用
if ! command -v keytool &> /dev/null; then
    echo "[错误] 未找到 keytool 命令，请确保已安装 JDK"
    exit 1
fi

echo "============================================"
echo "  Optibot Android 签名证书 SHA256 指纹"
echo "============================================"
echo ""

# Debug 签名证书 SHA256
if [ -f "$DEBUG_KEYSTORE" ]; then
    echo "--- Debug 签名证书 ---"
    echo "  文件: android/app/debug.keystore"
    keytool -list -v \
        -keystore "$DEBUG_KEYSTORE" \
        -storepass android \
        -keypass android \
        -alias androiddebugkey 2>/dev/null | grep -E "(所有者|生效时间|失效时间|SHA256)"
    echo ""
else
    echo "[警告] Debug 签名证书不存在: $DEBUG_KEYSTORE"
    echo ""
fi

# Release 签名证书 SHA256
if [ -f "$RELEASE_KEYSTORE" ] && [ -f "$PROPERTIES_FILE" ]; then
    # 从 keystore.properties 读取密码
    RELEASE_PASSWORD=$(grep "MATTERMOST_RELEASE_PASSWORD=" "$PROPERTIES_FILE" | cut -d'=' -f2)
    RELEASE_ALIAS=$(grep "MATTERMOST_RELEASE_KEY_ALIAS=" "$PROPERTIES_FILE" | cut -d'=' -f2)

    if [ -n "$RELEASE_PASSWORD" ] && [ -n "$RELEASE_ALIAS" ]; then
        echo "--- Release 签名证书 ---"
        echo "  文件: android/app/optibot-release.keystore"
        keytool -list -v \
            -keystore "$RELEASE_KEYSTORE" \
            -storepass "$RELEASE_PASSWORD" \
            -keypass "$RELEASE_PASSWORD" \
            -alias "$RELEASE_ALIAS" 2>/dev/null | grep -E "(所有者|生效时间|失效时间|SHA256)"
        echo ""
    else
        echo "[错误] 无法从 keystore.properties 读取密码"
    fi
elif [ -f "$RELEASE_KEYSTORE" ]; then
    echo "[提示] Release 证书存在但密码文件不存在，无法读取 SHA256"
    echo "  请确保 android/keystore.properties 文件存在"
    echo "  或运行 ./scripts/generate-keystore.sh 重新生成"
    echo ""
else
    echo "[提示] Release 签名证书不存在"
    echo "  请运行 ./scripts/generate-keystore.sh 生成"
    echo ""
fi

echo "============================================"
echo "  完成"
echo "============================================"