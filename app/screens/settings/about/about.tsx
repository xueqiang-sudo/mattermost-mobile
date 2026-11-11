// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Image, Text, View} from 'react-native';

import {manualCheckForUpdate, showUpdateOverlay} from '@actions/remote/update';
import Button from '@components/button';
import FormattedText from '@components/formatted_text';
import SettingContainer from '@components/settings/container';
import {Screens} from '@constants';
import {SNACK_BAR_TYPE} from '@constants/snack_bar';
import {UPDATE_TYPE} from '@constants/update';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {usePreventDoubleTap} from '@hooks/utils';
import {popTopScreen, showModalWithBackButton} from '@screens/navigation';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import Subtitle from './subtitle';
import Title from './title';
import TosPrivacyContainer from './tos_privacy';

import type {AvailableScreens} from '@typings/screens/navigation';

const SECTION_GAP = 24;
const CARD_RADIUS = 12;
const LOGO_SIZE = 80;

const TERMS_URL = 'https://pipeline.optibot.cn/terms';
const PRIVACY_URL = 'https://pipeline.optibot.cn/privacy';

const appIcon = require('@assets/images/icon.png');

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    const captionColor = changeOpacity(theme.centerChannelColor, 0.56);
    const borderSubtle = changeOpacity(theme.centerChannelColor, 0.1);

    return {
        hero: {
            alignItems: 'center',
            marginTop: 16,
            marginBottom: SECTION_GAP,
        },
        logoWrap: {
            width: LOGO_SIZE,
            height: LOGO_SIZE,
            borderRadius: CARD_RADIUS,
            overflow: 'hidden',
            marginBottom: 16,
            borderWidth: 1,
            borderColor: borderSubtle,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        },
        logoImage: {
            width: '100%',
            height: '100%',
        },
        bodyWrap: {
            paddingBottom: 32,
        },
        updateButton: {
            marginBottom: SECTION_GAP,
        },
        footer: {
            alignItems: 'center',
            marginTop: 8,
            gap: 4,
        },
        footerText: {
            ...typography('Body', 75, 'Regular'),
            color: captionColor,
            textAlign: 'center',
        },
        footerCompanyName: {
            ...typography('Body', 100, 'SemiBold'),
            color: changeOpacity(theme.centerChannelColor, 0.72),
            textAlign: 'center',
            marginTop: 8,
        },
    };
});

type AboutProps = {
    componentId: AvailableScreens;
    config: ClientConfig;
};

const About = ({componentId, config}: AboutProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const [checking, setChecking] = useState(false);

    const close = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, close);

    const appName =
        intl.formatMessage({id: 'mobile.app.display_name', defaultMessage: 'Dedalix'}) || config.SiteName;

    const handleCheckUpdate = usePreventDoubleTap(
        useCallback(async () => {
            if (checking) {
                return;
            }
            setChecking(true);

            const data = await manualCheckForUpdate();
            setChecking(false);

            if (!data) {
                showSnackBar({
                    barType: SNACK_BAR_TYPE.LINK_COPY_FAILED,
                    sourceScreen: componentId,
                    customMessage: intl.formatMessage({
                        id: 'mobile.update.check_failed',
                        defaultMessage: 'Failed to check for updates. Please try again later.',
                    }),
                });
                return;
            }

            if (data.update_type === UPDATE_TYPE.NONE) {
                showSnackBar({
                    barType: SNACK_BAR_TYPE.INFO_COPIED,
                    sourceScreen: componentId,
                    customMessage: intl.formatMessage({
                        id: 'mobile.update.already_latest',
                        defaultMessage: 'You are using the latest version.',
                    }),
                });
                return;
            }

            showUpdateOverlay(data.update_type as 'suggest' | 'force', data);
        }, [checking, componentId, intl]),
    );

    const openWebView = useCallback((url: string, titleKey: string, defaultTitle: string) => {
        const title = intl.formatMessage({id: titleKey, defaultMessage: defaultTitle});
        const closeId = `close-about-webview-${titleKey}`;
        showModalWithBackButton(Screens.WEB_VIEW, title, closeId, {url}, {useBackIcon: true});
    }, [intl]);

    const onPressTerms = useCallback(() => {
        openWebView(TERMS_URL, 'launch_agreement.terms_title', 'User Agreement');
    }, [openWebView]);

    const onPressPrivacy = useCallback(() => {
        openWebView(PRIVACY_URL, 'launch_agreement.privacy_title', 'Privacy Policy');
    }, [openWebView]);

    return (
        <SettingContainer testID='about'>
            <View style={styles.hero}>
                <View
                    style={styles.logoWrap}
                    testID='about.logo'
                >
                    <Image
                        accessibilityIgnoresInvertColors={true}
                        source={appIcon}
                        style={styles.logoImage}
                    />
                </View>
                <Title config={config}/>
                <Subtitle/>
            </View>

            <View style={styles.bodyWrap}>
                <TosPrivacyContainer
                    onPressTermsOfService={onPressTerms}
                    onPressPrivacyPolicy={onPressPrivacy}
                />

                <View style={styles.updateButton}>
                    <Button
                        emphasis='secondary'
                        iconName='update'
                        loading={checking}
                        onPress={handleCheckUpdate}
                        size='m'
                        testID='about.check_update'
                        text={intl.formatMessage({
                            id: 'settings.about.button.checkUpdate',
                            defaultMessage: 'Check for Updates',
                        })}
                        theme={theme}
                    />
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerCompanyName}>
                        {intl.formatMessage({
                            id: 'about.company_name',
                            defaultMessage: 'Beijing Yunzhi Technology Co., Ltd.',
                        })}
                    </Text>
                    <Text style={styles.footerText}>
                        {intl.formatMessage({
                            id: 'about.all_rights_reserved',
                            defaultMessage: 'All rights reserved.',
                        })}
                    </Text>
                    <Text style={styles.footerText}>
                        {intl.formatMessage({
                            id: 'about.icp_filing',
                            defaultMessage: 'ICP Filing: 京ICP备2026011528号-1',
                        })}
                    </Text>
                    <FormattedText
                        defaultMessage='© {currentYear} {appName}. All rights reserved.'
                        id='settings.about.copyright'
                        style={styles.footerText}
                        testID='about.copyright'
                        values={{appName, currentYear: new Date().getFullYear()}}
                    />
                </View>
            </View>
        </SettingContainer>
    );
};

export default About;
