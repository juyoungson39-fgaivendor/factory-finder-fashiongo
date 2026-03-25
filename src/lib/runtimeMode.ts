const getHostname = () => {
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
};

export const isPreviewMode = (() => {
  const hostname = getHostname();
  return hostname.endsWith('.lovable.app') && hostname.includes('--');
})();

export const isDevelopmentAccessMode = false; // import.meta.env.DEV || isPreviewMode;