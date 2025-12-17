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

// --- 初始化入口 ---
document.addEventListener('DOMContentLoaded', () => {
    // 检查 Key 和 待处理文本
    chrome.storage.local.get(['zhipu_api_key', 'pendingText'], (result) => {
        if (result.zhipu_api_key) {
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
    chrome.storage.local.set({ zhipu_api_key: key }, showChatView);
});

settingsBtn.addEventListener('click', showSetupView);

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

// 修改后的消息发送函数（支持传入外部指令）
async function handleSendMessage(overrideText = null) {
    const text = overrideText || userInput.value.trim();
    if (!text) return;

    // UI 反馈
    appendMessage('user', text);
    if (!overrideText) userInput.value = ''; // 只有手动输入才清空输入框

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
                messages: [{ role: "user", content: text }],
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