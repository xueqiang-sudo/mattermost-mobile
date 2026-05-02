// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {
    InteractionManager,
    Platform,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {storeProfileLongPressTutorial} from '@actions/app/global';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import TutorialHighlight from '@components/tutorial_highlight';
import TutorialLongPress from '@components/tutorial_highlight/long_press';
import UserItem from '@components/user_item';
import {Preferences} from '@constants';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {getContactPickerGroupedRowStyle} from '@utils/channel_list_modal_row';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';

const AVATAR_ROUNDED_SQUARE_RATIO = 0.2;
const CONTACT_SELECT_AVATAR_SIZE = 40;

type Props = {
    contactSelectLayout?: boolean;

    /** 与 {@link contactSelectLayout} 联用：区内行下标，用于斑马纹卡片行背景 */
    listRowIndex?: number;
    highlight?: boolean;
    id: string;
    includeMargin?: boolean;
    isChannelAdmin: boolean;
    manageMode: boolean;
    onLongPress: (user: UserProfile | UserModel) => void;
    onPress?: (user: UserProfile | UserModel) => void;
    selectable: boolean;
    disabled?: boolean;
    selected: boolean;
    showManageMode: boolean;
    testID: string;
    tutorialWatched?: boolean;
    user: UserProfile;
}

type CandidateTag = 'exactMatch' | 'customer' | 'supplier' | 'enterprise' | 'self';
type CandidateUserProfile = UserProfile & {mmCandidateTags?: CandidateTag[]};

const getStyleFromTheme = makeStyleSheetFromTheme((theme) => {
    return {
        selector: {
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 12,
        },
        selectorLeft: {
            marginLeft: 0,
            marginRight: 12,
        },
        rowDivider: {
            borderBottomWidth: 1,
            borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        },
        userItemWithTags: {
            alignItems: 'flex-start',
            paddingTop: 6,
        },
        tagRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginTop: 2,
            gap: 6,
        },
        tagItem: {
            borderRadius: 5,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: changeOpacity(theme.centerChannelColor, 0.12),
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        },
        tagText: {
            color: changeOpacity(theme.centerChannelColor, 0.72),
            fontSize: 11,
            lineHeight: 12,
            fontWeight: '500',
        },
        selectorManage: {
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            marginLeft: 12,
        },
        manageText: {
            color: changeOpacity(theme.centerChannelColor, 0.64),
            ...typography('Body', 100, 'Regular'),
        },
        tutorial: {
            top: Platform.select({ios: -74, default: -94}),
        },
        tutorialTablet: {
            top: -84,
        },
    };
});

const DEFAULT_ICON_OPACITY = 0.32;

const messages = defineMessages({
    admin: {
        id: 'mobile.manage_members.admin',
        defaultMessage: 'Admin',
    },
    member: {
        id: 'mobile.manage_members.member',
        defaultMessage: 'Member',
    },
});

