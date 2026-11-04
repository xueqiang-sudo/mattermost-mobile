// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, FlatList, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import {
    batchMoveContactEmployeeToDepartment,
    fetchDefaultDepartmentId,
    fetchDepartmentsByTeam,
    fetchDepartmentEmployees,
} from '@actions/remote/contact_new';
import CompassIcon from '@components/compass_icon';
import ContactAvatar from '@components/contact_avatar';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {debugLog} from '@store/debug_log';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {getContactListDisplayName} from '@utils/contact_section';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {MMDepartment} from '@client/rest/team_department';

const SAFE_AREA_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

type MemberWithSource = {
    employee: UserProfile;
    sourceDepartmentId: number;
    sourceDepartmentName: string;
};

type Props = {
    companyId: string;
    companyName?: string;
    targetDepartmentId: number | null;
    targetDepartmentName: string;
    onBack: () => void;
    onSuccess: () => void;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 10,
        backgroundColor: theme.sidebarBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerBack: {
        padding: 4,
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    headerTitle: {
        flex: 1,
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.sidebarHeaderTextColor,
        textAlign: 'center',
    },
    headerPlaceholder: {
        width: 40,
        flexShrink: 0,
    },
    headerConfirmBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerConfirmText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.sidebarHeaderTextColor,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    searchInput: {
        flex: 1,
        height: 36,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    selectAllWrap: {
        paddingHorizontal: 12,
        justifyContent: 'center',
    },
    selectAllText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.linkColor,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    sectionHeaderText: {
        ...typography('Body', 100, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: theme.linkColor,
        borderColor: theme.linkColor,
    },
    checkboxUnselected: {
        borderColor: changeOpacity(theme.centerChannelColor, 0.4),
    },
    listItemAvatar: {marginRight: 12},
    listItemName: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    bottomBar: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 24,
        backgroundColor: theme.centerChannelBg,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    bottomBarChipsWrap: {
        marginBottom: 8,
        maxHeight: 44,
    },
    bottomBarChipsScroll: {
        flexGrow: 0,
    },
    bottomBarChipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingRight: 16,
    },
    selectedChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.1),
        borderWidth: 1,
        borderColor: changeOpacity(theme.linkColor, 0.35),
    },
    selectedChipIcon: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
        borderRadius: 12,
        backgroundColor: changeOpacity(theme.linkColor, 0.15),
    },
    selectedChipText: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    bottomBarSummary: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.85),
        marginBottom: 10,
    },
    bottomButton: {
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: theme.linkColor,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomButtonDisabled: {
        backgroundColor: changeOpacity(theme.linkColor, 0.4),
    },
    bottomButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: '#fff',
    },
    emptyMessage: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        paddingVertical: 24,
        paddingHorizontal: 20,
        textAlign: 'center',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        backgroundColor: theme.centerChannelBg,
    },
}));

