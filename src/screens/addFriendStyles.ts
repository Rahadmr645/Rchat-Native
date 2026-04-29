import { Platform, StyleSheet } from 'react-native';
import type { AppColorPalette } from '../theme/colors';

export function createAddFriendStyles(c: AppColorPalette, isDark: boolean) {
  const shadowCard =
    Platform.OS === 'ios'
      ? {
          shadowColor: '#0D3D36',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        }
      : { elevation: 3 };

  const heroBg = isDark ? c.cardBackground : '#fff';
  const screenBg = isDark ? c.listBackground : '#E8F3F0';
  const inputShellBg = isDark ? c.searchBarBackground : '#F4F8F7';
  const inputShellBorder = isDark ? c.divider : '#DCE8E5';
  const sectionMuted = isDark ? 'rgba(255,255,255,0.05)' : '#FAFCFB';
  const requestCardBg = isDark ? '#182229' : '#F6FAF9';
  const requestCardBorder = isDark ? c.divider : '#E0EBE8';
  const btnDeclineBg = isDark ? '#2A3942' : '#EDF0F2';
  const btnDeclinePressed = isDark ? '#3D4F5C' : '#E2E6EA';
  const emptyIconBg = isDark ? '#2A3942' : '#EEF2F1';

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: screenBg,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 36,
    },
    hero: {
      backgroundColor: heroBg,
      borderRadius: 20,
      padding: 20,
      overflow: 'hidden',
      ...shadowCard,
    },
    heroAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 5,
      backgroundColor: c.header,
      borderTopLeftRadius: 20,
      borderBottomLeftRadius: 20,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 18,
      paddingLeft: 8,
    },
    heroIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.header,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    heroTitles: {
      flex: 1,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: c.textPrimary,
      letterSpacing: -0.3,
    },
    heroSubtitle: {
      marginTop: 6,
      fontSize: 14,
      color: c.textSecondary,
      lineHeight: 20,
    },
    inputShell: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: inputShellBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: inputShellBorder,
      paddingHorizontal: 14,
      marginBottom: 16,
    },
    inputIcon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: c.textPrimary,
      paddingVertical: Platform.OS === 'ios' ? 14 : 12,
      paddingRight: 8,
    },
    sectionShell: {
      marginTop: 22,
      backgroundColor: heroBg,
      borderRadius: 20,
      paddingTop: 16,
      paddingHorizontal: 4,
      paddingBottom: 8,
      ...shadowCard,
    },
    sectionShellLast: {
      marginBottom: 8,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
    },
    sectionIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    sectionIconIncoming: {
      backgroundColor: 'rgba(18, 140, 126, 0.12)',
    },
    sectionIconOutgoing: {
      backgroundColor: 'rgba(90, 107, 122, 0.12)',
    },
    sectionHeaderText: {
      flex: 1,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textPrimary,
      letterSpacing: -0.2,
    },
    countBadge: {
      marginLeft: 10,
      minWidth: 26,
      height: 26,
      paddingHorizontal: 8,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadgeText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
    sectionSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: c.textSecondary,
    },
    sectionInner: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 12,
    },
    sectionInnerMuted: {
      backgroundColor: sectionMuted,
      marginHorizontal: 8,
      marginBottom: 8,
      borderRadius: 14,
      paddingTop: 8,
      paddingBottom: 12,
    },
    sectionSpinner: {
      paddingVertical: 28,
    },
    requestCard: {
      backgroundColor: requestCardBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: requestCardBorder,
      padding: 14,
      marginBottom: 10,
    },
    outgoingCard: {
      backgroundColor: c.cardBackground,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.divider,
      padding: 14,
      marginBottom: 10,
    },
    requestTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.header,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      overflow: 'hidden',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarLetter: {
      color: '#fff',
      fontSize: 20,
      fontWeight: '700',
    },
    requestBody: {
      flex: 1,
      minWidth: 0,
    },
    requestName: {
      fontSize: 17,
      fontWeight: '700',
      color: c.textPrimary,
    },
    requestEmail: {
      marginTop: 2,
      fontSize: 14,
      color: c.textSecondary,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: 'rgba(18, 140, 126, 0.1)',
      gap: 6,
    },
    pillOutgoing: {
      backgroundColor: 'rgba(90, 107, 122, 0.1)',
    },
    pillText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.headerDark,
    },
    pillTextOutgoing: {
      color: '#5A6B7A',
    },
    requestMeta: {
      fontSize: 12,
      color: c.textSecondary,
      marginLeft: 8,
      marginTop: 2,
    },
    requestActions: {
      flexDirection: 'row',
      marginTop: 14,
      gap: 10,
    },
    btnAccept: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.header,
      paddingVertical: 12,
      borderRadius: 12,
    },
    btnAcceptPressed: {
      opacity: 0.92,
    },
    btnIcon: {
      marginRight: 6,
    },
    btnAcceptLabel: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
    btnDecline: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: btnDeclineBg,
      paddingVertical: 12,
      borderRadius: 12,
    },
    btnDeclinePressed: {
      backgroundColor: btnDeclinePressed,
    },
    btnDeclineLabel: {
      color: c.textPrimary,
      fontWeight: '600',
      fontSize: 16,
    },
    btnDisabled: {
      opacity: 0.5,
    },
    btnCancelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
      paddingVertical: 10,
      gap: 8,
    },
    btnCancelLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textSecondary,
    },
    emptyBlock: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 16,
    },
    emptyIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: emptyIconBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textPrimary,
      textAlign: 'center',
    },
    emptyBody: {
      marginTop: 8,
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
      maxWidth: 280,
    },
  });
}