function UserListRow({
    contactSelectLayout = false,
    listRowIndex,
    id,
    includeMargin,
    highlight,
    isChannelAdmin,
    onPress,
    onLongPress,
    manageMode = false,
    selectable,
    disabled,
    selected,
    showManageMode = false,
    testID,
    tutorialWatched = false,
    user,
}: Props) {
    const theme = useTheme();
    const isTablet = useIsTablet();
    const [showTutorial, setShowTutorial] = useState(false);
    const [itemBounds, setItemBounds] = useState<TutorialItemBounds>({startX: 0, startY: 0, endX: 0, endY: 0});
    const viewRef = useRef<View>(null);
    const style = getStyleFromTheme(theme);
    const {formatMessage} = useIntl();
    const tutorialShown = useRef(false);
    const candidateTags = (user as CandidateUserProfile).mmCandidateTags ?? [];

    const startTutorial = () => {
        viewRef.current?.measureInWindow((x, y, w, h) => {
            const bounds: TutorialItemBounds = {
                startX: x,
                startY: y,
                endX: x + w,
                endY: y + h,
            };
            if (viewRef.current) {
                setItemBounds(bounds);
            }
        });
    };

    const handleDismissTutorial = useCallback(() => {
        setShowTutorial(false);
        storeProfileLongPressTutorial();
    }, []);

    const handlePress = useCallback((u: UserModel | UserProfile) => {
        onPress?.(u);
    }, [onPress]);

    const manageModeIcon = useMemo(() => {
        if (!showManageMode) {
            return null;
        }

        const color = changeOpacity(theme.centerChannelColor, 0.64);
        const message = isChannelAdmin ? messages.admin : messages.member;

        return (
            <View style={style.selectorManage}>
                <FormattedText
                    {...message}
                    style={style.manageText}
                />
                <CompassIcon
                    name={'chevron-down'}
                    size={18}
                    color={color}
                />
            </View>
        );
    }, [isChannelAdmin, showManageMode, style.manageText, style.selectorManage, theme.centerChannelColor]);

    const onLayout = useCallback(() => {
        if (highlight && !tutorialWatched) {
            if (isTablet) {
                setShowTutorial(true);
                return;
            }
            InteractionManager.runAfterInteractions(() => {
                setShowTutorial(true);
            });
        }
    }, [highlight, isTablet, tutorialWatched]);

    useLayoutEffect(() => {
        if (showTutorial && !tutorialShown.current) {
            tutorialShown.current = true;
            startTutorial();
        }
    });

    const icon = useMemo(() => {
        if (!selectable && !selected) {
            return null;
        }

        const color = selected ? theme.buttonBg : changeOpacity(theme.centerChannelColor, DEFAULT_ICON_OPACITY);
        return (
            <View style={[style.selector, contactSelectLayout && style.selectorLeft]}>
                <CompassIcon
                    name={selected ? 'check-circle' : 'circle-outline'}
                    size={contactSelectLayout ? 30 : 28}
                    color={color}
                />
            </View>
        );
    }, [selectable, selected, theme.buttonBg, theme.centerChannelColor, style.selector, style.selectorLeft, contactSelectLayout]);

    const getCandidateTagText = useCallback((tag: CandidateTag) => {
        switch (tag) {
            case 'self':
                return formatMessage({id: 'invite.tag.self', defaultMessage: 'Me'});
            case 'exactMatch':
                return formatMessage({id: 'invite.tag.exact_match', defaultMessage: 'Exact match'});
            case 'customer':
                return formatMessage({id: 'invite.tag.customer', defaultMessage: 'My customer'});
            case 'supplier':
                return formatMessage({id: 'invite.tag.supplier', defaultMessage: 'My supplier'});
            case 'enterprise':
                return formatMessage({id: 'invite.tag.enterprise', defaultMessage: 'Enterprise'});
            default:
                return '';
        }
    }, [formatMessage]);

    const userItemTestID = `${testID}.${id}`;
    const avatarBorderRadius = contactSelectLayout ? Math.round(CONTACT_SELECT_AVATAR_SIZE * AVATAR_ROUNDED_SQUARE_RATIO) : undefined;
    const decorator = manageMode ? manageModeIcon : icon;

    const useGroupedPickerRow = Boolean(contactSelectLayout && listRowIndex !== undefined);
    const groupedPickerRowStyle = useMemo(() => {
        if (!useGroupedPickerRow || listRowIndex === undefined) {
            return undefined;
        }
        return getContactPickerGroupedRowStyle(theme, listRowIndex, selected);
    }, [useGroupedPickerRow, listRowIndex, selected, theme]);

    const rowBody = (
        <View style={contactSelectLayout && !useGroupedPickerRow ? style.rowDivider : undefined}>
            <UserItem
                user={user}
                teammateNameDisplayOverride={contactSelectLayout ? Preferences.DISPLAY_PREFER_NICKNAME : undefined}
                onUserLongPress={onLongPress}
                onUserPress={handlePress}
                showBadges={true}
                testID={userItemTestID}
                containerStyle={contactSelectLayout && candidateTags.length > 0 ? style.userItemWithTags : undefined}
                FooterComponent={contactSelectLayout && candidateTags.length > 0 ? (
                    <View style={style.tagRow}>
                        {candidateTags.map((tag) => (
                            <View
                                key={`${id}.${tag}`}
                                style={style.tagItem}
                            >
                                <Text style={style.tagText}>
                                    {getCandidateTagText(tag)}
                                </Text>
                            </View>
                        ))}
                    </View>
                ) : undefined}
                leftDecorator={contactSelectLayout ? decorator : undefined}
                rightDecorator={contactSelectLayout ? undefined : decorator}
                avatarBorderRadius={avatarBorderRadius}
                size={contactSelectLayout ? CONTACT_SELECT_AVATAR_SIZE : 24}
                contactSelectLayout={contactSelectLayout}
                showCurrentUserSuffix={!candidateTags.includes('self')}
                disabled={!(selectable || selected || !disabled)}
                viewRef={viewRef}
                padding={contactSelectLayout ? 16 : 20}
                includeMargin={includeMargin}
                onLayout={onLayout}
            />
        </View>
    );

    return (
        <>
            {useGroupedPickerRow ? <View style={groupedPickerRowStyle}>{rowBody}</View> : rowBody}
            {showTutorial &&
            <TutorialHighlight
                itemBounds={itemBounds}
                onDismiss={handleDismissTutorial}
            >
                {Boolean(itemBounds.endX) &&
                <TutorialLongPress
                    message={formatMessage({id: 'user.tutorial.long_press', defaultMessage: "Long-press on an item to view a user's profile"})}
                    style={isTablet ? style.tutorialTablet : style.tutorial}
                />
                }
            </TutorialHighlight>
            }
        </>
    );
}

export default React.memo(UserListRow);
