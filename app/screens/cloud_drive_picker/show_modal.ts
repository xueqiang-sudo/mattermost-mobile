// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Screens} from '@constants';
import {showModal, dismissModal, getThemeFromState} from '@screens/navigation';
import CompassIcon from '@components/compass_icon';
import {Platform} from 'react-native';
import Navigation from 'react-native-navigation';

import type {FileInfo} from '@mattermost/types/files';
import type {IntlShape} from 'react-intl';

export type CloudDrivePickerOnSend = (files: FileInfo[]) => void | Promise<void>;

/**
 * 显示真正全屏的云盘选择器 Modal（隐藏 topBar，组件内部处理关闭按钮）
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

    const theme = getThemeFromState();
    const iconName = Platform.select({android: 'arrow-left', ios: 'arrow-back-ios', default: 'arrow-left'});
    const closeButtonIcon = CompassIcon.getImageSourceSync(iconName, 24, theme.sidebarHeaderTextColor);

    // 注册关闭按钮监听器
    const listener = Navigation.events().registerNavigationButtonPressedListener(({buttonId}) => {
        if (buttonId === closeButtonId) {
            listener.remove();
            dismissModal({componentId: closeButtonId as any});
        }
    });

    // 使用 showModal 并配置 topBar 隐藏，实现真正全屏
    showModal(
        Screens.CLOUD_DRIVE_PICKER,
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
