// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef} from 'react';
import {View} from 'react-native';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {handleTeamChange} from '@actions/remote/team';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import SecurityManager from '@managers/security_manager';
import {resetToHome} from '@screens/navigation';
import {makeStyleSheetFromTheme} from '@utils/theme';

import EnterpriseSelection from './enterprise_selection';
import Header from './header';

import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

// import IconGallery from '@components/compass_icon/IconGallery';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.sidebarBg,
    },
}));

type Props = {
    componentId: AvailableScreens;
    nTeams: number;
    firstTeamId?: string;
    currentUser?: UserModel;
}

const safeAreaEdges = ['left' as const, 'right' as const];
const safeAreaStyle = {flex: 1};

const SelectTeam = ({
    componentId,
    nTeams,
    firstTeamId,
    currentUser,
}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const insets = useSafeAreaInsets();
    const top = useAnimatedStyle(() => {
        return {height: insets.top, backgroundColor: theme.sidebarBg};
    });
    const resettingToHome = useRef(false);

    useEffect(() => {
        if (resettingToHome.current) {
            return;
        }

        if ((nTeams > 0) && firstTeamId) {
            resettingToHome.current = true;
            handleTeamChange(useServerUrl(), firstTeamId).then(() => {
                resetToHome();
            });
        }
    }, [(nTeams > 0) && firstTeamId]);

    return (
        <SafeAreaView
            mode='margin'
            edges={safeAreaEdges}
            style={safeAreaStyle}
            nativeID={SecurityManager.getShieldScreenId(componentId)}
        >
            <Animated.View style={top}/>
            <View style={styles.container}>
                <Header/>
                {/* <IconGallery/> */}
                <EnterpriseSelection
                    serverUrl={useServerUrl()}
                    currentUser={currentUser}
                />
            </View>
        </SafeAreaView>
    );
};

export default SelectTeam;
