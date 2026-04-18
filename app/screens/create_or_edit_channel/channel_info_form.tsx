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
} from 'react-native';
import {KeyboardAwareScrollView} from 'react-native-keyboard-aware-scroll-view';
import {SafeAreaView} from 'react-native-safe-area-context';

import Autocomplete from '@components/autocomplete';
import ErrorText from '@components/error_text';
import FloatingTextInput from '@components/floating_input/floating_text_input_label';
import FormattedText from '@components/formatted_text';
import Loading from '@components/loading';
import OptionItem from '@components/option_item';
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
const FIELD_CAPTION_GAP = 8;
const BOTTOM_AUTOCOMPLETE_SEPARATION = Platform.select({ios: 10, default: 10});
const SCROLL_PADDING_VERTICAL = 20;
const AUTOCOMPLETE_ADJUST = 5;

/**
 * 获取频道信息表单的样式
 */
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
    captionText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: FIELD_CAPTION_GAP,
    },
    mainView: {
        gap: SECTION_GAP,
    },
    fieldStack: {
        width: '100%',
    },
    privacySection: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        overflow: 'hidden',
    },
    privacySectionInner: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
}));

type Props = {
    channelType?: string;
    displayName: string;
    displayNameReadOnly?: boolean;
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

/**
 * 频道信息表单组件
 */
export default function ChannelInfoForm({
    channelType,
    displayName,
    displayNameReadOnly = false,
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
    const [displayNameFieldHeight, setDisplayNameFieldHeight] = useState(0);
    const [makePrivateHeight, setMakePrivateHeight] = useState(0);
    const [purposeFieldHeight, setPurposeFieldHeight] = useState(0);
    const [headerFieldHeight, setHeaderFieldHeight] = useState(0);
    const [headerPosition, setHeaderPosition] = useState(0);

    const optionalText = formatMessage({id: 'channel_modal.optional', defaultMessage: '(optional)'});
    const labelDisplayName = formatMessage({id: 'channel_modal.name', defaultMessage: 'Name'});
    const labelPurpose = formatMessage({id: 'channel_modal.purpose', defaultMessage: 'Purpose'}) + ' ' + optionalText;
    const labelHeader = formatMessage({id: 'channel_modal.header', defaultMessage: 'Header'}) + ' ' + optionalText;

    const placeholderDisplayName = formatMessage({id: 'channel_modal.nameEx', defaultMessage: 'Bugs, Marketing'});
    const placeholderPurpose = formatMessage({id: 'channel_modal.purposeEx', defaultMessage: 'A channel to file bugs and improvements'});
    const placeholderHeader = formatMessage({id: 'channel_modal.headerEx', defaultMessage: 'Use Markdown to format header text'});

    const makePrivateLabel = formatMessage({id: 'channel_modal.makePrivate.label', defaultMessage: 'Make Private'});
    const makePrivateDescription = formatMessage({id: 'channel_modal.makePrivate.description', defaultMessage: 'When a channel is set to private, only invited enterprise members can access and participate in that channel'});

    // GM 群聊编辑时显示名称字段以支持修改群聊名称
    const displayHeaderOnly = headerOnly || channelType === General.DM_CHANNEL || (channelType === General.GM_CHANNEL && !editing);
    const showSelector = !displayHeaderOnly && !editing;

    const isPrivate = type === General.PRIVATE_CHANNEL;

    /**
     * 处理频道类型切换
     */
    const handlePress = () => {
        const chtype = isPrivate ? General.OPEN_CHANNEL : General.PRIVATE_CHANNEL;
        onTypeChange(chtype);
    };

    /**
     * 失去焦点处理
     */
    const blur = useCallback(() => {
        nameInput.current?.blur();
        purposeInput.current?.blur();
        headerInput.current?.blur();
        scrollViewRef.current?.scrollToPosition(0, 0, true);
    }, []);

    /**
     * 滚动到头部
     */
    const scrollHeaderToTop = useCallback(() => {
        if (scrollViewRef?.current) {
            scrollViewRef.current?.scrollToPosition(0, headerPosition);
        }
    }, [headerPosition]);

    /**
     * 滚动事件处理
     */
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

        // We only want to change the visibility when the height changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keyboardHeight]);

    /**
     * 处理头部自动完成变化
     */
    const onHeaderAutocompleteChange = useCallback((value: string) => {
        onHeaderChange(value);
        propagateValue(value);
    }, [onHeaderChange, propagateValue]);

    /**
     * 处理头部输入变化
     */
    const onHeaderInputChange = useCallback((value: string) => {
        if (!shouldProcessEvent(value)) {
            return;
        }
        onHeaderChange(value);
    }, [onHeaderChange, shouldProcessEvent]);

    /**
     * 错误区域布局处理
     */
    const onLayoutError = useCallback((e: LayoutChangeEvent) => {
        setErrorHeight(e.nativeEvent.layout.height);
    }, []);

    /**
     * 设为私有选项布局处理
     */
    const onLayoutMakePrivate = useCallback((e: LayoutChangeEvent) => {
        setMakePrivateHeight(e.nativeEvent.layout.height);
    }, []);

    /**
     * 显示名称字段布局处理
     */
    const onLayoutDisplayName = useCallback((e: LayoutChangeEvent) => {
        setDisplayNameFieldHeight(e.nativeEvent.layout.height);
    }, []);

    /**
     * 用途字段布局处理
     */
    const onLayoutPurpose = useCallback((e: LayoutChangeEvent) => {
        setPurposeFieldHeight(e.nativeEvent.layout.height);
    }, []);

    /**
     * 头部字段布局处理
     */
    const onLayoutHeader = useCallback((e: LayoutChangeEvent) => {
        setHeaderFieldHeight(e.nativeEvent.layout.height);
        setHeaderPosition(e.nativeEvent.layout.y);
    }, []);

    /**
     * 包装器布局处理
     */
    const onLayoutWrapper = useCallback((e: LayoutChangeEvent) => {
        setWrapperHeight(e.nativeEvent.layout.height);
    }, []);

    const otherElementsSize = SCROLL_PADDING_VERTICAL + errorHeight +
        (showSelector ? makePrivateHeight + SECTION_GAP : 0) +
        (displayHeaderOnly ? 0 : displayNameFieldHeight + SECTION_GAP + purposeFieldHeight + SECTION_GAP);

    const workingSpace = wrapperHeight - keyboardOverlap;
    const spaceOnTop = otherElementsSize - scrollPosition - AUTOCOMPLETE_ADJUST;
    const spaceOnBottom = (workingSpace + scrollPosition) - (otherElementsSize + headerFieldHeight + BOTTOM_AUTOCOMPLETE_SEPARATION);

    const bottomPosition = (otherElementsSize + headerFieldHeight) - scrollPosition;
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
                        {showSelector && (
                            <View
                                style={styles.privacySection}
                                onLayout={onLayoutMakePrivate}
                            >
                                <View style={styles.privacySectionInner}>
                                    <OptionItem
                                        testID='channel_info_form.make_private'
                                        label={makePrivateLabel}
                                        description={makePrivateDescription}
                                        action={handlePress}
                                        type={'toggle'}
                                        selected={isPrivate}
                                        icon={'lock-outline'}
                                    />
                                </View>
                            </View>
                        )}
                        {!displayHeaderOnly && (
                            <View
                                style={styles.fieldStack}
                                onLayout={onLayoutDisplayName}
                            >
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
                                        id='mobile.channel.town_square_display_name_readonly'
                                        defaultMessage="This name is your enterprise workspace. It is shown here instead of the server default. To change it, ask your administrator to update the team or enterprise display name."
                                        testID='channel_info_form.display_name.readonly_help'
                                    />
                                )}
                            </View>
                        )}
                        {!displayHeaderOnly && (
                            <View
                                style={styles.fieldStack}
                                onLayout={onLayoutPurpose}
                            >
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
                                <FormattedText
                                    style={styles.captionText}
                                    id='channel_modal.descriptionHelp'
                                    defaultMessage='Describe how this channel should be used.'
                                    testID='channel_info_form.purpose.description'
                                />
                            </View>
                        )}
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
                                defaultMessage={'Specify text to appear in the channel header beside the channel name. For example, include frequently used links by typing link text [Link Title](http://example.com).'}
                                testID='channel_info_form.header.description'
                            />
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAwareScrollView>
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
        </SafeAreaView>
    );
}
