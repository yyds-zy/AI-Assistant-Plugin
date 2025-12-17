const API_MODEL = 'glm-4.5-flash';
const BASE_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const setupView = document.getElementById('setup-view');
const chatView = document.getElementById('chat-view');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const settingsBtn = document.getElementById('settings-btn');
const clearBtn = document.getElementById('clear-btn');
const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// 多轮对话上下文数组
let conversationContext = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 加载历史对话记录和上下文
  chrome.storage.local.get(['zhipu_api_key', 'conversation_history', 'conversation_context'], (result) => {
    if (result.zhipu_api_key) {
      // 恢复历史记录
      if (result.conversation_history) {
        loadChatHistory(result.conversation_history);
      }
      // 恢复对话上下文
      if (result.conversation_context) {
        conversationContext = result.conversation_context;
      }
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
  chrome.storage.local.set({ zhipu_api_key: key }, () => {
    showChatView();
    // 初始化对话上下文
    conversationContext = [];
    chrome.storage.local.set({ conversation_context: conversationContext });
  });
});

settingsBtn.addEventListener('click', showSetupView);

// 清除对话历史和上下文
clearBtn.addEventListener('click', () => {
  if (confirm('确定要清除所有对话记录吗？')) {
    conversationContext = [];
    chatHistory.innerHTML = '';
    chrome.storage.local.remove(['conversation_history', 'conversation_context']);
    // 添加初始欢迎消息
    appendMessage('ai', '你好！我是AI助手尼克狐尼克，有什么可以帮你的吗？');
  }
});

sendBtn.addEventListener('click', handleSendMessage);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});



document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['zhipu_api_key', 'pendingText'], (result) => {
    // 1. 处理 API Key 视图
    if (result.zhipu_api_key) {
      showChatView();
      
      // 2. 检查是否有来自右键菜单的待处理文本
      if (result.pendingText) {
        handleContextMenuText(result.pendingText);
      }
    } else {
      showSetupView();
    }
  });
});

// 处理右键传来的文本
async function handleContextMenuText(text) {
  // 清除待处理状态和 Badge
  chrome.storage.local.remove('pendingText');
  chrome.action.setBadgeText({ text: "" });

  // 构造 Prompt
  const prompt = `请解释或翻译以下这段话：\n\n"${text}"`;
  
  // 模拟发送消息
  userInput.value = prompt;
  handleSendMessage();
}


// 处理消息发送（流式版本，支持多轮对话）
async function handleSendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  // 添加用户消息到上下文
  conversationContext.push({ role: "user", content: text });
  
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
        messages: conversationContext, // 发送完整的对话上下文
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
    
    // 将AI回复添加到上下文
    conversationContext.push({ role: "assistant", content: fullContent });
    
    // 保存更新后的上下文和历史记录
    saveConversationHistory();
    
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

// 加载历史聊天记录
function loadChatHistory(history) {
  chatHistory.innerHTML = '';
  history.forEach(msg => {
    appendMessage(msg.role, msg.content);
  });
}

// 保存对话历史和上下文
function saveConversationHistory() {
  const history = [];
  const messages = chatHistory.querySelectorAll('.message');
  messages.forEach(msg => {
    const role = msg.classList.contains('user') ? 'user' : 
                 msg.classList.contains('ai') ? 'assistant' : 'system';
    const content = msg.querySelector('.bubble').innerText;
    history.push({ role, content });
  });
  
  chrome.storage.local.set({
    conversation_history: history,
    conversation_context: conversationContext
  });
}