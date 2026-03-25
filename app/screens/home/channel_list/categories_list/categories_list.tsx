// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useMemo} from 'react';
import {useWindowDimensions} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

import {TABLET_SIDEBAR_WIDTH, TEAM_SIDEBAR_WIDTH} from '@constants/view';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import PlaybooksButton from '@playbooks/components/playbooks_button';
import {makeStyleSheetFromTheme} from '@utils/theme';

import Categories from './categories';
import ChannelListHeader from './header';
import LoadChannelsError from './load_channels_error';
import SubHeader from './subheader';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.sidebarBg,
        paddingTop: 6,
    },
}));

type ChannelListProps = {
    hasChannels: boolean;
    iconPad?: boolean;
    moreThanOneTeam: boolean;
    playbooksEnabled?: boolean;
};

const getTabletWidth = (moreThanOneTeam: boolean) => {
    return TABLET_SIDEBAR_WIDTH - (moreThanOneTeam ? TEAM_SIDEBAR_WIDTH : 0);
};

const CategoriesList = ({
    hasChannels,
    iconPad,
    moreThanOneTeam,
    playbooksEnabled,
}: ChannelListProps) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const {width} = useWindowDimensions();
    const isTablet = useIsTablet();
    const tabletWidth = useSharedValue(isTablet ? getTabletWidth(moreThanOneTeam) : 0);

    useEffect(() => {
        if (isTablet) {
            tabletWidth.value = getTabletWidth(moreThanOneTeam);
        }

        // tabletWidth is a sharedValue, so it's safe to ignore this warning
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTablet, moreThanOneTeam]);

    const tabletStyle = useAnimatedStyle(() => {
        if (!isTablet) {
            return {
                maxWidth: width,
            };
        }

        return {maxWidth: withTiming(tabletWidth.value, {duration: 350})};
    }, [isTablet, width]);

    const playbooksButtonComponent = useMemo(() => {
        if (!playbooksEnabled) {
            return null;
        }

        return (
            <PlaybooksButton/>
        );
    }, [playbooksEnabled]);

    const content = useMemo(() => {
        if (!hasChannels) {
            return (<LoadChannelsError/>);
        }

        return (
            <>
                {playbooksButtonComponent}
                <Categories/>
            </>
        );
    }, [hasChannels, playbooksButtonComponent]);

    return (
        <Animated.View style={[styles.container, tabletStyle]}>
            <ChannelListHeader
                iconPad={iconPad}
            />
            <SubHeader/>
            {content}
        </Animated.View>
    );
};

export default CategoriesList;
