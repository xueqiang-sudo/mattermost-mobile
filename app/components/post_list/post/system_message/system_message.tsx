// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {defineMessages, type IntlShape, useIntl} from 'react-intl';
import {type StyleProp, Text, type TextStyle, View, type ViewStyle} from 'react-native';

import CompassIcon from '@components/compass_icon';
import Markdown from '@components/markdown';
import {getPostTypeMessagesForSystemActivity} from '@components/post_list/combined_user_activity/messages';
import {General, Post} from '@constants';
import {useTheme} from '@context/theme';
import {channelSupportsAnnouncementUx, usesDiscussionGroupChannelCopy} from '@utils/channel';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {secureGetFromRecord, ensureString} from '@utils/types';
import {typography} from '@utils/typography';
import {username2Nickname} from '@utils/user';

import type PostModel from '@typings/database/models/servers/post';
import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';
import type {PrimitiveType} from 'intl-messageformat';

type SystemMessageProps = {
    author?: UserModel;
    channelType?: ChannelType;
    compact?: boolean;
    location: AvailableScreens;
    post: PostModel;
}

type RenderersProps = SystemMessageProps & {
    intl: IntlShape;
    styles: {
        containerStyle: StyleProp<ViewStyle>;
        messageStyle: StyleProp<TextStyle>;
    };
    theme: Theme;
}

type RenderMessageProps = RenderersProps & {
    localeHolder: {
        id: string;
        defaultMessage: string;
    };
    skipMarkdown?: boolean;
    values: Record<string, PrimitiveType>;
    theme: Theme;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        container: {
            marginBottom: 5,
        },
        containerCompact: {
            alignSelf: 'center',
            alignItems: 'center',
            marginVertical: 12,
            maxWidth: '88%',
            paddingHorizontal: 16,
        },
        systemMessage: {
            color: changeOpacity(theme.centerChannelColor, 0.6),
            ...typography('Body', 200, 'Regular'),
        },
        systemMessageCompact: {
            color: changeOpacity(theme.centerChannelColor, 0.45),
            ...typography('Body', 75, 'Regular'),
            lineHeight: 18,
            textAlign: 'center',
        },
        announcementCard: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            alignSelf: 'center',
            maxWidth: '100%',
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
            marginVertical: 4,
        },
        announcementCardTextWrap: {
            flex: 1,
            flexShrink: 1,
            marginLeft: 8,
        },
    };
});

const renderUsername = (user?: UserModel | null): string => {
    if (user) {
        const displayName = username2Nickname(user, {includeFullName: false});
        return displayName ? `@${displayName}` : '';
    }

    return '';
};

const renderUsernameFromString = (value = ''): string => {
    if (value) {
        return (value[0] === '@') ? value : `@${value}`;
    }

    return value;
};

const renderMessage = ({location, post, styles, intl, localeHolder, theme, values, skipMarkdown = false}: RenderMessageProps) => {
    const {containerStyle, messageStyle} = styles;

    if (skipMarkdown) {
        return (
            <View style={containerStyle}>
                <Text style={messageStyle}>
                    {intl.formatMessage(localeHolder, values)}
                </Text>
            </View>
        );
    }

    return (
        <View style={containerStyle}>
            <Markdown
                baseTextStyle={messageStyle}
                channelId={post.channelId}
                disableGallery={true}
                location={location}
                value={intl.formatMessage(localeHolder, values)}
                theme={theme}
            />
        </View>
    );
};

const headerMessages = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_channel_header_message_and_forget.updated_from',
        defaultMessage: '{username} updated the channel header from: {oldHeader} to: {newHeader}',
    },
    updatedTo: {
        id: 'mobile.system_message.update_channel_header_message_and_forget.updated_to',
        defaultMessage: '{username} updated the channel header to: {newHeader}',
    },
    removed: {
        id: 'mobile.system_message.update_channel_header_message_and_forget.removed',
        defaultMessage: '{username} removed the channel header (was: {oldHeader})',
    },
});

const headerMessagesDiscussion = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_channel_header_message_and_forget.updated_from.discussion',
        defaultMessage: '{username} updated the discussion group header from: {oldHeader} to: {newHeader}',
    },
    updatedTo: {
        id: 'mobile.system_message.update_channel_header_message_and_forget.updated_to.discussion',
        defaultMessage: '{username} updated the discussion group header to: {newHeader}',
    },
    removed: {
        id: 'mobile.system_message.update_channel_header_message_and_forget.removed.discussion',
        defaultMessage: '{username} removed the discussion group header (was: {oldHeader})',
    },
});

