// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {showModal} from '@screens/navigation';
import {Screens} from '@constants';
import {debugLog} from '@store/debug_log';

import type {FileInfo} from '@mattermost/types/files';

/**
 * 显示真正全屏的文件选择器 Modal（隐藏 topBar，组件内部处理关闭按钮）
 */
const showFullscreenFilePickerModal = (
    channelId: string,
    onSend: (files: FileInfo[]) => void,
    title: string,
    photoMode = false,
) => {
    debugLog('filePicker', `showFullscreenFilePickerModal called, channelId=${channelId}, photoMode=${photoMode}`);
    const closeButtonId = `close-${Screens.FILE_PICKER}`;
    const passProps = {
        onSend,
        channelId,
        closeButtonId,
        title,
        photoMode,
    };

    // 注意：不再注册 Navigation 按钮监听器。
    // FilePicker 组件内部（file_picker.tsx 的 handleClose）会通过 dismissModal 自行关闭。
    // 之前在此处注册 Navigation.events().registerNavigationButtonPressedListener 监听器
    // 会在 Navigation 未完全初始化时导致 "Cannot read property 'events' of undefined" 崩溃。

    // 使用 showModal 并配置 topBar 隐藏，实现真正全屏
    showModal(
        Screens.FILE_PICKER,
        title,
        {...passProps, closeButtonId},
        {
            componentId: closeButtonId,
            topBar: {
                visible: false,  // 隐藏顶部导航栏
                height: 0,
            },
        },
    );
};

export const showFilePickerScreen = (channelId: string, onSend: (files: FileInfo[]) => void, title = 'Select Files') => {
    showFullscreenFilePickerModal(channelId, onSend, title, false);
};

// 「照片」入口：复用 FilePicker，但只展示手机相册，当作图片发送，
// 并提供「发送原图」开关（photoMode=true）。
export const showPhotoAlbumScreen = (channelId: string, onSend: (files: FileInfo[]) => void, title = 'Photos') => {
    showFullscreenFilePickerModal(channelId, onSend, title, true);
};

/**
 * 为智能笔记本显示全屏文件选择器 Modal
 * 和聊天窗口的文件选择器完全一致
 */
export const showSmartNotebookFilePicker = (
    onSend: (files: FileInfo[]) => void,
    title = 'Select Files',
) => {
    // 使用临时 channelId（智能笔记本不需要真正的 channelId）
    const tempChannelId = 'smart_notebook_temp';
    showFullscreenFilePickerModal(tempChannelId, onSend, title, false);
};
