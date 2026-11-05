// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Screens} from '@constants';
import {showModalWithBackButton} from '@screens/navigation';

import type {FileInfo} from '@mattermost/types/files';
import type {IntlShape} from 'react-intl';

export type CloudDrivePickerOnSend = (files: FileInfo[]) => void | Promise<void>;

/**
 * 显示云盘选择器 Modal（使用 showModalWithBackButton 自动处理关闭按钮）
 */
export const showCloudDrivePickerModal = (
    channelId: string,
    teamId: string,
    onSend?: CloudDrivePickerOnSend,
    intl?: IntlShape,
) => {
    const title = intl?.formatMessage({
        id: 'cloud_drive.title',
        defaultMessage: 'Cloud Drive',
    }) || 'Cloud Drive';
    const closeButtonId = `close-${Screens.CLOUD_DRIVE_PICKER}`;
    const passProps = {
        channelId,
        teamId,
        onSend,
        closeButtonId,
        title,
    };

    // 使用 showModalWithBackButton 自动处理关闭按钮监听器
    showModalWithBackButton(
        Screens.CLOUD_DRIVE_PICKER,
        title,
        closeButtonId,
        passProps,
        {
            topBar: {
                visible: false,  // 隐藏顶部导航栏
                height: 0,
            },
        },
    );
};
