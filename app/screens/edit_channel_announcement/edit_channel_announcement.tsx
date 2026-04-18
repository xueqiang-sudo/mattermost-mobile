// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Keyboard, Platform, StatusBar, View, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view';
import {SafeAreaView} from 'react-native-safe-area-context';

import {patchChannel as handlePatchChannel} from '@actions/remote/channel';
import Autocomplete from '@components/autocomplete';
import CompassIcon from '@components/compass_icon';
import ErrorText from '@components/error_text';
import FloatingTextInput from '@components/floating_input/floating_text_input_label';
import FormattedText from '@components/formatted_text';
import Loading from '@components/loading';
import Markdown from '@components/markdown';
import {General, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {useAutocompleteDefaultAnimatedValues} from '@hooks/autocomplete';
import {useKeyboardHeight, useKeyboardOverlap} from '@hooks/device';
import {useInputPropagation} from '@hooks/input';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import SecurityManager from '@managers/security_manager';
import {buildNavigationButton, dismissModal, popTopScreen, setButtons} from '@screens/navigation';
import {channelSupportsAnnouncementUx} from '@utils/channel';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type ChannelModel from '@typings/database/models/servers/channel';
import type ChannelInfoModel from '@typings/database/models/servers/channel_info';
import type {AvailableScreens} from '@typings/screens/navigation';
import type {ImageResource} from 'react-native-navigation';

const CLOSE_BUTTON_ID = 'close-edit-announcement';
const SAVE_BUTTON_ID = 'save-edit-announcement';
const SCREEN_PADDING_H = 16;
const SCROLL_PADDING_VERTICAL = 20;
const BOTTOM_AUTOCOMPLETE_SEPARATION = Platform.select({ios: 10, default: 10});
const AUTOCOMPLETE_ADJUST = 5;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scrollView: {
        paddingVertical: SCROLL_PADDING_VERTICAL,
        paddingHorizontal: SCREEN_PADDING_H,
    },
    readOnlyWrap: {
        paddingHorizontal: SCREEN_PADDING_H,
        paddingTop: SCROLL_PADDING_VERTICAL,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorContainer: {
        width: '100%',
        marginBottom: 16,
    },
    captionText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 8,
    },
}));

type Props = {
    canEdit: boolean;
    channel?: ChannelModel;
    channelInfo?: ChannelInfoModel;
    componentId: AvailableScreens;
    isModal: boolean;
}

enum RequestActions {
    START = 'Start',
    COMPLETE = 'Complete',
    FAILURE = 'Failure',
}

interface RequestState {
    error: string;
    saving: boolean;
}

interface RequestAction {
    type: RequestActions;
    error?: string;
}

const makeCloseButton = (icon: ImageResource) => {
    return buildNavigationButton(CLOSE_BUTTON_ID, 'close.edit_channel_announcement.button', icon);
};

