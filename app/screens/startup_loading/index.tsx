// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {StyleSheet, View} from 'react-native';

import Loading from '@components/loading';
import {useTheme} from '@context/theme';
import Background from '@screens/background';

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const StartupLoading = () => {
    const theme = useTheme();
    const intl = useIntl();

    return (
        <View style={styles.container}>
            <Background theme={theme}/>
            <View style={styles.overlay}>
                <Loading
                    size='large'
                    color={theme.buttonBg}
                    footerText={intl.formatMessage({id: 'mobile.startup.loading', defaultMessage: 'Loading...'})}
                    testID='startup.loading.screen'
                />
            </View>
        </View>
    );
};

export default StartupLoading;
