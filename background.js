// 侧边栏状态跟踪
let sidePanelOpen = false;

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-sidebar",
    title: "使用 AI 翻译: '%s'",
    contexts: ["selection"]
  });
});

// 监听菜单点击 -> 强制开启侧边栏
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-sidebar") {
    // 1. 存下文字
    chrome.storage.local.set({ pendingText: info.selectionText });

    // 2. 关键：在当前窗口打开侧边栏
    chrome.sidePanel.open({ windowId: tab.windowId });
    sidePanelOpen = true;
  }
});

// 监听点击插件图标 -> 也打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
  sidePanelOpen = true;
});

// 监听侧边栏关闭事件
chrome.sidePanel.onClosed.addListener(() => {
  sidePanelOpen = false;
});

// 监听侧边栏打开事件
chrome.sidePanel.onOpened.addListener(() => {
  sidePanelOpen = true;
});

// 监听快捷键命令 - 切换侧边栏显示状态
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-sidepanel") {
    // 获取当前活动标签页的窗口ID
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        if (sidePanelOpen) {
          // 如果侧边栏是打开的，则关闭它
          chrome.sidePanel.close({ windowId: tabs[0].windowId });
          sidePanelOpen = false;
        } else {
          // 如果侧边栏是关闭的，则打开它
          chrome.sidePanel.open({ windowId: tabs[0].windowId });
          sidePanelOpen = true;
        }
      }
    });
  }
});