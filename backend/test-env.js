require('dotenv').config();
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? '✓ Loaded: ' + process.env.GROQ_API_KEY.substring(0,15) + '...' : '✗ Missing');
