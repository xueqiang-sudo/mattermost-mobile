// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {View, Text, TouchableOpacity, Alert} from 'react-native';
import Share from 'react-native-share';
import ViewShot from 'react-native-view-shot';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import QRCodeGenerator from '@components/qr_code_generator';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {dismissModal} from '@screens/navigation';
import {logInfo} from '@utils/log';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    customHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 40,
        paddingBottom: 16,
        paddingHorizontal: 16,
        backgroundColor: theme.sidebarBg,
    },
    backButton: {
        position: 'absolute',
        left: 16,
        top: 40,
        padding: 8,
    },
    headerTitle: {
        color: theme.sidebarHeaderTextColor,
        ...typography('Heading', 600),
    },
    content: {
        flex: 1,
        paddingHorizontal: 32,
        alignItems: 'center',
        paddingTop: 16,
    },
    subtitle: {
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 16,
        ...typography('Body', 100),
        maxWidth: '80%',
    },
    userInfoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 48,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.centerChannelColor,
        opacity: 0.8,
    },
    userInfoText: {
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    qrContainer: {
        alignItems: 'center',
        marginBottom: 40,
        padding: 24,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    qrWrapper: {
        marginBottom: 24,
    },
    hintText: {
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 24,
        ...typography('Body', 100),
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 32,
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        minWidth: 200,
    },
    shareButtonText: {
        color: theme.buttonColor,
        marginLeft: 8,
        ...typography('Body', 100, 'SemiBold'),
    },

}));

/**
 * JoinTeamQR Component
 *
 * 用于显示加入企业的二维码界面，用户可以通过同事扫码确认身份加入企业
 * 支持分享二维码功能
 */
interface JoinTeamQRProps {
    serverUrl: string;
    nickname: string;
    userId: string;
}

const JoinTeamQR: React.FC<JoinTeamQRProps> = ({serverUrl, nickname, userId}: JoinTeamQRProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const viewShotRef = React.useRef<ViewShot>(null);

    /**
     * 生成二维码数据
     * @returns 包含服务器URL和用户信息的JSON字符串
     */
    const generateQRCodeData = () => {
        const data = {
            serverUrl,
            nickname,
            userId,
            timestamp: Date.now(),
        };
        return JSON.stringify(data);
    };

    /**
     * 处理返回按钮点击
     */
    const handleBack = () => {
        dismissModal({componentId: Screens.JOIN_TEAM_QR});
    };

    /**
     * 处理分享二维码
     */
    const handleShareQRCode = async () => {
        try {
            if (viewShotRef.current && viewShotRef.current.capture !== undefined) {
                const uri = await viewShotRef.current.capture();

                // 分享图片
                const shareOptions = {
                    title: 'Join Enterprise QR Code',
                    message: 'Scan this QR code to join the enterprise',
                    url: uri,
                    saveToFiles: true,
                };

                await Share.open(shareOptions);
            } else {
                Alert.alert('Error', 'No support share QR code');
            }
        } catch (error) {
            logInfo('Failed to share QR code', error);
        }
    };

    return (
        <View style={styles.container}>
            {/* 自定义头部 */}
            <View style={styles.customHeader}>
                <TouchableOpacity
                    onPress={handleBack}
                    style={styles.backButton}
                >
                    <CompassIcon
                        name='arrow-left'
                        size={24}
                        color={theme.sidebarHeaderTextColor}
                    />
                </TouchableOpacity>
                <FormattedText
                    style={styles.headerTitle}
                    id='join_team_qr.title'
                    defaultMessage='Join Enterprise'
                />
            </View>

            {/* 内容区域 */}
            <View style={styles.content}>
                {/* 副标题 */}
                <Text style={styles.subtitle}>
                    <FormattedText
                        id='join_team_qr.subtitle'
                        defaultMessage='通过同事扫码确认身份加入'
                    />
                </Text>

                {/* 用户信息显示 */}
                <View style={styles.userInfoContainer}>
                    <Text style={styles.userInfoText}>
                        <FormattedText
                            id='join_team_qr.user_info'
                            defaultMessage='{nickname} 请求加入企业'
                            values={{nickname}}
                        />
                    </Text>
                </View>

                {/* 二维码 */}
                <View style={styles.qrContainer}>
                    <ViewShot ref={viewShotRef}>
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
                            defaultMessage='同事扫码确认后，您可加入企业'
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
                                defaultMessage='分享二维码'
                            />
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

export default JoinTeamQR;
