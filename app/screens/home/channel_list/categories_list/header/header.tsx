// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNetInfo} from '@react-native-community/netinfo';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {type Insets, StyleSheet, Text, View} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {logout} from '@actions/remote/session';
import OpenDrawerIcon from '@assets/images/svgs/open_drawer.svg';
import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {Screens} from '@constants';
import {ENABLE_INTERNAL_GROUPS} from '@constants/channel';

import {useLeftDrawer} from '@context/left_drawer';
import {type PlusMenuEntry, usePlusMenu} from '@context/plus_menu';
import {useServerDisplayName, useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import WebsocketManager from '@managers/websocket_manager';
import {usePreventDoubleTap} from '@hooks/utils';
import {findChannels, showModal} from '@screens/navigation';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';

import {alertServerLogout} from '@utils/server';
import {changeOpacity, makeStyleSheetFromTheme, WECHAT_HOME_DIVIDER_OPACITY, WECHAT_HOME_DROPDOWN_GAP, WECHAT_HOME_PADDING_H, WECHAT_HOME_SECONDARY_TEXT_OPACITY} from '@utils/theme';
import {typography} from '@utils/typography';


import type UserModel from '@typings/database/models/servers/user';

const PLUS_BUTTON_SIZE = 32;

type Props = {
    canCreateChannels: boolean;
    canInvitePeople: boolean;
    currentUser?: UserModel;
    displayName?: string;
    iconPad?: boolean;
    onHeaderPress?: () => void;
    pushProxyStatus: string;

    /** 话题按钮，放在搜索左侧，顺序：话题 | 搜索 | + */
    threadsButton?: React.ReactNode;
}

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    headerContainer: {
        backgroundColor: theme.sidebarBg,
    },
    headerContent: {
        paddingLeft: WECHAT_HOME_PADDING_H,
        paddingRight: WECHAT_HOME_PADDING_H,
    },
    headerDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.dividerColor,
    },
    headingStyles: {
        color: theme.centerChannelColor,
        ...typography('Heading', 300, 'SemiBold'),
    },
    subHeadingStyles: {
        color: changeOpacity(theme.centerChannelColor, WECHAT_HOME_SECONDARY_TEXT_OPACITY),
        ...typography('Body', 75),
        lineHeight: 16,
        marginTop: 1,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    chevronButton: {
        marginLeft: 4,
    },
    chevronIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.8),
        fontSize: 24,
    },
    rightButtonsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    plusButton: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        height: PLUS_BUTTON_SIZE,
        width: PLUS_BUTTON_SIZE,
        borderRadius: PLUS_BUTTON_SIZE / 2,
    },
    plusButtonTouchable: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchButton: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        height: PLUS_BUTTON_SIZE,
        width: PLUS_BUTTON_SIZE,
        borderRadius: PLUS_BUTTON_SIZE / 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    plusIcon: {
        color: changeOpacity(theme.centerChannelColor, 0.8),
        fontSize: 22,
    },
    pushAlert: {
        marginLeft: 5,
    },
    subHeadingView: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 48,
    },
    noTeamHeadingStyles: {
        color: changeOpacity(theme.centerChannelColor, WECHAT_HOME_SECONDARY_TEXT_OPACITY),
        ...typography('Body', 100, 'SemiBold'),
    },
    noTeamHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 40,
    },
    outsideBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 44,
        paddingVertical: 8,
    },
    firstBox: {
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
        marginHorizontal: 2,
        paddingVertical: 0,
    },
    menuButton: {
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: -6,
    },
    statusText: {
        position: 'absolute',
        left: 52,
        right: 108,
        textAlign: 'center',
        color: changeOpacity(theme.centerChannelColor, WECHAT_HOME_SECONDARY_TEXT_OPACITY),
        ...typography('Body', 75),
    },
}));

const hitSlop: Insets = {top: 10, bottom: 30, left: 20, right: 20};

