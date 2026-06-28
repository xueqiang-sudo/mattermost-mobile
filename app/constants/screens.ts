// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import PLAYBOOKS_SCREENS from '@playbooks/constants/screens';

export const ABOUT = 'About';
export const ACCOUNT = 'Account';
export const ACCOUNT_MODAL = 'AccountModal';
export const AI_AGENT = 'AIAgent';
export const APP_UPDATE = 'AppUpdate';
export const APPS_FORM = 'AppForm';
export const BOTTOM_SHEET = 'BottomSheet';
export const BROWSE_CHANNELS = 'BrowseChannels';
export const CALL = 'Call';
export const CALL_PARTICIPANTS = 'CallParticipants';
export const CALL_HOST_CONTROLS = 'CallHostControls';
export const CHANNEL = 'Channel';
export const CHANNEL_ADD_MEMBERS = 'ChannelAddMembers';
export const CHANNEL_BANNER = 'ChannelBanner';
export const CHANNEL_BOOKMARK = 'ChannelBookmarkAddOrEdit';
export const CHANNEL_FILES = 'ChannelFiles';
export const CHANNEL_INFO = 'ChannelInfo';
export const CHANNEL_NOTIFICATION_PREFERENCES = 'ChannelNotificationPreferences';
export const CODE = 'Code';
export const CONVERT_GM_TO_CHANNEL = 'ConvertGMToChannel';
export const CREATE_DIRECT_MESSAGE = 'CreateDirectMessage';
export const CREATE_OR_EDIT_CHANNEL = 'CreateOrEditChannel';
export const CREATE_TEAM = 'CreateTeam';
export const JOIN_TEAM_QR = 'JoinTeamQR';
export const INVITE_USER_JOIN_TEAM = 'InviteUserJoinTeam';
export const COMPONENT_LIBRARY = 'ComponentLibrary';
/** 通讯录 Stack 内根屏路由名（底部 Tab 槽位见 `HOME_TAB_CONTACTS`） */
export const CONTACTS = 'Contacts';
export const CONTACTS_EMPLOYEE_LIST = 'ContactsEmployeeList';
export const CONTACTS_DEPARTMENT_DETAIL = 'ContactsDepartmentDetail';
export const CONTACTS_DEPARTMENT_BROWSE_FROM_PROFILE = 'ContactsDepartmentBrowseFromProfile';
export const CONTACTS_EMPLOYEE_PROFILE = 'ContactsEmployeeProfile';
export const CONTACTS_MANAGE = 'ContactsManage';
export const CONTACTS_SEARCH = 'ContactsSearch';
export const CONTACTS_BATCH_MOVE_MEMBERS = 'ContactsBatchMoveMembers';
export const TMP_DEV_TEST = 'TmpDevTest';
export const DEBUG_PANEL = 'DebugPanel';
export const CUSTOM_STATUS = 'CustomStatus';
export const CUSTOM_STATUS_CLEAR_AFTER = 'CustomStatusClearAfter';
export const DRAFT = 'Draft';
export const DRAFT_SCHEDULED_POST_OPTIONS = 'DraftScheduledPostOptions';
export const DRAFT_VIDEO_RECORDER = 'DraftVideoRecorder';
export const EDIT_POST = 'EditPost';
export const EDIT_CHANNEL_ANNOUNCEMENT = 'EditChannelAnnouncement';
export const EDIT_GROUP_NICKNAME = 'EditGroupNickname';
export const EDIT_GROUP_NAME = 'EditGroupName';
export const REMOVE_MEMBERS = 'RemoveMembers';
export const SEARCH_CHAT_HISTORY = 'SearchChatHistory';
export const EDIT_PROFILE = 'EditProfile';
export const EDIT_SERVER = 'EditServer';
export const EMOJI_PICKER = 'EmojiPicker';
export const EXTERNAL_PROFILE_CARD = 'ExternalProfileCard';
export const ADD_USER_TO_FRIENDS = 'AddUserToFriends';

