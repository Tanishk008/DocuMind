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
const MODELS = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-exp"];

async function checkDetailed() {
  for (let ki = 0; ki < keys.length; ki++) {
    const apiKey = keys[ki];
    console.log(`\nChecking Key ${ki+1} (${apiKey.slice(0, 8)}...):`);
    for (const model of MODELS) {
      try {
        const llm = new ChatGoogleGenerativeAI({ apiKey, model, temperature: 0.1, maxRetries: 0 });
        await llm.invoke("Hi");
        console.log(`  ✅ Model ${model} is WORKING.`);
      } catch (e) {
        if (e.message.includes("429") || e.message.includes("quota")) {
          console.log(`  ⚠️ Model ${model}: RATE LIMITED (429)`);
        } else if (e.message.includes("403") || e.message.includes("API_KEY_INVALID")) {
          console.log(`  ❌ Model ${model}: INVALID API KEY (403)`);
        } else if (e.message.includes("404")) {
          console.log(`  🔍 Model ${model}: NOT FOUND (404)`);
        } else {
          console.log(`  ❓ Model ${model} failed: ${e.message.split('\n')[0]}`);
        }
      }
    }
  }
}

checkDetailed();
