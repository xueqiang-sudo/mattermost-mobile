#!/usr/bin/env bash
# ==============================================================================
# Mattermost iOS IPA 上传到 TestFlight 脚本
# ==============================================================================
# 用法:
#   ./scripts/upload-testflight.sh <ipa文件路径>
#   ./scripts/upload-testflight.sh                    # 自动查找最新的 IPA 文件
# ==============================================================================

set -e

# 切到项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# --- 配置变量 ---
IPA_PATTERN="Dedalix_*.ipa"
P8_SOURCE="$PROJECT_ROOT/ios/AuthKey_DM595WS6X6.p8"
P8_DEST="$HOME/.private_keys/AuthKey_DM595WS6X6.p8"
API_KEY_ID="DM595WS6X6"
API_ISSUER_ID="e7706107-38b3-4a7b-96c8-b108fddfdeed"

# --- 颜色输出 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# 打印使用说明
usage() {
    echo "用法: $0 [ipa文件路径]"
    echo ""
    echo "参数:"
    echo "  ipa文件路径    可选，指定要上传的 IPA 文件路径"
    echo "                 如果不指定，自动查找最新的 Dedalix_*.ipa 文件"
    echo ""
    echo "示例:"
    echo "  $0                           # 自动查找最新 IPA 并上传"
    echo "  $0 path/to/app.ipa           # 上传指定的 IPA 文件"
}

# 上传到 TestFlight
# 参数: $1 - IPA 文件路径
upload_to_testflight() {
    local ipa_file="$1"

    if [[ ! -f "$ipa_file" ]]; then
        error "IPA 文件不存在: $ipa_file"
        exit 1
    fi

    info "准备上传到 TestFlight..."
    info "IPA 文件: $ipa_file"

    # 确保 p8 密钥文件在 altool 期望的位置
    mkdir -p "$HOME/.private_keys"
    if [[ -f "$P8_SOURCE" ]]; then
        cp "$P8_SOURCE" "$P8_DEST"
        info "已复制 API Key 到 $P8_DEST"
    else
        error "API Key 文件不存在: $P8_SOURCE"
        exit 1
    fi

    # 使用 xcrun altool 上传（API Key 认证，无需 2FA）
    info "正在上传 IPA 到 App Store Connect..."
    xcrun altool --upload-app \
        -f "$ipa_file" \
        --apiKey "$API_KEY_ID" \
        --apiIssuer "$API_ISSUER_ID"

    info "上传完成！请前往 App Store Connect 查看构建状态："
    info "  https://appstoreconnect.apple.com/apps/6779247503/testflight/ios"
}

# --- 主流程 ---
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    usage
    exit 0
fi

# 确定 IPA 文件
if [[ -n "$1" ]]; then
    IPA_FILE="$1"
else
    # 自动查找最新的 IPA 文件
    IPA_FILE=$(ls -t "$PROJECT_ROOT"/$IPA_PATTERN 2>/dev/null | head -1)
    if [[ -z "$IPA_FILE" ]]; then
        error "未找到 IPA 文件，请先构建或指定 IPA 文件路径"
        echo ""
        usage
        exit 1
    fi
    info "自动找到最新 IPA: $IPA_FILE"
fi

upload_to_testflight "$IPA_FILE"

info "全部完成！"
