// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {FlatList, Text, View} from 'react-native';
import {of as of$, combineLatest} from 'rxjs';
import {switchMap, map, distinctUntilChanged} from 'rxjs/operators';

import {handleTeamChange} from '@actions/remote/team';

import CompanyIcon from '@components/company_icon';
import CompassIcon from '@components/compass_icon';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {Preferences, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {observeCurrentTeamId} from '@queries/servers/system';
import {queryJoinedTeams, queryMyTeams, observeTeam} from '@queries/servers/team';
import {observeCurrentUser} from '@queries/servers/user';
import {showModalWithBackButton, bottomSheet, dismissBottomSheet} from '@screens/navigation';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {WithDatabaseArgs} from '@typings/database/database';
import type MyTeamModel from '@typings/database/models/servers/my_team';
import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

type DrawerContentProps = {
    onClose: () => void;
    currentUser?: UserModel;
    myOrderedTeams: MyTeamModel[];
};

const CLOSE_CREATE_TEAM = 'close-left-drawer-create-team';
const CLOSE_JOIN_TEAM_QR = 'close-left-drawer-join-team-qr';
function DrawerContentInner({onClose, currentUser, myOrderedTeams}: DrawerContentProps) {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const openCreateOrJoinSheet = usePreventDoubleTap(useCallback(() => {
        const renderContent = () => (
            <>
                <SlideUpPanelItem
                    leftIcon='plus-box-outline'
                    text={intl.formatMessage({id: 'plus_menu.create_enterprise.title', defaultMessage: 'Create Enterprise'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                        showModalWithBackButton(
                            Screens.CREATE_TEAM,
                            intl.formatMessage({id: 'create_team.title', defaultMessage: 'Create Enterprise'}),
                            CLOSE_CREATE_TEAM,
                            {serverUrl, nickname: currentUser?.nickname || '', userId: currentUser?.id || ''},
                        );
                    }}
                    testID='left_drawer.create_enterprise'
                />
                <SlideUpPanelItem
                    leftIcon='account-multiple-plus-outline'
                    text={intl.formatMessage({id: 'plus_menu.join_enterprise.title', defaultMessage: 'Join Enterprise'})}
                    onPress={async () => {
                        await dismissBottomSheet();
                        showModalWithBackButton(
                            Screens.JOIN_TEAM_QR,
                            intl.formatMessage({id: 'join_team_qr.title', defaultMessage: 'Join Enterprise'}),
                            CLOSE_JOIN_TEAM_QR,
                            {serverUrl, nickname: currentUser?.nickname || '', userId: currentUser?.id || ''},
                        );
                    }}
                    testID='left_drawer.join_enterprise'
                />
            </>
        );
        bottomSheet({
            closeButtonId: 'close-left-drawer-create-join',
            renderContent,
            snapPoints: [1, bottomSheetSnapPoint(2, ITEM_HEIGHT)],
            theme,
            title: intl.formatMessage({id: 'left_drawer.create_join_enterprise.title', defaultMessage: 'Create / Join Enterprise'}),
        });
    }, [intl, serverUrl, currentUser, theme]));

    const openScanQRCode = usePreventDoubleTap(useCallback(() => {
        showQrScannerModal(intl);
    }, [intl]));

    if (!currentUser) {
        return null;
    }

    return (
        <View style={styles.container}>
            <View style={styles.listWrapper}>
                {myOrderedTeams.length === 0 ? (
                    <Text style={styles.emptyTeams}>
                        {intl.formatMessage({id: 'left_drawer.no_enterprises', defaultMessage: 'No enterprises'})}
                    </Text>
                ) : (
                    <FlatList
                        data={myOrderedTeams}
                        keyExtractor={(item) => item.id}
                        renderItem={({item}) => (
                            <DrawerTeamRow
                                myTeam={item}
                                onClose={onClose}
                            />
                        )}
                        ItemSeparatorComponent={() => <View style={styles.teamSeparator}/>}
                        contentContainerStyle={styles.teamListContent}
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                    />
                )}
            </View>

            <View style={styles.bottomSection}>
                <View style={styles.divider}/>
                <TouchableWithFeedback
                    onPress={openCreateOrJoinSheet}
                    type='opacity'
                    style={styles.menuRow}
                    testID='left_drawer.create_join_enterprise'
                >
                    <CompassIcon
                        name='plus-box-outline'
                        size={24}
                        color={theme.sidebarText}
                    />
                    <Text style={styles.menuLabel}>
                        {intl.formatMessage({id: 'left_drawer.create_join_enterprise.title', defaultMessage: 'Create / Join Enterprise'})}
                    </Text>
                </TouchableWithFeedback>
                <TouchableWithFeedback
                    onPress={openScanQRCode}
                    type='opacity'
                    style={styles.menuRow}
                    testID='left_drawer.scan_qr_code'
                >
                    <CompassIcon
                        name='camera-outline'
                        size={24}
                        color={theme.sidebarText}
                    />
                    <Text style={styles.menuLabel}>
                        {intl.formatMessage({id: 'plus_menu.scan_qr_code.title', defaultMessage: 'Scan QR Code'})}
                    </Text>
                </TouchableWithFeedback>
            </View>
        </View>
    );
}

type DrawerTeamListProps = {
    myOrderedTeams: MyTeamModel[];
    onClose: () => void;
};

function DrawerTeamListInner({
    myTeam,
    team,
    selected,
    onClose,
}: {
    myTeam: MyTeamModel;
    team?: TeamModel;
    selected: boolean;
    onClose: () => void;
}) {
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const onPress = useCallback(() => {
        if (!team || selected) {
            return;
        }
        handleTeamChange(serverUrl, team.id);
        onClose();
    }, [team, selected, serverUrl, onClose]);

    if (!team) {
        return null;
    }

    return (
        <TouchableWithFeedback
            onPress={onPress}
            type='opacity'
            style={[styles.teamRow, selected && styles.teamRowSelected]}
            testID={`left_drawer.team_row.${team.id}`}
        >
            {selected && <View style={styles.teamRowSelectedBar}/>}
            <CompanyIcon
                width={36}
                height={36}
                bgColor={selected ? theme.sidebarHeaderTextColor : changeOpacity(theme.sidebarText, 0.12)}
                iconColor={selected ? theme.sidebarHeaderBg : theme.sidebarText}
                style={{marginRight: 12, flexShrink: 0}}
            />
            <Text
                numberOfLines={1}
                style={[styles.teamName, selected && styles.teamNameSelected]}
            >
                {team.displayName}
            </Text>
            {selected && (
                <CompassIcon
                    name='check-circle'
                    size={22}
                    color={theme.sidebarHeaderTextColor}
                />
            )}
        </TouchableWithFeedback>
    );
}

const DrawerTeamRow = withDatabase(withObservables(['myTeam'], ({myTeam, database}: WithDatabaseArgs & {myTeam: MyTeamModel}) => ({
    team: observeTeam(database, myTeam.id),
    selected: observeCurrentTeamId(database).pipe(
        switchMap((ct) => of$(ct === myTeam.id)),
        distinctUntilChanged(),
    ),
}))(DrawerTeamListInner));

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
    },
    listWrapper: {
        flex: 1,
        minHeight: 0,
        paddingHorizontal: 16,
    },
    teamListContent: {
        paddingVertical: 8,
    },
    teamSeparator: {
        height: 8,
    },
    bottomSection: {
        flexShrink: 0,
        paddingTop: 4,
        paddingBottom: 20,
    },
    emptyTeams: {
        color: changeOpacity(theme.sidebarText, 0.64),
        ...typography('Body', 100),
        paddingVertical: 24,
        paddingHorizontal: 16,
    },
    teamRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: 'transparent',
        position: 'relative',
        overflow: 'hidden',
    },
    teamRowSelected: {
        backgroundColor: changeOpacity(theme.sidebarText, 0.08),
    },
    teamRowSelectedBar: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: theme.sidebarText,
        borderTopLeftRadius: 10,
        borderBottomLeftRadius: 10,
    },
    teamName: {
        flex: 1,
        color: changeOpacity(theme.sidebarText, 0.9),
        ...typography('Body', 200),
        marginRight: 8,
        minWidth: 0,
    },
    teamNameSelected: {
        color: theme.sidebarText,
        ...typography('Body', 200, 'SemiBold'),
    },
    divider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        marginVertical: 8,
        marginHorizontal: 16,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    menuLabel: {
        color: theme.sidebarText,
        ...typography('Body', 200),
        marginLeft: 12,
    },
}));

