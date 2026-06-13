#!/usr/bin/env bash

# 是否应用 16KB 页面大小补丁的标志，默认为 false
APPLY_16KB_PATCH=false

function execute() {
    local env_flag=""
    case "$1" in
        ios)
            case "$2" in
                simulator) env_flag="--env ios.simulator" ;;
                *) env_flag="--env ios.release" ;;
            esac
            ;;
        android)
            env_flag="--env android.release"
            ;;
    esac
    cd fastlane && NODE_ENV=production bundle exec fastlane $1 $2 $env_flag
}

function cleanupAndroid16kbPagesizePatch() {
  # Only cleanup if we ran setup (SKIP_SETUP not set) and actually applied the patch
  if [[ -z "$SKIP_SETUP" && "$APPLY_16KB_PATCH" == "true" ]]; then
    echo "Reverting 16KB page size patch changes..."
    # Get the git root directory to ensure we're in the right place
    local git_root=$(git rev-parse --show-toplevel)
    cd "$git_root" || return
    git checkout -- package.json package-lock.json app.json ios/Podfile.lock android/app/src/main/AndroidManifest.xml app/components/expo_image/index.tsx android/buildscript-gradle.lockfile patches/
    git clean -fd patches/ package.json.orig android/app/src/main/assets/index.android.bundle
    echo "✓ Patch changes reverted"
  fi
}

function apk() {
  case $1 in
    unsigned)
      echo "Building Android unsigned app"
      setup android
      execute android unsigned
      cleanupAndroid16kbPagesizePatch
    ;;
    *)
      echo "Building Android app"
      setup android
      execute android build
      cleanupAndroid16kbPagesizePatch
  esac
}

function ipa() {
  case $1 in
    unsigned)
      echo "Building iOS unsigned app"
      setup ios
      execute ios unsigned
    ;;
    simulator)
      echo "Building unsigned x86_64 iOS app for iPhone simulator"
      setup ios
      execute ios simulator
    ;;
    *)
      echo "Building iOS app"
      setup ios
      execute ios build
  esac
}

function installGemsAndPods() {
    echo "Installing Gems"
    npm run ios-gems
    echo "Getting Cocoapods dependencies"
    npm run pod-install
}

function installGemsAndPodsM1() {
    echo "Installing Gems"
    npm run ios-gems-m1
    echo "Getting Cocoapods dependencies"
    npm run pod-install-m1
}

function setup() {
    if [[ -z "$SKIP_SETUP" ]]; then
        npm run clean || exit 1
        npm install --ignore-scripts || exit 1
        
        # Apply 16KB page size patch for Android builds (includes npx patch-package)
        if [[ "$1" == "android"* && "$APPLY_16KB_PATCH" == "true" ]]; then
          echo "Applying 16KB page size compatibility patch for Android"
          npm run apply-16kb-pagesize-patch || exit 1
        else
          # For non-Android builds or when patch disabled, just apply regular patches
          npx patch-package || exit 1
        fi
        
        node node_modules/\@sentry/cli/scripts/install.js || exit 1

        if [[ "$1" == "ios"* ]]; then
          if [[ $(uname -p) == 'arm' ]]; then
            installGemsAndPodsM1 || exit 1
          else
            installGemsAndPods || exit 1
          fi
        fi

        COMPASS_ICONS="node_modules/@mattermost/compass-icons/font/compass-icons.ttf"
        if [ -z "$COMPASS_ICONS" ]; then
            echo "Compass Icons font not found"
            exit 1
        else
            echo "Configuring Compass Icons font"
            cp "$COMPASS_ICONS" "assets/fonts/"
            cp "$COMPASS_ICONS" "android/app/src/main/assets/fonts"
        fi

        ASSETS=$(node scripts/generate-assets.js)
        if [ -z "$ASSETS" ]; then
            echo "Error Generating app assets"
            exit 1
        else
            echo "Generating app assets"
        fi

        echo "Installing Fastane"
        if !gem list bundler -i --version 2.5.11 > /dev/null 2>&1; then
          gem install bundler --versio 2.5.11
        fi
        cd fastlane && bundle install && cd .. || exit 1
    fi

    if [ "$1" = "android" ]; then
      ./node_modules/.bin/jetify
    fi
}

# 解析命令行参数
BUILD_TYPE=""
BUILD_SUBTYPE=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --16kb-patch)
            APPLY_16KB_PATCH=true
            shift
            ;;
        apk|ipa)
            BUILD_TYPE="$1"
            shift
            if [[ "$#" -gt 0 && ! "$1" == "--"* ]]; then
                BUILD_SUBTYPE="$1"
                shift
            fi
            ;;
        *)
            # 处理其他参数
            if [[ -z "$BUILD_TYPE" ]]; then
                BUILD_TYPE="$1"
            elif [[ -z "$BUILD_SUBTYPE" && ! "$1" == "--"* ]]; then
                BUILD_SUBTYPE="$1"
            fi
            shift
            ;;
    esac
done

case $BUILD_TYPE in
  apk)
    apk $BUILD_SUBTYPE
  ;;
  ipa)
    if [[ "$OSTYPE" == "darwin"* ]]; then
      ipa $BUILD_SUBTYPE
    else
      echo "You need a MacOS to build the iOS mobile app"
      exit 1
    fi
  ;;
  *)
    echo "Build the mobile app for Android or iOS
    Usage: build.sh <type> [options] [--16kb-patch]
    
    Type:
      apk   Builds Android APK(s)
      ipa   Builds iOS IPA
      
    Options:
      apk: unsigned
      ipa: unsigned or simulator
      
    Additional Options:
      --16kb-patch   Apply the 16KB page size compatibility patch for Android"
  ;;
esac
