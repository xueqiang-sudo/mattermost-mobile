// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {showModalWithBackButton} from '@screens/navigation';
import {Screens} from '@constants';
import {debugLog} from '@store/debug_log';

import type {FileInfo} from '@mattermost/types/files';

export const showFilePickerScreen = (channelId: string, onSend: (files: FileInfo[]) => void, title = 'Select Files') => {
    debugLog('filePicker', `showFilePickerScreen called, channelId=${channelId}`);
    const closeButtonId = `close-${Screens.FILE_PICKER}`;
    const passProps = {
        onSend,
        channelId,
    };

    showModalWithBackButton(
        Screens.FILE_PICKER,
        title,
        closeButtonId,
        passProps,
        {useBackIcon: true},
    );
};

// 「照片」入口：复用 FilePicker，但只展示手机相册，当作图片发送，
// 并提供「发送原图」开关（photoMode=true）。
export const showPhotoAlbumScreen = (channelId: string, onSend: (files: FileInfo[]) => void, title = 'Photos') => {
    debugLog('filePicker', `showPhotoAlbumScreen called, channelId=${channelId}`);
    const closeButtonId = `close-${Screens.FILE_PICKER}`;
    const passProps = {
        onSend,
        channelId,
        photoMode: true,
    };

    showModalWithBackButton(
        Screens.FILE_PICKER,
        title,
        closeButtonId,
        passProps,
        {useBackIcon: true},
    );
};
