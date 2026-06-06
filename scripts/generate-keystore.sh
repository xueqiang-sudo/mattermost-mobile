#!/usr/bin/env bash

# 生成 Android Release 签名证书 (optibot-release.keystore)
# 用法: ./scripts/generate-keystore.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYSTORE_DIR="$PROJECT_DIR/android/app"
KEYSTORE_FILE="$KEYSTORE_DIR/optibot-release.keystore"
PROPERTIES_FILE="$PROJECT_DIR/android/keystore.properties"
ALIAS="optibot"
VALIDITY_DAYS=10000

echo "============================================"
echo "  Dedalix Android Release 签名证书生成工具"
echo "============================================"
echo ""

# 检查 keytool 是否可用
if ! command -v keytool &> /dev/null; then
    echo "[错误] 未找到 keytool 命令，请确保已安装 JDK"
    exit 1
fi

# 检查是否已存在证书
if [ -f "$KEYSTORE_FILE" ]; then
    echo "[警告] 签名证书已存在: $KEYSTORE_FILE"
    read -p "是否覆盖现有证书？(y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "已取消"
        exit 0
    fi
    rm -f "$KEYSTORE_FILE"
fi

# 生成随机密码 (32位，仅字母数字)
#KEYSTORE_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/' | head -c 32)
KEYSTORE_PASSWORD=3wcw5TiIOTd2F6eMtHxT5fjk25V8VU

echo "[1/3] 正在生成签名证书..."
keytool -genkey -v \
    -keystore "$KEYSTORE_FILE" \
    -alias "$ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity "$VALIDITY_DAYS" \
    -storepass "$KEYSTORE_PASSWORD" \
    -keypass "$KEYSTORE_PASSWORD" \
    -dname "CN=Dedalix, OU=Dedalix, O=Dedalix, L=Beijing, ST=Beijing, C=CN" > /dev/null 2>&1

echo "  ✓ 签名证书已生成: $KEYSTORE_FILE"

# 写入密码配置文件
echo "[2/3] 正在写入密码配置文件..."
mkdir -p "$(dirname "$PROPERTIES_FILE")"
cat > "$PROPERTIES_FILE" << EOF
MATTERMOST_RELEASE_STORE_FILE=optibot-release.keystore
MATTERMOST_RELEASE_PASSWORD=$KEYSTORE_PASSWORD
MATTERMOST_RELEASE_KEY_ALIAS=$ALIAS
EOF
echo "  ✓ 密码文件已写入: $PROPERTIES_FILE"

# 获取并输出 SHA256
echo "[3/3] 正在获取 SHA256 指纹..."
echo ""
echo "============================================"
echo "  Release 签名证书 SHA256"
echo "============================================"
keytool -list -v \
    -keystore "$KEYSTORE_FILE" \
    -storepass "$KEYSTORE_PASSWORD" \
    -keypass "$KEYSTORE_PASSWORD" \
    -alias "$ALIAS" 2>/dev/null | grep -E "(SHA256|生效时间|失效时间)"

echo ""
echo "============================================"
echo "  生成完成！"
echo "============================================"
echo ""
echo "文件列表:"
echo "  签名证书: $KEYSTORE_FILE"
echo "  密码文件: $PROPERTIES_FILE"
echo ""
echo "安全提醒:"
echo "  1. 密码文件和 keystore 文件请妥善保管，丢失后无法恢复"
echo "  2. 这两个文件已通过 .gitignore 排除，不会被提交到 Git"
echo "  3. 建议将密码备份到 1Password 等密码管理工具"
echo "  4. 建议将 keystore 文件备份到安全位置"