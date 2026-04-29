/** Shared shape for light/dark app chrome (lists, settings, auth, tab bar). */
export type AppColorPalette = {
  header: string;
  headerDark: string;
  accent: string;
  outgoingBubble: string;
  incomingBubble: string;
  chatBackground: string;
  listBackground: string;
  textPrimary: string;
  textSecondary: string;
  divider: string;
  unreadBadge: string;
  tabInactive: string;
  inputBackground: string;
  iconTint: string;
  tabBarBackground: string;
  authScreenBg: string;
  cardBackground: string;
  rowPressedBackground: string;
  searchBarBackground: string;
  listAvatarPlaceholderBg: string;
  tonalBannerBg: string;
  authLogoWrapBg: string;
};

export const lightColors: AppColorPalette = {
  header: '#128C7E',
  headerDark: '#075E54',
  accent: '#25D366',
  outgoingBubble: '#DCF8C6',
  incomingBubble: '#FFFFFF',
  chatBackground: '#ECE5DD',
  listBackground: '#FFFFFF',
  textPrimary: '#111111',
  textSecondary: '#667781',
  divider: '#E9EDEF',
  unreadBadge: '#25D366',
  tabInactive: '#8596A0',
  inputBackground: '#FFFFFF',
  iconTint: '#FFFFFF',
  tabBarBackground: '#F7F8FA',
  authScreenBg: '#E8F5F2',
  cardBackground: '#FFFFFF',
  rowPressedBackground: '#F5F6F6',
  searchBarBackground: '#F0F2F5',
  listAvatarPlaceholderBg: '#DFE5E7',
  tonalBannerBg: '#E8F4F1',
  authLogoWrapBg: '#FFFFFF',
};

export const darkColors: AppColorPalette = {
  header: '#128C7E',
  headerDark: '#075E54',
  accent: '#25D366',
  outgoingBubble: '#005C4B',
  incomingBubble: '#202C33',
  chatBackground: '#0B141A',
  listBackground: '#0B141A',
  textPrimary: '#E9EDEF',
  textSecondary: '#8696A0',
  divider: '#2A3942',
  unreadBadge: '#25D366',
  tabInactive: '#8696A0',
  inputBackground: '#2A3942',
  iconTint: '#FFFFFF',
  tabBarBackground: '#1F2C34',
  authScreenBg: '#0B141A',
  cardBackground: '#111B21',
  rowPressedBackground: 'rgba(255,255,255,0.06)',
  searchBarBackground: '#2A3942',
  listAvatarPlaceholderBg: '#3B4A54',
  tonalBannerBg: '#1A2630',
  authLogoWrapBg: '#202C33',
};
