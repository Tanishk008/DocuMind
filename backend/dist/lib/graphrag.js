"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGraphFromChunk = extractGraphFromChunk;
exports.consolidateGraphs = consolidateGraphs;
exports.extractSeedEntities = extractSeedEntities;
exports.retrieveSubGraph = retrieveSubGraph;
exports.formatGraphAsText = formatGraphAsText;
const prompts_1 = require("@langchain/core/prompts");
const EXTRACTION_PROMPT = prompts_1.ChatPromptTemplate.fromTemplate(`
You are an advanced Knowledge Graph Extraction assistant.
Your task is to extract all key entities and relationships from the provided text chunk.

For the extraction:
1. Entities (Nodes): Identify people, organizations, dates, concepts, technologies, terms, locations, etc. Provide a short description for each.
2. Relationships (Edges): Identify how these entities connect or interact (e.g. PARTNERS_WITH, INVENTED, EMPLOYEE_OF, CONTAINS, IS_A, REPORTED_TO). Include a brief description/context for the relation.

Format your output ONLY as a strict JSON object with two keys: "nodes" and "edges".
Do NOT wrap your output in markdown code fences (like \`\`\`json) or add any explanatory text. Start with {{ and end with }}.

Example format:
{{
  "nodes": [
    {{ "id": "acme_corp", "label": "Acme Corp", "type": "Organization", "description": "A multinational technology conglomerate" }},
    {{ "id": "john_doe", "label": "John Doe", "type": "Person", "description": "CEO of Acme Corp since 2024" }}
  ],
  "edges": [
    {{ "source": "john_doe", "target": "acme_corp", "relation": "CEO_OF", "description": "John Doe is the CEO of Acme Corp" }}
  ]
}}

Text Chunk:
{text}

JSON Output:
`);
const SEED_PROMPT = prompts_1.ChatPromptTemplate.fromTemplate(`
You are an advanced Natural Language entity extractor.
Given a user query, identify the main entities (people, organizations, key concepts, technologies, terms, locations) mentioned in the query.
Return the entities as a plain comma-separated list of their exact names.
Do not add any additional text, explanation, or code blocks.

Query: {query}
Entities:
`);
/**
 * Extracts entities and relationships from a single text chunk using the provided LLM.
 */
async function extractGraphFromChunk(chunk, llm) {
    try {
        const chain = EXTRACTION_PROMPT.pipe(llm);
        const result = (await chain.invoke({ text: chunk }));
        let responseText = String(result.content ?? "").trim();
        // Clean up code fences if the LLM outputted them despite instructions
        const jsonStart = responseText.indexOf("{");
        const jsonEnd = responseText.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            responseText = responseText.substring(jsonStart, jsonEnd + 1);
        }
        const parsed = JSON.parse(responseText);
        return {
            nodes: parsed.nodes || [],
            edges: parsed.edges || [],
        };
    }
    catch (err) {
        console.error("[GraphRAG] Extraction failed for chunk:", err.message.slice(0, 150));
        return { nodes: [], edges: [] };
    }
}
/**
 * Consolidates and deduplicates nodes and edges extracted from multiple chunks.
 */
function consolidateGraphs(graphs) {
    const nodeMap = new Map();
    const edges = [];
    for (const g of graphs) {
        if (!g)
            continue;
        // Process nodes
        if (Array.isArray(g.nodes)) {
            for (const n of g.nodes) {
                if (!n || !n.label)
                    continue;
                // Standardize IDs: use the LLM-supplied id if available, otherwise build it from the label
                const rawId = n.id || n.label;
                const standardId = rawId.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                const existing = nodeMap.get(standardId);
                if (existing) {
                    // Merge descriptions if different
                    const descList = [existing.description, n.description]
                        .map((d) => (d || "").trim())
                        .filter((d) => d.length > 0);
                    const uniqueDescs = [...new Set(descList)];
                    const mergedDesc = uniqueDescs.join("; ");
                    nodeMap.set(standardId, {
                        id: standardId,
                        label: existing.label, // retain casing from first encounter
                        type: n.type || existing.type,
                        description: mergedDesc.slice(0, 300),
                    });
                }
                else {
                    nodeMap.set(standardId, {
                        id: standardId,
                        label: n.label.trim(),
                        type: n.type || "Concept",
                        description: (n.description || "").trim(),
                    });
                }
            }
        }
        // Process edges
        if (Array.isArray(g.edges)) {
            for (const e of g.edges) {
                if (!e || !e.source || !e.target || !e.relation)
                    continue;
                const sourceId = e.source.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                const targetId = e.target.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                // Store intermediate list (we filter/deduplicate later)
                edges.push({
                    source: sourceId,
                    target: targetId,
                    relation: e.relation.toUpperCase().trim(),
                    description: (e.description || "").trim(),
                });
            }
        }
    }
    // Keep only edges that refer to actual nodes
    const validEdges = edges.filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target));
    // Deduplicate identical edges (same source, target, and relation)
    const edgeMap = new Map();
    for (const e of validEdges) {
        const key = `${e.source}-${e.target}-${e.relation}`;
        const existing = edgeMap.get(key);
        if (existing) {
            const descList = [existing.description, e.description]
                .map((d) => (d || "").trim())
                .filter((d) => d.length > 0);
            const uniqueDescs = [...new Set(descList)];
            const mergedDesc = uniqueDescs.join("; ");
            edgeMap.set(key, {
                source: e.source,
                target: e.target,
                relation: e.relation,
                description: mergedDesc.slice(0, 300),
            });
        }
        else {
            edgeMap.set(key, e);
        }
    }
    return {
        nodes: Array.from(nodeMap.values()),
        edges: Array.from(edgeMap.values()),
    };
}
/**
 * Extracts seed entities from a user's question.
 */