const EditChannelAnnouncement = ({
    canEdit,
    channel,
    channelInfo,
    componentId,
    isModal,
}: Props) => {
    const intl = useIntl();
    const {formatMessage} = intl;
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();

    const isDM = channel?.type === General.DM_CHANNEL;

    const [text, setText] = useState(channelInfo?.header || '');
    const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
    const mainView = useRef<View>(null);
    const [wrapperHeight, setWrapperHeight] = useState(0);
    const keyboardOverlap = useKeyboardOverlap(mainView, wrapperHeight);
    const [propagateValue, shouldProcessEvent] = useInputPropagation();
    const keyboardHeight = useKeyboardHeight();
    const [keyboardVisible, setKeyBoardVisible] = useState(false);
    const [scrollPosition, setScrollPosition] = useState(0);
    const [errorHeight, setErrorHeight] = useState(0);
    const [fieldHeight, setFieldHeight] = useState(0);
    const [fieldY, setFieldY] = useState(0);
    const updateScrollTimeout = useRef<NodeJS.Timeout>();

    const [appState, dispatch] = useReducer((state: RequestState, action: RequestAction) => {
        switch (action.type) {
            case RequestActions.START:
                return {error: '', saving: true};
            case RequestActions.COMPLETE:
                return {error: '', saving: false};
            case RequestActions.FAILURE:
                return {error: action.error || '', saving: false};
            default:
                return state;
        }
    }, {error: '', saving: false});

    const canSave = canEdit && text.trim() !== (channelInfo?.header || '').trim();

    useEffect(() => {
        setText(channelInfo?.header || '');
    }, [channelInfo?.header]);

    useEffect(() => {
        if (channel && !channelSupportsAnnouncementUx(channel.type)) {
            if (isModal) {
                dismissModal({componentId});
            } else {
                popTopScreen(componentId);
            }
        }
    }, [channel, componentId, isModal]);

    const rightButton = useMemo(() => {
        const base = buildNavigationButton(
            SAVE_BUTTON_ID,
            'create_or_edit_channel.save.button',
            undefined,
            formatMessage({id: 'mobile.edit_channel', defaultMessage: 'Save'}),
        );
        base.enabled = canSave;
        base.showAsAction = 'always';
        base.color = canSave ? theme.sidebarHeaderTextColor : changeOpacity(theme.sidebarHeaderTextColor, 0.38);
        return base;
    }, [canSave, formatMessage, theme.sidebarHeaderTextColor]);

    useEffect(() => {
        if (!canEdit) {
            return;
        }
        setButtons(componentId, {
            rightButtons: [rightButton],
        });
    }, [rightButton, componentId, canEdit]);

    useEffect(() => {
        if (isModal) {
            const icon = CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor);
            setButtons(componentId, {
                leftButtons: [makeCloseButton(icon)],
            });
        }
    }, [theme, isModal, componentId]);

    const handleClose = useCallback(() => {
        Keyboard.dismiss();
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(CLOSE_BUTTON_ID, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    const onSave = useCallback(async () => {
        if (!channel || !canEdit) {
            return;
        }
        dispatch({type: RequestActions.START});
        Keyboard.dismiss();
        const result = await handlePatchChannel(serverUrl, channel.id, {header: text});
        if (result.error) {
            dispatch({type: RequestActions.FAILURE, error: result.error as string});
            return;
        }
        dispatch({type: RequestActions.COMPLETE});
        dismissModal({componentId});
    }, [channel, canEdit, componentId, serverUrl, text]);

    useNavButtonPressed(SAVE_BUTTON_ID, componentId, onSave, [onSave]);

    useEffect(() => {
        if (keyboardVisible && !keyboardHeight) {
            setKeyBoardVisible(false);
        }
        if (!keyboardVisible && keyboardHeight) {
            setKeyBoardVisible(true);
        }
    }, [keyboardHeight, keyboardVisible]);

    const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const pos = e.nativeEvent.contentOffset.y;
        if (updateScrollTimeout.current) {
            clearTimeout(updateScrollTimeout.current);
        }
        updateScrollTimeout.current = setTimeout(() => {
            setScrollPosition(pos);
            updateScrollTimeout.current = undefined;
        }, 200);
    }, []);

    const scrollFieldToTop = useCallback(() => {
        scrollViewRef.current?.scrollToPosition(0, fieldY, true);
    }, [fieldY]);

    const onAutocompleteChange = useCallback((value: string) => {
        setText(value);
        propagateValue(value);
    }, [propagateValue]);

    const onInputChange = useCallback((value: string) => {
        if (!shouldProcessEvent(value)) {
            return;
        }
        setText(value);
    }, [shouldProcessEvent]);

    const onLayoutError = useCallback((e: LayoutChangeEvent) => {
        setErrorHeight(e.nativeEvent.layout.height);
    }, []);

    const onLayoutField = useCallback((e: LayoutChangeEvent) => {
        setFieldHeight(e.nativeEvent.layout.height);
        setFieldY(e.nativeEvent.layout.y);
    }, []);

    const onLayoutWrapper = useCallback((e: LayoutChangeEvent) => {
        setWrapperHeight(e.nativeEvent.layout.height);
    }, []);

    const otherElementsSize = SCROLL_PADDING_VERTICAL + errorHeight + fieldHeight;
    const workingSpace = wrapperHeight - keyboardOverlap;
    const spaceOnTop = otherElementsSize - scrollPosition - AUTOCOMPLETE_ADJUST;
    const spaceOnBottom = (workingSpace + scrollPosition) - (otherElementsSize + BOTTOM_AUTOCOMPLETE_SEPARATION);
    const bottomPosition = otherElementsSize - scrollPosition;
    const topPosition = (workingSpace + scrollPosition + AUTOCOMPLETE_ADJUST + keyboardOverlap) - otherElementsSize;
    const autocompletePosition = spaceOnBottom > spaceOnTop ? bottomPosition : topPosition;
    const autocompleteAvailableSpace = spaceOnBottom > spaceOnTop ? spaceOnBottom : spaceOnTop;
    const growDown = spaceOnBottom > spaceOnTop;
    const [animatedAutocompletePosition, animatedAutocompleteAvailableSpace] = useAutocompleteDefaultAnimatedValues(autocompletePosition, autocompleteAvailableSpace);

    const label = isDM? formatMessage({id: 'screens.edit_conversation_note.input_label', defaultMessage: 'Note (optional)'}): formatMessage({id: 'screens.edit_channel_announcement.input_label', defaultMessage: 'Announcement (optional)'});
    const placeholder = isDM? formatMessage({id: 'screens.edit_conversation_note.placeholder', defaultMessage: 'e.g. their birthday, important notes, or helpful links'}): formatMessage({id: 'screens.edit_channel_announcement.placeholder', defaultMessage: 'e.g. key links, this week’s focus, or reminders for the team'});

    const helperTextId = isDM? 'screens.edit_conversation_note.helper': 'screens.edit_channel_announcement.helper';
    const helperTextDefaultMessage = isDM? 'Shown at the top of the conversation so you see it every time. You can use Markdown for links and light formatting.': 'Shown at the top of the conversation so everyone sees it. You can use Markdown for links and light formatting.';

    if (appState.saving) {
        return (
            <View style={styles.container}>
                <StatusBar/>
                <Loading
                    containerStyle={styles.loading}
                    color={theme.centerChannelColor}
                    size='large'
                />
            </View>
        );
    }

    let displayError;
    if (appState.error) {
        displayError = (
            <SafeAreaView
                edges={['bottom', 'left', 'right']}
                style={styles.errorContainer}
                onLayout={onLayoutError}
            >
                <ErrorText
                    testID='edit_channel_announcement.error.text'
                    error={appState.error}
                />
            </SafeAreaView>
        );
    }

    if (!canEdit && channel) {
        const readOnlyTextStyle = {
            color: theme.centerChannelColor,
            ...typography('Body', 200, 'Regular'),
        };
        return (
            <View
                nativeID={SecurityManager.getShieldScreenId(componentId)}
                style={styles.container}
            >
                <SafeAreaView
                    edges={['bottom', 'left', 'right']}
                    style={styles.readOnlyWrap}
                >
                    {displayError}
                    <Markdown
                        channelId={channel.id}
                        baseTextStyle={readOnlyTextStyle}
                        disableGallery={true}
                        location={Screens.CHANNEL}
                        theme={theme}
                        value={channelInfo?.header || ''}
                    />
                </SafeAreaView>
            </View>
        );
    }

    if (!channel) {
        return (
            <View style={styles.container}>
                <StatusBar/>
                <Loading
                    containerStyle={styles.loading}
                    color={theme.centerChannelColor}
                    size='large'
                />
            </View>
        );
    }

    return (
        <View
            nativeID={SecurityManager.getShieldScreenId(componentId)}
            style={styles.container}
            ref={mainView}
            onLayout={onLayoutWrapper}
        >
            <SafeAreaView
                edges={['bottom', 'left', 'right']}
                style={styles.container}
            >
                <KeyboardAwareScrollView
                    ref={scrollViewRef}
                    keyboardShouldPersistTaps='always'
                    enableAutomaticScroll={!keyboardVisible}
                    contentContainerStyle={styles.scrollView}
                    onScroll={onScroll}
                >
                    {displayError}
                    <View onLayout={onLayoutField}>
                        <FloatingTextInput
                            blurOnSubmit={false}
                            disableFullscreenUI={true}
                            enablesReturnKeyAutomatically={true}
                            label={label}
                            placeholder={placeholder}
                            onChangeText={onInputChange}
                            multiline={true}
                            returnKeyType='default'
                            testID='edit_channel_announcement.input'
                            value={text}
                            theme={theme}
                            onFocus={scrollFieldToTop}
                        />
                        <FormattedText
                            style={styles.captionText}
                            id={helperTextId}
                            defaultMessage={helperTextDefaultMessage}
                            testID='edit_channel_announcement.help'
                        />
                    </View>
                </KeyboardAwareScrollView>
                <Autocomplete
                    position={animatedAutocompletePosition}
                    updateValue={onAutocompleteChange}
                    cursorPosition={text.length}
                    value={text}
                    nestedScrollEnabled={true}
                    availableSpace={animatedAutocompleteAvailableSpace}
                    shouldDirectlyReact={false}
                    growDown={growDown}
                />
            </SafeAreaView>
        </View>
    );
};

export default EditChannelAnnouncement;
