// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef} from 'react';
import {View} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view';
import {Navigation} from 'react-native-navigation';
import Animated from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';

import FormattedText from '@components/formatted_text';
import {Screens} from '@constants';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {useScreenTransitionAnimation} from '@hooks/screen_transition_animation';
import Background from '@screens/background';
import {dismissModal, popTopScreen} from '@screens/navigation';
import {logInfo} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import PhoneLoginForm from './phone_form';

import type {LaunchProps} from '@typings/launch';
import type {AvailableScreens} from '@typings/screens/navigation';

export interface LoginOptionsProps extends LaunchProps {
    closeButtonId?: string;
    componentId: AvailableScreens;
    theme: Theme;
    serverUrl: string;
}

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    centered: {
        width: '100%',
        maxWidth: 600,
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        flex: 1,
    },
    flex: {
        flex: 1,
    },
    header: {
        color: theme.centerChannelColor,
        marginBottom: 12,
        ...typography('Heading', 1000, 'SemiBold'),
        textAlign: 'center',
    },
    innerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    subheader: {
        color: changeOpacity(theme.centerChannelColor, 0.6),
        marginBottom: 24,
        ...typography('Body', 200, 'Regular'),
        textAlign: 'center',
    },
}));

const AnimatedSafeArea = Animated.createAnimatedComponent(SafeAreaView);

const LoginOptions = ({
    closeButtonId, componentId, extra,
    launchType, launchError, theme,
    serverUrl: defaultServerUrl,
}: LoginOptionsProps) => {
    const styles = getStyles(theme);
    const keyboardAwareRef = useRef<KeyboardAwareScrollView>(null);

    useEffect(() => {
        logInfo('[Login.startup] Login screen mounted', {componentId, launchType, defaultServerUrl});
    }, [componentId, launchType, defaultServerUrl]);

    const description = (
        <FormattedText
            style={styles.subheader}
            id='mobile.login_options.enter_credentials'
            testID='login_options.description.enter_credentials'
            defaultMessage='Enter your phone number and verification code below.'
        />
    );

    const dismiss = () => {
        dismissModal({componentId});
    };

    const pop = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    useEffect(() => {
        const navigationEvents = Navigation.events().registerNavigationButtonPressedListener(({buttonId}) => {
            if (closeButtonId && buttonId === closeButtonId) {
                dismissModal({componentId});
            }
        });

        return () => navigationEvents.remove();
    }, [closeButtonId, componentId]);

    const animatedStyles = useScreenTransitionAnimation(Screens.LOGIN);

    useNavButtonPressed(closeButtonId || '', componentId, dismiss, []);
    useAndroidHardwareBackHandler(componentId, pop);

    const title = (
        <FormattedText
            defaultMessage='Log In to Your Account'
            id={'mobile.login_options.heading'}
            testID={'login_options.title.login_to_account'}
            style={styles.header}
        />
    );

    return (
        <View
            style={styles.flex}
            testID='login.screen'
        >
            <Background theme={theme}/>
            <AnimatedSafeArea style={[styles.container, animatedStyles]}>
                <KeyboardAwareScrollView
                    bounces={true}
                    contentContainerStyle={[styles.innerContainer, {minHeight: '100%'}]}
                    enableAutomaticScroll={false}
                    enableOnAndroid={false}
                    enableResetScrollToCoords={true}
                    extraScrollHeight={20}
                    keyboardDismissMode='on-drag'
                    keyboardShouldPersistTaps='handled'
                    ref={keyboardAwareRef}
                    scrollToOverflowEnabled={true}
                    style={styles.flex}
                >
                    <View
                        style={[styles.centered, {flex: 1}]}
                    >
                        {title}
                        {description}
                        <PhoneLoginForm
                            extra={extra}
                            keyboardAwareRef={keyboardAwareRef}
                            launchError={launchError}
                            launchType={launchType}
                            theme={theme}
                            serverUrl={defaultServerUrl}
                        />
                    </View>
                </KeyboardAwareScrollView>
            </AnimatedSafeArea>
        </View>
    );
};

export default LoginOptions;
