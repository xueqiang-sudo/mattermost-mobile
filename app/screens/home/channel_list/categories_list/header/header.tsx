// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNetInfo} from '@react-native-community/netinfo';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {type Insets, Modal, StyleSheet, Text, View} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import Clipboard from '@react-native-clipboard/clipboard';

import {logout} from '@actions/remote/session';
import OpenDrawerIcon from '@assets/images/svgs/open_drawer.svg';
import CompassIcon from '@components/compass_icon';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {Screens} from '@constants';

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


import type TeamModel from '@typings/database/models/servers/team';
import type UserModel from '@typings/database/models/servers/user';

const PLUS_BUTTON_SIZE = 32;

type Props = {
    canCreateChannels: boolean;
    canInvitePeople: boolean;
    currentUser?: UserModel;
    currentTeam?: TeamModel | null;
    hasCurrentTeam: boolean;
    hasTeams: boolean;
    iconPad?: boolean;
    onHeaderPress?: () => void;

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

    // --- Invite dialog overlay ---
    inviteOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: changeOpacity('#000', 0.4),
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999,
    },
    inviteDialog: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        width: '85%',
        maxWidth: 380,
        padding: 20,
    },
    inviteTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 300, 'SemiBold'),
        marginBottom: 16,
    },
    inviteLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Body', 75),
        marginBottom: 6,
    },
    inviteLinkBox: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 4,
        padding: 10,
        marginBottom: 12,
    },
    inviteLinkText: {
        color: theme.centerChannelColor,
        ...typography('Body', 75),
        fontSize: 13,
    },
    inviteHint: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 50),
        marginBottom: 16,
        lineHeight: 18,
    },
    inviteActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    inviteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 4,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        gap: 6,
    },
    inviteBtnPrimary: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    inviteBtnText: {
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    inviteBtnTextPrimary: {
        color: theme.buttonColor,
    },
}));

const hitSlop: Insets = {top: 10, bottom: 30, left: 20, right: 20};