const headerMessagesAnnouncement = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_channel_announcement.updated_from',
        defaultMessage: '{username} updated the announcement from: {oldHeader} to: {newHeader}',
    },
    updatedTo: {
        id: 'mobile.system_message.update_channel_announcement.updated_to',
        defaultMessage: '{username} updated the announcement to: {newHeader}',
    },
    removed: {
        id: 'mobile.system_message.update_channel_announcement.removed',
        defaultMessage: '{username} removed the announcement (was: {oldHeader})',
    },
});

const headerMessagesDmNote = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_dm_conversation_note.updated_from',
        defaultMessage: '{username} updated the conversation note from: {oldHeader} to: {newHeader}',
    },
    updatedTo: {
        id: 'mobile.system_message.update_dm_conversation_note.updated_to',
        defaultMessage: '{username} updated the conversation note to: {newHeader}',
    },
    removed: {
        id: 'mobile.system_message.update_dm_conversation_note.removed',
        defaultMessage: '{username} removed the conversation note (was: {oldHeader})',
    },
});

function readChannelHeaderChangeProps(post: PostModel) {
    const rawNew = post.props?.new_header ?? post.props?.newHeader;
    const rawOld = post.props?.old_header ?? post.props?.oldHeader;
    const newHeader = ensureString(rawNew);
    const oldHeader = ensureString(rawOld);
    const hasNew =
        rawNew !== undefined &&
        rawNew !== null &&
        String(rawNew).trim().length > 0;
    const hasOld =
        rawOld !== undefined &&
        rawOld !== null &&
        String(rawOld).trim().length > 0;
    return {newHeader, oldHeader, hasNew, hasOld};
}

function pickHeaderCopy(channelType: ChannelType | undefined) {
    if (channelType === General.DM_CHANNEL) {
        return headerMessagesDmNote;
    }
    if (channelSupportsAnnouncementUx(channelType)) {
        return headerMessagesAnnouncement;
    }
    return headerMessages;
}

const renderHeaderChangeMessage = ({post, author, channelType, compact, location, styles, intl, theme}: RenderersProps) => {
    if (!author?.username) {
        return null;
    }

    const username = renderUsername(author);
    const {newHeader, oldHeader, hasNew, hasOld} = readChannelHeaderChangeProps(post);
    const headerCopy = pickHeaderCopy(channelType);

    let localeHolder;
    let values: Record<string, PrimitiveType>;

    if (hasNew) {
        if (hasOld) {
            localeHolder = headerCopy.updatedFrom;
            values = {username, oldHeader, newHeader};
        } else {
            localeHolder = headerCopy.updatedTo;
            values = {username, oldHeader, newHeader};
        }
    } else if (hasOld) {
        localeHolder = headerCopy.removed;
        values = {username, oldHeader, newHeader};
    } else {
        return null;
    }

    const inner = renderMessage({
        post,
        styles,
        intl,
        location,
        localeHolder,
        values,
        theme,
        skipMarkdown: true,
    });

    const sheet = getStyleSheet(theme);
    if (channelSupportsAnnouncementUx(channelType) && !compact) {
        return (
            <View style={sheet.announcementCard}>
                <CompassIcon
                    color={changeOpacity(theme.centerChannelColor, 0.56)}
                    name='bullhorn-outline'
                    size={18}
                />
                <View style={sheet.announcementCardTextWrap}>
                    {inner}
                </View>
            </View>
        );
    }

    return inner;
};

const purposeMessages = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_channel_purpose_message.updated_from',
        defaultMessage: '{username} updated the channel purpose from: {oldPurpose} to: {newPurpose}',
    },
    updatedTo: {
        id: 'mobile.system_message.update_channel_purpose_message.updated_to',
        defaultMessage: '{username} updated the channel purpose to: {newPurpose}',
    },
    removed: {
        id: 'mobile.system_message.update_channel_purpose_message.removed',
        defaultMessage: '{username} removed the channel purpose (was: {oldPurpose})',
    },
});

