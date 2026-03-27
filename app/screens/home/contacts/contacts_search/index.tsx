// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {fetchSearchContactEmployees} from '@actions/remote/contact';
import {type ContactEmployeeSearchItem} from '@client/rest/contact';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import GlobalErrorBoundary from '@components/global_error_fallback';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {dismissModal, showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

function cascadePathLabel(item: ContactEmployeeSearchItem): string {
    const paths = item.cascade_departments;
    if (!paths?.length) {
        return '';
    }
    return paths[0].map((d) => d.name).join(' / ');
}

function isValidSearchItem(item: ContactEmployeeSearchItem | undefined): item is ContactEmployeeSearchItem {
    return Boolean(item?.employee?.id);
}

export function filterValidSearchItems(items: ContactEmployeeSearchItem[] = []) {
    return items.filter(isValidSearchItem);
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    backHit: {
        padding: 8,
        marginRight: 4,
    },
    headerTitle: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.sidebarHeaderTextColor,
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    searchWrap: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    searchInput: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: Platform.select({ios: 10, android: 8}),
        minHeight: 40,
    },
    listContent: {
        paddingBottom: 24,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    rowAvatar: {marginRight: 14},
    rowText: {flex: 1, minWidth: 0},
    rowName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    rowPath: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    empty: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        paddingVertical: 32,
        paddingHorizontal: 24,
    },
    scopeHint: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        paddingHorizontal: 16,
        paddingTop: 8,
    },
}));

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    companyId: string;
    companyName?: string;
    departmentId?: number;
    departmentName?: string;
    currentUserId?: string;

    /** 通讯录栈内 push 时使用，替代左上角系统返回 */
    onBack?: () => void;
};

const ContactsSearchContent = ({
    componentId,
    closeButtonId,
    companyId,
    companyName,
    departmentId,
    departmentName,
    currentUserId,
    onBack,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const mounted = useRef(true);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ContactEmployeeSearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const runSearch = useCallback(async (kw: string) => {
        const res = await fetchSearchContactEmployees(companyId, kw, {
            departmentId,
        });
        if (!mounted.current) {
            return;
        }

        setLoading(false);
        setSearched(true);
        if (res.data) {
            setResults(filterValidSearchItems(res.data));
            return;
        }

        setResults([]);
    }, [companyId, departmentId]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        const kw = query.trim();
        if (kw) {
            setLoading(true);
            debounceRef.current = setTimeout(() => {
                runSearch(kw);
            }, 300);
        } else {
            setResults([]);
            setSearched(false);
            setLoading(false);
        }

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query, runSearch]);

    const title = intl.formatMessage({id: 'contacts.search.title', defaultMessage: 'Search contacts'});

    const effectiveScreenId = (closeButtonId ?? componentId) as AvailableScreens;

    const handleClose = useCallback(() => {
        if (onBack) {
            onBack();
            return;
        }
        dismissModal({componentId: effectiveScreenId});
    }, [onBack, effectiveScreenId]);

    useAndroidHardwareBackHandler(effectiveScreenId, handleClose);

    const handleEmployeePress = useCallback((item: ContactEmployeeSearchItem) => {
        const emp = item.employee;
        const path = cascadePathLabel(item);
        const deptDisplay = path || departmentName;
        const titleProfile = intl.formatMessage({id: 'contacts.personal_info', defaultMessage: 'Personal Information'});
        const cid = `close-employee-search-${emp.id}`;
        showModalWithBackButton(
            Screens.CONTACTS_EMPLOYEE_PROFILE,
            titleProfile,
            cid,
            {
                employee: emp,
                departmentName: deptDisplay,
                companyName,
                companyId,
                currentUserId,
                closeButtonId: cid,
            },
            {useBackIcon: true},
        );
    }, [companyId, companyName, currentUserId, departmentName, intl]);

    let scopeHint: string | null = null;
    if (typeof departmentId === 'number' && departmentName) {
        scopeHint = intl.formatMessage(
            {id: 'contacts.search.scope_department', defaultMessage: 'Searching in: {name}'},
            {name: departmentName},
        );
    } else if (companyName) {
        scopeHint = intl.formatMessage(
            {id: 'contacts.search.scope_company', defaultMessage: 'Searching in: {name}'},
            {name: companyName},
        );
    }

    let emptyMessage: string | null = null;
    if (query.trim()) {
        if (searched && !loading) {
            emptyMessage = intl.formatMessage({id: 'contacts.search.no_results', defaultMessage: 'No matching contacts'});
        }
    } else {
        emptyMessage = intl.formatMessage({id: 'contacts.search.hint', defaultMessage: 'Enter a name to search'});
    }

    const renderItem = useCallback(
        ({item}: {item: ContactEmployeeSearchItem}) => {
            const path = cascadePathLabel(item);
            return (
                <TouchableOpacity
                    style={styles.row}
                    onPress={() => handleEmployeePress(item)}
                    activeOpacity={0.7}
                    testID={`contacts.search.result.${item.employee.id}`}
                >
                    <View style={styles.rowAvatar}>
                        <ContactAvatar
                            employee={item.employee}
                            size={40}
                        />
                    </View>
                    <View style={styles.rowText}>
                        <Text
                            style={styles.rowName}
                            numberOfLines={1}
                        >
                            {item.employee.name}
                        </Text>
                        {path ? (
                            <Text
                                style={styles.rowPath}
                                numberOfLines={2}
                            >
                                {path}
                            </Text>
                        ) : null}
                    </View>
                </TouchableOpacity>
            );
        },
        [handleEmployeePress, styles],
    );

    return (
        <SafeAreaView
            style={styles.flex}
            edges={onBack ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']}
        >
            {onBack ? (
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backHit}
                        onPress={handleClose}
                        hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}
                        testID='contacts.search.back'
                    >
                        <CompassIcon
                            name={Platform.select({ios: 'arrow-back-ios', default: 'arrow-left'})}
                            size={22}
                            color={theme.sidebarHeaderTextColor}
                        />
                    </TouchableOpacity>
                    <Text
                        style={styles.headerTitle}
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                </View>
            ) : null}
            {scopeHint ? (
                <Text style={styles.scopeHint}>{scopeHint}</Text>
            ) : null}
            <View style={styles.searchWrap}>
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder={intl.formatMessage({
                        id: 'contacts.search.placeholder',
                        defaultMessage: 'Name, email, phone…',
                    })}
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.48)}
                    style={styles.searchInput}
                    autoCorrect={false}
                    autoCapitalize='none'
                    clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
                    returnKeyType='search'
                    testID='contacts.search.input'
                />
            </View>
            <FlatList
                data={results}
                keyExtractor={(item, index) => item.employee?.id ?? `invalid-contact-${index}`}
                renderItem={renderItem}
                contentContainerStyle={[
                    styles.listContent,
                    results.length === 0 && query.trim() ? {flexGrow: 1} : undefined,
                ]}
                ListHeaderComponent={
                    loading ? (
                        <View style={{paddingVertical: 12, alignItems: 'center'}}>
                            <ActivityIndicator color={theme.buttonBg}/>
                        </View>
                    ) : null
                }
                ListEmptyComponent={
                    emptyMessage && !loading ? (
                        <Text style={styles.empty}>{emptyMessage}</Text>
                    ) : null
                }
                keyboardShouldPersistTaps='handled'
            />
        </SafeAreaView>
    );
};

const ContactsSearchScreen = (props: Props) => {
    return (
        <GlobalErrorBoundary>
            <ContactsSearchContent {...props}/>
        </GlobalErrorBoundary>
    );
};

export default ContactsSearchScreen;