// export const EXTERNAL_PROFILE_CARD_EDIT = 'ExternalProfileCardEdit';
export const EXTERNAL_PROFILE_CARD_EXTERNAL_INFO = 'ExternalProfileCardExternalInfo';
export const EXTERNAL_PROFILE_CARD_STYLE = 'ExternalProfileCardStyle';
export const FIND_CHANNELS = 'FindChannels';
export const JOINED_CHANNELS_AND_GROUPS = 'JoinedChannelsAndGroups';
export const FORGOT_PASSWORD = 'ForgotPassword';
export const GALLERY = 'Gallery';
export const GENERIC_OVERLAY = 'GenericOverlay';
export const GLOBAL_DRAFTS = 'GlobalDrafts';
export const GLOBAL_DRAFTS_AND_SCHEDULED_POSTS = 'GlobalDraftsAndScheduledPosts';
/** RNN 等使用的首页根屏 id；底部 Tab 槽位见 `HOME_TAB_*` */
export const HOME = 'Home';
/** 首页 `Tab.Navigator` 各槽位路由名（与 `HOME` RNN 根屏、各 Tab 内 Stack 业务屏区分） */
export const HOME_TAB_CHAT = 'HomeTabChat';
export const HOME_TAB_AI_AGENT = 'HomeTabAIAgent';
export const HOME_TAB_CONTACTS = 'HomeTabContacts';
export const HOME_TAB_ME = 'HomeTabMe';
export const INTEGRATION_SELECTOR = 'IntegrationSelector';
export const INTERACTIVE_DIALOG = 'InteractiveDialog';
export const INVITE = 'Invite';
export const IN_APP_NOTIFICATION = 'InAppNotification';
export const JOIN_TEAM = 'JoinTeam';
export const LATEX = 'Latex';
export const LOGIN = 'Login';
export const MANAGE_CHANNEL_MEMBERS = 'ManageChannelMembers';
export const MFA = 'MFA';
/** 我的主页 Stack 内根屏路由名（供应商/客户已迁移至通讯录 Stack） */
export const MY_HOMEPAGE = 'MyHomepage';
export const MY_SUPPLIERS = 'MySuppliers';
export const MY_CUSTOMERS = 'MyCustomers';
export const SUPPLIER_CUSTOMER_FORM = 'SupplierCustomerForm';
export const ONBOARDING = 'Onboarding';
export const PDF_VIEWER = 'PdfViewer';
export const PERMALINK = 'Permalink';
export const PINNED_MESSAGES = 'PinnedMessages';
export const POST_OPTIONS = 'PostOptions';
export const POST_PRIORITY_PICKER = 'PostPriorityPicker';
export const QR_SCANNER = 'QRScanner';
export const REACTIONS = 'Reactions';
export const REPORT_PROBLEM = 'ReportProblem';
export const RESCHEDULE_DRAFT = 'RescheduleDraft';
export const REVIEW_APP = 'ReviewApp';
export const SCHEDULED_POST_OPTIONS = 'ScheduledPostOptions';
export const SELECT_TEAM = 'SelectTeam';
export const SERVER = 'Server';
export const SETTINGS = 'Settings';
export const SETTINGS_ADVANCED = 'SettingsAdvanced';
export const SETTINGS_DISPLAY = 'SettingsDisplay';
export const SETTINGS_DISPLAY_CLOCK = 'SettingsDisplayClock';
export const SETTINGS_DISPLAY_THEME = 'SettingsDisplayTheme';
export const SETTINGS_DISPLAY_TIMEZONE = 'SettingsDisplayTimezone';
export const SETTINGS_DISPLAY_TIMEZONE_SELECT = 'SettingsDisplayTimezoneSelect';
export const SETTINGS_DISPLAY_LANGUAGE = 'SettingsDisplayLanguage';
export const SETTINGS_NOTIFICATION = 'SettingsNotification';
export const SETTINGS_NOTIFICATION_AUTO_RESPONDER = 'SettingsNotificationAutoResponder';
export const SETTINGS_NOTIFICATION_EMAIL = 'SettingsNotificationEmail';
export const SETTINGS_NOTIFICATION_MENTION = 'SettingsNotificationMention';
export const SETTINGS_NOTIFICATION_PUSH = 'SettingsNotificationPush';
export const SETTINGS_NOTIFICATION_CALL = 'SettingsNotificationCall';
export const MANAGE_ENTERPRISE = 'ManageEnterprise';
export const MANAGE_ENTERPRISE_DETAIL = 'ManageEnterpriseDetail';
export const SHARE_FEEDBACK = 'ShareFeedback';
export const SNACK_BAR = 'SnackBar';
export const SSO = 'SSO';
export const STARTUP_LOADING = 'StartupLoading';
export const TABLE = 'Table';
export const TEAM_SELECTOR_LIST = 'TeamSelectorList';
export const TERMS_OF_SERVICE = 'TermsOfService';
export const LAUNCH_AGREEMENT = 'LaunchAgreement';

