// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import keyMirror from '@utils/key_mirror';

export default keyMirror({
    ACCOUNT_SELECT_TABLET_VIEW: null,
    CHANNEL_ARCHIVED: null,
    CHANNEL_SWITCH: null,
    CLOSE_BOTTOM_SHEET: null,
    CLOSE_GALLERY: null,
    CONFIG_CHANGED: null,
    LICENSE_CHANGED: null,
    FREEZE_SCREEN: null,
    GALLERY_ACTIONS: null,
    LEAVE_CHANNEL: null,
    LEAVE_TEAM: null,
    LOADING_CHANNEL_POSTS: null,
    NOTIFICATION_ERROR: null,
    REMOVE_USER_FROM_CHANNEL: null,
    MANAGE_USER_CHANGE_ROLE: null,
    SERVER_LOGOUT: null,
    SERVER_VERSION_CHANGED: null,
    SESSION_EXPIRED: null,
    TAB_BAR_VISIBLE: null,
    TEAM_LOAD_ERROR: null,
    TEAM_SWITCH: null,
    USER_TYPING: null,
    USER_STOP_TYPING: null,
    POST_LIST_SCROLL_TO_BOTTOM: null,

    /** 在频道屏打开「回复某根帖」草稿（替代独立 Thread 屏） */
    POST_DRAFT_SET_REPLY_ROOT: null,
    POST_DRAFT_CLEAR_REPLY_ROOT: null,

    /**
     * 聚焦当前输入框（用于从菜单/弹窗回到聊天输入）
     * 仅由 PostInput 监听并调用 inputRef.current?.focus()
     */
    POST_DRAFT_FOCUS: null,
    SWIPEABLE: null,
    ITEM_IN_VIEWPORT: null,
    SEND_TO_POST_DRAFT: null,
    CRT_TOGGLED: null,
    JOIN_CALL_BAR_VISIBLE: null,
    DRAFT_SWIPEABLE: null,
    MANAGE_ENTERPRISE_REFRESH: null,
    ACTIVE_SCREEN: null,
    ACTIVE_SERVER_CHANGED: null,
    FILE_ADD_REMOVED: null,
});