const purposeMessagesDiscussion = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_channel_purpose_message.updated_from.discussion',
        defaultMessage: '{username} updated the discussion group purpose from: {oldPurpose} to: {newPurpose}',
    },
    updatedTo: {
        id: 'mobile.system_message.update_channel_purpose_message.updated_to.discussion',
        defaultMessage: '{username} updated the discussion group purpose to: {newPurpose}',
    },
    removed: {
        id: 'mobile.system_message.update_channel_purpose_message.removed.discussion',
        defaultMessage: '{username} removed the discussion group purpose (was: {oldPurpose})',
    },
});

const purposeMessagesDm = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_channel_purpose_message.updated_from.dm',
        defaultMessage: '{username} updated the private chat purpose from: {oldPurpose} to: {newPurpose}',
    },
    updatedTo: {
        id: 'mobile.system_message.update_channel_purpose_message.updated_to.dm',
        defaultMessage: '{username} updated the private chat purpose to: {newPurpose}',
    },
    removed: {
        id: 'mobile.system_message.update_channel_purpose_message.removed.dm',
        defaultMessage: '{username} removed the private chat purpose (was: {oldPurpose})',
    },
});

function pickPurposeCopy(channelType: ChannelType | undefined) {
    if (channelType === General.DM_CHANNEL) {
        return purposeMessagesDm;
    }
    if (usesDiscussionGroupChannelCopy(channelType)) {
        return purposeMessagesDiscussion;
    }
    return purposeMessages;
}

const renderPurposeChangeMessage = ({post, author, channelType, location, styles, intl, theme}: RenderersProps) => {
    let values;

    if (!author?.username) {
        return null;
    }

    const username = renderUsername(author);
    const oldPurpose = ensureString(post.props?.old_purpose);
    const newPurpose = ensureString(post.props?.new_purpose);
    let localeHolder;
    const purposeCopy = pickPurposeCopy(channelType);

    if (newPurpose) {
        if (oldPurpose) {
            localeHolder = purposeCopy.updatedFrom;

            values = {username, oldPurpose, newPurpose};
            return renderMessage({post, styles, intl, location, localeHolder, values, skipMarkdown: true, theme});
        }

        localeHolder = purposeCopy.updatedTo;

        values = {username, oldPurpose, newPurpose};
        return renderMessage({post, styles, intl, location, localeHolder, values, skipMarkdown: true, theme});
    } else if (oldPurpose) {
        localeHolder = purposeCopy.removed;

        values = {username, oldPurpose, newPurpose};
        return renderMessage({post, styles, intl, location, localeHolder, values, skipMarkdown: true, theme});
    }

    return null;
};

const displaynameMessages = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_channel_displayname_message_and_forget.updated_from',
        defaultMessage: '{username} updated the channel display name from: {oldDisplayName} to: {newDisplayName}',
    },
});

const displaynameMessagesDiscussion = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_channel_displayname_message_and_forget.updated_from.discussion',
        defaultMessage: '{username} updated the discussion group display name from: {oldDisplayName} to: {newDisplayName}',
    },
});

const displaynameMessagesDm = defineMessages({
    updatedFrom: {
        id: 'mobile.system_message.update_channel_displayname_message_and_forget.updated_from.dm',
        defaultMessage: '{username} updated the private chat display name from: {oldDisplayName} to: {newDisplayName}',
    },
});

function pickDisplayNameCopy(channelType: ChannelType | undefined) {
    if (channelType === General.DM_CHANNEL) {
        return displaynameMessagesDm.updatedFrom;
    }
    if (usesDiscussionGroupChannelCopy(channelType)) {
        return displaynameMessagesDiscussion.updatedFrom;
    }
    return displaynameMessages.updatedFrom;
}

const renderDisplayNameChangeMessage = ({post, author, channelType, location, styles, intl, theme}: RenderersProps) => {
    const oldDisplayName = ensureString(post.props?.old_displayname);
    const newDisplayName = ensureString(post.props?.new_displayname);

    if (!(author?.username)) {
        return null;
    }

    const username = renderUsername(author);
    const localeHolder = pickDisplayNameCopy(channelType);

    const values = {username, oldDisplayName, newDisplayName};
    return renderMessage({post, styles, intl, location, localeHolder, values, theme});
};

const archivedMessages = defineMessages({
    archived: {
        id: 'mobile.system_message.channel_archived_message',
        defaultMessage: '{username} archived the channel',
    },
});