/** Channel list threads tab id for Events.ACTIVE_SCREEN (not a standalone RNN screen in this fork). */
export const THREAD = 'Thread';
export const USER_PROFILE = 'UserProfile';

export default {
    ABOUT,
    ACCOUNT,
    ACCOUNT_MODAL,
    AI_AGENT,
    APP_UPDATE,
    APPS_FORM,
    BOTTOM_SHEET,
    BROWSE_CHANNELS,
    CALL,
    CALL_PARTICIPANTS,
    CALL_HOST_CONTROLS,
    CHANNEL,
    CHANNEL_ADD_MEMBERS,
    CHANNEL_BANNER,
    CHANNEL_BOOKMARK,
    CHANNEL_FILES,
    CHANNEL_INFO,
    CHANNEL_NOTIFICATION_PREFERENCES,
    CODE,
    CONVERT_GM_TO_CHANNEL,
    COMPONENT_LIBRARY,
    CONTACTS,
    CONTACTS_EMPLOYEE_LIST,
    CONTACTS_DEPARTMENT_DETAIL,
    CONTACTS_DEPARTMENT_BROWSE_FROM_PROFILE,
    CONTACTS_EMPLOYEE_PROFILE,
    CONTACTS_MANAGE,
    CONTACTS_SEARCH,
    CONTACTS_BATCH_MOVE_MEMBERS,
    TMP_DEV_TEST,
    DEBUG_PANEL,
    CREATE_DIRECT_MESSAGE,
    CREATE_OR_EDIT_CHANNEL,
    CREATE_TEAM,
    JOIN_TEAM_QR,
    INVITE_USER_JOIN_TEAM,
    CUSTOM_STATUS,
    CUSTOM_STATUS_CLEAR_AFTER,
    DRAFT_SCHEDULED_POST_OPTIONS,
    DRAFT_VIDEO_RECORDER,
    EDIT_POST,
    EDIT_CHANNEL_ANNOUNCEMENT,
    EDIT_GROUP_NICKNAME,
    EDIT_GROUP_NAME,
    REMOVE_MEMBERS,
    SEARCH_CHAT_HISTORY,
    EDIT_PROFILE,
    EDIT_SERVER,
    EMOJI_PICKER,
    EXTERNAL_PROFILE_CARD,
    ADD_USER_TO_FRIENDS,

    // EXTERNAL_PROFILE_CARD_EDIT,
    EXTERNAL_PROFILE_CARD_EXTERNAL_INFO,
    EXTERNAL_PROFILE_CARD_STYLE,
    FIND_CHANNELS,
    JOINED_CHANNELS_AND_GROUPS,
    FORGOT_PASSWORD,
    GALLERY,
    GENERIC_OVERLAY,
    GLOBAL_DRAFTS,
    GLOBAL_DRAFTS_AND_SCHEDULED_POSTS,
    HOME,
    HOME_TAB_AI_AGENT,
    HOME_TAB_CHAT,
    HOME_TAB_CONTACTS,
    HOME_TAB_ME,
    INTEGRATION_SELECTOR,
    INTERACTIVE_DIALOG,
    INVITE,
    IN_APP_NOTIFICATION,
    JOIN_TEAM,
    LATEX,
    LOGIN,
    MANAGE_CHANNEL_MEMBERS,
    MFA,
    MY_HOMEPAGE,
    MY_SUPPLIERS,
    MY_CUSTOMERS,
    SUPPLIER_CUSTOMER_FORM,
    ONBOARDING,
    PDF_VIEWER,
    PERMALINK,
    PINNED_MESSAGES,
    POST_OPTIONS,
    POST_PRIORITY_PICKER,
    QR_SCANNER,
    REACTIONS,
    REPORT_PROBLEM,
    RESCHEDULE_DRAFT,
    REVIEW_APP,
    SCHEDULED_POST_OPTIONS,
    SELECT_TEAM,
    SERVER,
    SETTINGS,
    SETTINGS_ADVANCED,
    SETTINGS_DISPLAY,
    SETTINGS_DISPLAY_CLOCK,
    SETTINGS_DISPLAY_THEME,
    SETTINGS_DISPLAY_TIMEZONE,
    SETTINGS_DISPLAY_TIMEZONE_SELECT,
    SETTINGS_DISPLAY_LANGUAGE,
    SETTINGS_NOTIFICATION,
    SETTINGS_NOTIFICATION_AUTO_RESPONDER,
    SETTINGS_NOTIFICATION_EMAIL,
    SETTINGS_NOTIFICATION_MENTION,
    SETTINGS_NOTIFICATION_PUSH,
    SETTINGS_NOTIFICATION_CALL,
    MANAGE_ENTERPRISE,
    MANAGE_ENTERPRISE_DETAIL,
    SHARE_FEEDBACK,
    SNACK_BAR,
    SSO,
    STARTUP_LOADING,
    TABLE,
    TEAM_SELECTOR_LIST,
    TERMS_OF_SERVICE,
    LAUNCH_AGREEMENT,
    THREAD,
    USER_PROFILE,
    ...PLAYBOOKS_SCREENS,
} as const;

