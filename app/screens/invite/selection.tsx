// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {
    Text,
    View,
    FlatList,
    type ListRenderItemInfo,
} from 'react-native';

import FloatingTextInput from '@components/floating_input/floating_text_input_label';
import OptionItem from '@components/option_item';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {goToScreen} from '@screens/navigation';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {displayUsername} from '@utils/user';

import SelectionSearchBar from './selection_search_bar';
import SelectionTeamBar from './selection_team_bar';
import TextItem from './text_item';
import {TextItemType, type InviteCandidate, type InviteCandidateTag, type SearchResult, type SendOptions} from './types';

const INITIAL_BATCH_TO_RENDER = 20;
const SCREEN_PADDING_H = 16;
const LIST_CORNER_RADIUS = 12;
const RESULT_ITEM_RADIUS = 12;

const keyExtractor = (item: InviteCandidate) => item.user.id;

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
        resultsContainer: {
            marginTop: 12,
            flex: 1,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.1),
            borderRadius: LIST_CORNER_RADIUS,
            overflow: 'hidden',
        },
        searchListFlatList: {
            backgroundColor: theme.centerChannelBg,
            borderRadius: LIST_CORNER_RADIUS,
            flex: 1,
        },
        contentContainer: {
            flex: 1,
            paddingHorizontal: SCREEN_PADDING_H,
            paddingTop: 4,
            paddingBottom: 16,
        },
        resultItem: {
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        },
        resultItemSelected: {
            backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        },
        resultItemLast: {
            borderBottomWidth: 0,
        },
        resultItemContent: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        resultInfo: {
            flex: 1,
            minWidth: 0,
        },
        resultItemMain: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        resultItemName: {
            flex: 1,
            color: theme.centerChannelColor,
            fontSize: 16,
            lineHeight: 22,
            fontWeight: '500',
        },
        resultTagRow: {
            marginTop: 6,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
        },
        resultTag: {
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: changeOpacity(theme.centerChannelColor, 0.12),
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        },
        resultTagText: {
            color: changeOpacity(theme.centerChannelColor, 0.72),
            fontSize: 12,
            lineHeight: 16,
            fontWeight: '500',
        },
        resultActionButton: {
            minWidth: 68,
            height: 32,
            borderRadius: RESULT_ITEM_RADIUS,
            borderWidth: 1,
            borderColor: theme.buttonBg,
            paddingHorizontal: 12,
            paddingVertical: 0,
            alignItems: 'center',
            justifyContent: 'center',
        },
        resultActionButtonSelected: {
            backgroundColor: changeOpacity(theme.buttonBg, 0.1),
        },
        resultActionButtonDisabled: {
            borderColor: changeOpacity(theme.centerChannelColor, 0.2),
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        },
        resultActionText: {
            fontSize: 13,
            lineHeight: 16,
            fontWeight: '600',
            color: theme.buttonBg,
        },
        resultActionTextDisabled: {
            color: changeOpacity(theme.centerChannelColor, 0.45),
        },
        emptyStateContainer: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingVertical: 32,
        },
        emptyStateTitle: {
            color: changeOpacity(theme.centerChannelColor, 0.72),
            fontSize: 15,
            lineHeight: 22,
            fontWeight: '600',
            textAlign: 'center',
        },
        emptyStateBody: {
            marginTop: 8,
            color: changeOpacity(theme.centerChannelColor, 0.56),
            fontSize: 13,
            lineHeight: 20,
            textAlign: 'center',
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
    serverUrl: string;
    term: string;
    searchResults: InviteCandidate[];
    selectedIds: {[id: string]: SearchResult};
    loading: boolean;
    testID: string;
    sendOptions: SendOptions;
    onSendOptionsChange: React.Dispatch<React.SetStateAction<SendOptions>>;
    onSearchChange: (text: string) => void;
    onSelectItem: (item: SearchResult) => void;
    onClose: () => Promise<void>;
    canInviteGuests: boolean;
    allowGuestMagicLink: boolean;
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
    serverUrl,
    term,
    searchResults,
    selectedIds,
    loading,
    testID,
    onSearchChange,
    onSelectItem,
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
}: SelectionProps) {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const intl = useIntl();

    const hasChannelsSelected = selectedChannels.length > 0;

    /**
     * 处理团队栏布局变化
     * @param e - 布局变化事件
     */
    const onLayoutSelectionTeamBar = useCallback(() => {
        // No-op: result list is rendered inline, no overlay positioning needed.
    }, []);

    /**
     * 处理搜索栏布局变化
     * @param e - 布局变化事件
     */
    const onLayoutSearchBar = useCallback(() => {
        // No-op: result list is rendered inline, no overlay positioning needed.
    }, []);
    const searchListFlatListStyle = useMemo(() => [styles.searchListFlatList], [styles.searchListFlatList]);

    /**
     * 渲染无搜索结果的提示
     */
    const renderNoResults = useCallback(() => {
        if (loading) {
            return null;
        }

        if (!term) {
            return (
                <View style={styles.emptyStateContainer}>
                    <Text style={styles.emptyStateTitle}>
                        {intl.formatMessage({
                            id: 'invite.search.empty_title',
                            defaultMessage: 'Search to select people to invite',
                        })}
                    </Text>
                    <Text style={styles.emptyStateBody}>
                        {intl.formatMessage({
                            id: 'invite.search.empty_body',
                            defaultMessage: 'Enter a name, phone number, or username to see candidates.',
                        })}
                    </Text>
                </View>
            );
        }

        return (
            <TextItem
                text={term}
                type={TextItemType.SEARCH_NO_RESULTS}
                testID='invite.search_list_no_results'
            />
        );
    }, [intl, loading, styles.emptyStateBody, styles.emptyStateContainer, styles.emptyStateTitle, term]);

    const getTagText = useCallback((tag: InviteCandidateTag) => {
        switch (tag) {
            case 'alreadyJoined':
                return intl.formatMessage({id: 'invite.tag.already_joined', defaultMessage: 'Already added'});
            case 'self':
                return intl.formatMessage({id: 'invite.tag.self', defaultMessage: 'Me'});
            case 'exactMatch':
                return intl.formatMessage({id: 'invite.tag.exact_match', defaultMessage: 'Exact match'});
            case 'customer':
                return intl.formatMessage({id: 'invite.tag.customer', defaultMessage: 'My customer'});
            case 'supplier':
                return intl.formatMessage({id: 'invite.tag.supplier', defaultMessage: 'My supplier'});
            case 'enterprise':
                return intl.formatMessage({id: 'invite.tag.enterprise', defaultMessage: 'Enterprise'});
            default:
                return '';
        }
    }, [intl]);

    const getDisplayName = useCallback((user: UserProfile) => {
        return displayUsername(user, 'full_name') || user.username || user.nickname || user.email || user.id;
    }, []);

    const renderItem = useCallback(({item, index}: ListRenderItemInfo<InviteCandidate>) => {
        const key = keyExtractor(item);
        const isSelected = Boolean(selectedIds[item.user.id]);
        const isDisabled = item.isAlreadyJoined;
        const isLast = index === searchResults.length - 1;
        let actionText = intl.formatMessage({id: 'invite.action.choose', defaultMessage: 'Select'});
        if (isDisabled) {
            actionText = intl.formatMessage({id: 'invite.action.already_added', defaultMessage: 'Added'});
        } else if (isSelected) {
            actionText = '✓';
        }

        const actionStyle = [
            styles.resultActionButton,
            isSelected && styles.resultActionButtonSelected,
            isDisabled && styles.resultActionButtonDisabled,
        ];
        const actionTextStyle = [
            styles.resultActionText,
            isDisabled && styles.resultActionTextDisabled,
        ];
        const rowStyle = [
            styles.resultItem,
            isSelected && !isDisabled && styles.resultItemSelected,
            isLast && styles.resultItemLast,
        ];

        const onPress = () => {
            if (!isDisabled) {
                onSelectItem(item.user);
            }
        };

        return (
            <TouchableWithFeedback
                key={key}
                index={key}
                onPress={onPress}
                underlayColor={changeOpacity(theme.buttonBg, 0.08)}
                type='native'
                testID={`invite.search_list_item.${key}`}
            >
                <View style={rowStyle}>
                    <View style={styles.resultItemContent}>
                        <View style={styles.resultInfo}>
                            <View style={styles.resultItemMain}>
                                <Text style={styles.resultItemName}>
                                    {getDisplayName(item.user)}
                                </Text>
                            </View>
                            {item.tags.length > 0 && (
                                <View style={styles.resultTagRow}>
                                    {item.tags.map((tag) => (
                                        <View
                                            key={`${item.user.id}.${tag}`}
                                            style={styles.resultTag}
                                        >
                                            <Text style={styles.resultTagText}>
                                                {getTagText(tag)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                        <View style={actionStyle}>
                            <Text style={actionTextStyle}>
                                {actionText}
                            </Text>
                        </View>
                    </View>
                </View>
            </TouchableWithFeedback>
        );
    }, [getDisplayName, getTagText, intl, onSelectItem, searchResults.length, selectedIds, styles, theme.buttonBg]);

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
                <SelectionSearchBar
                    term={term}
                    onSearchChange={onSearchChange}
                    onLayoutContainer={onLayoutSearchBar}
                />
                <View style={styles.resultsContainer}>
                    <FlatList
                        data={searchResults}
                        keyExtractor={keyExtractor}
                        initialNumToRender={INITIAL_BATCH_TO_RENDER}
                        ListEmptyComponent={renderNoResults}
                        maxToRenderPerBatch={INITIAL_BATCH_TO_RENDER + 1}
                        renderItem={renderItem}
                        testID='invite.search_list'
                        style={searchListFlatListStyle}
                    />
                </View>
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
        </View>
    );
}