const archivedMessagesDiscussion = defineMessages({
    archived: {
        id: 'mobile.system_message.channel_archived_message.discussion',
        defaultMessage: '{username} archived the discussion group',
    },
});

const archivedMessagesDm = defineMessages({
    archived: {
        id: 'mobile.system_message.channel_archived_message.dm',
        defaultMessage: '{username} archived the private chat',
    },
});

function pickArchivedCopy(channelType: ChannelType | undefined) {
    if (channelType === General.DM_CHANNEL) {
        return archivedMessagesDm.archived;
    }
    if (usesDiscussionGroupChannelCopy(channelType)) {
        return archivedMessagesDiscussion.archived;
    }
    return archivedMessages.archived;
}

const renderArchivedMessage = ({post, author, channelType, location, styles, intl, theme}: RenderersProps) => {
    const username = renderUsername(author);
    const localeHolder = pickArchivedCopy(channelType);

    const values = {username};
    return renderMessage({post, styles, intl, location, localeHolder, values, theme});
};

const unarchivedMessages = defineMessages({
    unarchived: {
        id: 'mobile.system_message.channel_unarchived_message',
        defaultMessage: '{username} unarchived the channel',
    },
});

const unarchivedMessagesDiscussion = defineMessages({
    unarchived: {
        id: 'mobile.system_message.channel_unarchived_message.discussion',
        defaultMessage: '{username} unarchived the discussion group',
    },
});

const unarchivedMessagesDm = defineMessages({
    unarchived: {
        id: 'mobile.system_message.channel_unarchived_message.dm',
        defaultMessage: '{username} unarchived the private chat',
    },
});

function pickUnarchivedCopy(channelType: ChannelType | undefined) {
    if (channelType === General.DM_CHANNEL) {
        return unarchivedMessagesDm.unarchived;
    }
    if (usesDiscussionGroupChannelCopy(channelType)) {
        return unarchivedMessagesDiscussion.unarchived;
    }
    return unarchivedMessages.unarchived;
}

const renderUnarchivedMessage = ({post, author, channelType, location, styles, intl, theme}: RenderersProps) => {
    if (!author?.username) {
        return null;
    }

    const username = renderUsername(author);
    const localeHolder = pickUnarchivedCopy(channelType);

    const values = {username};
    return renderMessage({post, styles, intl, location, localeHolder, values, theme});
};

const changeChannelPrivacyMessages = defineMessages({
    toPrivate: {
        id: 'mobile.system_message.change_channel_privacy.to_private',
        defaultMessage: 'This group chat is now invite-only. Only invited members can view it.',
    },
    toPublic: {
        id: 'mobile.system_message.change_channel_privacy.to_public',
        defaultMessage: 'This group chat is now public. Team members can join.',
    },
});

const renderChangeChannelPrivacyMessage = (props: RenderersProps) => {
    const {channelType} = props;
    const isNowPrivate = channelType === General.PRIVATE_CHANNEL;
    const localeHolder = isNowPrivate ? changeChannelPrivacyMessages.toPrivate : changeChannelPrivacyMessages.toPublic;
    return renderMessage({...props, localeHolder, values: {}, skipMarkdown: true});
};

const addGuestToChannelMessages = defineMessages({
    added: {
        id: 'api.channel.add_guest.added',
        defaultMessage: '{addedUsername} added to the channel as a guest by {username}.',
    },
});

const addGuestToChannelMessagesDiscussion = defineMessages({
    added: {
        id: 'api.channel.add_guest.added.discussion',
        defaultMessage: '{addedUsername} added to the discussion group as a guest by {username}.',
    },
});

const addGuestToChannelMessagesDm = defineMessages({
    added: {
        id: 'api.channel.add_guest.added.dm',
        defaultMessage: '{addedUsername} added to the private chat as a guest by {username}.',
    },
});

