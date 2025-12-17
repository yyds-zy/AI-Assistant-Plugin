const API_MODEL = 'glm-4.5-flash';
const BASE_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const setupView = document.getElementById('setup-view');
const chatView = document.getElementById('chat-view');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const settingsBtn = document.getElementById('settings-btn');
const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['zhipu_api_key'], (result) => {
    if (result.zhipu_api_key) {
      showChatView();
    } else {
      showSetupView();
    }
  });
});

function showSetupView() {
  setupView.classList.remove('hidden');
  chatView.classList.add('hidden');
}

function showChatView() {
  setupView.classList.add('hidden');
  chatView.classList.remove('hidden');
  scrollToBottom();
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return alert('请输入 API Key');
  chrome.storage.local.set({ zhipu_api_key: key }, showChatView);
});

settingsBtn.addEventListener('click', showSetupView);

sendBtn.addEventListener('click', handleSendMessage);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

// 处理消息发送（流式版本）
async function handleSendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  appendMessage('user', text);
  userInput.value = '';

  const { zhipu_api_key: apiKey } = await chrome.storage.local.get(['zhipu_api_key']);
  if (!apiKey) {
    appendMessage('system', '未设置 API Key');
    return;
  }

  // 创建一个 AI 消息气泡，准备接收流式数据
  const aiMsgDiv = appendMessage('ai', '');
  const bubble = aiMsgDiv.querySelector('.bubble');
  bubble.innerHTML = '<span class="loading">正在思考...</span>';

  try {
    const response = await fetch(BASE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: API_MODEL,
        messages: [{ role: "user", content: text }],
        stream: true // 开启流式传输
      })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';
    bubble.innerText = ''; // 清除 loading 状态

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') break;

          try {
            const json = JSON.parse(dataStr);
            const content = json.choices[0].delta.content || '';
            fullContent += content;
            
            // 实时更新 UI
            bubble.innerText = fullContent; 
            scrollToBottom();
          } catch (e) {
            // 忽略不完整的 JSON 分片
          }
        }
      }
    }
  } catch (error) {
    bubble.innerText = `错误: ${error.message}`;
  }
}

function appendMessage(role, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerText = text;
  msgDiv.appendChild(bubble);
  chatHistory.appendChild(msgDiv);
  scrollToBottom();
  return msgDiv;
}

function scrollToBottom() {
  chatHistory.scrollTop = chatHistory.scrollHeight;
}