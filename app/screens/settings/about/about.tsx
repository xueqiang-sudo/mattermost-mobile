// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import {nativeApplicationVersion, nativeBuildVersion} from 'expo-application';
import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Image, Text, View} from 'react-native';

import {manualCheckForUpdate, showUpdateOverlay} from '@actions/remote/update';
import Button from '@components/button';
import FormattedText from '@components/formatted_text';
import SettingContainer from '@components/settings/container';
import {SNACK_BAR_TYPE} from '@constants/snack_bar';
import {UPDATE_TYPE} from '@constants/update';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {usePreventDoubleTap} from '@hooks/utils';
import {popTopScreen} from '@screens/navigation';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import Subtitle from './subtitle';
import Title from './title';

import type {AvailableScreens} from '@typings/screens/navigation';

const SECTION_GAP = 24;
const CARD_RADIUS = 12;
const CARD_PADDING = 16;
const LOGO_SIZE = 80;

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
        card: {
            borderRadius: CARD_RADIUS,
            borderWidth: 1,
            borderColor: borderSubtle,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
            padding: CARD_PADDING,
            marginBottom: SECTION_GAP,
        },
        cardTitle: {
            ...typography('Heading', 400, 'SemiBold'),
            color: theme.centerChannelColor,
            marginBottom: 16,
        },
        row: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
        },
        rowLast: {
            marginBottom: 0,
        },
        rowLabel: {
            ...typography('Body', 75, 'Regular'),
            color: captionColor,
            marginRight: 12,
            flexShrink: 0,
        },
        rowValue: {
            ...typography('Body', 100, 'Regular'),
            color: theme.centerChannelColor,
            textAlign: 'right',
            flex: 1,
        },
        copyButtonWrap: {
            marginTop: 16,
            alignSelf: 'stretch',
        },
        copyButtonStretch: {
            alignSelf: 'stretch',
        },
        copyright: {
            ...typography('Body', 75, 'Regular'),
            color: captionColor,
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
        intl.formatMessage({id: 'mobile.app.display_name', defaultMessage: 'Optibot'}) || config.SiteName;

    const copyToClipboard = usePreventDoubleTap(
        useCallback(() => {
            const edition = intl.formatMessage(
                config.BuildEnterpriseReady === 'true'
                    ? {id: 'about.edition.enterprise', defaultMessage: 'Enterprise'}
                    : {id: 'about.edition.standard', defaultMessage: 'Standard'},
            );
            const copiedString = intl.formatMessage(
                {
                    id: 'settings.about.copy.clipboard',
                    defaultMessage: '{appName}\n{edition}\nVersion: {version}\nBuild: {number}',
                },
                {
                    appName,
                    edition,
                    number: nativeBuildVersion ?? '',
                    version: nativeApplicationVersion ?? '',
                },
            );
            Clipboard.setString(copiedString);
            showSnackBar({barType: SNACK_BAR_TYPE.INFO_COPIED, sourceScreen: componentId});
        }, [appName, componentId, config.BuildEnterpriseReady, intl]),
    );

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
                <View style={styles.card}>
                    <Text
                        style={styles.cardTitle}
                        testID='about.card.title'
                    >
                        {intl.formatMessage({
                            id: 'settings.about.card.title',
                            defaultMessage: 'App information',
                        })}
                    </Text>
                    <View style={styles.row}>
                        <Text
                            style={styles.rowLabel}
                            testID='about.app_version.title'
                        >
                            {intl.formatMessage({
                                id: 'settings.about.app.version.title',
                                defaultMessage: 'Version',
                            })}
                        </Text>
                        <Text
                            style={styles.rowValue}
                            testID='about.app_version.value'
                        >
                            {nativeApplicationVersion ?? '—'}
                        </Text>
                    </View>
                    <View style={[styles.row, styles.rowLast]}>
                        <Text
                            style={styles.rowLabel}
                            testID='about.build_number.title'
                        >
                            {intl.formatMessage({
                                id: 'settings.about.build.title',
                                defaultMessage: 'Build',
                            })}
                        </Text>
                        <Text
                            style={styles.rowValue}
                            testID='about.build_number.value'
                        >
                            {nativeBuildVersion ?? '—'}
                        </Text>
                    </View>
                    <View style={styles.copyButtonWrap}>
                        <Button
                            buttonContainerStyle={styles.copyButtonStretch}
                            emphasis='secondary'
                            iconName='content-copy'
                            onPress={copyToClipboard}
                            size='m'
                            testID='about.copy_info'
                            text={intl.formatMessage({
                                id: 'settings.about.button.copyInfo',
                                defaultMessage: 'Copy version info',
                            })}
                            theme={theme}
                        />
                    </View>
                    <View style={styles.copyButtonWrap}>
                        <Button
                            buttonContainerStyle={styles.copyButtonStretch}
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
                </View>

                {/* Terms of Service / Privacy Policy rows hidden until product is ready to surface legal URLs. */}

                <FormattedText
                    defaultMessage='© {currentYear} {appName}. All rights reserved.'
                    id='settings.about.copyright'
                    style={styles.copyright}
                    testID='about.copyright'
                    values={{appName, currentYear: new Date().getFullYear()}}
                />
            </View>
        </SettingContainer>
    );
};

export default About;
