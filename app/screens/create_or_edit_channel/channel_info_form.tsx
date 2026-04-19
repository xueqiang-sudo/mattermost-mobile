// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useState, useRef, useCallback, useEffect} from 'react';
import {useIntl} from 'react-intl';
import {
    type LayoutChangeEvent,
    TextInput,
    TouchableWithoutFeedback,
    StatusBar,
    View,
    type NativeSyntheticEvent,
    type NativeScrollEvent,
    Platform,
    StyleSheet,
    Text,
} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view';
import {SafeAreaView} from 'react-native-safe-area-context';

import Autocomplete from '@components/autocomplete';
import CompassIcon from '@components/compass_icon';
import ErrorText from '@components/error_text';
import FloatingTextInput from '@components/floating_input/floating_text_input_label';
import FormattedText from '@components/formatted_text';
import Loading from '@components/loading';
import {General, Channel} from '@constants';
import {useTheme} from '@context/theme';
import {useAutocompleteDefaultAnimatedValues} from '@hooks/autocomplete';
import {useKeyboardHeight, useKeyboardOverlap} from '@hooks/device';
import {useInputPropagation} from '@hooks/input';
import {
    changeOpacity,
    makeStyleSheetFromTheme,
} from '@utils/theme';
import {typography} from '@utils/typography';

const SCREEN_PADDING_H = 16;
const SECTION_GAP = 24;
const CARD_PADDING = 16;
const FIELD_GAP_IN_CARD = 20;
const FIELD_CAPTION_GAP = 8;
const BOTTOM_AUTOCOMPLETE_SEPARATION = Platform.select({ios: 10, default: 10});
const SCROLL_PADDING_VERTICAL = 20;
const AUTOCOMPLETE_ADJUST = 5;
const CARD_RADIUS = 12;

const getStyleSheet = makeStyleSheetFromTheme((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    scrollView: {
        paddingVertical: SCROLL_PADDING_VERTICAL,
        paddingHorizontal: SCREEN_PADDING_H,
    },
    errorContainer: {
        width: '100%',
        marginBottom: 16,
    },
    errorWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mainView: {
        gap: SECTION_GAP,
    },
    introCard: {
        borderRadius: CARD_RADIUS,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        padding: CARD_PADDING,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    introIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    introTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    introTitle: {
        ...typography('Body', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    introCaption: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        lineHeight: 22,
    },
    sectionLabel: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
        marginLeft: 2,
    },
    fieldsCard: {
        borderRadius: CARD_RADIUS,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
        padding: CARD_PADDING,
        gap: FIELD_GAP_IN_CARD,
    },
    fieldStack: {
        width: '100%',
    },
    captionText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: FIELD_CAPTION_GAP,
    },
}));

type Props = {
    channelType?: string;
    displayName: string;
    displayNameReadOnly?: boolean;
    /** 企业总群（默认公开频道）：不显示「标题/公告」编辑字段，与信息页公告分离 */
    hideChannelHeaderField?: boolean;
    onDisplayNameChange: (text: string) => void;
    editing: boolean;
    error?: string | object;
    header: string;
    headerOnly?: boolean;
    onHeaderChange: (text: string) => void;
    onTypeChange: (type: ChannelType) => void;
    purpose: string;
    onPurposeChange: (text: string) => void;
    saving: boolean;
    type?: string;
}

