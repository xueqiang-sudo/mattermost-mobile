// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {OptionsModalPresentationStyle} from 'react-native-navigation';

import {Screens} from '@constants';
import {showModal, showModalWithBackButton} from '@screens/navigation';
import {logInfo} from '@utils/log';
import {customBase64Decode} from '@utils/security';
import {getUrlQueryParam} from '@utils/url';

import type {IntlShape} from 'react-intl';

// See LICENSE.txt for license information.
export const showQrScannerModal = (intl: IntlShape) => {
    showModal(Screens.QR_SCANNER, '', {
        onScanResult: (value: string) => {
            const isUrl = value.startsWith('http://') || value.startsWith('https://');
            if (isUrl) {
                const qrdata = getUrlQueryParam(value, 'qrdata');
                if (!qrdata) {
                    logInfo('onScanResult qrdata is empty');
                    return false;
                }

                let data: Record<string, unknown>;
                try {
                    const decodedData = customBase64Decode(qrdata);
                    let jsonText = decodedData;
                    try {
                        jsonText = decodeURIComponent(decodedData);
                    } catch {
                        // Backward compatibility: accept payloads that were not URI-encoded.
                    }
                    const parsed = JSON.parse(jsonText);
                    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        logInfo('onScanResult parsed is null or not an object or is an array');
                        return false;
                    }
                    data = parsed as Record<string, unknown>;
                } catch (eTmp01) {
                    logInfo('onScanResult qrdata decode error', eTmp01);
                    return false;
                }
                if (value.includes('/invite_team_by_qr?qrdata=')) { // 加入团队二维码扫描结果处理，使用 app modal 处理
                    const title = intl.formatMessage({
                        id: 'qr_scanner.invite_user_join_team.title',
                        defaultMessage: 'Invite User to Join Enterprise',
                    });
                    showModalWithBackButton(Screens.INVITE_USER_JOIN_TEAM, title, 'close.invite_user_join_team.button', data); // data: {uid, ts}
                    return true;
                }

                if (value.includes('/profile_card_by_qr?qrdata=')) { // 个人名片二维码扫描结果处理，使用 app modal 处理
                    const title = intl.formatMessage({
                        id: 'qr_scanner.add_user_to_friends.title',
                        defaultMessage: 'Add User as Friend',
                    });
                    showModalWithBackButton(Screens.ADD_USER_TO_FRIENDS, title, 'close.add_user_to_friends.button', data); // data: {uid, ts}
                    return true;
                }
            }

            return false;
        },
    }, {
        modalPresentationStyle: OptionsModalPresentationStyle.fullScreen,
        layout: {
            componentBackgroundColor: '#000000',
        },
        statusBar: {
            visible: true,
            drawBehind: true,
            backgroundColor: 'transparent',
            style: 'light',
        },
        topBar: {
            visible: false,
        },
        modal: {
            swipeToDismiss: false,
        },
        hardwareBackButton: {
            dismissModalOnPress: false,
        },
    });
};
