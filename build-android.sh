#!/bin/bash

# 构建 Android 应用的脚本
# 支持通过 --ignore-bundle 忽略 rn-bundle:android 步骤
# 支持通过 --ignore-patch 忽略 run-patch-pkg 步骤

# 初始化变量
ignore_bundle=false
ignore_patch=false

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --ignore-bundle)
            ignore_bundle=true
            shift
            ;;
        --ignore-patch)
            ignore_patch=true
            shift
            ;;
        *)
            echo "未知参数: $1"
            exit 1
            ;;
    esac
done

# 步骤 1: 使用指定的 Node.js 版本
echo "步骤 1: 使用 Node.js 18.20.0 版本"
nvm use 18.20.0
if [ $? -ne 0 ]; then
    echo "错误: nvm use 18.20.0 失败"
    exit 1
fi

# 步骤 2: 执行 rn-bundle:android（可忽略）
if [ "$ignore_bundle" = false ]; then
    echo "步骤 2: 执行 npm run rn-bundle:android"
    npm run rn-bundle:android
    if [ $? -ne 0 ]; then
        echo "错误: npm run rn-bundle:android 失败"
        exit 1
    fi
else
    echo "步骤 2: 跳过 rn-bundle:android（已忽略）"
fi

# 步骤 3: 执行 run-patch-pkg（可忽略）
if [ "$ignore_patch" = false ]; then
    echo "步骤 3: 执行 npm run run-patch-pkg"
    npm run run-patch-pkg
    if [ $? -ne 0 ]; then
        echo "错误: npm run run-patch-pkg 失败"
        exit 1
    fi
else
    echo "步骤 3: 跳过 run-patch-pkg（已忽略）"
fi

# 步骤 4: 执行 build:android
echo "步骤 4: 执行 npm_config_legacy_peer_deps=true npm run build:android"
npm_config_legacy_peer_deps=true npm run build:android
if [ $? -ne 0 ]; then
    echo "错误: npm run build:android 失败"
    exit 1
fi

echo "构建完成！"
