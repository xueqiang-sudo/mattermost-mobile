// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {DeviceEventEmitter, StyleSheet, View} from 'react-native';

import {switchToChannelById} from '@actions/remote/channel';
import Loading from '@components/loading';
import {Events} from '@constants';
import {CHANNEL} from '@constants/screens';
import {useServerUrl} from '@context/server';
import {useIsTablet} from '@hooks/device';
import {useTeamSwitch} from '@hooks/team_switch';
import PerformanceMetricsManager from '@managers/performance_metrics_manager';

import CollapsibleChannelList from './collapsible_channel_list';
import LoadCategoriesError from './error';
import UnreadCategories from './unreads';

import type CategoryModel from '@typings/database/models/servers/category';
import type ChannelModel from '@typings/database/models/servers/channel';

type Props = {
    categories: CategoryModel[];
    currentTeamId: string;
    currentUserId: string;
    teamMemberIds: ReadonlySet<string>;
    onlyUnreads: boolean;
    unreadsOnTop: boolean;
}

const styles = StyleSheet.create({
    mainList: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    loadingView: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
});

const Categories = ({
    categories,
    currentTeamId,
    currentUserId,
    teamMemberIds,
    onlyUnreads,
    unreadsOnTop,
}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const isTablet = useIsTablet();
    const switchingTeam = useTeamSwitch();
    const teamId = categories[0]?.teamId;
    const showOnlyUnreadsCategory = onlyUnreads && !unreadsOnTop;

    // Split into built-in categories (all non-custom) and custom categories
    const {builtInCategories, customCategories} = useMemo(() => {
        const builtIn: CategoryModel[] = [];
        const custom: CategoryModel[] = [];

        for (const cat of categories) {
            if (cat.type === 'custom') {
                custom.push(cat);
            } else {
                builtIn.push(cat);
            }
        }
        custom.sort((a, b) => a.sortOrder - b.sortOrder);

        return {builtInCategories: builtIn, customCategories: custom};
    }, [categories, teamMemberIds]);

    const [initiaLoad, setInitialLoad] = useState(!categories.length);

    const onChannelSwitch = useCallback(async (c: Channel | ChannelModel) => {
        DeviceEventEmitter.emit(Events.ACTIVE_SCREEN, CHANNEL);
        PerformanceMetricsManager.startMetric('mobile_channel_switch');
        switchToChannelById(serverUrl, c.id);
    }, [serverUrl]);

    useEffect(() => {
        const t = setTimeout(() => {
            setInitialLoad(false);
        }, 0);

        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (switchingTeam) {
            return;
        }

        PerformanceMetricsManager.endMetric('mobile_team_switch', serverUrl);
    }, [switchingTeam]);

    if (!categories.length) {
        return <LoadCategoriesError/>;
    }

    return (
        <>
            {!switchingTeam && !initiaLoad && showOnlyUnreadsCategory &&
            <View key={teamId || 'no-team'} style={styles.mainList}>
                <UnreadCategories
                    currentTeamId={teamId}
                    isTablet={isTablet}
                    onChannelSwitch={onChannelSwitch}
                    onlyUnreads={showOnlyUnreadsCategory}
                />
            </View>
            }
            {!switchingTeam && !initiaLoad && !showOnlyUnreadsCategory && (
                <CollapsibleChannelList
                    key={teamId || 'no-team'}
                    builtInCategories={builtInCategories}
                    customCategories={customCategories}
                    teamMemberIds={teamMemberIds}
                    currentUserId={currentUserId}
                    locale={intl.locale}
                    isTablet={isTablet}
                    onChannelSwitch={onChannelSwitch}
                />
            )}
            {(switchingTeam || initiaLoad) && (
                <View style={styles.loadingView}>
                    <Loading
                        size='large'
                        themeColor='sidebarText'
                        testID='categories.loading'
                    />
                </View>
            )}
        </>
    );
};

export default Categories;
