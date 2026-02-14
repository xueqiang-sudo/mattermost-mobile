// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {dismissModal} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';

import AccountOptions from '@screens/home/account/components/options';
import AccountUserInfo from '@screens/home/account/components/user_info';

import type {AvailableScreens} from '@typings/screens/navigation';
import type UserModel from '@typings/database/models/servers/user';

type AccountModalProps = {
    closeButtonId: string;
    componentId: AvailableScreens;
    currentUser?: UserModel;
    enableCustomUserStatuses: boolean;
    showFullName: boolean;
};

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

const AccountModal = ({componentId, closeButtonId, currentUser, enableCustomUserStatuses, showFullName}: AccountModalProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const close = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, close, []);
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
