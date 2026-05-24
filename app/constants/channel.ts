// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export const MIN_CHANNEL_NAME_LENGTH = 1;
export const MAX_CHANNEL_NAME_LENGTH = 64;
export const IGNORE_CHANNEL_MENTIONS_ON = 'on';
export const IGNORE_CHANNEL_MENTIONS_OFF = 'off';
export const IGNORE_CHANNEL_MENTIONS_DEFAULT = 'default';
export const CHANNEL_AUTO_FOLLOW_THREADS_TRUE = 'on';
export const CHANNEL_AUTO_FOLLOW_THREADS_FALSE = 'off';

/** 是否开启内部群功能；关闭后创建内部群入口与内部群分类均隐藏 */
export const ENABLE_INTERNAL_GROUPS = false;

export default {
    IGNORE_CHANNEL_MENTIONS_ON,
    IGNORE_CHANNEL_MENTIONS_OFF,
    IGNORE_CHANNEL_MENTIONS_DEFAULT,
    MAX_CHANNEL_NAME_LENGTH,
    MIN_CHANNEL_NAME_LENGTH,
    CHANNEL_AUTO_FOLLOW_THREADS_TRUE,
    CHANNEL_AUTO_FOLLOW_THREADS_FALSE,
    ENABLE_INTERNAL_GROUPS,
};