const withTeams = withObservables([], ({database}: WithDatabaseArgs) => {
    const myTeams = queryMyTeams(database).observe();
    const teamIds = queryJoinedTeams(database).observe().pipe(
        map((ts) => ts.map((t) => ({id: t.id, displayName: t.displayName}))),
    );
    const order = queryPreferencesByCategoryAndName(database, Preferences.CATEGORIES.TEAMS_ORDER).
        observeWithColumns(['value']).pipe(
            switchMap((p) => (p.length ? of$(p[0].value.split(',')) : of$([]))),
        );
    const myOrderedTeams = combineLatest([myTeams, order, teamIds]).pipe(
        map(([memberships, o, teams]) => {
            const sortedTeamIds = new Set(o);
            const membershipMap = new Map(memberships.map((m) => [m.id, m]));

            if (sortedTeamIds.size) {
                const mySortedTeams = [...sortedTeamIds].
                    filter((id) => id && membershipMap.has(id)).
                    map((id) => membershipMap.get(id)!);
                const extraTeams = teams.
                    filter((t) => t.id && !sortedTeamIds.has(t.id) && membershipMap.has(t.id)).
                    sort((a, b) => a.displayName.toLocaleLowerCase().localeCompare(b.displayName.toLocaleLowerCase())).
                    map((t) => membershipMap.get(t.id)!);
                return [...mySortedTeams, ...extraTeams];
            }
            return teams.
                filter((t) => t.id && membershipMap.has(t.id)).
                sort((a, b) => a.displayName.toLocaleLowerCase().localeCompare(b.displayName.toLocaleLowerCase())).
                map((t) => membershipMap.get(t.id)!);
        }),
    );
    return {
        currentUser: observeCurrentUser(database),
        myOrderedTeams,
    };
});

export default withDatabase(withTeams(DrawerContentInner));
