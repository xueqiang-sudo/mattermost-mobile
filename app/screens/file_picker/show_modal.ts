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
