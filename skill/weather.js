// 天气查询相关函数模块

// 天气API地址
const WEATHER_API_URL = 'https://api.mymzf.com/api/tqybmoji';

/**
 * 查询天气信息
 * @param {string} province - 省份名称
 * @param {string} city - 城市名称
 * @param {Object} userIntent - 用户意图对象，包含district和timeType
 * @returns {Promise<string|Element>} - 返回天气信息字符串或DOM元素
 */
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

/**
 * 根据用户意图和时间类型获取目标天气数据
 * @param {Array} weatherData - 天气数据数组
 * @param {string} timeType - 时间类型 (today/tomorrow/week)
 * @returns {Object|Array} - 返回对应的天气数据
 */
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

/**
 * 获取星期几的中文名称
 * @param {number} dayIndex - 星期索引 (0-6)
 * @returns {string} - 星期几的中文名称
 */
function getWeekDay(dayIndex) {
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekDays[dayIndex];
}

/**
 * 创建天气卡片
 * @param {string} location - 地点名称
 * @param {Object|Array} weatherData - 天气数据
 * @param {Array} allData - 所有天气数据
 * @returns {Element} - 返回天气卡片DOM元素
 */
function createWeatherCard(location, weatherData, allData) {
    if (Array.isArray(weatherData)) {
        // 创建一周天气概览卡片
        return createWeekWeatherCard(location, weatherData);
    } else {
        // 创建单日天气卡片
        return createSingleDayWeatherCard(location, weatherData, allData);
    }
}

/**
 * 创建单日天气卡片
 * @param {string} location - 地点名称
 * @param {Object} dayData - 单日天气数据
 * @param {Array} allData - 所有天气数据
 * @returns {Element} - 返回单日天气卡片DOM元素
 */
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

/**
 * 创建一周天气概览卡片
 * @param {string} location - 地点名称
 * @param {Array} weekData - 一周天气数据
 * @returns {Element} - 返回一周天气卡片DOM元素
 */
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

/**
 * 智能天气查询函数
 * @param {string} text - 用户输入的文本
 * @param {Object} apiConfig - API配置对象，包含BASE_API_URL, API_MODEL, API_KEY（可选）
 * @returns {Promise<string|Element|null>} - 返回天气信息或null
 */
async function handleWeatherQuery(text, weatherContext = null, apiConfig = null) {
    // 检查是否包含天气相关关键词
    const weatherKeywords = ['天气', '气温', '温度', '预报', '晴', '雨', '雪', '风', '云'];
    const hasWeatherKeyword = weatherKeywords.some(keyword => text.includes(keyword));
    
    if (!hasWeatherKeyword) {
        return null;
    }
    
    // 获取API配置
    let apiConfigToUse = apiConfig;
    if (!apiConfigToUse) {
        // 尝试从chrome.storage获取API配置
        try {
            const result = await chrome.storage.local.get(['zhipu_api_key']);
            if (result.zhipu_api_key) {
                apiConfigToUse = {
                    BASE_API_URL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                    API_MODEL: 'glm-4.5-flash',
                    API_KEY: result.zhipu_api_key
                };
            }
        } catch (error) {
            console.error('获取API配置失败:', error);
        }
    }
    
    // 使用AI分析用户意图和提取地理位置
    const userIntent = await analyzeWeatherIntent(text, weatherContext, apiConfigToUse);
    
    // 如果AI分析失败，直接返回错误信息
    if (!userIntent.province || !userIntent.city) {
        if (userIntent.intent === 'AI分析失败') {
            return '抱歉，AI意图分析失败，请稍后重试或提供更清晰的查询。';
        }
        return `抱歉，无法识别您要查询的地点。请提供更具体的城市名称，比如"北京天气"或"上海明天"。`;
    }
    
    // 查询天气
    return await queryWeather(userIntent.province, userIntent.city, userIntent);
}

/**
 * 使用AI分析用户天气查询意图
 * @param {string} text - 用户输入的文本
 * @param {Array} weatherContext - 天气相关的历史上下文
 * @param {Object} apiConfig - API配置对象，包含BASE_API_URL, API_MODEL, API_KEY
 * @returns {Promise<Object>} - 返回用户意图对象
 */