export const MODAL_SCREENS_WITHOUT_BACK = new Set<string>([
    BROWSE_CHANNELS,
    CHANNEL_INFO,
    CHANNEL_ADD_MEMBERS,
    CREATE_DIRECT_MESSAGE,
    CREATE_TEAM,
    CUSTOM_STATUS,
    EDIT_POST,
    EDIT_CHANNEL_ANNOUNCEMENT,
    EDIT_PROFILE,
    EDIT_SERVER,
    FIND_CHANNELS,
    GALLERY,
    INVITE,
    MANAGE_CHANNEL_MEMBERS,
    PDF_VIEWER,
    PERMALINK,
    RESCHEDULE_DRAFT,
]);

export const SCREENS_WITH_TRANSPARENT_BACKGROUND = new Set<string>([
    APP_UPDATE,
    PERMALINK,
    REVIEW_APP,
    SNACK_BAR,
    GENERIC_OVERLAY,
]);

export const SCREENS_AS_BOTTOM_SHEET = new Set<string>([
    BOTTOM_SHEET,
    DRAFT_SCHEDULED_POST_OPTIONS,
    EMOJI_PICKER,
    POST_OPTIONS,
    POST_PRIORITY_PICKER,
    REACTIONS,
    USER_PROFILE,
    CALL_PARTICIPANTS,
    CALL_HOST_CONTROLS,
    SCHEDULED_POST_OPTIONS,
]);

export const SCREENS_WITH_EXTRA_KEYBOARD = new Set<string>([CHANNEL]);

export const NOT_READY: string[] = [];
