// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {View, Text, TouchableOpacity, Alert} from 'react-native';
import Share from 'react-native-share';
import ViewShot from 'react-native-view-shot';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import QRCodeGenerator from '@components/qr_code_generator';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import SecurityManager from '@managers/security_manager';
import {dismissModal} from '@screens/navigation';
import {formatDate} from '@utils/datetime';
import {hasWriteStoragePermission} from '@utils/file';
import {logError, logInfo} from '@utils/log';
import {customBase64Encode} from '@utils/security';
import {showSnackBar} from '@utils/snack_bar';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    subtitle: {
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 24,
        ...typography('Body', 100, 'Regular'),
        lineHeight: 22,
        maxWidth: '90%',
        fontSize: 14,
        letterSpacing: 0.3,
        opacity: 0.9,
    },
    userInfoText: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    qrCode: {
        marginTop: 0,
        marginBottom: 0,
    },
    qrContainer: {
        alignItems: 'center',
        padding: 32,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 8,
        maxWidth: '90%',
    },
    shareableArea: {
        alignItems: 'center',
        width: '100%',
    },
    hintText: {
        color: theme.centerChannelColor + 'CC',
        textAlign: 'center',
        ...typography('Body', 75),
        lineHeight: 20,
    },
    actionsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 40,
        flexWrap: 'wrap',
        marginTop: 30,
    },
    actionButton: {
        alignItems: 'center',
        minWidth: 88,
    },
    actionIcon: {
        marginBottom: 8,
    },
    actionLabel: {
        color: theme.centerChannelColor,
        ...typography('Body', 75, 'Regular'),
        textAlign: 'center',
    },

}));

/**
 * JoinTeamQR Component
 *
 * 用于显示加入企业的二维码界面，用户可以通过同事扫码确认身份加入企业
 * 支持分享二维码功能
 */
interface JoinTeamQRProps {
    componentId: AvailableScreens;
    closeButtonId: string;
    serverUrl: string;
    nickname: string;
    userId: string;
}

