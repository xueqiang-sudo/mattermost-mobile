#!/usr/bin/env bash
# ==============================================================================
# Mattermost iOS 构建与 TestFlight 上传一体化脚本
# ==============================================================================
# 用法:
#   ./scripts/build-and-upload.sh              # 仅构建 IPA（跳过 setup）
#   ./scripts/build-and-upload.sh --full       # 完整构建（含 setup 步骤）
#   ./scripts/build-and-upload.sh --upload     # 构建并上传到 TestFlight
#   ./scripts/build-and-upload.sh --full --upload  # 完整构建并上传到 TestFlight
#   ./scripts/build-and-upload.sh --match      # 仅同步证书（从 Apple Developer Portal）
# ==============================================================================

set -e

# 切到项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# --- 配置变量 ---
FASTLANE_DIR="$PROJECT_ROOT/fastlane"
ENV_FILE="ios.release"
IPA_PATTERN="Dedalix_*.ipa"
P8_SOURCE="$PROJECT_ROOT/ios/AuthKey_DM595WS6X6.p8"
P8_DEST="$HOME/.private_keys/AuthKey_DM595WS6X6.p8"
MATCH_PASSWORD="srcc-fwsz-xobt-nzxj"
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
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --full      完整构建（包含 npm install, pod install 等 setup 步骤）"
    echo "  --upload    构建完成后上传到 TestFlight"
    echo "  --match     仅同步证书和 Provisioning Profile（从 Apple Developer Portal）"
    echo "  -h, --help  显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                    # 仅构建 IPA（跳过 setup，适合增量构建）"
    echo "  $0 --full             # 完整构建（首次构建使用）"
    echo "  $0 --upload           # 构建并上传到 TestFlight"
    echo "  $0 --full --upload    # 完整构建并上传到 TestFlight"
    echo "  $0 --match            # 仅同步证书"
}

# 同步证书（Match）
sync_certs() {
    info "正在同步证书和 Provisioning Profile..."
    cd "$FASTLANE_DIR"
    MATCH_PASSWORD="$MATCH_PASSWORD" bundle exec fastlane match appstore --env "$ENV_FILE"
    cd "$PROJECT_ROOT"
    info "证书同步完成"
}

# 构建 IPA
build_ipa() {
    local full_build="$1"
    info "开始构建 iOS IPA..."

    if [[ "$full_build" == "true" ]]; then
        info "执行完整构建（含 setup 步骤）..."
        unset SKIP_SETUP
    else
        info "执行增量构建（跳过 setup 步骤）..."
        export SKIP_SETUP=1
    fi

    ./scripts/build.sh ipa

    # 查找生成的 IPA 文件
    local ipa_file=$(ls -t "$PROJECT_ROOT"/$IPA_PATTERN 2>/dev/null | head -1)
    if [[ -z "$ipa_file" ]]; then
        error "构建失败：未找到 IPA 文件"
        exit 1
    fi

    info "IPA 构建成功: $ipa_file"
    echo "$ipa_file"
}

# 上传到 TestFlight
upload_to_testflight() {
    local ipa_file="$1"

    if [[ ! -f "$ipa_file" ]]; then
        error "IPA 文件不存在: $ipa_file"
        exit 1
    fi

    info "准备上传到 TestFlight..."

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
FULL_BUILD=false
DO_UPLOAD=false
DO_MATCH_ONLY=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --full)    FULL_BUILD=true; shift ;;
        --upload)  DO_UPLOAD=true; shift ;;
        --match)   DO_MATCH_ONLY=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *)         echo "未知参数: $1"; usage; exit 1 ;;
    esac
done

# 仅同步证书模式
if [[ "$DO_MATCH_ONLY" == "true" ]]; then
    sync_certs
    exit 0
fi

# 构建前先同步证书
sync_certs

# 构建 IPA
IPA_FILE=$(build_ipa "$FULL_BUILD")

# 上传到 TestFlight（如果指定了 --upload）
if [[ "$DO_UPLOAD" == "true" ]]; then
    upload_to_testflight "$IPA_FILE"
fi

info "全部完成！"