async function analyzeWeatherIntent(text, weatherContext, apiConfig) {
    try {
        // 检查apiConfig是否存在
        if (!apiConfig || !apiConfig.API_KEY || !apiConfig.BASE_API_URL) {
            console.error('AI意图分析失败: API配置不完整');
            return {
                province: null,
                city: null,
                district: null,
                timeType: 'today',
                intent: 'AI分析失败'
            };
        }
        
        // 构建系统提示词
        const systemPrompt = `请分析用户的天气查询语句，提取相关信息。如果用户使用了省略表达（如"明天呢？"），请根据历史上下文推断完整意图。

历史上下文（如果有）：
${weatherContext && weatherContext.length > 0 ? 
    weatherContext.map((msg, index) => 
        `${index + 1}. ${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}`
    ).join('\n') : 
    '无'
}

分析规则：
1. 省份（sheng）
2. 城市（place）
3. 区县（district，可选）
4. 时间类型（timeType）：today/tomorrow/week
5. 用户意图描述

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

        // 构建API请求的消息数组
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
        ];

        // 调用AI API进行分析
        const response = await fetch(apiConfig.BASE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.API_KEY}`
            },
            body: JSON.stringify({
                model: apiConfig.API_MODEL,
                messages: messages,
                temperature: 0.1,
                max_tokens: 500 // 增加max_tokens避免内容被截断
            })
        });

        // 检查API响应状态
        if (!response.ok) {
            console.error('AI意图分析失败: API请求失败', response.status, response.statusText);
            return {
                province: null,
                city: null,
                district: null,
                timeType: 'today',
                intent: 'AI分析失败'
            };
        }

        const result = await response.json();
        
        // 检查API返回的结果格式
        if (!result.choices || !result.choices[0] || !result.choices[0].message) {
            console.error('AI意图分析失败: API返回结果格式不正确', JSON.stringify(result, null, 2));
            return {
                province: null,
                city: null,
                district: null,
                timeType: 'today',
                intent: 'AI分析失败'
            };
        }
        
        // 获取AI返回的内容（优先使用content，然后是reasoning_content）
        let aiResponseContent = '';
        if (result.choices[0].message.content && result.choices[0].message.content.trim()) {
            aiResponseContent = result.choices[0].message.content.trim();
        } else if (result.choices[0].message.reasoning_content && result.choices[0].message.reasoning_content.trim()) {
            aiResponseContent = result.choices[0].message.reasoning_content.trim();
        } else {
            console.error('AI意图分析失败: API返回内容为空', JSON.stringify(result, null, 2));
            return {
                province: null,
                city: null,
                district: null,
                timeType: 'today',
                intent: 'AI分析失败'
            };
        }
        
        console.log('AI原始返回内容:', aiResponseContent);
        
        try {
            const analysisResult = JSON.parse(aiResponseContent);
            
            // 检查解析后的结果是否包含必要字段
            if (!analysisResult.province && !analysisResult.city) {
                console.error('AI意图分析失败: 解析结果缺少必要的省份或城市信息', analysisResult);
                return {
                    province: null,
                    city: null,
                    district: null,
                    timeType: 'today',
                    intent: 'AI分析失败'
                };
            }
            
            return {
                province: analysisResult.province,
                city: analysisResult.city,
                district: analysisResult.district || null,
                timeType: analysisResult.timeType || 'today',
                intent: analysisResult.intent
            };
        } catch (jsonError) {
            console.error('AI意图分析失败: JSON解析错误', jsonError);
            console.error('原始AI返回内容:', aiResponseContent);
            
            // 尝试修复可能被截断的JSON
            try {
                // 提取可能的JSON部分
                const jsonMatch = aiResponseContent.match(/\{[^}]*\}/s);
                if (jsonMatch) {
                    const fixedJson = jsonMatch[0];
                    const analysisResult = JSON.parse(fixedJson);
                    
                    if (analysisResult.province || analysisResult.city) {
                        console.log('AI意图分析: 成功修复截断的JSON', analysisResult);
                        return {
                            province: analysisResult.province,
                            city: analysisResult.city,
                            district: analysisResult.district || null,
                            timeType: analysisResult.timeType || 'today',
                            intent: analysisResult.intent || '修复后的天气查询'
                        };
                    }
                }
            } catch (fixError) {
                console.error('AI意图分析失败: 修复JSON失败', fixError);
            }
            
            // 如果修复失败，尝试从文本中提取位置信息
            try {
                const provinceMatch = aiResponseContent.match(/省份是"([^"]+)"/);
                const cityMatch = aiResponseContent.match(/城市是"([^"]+)"/);
                const districtMatch = aiResponseContent.match(/区县是"([^"]+)"/);
                const timeTypeMatch = aiResponseContent.match(/时间类型是"([^"]+)"/);
                
                const extractedInfo = {
                    province: provinceMatch ? provinceMatch[1] : null,
                    city: cityMatch ? cityMatch[1] : null,
                    district: districtMatch ? districtMatch[1] : null,
                    timeType: timeTypeMatch ? timeTypeMatch[1] : 'today',
                    intent: '从文本提取的天气查询'
                };
                
                if (extractedInfo.province || extractedInfo.city) {
                    console.log('AI意图分析: 成功从文本提取位置信息', extractedInfo);
                    return extractedInfo;
                }
            } catch (extractError) {
                console.error('AI意图分析失败: 从文本提取信息失败', extractError);
            }
            
            // 所有修复尝试都失败
            return {
                province: null,
                city: null,
                district: null,
                timeType: 'today',
                intent: 'AI分析失败'
            };
        }
        
    } catch (error) {
        console.error('AI意图分析失败:', error);
        return {
            province: null,
            city: null,
            district: null,
            timeType: 'today',
            intent: 'AI分析失败'
        };
    }
}

// 导出所有函数
if (typeof module !== 'undefined' && module.exports) {
    // Node.js环境
    module.exports = {
        queryWeather,
        getTargetWeatherDay,
        getWeekDay,
        createWeatherCard,
        createSingleDayWeatherCard,
        createWeekWeatherCard,
        handleWeatherQuery,
        analyzeWeatherIntent
    };
} else if (typeof window !== 'undefined') {
    // 浏览器环境
    window.WeatherModule = {
        queryWeather,
        getTargetWeatherDay,
        getWeekDay,
        createWeatherCard,
        createSingleDayWeatherCard,
        createWeekWeatherCard,
        handleWeatherQuery,
        analyzeWeatherIntent
    };
}