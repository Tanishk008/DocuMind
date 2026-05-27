const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
require('dotenv').config({path: '.env.local'});
async function test() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  try {
    const emb = new GoogleGenerativeAIEmbeddings({ apiKey, modelName: "text-embedding-004" });
    const res = await emb.embedQuery("Hi");
    console.log("text-embedding-004 works. len:", res.length);
  } catch(e) { console.log("text-embedding-004 err:", e.message); }
  
  try {
    const emb2 = new GoogleGenerativeAIEmbeddings({ apiKey, modelName: "gemini-embedding-001" });
    const res2 = await emb2.embedQuery("Hi");
    console.log("gemini-embedding-001 works. len:", res2.length);
  } catch(e) { console.log("gemini-embedding-001 err:", e.message); }
}
test();
