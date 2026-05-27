// Quick check: test all 3 Groq keys
const { Groq } = require("groq-sdk");
const fs = require("fs");

function getGroqKeys() {
  const content = fs.readFileSync(".env.local", "utf8");
  const env = {};
  content.split("\n").forEach(line => {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      const k = line.slice(0, eqIdx).trim();
      const v = line.slice(eqIdx + 1).split("#")[0].trim();
      env[k] = v;
    }
  });
  const keys = [];
  if (env.GROQ_API_KEY) keys.push({ name: "Key 1", key: env.GROQ_API_KEY });
  for (let i = 2; i <= 10; i++) {
    const v = env[`GROQ_API_KEY_${i}`];
    if (v && v.trim()) keys.push({ name: `Key ${i}`, key: v });
  }
  return keys;
}

async function testKey({ name, key }) {
  const client = new Groq({ apiKey: key });
  try {
    const res = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 5,
    });
    console.log(`✅ ${name} (${key.slice(0, 12)}...): WORKING — "${res.choices[0].message.content.trim()}"`);
  } catch (e) {
    const code = e.status || e.code || "";
    if (String(e.message).includes("429") || String(e.message).includes("rate")) {
      console.log(`⚠️  ${name} (${key.slice(0, 12)}...): RATE LIMITED (429)`);
    } else if (String(e.message).includes("401") || String(e.message).includes("invalid")) {
      console.log(`❌ ${name} (${key.slice(0, 12)}...): INVALID KEY (401)`);
    } else {
      console.log(`❓ ${name} (${key.slice(0, 12)}...): FAILED — ${e.message.slice(0, 80)}`);
    }
  }
}

(async () => {
  const keys = getGroqKeys();
  console.log(`Found ${keys.length} Groq key(s)\n`);
  for (const k of keys) await testKey(k);
})();
