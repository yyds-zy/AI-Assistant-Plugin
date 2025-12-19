const API_MODEL = 'glm-4.6v-flash';
const BASE_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// DOM元素引用 - 将在DOMContentLoaded中初始化
let setupView, chatView, apiKeyInput, saveKeyBtn, settingsBtn, clearBtn, chatHistory, userInput, sendBtn;

// 多轮对话上下文数组
let conversationContext = [];

// --- 初始化入口 ---
document.addEventListener('DOMContentLoaded', () => {
    // 初始化DOM元素
    setupView = document.getElementById('setup-view');
    chatView = document.getElementById('chat-view');
    apiKeyInput = document.getElementById('api-key-input');
    saveKeyBtn = document.getElementById('save-key-btn');
    settingsBtn = document.getElementById('settings-btn');
    clearBtn = document.getElementById('clear-btn');
    chatHistory = document.getElementById('chat-history');
    userInput = document.getElementById('user-input');
    sendBtn = document.getElementById('send-btn');
    
    // 添加事件监听
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
    
    // 检查 Key 和 待处理文本，同时加载历史记录
    chrome.storage.local.get(['zhipu_api_key', 'pendingText', 'pendingAction', 'conversation_history', 'conversation_context'], (result) => {
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
                handleContextMenuText(result.pendingText, result.pendingAction);
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
        chrome.storage.local.get(['pendingAction'], (result) => {
            handleContextMenuText(changes.pendingText.newValue, result.pendingAction);
        });
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

// 事件监听已移到DOMContentLoaded中

// 导入翻译模块
// 处理右键传来的文本逻辑

async function handleContextMenuText(text, action) {
    console.log('handleContextMenuText called with:', { text, action });
    // 1. 清除 storage 里的文本防止重复触发
    chrome.storage.local.remove(['pendingText', 'pendingAction']);
    // 2. 清除图标上的 "!" 或 "NEW" 标记
    chrome.action.setBadgeText({ text: "" });

    // 3. 根据不同的操作类型执行不同的翻译
    if (action === 'translate_to_english') {
        // 使用API进行中译英
        console.log('Using API translation');
        appendMessage('user', text);
        appendMessage('assistant', '翻译中...');
        try {
            console.log('Calling translation API with text:', text);
            const translatedText = await window.TranslationModule.translateToEnglish(text);
            console.log('Translation result:', translatedText);
            updateLastAssistantMessage(translatedText);
        } catch (error) {
            console.error('Translation error:', error);
            updateLastAssistantMessage(`翻译失败: ${error.message}`);
        }
    } else {
        // 默认使用AI翻译
        console.log('Using AI translation');
        const prompt = `请解释或翻译以下这段话：\n\n"${text}"`;
        handleSendMessage(prompt); 
    }
}

// 更新最后一条助手消息的内容
function updateLastAssistantMessage(newContent) {
    const messages = chatHistory.querySelectorAll('.message');
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.classList.contains('assistant')) {
            const contentElement = lastMessage.querySelector('.bubble');
            if (contentElement) {
                contentElement.textContent = newContent;
            }
        }
    }
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
        // 获取历史消息中的天气类型记录作为上下文
        const weatherContext = getWeatherContextFromHistory();
        weatherResult = await WeatherModule.handleWeatherQuery(text, weatherContext);
    } catch (error) {
        console.error('天气模块调用失败:', error);
    }
    
    if (weatherResult) {
        // 是天气查询，直接显示天气结果
        appendMessage('ai', weatherResult, 'weather');
        
        // 将用户消息和AI回复添加到上下文（标记为weather类型）
        conversationContext.push({ role: "user", content: text, type: "weather" });
        conversationContext.push({ role: "assistant", content: weatherResult, type: "weather" });
        
        // 保存更新后的上下文和历史记录
        saveConversationHistory();
        return;
    }

    // 不是天气查询，继续原有的AI对话流程
    // 添加用户消息到上下文（标记为chat类型）
    conversationContext.push({ role: "user", content: text, type: "chat" });

    const { zhipu_api_key: apiKey } = await chrome.storage.local.get(['zhipu_api_key']);
    if (!apiKey) {
        appendMessage('system', '未设置 API Key');
        return;
    }

    const aiMsgDiv = appendMessage('ai', '');
    const bubble = aiMsgDiv.querySelector('.bubble');
    bubble.innerHTML = '<span class="loading">正在思考...</span>';

    try {
        // 普通聊天时，只获取 chat 类型的历史记录作为上下文
        const chatContext = conversationContext.filter(msg => msg.type === "chat");
        
        const response = await fetch(BASE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: API_MODEL,
                messages: chatContext, // 只发送 chat 类型的对话上下文
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
        
        // 将AI回复添加到上下文（标记为chat类型）
        conversationContext.push({ role: "assistant", content: fullContent, type: "chat" });
        
        // 保存更新后的上下文和历史记录
        saveConversationHistory();
        
    } catch (error) {
        bubble.innerText = `错误: ${error.message}`;
    }
}

// 从历史上下文获取天气类型的消息
function getWeatherContextFromHistory() {
    return conversationContext.filter(msg => msg.type === "weather");
}

// 加载历史聊天记录
function loadChatHistory(history) {
    chatHistory.innerHTML = '';
    conversationContext = []; // 重置对话上下文
    
    if (history && history.length > 0) {
        history.forEach(msg => {
            const type = msg.type || 'chat'; // 获取消息类型，默认chat
            appendMessage(msg.role, msg.content, type);
            
            // 将消息添加到对话上下文（包含类型）
            conversationContext.push({
                role: msg.role,
                content: msg.content,
                type: type
            });
        });
    }
    scrollToBottom();
}

// 保存对话历史和上下文
function saveConversationHistory() {
    const history = [];
    const messages = chatHistory.querySelectorAll('.message');
    messages.forEach(msg => {
        const role = msg.classList.contains('user') ? 'user' : 
                     msg.classList.contains('ai') ? 'assistant' : 'system';
        const content = msg.querySelector('.bubble').innerText;
        const type = msg.dataset.type || 'chat'; // 默认类型为chat
        history.push({ role, content, type });
    });
    
    chrome.storage.local.set({
        conversation_history: history,
        conversation_context: conversationContext
    });
}

function appendMessage(role, content, type = 'chat') {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.dataset.type = type; // 使用data属性存储消息类型
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