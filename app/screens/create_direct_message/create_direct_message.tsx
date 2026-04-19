// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Keyboard, type LayoutChangeEvent, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {makeDirectChannel, makeGroupChannel} from '@actions/remote/channel';
import {fetchProfiles, fetchProfilesInTeam, searchProfiles} from '@actions/remote/user';
import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import Search from '@components/search';
import SelectedUsers from '@components/selected_users';
import ServerUserList from '@components/server_user_list';
import {General, Preferences, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {useKeyboardOverlap} from '@hooks/device';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {dismissModal, setButtons} from '@screens/navigation';
import {createContactSectionsByNickname} from '@utils/contact_section';
import {alertErrorWithFallback} from '@utils/draft';
import {changeOpacity, getKeyboardAppearanceFromTheme, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

const messages = defineMessages({
    dm: {
        id: 'mobile.open_dm.error',
        defaultMessage: "We couldn't open a direct message with {displayName}. Please check your connection and try again.",
    },
    gm: {
        id: 'mobile.open_gm.error',
        defaultMessage: "We couldn't open a discussion group with those users. Please check your connection and try again.",
    },
    buttonText: {
        id: 'mobile.create_direct_message.start',
        defaultMessage: 'Start Conversation',
    },
    doneWithCount: {
        id: 'create_direct_message.done_with_count',
        defaultMessage: 'Done ({count})',
    },
    selectionHint: {
        id: 'create_direct_message.selection_hint',
        defaultMessage: 'One person: private chat · Several: discussion group. Long-press a row for profile.',
    },
    selectionHintPrefix: {
        id: 'create_direct_message.selection_hint_prefix',
        defaultMessage: 'One person: private chat · Several: discussion group.',
    },
});

const CLOSE_BUTTON = 'close-dms';

const SCREEN_PADDING_H = 16;

type Props = {
    componentId: AvailableScreens;
    currentTeamId: string;
    currentUserId: string;
    restrictDirectMessage: boolean;
    teammateNameDisplay: string;
    tutorialWatched: boolean;
}

/**
 * 关闭界面
 */
const close = () => {
    Keyboard.dismiss();
    dismissModal();
};

/**
 * 获取创建私信界面的样式
 */
const getStyleFromTheme = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            flex: 1,
            backgroundColor: theme.centerChannelBg,
        },
        contentContainer: {
            flex: 1,
            paddingHorizontal: SCREEN_PADDING_H,
            paddingTop: 12,
        },
        listFlex: {
            flex: 1,
            minHeight: 0,
            marginTop: 16,
        },
        searchCard: {
            borderRadius: 12,
            padding: 12,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        },
        searchBar: {
            marginBottom: 0,
        },
        selectionHint: {
            marginTop: 8,
            color: changeOpacity(theme.centerChannelColor, 0.56),
            ...typography('Body', 100, 'Regular'),
        },
        selectionHintPrefix: {
            fontFamily: 'OpenSans-SemiBold',
            fontWeight: '600',
            fontSize: 14,
            color: changeOpacity(theme.centerChannelColor, 0.8),
            allowFontScaling: false,
            maxFontSizeMultiplier: 1,
            paddingTop: 8,
        },
        searchBarContainer: {
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
            borderRadius: 8,
            height: 56,
        },
        searchBarInput: {
            backgroundColor: 'transparent',
        },
        loadingContainer: {
            alignItems: 'center',
            backgroundColor: theme.centerChannelBg,
            height: 70,
            justifyContent: 'center',
        },
        loadingText: {
            color: changeOpacity(theme.centerChannelColor, 0.6),
        },
        noResultContainer: {
            flexGrow: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
        },
        noResultText: {
            color: changeOpacity(theme.centerChannelColor, 0.5),
            ...typography('Body', 600, 'Regular'),
        },
    };
});

/**
 * 从列表中移除用户
 */
function removeProfileFromList(list: Set<string>, id: string) {
    const newSelectedIds = new Set(list);
    newSelectedIds.delete(id);
    return newSelectedIds;
}

/**
 * 创建私信/群聊界面组件
 */
