// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import '@utils/bootstrap_text_scaling';

import MattermostShare, {type ShareExtensionDataToSend, type SharedItem} from '@mattermost/rnshare';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import React, {useEffect, useMemo, useState} from 'react';
import {IntlProvider} from 'react-intl';
import {Appearance, BackHandler} from 'react-native';

import {getDefaultThemeByAppearance, resolveThemeFromDarkModeSetting} from '@context/theme';
import {DEFAULT_LOCALE, getTranslations} from '@i18n';
import {initialize} from '@init/app';
import PerformanceMetricsManager from '@managers/performance_metrics_manager';
import {getStoredDarkModeSetting} from '@queries/app/global';
import {parseStoredDarkModeSetting} from '@utils/theme/dark_mode';
import {extractFirstLink, isValidUrl} from '@utils/url';

import ServersScreen from './screens/servers';
import ShareScreen from './screens/share';

const Stack = createStackNavigator();

const closeExtension = (data: ShareExtensionDataToSend | null) => {
    MattermostShare.close(data);
};

const ShareExtension = () => {
    const [data, setData] = useState<SharedItem[]>();
    const [theme, setTheme] = useState<Theme>(getDefaultThemeByAppearance());

    const defaultNavigationOptions = useMemo(() => ({
        headerStyle: {
            backgroundColor: theme.sidebarHeaderBg,
        },
        headerTitleStyle: {
            marginHorizontal: 0,
            left: 0,
            color: theme.sidebarHeaderTextColor,
        },
        headerBackTitleStyle: {
            color: theme.sidebarHeaderTextColor,
            margin: 0,
        },
        headerTintColor: theme.sidebarHeaderTextColor,
        headerTopInsetEnabled: false,
        cardStyle: {backgroundColor: theme.centerChannelBg},
    }), [theme]);

    const {text: message, link: linkPreviewUrl} = useMemo(() => {
        let text = data?.filter((i) => i.isString)[0]?.value;
        let link;
        if (text) {
            const first = extractFirstLink(text);
            if (first && isValidUrl(first)) {
                link = first;
                text = text.replace(first, '').trim();
                // Clean common share prefixes from Chinese apps (Kuaishou, Douyin, etc.)
                text = text.replace(/^(分享一个作品给你和?|看看这个|推荐一个|分享给你|我在快手发现了一个好作品|快手|抖音|分享)/i, '').trim();
            }
        }

        return {text, link};
    }, [data]);

    const files = useMemo(() => {
        const allFiles = data?.filter((i) => !i.isString) || [];

        // When sharing a link with a small thumbnail (typical for video shares from Kuaishou/Douyin),
        // filter out the thumbnail to avoid duplicate display. The server will fetch the proper
        // OpenGraph image from the URL, so we don't need to upload the thumbnail separately.
        if (linkPreviewUrl && allFiles.length > 0) {
            return allFiles.filter((file) => {
                // Keep non-image files
                if (!file.type?.startsWith('image/')) {
                    return true;
                }

                // Filter out small images (< 100KB) which are likely thumbnails
                // Real photos are typically > 500KB
                const isThumbnail = file.size && file.size < 100 * 1024;
                if (isThumbnail) {
                    console.log('[ShareExtension] Filtering out thumbnail:', file.filename, 'size:', file.size);
                    return false;
                }

                return true;
            });
        }

        return allFiles;
    }, [data, linkPreviewUrl]);

    useEffect(() => {
        // Since the share functionality inits the app, the init mark gets set
        // at this point. Therefore, any check on load times after this is done
        // over the wrong value.
        PerformanceMetricsManager.skipLoadMetric();
    }, []);

    useEffect(() => {
        initialize().finally(async () => {
            const items = await MattermostShare.getSharedData();
            setData(items);

            const storedSetting = await getStoredDarkModeSetting();
            setTheme(resolveThemeFromDarkModeSetting(parseStoredDarkModeSetting(storedSetting)));
        });

        const backListener = BackHandler.addEventListener('hardwareBackPress', () => {
            const scene = MattermostShare.getCurrentActivityName();
            if (scene === 'ShareActivity') {
                closeExtension(null);
                return true;
            }
            return false;
        });

        const appearanceListener = Appearance.addChangeListener(async () => {
            const storedSetting = await getStoredDarkModeSetting();
            const setting = parseStoredDarkModeSetting(storedSetting);
            setTheme(resolveThemeFromDarkModeSetting(setting));
        });

        return () => {
            backListener.remove();
            appearanceListener.remove();
        };
    }, []);

    if (!data) {
        return null;
    }

    return (
        <IntlProvider
            locale={DEFAULT_LOCALE}
            messages={getTranslations(DEFAULT_LOCALE)}
        >
            <NavigationContainer>
                <Stack.Navigator
                    initialRouteName='Share'
                    screenOptions={defaultNavigationOptions}
                >
                    <Stack.Screen name='Share' options={{headerShown: false}}>
                        {() => (
                            <ShareScreen
                                files={files}
                                linkPreviewUrl={linkPreviewUrl}
                                message={message}
                                theme={theme}
                            />
                        )}
                    </Stack.Screen>
                    <Stack.Screen name='Servers'>
                        {() => (
                            <ServersScreen theme={theme}/>
                        )}
                    </Stack.Screen>
                </Stack.Navigator>
            </NavigationContainer>
        </IntlProvider>
    );
};

export default ShareExtension;