export default function ChannelInfoForm({
    channelType,
    displayName,
    displayNameReadOnly = false,
    hideChannelHeaderField = false,
    onDisplayNameChange,
    editing,
    error,
    header,
    headerOnly,
    onHeaderChange,
    onTypeChange,
    purpose,
    onPurposeChange,
    saving,
    type,
}: Props) {
    void onTypeChange;
    const intl = useIntl();
    const {formatMessage} = intl;

    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const nameInput = useRef<TextInput>(null);
    const purposeInput = useRef<TextInput>(null);
    const headerInput = useRef<TextInput>(null);

    const scrollViewRef = useRef<KeyboardAwareScrollView>(null);

    const updateScrollTimeout = useRef<NodeJS.Timeout>();

    const mainView = useRef<View>(null);
    const [wrapperHeight, setWrapperHeight] = useState(0);
    const keyboardOverlap = useKeyboardOverlap(mainView, wrapperHeight);

    const [propagateValue, shouldProcessEvent] = useInputPropagation();

    const keyboardHeight = useKeyboardHeight();
    const [keyboardVisible, setKeyBoardVisible] = useState(false);
    const [scrollPosition, setScrollPosition] = useState(0);

    const [errorHeight, setErrorHeight] = useState(0);
    const [introHeight, setIntroHeight] = useState(0);
    const [detailsBlockHeight, setDetailsBlockHeight] = useState(0);
    const [headerFieldHeight, setHeaderFieldHeight] = useState(0);
    const [headerPosition, setHeaderPosition] = useState(0);

    const optionalText = formatMessage({id: 'channel_modal.optional', defaultMessage: '(optional)'});
    const labelDisplayName = formatMessage({id: 'channel_modal.name', defaultMessage: 'Name'});
    const labelPurpose = formatMessage({id: 'channel_modal.purpose', defaultMessage: 'Purpose'}) + ' ' + optionalText;
    const labelHeader = formatMessage({id: 'channel_modal.header', defaultMessage: 'Header'}) + ' ' + optionalText;

    const placeholderDisplayName = formatMessage({id: 'channel_modal.nameEx', defaultMessage: 'e.g. Bugs, Marketing'});
    const placeholderPurpose = formatMessage({id: 'channel_modal.purposeEx', defaultMessage: 'What this group chat is for'});
    const placeholderHeader = formatMessage({id: 'channel_modal.headerEx', defaultMessage: 'Markdown supported — links, notes'});

    const effectiveChannelType = channelType ?? type ?? '';
    const displayHeaderOnly = headerOnly || channelType === General.DM_CHANNEL || (channelType === General.GM_CHANNEL && !editing);
    const showCreateIntro = !editing && !displayHeaderOnly;
    /** 讨论组编辑：频道「标题」即会话顶栏公告，与信息页公告重复，仅保留名称与用途 */
    const hideHeaderField =
        (effectiveChannelType === General.PRIVATE_CHANNEL && !headerOnly) ||
        Boolean(hideChannelHeaderField) ||
        (effectiveChannelType === General.GM_CHANNEL && !displayHeaderOnly);
    const showHeaderField = displayHeaderOnly || (!displayHeaderOnly && !hideHeaderField);

    const sectionDetailsLabel = formatMessage({
        id: 'channel_modal.section.details',
        defaultMessage: 'Details',
    });

    const introTitle = formatMessage({
        id: 'channel_modal.create_private_notice.title',
        defaultMessage: 'Create a chat for this topic',
    });
    const introCaption = formatMessage({
        id: 'channel_modal.create_private_notice.caption',
        defaultMessage: 'After you create it, invite the right people—keep decisions, updates, and files in one thread.',
    });

    const blur = useCallback(() => {
        nameInput.current?.blur();
        purposeInput.current?.blur();
        headerInput.current?.blur();
        scrollViewRef.current?.scrollToPosition(0, 0, true);
    }, []);

    const scrollHeaderToTop = useCallback(() => {
        if (scrollViewRef?.current) {
            scrollViewRef.current?.scrollToPosition(0, headerPosition);
        }
    }, [headerPosition]);

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

    useEffect(() => {
        if (keyboardVisible && !keyboardHeight) {
            setKeyBoardVisible(false);
        }
        if (!keyboardVisible && keyboardHeight) {
            setKeyBoardVisible(true);
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keyboardHeight]);

    const onHeaderAutocompleteChange = useCallback((value: string) => {
        onHeaderChange(value);
        propagateValue(value);
    }, [onHeaderChange, propagateValue]);

    const onHeaderInputChange = useCallback((value: string) => {
        if (!shouldProcessEvent(value)) {
            return;
        }
        onHeaderChange(value);
    }, [onHeaderChange, shouldProcessEvent]);

    const onLayoutError = useCallback((e: LayoutChangeEvent) => {
        setErrorHeight(e.nativeEvent.layout.height);
    }, []);

    const onLayoutIntro = useCallback((e: LayoutChangeEvent) => {
        setIntroHeight(e.nativeEvent.layout.height);
    }, []);

    const onLayoutDetailsBlock = useCallback((e: LayoutChangeEvent) => {
        setDetailsBlockHeight(e.nativeEvent.layout.height);
    }, []);

    const onLayoutHeader = useCallback((e: LayoutChangeEvent) => {
        setHeaderFieldHeight(e.nativeEvent.layout.height);
        setHeaderPosition(e.nativeEvent.layout.y);
    }, []);

    const onLayoutWrapper = useCallback((e: LayoutChangeEvent) => {
        setWrapperHeight(e.nativeEvent.layout.height);
    }, []);

    const otherElementsSize = SCROLL_PADDING_VERTICAL + errorHeight +
        (showCreateIntro ? introHeight + SECTION_GAP : 0) +
        (displayHeaderOnly ? headerFieldHeight : detailsBlockHeight);

    const workingSpace = wrapperHeight - keyboardOverlap;
    const spaceOnTop = otherElementsSize - scrollPosition - AUTOCOMPLETE_ADJUST;
    const spaceOnBottom = (workingSpace + scrollPosition) - (otherElementsSize + BOTTOM_AUTOCOMPLETE_SEPARATION);

    const bottomPosition = otherElementsSize - scrollPosition;
    const topPosition = (workingSpace + scrollPosition + AUTOCOMPLETE_ADJUST + keyboardOverlap) - otherElementsSize;
    const autocompletePosition = spaceOnBottom > spaceOnTop ? bottomPosition : topPosition;
    const autocompleteAvailableSpace = spaceOnBottom > spaceOnTop ? spaceOnBottom : spaceOnTop;
    const growDown = spaceOnBottom > spaceOnTop;

    const [animatedAutocompletePosition, animatedAutocompleteAvailableSpace] = useAutocompleteDefaultAnimatedValues(autocompletePosition, autocompleteAvailableSpace);

    if (saving) {
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
    if (error) {
        displayError = (
            <SafeAreaView
                edges={['bottom', 'left', 'right']}
                style={styles.errorContainer}
                onLayout={onLayoutError}
            >
                <View style={styles.errorWrapper}>
                    <ErrorText
                        testID='edit_channel_info.error.text'
                        error={error}
                    />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView
            edges={['bottom', 'left', 'right']}
            style={styles.container}
            testID='create_or_edit_channel.screen'
            onLayout={onLayoutWrapper}
            ref={mainView}
        >
            <KeyboardAwareScrollView
                testID={'create_or_edit_channel.scroll_view'}
                ref={scrollViewRef}
                keyboardShouldPersistTaps={'always'}
                enableAutomaticScroll={!keyboardVisible}
                contentContainerStyle={styles.scrollView}
                onScroll={onScroll}
            >
                {displayError}
                <TouchableWithoutFeedback
                    onPress={blur}
                >
                    <View style={styles.mainView}>
                        {showCreateIntro && (
                            <View
                                style={styles.introCard}
                                onLayout={onLayoutIntro}
                            >
                                <View style={styles.introIconWrap}>
                                    <CompassIcon
                                        name='bullhorn-outline'
                                        size={22}
                                        color={theme.buttonBg}
                                    />
                                </View>
                                <View style={styles.introTextBlock}>
                                    <Text style={styles.introTitle}>
                                        {introTitle}
                                    </Text>
                                    <Text style={styles.introCaption}>
                                        {introCaption}
                                    </Text>
                                </View>
                            </View>
                        )}
                        {!displayHeaderOnly && (
                            <View onLayout={onLayoutDetailsBlock}>
                                <Text style={styles.sectionLabel}>
                                    {sectionDetailsLabel}
                                </Text>
                                <View style={styles.fieldsCard}>
                                    <View style={styles.fieldStack}>
                                        <FloatingTextInput
                                            blurOnSubmit={false}
                                            disableFullscreenUI={true}
                                            editable={!displayNameReadOnly}
                                            enablesReturnKeyAutomatically={true}
                                            label={labelDisplayName}
                                            placeholder={placeholderDisplayName}
                                            onChangeText={onDisplayNameChange}
                                            maxLength={Channel.MAX_CHANNEL_NAME_LENGTH}
                                            returnKeyType='next'
                                            testID='channel_info_form.display_name.input'
                                            value={displayName}
                                            ref={nameInput}
                                            theme={theme}
                                        />
                                        {displayNameReadOnly && (
                                            <FormattedText
                                                style={styles.captionText}
                                                id='mobile.channel.town_square_display_name_readonly_short'
                                                defaultMessage='This enterprise main group shows your enterprise name. It can’t be changed here.'
                                                testID='channel_info_form.display_name.readonly_help'
                                            />
                                        )}
                                    </View>
                                    <View style={styles.fieldStack}>
                                        <FloatingTextInput
                                            blurOnSubmit={false}
                                            disableFullscreenUI={true}
                                            enablesReturnKeyAutomatically={true}
                                            label={labelPurpose}
                                            placeholder={placeholderPurpose}
                                            onChangeText={onPurposeChange}
                                            returnKeyType='next'
                                            testID='channel_info_form.purpose.input'
                                            value={purpose}
                                            ref={purposeInput}
                                            theme={theme}
                                        />
                                    </View>
                                    {showHeaderField && (
                                        <View
                                            style={styles.fieldStack}
                                            onLayout={onLayoutHeader}
                                        >
                                            <FloatingTextInput
                                                blurOnSubmit={false}
                                                disableFullscreenUI={true}
                                                enablesReturnKeyAutomatically={true}
                                                label={labelHeader}
                                                placeholder={placeholderHeader}
                                                onChangeText={onHeaderInputChange}
                                                multiline={true}
                                                returnKeyType='next'
                                                testID='channel_info_form.header.input'
                                                value={header}
                                                ref={headerInput}
                                                theme={theme}
                                                onFocus={scrollHeaderToTop}
                                            />
                                            <FormattedText
                                                style={styles.captionText}
                                                id='channel_modal.headerHelp'
                                                defaultMessage={'Shown next to the chat name at the top. Use Markdown for links, e.g. [Docs](https://example.com).'}
                                                testID='channel_info_form.header.description'
                                            />
                                        </View>
                                    )}
                                </View>
                            </View>
                        )}
                        {displayHeaderOnly && (
                            <View
                                style={styles.fieldStack}
                                onLayout={onLayoutHeader}
                            >
                                <FloatingTextInput
                                    blurOnSubmit={false}
                                    disableFullscreenUI={true}
                                    enablesReturnKeyAutomatically={true}
                                    label={labelHeader}
                                    placeholder={placeholderHeader}
                                    onChangeText={onHeaderInputChange}
                                    multiline={true}
                                    returnKeyType='next'
                                    testID='channel_info_form.header.input'
                                    value={header}
                                    ref={headerInput}
                                    theme={theme}
                                    onFocus={scrollHeaderToTop}
                                />
                                <FormattedText
                                    style={styles.captionText}
                                    id='channel_modal.headerHelp'
                                    defaultMessage={'Shown next to the chat name at the top. Use Markdown for links, e.g. [Docs](https://example.com).'}
                                    testID='channel_info_form.header.description'
                                />
                            </View>
                        )}
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAwareScrollView>
            {showHeaderField && (
                <Autocomplete
                    position={animatedAutocompletePosition}
                    updateValue={onHeaderAutocompleteChange}
                    cursorPosition={header.length}
                    value={header}
                    nestedScrollEnabled={true}
                    availableSpace={animatedAutocompleteAvailableSpace}
                    shouldDirectlyReact={false}
                    growDown={growDown}
                />
            )}
        </SafeAreaView>
    );
}
