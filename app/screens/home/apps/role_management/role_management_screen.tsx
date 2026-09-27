// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    fetchBusinessRoleDefs,
    createBusinessRoleDef,
    updateBusinessRoleDef,
    deleteBusinessRoleDef,
    getWorkbenchPermissions,
    saveRolePermission,
    type BusinessRoleDef,
    type WorkbenchPermissions,
} from '../api';

// ---- Permission Config Items ----

type ConfigItem = {
    key: string;
    labelId: string;
    defaultLabel: string;
    isFlag?: boolean;
    parentFlag?: string;
};

const CONFIG_ITEMS: ConfigItem[] = [
    {key: 'hotproducts', labelId: 'workbench.tab.hot_products', defaultLabel: '热销榜'},
    {key: 'approvals', labelId: 'workbench.tab.approvals', defaultLabel: '审批清单'},
    {key: 'finance', labelId: 'workbench.tab.finance', defaultLabel: '流水账'},
    {key: 'sales', labelId: 'workbench.tab.sales', defaultLabel: '销售统计'},
    {key: 'inventory', labelId: 'workbench.tab.inventory', defaultLabel: '库存分析'},
    {key: 'conversations', labelId: 'workbench.tab.conversations', defaultLabel: '会话查询'},
    {key: 'price_list', labelId: 'workbench.tab.price_list', defaultLabel: '价格表'},
    {key: 'mes_enabled', labelId: 'workbench.flag.mes_enabled', defaultLabel: '启动MES功能', isFlag: true},
    {key: 'mes_create_plan', labelId: 'workbench.tab.mes_create_plan', defaultLabel: '创建/删除排产计划', parentFlag: 'mes_enabled'},
    {key: 'mes_view_plan', labelId: 'workbench.tab.mes_view_plan', defaultLabel: '查看排产计划', parentFlag: 'mes_enabled'},
    {key: 'mes_create_line_info', labelId: 'workbench.tab.mes_create_line_info', defaultLabel: '创建产线信息', parentFlag: 'mes_enabled'},
    {key: 'cloud_drive', labelId: 'workbench.tab.cloud_drive', defaultLabel: '云盘'},
    {key: 'drive_write', labelId: 'workbench.permissions.drive_write', defaultLabel: '云盘写入', isFlag: true, parentFlag: 'cloud_drive'},
    {key: 'knowledge_base', labelId: 'workbench.tab.knowledge_base', defaultLabel: '知识库'},
    {key: 'kb_write', labelId: 'workbench.permissions.kb_write', defaultLabel: '知识库写入', isFlag: true, parentFlag: 'knowledge_base'},
    {key: 'account_switch', labelId: 'workbench.permissions.account_switch', defaultLabel: '多账号切换'},
    {key: 'contact_edit', labelId: 'workbench.permissions.contact_edit', defaultLabel: '增删改外部联系人'},
    {key: 'contact_scope_department', labelId: 'workbench.permissions.contact_scope_department', defaultLabel: '查看同部门外部联系人', isFlag: true},
    {key: 'contact_scope_sub_department', labelId: 'workbench.permissions.contact_scope_sub_department', defaultLabel: '查看下级部门外部联系人', isFlag: true},
    {key: 'contact_scope_all', labelId: 'workbench.permissions.contact_scope_all', defaultLabel: '查看所有外部联系人', isFlag: true},
];

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    tabTextActive: {
        color: theme.buttonBg,
    },
    content: {
        flex: 1,
    },
    // Role Management
    createBox: {
        flexDirection: 'row',
        padding: 12,
        gap: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    createInput: {
        flex: 1,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    createBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
        paddingHorizontal: 16,
        paddingVertical: 8,
        justifyContent: 'center',
    },
    createBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 75, 'SemiBold'),
    },
    createBtnDisabled: {
        opacity: 0.5,
    },
    duplicateHint: {
        ...typography('Body', 50),
        color: theme.errorTextColor,
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    tableHeader: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    tableHeaderText: {
        ...typography('Body', 50, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    colName: {
        flex: 1,
    },
    colActions: {
        width: 80,
        alignItems: 'flex-end',
    },
    roleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    roleName: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        flex: 1,
    },
    systemBadge: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginLeft: 8,
    },
    systemBadgeText: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    actionBtns: {
        flexDirection: 'row',
        gap: 8,
    },
    actionBtn: {
        padding: 4,
    },
    editInput: {
        flex: 1,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.buttonBg,
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    errorText: {
        ...typography('Body', 75),
        color: theme.errorTextColor,
        padding: 12,
        backgroundColor: changeOpacity(theme.errorTextColor, 0.08),
    },
    // Permission Management
    selectorBox: {
        padding: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    selectorLabel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 4,
    },
    selectorBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    selectorBtnText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        flex: 1,
    },
    dropdown: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 4,
        marginTop: 4,
        maxHeight: 200,
        backgroundColor: theme.centerChannelBg,
    },
    dropdownItem: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    dropdownItemText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
    },
    dropdownItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    permList: {
        paddingVertical: 8,
    },
    permItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    permItemChild: {
        paddingLeft: 32,
    },
    permLabel: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        flex: 1,
    },
    permLabelDisabled: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
    saveBox: {
        padding: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    saveBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
        paddingVertical: 12,
        alignItems: 'center',
    },
    saveBtnDisabled: {
        opacity: 0.5,
    },
    saveBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    successMsg: {
        ...typography('Body', 75),
        color: '#2ea043',
        textAlign: 'center',
        paddingVertical: 4,
    },
}));

