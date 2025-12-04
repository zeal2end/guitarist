// src/background/service-worker.js

// Allows users to open the side panel by clicking the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Listen for tab updates to potentially inject scripts if needed (though manifest handles static injection)
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  const url = new URL(tab.url);
  // Enables the side panel on google.com, youtube.com, spotify.com, etc.
  if (url.origin.includes('youtube.com') || url.origin.includes('spotify.com')) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'src/sidepanel/index.html',
      enabled: true
    });
  } else {
    // Disables the side panel on other sites
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    });
  }
});
