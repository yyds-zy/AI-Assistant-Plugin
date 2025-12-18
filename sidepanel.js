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

// --- 初始化入口 ---
document.addEventListener('DOMContentLoaded', () => {
    // 检查 Key 和 待处理文本，同时加载历史记录
    chrome.storage.local.get(['zhipu_api_key', 'pendingText', 'conversation_history', 'conversation_context'], (result) => {
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
            // 如果打开侧边栏时已经有待翻译文本
            if (result.pendingText) {
                handleContextMenuText(result.pendingText);
            }
        } else {
            showSetupView();
        }
    });
});

// --- 实时监听 Storage 变化 ---
// 当侧边栏开启时，用户再次右键点击翻译，会触发这里
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pendingText && changes.pendingText.newValue) {
        handleContextMenuText(changes.pendingText.newValue);
    }
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
        appendMessage('ai', '你好！我是AI助手，有什么可以帮你的吗？');
    }
});

sendBtn.addEventListener('click', () => handleSendMessage());

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
});

// 处理右键传来的文本逻辑
async function handleContextMenuText(text) {
    // 1. 清除 storage 里的文本防止重复触发
    chrome.storage.local.remove('pendingText');
    // 2. 清除图标上的 "!" 或 "NEW" 标记
    chrome.action.setBadgeText({ text: "" });

    // 3. 执行翻译发送
    const prompt = `请解释或翻译以下这段话：\n\n"${text}"`;
    handleSendMessage(prompt); 
}

// 修改后的消息发送函数（支持传入外部指令和多轮对话）
async function handleSendMessage(overrideText = null) {
    const text = overrideText || userInput.value.trim();
    if (!text) return;

    // UI 反馈
    appendMessage('user', text);
    if (!overrideText) userInput.value = ''; // 只有手动输入才清空输入框

    // 首先检查是否是天气查询
    let weatherResult = null;
    try {
        // 使用全局对象调用天气模块
        weatherResult = await WeatherModule.handleWeatherQuery(text);
    } catch (error) {
        console.error('天气模块调用失败:', error);
    }
    
    if (weatherResult) {
        // 是天气查询，直接显示天气结果
        appendMessage('ai', weatherResult);
        
        // 将用户消息和AI回复添加到上下文
        conversationContext.push({ role: "user", content: text });
        conversationContext.push({ role: "assistant", content: weatherResult });
        
        // 保存更新后的上下文和历史记录
        saveConversationHistory();
        return;
    }

    // 不是天气查询，继续原有的AI对话流程
    // 添加用户消息到上下文
    conversationContext.push({ role: "user", content: text });

    const { zhipu_api_key: apiKey } = await chrome.storage.local.get(['zhipu_api_key']);
    if (!apiKey) {
        appendMessage('system', '未设置 API Key');
        return;
    }

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
                stream: true
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullContent = '';
        bubble.innerText = ''; 

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
                        
                        // 使用 Markdown 渲染（前提是你引入了 marked.js）
                        if (typeof marked !== 'undefined') {
                            bubble.innerHTML = marked.parse(fullContent);
                        } else {
                            bubble.innerText = fullContent;
                        }
                        scrollToBottom();
                    } catch (e) {}
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

function appendMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    // 检查内容类型：如果是DOM元素，直接appendChild；如果是文本，设置innerText
    if (content instanceof HTMLElement) {
        bubble.appendChild(content);
    } else {
        bubble.innerText = content;
    }
    
    msgDiv.appendChild(bubble);
    chatHistory.appendChild(msgDiv);
    scrollToBottom();
    return msgDiv;
}

function scrollToBottom() {
    chatHistory.scrollTop = chatHistory.scrollHeight;
}