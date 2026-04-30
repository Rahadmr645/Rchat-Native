/**
 * Merges env into Expo config so release builds get API URL + EAS project ID
 * without relying only on Metro-inlined EXPO_PUBLIC_* (EAS injects EAS_PROJECT_ID).
 */
function nonempty(s) {
  if (s == null || typeof s !== 'string') return '';
  const t = s.trim();
  return t.length ? t : '';
}

module.exports = ({ config }) => {
  const easProjectId = nonempty(
    process.env.EAS_PROJECT_ID ??
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
      config.extra?.eas?.projectId,
  );

  const apiUrl = nonempty(
    process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_SERVER_URL ?? config.extra?.apiUrl,
  );

  return {
    ...config,
    extra: {
      ...config.extra,
      ...(apiUrl ? { apiUrl } : {}),
      eas: {
        ...config.extra?.eas,
        ...(easProjectId ? { projectId: easProjectId } : {}),
      },
    },
  };
};