// ---- Main Screen ----

const RoleManagementScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [teamId, setTeamId] = useState('');
    const [loading, setLoading] = useState(true);

    // Tab
    const [activeTab, setActiveTab] = useState<'roles' | 'permissions'>('roles');

    // Role Management state
    const [roles, setRoles] = useState<BusinessRoleDef[]>([]);
    const [newRoleName, setNewRoleName] = useState('');
    const [savingCreate, setSavingCreate] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Permission Management state
    const [perms, setPerms] = useState<WorkbenchPermissions | null>(null);
    const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [editingTabs, setEditingTabs] = useState<Set<string>>(new Set());
    const [editingFlags, setEditingFlags] = useState<Record<string, boolean>>({});
    const [dirty, setDirty] = useState(false);
    const [savingPerms, setSavingPerms] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Init
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const tid = await getCurrentTeamId(database);
                setTeamId(tid);
            } catch {
                // ignore
            }
        };
        init();
    }, [serverUrl]);

    // Load roles
    const loadRoles = useCallback(async () => {
        if (!teamId) return;
        setLoading(true);
        setError(null);
        try {
            const defs = await fetchBusinessRoleDefs(serverUrl, teamId);
            setRoles(defs);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [serverUrl, teamId]);

    // Load permissions
    const loadPermissions = useCallback(async () => {
        if (!teamId) return;
        try {
            const [permsData, defs] = await Promise.all([
                getWorkbenchPermissions(serverUrl, teamId),
                fetchBusinessRoleDefs(serverUrl, teamId),
            ]);
            setPerms(permsData);
            if (!permsData.role_tab_permissions) {
                permsData.role_tab_permissions = {};
            }
            setRoles(defs);
            if (defs.length > 0 && !selectedRoleKey) {
                setSelectedRoleKey(defs[0].role_key);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [serverUrl, teamId, selectedRoleKey]);

    useEffect(() => {
        if (activeTab === 'roles') {
            loadRoles();
        } else {
            loadPermissions();
        }
    }, [activeTab, loadRoles, loadPermissions]);

    // Sorted roles: system first
    const sortedRoles = useMemo(() => {
        return [...roles].sort((a, b) => {
            const aSystem = (a.role_key === 'admin' || a.source === 'system') ? 0 : 1;
            const bSystem = (b.role_key === 'admin' || b.source === 'system') ? 0 : 1;
            return aSystem - bSystem;
        });
    }, [roles]);

    // Selected role
    const selectedRole = useMemo(() => {
        return roles.find((r) => r.role_key === selectedRoleKey) || null;
    }, [roles, selectedRoleKey]);

    const isAdminRole = selectedRole?.role_key === 'admin' || selectedRole?.source === 'system';

    // Load role permissions into editing state
    useEffect(() => {
        if (!selectedRole || !perms) return;
        const rolePerm = perms.role_tab_permissions[selectedRole.role_key];
        if (rolePerm) {
            setEditingTabs(new Set(rolePerm.tabs));
            setEditingFlags(rolePerm.flags ? {...rolePerm.flags} : {});
        } else if (isAdminRole) {
            const allTabs = new Set<string>();
            const allFlags: Record<string, boolean> = {};
            for (const item of CONFIG_ITEMS) {
                if (item.isFlag) {
                    allFlags[item.key] = true;
                } else {
                    allTabs.add(item.key);
                }
            }
            setEditingTabs(allTabs);
            setEditingFlags(allFlags);
        } else {
            setEditingTabs(new Set());
            setEditingFlags({});
        }
        setDirty(false);
    }, [selectedRole, perms, isAdminRole]);

    // ---- Role Management handlers ----

    const handleCreateRole = useCallback(async () => {
        const name = newRoleName.trim();
        if (!name) return;
        if (roles.some((r) => r.role_name.toLowerCase() === name.toLowerCase())) {
            setError(intl.formatMessage({id: 'role_management.duplicate_name', defaultMessage: '角色名称已存在'}));
            return;
        }
        setSavingCreate(true);
        setError(null);
        try {
            const def = await createBusinessRoleDef(serverUrl, teamId, name);
            setRoles((prev) => [...prev, def]);
            setNewRoleName('');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSavingCreate(false);
        }
    }, [serverUrl, teamId, newRoleName, roles, intl]);

    const startEdit = useCallback((role: BusinessRoleDef) => {
        setEditingKey(role.role_key);
        setEditName(role.role_name);
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingKey(null);
        setEditName('');
    }, []);

    const handleSaveEdit = useCallback(async () => {
        if (!editingKey) return;
        const name = editName.trim();
        if (!name) return;
        if (roles.some((r) => r.role_key !== editingKey && r.role_name.toLowerCase() === name.toLowerCase())) {
            setError(intl.formatMessage({id: 'role_management.duplicate_name', defaultMessage: '角色名称已存在'}));
            return;
        }
        setSavingEdit(true);
        setError(null);
        try {
            const def = await updateBusinessRoleDef(serverUrl, teamId, editingKey, name);
            setRoles((prev) => prev.map((r) => (r.role_key === editingKey ? def : r)));
            setEditingKey(null);
            setEditName('');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSavingEdit(false);
        }
    }, [serverUrl, teamId, editingKey, editName, roles, intl]);

    const handleDeleteRole = useCallback((role: BusinessRoleDef) => {
        const msg = intl.formatMessage(
            {id: 'role_management.delete_confirm', defaultMessage: '确定删除角色「{name}」吗？'},
            {name: role.role_name},
        );
        Alert.alert('', msg, [
            {text: intl.formatMessage({id: 'role_management.cancel', defaultMessage: '取消'}), style: 'cancel'},
            {
                text: intl.formatMessage({id: 'role_management.delete', defaultMessage: '删除'}),
                style: 'destructive',
                onPress: async () => {
                    setError(null);
                    try {
                        await deleteBusinessRoleDef(serverUrl, teamId, role.role_key);
                        setRoles((prev) => prev.filter((r) => r.role_key !== role.role_key));
                    } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                    }
                },
            },
        ]);
    }, [serverUrl, teamId, intl]);

    const isSystemRole = (role: BusinessRoleDef) => role.role_key === 'admin' || role.source === 'system';

    // ---- Permission Management handlers ----

    const togglePermission = useCallback((key: string, isFlag: boolean) => {
        if (isFlag) {
            setEditingFlags((prev) => ({...prev, [key]: !prev[key]}));
        } else {
            setEditingTabs((prev) => {
                const next = new Set(prev);
                if (next.has(key)) {
                    next.delete(key);
                } else {
                    next.add(key);
                }
                return next;
            });
        }
        setDirty(true);
        setSuccessMsg(null);
    }, []);

    const isPermissionEnabled = useCallback((item: ConfigItem): boolean => {
        if (item.isFlag) {
            return editingFlags[item.key] === true;
        }
        return editingTabs.has(item.key);
    }, [editingTabs, editingFlags]);

    const isPermissionDisabled = useCallback((item: ConfigItem): boolean => {
        if (item.parentFlag) {
            const parent = CONFIG_ITEMS.find((c) => c.key === item.parentFlag);
            if (parent && !isPermissionEnabled(parent)) {
                return true;
            }
        }
        return false;
    }, [isPermissionEnabled]);

    const handleSavePermissions = useCallback(async () => {
        if (!selectedRoleKey) return;
        setSavingPerms(true);
        setError(null);
        setSuccessMsg(null);
        try {
            const tabs = Array.from(editingTabs);
            const flags = editingFlags;
            await saveRolePermission(serverUrl, teamId, selectedRoleKey, tabs, flags);
            setDirty(false);
            setSuccessMsg(intl.formatMessage({id: 'role_management.saved', defaultMessage: '保存成功'}));
            // Reload permissions
            const permsData = await getWorkbenchPermissions(serverUrl, teamId);
            setPerms(permsData);
            setTimeout(() => setSuccessMsg(null), 3000);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSavingPerms(false);
        }
    }, [serverUrl, teamId, selectedRoleKey, editingTabs, editingFlags, intl]);

    // ---- Render ----

    if (loading && !perms) {
        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={style.header}>
                    <Text style={style.headerTitle}>
                        {intl.formatMessage({id: 'role_management.title', defaultMessage: '角色管理'})}
                    </Text>
                </View>
                <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
                    <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Header */}
            <View style={style.header}>
                <Text style={style.headerTitle}>
                    {intl.formatMessage({id: 'role_management.title', defaultMessage: '角色管理'})}
                </Text>
            </View>

            {/* Tab bar */}
            <View style={style.tabBar}>
                <TouchableOpacity
                    style={[style.tab, activeTab === 'roles' && style.tabActive]}
                    onPress={() => setActiveTab('roles')}
                >
                    <Text style={[style.tabText, activeTab === 'roles' && style.tabTextActive]}>
                        {intl.formatMessage({id: 'role_management.tab_roles', defaultMessage: '角色管理'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[style.tab, activeTab === 'permissions' && style.tabActive]}
                    onPress={() => setActiveTab('permissions')}
                >
                    <Text style={[style.tabText, activeTab === 'permissions' && style.tabTextActive]}>
                        {intl.formatMessage({id: 'role_management.tab_permissions', defaultMessage: '权限管理'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={style.content}>
                {error && <Text style={style.errorText}>{error}</Text>}

                {activeTab === 'roles' && (
                    <ScrollView>
                        {/* Create box */}
                        <View style={style.createBox}>
                            <TextInput
                                style={style.createInput}
                                value={newRoleName}
                                onChangeText={setNewRoleName}
                                placeholder={intl.formatMessage({id: 'role_management.create_placeholder', defaultMessage: '输入角色名称...'})}
                                returnKeyType='done'
                                onSubmitEditing={handleCreateRole}
                            />
                            <TouchableOpacity
                                style={[style.createBtn, (savingCreate || !newRoleName.trim() || roles.some((r) => r.role_name.toLowerCase() === newRoleName.trim().toLowerCase())) && style.createBtnDisabled]}
                                onPress={handleCreateRole}
                                disabled={savingCreate || !newRoleName.trim() || roles.some((r) => r.role_name.toLowerCase() === newRoleName.trim().toLowerCase())}
                            >
                                <Text style={style.createBtnText}>
                                    {savingCreate ? '...' : intl.formatMessage({id: 'role_management.create', defaultMessage: '新建角色'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        {newRoleName.trim() && roles.some((r) => r.role_name.toLowerCase() === newRoleName.trim().toLowerCase()) && (
                            <Text style={style.duplicateHint}>
                                {intl.formatMessage({id: 'role_management.duplicate_name', defaultMessage: '角色名称已存在'})}
                            </Text>
                        )}

                        {/* Table header */}
                        <View style={style.tableHeader}>
                            <Text style={[style.tableHeaderText, style.colName]}>
                                {intl.formatMessage({id: 'role_management.col_name', defaultMessage: '角色名称'})}
                            </Text>
                            <Text style={[style.tableHeaderText, style.colActions]}>
                                {intl.formatMessage({id: 'role_management.col_actions', defaultMessage: '操作'})}
                            </Text>
                        </View>

                        {/* Role rows */}
                        {sortedRoles.map((role) => {
                            const isEditing = editingKey === role.role_key;
                            const systemRole = isSystemRole(role);
                            return (
                                <View key={role.id} style={style.roleRow}>
                                    {isEditing ? (
                                        <TextInput
                                            style={style.editInput}
                                            value={editName}
                                            onChangeText={setEditName}
                                            autoFocus={true}
                                            returnKeyType='done'
                                            onSubmitEditing={handleSaveEdit}
                                        />
                                    ) : (
                                        <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
                                            <Text style={style.roleName}>{role.role_name}</Text>
                                            {systemRole && (
                                                <View style={style.systemBadge}>
                                                    <Text style={style.systemBadgeText}>
                                                        {intl.formatMessage({id: 'role_management.system_badge', defaultMessage: '系统'})}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                    <View style={style.actionBtns}>
                                        {isEditing ? (
                                            <>
                                                <TouchableOpacity style={style.actionBtn} onPress={handleSaveEdit} disabled={savingEdit || !editName.trim()}>
                                                    <CompassIcon name='check' size={20} color={theme.buttonBg}/>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={style.actionBtn} onPress={cancelEdit} disabled={savingEdit}>
                                                    <CompassIcon name='close' size={20} color={theme.centerChannelColor}/>
                                                </TouchableOpacity>
                                            </>
                                        ) : !systemRole && (
                                            <>
                                                <TouchableOpacity style={style.actionBtn} onPress={() => startEdit(role)}>
                                                    <CompassIcon name='pencil-outline' size={18} color={theme.centerChannelColor}/>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={style.actionBtn} onPress={() => handleDeleteRole(role)}>
                                                    <CompassIcon name='trash-can-outline' size={18} color={theme.errorTextColor}/>
                                                </TouchableOpacity>
                                            </>
                                        )}
                                    </View>
                                </View>
                            );
                        })}

                        {roles.length === 0 && (
                            <Text style={style.emptyText}>
                                {intl.formatMessage({id: 'role_management.empty', defaultMessage: '暂无角色，点击"新建角色"创建第一个角色。'})}
                            </Text>
                        )}
                    </ScrollView>
                )}

                {activeTab === 'permissions' && (
                    <View style={{flex: 1}}>
                        {/* Role selector */}
                        <View style={style.selectorBox}>
                            <Text style={style.selectorLabel}>
                                {intl.formatMessage({id: 'role_management.select_role', defaultMessage: '选择角色'})}
                            </Text>
                            <TouchableOpacity style={style.selectorBtn} onPress={() => setDropdownOpen(!dropdownOpen)}>
                                <Text style={style.selectorBtnText}>
                                    {selectedRole?.role_name || intl.formatMessage({id: 'role_management.select_role', defaultMessage: '选择角色'})}
                                </Text>
                                <CompassIcon name={dropdownOpen ? 'menu-up' : 'menu-down'} size={20} color={theme.centerChannelColor}/>
                            </TouchableOpacity>
                            {dropdownOpen && (
                                <ScrollView style={style.dropdown}>
                                    {sortedRoles.map((role) => (
                                        <TouchableOpacity
                                            key={role.id}
                                            style={[style.dropdownItem, selectedRoleKey === role.role_key && style.dropdownItemSelected]}
                                            onPress={() => {
                                                setSelectedRoleKey(role.role_key);
                                                setDropdownOpen(false);
                                            }}
                                        >
                                            <Text style={style.dropdownItemText}>{role.role_name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}
                        </View>

                        {/* Permission list */}
                        {selectedRole && (
                            <ScrollView style={style.permList}>
                                {CONFIG_ITEMS.map((item) => {
                                    const enabled = isPermissionEnabled(item);
                                    const disabled = isPermissionDisabled(item);
                                    const isChild = Boolean(item.parentFlag);
                                    return (
                                        <View key={item.key} style={[style.permItem, isChild && style.permItemChild]}>
                                            <Text style={[style.permLabel, disabled && style.permLabelDisabled]}>
                                                {intl.formatMessage({id: item.labelId, defaultMessage: item.defaultLabel})}
                                            </Text>
                                            <Switch
                                                value={enabled}
                                                onValueChange={() => !disabled && togglePermission(item.key, item.isFlag === true)}
                                                disabled={disabled || isAdminRole}
                                            />
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        )}

                        {/* Save button */}
                        {selectedRole && !isAdminRole && (
                            <View style={style.saveBox}>
                                {successMsg && <Text style={style.successMsg}>{successMsg}</Text>}
                                <TouchableOpacity
                                    style={[style.saveBtn, (!dirty || savingPerms) && style.saveBtnDisabled]}
                                    onPress={handleSavePermissions}
                                    disabled={!dirty || savingPerms}
                                >
                                    <Text style={style.saveBtnText}>
                                        {savingPerms ? '...' : intl.formatMessage({id: 'role_management.save', defaultMessage: '保存'})}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
};

export default RoleManagementScreen;
