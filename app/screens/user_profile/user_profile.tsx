// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import moment from 'moment';
import mtz from 'moment-timezone';
import React, {useEffect, useMemo} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {fetchTeamAndChannelMembership} from '@actions/remote/user';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {getLocaleFromLanguage} from '@i18n';
import BottomSheet from '@screens/bottom_sheet';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {getUserCustomStatus, getUserTimezone, isCustomStatusExpired} from '@utils/user';

import ManageUserOptions, {DIVIDER_MARGIN} from './manage_user_options';
import UserProfileOptions, {type OptionsType} from './options';
import PickerProfileDetails, {getPickerProfileDetailsHeight} from './picker_profile_details';
import UserProfileTitle, {HEADER_TEXT_HEIGHT} from './title';
import UserInfo from './user_info';

import type {CustomAttributeSet} from '@typings/api/custom_profile_attributes';
import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    canChangeMemberRoles: boolean;
    channelId?: string;
    closeButtonId: string;
    currentUserId: string;
    enablePostIconOverride: boolean;
    enablePostUsernameOverride: boolean;
    isChannelAdmin: boolean;
    canManageAndRemoveMembers?: boolean;
    isCustomStatusEnabled: boolean;
    isDirectMessage: boolean;
    isDefaultChannel: boolean;
    isMilitaryTime: boolean;
    isSystemAdmin: boolean;
    isTeamAdmin: boolean;
    manageMode?: boolean;
    location?: AvailableScreens;
    teamId: string;
    teammateDisplayName: string;
    user: UserModel;
    userIconOverride?: string;
    usernameOverride?: string;
    hideGuestTags: boolean;
    enableCustomAttributes: boolean;
    customAttributesSet?: CustomAttributeSet;
}

const TITLE_HEIGHT = 118;
const OPTIONS_HEIGHT = 82;
const SINGLE_OPTION_HEIGHT = 68;
const LABEL_HEIGHT = 58;
const EXTRA_HEIGHT = 60;
const MANAGE_ICON_HEIGHT = 72;

const messages = defineMessages({
    manageMember: {
        id: 'mobile.manage_members.manage_member',
        defaultMessage: 'Manage member',
    },
});
const channelContextScreens: AvailableScreens[] = [Screens.CHANNEL];

const PICKER_PREVIEW_TITLE_BLOCK = 96;
/** PickerProfileDetails 卡片 marginTop + marginBottom，未计入 getPickerProfileDetailsHeight */
const PICKER_PROFILE_CARD_VERTICAL_MARGIN = 12;

