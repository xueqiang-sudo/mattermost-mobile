// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import {OptionsModalPresentationStyle} from 'react-native-navigation';

import {MMEmployeeContactTypes} from '@client/rest/team_department';
import {Screens} from '@constants';
import {showModal, showModalWithBackButton} from '@screens/navigation';
import {logInfo} from '@utils/log';
import {customBase64Decode} from '@utils/security';
import {getUrlQueryParam} from '@utils/url';

import type {IntlShape} from 'react-intl';

/** 扫描上下文：通讯录「添加成员」扫个人信息码时走邀请加入企业流程 */
export const QR_SCAN_CONTEXT_JOIN_ENTERPRISE = 'join_enterprise' as const;

type QrScannerOptions = {
    scanContext?: string;

    /**
     * 业务方可通过 extra 传入附加上下文（例如企业 ID、目标部门 ID），
     * 扫码结果在回调中会将该对象合并进解析出的 payload 一并传给后续页面。
     */
    extra?: Record<string, unknown>;

    /**
     * 自定义扫描结果处理回调。若提供此回调，将优先使用它处理扫描结果，
     * 返回 true 表示已处理（扫描器自动关闭），返回 false 则回退到默认处理逻辑。
     * 适用于需要获取原始扫描内容（如入库/出库扫码）的场景。
     */
    onScanResultCallback?: (value: string) => boolean;
};

export const showQrScannerModal = (intl: IntlShape, options?: QrScannerOptions) => {
    const scanContext = options?.scanContext;
    showModal(Screens.QR_SCANNER, '', {
        onScanResult: (value: string, context?: string) => {
            // 自定义回调优先处理（如入库/出库扫码等需要原始内容的场景）
            if (options?.onScanResultCallback) {
                return options.onScanResultCallback(value);
            }

            const isUrl = value.startsWith('http://') || value.startsWith('https://');
            if (isUrl) {
                const qrdata = getUrlQueryParam(value, 'qrdata');
                if (!qrdata) {
                    logInfo('onScanResult qrdata is empty, url:', value);
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
                const mergedData: Record<string, unknown> = {
                    ...(data || {}),
                    ...(options?.extra || {}),
                };

                if (value.includes('/invite_team_by_qr?qrdata=')) { // 加入团队二维码扫描结果处理，使用 app modal 处理
                    const title = intl.formatMessage({
                        id: 'invite_user_join_team.title',
                        defaultMessage: 'Invite User to Join Enterprise',
                    });
                    showModalWithBackButton(Screens.INVITE_USER_JOIN_TEAM, title, 'close.invite_user_join_team.button', mergedData, {
                        statusBar: {
                            drawBehind: true,
                        },
                    }); // data: {uid, ts}
                    return true;
                }

                if (value.includes('/profile_card_by_qr?qrdata=')) { // 个人名片二维码：根据 scanContext 决定走邀请加入企业或添加好友
                    if (context === QR_SCAN_CONTEXT_JOIN_ENTERPRISE) {
                        const title = intl.formatMessage({
                            id: 'invite_user_join_team.title',
                            defaultMessage: 'Invite User to Join Enterprise',
                        });
                        showModalWithBackButton(Screens.INVITE_USER_JOIN_TEAM, title, 'close.invite_user_join_team.button', mergedData, {
                            statusBar: {
                                drawBehind: true,
                            },
                        });
                        return true;
                    }
                    const forcedType = options?.extra?.forcedEmployeeContactType;
                    const title =
                        forcedType === MMEmployeeContactTypes.Supplier
                            ? intl.formatMessage({
                                id: 'add_user_to_friends.modal_title_add_supplier',
                                defaultMessage: 'Add supplier',
                            })
                            : forcedType === MMEmployeeContactTypes.Customer
                                ? intl.formatMessage({
                                    id: 'add_user_to_friends.modal_title_add_customer',
                                    defaultMessage: 'Add customer',
                                })
                                : intl.formatMessage({
                                    id: 'add_user_to_friends.title',
                                    defaultMessage: 'Add user as contact',
                                });
                    showModalWithBackButton(Screens.ADD_USER_TO_FRIENDS, title, 'close.add_user_to_friends.button', mergedData, {
                        statusBar: {
                            drawBehind: true,
                        },
                    });
                    return true;
                }
            }

            return false;
        },
        scanContext,
    }, {
        modalPresentationStyle: OptionsModalPresentationStyle.fullScreen,
        layout: {
            backgroundColor: 'transparent',
            componentBackgroundColor: 'transparent',
        },
        statusBar: {
            visible: true,
            drawBehind: true,
            backgroundColor: 'transparent',
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