const ChannelListHeader = ({
    canCreateChannels,
    canInvitePeople,
    currentUser,
    displayName,
    iconPad,
    onHeaderPress,
    pushProxyStatus,
    threadsButton,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const insets = useSafeAreaInsets();
    const {openDrawer} = useLeftDrawer();
    const {openPlusMenu} = usePlusMenu();
    const serverDisplayName = useServerDisplayName();
    const marginLeft = useSharedValue(iconPad ? 50 : 0);
    const styles = getStyles(theme);
    const animatedStyle = useAnimatedStyle(() => ({
        marginLeft: withTiming(marginLeft.value, {duration: 350}),
    }), []);
    const serverUrl = useServerUrl();
    const plusButtonRef = useRef<View>(null);
    const menuButtonRef = useRef<View>(null);

    // --- 连接状态 ---
    const netInfo = useNetInfo();
    const [wsState, setWsState] = useState<WebsocketConnectedState>('not_connected');
    const [statusText, setStatusText] = useState('');
    const initialSessionRef = useRef(true);
    const prevWsStateRef = useRef<WebsocketConnectedState>('not_connected');
    const statusTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!serverUrl) {
            return undefined;
        }
        const sub = WebsocketManager.observeWebsocketState(serverUrl).subscribe((s) => {
            setWsState(s);
        });
        return () => sub.unsubscribe();
    }, [serverUrl]);

    // 标记首次会话结束
    useEffect(() => {
        if (wsState === 'connected') {
            initialSessionRef.current = false;
        }
    }, [wsState]);

    // 根据 WS 状态和网络状态更新提示文本
    useEffect(() => {
        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
            statusTimerRef.current = null;
        }

        // 设备无网络
        if (netInfo.isConnected === false) {
            setStatusText(intl.formatMessage({id: 'connection_banner.device_offline', defaultMessage: 'No network connection'}));
            statusTimerRef.current = setTimeout(() => setStatusText(''), 2000);
            return;
        }

        // WS 重新连接成功（非首次）→ 显示 2 秒后消失
        if (wsState === 'connected' && prevWsStateRef.current !== 'connected') {
            prevWsStateRef.current = wsState;
            if (!initialSessionRef.current) {
                setStatusText(intl.formatMessage({id: 'connection_banner.connected', defaultMessage: 'Connection restored'}));
                statusTimerRef.current = setTimeout(() => setStatusText(''), 2000);
            }
            return;
        }

        if (wsState === 'connected') {
            prevWsStateRef.current = wsState;
            setStatusText('');
            return;
        }

        // WS 断开
        if (wsState === 'not_connected') {
            prevWsStateRef.current = wsState;
            setStatusText(intl.formatMessage({id: 'connection_banner.server_unreachable', defaultMessage: 'Unable to reach server. Reconnecting...'}));
            return;
        }

        // WS 正在连接
        if (wsState === 'connecting') {
            prevWsStateRef.current = wsState;
            if (!initialSessionRef.current) {
                setStatusText(intl.formatMessage({id: 'connection_banner.connecting', defaultMessage: 'Connecting...'}));
            }
            return;
        }
    }, [wsState, netInfo.isConnected, intl]);

    useEffect(() => {
        return () => {
            if (statusTimerRef.current) {
                clearTimeout(statusTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        marginLeft.value = iconPad ? 50 : 0;
    }, [iconPad]);

    const openGroupChat = useCallback(() => {
        const title = intl.formatMessage({id: 'plus_menu.open_group_chat.title', defaultMessage: 'Start group chat'});
        const closeIconColor = theme.sidebarHeaderTextColor;
        const closeButton = CompassIcon.getImageSourceSync('close', 24, closeIconColor);
        showModal(Screens.CREATE_DIRECT_MESSAGE, title, {
            closeButton,
            variant: 'default',
        });
    }, [intl, theme]);

    const createNewChannel = useCallback(() => {
        const title = intl.formatMessage({id: 'mobile.create_channel.title', defaultMessage: 'New channel'});
        showModal(Screens.CREATE_OR_EDIT_CHANNEL, title);
    }, [intl]);

    const scanQRCode = useCallback(() => {
        showQrScannerModal(intl);
    }, [intl]);

    const invitePeopleToTeam = useCallback(() => {
        showModal(
            Screens.INVITE,
            intl.formatMessage({id: 'invite.title', defaultMessage: 'Invite'}),
        );
    }, [intl]);

    const menuItems: PlusMenuEntry[] = [
        {
            icon: 'account-multiple-outline',
            labelId: 'plus_menu.open_group_chat.title',
            defaultLabel: 'Start group chat',
            onPress: openGroupChat,
            testID: 'plus_menu_item.open_group_chat',
        },
    ];

    if (canCreateChannels && ENABLE_INTERNAL_GROUPS) {
        menuItems.push({
            icon: 'plus',
            labelId: 'plus_menu.create_new_channel.title',
            defaultLabel: 'Create New Channel',
            onPress: createNewChannel,
            testID: 'plus_menu_item.create_new_channel',
        });
    }

    if (canInvitePeople) {
        menuItems.push({
            icon: 'account-plus-outline',
            labelId: 'plus_menu.invite_people_to_team.title',
            defaultLabel: 'Invite members',
            onPress: invitePeopleToTeam,
            testID: 'plus_menu_item.invite_people_to_team',
        });
    }

    menuItems.push({type: 'separator'});
    menuItems.push({
        icon: 'camera-outline',
        labelId: 'plus_menu.scan_qr_code.title',
        defaultLabel: 'Scan QR Code',
        onPress: scanQRCode,
        testID: 'plus_menu_item.scan_qr_code',
    });

    const onPress = usePreventDoubleTap(useCallback(() => {
        const node = plusButtonRef.current;
        if (!node) {
            return;
        }
        node.measureInWindow((x, y, width, height) => {
            openPlusMenu({
                anchorLeft: x,
                anchorWidth: width,
                anchorTop: y + height + WECHAT_HOME_DROPDOWN_GAP,
                items: menuItems,
            });
        });
    }, [menuItems, openPlusMenu]));

    const onSearchPress = usePreventDoubleTap(useCallback(() => {
        findChannels(
            intl.formatMessage({id: 'find_channels.title', defaultMessage: '搜索群聊、联系人'}),
            theme,
        );
    }, [intl, theme]));

    const onLogoutPress = useCallback(() => {
        alertServerLogout(serverDisplayName, () => logout(serverUrl, intl), intl);
    }, [intl, serverDisplayName, serverUrl]);

    let header;
    if (displayName) {
        header = (
            <View style={styles.outsideBox}>
                <View ref={menuButtonRef} collapsable={false}>
                    <TouchableWithFeedback
                        onPress={() => {
                            // 测量汉堡图标位置，让抽屉面板从图标下方开始显示
                            menuButtonRef.current?.measureInWindow((_x, y, _w, h) => {
                                openDrawer(y + h + 4);
                            });
                        }}
                        style={styles.menuButton}
                        testID='channel_list_header.menu.button'
                        type='opacity'
                    >
                        <OpenDrawerIcon
                            width={22}
                            height={22}
                            color={theme.centerChannelColor}
                        />
                    </TouchableWithFeedback>
                </View>
                <View style={{flex: 1}}/>
                {Boolean(statusText) && (
                    <Text
                        numberOfLines={1}
                        ellipsizeMode='tail'
                        style={styles.statusText}
                        testID='channel_list_header.connection_status'
                    >
                        {statusText}
                    </Text>
                )}
                <View style={styles.rightButtonsContainer}>
                    {threadsButton}
                    <TouchableWithFeedback
                        hitSlop={hitSlop}
                        onPress={onSearchPress}
                        style={styles.searchButton}
                        testID='channel_list_header.search.button'
                        type='opacity'
                    >
                        <CompassIcon
                            style={styles.plusIcon}
                            name='magnify'
                        />
                    </TouchableWithFeedback>
                    <View
                        ref={plusButtonRef}
                        collapsable={false}
                        style={styles.plusButton}
                    >
                        <TouchableWithFeedback
                            hitSlop={hitSlop}
                            onPress={onPress}
                            style={styles.plusButtonTouchable}
                            testID='channel_list_header.plus.button'
                            type='opacity'
                        >
                            <CompassIcon
                                style={styles.plusIcon}
                                name='plus'
                            />
                        </TouchableWithFeedback>
                    </View>
                </View>
            </View>
        );
    } else {
        header = (
            <View style={styles.noTeamHeaderRow}>
                <View style={[styles.noTeamHeaderRow, {flex: 1}]}>
                    <Text
                        numberOfLines={1}
                        ellipsizeMode='tail'
                        style={styles.noTeamHeadingStyles}
                        testID='channel_list_header.team_display_name'
                    >
                        {serverDisplayName}
                    </Text>
                </View>
                <TouchableWithFeedback
                    onPress={onLogoutPress}
                    testID='channel_list_header.logout.button'
                    type='opacity'
                >
                    <Text
                        style={styles.noTeamHeadingStyles}
                        testID='channel_list_header.team_display_name'
                    >
                        {intl.formatMessage({id: 'account.logout', defaultMessage: 'Log out'})}
                    </Text>
                </TouchableWithFeedback>
            </View>
        );
    }

    return (
        <Animated.View style={animatedStyle}>
            <View style={[styles.headerContainer, {paddingTop: insets.top}]}>
                <View style={styles.headerContent}>
                    {header}
                </View>
                <View style={styles.headerDivider}/>
            </View>
        </Animated.View>
    );
};

export default ChannelListHeader;