const renderAddGuestToChannelMessage = ({post, channelType, location, styles, intl, theme}: RenderersProps, hideGuestTags: boolean) => {
    const username = renderUsername(ensureString(post.props?.username));
    const addedUsername = renderUsername(ensureString(post.props?.addedUsername));

    if (!username || !addedUsername) {
        return null;
    }

    const useDiscussionCopy = usesDiscussionGroupChannelCopy(channelType);
    const isDm = channelType === General.DM_CHANNEL;
    const channelActivityMessages = getPostTypeMessagesForSystemActivity(channelType);
    const localeHolder = hideGuestTags ?
        channelActivityMessages[Post.POST_TYPES.ADD_TO_CHANNEL].one :
        (isDm ? addGuestToChannelMessagesDm.added : (useDiscussionCopy ? addGuestToChannelMessagesDiscussion.added : addGuestToChannelMessages.added));

    const values = hideGuestTags ? {firstUser: addedUsername, actor: username} : {username, addedUsername};
    return renderMessage({post, styles, intl, location, localeHolder, values, theme});
};

const guestJoinChannelMessages = defineMessages({
    joined: {
        id: 'api.channel.guest_join_channel.post_and_forget',
        defaultMessage: '{username} joined the channel as a guest.',
    },
});

const guestJoinChannelMessagesDiscussion = defineMessages({
    joined: {
        id: 'api.channel.guest_join_channel.post_and_forget.discussion',
        defaultMessage: '{username} joined the discussion group as a guest.',
    },
});

const guestJoinChannelMessagesDm = defineMessages({
    joined: {
        id: 'api.channel.guest_join_channel.post_and_forget.dm',
        defaultMessage: '{username} joined the private chat as a guest.',
    },
});

const renderGuestJoinChannelMessage = ({post, channelType, styles, location, intl, theme}: RenderersProps, hideGuestTags: boolean) => {
    const username = renderUsername(ensureString(post.props?.username));
    if (!username) {
        return null;
    }

    const useDiscussionCopy = usesDiscussionGroupChannelCopy(channelType);
    const isDm = channelType === General.DM_CHANNEL;
    const channelActivityMessages = getPostTypeMessagesForSystemActivity(channelType);
    const localeHolder = hideGuestTags ?
        channelActivityMessages[Post.POST_TYPES.JOIN_CHANNEL].one :
        (isDm ? guestJoinChannelMessagesDm.joined : (useDiscussionCopy ? guestJoinChannelMessagesDiscussion.joined : guestJoinChannelMessages.joined));

    const values = hideGuestTags ? {firstUser: username} : {username};
    return renderMessage({post, styles, intl, location, localeHolder, values, theme});
};

const systemMessageRenderers = {
    [Post.POST_TYPES.HEADER_CHANGE]: renderHeaderChangeMessage,
    [Post.POST_TYPES.DISPLAYNAME_CHANGE]: renderDisplayNameChangeMessage,
    [Post.POST_TYPES.PURPOSE_CHANGE]: renderPurposeChangeMessage,
    [Post.POST_TYPES.CHANGE_CHANNEL_PRIVACY]: renderChangeChannelPrivacyMessage,
    [Post.POST_TYPES.CHANNEL_DELETED]: renderArchivedMessage,
    [Post.POST_TYPES.CHANNEL_UNARCHIVED]: renderUnarchivedMessage,
};

export const SystemMessage = ({post, location, author, channelType, compact, hideGuestTags}: SystemMessageProps & {hideGuestTags: boolean}) => {
    const intl = useIntl();
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const styles = {
        messageStyle: compact ? style.systemMessageCompact : style.systemMessage,
        containerStyle: compact ? style.containerCompact : style.container,
    };

    const rendererProps: RenderersProps = {post, author, channelType, compact, location, styles, intl, theme};

    if (post.type === Post.POST_TYPES.GUEST_JOIN_CHANNEL) {
        return renderGuestJoinChannelMessage(rendererProps, hideGuestTags);
    }
    if (post.type === Post.POST_TYPES.ADD_GUEST_TO_CHANNEL) {
        return renderAddGuestToChannelMessage(rendererProps, hideGuestTags);
    }

    const renderer = secureGetFromRecord(systemMessageRenderers, post.type);
    if (!renderer) {
        const fallback = (
            <Markdown
                baseTextStyle={styles.messageStyle}
                channelId={post.channelId}
                location={location}
                disableGallery={true}
                value={post.message}
                theme={theme}
            />
        );
        if (compact) {
            return (
                <View style={styles.containerStyle}>
                    {fallback}
                </View>
            );
        }
        return fallback;
    }

    return renderer(rendererProps);
};

export default SystemMessage;
