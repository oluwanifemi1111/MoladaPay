
const translationService = require('../services/translationService');
const User = require('../models/User');

const languageMiddleware = async (req, res, next) => {
  // Default to English
  let language = 'en';

  // Priority 1: Check if user is authenticated and has saved preference
  if (req.user?.id) {
    try {
      const user = await User.findById(req.user.id).select('language');
      if (user?.language) {
        language = user.language;
      }
    } catch (err) {
      console.error('Error fetching user language:', err);
    }
  }
  
  // Priority 2: Check Accept-Language header
  if (language === 'en' && req.headers['accept-language']) {
    language = req.headers['accept-language'].split(',')[0].split('-')[0];
  }
  
  // Priority 3: Check query parameter
  if (req.query.lang) {
    language = req.query.lang;
  }

  req.language = language;

  // Override res.json to auto-translate responses
  const originalJson = res.json.bind(res);
  res.json = async function(body) {
    if (language !== 'en' && body && typeof body === 'object') {
      try {
        body = await translationService.translateObject(body, language);
      } catch (err) {
        console.error('Translation middleware error:', err);
      }
    }
    return originalJson(body);
  };

  next();
};

module.exports = languageMiddleware;
