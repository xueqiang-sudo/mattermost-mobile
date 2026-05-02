// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Chat media processing toggles (compress before upload).
 * Change here to roll out or disable without touching call sites.
 * Used by FilePickerUtil, compress helpers, and camera quality hints.
 */
export const ENABLE_VIDEO_COMPRESS = true;

/** When false, gallery/camera images skip react-native-compressor Image path (camera may still use JPEG quality). */
export const ENABLE_IMAGE_COMPRESS = false;

/**
 * Chat video: react-native-compressor `Video.compress`.
 * - **`auto` + `maxSize`**：`compress_chat_video` 在 **Android 上始终用此组合**（`manual`+`maxSize` 会坏片 #380；`manual` 不带 `maxSize` 会保持相机全分辨率 → 糊或体积暴涨）。
 * - **`manual`**：仅 **iOS** 生效（`maxSize` + `bitrate`）。Android 忽略此项，仍走 `auto`。
 */
export type ChatVideoCompressionMethod = 'auto' | 'manual';

/** 默认 `auto`；Android 实际恒为 `auto`（见 `compress_chat_video`）。 */
export const CHAT_VIDEO_COMPRESSION_METHOD: ChatVideoCompressionMethod = 'auto';

/**
 * 竖屏限高、横屏限宽（px）。仅用于压缩端限制输出尺寸，**不用于录制端**。
 * 
 * 分辨率策略（关键）：
 * - 录制端：不设置分辨率限制，使用设备默认的高质量分辨率（通常是 1080p 或更高）
 * - 压缩端：通过 maxSize 限制输出为 960p，避免二次降采样模糊
 * 
 * 为什么这样？
 * - 录制时用高质量分辨率，保留更多细节
 * - 压缩时一次性降采样到 960p，只损失一次画质
 * - 避免"录制 960p → 压缩 960p"的二次降采样问题
 */
export const CHAT_VIDEO_COMPRESS_MAX_SIZE = 960;

/**
 * **仅 iOS 且 `manual` 时**生效（`auto` 忽略）。
 *
 * 码率策略参考微信：
 * - 微信：约 500 Kbps (0.0625 MB/s)，5秒约320KB，但太模糊
 * - 本方案：2.5 Mbps (0.3125 MB/s)，在画质和文件大小之间取得更好平衡
 * - 计算示例：2.5Mbps ÷ 8 = 0.3125 MB/s → 5秒约1.56MB，10秒约3.13MB
 *
 * 对比：
 * - 原 3.8 Mbps：画质较好但文件偏大（10秒约4.75MB）
 * - 微信 0.5 Mbps：文件极小但模糊
 * - 新 2.5 Mbps：画质优秀，文件适中（10秒约3.13MB）
 *
 * 为什么是 2.5 Mbps？
 * - 960p 视频需要足够的码率来保持清晰度
 * - 参考行业标准：960p 通常需要 2-3 Mbps 码率
 * - 比微信高，但保证了画质
 */
export const CHAT_VIDEO_COMPRESS_BITRATE = 2_500_000;

/**
 * VisionCamera `format.videoResolution` 使用设备**横屏**坐标。
 * 
 * **注意**：此配置仅用于录制端的分辨率提示，但为了保证画质，我们不设置限制，
 * 让设备使用默认的高质量分辨率（通常是 1080p 或更高）。
 * 
 * 压缩端通过 CHAT_VIDEO_COMPRESS_MAX_SIZE 限制输出为 960p。
 * 
 * 如果未来需要录制时限制分辨率，请确保：
 * - 录制分辨率 > 压缩 maxSize，避免二次降采样
 * - 例如：录制 1080p → 压缩 960p（一次降采样）
 */
export const CHAT_VIDEO_RECORD_LANDSCAPE_RESOLUTION = {
    width: Math.min(3840, Math.round((CHAT_VIDEO_COMPRESS_MAX_SIZE * 16) / 9)),
    height: CHAT_VIDEO_COMPRESS_MAX_SIZE,
} as const;
