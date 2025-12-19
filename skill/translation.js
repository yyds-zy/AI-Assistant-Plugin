// 翻译功能模块
// 提供中文到英文的翻译功能

const TRANSLATION_API_URL = 'https://api.mymzf.com/api/sgtranslate';
const TRANSLATION_API_KEY = '40c2354b9305a03d';

/**
 * 中文到英文翻译函数
 * @param {string} text - 需要翻译的中文文本
 * @returns {Promise<string>} - 翻译后的英文文本
 */
async function translateToEnglish(text) {
    try {
        const url = `${TRANSLATION_API_URL}?text=${encodeURIComponent(text)}&key=${TRANSLATION_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 200) {
            return data.data;
        } else {
            throw new Error(`翻译API错误: ${data.msg || '未知错误'}`);
        }
    } catch (error) {
        console.error('翻译失败:', error);
        throw error;
    }
}

// 浏览器环境导出
if (typeof window !== 'undefined') {
    window.TranslationModule = {
        translateToEnglish
    };
}