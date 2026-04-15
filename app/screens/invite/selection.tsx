// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {
    Keyboard,
    Platform,
    View,
    type LayoutChangeEvent,
    useWindowDimensions,
    FlatList,
    type ListRenderItemInfo,
    ScrollView,
} from 'react-native';
import Animated, {useAnimatedStyle, useDerivedValue} from 'react-native-reanimated';

import SelectedChip from '@components/chips/selected_chip';
import SelectedUserChip from '@components/chips/selected_user_chip';
import FloatingTextInput from '@components/floating_input/floating_text_input_label';
import OptionItem from '@components/option_item';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import UserItem from '@components/user_item';
import {Screens} from '@constants';
import {MAX_LIST_HEIGHT, MAX_LIST_TABLET_DIFF} from '@constants/autocomplete';
import {useTheme} from '@context/theme';
import {useAutocompleteDefaultAnimatedValues} from '@hooks/autocomplete';
import {useIsTablet} from '@hooks/device';
import {goToScreen} from '@screens/navigation';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';

import InviteHowItWorks from './invite_how_it_works';
import SelectionSearchBar from './selection_search_bar';
import SelectionTeamBar from './selection_team_bar';
import TextItem from './text_item';
import {TextItemType, type SearchResult, type SendOptions} from './types';

const AUTOCOMPLETE_ADJUST = 5;

const INITIAL_BATCH_TO_RENDER = 15;
const SCROLL_EVENT_THROTTLE = 60;
const SCREEN_PADDING_H = 16;
const LIST_CORNER_RADIUS = 12;

const keyboardDismissProp = Platform.select({
    android: {
        onScrollBeginDrag: Keyboard.dismiss,
    },
    ios: {
        keyboardDismissMode: 'on-drag' as const,
    },
});

const keyExtractor = (item: SearchResult) => (
    typeof item === 'string' ? item : (item as UserProfile).id
);

/**
 * 生成主题相关的样式表
 * @param theme - 当前应用的主题
 * @returns 样式表对象
 */
const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            display: 'flex',
            flex: 1,
            backgroundColor: theme.centerChannelBg,
        },
        searchList: {
            left: SCREEN_PADDING_H,
            right: SCREEN_PADDING_H,
            position: 'absolute',
            bottom: Platform.select({ios: 'auto', default: undefined}),
        },
        searchListBorder: {
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.1),
            borderRadius: LIST_CORNER_RADIUS,
            elevation: 2,
        },
        searchListPadding: {
            paddingVertical: 8,
            flex: 1,
        },
        searchListShadow: {
            shadowColor: theme.centerChannelColor,
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: {
                width: 0,
                height: 4,
            },
            borderRadius: LIST_CORNER_RADIUS,
            backgroundColor: theme.centerChannelBg,
        },
        searchListFlatList: {
            backgroundColor: theme.centerChannelBg,
            borderRadius: LIST_CORNER_RADIUS,
            paddingHorizontal: 8,
        },
        selectedItems: {
            display: 'flex',
            maxHeight: 120,
        },
        selectedItemsContainer: {
            alignItems: 'flex-start',
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginVertical: 12,
            marginHorizontal: 0,
            gap: 8,
        },
        contentContainer: {
            paddingHorizontal: SCREEN_PADDING_H,
            paddingTop: 4,
            paddingBottom: 16,
        },
        optionsContainer: {
            marginTop: 16,
        },
        optionCard: {
            backgroundColor: theme.centerChannelBg,
            borderRadius: LIST_CORNER_RADIUS,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        },
    };
});

/**
 * 提取频道ID
 * @param channelId - 频道对象
 * @returns 频道ID字符串
 */
function extractChannelId(channelId: Channel) {
    return channelId.id;
}

type SelectionProps = {
    teamId: string;
    teamDisplayName: string;
    teamLastIconUpdate: number;
    teamInviteId: string;
    teammateNameDisplay: string;
    serverUrl: string;
    term: string;
    searchResults: SearchResult[];
    selectedIds: {[id: string]: SearchResult};
    keyboardOverlap: number;
    wrapperHeight: number;
    loading: boolean;
    testID: string;
    sendOptions: SendOptions;
    onSendOptionsChange: React.Dispatch<React.SetStateAction<SendOptions>>;
    onSearchChange: (text: string) => void;
    onSelectItem: (item: SearchResult) => void;
    onRemoveItem: (id: string) => void;
    onClose: () => Promise<void>;
    canInviteGuests: boolean;
    allowGuestMagicLink: boolean;
    emailInvitationsEnabled: boolean;
}

