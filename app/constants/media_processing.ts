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