async function extractSeedEntities(question, llm) {
    try {
        const chain = SEED_PROMPT.pipe(llm);
        const result = (await chain.invoke({ query: question }));
        const responseText = String(result.content ?? "").trim();
        if (!responseText)
            return [];
        return responseText
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }
    catch (err) {
        console.error("[GraphRAG] Seed entity extraction failed:", err.message);
        return [];
    }
}
/**
 * Retrieves a relevant local sub-graph surrounding the given seed entities using BFS.
 */
function retrieveSubGraph(nodes, edges, seeds, maxHops = 2) {
    if (seeds.length === 0)
        return { nodes: [], edges: [] };
    const seedIds = new Set(seeds.map((s) => s.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")));
    const visitedNodes = new Set();
    const retrievedEdges = new Set();
    // 1. Match seed entities directly by ID or normalized label
    const activeFrontier = new Set();
    for (const nodeId of seedIds) {
        const match = nodes.find((n) => n.id === nodeId ||
            n.label.toLowerCase().replace(/[^a-z0-9]/g, "").includes(nodeId.replace(/[^a-z0-9]/g, "")));
        if (match) {
            activeFrontier.add(match.id);
            visitedNodes.add(match.id);
        }
    }
    // 2. Fallback: partial match on parts of search query if no matches were found
    if (visitedNodes.size === 0) {
        for (const seed of seeds) {
            const searchStr = seed.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
            if (searchStr.length < 3)
                continue;
            for (const n of nodes) {
                const normalizedLabel = n.label.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (normalizedLabel.includes(searchStr)) {
                    activeFrontier.add(n.id);
                    visitedNodes.add(n.id);
                }
            }
        }
    }
    // 3. Breadth-First Search (BFS) traversal up to maxHops
    let currentHop = 0;
    let frontier = Array.from(activeFrontier);
    while (frontier.length > 0 && currentHop < maxHops) {
        const nextFrontier = new Set();
        for (const node of frontier) {
            for (const edge of edges) {
                if (edge.source === node) {
                    retrievedEdges.add(edge);
                    if (!visitedNodes.has(edge.target)) {
                        visitedNodes.add(edge.target);
                        nextFrontier.add(edge.target);
                    }
                }
                else if (edge.target === node) {
                    retrievedEdges.add(edge);
                    if (!visitedNodes.has(edge.source)) {
                        visitedNodes.add(edge.source);
                        nextFrontier.add(edge.source);
                    }
                }
            }
        }
        frontier = Array.from(nextFrontier);
        currentHop++;
    }
    // Retrieve the nodes that are in our visited set
    const retrievedNodes = nodes.filter((n) => visitedNodes.has(n.id));
    return {
        nodes: retrievedNodes,
        edges: Array.from(retrievedEdges),
    };
}
/**
 * Formats a retrieved sub-graph into a descriptive, natural language context block.
 */
function formatGraphAsText(graph) {
    if (graph.nodes.length === 0) {
        return "Knowledge Graph Context: No structured entity relationships were found matching the question seeds.";
    }
    let text = "=== Structured Knowledge Graph Context ===\n\n";
    text += "Extracted Entities & Definitions:\n";
    for (const n of graph.nodes) {
        const desc = n.description ? ` - Description: ${n.description}` : "";
        text += `- ${n.label} (Type: ${n.type})${desc}\n`;
    }
    text += "\nKnown Connections & Facts:\n";
    const nodeLabelMap = new Map(graph.nodes.map((n) => [n.id, n.label]));
    for (const e of graph.edges) {
        const sourceLabel = nodeLabelMap.get(e.source) || e.source;
        const targetLabel = nodeLabelMap.get(e.target) || e.target;
        const desc = e.description ? ` (${e.description})` : "";
        text += `- [${sourceLabel}] is connected to [${targetLabel}] via relationship: [${e.relation}]${desc}\n`;
    }
    text += "\n==========================================";
    return text;
}
