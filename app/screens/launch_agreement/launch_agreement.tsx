// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {
    BackHandler,
    DeviceEventEmitter,
    ScrollView,
    Text,
    View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import Button from '@components/button';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {LAUNCH_AGREEMENT_EVENTS} from '@screens/launch_agreement/events';
import {dismissModal, showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
}

const TERMS_URL = 'https://pipeline.optibot.cn/terms.html';
const PRIVACY_URL = 'https://pipeline.optibot.cn/privacy.html';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        root: {
            flex: 1,
            backgroundColor: changeOpacity('#000000', 0.5),
            justifyContent: 'center',
            alignItems: 'center',
        },
        container: {
            flex: 1,
            maxWidth: 680,
            alignSelf: 'center',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
        },
        wrapper: {
            backgroundColor: theme.centerChannelBg,
            borderRadius: 12,
            margin: 20,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.16),
            padding: 24,
        },
        title: {
            color: theme.centerChannelColor,
            ...typography('Heading', 600, 'SemiBold'),
            textAlign: 'center',
            marginBottom: 16,
        },
        scrollView: {
            maxHeight: 320,
            marginBottom: 20,
        },
        bodyText: {
            color: theme.centerChannelColor,
            ...typography('Body', 200, 'Regular'),
            lineHeight: 22,
        },
        linkText: {
            color: theme.linkColor,
            ...typography('Body', 200, 'SemiBold'),
        },
        buttonContainer: {
            flexDirection: 'row',
            gap: 12,
        },
        buttonFlex: {
            flex: 1,
        },
        sdkSection: {
            marginTop: 12,
        },
        sdkLabel: {
            color: theme.centerChannelColor,
            ...typography('Body', 200, 'SemiBold'),
            marginTop: 8,
            marginBottom: 2,
        },
    };
});

const LaunchAgreement = ({componentId}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const insets = useSafeAreaInsets();
    const intl = useIntl();

    const openWebView = useCallback((url: string, titleKey: string, defaultTitle: string) => {
        const title = intl.formatMessage({id: titleKey, defaultMessage: defaultTitle});
        const closeId = `close-webview-${titleKey}`;
        showModalWithBackButton(Screens.WEB_VIEW, title, closeId, {url}, {useBackIcon: true});
    }, [intl]);

    const handleDisagree = useCallback(() => {
        dismissModal({componentId});
        DeviceEventEmitter.emit(LAUNCH_AGREEMENT_EVENTS.DECLINED);
        BackHandler.exitApp();
    }, [componentId]);

    const handleAgree = useCallback(() => {
        dismissModal({componentId});
        DeviceEventEmitter.emit(LAUNCH_AGREEMENT_EVENTS.ACCEPTED);
    }, [componentId]);

    const containerStyle = useMemo(() => {
        return [{
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingTop: insets.top,
        }, styles.container];
    }, [styles, insets]);

    return (
        <View style={styles.root}>
            <View style={containerStyle}>
                <View style={styles.wrapper}>
                    <Text style={styles.title}>服务协议和隐私政策</Text>
                    <ScrollView
                        style={styles.scrollView}
                        showsVerticalScrollIndicator={true}
                    >
                        <Text style={styles.bodyText}>
                            {'欢迎您使用允知智构！ 我们非常重视您的个人信息和隐私保护。特别提示您阅读并充分理解'}
                            <Text
                                style={styles.linkText}
                                onPress={() => openWebView(TERMS_URL, 'launch_agreement.terms_title', 'User Agreement')}
                            >
                                {'《用户协议》'}
                            </Text>
                            {'&'}
                            <Text
                                style={styles.linkText}
                                onPress={() => openWebView(PRIVACY_URL, 'launch_agreement.privacy_title', 'Privacy Policy')}
                            >
                                {'《隐私政策》'}
                            </Text>
                            {'各条款。如您同意'}
                            <Text
                                style={styles.linkText}
                                onPress={() => openWebView(TERMS_URL, 'launch_agreement.terms_title', 'User Agreement')}
                            >
                                {'《用户协议》'}
                            </Text>
                            {'及'}
                            <Text
                                style={styles.linkText}
                                onPress={() => openWebView(PRIVACY_URL, 'launch_agreement.privacy_title', 'Privacy Policy')}
                            >
                                {'《隐私政策》'}
                            </Text>
                            {'，请您点击"同意"开始使用我们的产品和服务，我们将尽全力保护您的个人信息安全。'}
                        </Text>

                        <Text style={[styles.bodyText, styles.sdkSection]}>
                            {'为了向您提供稳定的消息推送服务，我们的产品集成了极光推送SDK。'}
                        </Text>

                        <Text style={[styles.bodyText, styles.sdkLabel]}>
                            {'关于极光推送SDK：'}
                        </Text>

                        <Text style={styles.bodyText}>
                            {'功能目的：用于在您授权后，向您推送及时、有用的消息通知，提升您的使用体验。'}
                        </Text>
                        <Text style={[styles.bodyText, {marginTop: 6}]}>
                            {'信息收集：为实现推送功能，该SDK可能会收集您的设备标识信息（如Android ID、OAID、IDFA等）、网络状态及设备型号。这些信息将用于生成脱敏的设备标识，确保消息准确送达。'}
                        </Text>
                        <Text style={[styles.bodyText, {marginTop: 6}]}>
                            {'隐私保护：我们已与第三方SDK服务商签署数据安全保密协议，严格遵守法律法规及隐私政策要求。除非得到您的明示同意，我们不会与其共享您的个人身份信息。'}
                        </Text>
                    </ScrollView>

                    <View style={styles.buttonContainer}>
                        <View style={styles.buttonFlex}>
                            <Button
                                onPress={handleDisagree}
                                theme={theme}
                                text={'不同意'}
                                size={'lg'}
                                emphasis={'link'}
                            />
                        </View>
                        <View style={styles.buttonFlex}>
                            <Button
                                onPress={handleAgree}
                                theme={theme}
                                text={'同意'}
                                size={'lg'}
                            />
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );
};

export default LaunchAgreement;
