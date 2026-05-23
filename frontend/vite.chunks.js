// Long-cached vendor chunks for both builds (vite.config.js, vite.admin.config.js). React, the
// router and Redux change far less often than the app and import nothing of ours. MapLibre and
// GSAP are never named here: they are only reached through lazy imports, and forcing them into
// a chunk lets shared helpers land there and pulls the whole library into every page.
export function vendorChunks(id) {
  if (/node_modules[\/](react|react-dom|scheduler|react-router|react-router-dom)[\/]/.test(id)) return 'react';
  if (/node_modules[\/](@reduxjs[\/]toolkit|redux|react-redux|immer|reselect|redux-thunk|use-sync-external-store)[\/]/.test(id)) return 'redux';
  return undefined;
}
