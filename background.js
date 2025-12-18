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
  }
});

// 监听点击插件图标 -> 也打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// 监听快捷键命令
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-sidepanel") {
    // 获取当前活动标签页的窗口ID
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ windowId: tabs[0].windowId });
      }
    });
  } else if (command === "close-sidepanel") {
    // 隐藏侧边栏 - 由于Chrome API限制，我们可以通过聚焦到当前页面来模拟隐藏效果
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.close({ windowId: tabs[0].windowId });
      }
    });
  }
});