/**
 * 邀请新人加入界面的主组件
 * 提供搜索、选择、配置邀请选项的功能
 */
export default function Selection({
    teamId,
    teamDisplayName,
    teamLastIconUpdate,
    teamInviteId,
    teammateNameDisplay,
    serverUrl,
    term,
    searchResults,
    selectedIds,
    keyboardOverlap,
    wrapperHeight,
    loading,
    testID,
    onSearchChange,
    onSelectItem,
    onRemoveItem,
    onClose,
    sendOptions: {
        inviteAsGuest,
        includeCustomMessage,
        customMessage,
        selectedChannels,
        guestMagicLink,
    },
    onSendOptionsChange,
    canInviteGuests,
    allowGuestMagicLink,
    emailInvitationsEnabled,
}: SelectionProps) {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const dimensions = useWindowDimensions();
    const isTablet = useIsTablet();
    const intl = useIntl();

    const [teamBarHeight, setTeamBarHeight] = useState(0);
    const [searchBarHeight, setSearchBarHeight] = useState(0);

    const hasChannelsSelected = selectedChannels.length > 0;

    /**
     * 处理团队栏布局变化
     * @param e - 布局变化事件
     */
    const onLayoutSelectionTeamBar = useCallback((e: LayoutChangeEvent) => {
        setTeamBarHeight(e.nativeEvent.layout.height);
    }, []);

    /**
     * 处理搜索栏布局变化
     * @param e - 布局变化事件
     */
    const onLayoutSearchBar = useCallback((e: LayoutChangeEvent) => {
        setSearchBarHeight(e.nativeEvent.layout.height);
    }, []);

    /**
     * 处理移除已选择项
     * @param id - 要移除的项的ID
     */
    const handleOnRemoveItem = useCallback((id: string) => {
        onRemoveItem(id);
    }, [onRemoveItem]);

    const otherElementsSize = teamBarHeight + searchBarHeight;
    const workingSpace = wrapperHeight - keyboardOverlap;
    const spaceOnTop = otherElementsSize - AUTOCOMPLETE_ADJUST;
    const spaceOnBottom = workingSpace - otherElementsSize;
    const autocompletePosition = spaceOnBottom > spaceOnTop ? (
        otherElementsSize
    ) : (
        workingSpace - otherElementsSize
    );
    const autocompleteAvailableSpace = spaceOnBottom > spaceOnTop ? spaceOnBottom : spaceOnTop;
    const isLandscape = dimensions.width > dimensions.height;
    const maxHeightAdjust = (isTablet && isLandscape) ? MAX_LIST_TABLET_DIFF : 0;
    const defaultMaxHeight = MAX_LIST_HEIGHT - maxHeightAdjust;

    const [animatedAutocompletePosition, animatedAutocompleteAvailableSpace] = useAutocompleteDefaultAnimatedValues(autocompletePosition, autocompleteAvailableSpace);

    const maxHeight = useDerivedValue(() => {
        return Math.min(animatedAutocompleteAvailableSpace.value, defaultMaxHeight);
    }, [animatedAutocompleteAvailableSpace, defaultMaxHeight]);

    const searchListContainerAnimatedStyle = useAnimatedStyle(() => ({
        top: animatedAutocompletePosition.value,
        maxHeight: maxHeight.value,
    }), [animatedAutocompletePosition, maxHeight]);

    const searchListContainerStyle = useMemo(() => {
        const style = [];

        style.push(
            styles.searchList,
            searchListContainerAnimatedStyle,
        );

        if (Platform.OS === 'ios') {
            style.push(styles.searchListShadow);
        }

        return style;
    }, [styles, searchListContainerAnimatedStyle]);

    const searchListFlatListStyle = useMemo(() => {
        const style = [];

        style.push(styles.searchListFlatList);

        if (searchResults.length || (term && !loading)) {
            style.push(styles.searchListBorder, styles.searchListPadding);
        }

        return style;
    }, [loading, searchResults.length, styles, term]);

    /**
     * 渲染无搜索结果的提示
     */
    const renderNoResults = useCallback(() => {
        if (!term || loading) {
            return null;
        }

        return (
            <TextItem
                text={term}
                type={TextItemType.SEARCH_NO_RESULTS}
                testID='invite.search_list_no_results'
            />
        );
    }, [term, loading]);

    /**
     * 渲染搜索结果列表项
     * @param item - 列表项数据
     */
    const renderItem = useCallback(({item}: ListRenderItemInfo<SearchResult>) => {
        const key = keyExtractor(item);

        return typeof item === 'string' ? (
            <TouchableWithFeedback
                key={key}
                index={key}
                onPress={() => onSelectItem(item)}
                underlayColor={changeOpacity(theme.buttonBg, 0.08)}
                type='native'
                testID={`invite.search_list_item.${key}`}
            >
                <TextItem
                    text={item}
                    type={TextItemType.SEARCH_INVITE}
                    testID='invite.search_list_text_item'
                />
            </TouchableWithFeedback>
        ) : (
            <View style={{borderRadius: 12, overflow: 'hidden'}}>
                <UserItem
                    user={item}
                    testID='invite.search_list_user_item'
                    onUserPress={onSelectItem}
                    padding={12}
                    includeMargin={false}
                />
            </View>
        );
    }, [theme.buttonBg, onSelectItem]);

    /**
     * 跳转到频道选择器界面
     */
    const goToSelectorScreen = useCallback((() => {
        const screen = Screens.INTEGRATION_SELECTOR;
        const title = intl.formatMessage({id: 'invite.selected_channels', defaultMessage: 'Selected channels'});

        const handleSelectChannels = (channels: Channel[]) => {
            onSendOptionsChange((options) => ({
                ...options,
                selectedChannels: channels.map(extractChannelId),
            }));
        };

        goToScreen(screen, title, {
            dataSource: 'channels',
            handleSelect: handleSelectChannels,
            selected: selectedChannels,
            isMultiselect: true,
        });
    }), [intl, selectedChannels, onSendOptionsChange]);

    /**
     * 处理邀请为访客选项变化
     */
    const handleInviteAsGuestChange = useCallback(() => {
        onSendOptionsChange((options) => ({
            ...options,
            inviteAsGuest: !options.inviteAsGuest,
        }));
    }, [onSendOptionsChange]);

    /**
     * 处理包含自定义消息选项变化
     */
    const handleIncludeCustomMessageChange = useCallback(() => {
        onSendOptionsChange((options) => ({
            ...options,
            includeCustomMessage: !options.includeCustomMessage,
        }));
    }, [onSendOptionsChange]);

    /**
     * 处理自定义消息内容变化
     * @param text - 新的消息文本
     */
    const handleCustomMessageChange = useCallback((text: string) => {
        onSendOptionsChange((options) => ({
            ...options,
            customMessage: text,
        }));
    }, [onSendOptionsChange]);

    /**
     * 处理访客免密登录选项变化
     */
    const handlePasswordlessInvitesChange = useCallback(() => {
        onSendOptionsChange((options) => ({
            ...options,
            guestMagicLink: !options.guestMagicLink,
        }));
    }, [onSendOptionsChange]);

    /**
     * 渲染已选择的项
     */
    const renderSelectedItems = () => {
        const selectedItems = [];

        for (const id of Object.keys(selectedIds)) {
            const selectedItem = selectedIds[id];

            selectedItems.push(typeof selectedItem === 'string' ? (
                <SelectedChip
                    id={id}
                    key={id}
                    text={selectedItem}
                    onRemove={handleOnRemoveItem}
                    testID={`invite.selected_item.${selectedItem}`}
                />
            ) : (
                <SelectedUserChip
                    key={id}
                    user={selectedItem}
                    teammateNameDisplay={teammateNameDisplay}
                    onPress={handleOnRemoveItem}
                    testID='invite.selected_item'
                />
            ));
        }

        return selectedItems;
    };

    return (
        <View
            style={styles.container}
            testID={testID}
        >
            <SelectionTeamBar
                teamId={teamId}
                teamDisplayName={teamDisplayName}
                teamLastIconUpdate={teamLastIconUpdate}
                teamInviteId={teamInviteId}
                serverUrl={serverUrl}
                onLayoutContainer={onLayoutSelectionTeamBar}
                onClose={onClose}
            />
            <View style={styles.contentContainer}>
                <InviteHowItWorks emailInvitationsEnabled={emailInvitationsEnabled}/>
                <SelectionSearchBar
                    term={term}
                    onSearchChange={onSearchChange}
                    onLayoutContainer={onLayoutSearchBar}
                />
                {Object.keys(selectedIds).length > 0 && (
                    <ScrollView
                        style={styles.selectedItems}
                        contentContainerStyle={styles.selectedItemsContainer}
                        testID='invite.selected_items'
                    >
                        {renderSelectedItems()}
                    </ScrollView>
                )}
                <View style={styles.optionsContainer}>
                    {canInviteGuests && (
                        <View style={styles.optionCard}>
                            <OptionItem
                                label={intl.formatMessage({id: 'invite.invite_as_guest', defaultMessage: 'Invite as guest'})}
                                description={intl.formatMessage({id: 'invite.invite_as_guest_description', defaultMessage: 'Guests are limited to selected channels'})}
                                type='toggle'
                                selected={inviteAsGuest}
                                action={handleInviteAsGuestChange}
                                testID='invite.invite_as_guest'
                            />
                        </View>
                    )}
                    {inviteAsGuest && (
                        <View style={styles.optionCard}>
                            <OptionItem
                                label={intl.formatMessage({id: 'invite.selected_channels', defaultMessage: 'Selected channels'})}
                                type='arrow'
                                action={goToSelectorScreen}
                                info={hasChannelsSelected ? intl.formatMessage({id: 'invite.selected_channels_count', defaultMessage: '{count} {count, plural, one{channel} other{channels}}'}, {count: selectedChannels.length}) : intl.formatMessage({id: 'invite.no_channels_selected', defaultMessage: 'Required for guests'})}
                                isInfoDestructive={!hasChannelsSelected}
                                testID='invite.selected_channels'
                                icon={'globe'}
                            />
                            <OptionItem
                                label={intl.formatMessage({id: 'invite.set_custom_message', defaultMessage: 'Set a custom message'})}
                                type='toggle'
                                selected={includeCustomMessage}
                                action={handleIncludeCustomMessageChange}
                                testID='invite.include_custom_message'
                            />
                            {includeCustomMessage && (
                                <FloatingTextInput
                                    label={intl.formatMessage({id: 'invite.custom_message', defaultMessage: 'Enter a custom message'})}
                                    value={customMessage}
                                    onChangeText={handleCustomMessageChange}
                                    testID='invite.custom_message'
                                    theme={theme}
                                    multiline={true}
                                />
                            )}
                            {allowGuestMagicLink && (
                                <OptionItem
                                    label={intl.formatMessage({id: 'invite.guest_magic_link', defaultMessage: 'Allow newly created guests to login without password'})}
                                    type='toggle'
                                    selected={guestMagicLink}
                                    action={handlePasswordlessInvitesChange}
                                    testID='invite.guest_magic_link'
                                />
                            )}
                        </View>
                    )}
                </View>
            </View>
            <Animated.View style={searchListContainerStyle}>
                <FlatList
                    data={searchResults}
                    keyboardShouldPersistTaps='always'
                    {...keyboardDismissProp}
                    keyExtractor={keyExtractor}
                    initialNumToRender={INITIAL_BATCH_TO_RENDER}
                    ListEmptyComponent={renderNoResults}
                    maxToRenderPerBatch={INITIAL_BATCH_TO_RENDER + 1}
                    renderItem={renderItem}
                    scrollEventThrottle={SCROLL_EVENT_THROTTLE}
                    testID='invite.search_list'
                    style={searchListFlatListStyle}
                />
            </Animated.View>
        </View>
    );
}
