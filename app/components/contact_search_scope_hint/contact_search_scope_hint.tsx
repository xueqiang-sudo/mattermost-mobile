// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useLayoutEffect, useMemo, useRef} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import {useTheme} from '@context/theme';
import {bottomSheet} from '@screens/navigation';
import {normalizeDepartmentName} from '@utils/contact_employee_search_path';
import {getNavigationalPathView, NAV_PATH_MAX_VISIBLE} from '@utils/department_path';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

export type ContactSearchScopeHintVariant = 'onSidebarHeader' | 'onLightPanel';

type Props = {
    variant: ContactSearchScopeHintVariant;
    /** 企业内全局搜索 */
    companyName?: string;
    /** 部门内搜索：与 department_detail 的 baseBreadcrumb 一致（含企业通讯录首段） */
    departmentBreadcrumb?: string[];
    /** 无 breadcrumb 时与部门详情页一致：[enterprise, departmentName] */
    departmentName?: string;
    /** 是否为部门范围内搜索（与 contacts_search 的 departmentId 语义一致） */
    departmentScoped?: boolean;
    testID?: string;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    companyWrap: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    companyLine: {
        ...typography('Body', 75),
    },
    deptScopeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    deptLabel: {
        ...typography('Body', 75),
        flexShrink: 0,
        marginRight: 6,
    },
    breadcrumbScroll: {
        flex: 1,
        minWidth: 0,
    },
    breadcrumbRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 8,
        paddingVertical: 2,
        paddingRight: 8,
    },
    breadcrumbSegment: {
        ...typography('Body', 75),
        maxWidth: 220,
    },
    breadcrumbSeparator: {
        ...typography('Body', 75),
    },
    breadcrumbEllipsis: {
        paddingVertical: 6,
        paddingHorizontal: 8,
        marginHorizontal: -4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    breadcrumbEllipsisText: {
        ...typography('Body', 200, 'SemiBold'),
        marginTop: -5,
    },
    pathSheetRow: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    pathSheetRowInner: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: ITEM_HEIGHT,
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    pathSheetText: {
        ...typography('Body', 200),
        flex: 1,
        minWidth: 0,
    },
    pathSheetTextCurrent: {
        ...typography('Body', 200, 'SemiBold'),
    },
    pathSheetCheck: {
        marginLeft: 10,
        flexShrink: 0,
    },
}));

