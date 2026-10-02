import { Pinecone } from "@pinecone-database/pinecone"
import { PineconeStore } from "@langchain/pinecone"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"

let vectorStoreInstance: PineconeStore | null = null

export async function getVectorStore(): Promise<PineconeStore> {
  if (vectorStoreInstance) return vectorStoreInstance

  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  })

  const index = pinecone.Index(process.env.PINECONE_INDEX!)

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
    modelName: "embedding-001",
  })

  vectorStoreInstance = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
  })

  return vectorStoreInstance
}
