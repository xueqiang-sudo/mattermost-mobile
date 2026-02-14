// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import {of as of$, combineLatest} from 'rxjs';
import {switchMap, map, distinctUntilChanged} from 'rxjs/operators';
import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Text, View} from 'react-native';
import {Navigation, OptionsModalPresentationStyle} from 'react-native-navigation';

import {logout} from '@actions/remote/session';
import {handleTeamChange} from '@actions/remote/team';
import CompassIcon from '@components/compass_icon';
import FormattedName from '@components/formatted_name';
import ProfilePicture from '@components/profile_picture';
import QrcodeSvg from '@assets/images/svgs/qrcode.svg';
import SlideUpPanelItem, {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {Preferences, Screens} from '@constants';
import {useServerDisplayName, useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useUserLocale} from '@context/user_locale';
import {usePreventDoubleTap} from '@hooks/utils';
import {queryPreferencesByCategoryAndName} from '@queries/servers/preference';
import {queryJoinedTeams, queryMyTeams, observeTeam} from '@queries/servers/team';
import {observeCurrentTeamId} from '@queries/servers/system';
import {observeCurrentUser} from '@queries/servers/user';
import {showModal, showModalWithBackButton, bottomSheet, dismissBottomSheet} from '@screens/navigation';

import {formatFullName} from '@utils/display_name';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {alertServerLogout} from '@utils/server';
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

const CLOSE_EXTERNAL_PROFILE = 'close-left-drawer-external-profile';
const CLOSE_CREATE_TEAM = 'close-left-drawer-create-team';
const CLOSE_JOIN_TEAM_QR = 'close-left-drawer-join-team-qr';
function DrawerContentInner({onClose, currentUser, myOrderedTeams}: DrawerContentProps) {
    const theme = useTheme();
    const intl = useIntl();
    const locale = useUserLocale();
    const serverUrl = useServerUrl();
    const serverDisplayName = useServerDisplayName();
    const styles = getStyleSheet(theme);

    const CLOSE_ACCOUNT_MODAL = 'close-left-drawer-account-modal';

    const openAccountModal = usePreventDoubleTap(useCallback(() => {
        showModalWithBackButton(
            Screens.ACCOUNT_MODAL,
            intl.formatMessage({id: 'account.your_profile', defaultMessage: 'Your Profile'}),
            CLOSE_ACCOUNT_MODAL,
        );
    }, [intl]));

    const openExternalCard = usePreventDoubleTap(useCallback(() => {
        showModalWithBackButton(
            Screens.EXTERNAL_PROFILE_CARD,
            intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'}),
            CLOSE_EXTERNAL_PROFILE,
        );
    }, [intl]));

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
        const title = intl.formatMessage({id: 'plus_menu.scan_qr_code.title', defaultMessage: 'Scan QR Code'});
        showModal(Screens.QR_SCANNER, title, {}, {
            modalPresentationStyle: OptionsModalPresentationStyle.fullScreen,
            layout: {
                componentBackgroundColor: '#000000',
            },
            statusBar: {
                visible: true,
                drawBehind: true,
                backgroundColor: 'transparent',
                style: 'light',
            },
            topBar: {
                visible: false,
            },
            modal: {
                swipeToDismiss: false,
            },
            hardwareBackButton: {
                dismissModalOnPress: false,
            },
        });
    }, [intl]));

    const openSettings = usePreventDoubleTap(useCallback(() => {
        showModal(
            Screens.SETTINGS,
            intl.formatMessage({id: 'mobile.screen.settings', defaultMessage: 'Settings'}),
        );
    }, [intl]));

    const handleLogout = usePreventDoubleTap(useCallback(() => {
        Navigation.updateProps(Screens.HOME, {extra: undefined});
        alertServerLogout(serverDisplayName, () => logout(serverUrl, intl), intl);
    }, [serverDisplayName, serverUrl, intl]));

    if (!currentUser) {
        return null;
    }

    const fullName = formatFullName(locale, currentUser.lastName ?? '', currentUser.firstName ?? '');
    const nicknameDisplay = (currentUser.nickname && currentUser.nickname.trim()) || currentUser.username;

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.userBlock}>
                    <TouchableWithFeedback
                        onPress={openAccountModal}
                        type='opacity'
                        testID='left_drawer.user_block.avatar'
                    >
                        <ProfilePicture
                            author={currentUser}
                            size={48}
                            showStatus={false}
                            borderRadius={5}
                        />
                    </TouchableWithFeedback>
                    <TouchableWithFeedback
                        onPress={openAccountModal}
                        type='opacity'
                        style={styles.userTextTouchable}
                        testID='left_drawer.user_block'
                    >
                        <View style={styles.userText}>
                            {fullName ? (
                                <>
                                    <View style={styles.userNameRow}>
                                        <FormattedName
                                            locale={locale}
                                            surname={currentUser.lastName ?? ''}
                                            givenName={currentUser.firstName ?? ''}
                                            numberOfLines={1}
                                            style={styles.userDisplayName}
                                            testID='left_drawer.user_block.display_name'
                                        />
                                        <Text style={styles.userNameChevron}>{'>'}</Text>
                                    </View>
                                    <Text
                                        numberOfLines={1}
                                        style={styles.userSubtitle}
                                        testID='left_drawer.user_block.nickname'
                                    >
                                        {nicknameDisplay}
                                    </Text>
                                </>
                            ) : (
                                <View style={styles.userNameRow}>
                                    <Text
                                        numberOfLines={1}
                                        style={styles.userDisplayName}
                                        testID='left_drawer.user_block.nickname'
                                    >
                                        {nicknameDisplay}
                                    </Text>
                                    <Text style={styles.userNameChevron}>{'>'}</Text>
                                </View>
                            )}
                        </View>
                    </TouchableWithFeedback>
                    <TouchableWithFeedback
                        onPress={openExternalCard}
                        type='opacity'
                        style={styles.externalCardButton}
                        testID='left_drawer.user_block.external_card'
                    >
                        <View style={styles.externalCardIconCircle}>
                            <QrcodeSvg
                                width={22}
                                height={22}
                                fill={theme.sidebarText}
                            />
                        </View>
                    </TouchableWithFeedback>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>
                        {intl.formatMessage({id: 'left_drawer.enterprises', defaultMessage: 'Enterprises'})}
                    </Text>
                    {myOrderedTeams.length === 0 ? (
                        <Text style={styles.emptyTeams}>
                            {intl.formatMessage({id: 'left_drawer.no_enterprises', defaultMessage: 'No enterprises'})}
                        </Text>
                    ) : (
                        <DrawerTeamList
                            myOrderedTeams={myOrderedTeams}
                            onClose={onClose}
                        />
                    )}
                </View>
            </ScrollView>

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
                <TouchableWithFeedback
                    onPress={openSettings}
                    type='opacity'
                    style={styles.menuRow}
                    testID='left_drawer.settings'
                >
                    <CompassIcon
                        name='settings-outline'
                        size={24}
                        color={theme.sidebarText}
                    />
                    <Text style={styles.menuLabel}>
                        {intl.formatMessage({id: 'account.settings', defaultMessage: 'Settings'})}
                    </Text>
                </TouchableWithFeedback>
                <View style={styles.divider}/>
                <TouchableWithFeedback
                    onPress={handleLogout}
                    type='opacity'
                    style={styles.menuRow}
                    testID='left_drawer.logout'
                >
                    <CompassIcon
                        name='exit-to-app'
                        size={24}
                        color={theme.dndIndicator}
                    />
                    <Text style={[styles.menuLabel, styles.logoutLabel]}>
                        {intl.formatMessage({id: 'account.logout', defaultMessage: 'Log out'})}
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
            <Text
                numberOfLines={1}
                style={styles.teamName}
            >
                {team.displayName}
            </Text>
            {selected && (
                <CompassIcon
                    name='check'
                    size={22}
                    color={theme.sidebarText}
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

function DrawerTeamList({myOrderedTeams, onClose}: DrawerTeamListProps) {
    return (
        <>
            {myOrderedTeams.map((myTeam) => (
                <DrawerTeamRow
                    key={myTeam.id}
                    myTeam={myTeam}
                    onClose={onClose}
                />
            ))}
        </>
    );
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 16,
    },
    bottomSection: {
        paddingBottom: 16,
    },
    userBlock: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: theme.sidebarBg,
    },
    userTextTouchable: {
        flex: 1,
        minWidth: 0,
        marginLeft: 12,
    },
    userText: {
        flex: 1,
    },
    userNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
    },
    userNameChevron: {
        color: changeOpacity(theme.sidebarText, 0.8),
        ...typography('Heading', 400, 'SemiBold'),
        marginLeft: 4,
    },
    userDisplayName: {
        color: theme.sidebarText,
        ...typography('Heading', 400, 'SemiBold'),
    },
    userSubtitle: {
        color: changeOpacity(theme.sidebarText, 0.72),
        ...typography('Body', 100),
        marginTop: 2,
    },
    externalCardButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    externalCardIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: changeOpacity(theme.sidebarText, 0.12),
        alignItems: 'center',
        justifyContent: 'center',
    },
    section: {
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    sectionLabel: {
        color: changeOpacity(theme.sidebarText, 0.64),
        ...typography('Heading', 50),
        marginBottom: 8,
    },
    emptyTeams: {
        color: changeOpacity(theme.sidebarText, 0.64),
        ...typography('Body', 100),
    },
    teamRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 4,
    },
    teamRowSelected: {
        backgroundColor: changeOpacity(theme.sidebarText, 0.12),
    },
    teamName: {
        flex: 1,
        color: theme.sidebarText,
        ...typography('Body', 200),
        marginRight: 8,
    },
    divider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
        marginVertical: 6,
        marginHorizontal: 20,
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 20,
    },
    menuLabel: {
        color: theme.sidebarText,
        ...typography('Body', 200),
        marginLeft: 12,
    },
    logoutLabel: {
        color: theme.dndIndicator,
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
