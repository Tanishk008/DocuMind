const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatPromptTemplate } = require("@langchain/core/prompts");

async function test() {
  const llm = new ChatGoogleGenerativeAI({
    apiKey: "AIzaSyBM1ZZofDYWHyv2B7gJA9YXdI2oayOHy4c",
    model: "gemini-2.5-flash-lite",
    temperature: 0.2,
    maxRetries: 0,
  });

  const prompt = ChatPromptTemplate.fromTemplate(`You are an expert document analyst.
<thinking> Think securely about all questions before responding. </thinking>
Context: {context}

Questions:
{input}

Output Format:
After your thinking block, output exactly the answer to each question sequentially, separated exactly by:
========ANSWER========
`);

  const chain = prompt.pipe(llm);
  const questionsToProcess = ["What is the user name?", "When is the deadline?"];
  const inputStr = questionsToProcess.map((q, i) => `${i+1}. ${q}`).join("\n");
  
  try {
    const res = await chain.invoke({
      context: "The user name is Tanishk. The deadline is tomorrow.",
      input: inputStr
    });
    console.log(res.content);
    let output = res.content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim();
    const answers = output.split("========ANSWER========").map(a => a.trim()).filter(Boolean);
    console.log("Extracted Answers:", answers);
  } catch(e) {
    console.error(e.message);
  }
}

test();
