const axios = require("axios");
const cache = new Map();

async function translateText(text, toLang) {
    if (toLang === "en") return text;
    const cacheKey = `${toLang}:${text}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    try {
        const res = await axios.get("https://api.mymemory.translated.net/get", {
            params: { q: text, langpair: `en|${toLang}` },
        });
        const translated = res.data.responseData.translatedText;
        cache.set(cacheKey, translated);
        return translated;
    } catch (err) {
        console.error("Translation failed:", err.message);
        return text;
    }
}

module.exports = async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async (body) => {
        const lang = req.user?.language || "en";
        if (lang === "en" || typeof body !== "object") return originalJson(body);

        const translatedBody = {};
        for (const [key, value] of Object.entries(body)) {
            translatedBody[key] = typeof value === "string"
                ? await translateText(value, lang)
                : value;
        }

        originalJson(translatedBody);
    };

    next();
};