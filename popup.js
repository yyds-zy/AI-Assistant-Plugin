const API_MODEL = 'glm-4.5-flash';
const BASE_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// DOM 元素
const setupView = document.getElementById('setup-view');
const chatView = document.getElementById('chat-view');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const settingsBtn = document.getElementById('settings-btn');
const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// 初始化：检查是否有 API Key
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['zhipu_api_key'], (result) => {
    if (result.zhipu_api_key) {
      showChatView();
    } else {
      showSetupView();
    }
  });
});

// 切换视图逻辑
function showSetupView() {
  setupView.classList.remove('hidden');
  chatView.classList.add('hidden');
}

function showChatView() {
  setupView.classList.add('hidden');
  chatView.classList.remove('hidden');
  // 滚动到底部
  scrollToBottom();
}

// 保存 API Key
saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    alert('请输入有效的 API Key');
    return;
  }
  chrome.storage.local.set({ zhipu_api_key: key }, () => {
    showChatView();
    appendMessage('system', 'API Key 已保存，可以开始对话了。');
  });
});

// 设置按钮点击
settingsBtn.addEventListener('click', showSetupView);

// 发送消息逻辑
sendBtn.addEventListener('click', handleSendMessage);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

async function handleSendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // 1. 显示用户消息
  appendMessage('user', text);
  userInput.value = '';

  // 2. 获取 API Key 并调用
  chrome.storage.local.get(['zhipu_api_key'], async (result) => {
    const apiKey = result.zhipu_api_key;
    if (!apiKey) {
      appendMessage('system', '未找到 API Key，请先去设置。');
      return;
    }

    // 显示 "思考中..."
    const loadingId = appendLoading();

    try {
      const response = await callZhipuAI(text, apiKey);
      removeMessage(loadingId);
      
      // 提取回复内容
      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message.content;
        appendMessage('ai', content);
      } else {
        appendMessage('system', 'API 返回数据格式异常。');
        console.error(response);
      }
    } catch (error) {
      removeMessage(loadingId);
      appendMessage('system', `请求失败: ${error.message}`);
    }
  });
}

// 调用智谱 API
async function callZhipuAI(prompt, apiKey) {
  // 注意：智谱 API Key 结构为 id.secret
  // 许多兼容 OpenAI 的接口允许直接使用 Bearer apiKey
  // 如果遇到 401 错误，可能需要在此处实现 JWT 签发逻辑，或者使用智谱提供的 SDK
  
  const payload = {
    model: API_MODEL,
    messages: [
      { role: "user", content: prompt }
    ],
    temperature: 0.7
  };

  const response = await fetch(BASE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}` 
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${response.status}`);
  }

  return await response.json();
}

// UI 辅助函数：添加消息
function appendMessage(role, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerText = text; // 使用 innerText 防止 XSS

  msgDiv.appendChild(bubble);
  chatHistory.appendChild(msgDiv);
  scrollToBottom();
  return msgDiv;
}

// UI 辅助函数：添加 Loading 状态
function appendLoading() {
  const id = 'loading-' + Date.now();
  const msgDiv = document.createElement('div');
  msgDiv.id = id;
  msgDiv.className = 'message ai';
  msgDiv.innerHTML = `<div class="bubble"><span class="loading">正在思考...</span></div>`;
  chatHistory.appendChild(msgDiv);
  scrollToBottom();
  return id;
}

function removeMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom() {
  chatHistory.scrollTop = chatHistory.scrollHeight;
}