const ContactSearchScopeHint = ({
    variant,
    companyName,
    departmentBreadcrumb,
    departmentName,
    departmentScoped,
    testID,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyles(theme);
    const breadcrumbScrollRef = useRef<ScrollView>(null);

    const defaultDepartmentLabel = intl.formatMessage({id: 'contacts.default_department', defaultMessage: 'Default Department'});
    const enterpriseLabel = intl.formatMessage({id: 'contacts.enterprise', defaultMessage: 'Enterprise Contacts'});

    const isSidebar = variant === 'onSidebarHeader';
    const labelAndSegmentColor = isSidebar ?
        changeOpacity(theme.sidebarText, 0.88) :
        changeOpacity(theme.centerChannelColor, 0.72);
    const separatorColor = isSidebar ?
        changeOpacity(theme.sidebarText, 0.45) :
        changeOpacity(theme.centerChannelColor, 0.45);
    const companyPrimaryColor = labelAndSegmentColor;

    const normalizedCrumbs = useMemo(() => {
        if (!departmentScoped || !departmentName) {
            return [];
        }
        const raw =
            departmentBreadcrumb && departmentBreadcrumb.length > 0 ?
                departmentBreadcrumb :
                [enterpriseLabel, departmentName];
        return raw.map((s) => normalizeDepartmentName(s, defaultDepartmentLabel));
    }, [
        defaultDepartmentLabel,
        departmentBreadcrumb,
        departmentName,
        departmentScoped,
        enterpriseLabel,
    ]);

    const pathView = useMemo(
        () => (normalizedCrumbs.length ? getNavigationalPathView(normalizedCrumbs, NAV_PATH_MAX_VISIBLE) : null),
        [normalizedCrumbs],
    );

    const depth = normalizedCrumbs.length > 0 ? normalizedCrumbs.length - 1 : 0;
    const breadcrumbPathSignature = normalizedCrumbs.join('\u0001');

    const scrollBreadcrumbToEnd = useCallback(() => {
        requestAnimationFrame(() => {
            breadcrumbScrollRef.current?.scrollToEnd({animated: false});
        });
    }, []);

    useLayoutEffect(() => {
        if (pathView) {
            scrollBreadcrumbToEnd();
        }
    }, [breadcrumbPathSignature, pathView, scrollBreadcrumbToEnd]);

    const handleEllipsisPress = useCallback(() => {
        if (!pathView || pathView.middleSegments.length === 0) {
            return;
        }
        const fullSegments = pathView.fullSegments;
        const currentDepth = depth;
        bottomSheet({
            closeButtonId: 'close-contacts-search-scope-path',
            renderContent: () => (
                <>
                    {fullSegments.map((label, i) => {
                        const isCurrent = i === currentDepth;
                        return (
                            <View
                                key={i}
                                style={styles.pathSheetRow}
                                testID={`contacts.search.scope.path_sheet.${i}`}
                                accessibilityState={{disabled: true}}
                            >
                                <View style={styles.pathSheetRowInner}>
                                    <Text
                                        style={[
                                            styles.pathSheetText,
                                            isCurrent ?
                                                [
                                                    styles.pathSheetTextCurrent,
                                                    {color: theme.linkColor},
                                                ] :
                                                {color: changeOpacity(theme.centerChannelColor, 0.72)},
                                        ]}
                                        numberOfLines={3}
                                    >
                                        {label}
                                    </Text>
                                    {isCurrent ?
                                        (
                                            <View style={styles.pathSheetCheck}>
                                                <CompassIcon
                                                    name='check-circle'
                                                    size={22}
                                                    color={theme.linkColor}
                                                />
                                            </View>
                                        ) :
                                        null}
                                </View>
                            </View>
                        );
                    })}
                </>
            ),
            snapPoints: [1, bottomSheetSnapPoint(fullSegments.length, ITEM_HEIGHT)],
            theme,
            title: intl.formatMessage({id: 'contacts.department_path_middle', defaultMessage: 'Department path'}),
        });
    }, [depth, intl, pathView, styles, theme]);

    if (departmentScoped && departmentName && pathView) {
        return (
            <View
                style={styles.deptScopeRow}
                testID={testID}
            >
                <Text
                    style={[styles.deptLabel, {color: labelAndSegmentColor}]}
                    numberOfLines={1}
                >
                    {intl.formatMessage({
                        id: 'contacts.search.scope_prefix',
                        defaultMessage: 'Search scope:',
                    })}
                </Text>
                <ScrollView
                    ref={breadcrumbScrollRef}
                    horizontal={true}
                    showsHorizontalScrollIndicator={false}
                    style={styles.breadcrumbScroll}
                    contentContainerStyle={styles.breadcrumbRow}
                    keyboardShouldPersistTaps='handled'
                    onContentSizeChange={scrollBreadcrumbToEnd}
                >
                    {pathView.items.map((pathItem, idx) => (
                        <React.Fragment key={`${pathItem.type}-${idx}`}>
                            {idx > 0 && (
                                <Text style={[styles.breadcrumbSeparator, {color: separatorColor}]}>
                                    {intl.formatMessage({id: 'contacts.breadcrumb_separator', defaultMessage: '>'})}
                                </Text>
                            )}
                            {pathItem.type === 'segment' ?
                                (
                                    <Text
                                        style={[
                                            styles.breadcrumbSegment,
                                            {
                                                color:
                                                    pathItem.originalIndex === depth ?
                                                        theme.linkColor :
                                                        labelAndSegmentColor,
                                            },
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {pathItem.label}
                                    </Text>
                                ) :
                                (
                                    <TouchableOpacity
                                        style={styles.breadcrumbEllipsis}
                                        onPress={handleEllipsisPress}
                                        activeOpacity={0.7}
                                        testID='contacts.search.scope.ellipsis'
                                    >
                                        <Text
                                            style={[styles.breadcrumbEllipsisText, {color: theme.linkColor}]}
                                            numberOfLines={1}
                                        >
                                            {pathItem.label}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                        </React.Fragment>
                    ))}
                </ScrollView>
            </View>
        );
    }

    if (companyName) {
        return (
            <View
                style={styles.companyWrap}
                testID={testID}
            >
                <Text
                    style={[styles.companyLine, {color: companyPrimaryColor}]}
                    numberOfLines={2}
                >
                    {intl.formatMessage(
                        {
                            id: 'contacts.search.scope_company',
                            defaultMessage: 'Searching in: {name}',
                        },
                        {name: companyName},
                    )}
                </Text>
            </View>
        );
    }

    return null;
};

export default ContactSearchScopeHint;