const ContactsDepartmentAddMembersScreen = ({
    companyId,
    targetDepartmentId,
    targetDepartmentName,
    onBack,
    onSuccess,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const mounted = useRef(false);
    const styles = getStyleSheet(theme);

    const [members, setMembers] = useState<MemberWithSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [searchText, setSearchText] = useState('');
    const [moving, setMoving] = useState(false);
    const [effectiveTargetId, setEffectiveTargetId] = useState<number | null>(targetDepartmentId);

    // Load effective target department ID (default department for root)
    useEffect(() => {
        if (targetDepartmentId != null) {
            setEffectiveTargetId(targetDepartmentId);
            return;
        }
        if (!serverUrl || !companyId) {
            return;
        }
        let cancelled = false;
        fetchDefaultDepartmentId(serverUrl, companyId).then((res) => {
            if (!cancelled && mounted.current && res.data != null) {
                setEffectiveTargetId(res.data);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [companyId, serverUrl, targetDepartmentId]);

    // Load members from other departments
    const loadMembers = useCallback(async () => {
        if (!serverUrl || !companyId) {
            setLoading(false);
            return;
        }
        setLoading(true);

        try {
            // Fetch all departments
            const deptRes = await fetchDepartmentsByTeam(serverUrl, companyId, {perPage: 10000});
            // 【关键修复】同时获取默认部门 ID（根部门），确保根部门成员也被加载
            const defaultDeptRes = await fetchDefaultDepartmentId(serverUrl, companyId);
            if (!mounted.current) {
                return;
            }
            if (deptRes.error || !deptRes.data) {
                setMembers([]);
                setLoading(false);
                return;
            }

            const allDepartments = deptRes.data;
            const defaultDeptId = defaultDeptRes.data;

            debugLog('addMembers', `Fetched ${allDepartments.length} departments, defaultDeptId=${defaultDeptId}, targetDepartmentId=${targetDepartmentId}`);
            allDepartments.forEach((d, i) => {
                debugLog('addMembers', `  dept[${i}]: id=${d.id}, name=${d.name}`);
            });

            // 【关键修复】如果默认部门（根部门）不在 allDepartments 中，构造一个虚拟部门对象加入列表
            // 这样根部门的成员才能被显示出来供用户选择
            const hasDefaultDept = defaultDeptId != null && allDepartments.some((d) => d.id === defaultDeptId);
            debugLog('addMembers', `hasDefaultDept=${hasDefaultDept}`);
            if (defaultDeptId != null && !hasDefaultDept) {
                debugLog('addMembers', `Adding virtual default department: id=${defaultDeptId}`);
                allDepartments.unshift({
                    id: defaultDeptId,
                    name: '根部门',
                    team_id: companyId,
                    parent_id: null,
                    create_at: 0,
                    update_at: 0,
                    delete_at: 0,
                    description: '',
                });
            }

            // Determine which departments to fetch members from
            let sourceDepartments: MMDepartment[];
            if (targetDepartmentId == null) {
                // Root: show all sub-department members (exclude default department)
                sourceDepartments = allDepartments.filter((d) => d.id !== effectiveTargetId);
            } else {
                // Specific department: show all departments except current (including default department)
                sourceDepartments = allDepartments.filter((d) => d.id !== targetDepartmentId);
            }

            debugLog('addMembers', `Source departments (${sourceDepartments.length}):`);
            sourceDepartments.forEach((d, i) => {
                debugLog('addMembers', `  source[${i}]: id=${d.id}, name=${d.name}`);
            });

            // Fetch members from each source department
            const memberMap = new Map<string, MemberWithSource>();
            const targetMemberIds = new Set<string>();

            // If at specific department, fetch its members to exclude
            if (targetDepartmentId != null) {
                const targetRes = await fetchDepartmentEmployees(serverUrl, companyId, targetDepartmentId, {perPage: 10000});
                debugLog('addMembers', `Target dept ${targetDepartmentId} has ${targetRes.data?.length || 0} members (to exclude)`);
                if (mounted.current && targetRes.data) {
                    for (const emp of targetRes.data) {
                        targetMemberIds.add(emp.id);
                    }
                }
            }

            // Fetch members from source departments (in parallel for better performance)
            const fetchPromises = sourceDepartments.map(async (dept) => {
                const res = await fetchDepartmentEmployees(serverUrl, companyId, dept.id, {perPage: 10000});
                return {dept, res};
            });

            const results = await Promise.all(fetchPromises);
            if (!mounted.current) {
                return;
            }

            for (const {dept, res} of results) {
                const memberCount = res.data?.length || 0;
                debugLog('addMembers', `Dept ${dept.id} (${dept.name}): fetched ${memberCount} members`);
                if (res.data) {
                    for (const emp of res.data) {
                        // Skip if already in target department
                        if (targetMemberIds.has(emp.id)) {
                            continue;
                        }
                        // Use first encountered department as source
                        if (!memberMap.has(emp.id)) {
                            memberMap.set(emp.id, {
                                employee: emp,
                                sourceDepartmentId: dept.id,
                                sourceDepartmentName: dept.name,
                            });
                        }
                    }
                }
            }

            debugLog('addMembers', `Total unique members: ${memberMap.size}`);

            if (mounted.current) {
                setMembers(Array.from(memberMap.values()));
            }
        } catch (error) {
            if (mounted.current) {
                setMembers([]);
            }
        } finally {
            if (mounted.current) {
                setLoading(false);
            }
        }
    }, [companyId, effectiveTargetId, serverUrl, targetDepartmentId]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (effectiveTargetId != null || targetDepartmentId != null) {
            loadMembers();
        }
    }, [effectiveTargetId, loadMembers, targetDepartmentId]);

    // Filter by search text
    const filteredMembers = useMemo(() => {
        const trimmed = searchText.trim().toLowerCase();
        if (!trimmed) {
            return members;
        }
        return members.filter((m) => {
            const name = getContactListDisplayName(m.employee).toLowerCase();
            return name.includes(trimmed);
        });
    }, [members, searchText]);

    // Group by source department
    const groupedMembers = useMemo(() => {
        const groups = new Map<string, {departmentName: string; members: MemberWithSource[]}>();
        for (const m of filteredMembers) {
            const key = String(m.sourceDepartmentId);
            if (!groups.has(key)) {
                groups.set(key, {departmentName: m.sourceDepartmentName, members: []});
            }
            groups.get(key)!.members.push(m);
        }
        return Array.from(groups.entries()).map(([key, value]) => ({
            key,
            departmentName: value.departmentName,
            members: value.members,
        }));
    }, [filteredMembers]);

    const allFilteredIds = useMemo(
        () => filteredMembers.map((m) => m.employee.id),
        [filteredMembers],
    );

    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id));

    const toggleMember = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds((prev) => {
            if (allSelected) {
                // Deselect all filtered
                const next = new Set(prev);
                for (const id of allFilteredIds) {
                    next.delete(id);
                }
                return next;
            }
            // Select all filtered
            return new Set([...prev, ...allFilteredIds]);
        });
    }, [allFilteredIds, allSelected]);

    const handleConfirm = usePreventDoubleTap(useCallback(async () => {
        if (!serverUrl || selectedIds.size === 0 || effectiveTargetId == null) {
            return;
        }

        setMoving(true);

        // Group selected members by source department
        const bySource = new Map<number, string[]>();
        for (const m of members) {
            if (selectedIds.has(m.employee.id)) {
                const ids = bySource.get(m.sourceDepartmentId) ?? [];
                ids.push(m.employee.id);
                bySource.set(m.sourceDepartmentId, ids);
            }
        }

        let failed = 0;
        let total = 0;

        for (const [sourceDeptId, memberIds] of bySource.entries()) {
            total += memberIds.length;
            const res = await batchMoveContactEmployeeToDepartment(
                serverUrl,
                companyId,
                memberIds,
                sourceDeptId,
                effectiveTargetId,
            );
            if (res.error) {
                failed += memberIds.length;
            }
        }

        setMoving(false);

        if (!mounted.current) {
            return;
        }

        if (failed > 0) {
            Alert.alert(
                intl.formatMessage({id: 'contacts.add_member', defaultMessage: 'Add Member'}),
                intl.formatMessage(
                    {id: 'contacts.move_members_partial_failed', defaultMessage: '{failed} of {total} member(s) failed to move.'},
                    {failed, total},
                ),
            );
        }

        onSuccess();
    }, [companyId, effectiveTargetId, intl, members, onSuccess, selectedIds, serverUrl]));

    const renderSectionHeader = useCallback((deptName: string) => (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{deptName}</Text>
        </View>
    ), [styles.sectionHeader, styles.sectionHeaderText]);

    const renderMember = useCallback((m: MemberWithSource) => {
        const selected = selectedIds.has(m.employee.id);
        return (
            <TouchableOpacity
                key={m.employee.id}
                style={styles.listItem}
                onPress={() => toggleMember(m.employee.id)}
                activeOpacity={0.7}
                testID={`department_add_members.member.${m.employee.id}`}
            >
                <View style={[styles.checkbox, selected ? styles.checkboxSelected : styles.checkboxUnselected]}>
                    {selected && <CompassIcon name='check' size={14} color='#fff'/>}
                </View>
                <View style={styles.listItemAvatar}>
                    <ContactAvatar employee={m.employee} size={40}/>
                </View>
                <Text style={styles.listItemName} numberOfLines={1}>
                    {getContactListDisplayName(m.employee)}
                </Text>
            </TouchableOpacity>
        );
    }, [selectedIds, styles.checkbox, styles.checkboxSelected, styles.checkboxUnselected, styles.listItem, styles.listItemAvatar, styles.listItemName, toggleMember]);

    const flatListData = useMemo(() => {
        const items: Array<{type: 'header'; key: string; departmentName: string} | {type: 'member'; key: string; member: MemberWithSource}> = [];
        for (const group of groupedMembers) {
            items.push({type: 'header', key: `h-${group.key}`, departmentName: group.departmentName});
            for (const m of group.members) {
                items.push({type: 'member', key: `m-${m.employee.id}`, member: m});
            }
        }
        return items;
    }, [groupedMembers]);

    const renderItem = useCallback(({item}: {item: typeof flatListData[number]}) => {
        if (item.type === 'header') {
            return renderSectionHeader(item.departmentName);
        }
        return renderMember(item.member);
    }, [renderSectionHeader, renderMember]);

    const getKey = useCallback((item: typeof flatListData[number]) => item.key, []);

    return (
        <SafeAreaView
            edges={SAFE_AREA_EDGES}
            style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
            testID='department_add_members.screen'
        >
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerBack}
                    onPress={onBack}
                    testID='department_add_members.back'
                >
                    <CompassIcon name='arrow-left' size={24} color={theme.sidebarHeaderTextColor}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {intl.formatMessage({id: 'contacts.add_member', defaultMessage: 'Add Member'})}
                </Text>
                {members.length > 0 && selectedIds.size > 0 ? (
                    <TouchableOpacity
                        style={styles.headerConfirmBtn}
                        onPress={handleConfirm}
                        disabled={moving || effectiveTargetId == null}
                        testID='department_add_members.confirm'
                    >
                        <Text style={styles.headerConfirmText}>
                            {moving
                                ? intl.formatMessage({id: 'contacts.moving', defaultMessage: 'Moving...'})
                                : intl.formatMessage({id: 'common.confirm_with_count', defaultMessage: '确定({count})'}, {count: selectedIds.size})}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerPlaceholder}/>
                )}
            </View>
            {!loading && members.length === 0 ? (
                <View style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}>
                    <Text style={styles.emptyMessage}>
                        {intl.formatMessage({id: 'contacts.no_members_to_add', defaultMessage: '无成员可以添加'})}
                    </Text>
                </View>
            ) : (
                <>
                    <View style={styles.searchContainer}>
                        <TextInput
                            style={styles.searchInput}
                            placeholder={intl.formatMessage({id: 'contacts.search.nickname_placeholder', defaultMessage: '搜索昵称'})}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                            value={searchText}
                            onChangeText={setSearchText}
                            autoCapitalize='none'
                            autoCorrect={false}
                            testID='department_add_members.search'
                        />
                        {filteredMembers.length > 0 && (
                            <TouchableOpacity
                                style={styles.selectAllWrap}
                                onPress={toggleSelectAll}
                                testID='department_add_members.select_all'
                            >
                                <Text style={styles.selectAllText}>
                                    {allSelected
                                        ? intl.formatMessage({id: 'contacts.deselect_all', defaultMessage: 'Deselect all'})
                                        : intl.formatMessage({id: 'contacts.select_all', defaultMessage: 'Select all'})}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <Loading color={theme.centerChannelColor} size='small'/>
                        </View>
                    ) : filteredMembers.length === 0 ? (
                        <View style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}>
                            <Text style={styles.emptyMessage}>
                                {intl.formatMessage({id: 'contacts.no_members', defaultMessage: 'No members'})}
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            style={[styles.flex, {backgroundColor: theme.centerChannelBg}]}
                            contentContainerStyle={{paddingBottom: 24}}
                            data={flatListData}
                            renderItem={renderItem}
                            keyExtractor={getKey}
                            showsVerticalScrollIndicator={false}
                        />
                    )}
                </>
            )}
        </SafeAreaView>
    );
};

export default ContactsDepartmentAddMembersScreen;
