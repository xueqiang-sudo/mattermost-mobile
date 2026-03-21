// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {
    InteractionManager,
    Platform,
    View,
} from 'react-native';

import {storeProfileLongPressTutorial} from '@actions/app/global';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import TutorialHighlight from '@components/tutorial_highlight';
import TutorialLongPress from '@components/tutorial_highlight/long_press';
import UserItem from '@components/user_item';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {Preferences} from '@constants';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';

const AVATAR_ROUNDED_SQUARE_RATIO = 0.2;

type Props = {
    contactSelectLayout?: boolean;
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
                    size={28}
                    color={color}
                />
            </View>
        );
    }, [selectable, selected, theme.buttonBg, theme.centerChannelColor, style.selector, style.selectorLeft, contactSelectLayout]);

    const userItemTestID = `${testID}.${id}`;
    const avatarBorderRadius = contactSelectLayout ? Math.round(24 * AVATAR_ROUNDED_SQUARE_RATIO) : undefined;
    const decorator = manageMode ? manageModeIcon : icon;

    return (
        <>
            <View style={contactSelectLayout ? style.rowDivider : undefined}>
            <UserItem
                user={user}
                teammateNameDisplayOverride={contactSelectLayout ? Preferences.DISPLAY_PREFER_NICKNAME : undefined}
                onUserLongPress={onLongPress}
                onUserPress={handlePress}
                showBadges={true}
                testID={userItemTestID}
                leftDecorator={contactSelectLayout ? decorator : undefined}
                rightDecorator={!contactSelectLayout ? decorator : undefined}
                avatarBorderRadius={avatarBorderRadius}
                disabled={!(selectable || selected || !disabled)}
                viewRef={viewRef}
                padding={20}
                includeMargin={includeMargin}
                onLayout={onLayout}
            />
            </View>
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
