// 封装创建菜单的逻辑
function initContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "translate-ai",
      title: "使用 AI 翻译/解释: '%s'", // %s 会自动显示你选中的文字
      contexts: ["selection"]
    });
  });
}

// 插件安装、更新时运行
chrome.runtime.onInstalled.addListener(() => {
  initContextMenu();
});

// 浏览器启动时运行，确保菜单不丢失
chrome.runtime.onStartup.addListener(() => {
  initContextMenu();
});

// 监听点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-ai") {
    const text = info.selectionText;
    
    // 存入 storage
    chrome.storage.local.set({ 
      pendingText: text,
      lastAction: 'translate' 
    }, () => {
      // 在图标显示黄色提示，告诉用户该点开插件看结果了
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF9800" });
    });
  }
});