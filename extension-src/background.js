/*
 * Opens Jira Flowyard in a new tab when the toolbar icon is clicked. There is no
 * popup: the 3D scene needs a full page.
 */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});
