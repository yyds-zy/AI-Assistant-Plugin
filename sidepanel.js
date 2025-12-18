const API_MODEL = 'glm-4.5-flash';
const BASE_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const WEATHER_API_URL = 'https://api.mymzf.com/api/tqybmoji';

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
    const weatherResult = await handleWeatherQuery(text);
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

// 天气查询辅助函数
async function queryWeather(province, city, userIntent = {}) {
    try {
        // 如果有区县信息，优先使用区县作为查询地点
        const queryLocation = userIntent.district || city;
        const url = `${WEATHER_API_URL}?sheng=${encodeURIComponent(province)}&place=${encodeURIComponent(queryLocation)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 200 && data.data && data.data.length > 0) {
            // 根据用户意图和时间匹配选择对应的天气数据
            const targetDay = getTargetWeatherDay(data.data, userIntent.timeType);
            return createWeatherCard(data.place, targetDay, data.data);
        } else {
            // 如果区县查询失败，尝试用城市查询
            if (userIntent.district) {
                const cityUrl = `${WEATHER_API_URL}?sheng=${encodeURIComponent(province)}&place=${encodeURIComponent(city)}`;
                const cityResponse = await fetch(cityUrl);
                const cityData = await cityResponse.json();
                
                if (cityData.code === 200 && cityData.data && cityData.data.length > 0) {
                    const targetDay = getTargetWeatherDay(cityData.data, userIntent.timeType);
                    return createWeatherCard(cityData.place, targetDay, cityData.data);
                }
            }
            return `抱歉，未找到 ${queryLocation} 的天气信息，请检查地名是否正确。`;
        }
    } catch (error) {
        return `获取天气信息失败: ${error.message}`;
    }
}

// 根据用户意图和时间类型获取目标天气数据
function getTargetWeatherDay(weatherData, timeType) {
    const today = new Date();
    const todayWeekDay = getWeekDay(today.getDay());
    
    // 根据时间类型选择对应的天气数据
    if (timeType === 'today') {
        // 查找今天的天气
        return weatherData.find(day => day.week1 === todayWeekDay) || weatherData[0];
    } else if (timeType === 'tomorrow') {
        // 查找明天的天气
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowWeekDay = getWeekDay(tomorrow.getDay());
        return weatherData.find(day => day.week1 === tomorrowWeekDay) || weatherData[1] || weatherData[0];
    } else if (timeType === 'week') {
        // 返回本周的天气概览
        return weatherData.slice(0, 7);
    } else {
        // 默认返回今天的天气
        return weatherData[0];
    }
}

// 获取星期几的中文名称
function getWeekDay(dayIndex) {
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekDays[dayIndex];
}

// 创建美观的天气卡片
function createWeatherCard(location, weatherData, allData) {
    if (Array.isArray(weatherData)) {
        // 创建一周天气概览卡片
        return createWeekWeatherCard(location, weatherData);
    } else {
        // 创建单日天气卡片
        return createSingleDayWeatherCard(location, weatherData, allData);
    }
}

// 创建单日天气卡片
function createSingleDayWeatherCard(location, dayData, allData) {
    // 创建主卡片容器
    const card = document.createElement('div');
    card.className = 'weather-card';
    card.style.cssText = `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 15px;
        padding: 20px;
        margin: 10px 0;
        color: white;
        font-family: 'Arial', sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2);
    `;

    // 头部信息
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;';
    
    const locationInfo = document.createElement('div');
    locationInfo.innerHTML = `
        <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${location}</h3>
        <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">${dayData.week1} ${dayData.week2}</p>
    `;
    
    const weatherIcon = document.createElement('div');
    weatherIcon.style.cssText = 'text-align: center;';
    weatherIcon.innerHTML = `
        <img src="${dayData.img1}" alt="${dayData.wea1}" style="width: 60px; height: 60px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">
        <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.9;">${dayData.wea1}</p>
    `;
    
    header.appendChild(locationInfo);
    header.appendChild(weatherIcon);
    card.appendChild(header);

    // 温度对比区域
    const tempSection = document.createElement('div');
    tempSection.style.cssText = 'display: flex; justify-content: space-around; margin: 20px 0;';
    
    // 白天温度
    const dayTemp = document.createElement('div');
    dayTemp.style.cssText = 'text-align: center;';
    dayTemp.innerHTML = `
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">${dayData.wendu1}</div>
        <div style="font-size: 12px; opacity: 0.8;">白天</div>
        <img src="${dayData.img1}" alt="白天" style="width: 30px; height: 30px; margin-top: 5px;">
    `;
    
    // 分隔线
    const divider = document.createElement('div');
    divider.style.cssText = 'width: 1px; background: rgba(255,255,255,0.3); margin: 0 15px;';
    
    // 夜间温度
    const nightTemp = document.createElement('div');
    nightTemp.style.cssText = 'text-align: center;';
    nightTemp.innerHTML = `
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">${dayData.wendu2}</div>
        <div style="font-size: 12px; opacity: 0.8;">夜间</div>
        <img src="${dayData.img2}" alt="夜间" style="width: 30px; height: 30px; margin-top: 5px;">
    `;
    
    tempSection.appendChild(dayTemp);
    tempSection.appendChild(divider);
    tempSection.appendChild(nightTemp);
    card.appendChild(tempSection);

    // 天气描述
    const weatherDesc = document.createElement('div');
    weatherDesc.style.cssText = 'background: rgba(255,255,255,0.1); border-radius: 10px; padding: 10px; margin-top: 15px;';
    weatherDesc.innerHTML = `
        <p style="margin: 0; font-size: 12px; opacity: 0.8; text-align: center;">
            ☀️ 白天: ${dayData.wea1} | 🌙 夜间: ${dayData.wea2}
        </p>
    `;
    card.appendChild(weatherDesc);

    // 未来几日预报
    if (allData && allData.length > 1) {
        const futureSection = document.createElement('div');
        futureSection.style.cssText = 'margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);';
        
        const futureTitle = document.createElement('p');
        futureTitle.style.cssText = 'margin: 0 0 10px 0; font-size: 12px; opacity: 0.8;';
        futureTitle.textContent = '未来几日:';
        futureSection.appendChild(futureTitle);
        
        const futureDays = document.createElement('div');
        futureDays.style.cssText = 'display: flex; justify-content: space-between; overflow-x: auto;';
        
        allData.slice(1, 5).forEach(day => {
            const dayElement = document.createElement('div');
            dayElement.style.cssText = 'text-align: center; min-width: 60px; margin-right: 10px;';
            dayElement.innerHTML = `
                <div style="font-size: 10px; opacity: 0.8; margin-bottom: 5px;">${day.week1}</div>
                <img src="${day.img1}" alt="${day.wea1}" style="width: 25px; height: 25px; margin: 5px 0;">
                <div style="font-size: 10px;">${day.wendu1}</div>
            `;
            futureDays.appendChild(dayElement);
        });
        
        futureSection.appendChild(futureDays);
        card.appendChild(futureSection);
    }

    return card;
}

// 创建一周天气概览卡片
function createWeekWeatherCard(location, weekData) {
    // 创建主卡片容器
    const card = document.createElement('div');
    card.className = 'weather-week-card';
    card.style.cssText = `
        background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
        border-radius: 15px;
        padding: 20px;
        margin: 10px 0;
        color: white;
        font-family: 'Arial', sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    `;

    // 标题区域
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 20px;';
    header.innerHTML = `
        <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${location}</h3>
        <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">未来7天天气预报</p>
    `;
    card.appendChild(header);

    // 天气列表容器
    const weekContainer = document.createElement('div');
    weekContainer.style.cssText = 'display: flex; justify-content: space-between; overflow-x: auto;';

    // 为每一天创建天气元素
    weekData.forEach(day => {
        const dayElement = document.createElement('div');
        dayElement.style.cssText = 'text-align: center; min-width: 80px; margin-right: 15px;';
        
        const weekDay = document.createElement('div');
        weekDay.style.cssText = 'font-size: 12px; opacity: 0.9; margin-bottom: 8px;';
        weekDay.textContent = day.week1;
        
        const weekDate = document.createElement('div');
        weekDate.style.cssText = 'font-size: 10px; opacity: 0.8; margin-bottom: 10px;';
        weekDate.textContent = day.week2;
        
        const weatherIcon = document.createElement('img');
        weatherIcon.src = day.img1;
        weatherIcon.alt = day.wea1;
        weatherIcon.style.cssText = 'width: 40px; height: 40px; margin: 8px 0; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));';
        
        const temperature = document.createElement('div');
        temperature.style.cssText = 'font-size: 14px; font-weight: 600; margin: 5px 0;';
        temperature.textContent = day.wendu1;
        
        const weatherDesc = document.createElement('div');
        weatherDesc.style.cssText = 'font-size: 10px; opacity: 0.8;';
        weatherDesc.textContent = day.wea1;
        
        // 组装每一天的天气元素
        dayElement.appendChild(weekDay);
        dayElement.appendChild(weekDate);
        dayElement.appendChild(weatherIcon);
        dayElement.appendChild(temperature);
        dayElement.appendChild(weatherDesc);
        
        weekContainer.appendChild(dayElement);
    });

    card.appendChild(weekContainer);
    return card;
}

// 智能天气查询函数
async function handleWeatherQuery(text) {
    // 检查是否包含天气相关关键词
    const weatherKeywords = ['天气', '气温', '温度', '预报', '晴', '雨', '雪', '风', '云'];
    const hasWeatherKeyword = weatherKeywords.some(keyword => text.includes(keyword));
    
    if (!hasWeatherKeyword) {
        return null;
    }
    
    // 使用AI分析用户意图和提取地理位置
    const userIntent = await analyzeWeatherIntent(text);
    
    if (!userIntent.province || !userIntent.city) {
        return `抱歉，无法识别您要查询的地点。请提供更具体的城市名称，比如"北京天气"或"上海明天天气"。`;
    }
    
    // 查询天气
    return await queryWeather(userIntent.province, userIntent.city, userIntent);
}

// 使用AI分析用户天气查询意图
async function analyzeWeatherIntent(text) {
    try {
        // 构建分析提示词
        const analysisPrompt = `请分析以下天气查询语句，提取以下信息：
1. 省份（sheng）
2. 城市（place）
3. 区县（district，可选）
4. 时间类型（timeType）：today/tomorrow/week
5. 用户意图描述

查询语句："${text}"

请严格按照以下JSON格式返回结果，不要添加任何额外内容：
{"province":"省份名称","city":"城市名称","district":"区县名称或null","timeType":"today/tomorrow/week","intent":"用户意图描述"}

规则说明：
- 省份和城市必须是中国的真实行政区划名称
- 区县信息如果存在需要提取，不存在则为null
- 时间类型判断：
  * "今天"、"今日"、"现在" -> today
  * "明天"、"明日"、"后天" -> tomorrow  
  * "一周"、"7天"、"未来几天" -> week
  * 默认 -> today
- 如果无法确定省份或城市，请返回null

示例：
输入："北京今天天气怎么样"
输出：{"province":"北京","city":"北京","district":null,"timeType":"today","intent":"查询北京今日天气"}

输入："上海明天会下雨吗"
输出：{"province":"上海","city":"上海","district":null,"timeType":"tomorrow","intent":"查询上海明日是否下雨"}

输入："深圳未来一周的天气预报"
输出：{"province":"广东","city":"深圳","district":null,"timeType":"week","intent":"查询深圳一周天气预报"}

输入："海淀区今天天气"
输出：{"province":"北京","city":"北京","district":"海淀区","timeType":"today","intent":"查询海淀区今日天气"}`;

        // 调用AI API进行分析
        const response = await fetch(BASE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: API_MODEL,
                messages: [{role: 'user', content: analysisPrompt}],
                temperature: 0.1,
                max_tokens: 200
            })
        });

        const result = await response.json();
        const analysisResult = JSON.parse(result.choices[0].message.content.trim());
        
        return {
            province: analysisResult.province,
            city: analysisResult.city,
            district: analysisResult.district || null,
            timeType: analysisResult.timeType || 'today',
            intent: analysisResult.intent
        };
        
    } catch (error) {
        console.error('AI意图分析失败，使用备用方案:', error);
        return fallbackAnalyzeIntent(text);
    }
}

// 备用意图分析方案
function fallbackAnalyzeIntent(text) {
    // 使用中国行政区划数据模块提取地名信息
    let extractLocationFromText;
    
    // 尝试从全局对象获取函数
    if (typeof window !== 'undefined' && window.chinaDivisions && window.chinaDivisions.extractLocationFromText) {
        extractLocationFromText = window.chinaDivisions.extractLocationFromText;
    } else {
        // 如果模块未加载，使用回退数据
        const fallbackCities = ['北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '成都', '重庆', '武汉', '西安', '天津', '青岛', '大连', '沈阳', '长春', '哈尔滨', '石家庄', '太原', '郑州', '济南', '合肥', '南昌', '福州', '厦门', '长沙', '贵阳', '昆明', '南宁', '海口', '兰州', '西宁', '银川', '乌鲁木齐', '拉萨', '呼和浩特', '包头', '鄂尔多斯', '唐山', '保定', '邯郸', '沧州', '廊坊', '承德', '张家口', '秦皇岛', '邢台', '衡水'];
        
        extractLocationFromText = function(text) {
            for (const city of fallbackCities) {
                if (text.includes(city)) {
                    return {
                        city: city,
                        province: city,
                        district: null,
                        level: 'city',
                        confidence: 1.0
                    };
                }
            }
            return null;
        };
    }
    
    let targetCity = '北京';
    let targetProvince = '北京';
    let targetDistrict = null;
    let timeType = 'today';
    
    // 从文本中提取城市信息
    const locationInfo = extractLocationFromText ? extractLocationFromText(text) : null;
    
    if (locationInfo && locationInfo.city) {
        targetCity = locationInfo.city;
        targetProvince = locationInfo.province || targetCity;
        
        // 如果有区县信息，也记录下来
        if (locationInfo.district) {
            targetDistrict = locationInfo.district;
        }
    } else {
        // 回退到简单的关键词匹配
        const fallbackCities = [
            '北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '成都', '重庆', '武汉',
            '西安', '天津', '青岛', '大连', '沈阳', '长春', '哈尔滨', '石家庄', '太原', '郑州',
            '济南', '合肥', '南昌', '福州', '厦门', '长沙', '贵阳', '昆明', '南宁', '海口',
            '兰州', '西宁', '银川', '乌鲁木齐', '拉萨', '呼和浩特', '包头', '鄂尔多斯', '唐山',
            '保定', '邯郸', '沧州', '廊坊', '承德', '张家口', '秦皇岛', '邢台', '衡水'
        ];
        
        for (const city of fallbackCities) {
            if (text.includes(city)) {
                targetCity = city;
                // 根据城市推断省份
                const cityProvinceMap = {
                    '北京': '北京', '上海': '上海', '天津': '天津', '重庆': '重庆',
                    '广州': '广东', '深圳': '广东', '杭州': '浙江', '南京': '江苏',
                    '苏州': '江苏', '成都': '四川', '武汉': '湖北', '西安': '陕西',
                    '青岛': '山东', '大连': '辽宁', '沈阳': '辽宁', '长春': '吉林',
                    '哈尔滨': '黑龙江', '石家庄': '河北', '太原': '山西', '郑州': '河南',
                    '济南': '山东', '合肥': '安徽', '南昌': '江西', '福州': '福建',
                    '厦门': '福建', '长沙': '湖南', '贵阳': '贵州', '昆明': '云南',
                    '南宁': '广西', '海口': '海南', '兰州': '甘肃', '西宁': '青海',
                    '银川': '宁夏', '乌鲁木齐': '新疆', '拉萨': '西藏', '呼和浩特': '内蒙古',
                    '包头': '内蒙古', '鄂尔多斯': '内蒙古'
                };
                targetProvince = cityProvinceMap[city] || city;
                break;
            }
        }
    }
    
    // 判断时间类型
    if (text.includes('明天') || text.includes('明日')) {
        timeType = 'tomorrow';
    } else if (text.includes('后天')) {
        timeType = 'tomorrow'; // 简化处理
    } else if (text.includes('一周') || text.includes('7天') || text.includes('未来几天')) {
        timeType = 'week';
    }
    
    return {
        province: targetProvince,
        city: targetCity,
        district: targetDistrict,
        timeType: timeType,
        intent: `查询${targetDistrict ? targetDistrict : targetCity}${timeType === 'today' ? '今日' : timeType === 'tomorrow' ? '明日' : '一周'}天气`
    };
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