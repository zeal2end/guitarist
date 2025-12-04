// src/background/service-worker.js

// Allows users to open the side panel by clicking the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Listen for tab updates to potentially inject scripts if needed (though manifest handles static injection)
// Listen for tab updates to potentially inject scripts if needed (though manifest handles static injection)
// We removed the restrictive logic to allow the user to open the panel on ANY site (e.g. for adding songs).
// The 'openPanelOnActionClick: true' setting ensures it only opens when clicked.
