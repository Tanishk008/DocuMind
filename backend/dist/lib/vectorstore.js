"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVectorStore = getVectorStore;
const pinecone_1 = require("@pinecone-database/pinecone");
const pinecone_2 = require("@langchain/pinecone");
const google_genai_1 = require("@langchain/google-genai");
let vectorStoreInstance = null;
async function getVectorStore() {
    if (vectorStoreInstance)
        return vectorStoreInstance;
    const pinecone = new pinecone_1.Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
    });
    const index = pinecone.Index(process.env.PINECONE_INDEX);
    const embeddings = new google_genai_1.GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        modelName: "embedding-001",
    });
    vectorStoreInstance = await pinecone_2.PineconeStore.fromExistingIndex(embeddings, {
        pineconeIndex: index,
    });
    return vectorStoreInstance;
}