export default function CreateDirectMessage({
    componentId,
    currentTeamId,
    currentUserId,
    restrictDirectMessage,
    teammateNameDisplay,
    tutorialWatched,
}: Props) {
    const serverUrl = useServerUrl();
    const theme = useTheme();
    const style = getStyleFromTheme(theme);
    const intl = useIntl();
    const {formatMessage} = intl;

    const mainView = useRef<View>(null);
    const [containerHeight, setContainerHeight] = useState(0);
    const keyboardOverlap = useKeyboardOverlap(mainView, containerHeight);

    const [term, setTerm] = useState('');
    const [startingConversation, setStartingConversation] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());
    const [showToast, setShowToast] = useState(false);
    const selectedCount = selectedIds.size;

    const color = changeOpacity(theme.centerChannelColor, 0.72);

    const primaryActionLabel = useMemo(() => {
        if (selectedCount > 1) {
            return formatMessage(messages.doneWithCount, {count: selectedCount});
        }
        return formatMessage(messages.buttonText);
    }, [formatMessage, selectedCount]);

    /**
     * 清空搜索
     */
    const clearSearch = useCallback(() => {
        setTerm('');
    }, []);

    /**
     * 移除已选用户
     */
    const handleRemoveProfile = useCallback((id: string) => {
        setSelectedIds((current) => removeProfileFromList(current, id));
    }, []);

    /**
     * 创建私信频道
     */
    const createDirectChannel = useCallback(async (id: string): Promise<boolean> => {
        const result = await makeDirectChannel(serverUrl, id);

        if (result.error) {
            alertErrorWithFallback(intl, result.error, messages.dm);
        }

        return !result.error;
    }, [intl, serverUrl]);

    /**
     * 创建群聊频道
     */
    const createGroupChannel = useCallback(async (ids: string[]): Promise<boolean> => {
        const result = await makeGroupChannel(serverUrl, ids);

        if (result.error) {
            alertErrorWithFallback(intl, result.error, messages.gm);
        }

        return !result.error;
    }, [intl, serverUrl]);

    /**
     * 开始对话
     */
    const startConversation = useCallback(async (selectedId?: string) => {
        if (startingConversation) {
            return;
        }

        setStartingConversation(true);

        const idsToUse = selectedId ? [selectedId] : Array.from(selectedIds);
        let success;
        if (idsToUse.length === 0) {
            success = false;
        } else if (idsToUse.length > 1) {
            success = await createGroupChannel(idsToUse);
        } else {
            success = await createDirectChannel(idsToUse[0]);
        }

        if (success) {
            close();
        } else {
            setStartingConversation(false);
        }
    }, [startingConversation, selectedIds, createGroupChannel, createDirectChannel]);

    /**
     * 选择用户
     */
    const handleSelectProfile = useCallback((user: UserProfile) => {
        if (user.id === currentUserId) {
            return;
        }
        clearSearch();
        setSelectedIds((current) => {
            if (current.has(user.id)) {
                return removeProfileFromList(current, user.id);
            }

            if (selectedCount >= General.MAX_USERS_IN_GM) {
                setShowToast(true);
                return current;
            }

            const newSelectedIds = new Set(current);
            newSelectedIds.add(user.id);

            return newSelectedIds;
        });
    }, [currentUserId, clearSearch, selectedCount]);

    /**
     * 处理布局变化
     */
    const onLayout = useCallback((e: LayoutChangeEvent) => {
        setContainerHeight(e.nativeEvent.layout.height);
    }, []);

    /**
     * 更新导航按钮
     */
    const updateNavigationButtons = useCallback(async () => {
        const closeIconColor = changeOpacity(theme.centerChannelColor, 0.72);
        const closeIcon = await CompassIcon.getImageSource('close', 24, closeIconColor);
        setButtons(componentId, {
            leftButtons: [{
                id: CLOSE_BUTTON,
                icon: closeIcon,
                testID: 'close.create_direct_message.button',
            }],
        });
    }, [componentId, theme.centerChannelColor]);

    /**
     * 处理搜索文本变化
     */
    const onChangeText = useCallback((searchTerm: string) => {
        setTerm(searchTerm);
    }, []);

    /**
     * 获取用户列表
     */
    const userFetchFunction = useCallback(async (page: number) => {
        let results;
        if (restrictDirectMessage) {
            results = await fetchProfilesInTeam(serverUrl, currentTeamId, page, General.PROFILE_CHUNK_SIZE, '', {active: true});
        } else {
            results = await fetchProfiles(serverUrl, page, General.PROFILE_CHUNK_SIZE, {active: true});
        }

        if (results.users?.length) {
            return results.users;
        }

        return [];
    }, [serverUrl, currentTeamId, restrictDirectMessage]);

    /**
     * 搜索用户
     */
    const userSearchFunction = useCallback(async (searchTerm: string) => {
        const lowerCasedTerm = searchTerm.toLowerCase();
        let results;
        if (restrictDirectMessage) {
            results = await searchProfiles(serverUrl, lowerCasedTerm, {team_id: currentTeamId, allow_inactive: false});
        } else {
            results = await searchProfiles(serverUrl, lowerCasedTerm, {allow_inactive: false});
        }

        if (results.data) {
            return results.data;
        }

        return [];
    }, [serverUrl, currentTeamId, restrictDirectMessage]);

    /**
     * 创建用户过滤器
     */
    const createUserFilter = useCallback((exactMatches: UserProfile[], searchTerm: string) => {
        return (p: UserProfile) => {
            if (p.id === currentUserId) {
                return false;
            }

            if (p.username === searchTerm || p.username.startsWith(searchTerm)) {
                exactMatches.push(p);
                return false;
            }

            return true;
        };
    }, [currentUserId]);

    useNavButtonPressed(CLOSE_BUTTON, componentId, close, [close]);
    useAndroidHardwareBackHandler(componentId, close);

    /**
     * 初始化导航按钮
     */
    useEffect(() => {
        updateNavigationButtons();
    }, [updateNavigationButtons]);

    /**
     * 检查是否达到最大用户数
     */
    useEffect(() => {
        setShowToast(selectedCount >= General.MAX_USERS_IN_GM);
    }, [selectedCount]);

    if (startingConversation) {
        return (
            <View style={style.container}>
                <Loading color={theme.buttonBg}/>
            </View>
        );
    }

    return (
        <SafeAreaView
            style={style.container}
            testID='create_direct_message.screen'
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            onLayout={onLayout}
            ref={mainView}
            edges={['top', 'left', 'right']}
        >
            <View style={style.contentContainer}>
                <View style={style.searchCard}>
                    <View style={style.searchBar}>
                        <Search
                            testID='create_direct_message.search_bar'
                            placeholder={formatMessage({id: 'create_direct_message.search_placeholder', defaultMessage: 'Search by name, phone, or username'})}
                            cancelButtonTitle={formatMessage({id: 'common.cancel', defaultMessage: 'Cancel'})}
                            placeholderTextColor={color}
                            onChangeText={onChangeText}
                            onCancel={clearSearch}
                            autoCapitalize='none'
                            keyboardAppearance={getKeyboardAppearanceFromTheme(theme)}
                            value={term}
                            inputContainerStyle={style.searchBarContainer}
                            inputStyle={style.searchBarInput}
                        />
                    </View>
                    <Text
                        style={style.selectionHintPrefix}
                        testID='create_direct_message.selection_hint'
                        allowFontScaling={false}
                        maxFontSizeMultiplier={1}
                    >
                        {formatMessage(messages.selectionHintPrefix)}
                    </Text>
                </View>
                <View style={style.listFlex}>
                    <ServerUserList
                        handleSelectProfile={handleSelectProfile}
                        selectedIds={selectedIds}
                        term={term}
                        testID='create_direct_message.user_list'
                        tutorialWatched={tutorialWatched}
                        fetchFunction={userFetchFunction}
                        searchFunction={userSearchFunction}
                        createFilter={createUserFilter}
                        location={Screens.CREATE_DIRECT_MESSAGE}
                        customSection={createContactSectionsByNickname}
                    />
                </View>
                <SelectedUsers
                    keyboardOverlap={keyboardOverlap}
                    showToast={showToast}
                    setShowToast={setShowToast}
                    toastIcon={'check'}
                    toastMessage={formatMessage(
                        {
                            id: 'mobile.create_direct_message.max_limit_reached',
                            defaultMessage: 'A discussion group can include up to {max, number} people besides you',
                        },
                        {max: General.MAX_USERS_IN_GM},
                    )}
                    selectedIds={selectedIds}
                    onRemove={handleRemoveProfile}
                    teammateNameDisplay={Preferences.DISPLAY_PREFER_NICKNAME}
                    onPress={startConversation}
                    buttonIcon={'forum-outline'}
                    buttonText={primaryActionLabel}
                    testID='create_direct_message'
                    maxUsers={General.MAX_USERS_IN_GM}
                    avatarBorderRadius={8}
                />
            </View>
        </SafeAreaView>
    );
}
