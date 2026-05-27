const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const fs = require('fs');
const path = require('path');

function getAllApiKeys(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2 && parts[0].trim()) {
      env[parts[0].trim()] = parts[1].split('#')[0].trim();
    }
  });
  const keys = [];
  const base = env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (base && !base.includes("your_")) keys.push(base);
  for (let i = 2; i <= 10; i++) {
    const k = env[`GOOGLE_GENERATIVE_AI_API_KEY_${i}`];
    if (k && !k.includes("your_")) keys.push(k);
  }
  return keys;
}

const keys = getAllApiKeys(".env.local");
// Broad range of possible model names to find ANY working one
const MODELS = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-exp"];

async function finalCheck() {
  console.log(`Checking ${keys.length} keys for ANY working combination...`);
  
  for (let ki = 0; ki < keys.length; ki++) {
    const apiKey = keys[ki];
    for (const model of MODELS) {
      try {
        const llm = new ChatGoogleGenerativeAI({ apiKey, model, temperature: 0.1, maxRetries: 0 });
        const res = await llm.invoke("Hi");
        console.log(`✅ Key ${ki+1} Model ${model} is WORKING!`);
        return true;
      } catch (e) {
        // Silently continue
      }
    }
    console.log(`Key ${ki+1} is fully exhausted or invalid.`);
  }
  return false;
}

finalCheck().then(anyWork => {
  if (anyWork) console.log("RESULT: SUCCESS_FOUND");
  else console.log("RESULT: ALL_FAILED");
});
