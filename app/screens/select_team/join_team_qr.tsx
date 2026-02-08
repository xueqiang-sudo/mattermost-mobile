// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {View, Text, TouchableOpacity, Alert} from 'react-native';
import Share from 'react-native-share';
import ViewShot from 'react-native-view-shot';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import QRCodeGenerator from '@components/qr_code_generator';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal} from '@screens/navigation';
import {formatDate} from '@utils/datetime';
import {logInfo} from '@utils/log';
import {customBase64Encode} from '@utils/security';
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
        marginBottom: 24,
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
    qrWrapper: {
        marginBottom: 28,
    },
    hintText: {
        color: theme.centerChannelColor + 'CC',
        textAlign: 'center',
        marginBottom: 32,
        ...typography('Body', 75),
        lineHeight: 20,
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 40,
        backgroundColor: theme.buttonBg,
        borderRadius: 12,
        minWidth: 220,
        shadowColor: theme.buttonBg,
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 6,
    },
    shareButtonText: {
        color: theme.buttonColor,
        marginLeft: 10,
        ...typography('Body', 100, 'SemiBold'),
        letterSpacing: 0.3,
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
    const viewShotRef = React.useRef<ViewShot>(null);
    const fileName = `${nickname}_join_team_qr`;

    /**
     * 生成二维码数据
     * @returns 包含服务器URL和用户信息的JSON字符串
     */
    const generateQRCodeData = () => {
        const data = {nickname, userId, timestamp: Date.now()};
        const encodedData = customBase64Encode(encodeURIComponent(JSON.stringify(data)));
        return `${serverUrl}${serverUrl.endsWith('/') ? '' : '/'}join_team_by_qr?qrtype=join_team&qrdata=${encodedData}`;
    };

    const onClosePressed = useCallback(() => {
        return dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    /**
     * 处理分享二维码
     */
    const handleShareQRCode = async () => {
        try {
            if (viewShotRef.current && viewShotRef.current.capture !== undefined) {
                const uri = await viewShotRef.current.capture();

                // 分享图片
                await Share.open({
                    title: 'Join Enterprise QR Code',
                    message: 'Scan this QR code to join the enterprise',
                    url: uri,
                    saveToFiles: true,
                    filename: `${nickname}_join_team_qr_${formatDate(undefined, true)}.png`,
                });
            } else {
                Alert.alert('Error', 'No support share QR code');
            }
        } catch (error) {
            logInfo('Failed to share QR code', error);
        }
    };

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

                {/* 二维码 */}
                <View style={styles.qrContainer}>
                    <FormattedText
                        style={styles.userInfoText}
                        id='join_team_qr.user_info'
                        defaultMessage='User({nickname}) requests to join the enterprise'
                        values={{nickname}}
                    />
                    <ViewShot
                        ref={viewShotRef}
                        options={{fileName, width: 200, height: 200}}
                    >
                        <QRCodeGenerator
                            data={generateQRCodeData()}
                            size={220}
                            showBorder={true}
                            style={styles.qrWrapper}
                        />
                    </ViewShot>

                    {/* 提示文本 */}
                    <Text style={styles.hintText}>
                        <FormattedText
                            id='join_team_qr.hint'
                            defaultMessage='After colleague scans and confirms, you can join the enterprise'
                        />
                    </Text>

                    {/* 分享按钮 */}
                    <TouchableOpacity
                        style={styles.shareButton}
                        onPress={handleShareQRCode}
                    >
                        <CompassIcon
                            name='share-variant-outline'
                            size={20}
                            color={theme.buttonColor}
                        />
                        <Text style={styles.shareButtonText}>
                            <FormattedText
                                id='join_team_qr.share'
                                defaultMessage='Share QR Code'
                            />
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

export default JoinTeamQR;
