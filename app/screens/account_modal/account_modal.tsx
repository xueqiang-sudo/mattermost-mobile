// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect} from 'react';
import {ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import AccountOptions from '@screens/home/account/components/options';
import AccountUserInfo from '@screens/home/account/components/user_info';
import {dismissModal, setButtons} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';

import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

type AccountModalProps = {
    componentId: AvailableScreens;
    currentUser?: UserModel;
    enableCustomUserStatuses: boolean;
    showFullName: boolean;
};

const CLOSE_BUTTON_ID = 'close.account_modal.button';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 24,
    },
    container: {
        backgroundColor: theme.centerChannelBg,
    },
}));

const AccountModal = ({componentId, currentUser, enableCustomUserStatuses, showFullName}: AccountModalProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const close = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useEffect(() => {
        setButtons(componentId, {
            leftButtons: [{
                id: CLOSE_BUTTON_ID,
                icon: CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor),
                testID: 'close.settings.button',
            }],
        });
    }, [componentId, theme.sidebarHeaderTextColor]);

    useNavButtonPressed(CLOSE_BUTTON_ID, componentId, close, []);
    useAndroidHardwareBackHandler(componentId, close);

    if (!currentUser) {
        return null;
    }

    return (
        <SafeAreaView
            edges={['bottom']}
            style={[styles.flex, styles.container]}
            testID='account_modal.screen'
        >
            <ScrollView
                alwaysBounceVertical={false}
                contentContainerStyle={styles.scrollContent}
            >
                <AccountUserInfo
                    user={currentUser}
                    showFullName={showFullName}
                    theme={theme}
                />
                <AccountOptions
                    enableCustomUserStatuses={enableCustomUserStatuses}
                    isTablet={false}
                    user={currentUser}
                    theme={theme}
                />
            </ScrollView>
        </SafeAreaView>
    );
};

export default AccountModal;