const ChannelListHeader = ({
    canCreateChannels,
    canInvitePeople,
    currentUser,
    currentTeam,
    hasCurrentTeam,
    hasTeams,
    iconPad,
    onHeaderPress,
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

    const isErpTeam = Boolean((currentTeam as any)?.erp_address);

    // --- Invite dialog state ---
    const [showInviteDialog, setShowInviteDialog] = useState(false);
    const [showExternalInviteDialog, setShowExternalInviteDialog] = useState(false);
    const [inviteCopied, setInviteCopied] = useState(false);
    const [externalInviteCopied, setExternalInviteCopied] = useState(false);

    const inviteLink = useMemo(() => {
        if (!currentUser?.id || !serverUrl) {
            return '';
        }
        return `${serverUrl}/invite?id=${currentUser.id}`;
    }, [currentUser?.id, serverUrl]);

    const externalInviteLink = useMemo(() => {
        if (!currentUser?.id || !serverUrl) {
            return '';
        }
        return `${serverUrl}/invite?invited_by=${currentUser.id}`;
    }, [currentUser?.id, serverUrl]);

    const openGroupChat = useCallback(() => {
        const title = intl.formatMessage({id: 'plus_menu.open_group_chat.title', defaultMessage: 'Start group chat'});
        const closeIconColor = theme.sidebarHeaderTextColor;
        const closeButton = CompassIcon.getImageSourceSync('close', 24, closeIconColor);
        showModal(Screens.CREATE_DIRECT_MESSAGE, title, {
            closeButton,
            variant: 'default',
        });
    }, [intl, theme]);

    const openCreateCategory = useCallback(() => {
        const teamId = (currentTeam as any)?.id || '';
        if (!teamId) {
            return;
        }
        showModal(
            Screens.CREATE_CATEGORY,
            intl.formatMessage({id: 'create_category_modal.title', defaultMessage: 'Create Category'}),
            {teamId},
        );
    }, [currentTeam, intl]);

    const handleInviteInternal = useCallback(() => {
        setInviteCopied(false);
        setShowInviteDialog(true);
    }, []);

    const handleInviteExternal = useCallback(() => {
        setExternalInviteCopied(false);
        setShowExternalInviteDialog(true);
    }, []);

    const handleCopyInvite = useCallback(() => {
        Clipboard.setString(inviteLink);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2000);
    }, [inviteLink]);

    const handleCopyExternalInvite = useCallback(() => {
        Clipboard.setString(externalInviteLink);
        setExternalInviteCopied(true);
        setTimeout(() => setExternalInviteCopied(false), 2000);
    }, [externalInviteLink]);

    const scanQRCode = useCallback(() => {
        showQrScannerModal(intl);
    }, [intl]);

    // Build menu items matching webapp PC "+" button
    const menuItems: PlusMenuEntry[] = [
        {
            icon: 'message-plus-outline',
            labelId: 'plus_menu.create_group',
            defaultLabel: 'Create Group Chat',
            onPress: openGroupChat,
            testID: 'plus_menu_item.create_group_chat',
        },
        {type: 'separator'},
        {
            icon: 'folder-plus-outline',
            labelId: 'plus_menu.create_category',
            defaultLabel: 'Create Category',
            onPress: openCreateCategory,
            testID: 'plus_menu_item.create_category',
        },
        {type: 'separator'},
        {
            icon: 'link-variant',
            labelId: 'plus_menu.invite_external',
            defaultLabel: 'Invite External People',
            onPress: handleInviteExternal,
            testID: 'plus_menu_item.invite_external',
        },
    ];

    if (!isErpTeam) {
        menuItems.push({type: 'separator'});
        menuItems.push({
            icon: 'account-plus-outline',
            labelId: 'plus_menu.invite_internal',
            defaultLabel: 'Invite Internal People',
            onPress: handleInviteInternal,
            testID: 'plus_menu_item.invite_internal',
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

    const hasTeamContext = hasCurrentTeam || hasTeams;

    let header;
    if (hasTeamContext) {
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

    const companyName = (currentTeam as any)?.display_name?.trim() || '';

    return (
        <Animated.View style={animatedStyle}>
            <View style={[styles.headerContainer, {paddingTop: insets.top}]}>
                <View style={styles.headerContent}>
                    {header}
                </View>
                <View style={styles.headerDivider}/>
            </View>

            {/* Internal invite dialog */}
            <Modal visible={showInviteDialog} transparent={true} animationType='fade' onRequestClose={() => setShowInviteDialog(false)}>
                <TouchableWithFeedback
                    onPress={() => setShowInviteDialog(false)}
                    style={styles.inviteOverlay}
                    type='opacity'
                >
                    <TouchableWithFeedback
                        onPress={(e: any) => e?.stopPropagation?.()}
                        style={styles.inviteDialog}
                        type='opacity'
                    >
                        <Text style={styles.inviteTitle}>
                            {intl.formatMessage(
                                {id: 'sidebar_left.invite_people_title', defaultMessage: 'Invite people to join {companyName}'},
                                {companyName},
                            )}
                        </Text>
                        <Text style={styles.inviteLabel}>
                            {intl.formatMessage({id: 'contacts.invite_link_label', defaultMessage: 'Invite link'})}
                        </Text>
                        <View style={styles.inviteLinkBox}>
                            <Text
                                numberOfLines={3}
                                style={styles.inviteLinkText}
                            >
                                {inviteLink}
                            </Text>
                        </View>
                        <View style={styles.inviteActions}>
                            <TouchableWithFeedback
                                onPress={handleCopyInvite}
                                style={[styles.inviteBtn, styles.inviteBtnPrimary]}
                                type='opacity'
                            >
                                <>
                                    <CompassIcon name='content-copy' size={14} color={theme.buttonColor}/>
                                    <Text style={[styles.inviteBtnText, styles.inviteBtnTextPrimary]}>
                                        {inviteCopied
                                            ? intl.formatMessage({id: 'contacts.invite_copied', defaultMessage: 'Copied!'})
                                            : intl.formatMessage({id: 'contacts.invite_copy', defaultMessage: 'Copy'})
                                        }
                                    </Text>
                                </>
                            </TouchableWithFeedback>
                            <TouchableWithFeedback
                                onPress={() => setShowInviteDialog(false)}
                                style={styles.inviteBtn}
                                type='opacity'
                            >
                                <Text style={styles.inviteBtnText}>
                                    {intl.formatMessage({id: 'common.close', defaultMessage: 'Close'})}
                                </Text>
                            </TouchableWithFeedback>
                        </View>
                    </TouchableWithFeedback>
                </TouchableWithFeedback>
            </Modal>

            {/* External invite dialog */}
            <Modal visible={showExternalInviteDialog} transparent={true} animationType='fade' onRequestClose={() => setShowExternalInviteDialog(false)}>
                <TouchableWithFeedback
                    onPress={() => setShowExternalInviteDialog(false)}
                    style={styles.inviteOverlay}
                    type='opacity'
                >
                    <TouchableWithFeedback
                        onPress={(e: any) => e?.stopPropagation?.()}
                        style={styles.inviteDialog}
                        type='opacity'
                    >
                        <Text style={styles.inviteTitle}>
                            {intl.formatMessage({id: 'plus_menu.invite_external_title', defaultMessage: 'Invite External People'})}
                        </Text>
                        <Text style={styles.inviteLabel}>
                            {intl.formatMessage({id: 'contacts.invite_link_label', defaultMessage: 'Invite link'})}
                        </Text>
                        <View style={styles.inviteLinkBox}>
                            <Text
                                numberOfLines={3}
                                style={styles.inviteLinkText}
                            >
                                {externalInviteLink}
                            </Text>
                        </View>
                        <Text style={styles.inviteHint}>
                            {intl.formatMessage({
                                id: 'plus_menu.invite_external_hint',
                                defaultMessage: 'Share this link with external contacts. They can register and connect with you after opening the link.',
                            })}
                        </Text>
                        <View style={styles.inviteActions}>
                            <TouchableWithFeedback
                                onPress={handleCopyExternalInvite}
                                style={[styles.inviteBtn, styles.inviteBtnPrimary]}
                                type='opacity'
                            >
                                <>
                                    <CompassIcon name='content-copy' size={14} color={theme.buttonColor}/>
                                    <Text style={[styles.inviteBtnText, styles.inviteBtnTextPrimary]}>
                                        {externalInviteCopied
                                            ? intl.formatMessage({id: 'contacts.invite_copied', defaultMessage: 'Copied!'})
                                            : intl.formatMessage({id: 'contacts.invite_copy', defaultMessage: 'Copy'})
                                        }
                                    </Text>
                                </>
                            </TouchableWithFeedback>
                            <TouchableWithFeedback
                                onPress={() => setShowExternalInviteDialog(false)}
                                style={styles.inviteBtn}
                                type='opacity'
                            >
                                <Text style={styles.inviteBtnText}>
                                    {intl.formatMessage({id: 'common.close', defaultMessage: 'Close'})}
                                </Text>
                            </TouchableWithFeedback>
                        </View>
                    </TouchableWithFeedback>
                </TouchableWithFeedback>
            </Modal>
        </Animated.View>
    );
};

export default ChannelListHeader;
