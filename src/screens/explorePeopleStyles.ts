import { Platform, StyleSheet } from 'react-native';
import type { AppColorPalette } from '../theme/colors';

export function createExplorePeopleStyles(c: AppColorPalette, isDark: boolean) {
  const searchBg = isDark ? c.searchBarBackground : '#F0F4F3';
  const btnAddBg = isDark ? c.cardBackground : '#fff';
  const emptyIconBg = isDark ? '#2A3942' : '#EEF2F1';

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.listBackground,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.listBackground,
    },
    loadingHint: {
      marginTop: 12,
      fontSize: 15,
      color: c.textSecondary,
    },
    searchShell: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      paddingHorizontal: 12,
      backgroundColor: searchBg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.divider,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: c.textPrimary,
      paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    listEmpty: {
      flexGrow: 1,
      paddingHorizontal: 24,
      justifyContent: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
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
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    rowName: {
      fontSize: 16,
      fontWeight: '700',
      color: c.textPrimary,
    },
    rowEmail: {
      marginTop: 2,
      fontSize: 14,
      color: c.textSecondary,
    },
    pillMuted: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: 'rgba(18, 140, 126, 0.1)',
    },
    pillMutedText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.headerDark,
    },
    pillSecondary: {
      color: c.textSecondary,
    },
    btnAdd: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: c.header,
      backgroundColor: btnAddBg,
    },
    btnAddPressed: {
      backgroundColor: 'rgba(18, 140, 126, 0.08)',
    },
    btnAddLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: c.header,
    },
    btnAcceptSmall: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 22,
      backgroundColor: c.header,
      minWidth: 96,
      justifyContent: 'center',
    },
    btnAcceptSmallPressed: {
      opacity: 0.9,
    },
    btnAcceptSmallLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
    btnDisabled: {
      opacity: 0.45,
    },
    emptyWrap: {
      alignItems: 'center',
      paddingVertical: 48,
    },
    emptyIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: emptyIconBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
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
