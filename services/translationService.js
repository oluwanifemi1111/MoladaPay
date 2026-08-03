const axios = require('axios');

class TranslationService {
  constructor() {
    this.cache = new Map();
    // Use free LibreTranslate instance (or self-host)
    this.apiUrl = 'https://libretranslate.com/translate';
  }

  async translate(text, targetLang, sourceLang = 'en') {
    if (targetLang === sourceLang) return text;

    const cacheKey = `${sourceLang}:${targetLang}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await axios.post(this.apiUrl, {
        q: text,
        source: sourceLang,
        target: targetLang,
        format: 'text'
      });

      const translated = response.data.translatedText;
      this.cache.set(cacheKey, translated);
      return translated;
    } catch (error) {
      console.error('Translation error:', error.message);
      return text; // Return original on error
    }
  }

  async translateObject(obj, targetLang, sourceLang = 'en') {
    const translated = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        translated[key] = await this.translate(value, targetLang, sourceLang);
      } else if (typeof value === 'object' && value !== null) {
        translated[key] = await this.translateObject(value, targetLang, sourceLang);
      } else {
        translated[key] = value;
      }
    }
    return translated;
  }
}

module.exports = new TranslationService();