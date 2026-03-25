// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import {DeviceEventEmitter, Platform} from 'react-native';

import Autocomplete from '@components/autocomplete';
import {Events, Screens} from '@constants';
import {ExtraKeyboard} from '@context/extra_keyboard';
import {useServerUrl} from '@context/server';
import {useAutocompleteDefaultAnimatedValues} from '@hooks/autocomplete';
import {useKeyboardHeight} from '@hooks/device';
import {useDefaultHeaderHeight} from '@hooks/header';

import Archived from './archived';
import DraftHandler from './draft_handler';
import ReadOnly from './read_only';

import type {AvailableScreens} from '@typings/screens/navigation';

const AUTOCOMPLETE_ADJUST = -5;
type Props = {
    testID?: string;
    canPost: boolean;
    channelId: string;
    channelIsArchived?: boolean;
    channelIsReadOnly: boolean;
    deactivatedChannel: boolean;
    files?: FileInfo[];
    isSearch?: boolean;
    message?: string;
    rootId?: string;
    containerHeight: number;
    isChannelScreen: boolean;
    canShowPostPriority?: boolean;
    location: AvailableScreens;
}

function PostDraft({
    testID,
    canPost,
    channelId,
    channelIsArchived,
    channelIsReadOnly,
    deactivatedChannel,
    files,
    isSearch,
    message = '',
    rootId = '',
    containerHeight,
    isChannelScreen,
    canShowPostPriority,
    location,
}: Props) {
    const [value, setValue] = useState(message);
    const [cursorPosition, setCursorPosition] = useState(message.length);
    const [postInputTop, setPostInputTop] = useState(0);
    const [isFocused, setIsFocused] = useState(false);
    const [channelReplyRootId, setChannelReplyRootId] = useState('');
    const keyboardHeight = useKeyboardHeight();
    const kbHeight = Platform.OS === 'ios' ? keyboardHeight : 0; // useKeyboardHeight is already deducting the keyboard height on Android
    const headerHeight = useDefaultHeaderHeight();
    const serverUrl = useServerUrl();

    // Update draft in case we switch channels or threads
    useEffect(() => {
        setValue(message);
        setCursorPosition(message.length);
    }, [channelId, rootId]);

    useEffect(() => {
        setChannelReplyRootId('');
    }, [channelId]);

    useEffect(() => {
        const setSub = DeviceEventEmitter.addListener(
            Events.POST_DRAFT_SET_REPLY_ROOT,
            (payload: {channelId: string; rootId: string}) => {
                if (isChannelScreen && location === Screens.CHANNEL && payload.channelId === channelId) {
                    setChannelReplyRootId(payload.rootId);
                }
            },
        );
        const clearSub = DeviceEventEmitter.addListener(Events.POST_DRAFT_CLEAR_REPLY_ROOT, () => {
            setChannelReplyRootId('');
        });
        return () => {
            setSub.remove();
            clearSub.remove();
        };
    }, [channelId, isChannelScreen, location]);

    const effectiveRootId = isChannelScreen && location === Screens.CHANNEL ? (channelReplyRootId || rootId) : rootId;

    const autocompletePosition = AUTOCOMPLETE_ADJUST + kbHeight + postInputTop;
    const autocompleteAvailableSpace = containerHeight - autocompletePosition - (isChannelScreen ? headerHeight : 0);
    const [animatedAutocompletePosition, animatedAutocompleteAvailableSpace] = useAutocompleteDefaultAnimatedValues(autocompletePosition, autocompleteAvailableSpace);

    if (channelIsArchived || deactivatedChannel) {
        const archivedTestID = `${testID}.archived`;

        return (
            <Archived
                testID={archivedTestID}
                deactivated={deactivatedChannel}
                location={location}
            />
        );
    }

    if (channelIsReadOnly || !canPost) {
        const readOnlyTestID = `${testID}.read_only`;

        return (
            <ReadOnly
                testID={readOnlyTestID}
            />
        );
    }

    const draftHandler = (
        <DraftHandler
            testID={testID}
            channelId={channelId}
            cursorPosition={cursorPosition}
            files={files}
            rootId={effectiveRootId}
            canShowPostPriority={canShowPostPriority}
            updateCursorPosition={setCursorPosition}
            updatePostInputTop={setPostInputTop}
            updateValue={setValue}
            value={value}
            setIsFocused={setIsFocused}
            useChatInputStyle={location === Screens.CHANNEL}
        />
    );

    const autoComplete = isFocused ? (
        <Autocomplete
            position={animatedAutocompletePosition}
            updateValue={setValue}
            rootId={effectiveRootId}
            channelId={channelId}
            cursorPosition={cursorPosition}
            value={value}
            isSearch={isSearch}
            shouldDirectlyReact={!Boolean(files?.length)}
            availableSpace={animatedAutocompleteAvailableSpace}
            serverUrl={serverUrl}
            autocompleteProviders={{
                user: true,
                channel: true,
                emoji: true,
                slash: false,
            }}
        />
    ) : null;

    return (
        <>
            {draftHandler}
            {autoComplete}
            {Platform.OS !== 'android' && <ExtraKeyboard/>}
        </>
    );
}

export default PostDraft;