const UserProfile = ({
    canChangeMemberRoles,
    canManageAndRemoveMembers,
    channelId,
    closeButtonId,
    currentUserId,
    enablePostIconOverride,
    enablePostUsernameOverride,
    isChannelAdmin,
    isCustomStatusEnabled,
    isDefaultChannel,
    isDirectMessage,
    isMilitaryTime,
    isSystemAdmin,
    isTeamAdmin,
    location,
    manageMode = false,
    teamId,
    teammateDisplayName,
    user,
    userIconOverride,
    usernameOverride,
    hideGuestTags,
    enableCustomAttributes,
    customAttributesSet,
}: Props) => {
    const {formatMessage, locale} = useIntl();
    const serverUrl = useServerUrl();
    const channelContext = location ? channelContextScreens.includes(location) : false;
    const isPickerPreview = Boolean(location === Screens.CREATE_DIRECT_MESSAGE && !manageMode);
    const showOptions: OptionsType = channelContext && !user.isBot ? 'all' : 'message';
    const override = Boolean(userIconOverride || usernameOverride);
    const {bottom} = useSafeAreaInsets();
    const timezone = getUserTimezone(user);
    const customStatus = getUserCustomStatus(user);
    let localTime: string|undefined;

    if (timezone) {
        moment.locale(getLocaleFromLanguage(locale).toLowerCase());
        let format = 'H:mm';
        if (!isMilitaryTime) {
            const localeFormat = moment.localeData().longDateFormat('LT');
            format = localeFormat?.includes('A') ? localeFormat : 'h:mm A';
        }
        localTime = mtz.tz(Date.now(), timezone).format(format);
    }

    const showCustomStatus = isCustomStatusEnabled && Boolean(customStatus) && !user.isBot && !isCustomStatusExpired(user);
    const isSelf = user.id === currentUserId;
    const showUserProfileOptions = !isSelf && (!isDirectMessage || !channelContext) && !override && !manageMode;
    const showNickname = Boolean(user.nickname) && !override && !user.isBot && !manageMode;
    const showPosition = Boolean(user.position) && !override && !user.isBot && !manageMode;
    const showLocalTime = Boolean(localTime) && !override && !user.isBot && !manageMode;

    /** 选人预览：灰色卡片已含职位；标题已有昵称；不展示两地时间与下方重复项 */
    const userInfoShowNickname = isPickerPreview ? false : showNickname;
    const userInfoShowPosition = isPickerPreview ? false : showPosition;
    const userInfoShowLocalTime = isPickerPreview ? false : showLocalTime;

    const headerText = manageMode ? formatMessage(messages.manageMember) : undefined;

    const pickerDetailsHeight = isPickerPreview ? getPickerProfileDetailsHeight(user) : 0;

    const snapPoints = useMemo(() => {
        if (isPickerPreview) {
            let title = PICKER_PREVIEW_TITLE_BLOCK;

            if (headerText) {
                title += HEADER_TEXT_HEIGHT;
            }

            if (showUserProfileOptions) {
                title += showOptions === 'all' ? OPTIONS_HEIGHT : SINGLE_OPTION_HEIGHT;
            }

            const optionsCount = [
                showCustomStatus,
                userInfoShowNickname,
                userInfoShowPosition,
                userInfoShowLocalTime,
            ].reduce((acc, v) => {
                return v ? acc + 1 : acc;
            }, 0);

            const userInfoSnapHeight = optionsCount > 0 ? bottomSheetSnapPoint(optionsCount, LABEL_HEIGHT) : 0;
            const bottomComfort = Math.min(bottom, 16);

            return [
                1,
                title +
                    userInfoSnapHeight +
                    bottomComfort +
                    pickerDetailsHeight +
                    PICKER_PROFILE_CARD_VERTICAL_MARGIN,
                '88%',
            ];
        }

        let title = TITLE_HEIGHT;

        if (headerText) {
            title += HEADER_TEXT_HEIGHT;
        }

        if (showUserProfileOptions) {
            title += showOptions === 'all' ? OPTIONS_HEIGHT : SINGLE_OPTION_HEIGHT;
        }

        const optionsCount = [
            showCustomStatus,
            showNickname,
            showPosition,
            showLocalTime,
        ].reduce((acc, v) => {
            return v ? acc + 1 : acc;
        }, 0);

        if (manageMode) {
            title += DIVIDER_MARGIN * 2;
            if (canChangeMemberRoles) {
                title += SINGLE_OPTION_HEIGHT; // roles button
            }
            if (canManageAndRemoveMembers) {
                title += SINGLE_OPTION_HEIGHT; // roles button
            }
        }

        const extraHeight = manageMode ? 0 : (EXTRA_HEIGHT - bottom);

        return [
            1,
            bottomSheetSnapPoint(optionsCount, LABEL_HEIGHT) + title + extraHeight,
            '90%',
        ];
    }, [
        isPickerPreview,
        headerText,
        showUserProfileOptions,
        showCustomStatus,
        showNickname,
        showPosition,
        showLocalTime,
        userInfoShowNickname,
        userInfoShowPosition,
        userInfoShowLocalTime,
        manageMode,
        bottom,
        showOptions,
        canChangeMemberRoles,
        canManageAndRemoveMembers,
        pickerDetailsHeight,
    ]);

    useEffect(() => {
        if (currentUserId !== user.id) {
            fetchTeamAndChannelMembership(serverUrl, user.id, teamId, channelId);
        }
    }, []);

    const renderContent = () => {
        return (
            <>
                <UserProfileTitle
                    enablePostIconOverride={enablePostIconOverride}
                    enablePostUsernameOverride={enablePostUsernameOverride}
                    headerText={headerText}
                    imageSize={manageMode ? MANAGE_ICON_HEIGHT : (isPickerPreview ? 72 : undefined)}
                    isChannelAdmin={isChannelAdmin}
                    isSystemAdmin={isSystemAdmin}
                    isTeamAdmin={isTeamAdmin}
                    teammateDisplayName={teammateDisplayName}
                    user={user}
                    userIconOverride={userIconOverride}
                    usernameOverride={usernameOverride}
                    hideGuestTags={hideGuestTags}
                    pickerPreview={isPickerPreview}
                />
                {showUserProfileOptions &&
                    <UserProfileOptions
                        location={location}
                        type={showOptions}
                        username={user.username}
                        userId={user.id}
                    />
                }
                {isPickerPreview && !manageMode &&
                    <PickerProfileDetails user={user}/>
                }
                {!manageMode && (
                    <View style={isPickerPreview ? {marginTop: 8} : undefined}>
                        <UserInfo
                            localTime={localTime}
                            showCustomStatus={showCustomStatus}
                            showNickname={userInfoShowNickname}
                            showPosition={userInfoShowPosition}
                            showLocalTime={userInfoShowLocalTime}
                            user={user}
                            enableCustomAttributes={enableCustomAttributes}
                            customAttributesSet={customAttributesSet}
                        />
                    </View>
                )}
                {manageMode && channelId && (canManageAndRemoveMembers || canChangeMemberRoles) &&
                    <ManageUserOptions
                        canChangeMemberRoles={canChangeMemberRoles}
                        channelId={channelId}
                        isDefaultChannel={isDefaultChannel}
                        isChannelAdmin={isChannelAdmin}
                        userId={user.id}
                    />
                }
            </>
        );
    };

    return (
        <BottomSheet
            renderContent={renderContent}
            closeButtonId={closeButtonId}
            componentId={Screens.USER_PROFILE}
            initialSnapIndex={1}
            snapPoints={isPickerPreview ? [1, '88%'] : [1, '90%']}
            enableDynamicSizing={true}
            testID='user_profile'
            contentStyle={{flex: 0}}
            scrollable={true}
        />
    );
};

export default UserProfile;