const JoinTeamQR: React.FC<JoinTeamQRProps> = ({componentId, closeButtonId, serverUrl, nickname, userId}: JoinTeamQRProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const intl = useIntl();
    const viewShotRef = React.useRef<ViewShot>(null);
    const fileName = `${nickname}_join_team_qr`;

    /**
     * 生成二维码数据
     * @returns 包含服务器URL和用户信息的JSON字符串
     */
    const generateQRCodeData = () => {
        const data = {uid: userId, ts: Date.now()};
        const encodedData = customBase64Encode(encodeURIComponent(JSON.stringify(data)));
        return `${serverUrl}${serverUrl.endsWith('/') ? '' : '/'}join_team_by_qr?qrtype=join_team&qrdata=${encodedData}`;
    };

    const onClosePressed = useCallback(() => {
        return dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    /**
     * 处理分享：分享包含 user_info、二维码、hint 的图片及文案
     */
    const handleShareQRCode = usePreventDoubleTap(useCallback(async () => {
        try {
            if (viewShotRef.current?.capture) {
                const uri = await viewShotRef.current.capture();
                const userInfoMessage = intl.formatMessage(
                    {id: 'join_team_qr.user_info', defaultMessage: '{nickname} requests to join the enterprise'},
                    {nickname},
                );
                const hintMessage = intl.formatMessage(
                    {id: 'join_team_qr.hint', defaultMessage: 'After colleague scans and confirms, you can join the enterprise'},
                );
                const shareMessage = `${userInfoMessage}\n\n${hintMessage}`;

                await Share.open({
                    title: intl.formatMessage({id: 'join_team_qr.share_dialog_title', defaultMessage: 'Join Enterprise QR Code'}),
                    message: shareMessage,
                    url: uri,
                    saveToFiles: true,
                    filename: `${nickname}_join_team_qr_${formatDate(undefined, true)}.png`,
                });
            } else {
                Alert.alert(
                    intl.formatMessage({id: 'join_team_qr.error_title', defaultMessage: 'Error'}),
                    intl.formatMessage({id: 'join_team_qr.share_not_supported', defaultMessage: 'Sharing is not supported'}),
                );
            }
        } catch (error) {
            if ((error as {message?: string})?.message !== 'User did not share') {
                logInfo('Failed to share QR code', error);
            }
        }
    }, [intl, nickname]));

    /**
     * 保存到相册（下载），参考 external_profile_card
     */
    const handleSaveToAlbum = usePreventDoubleTap(useCallback(async () => {
        try {
            const hasPermission = await hasWriteStoragePermission(intl);
            if (!hasPermission) {
                return;
            }
            if (viewShotRef.current?.capture) {
                const uri = await viewShotRef.current.capture();
                await CameraRoll.saveAsset(uri, {
                    type: 'photo',
                    album: intl.formatMessage({id: 'join_team_qr.title', defaultMessage: 'Join Enterprise'}),
                });
                logInfo('[JoinTeamQR] Card saved to album');
                showSnackBar({
                    barType: SNACK_BAR_TYPE.TEXT_COPIED,
                    customMessage: intl.formatMessage({id: 'join_team_qr.save_success_message', defaultMessage: 'Saved to album'}),
                    type: MESSAGE_TYPE.SUCCESS,
                });
            } else {
                Alert.alert(
                    intl.formatMessage({id: 'join_team_qr.error_title', defaultMessage: 'Error'}),
                    intl.formatMessage({id: 'join_team_qr.save_failed', defaultMessage: 'Unable to save'}),
                );
            }
        } catch (e) {
            logError('[JoinTeamQR.handleSaveToAlbum]', e);
            Alert.alert(
                intl.formatMessage({id: 'join_team_qr.error_title', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'join_team_qr.save_failed', defaultMessage: 'Unable to save'}),
            );
        }
    }, [intl]));

    return (
        <View
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            style={styles.container}
        >
            {/* 内容区域 */}
            <View style={styles.content}>
                {/* 副标题 */}
                <Text style={styles.subtitle}>
                    <FormattedText
                        id='join_team_qr.subtitle'
                        defaultMessage='Have your colleague scan the QR code to verify your identity and join the enterprise they belong to.'
                    />
                </Text>

                {/* 二维码：分享时包含 user_info、二维码、hint */}
                <View style={styles.qrContainer}>
                    <ViewShot
                        ref={viewShotRef}
                        options={{fileName, format: 'png'}}
                        style={styles.shareableArea}
                    >
                        <FormattedText
                            style={styles.userInfoText}
                            id='join_team_qr.user_info'
                            defaultMessage='{nickname} requests to join the enterprise'
                            values={{nickname}}
                        />
                        <QRCodeGenerator
                            data={generateQRCodeData()}
                            size={200}
                            ecl='L'
                            showBorder={false}
                            logo={require('@assets/images/icon.png')}
                            logoSize={0.2}
                            logoBackgroundColor='#FFFFFF'
                            style={styles.qrCode}
                        />
                        <Text style={styles.hintText}>
                            <FormattedText
                                id='join_team_qr.hint'
                                defaultMessage='After colleague scans and confirms, you can join the enterprise'
                            />
                        </Text>
                    </ViewShot>

                    {/* 分享 / 下载：样式与 external_profile_card 一致 */}
                    <View style={styles.actionsRow}>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={handleShareQRCode}
                        >
                            <View style={styles.actionIcon}>
                                <CompassIcon
                                    name='share-variant-outline'
                                    size={28}
                                    color={theme.centerChannelColor}
                                />
                            </View>
                            <FormattedText
                                id='join_team_qr.share'
                                defaultMessage='Share QR Code'
                                style={styles.actionLabel}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={handleSaveToAlbum}
                        >
                            <View style={styles.actionIcon}>
                                <CompassIcon
                                    name='download-outline'
                                    size={28}
                                    color={theme.centerChannelColor}
                                />
                            </View>
                            <FormattedText
                                id='join_team_qr.save_to_album'
                                defaultMessage='Save to album'
                                style={styles.actionLabel}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
    );
};

export default JoinTeamQR;
