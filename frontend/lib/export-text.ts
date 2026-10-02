// Markdown / Word export utilities — pure client-side blob downloads, no new dependencies.
export interface ExportResult {
  question: string
  answer: string
  citation?: string
  confidence: number
  sources: string[]
  foundInDocument: boolean
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function buildMarkdown(results: ExportResult[], documentNames: string[], userName?: string): string {
  const lines: string[] = []
  lines.push(`# DocuMind AI — Analysis Report`)
  if (userName) lines.push(`**Prepared for:** ${userName}`)
  lines.push(`**Documents:** ${documentNames.join(", ") || "N/A"}`)
  lines.push(`**Generated:** ${new Date().toLocaleString()}`)
  lines.push("")
  lines.push("---")

  results.forEach((r, i) => {
    lines.push("")
    lines.push(`## Q${i + 1}. ${r.question}`)
    lines.push("")
    lines.push(r.foundInDocument ? `**Confidence:** ${r.confidence}%` : `**Status:** Not found in document`)
    lines.push("")
    lines.push(r.answer)
    if (r.citation) {
      lines.push("")
      lines.push(`> **Citation:** "${r.citation}"`)
    }
    if (r.sources.length > 0) {
      lines.push("")
      lines.push(`**Sources:** ${r.sources.join(", ")}`)
    }
    lines.push("")
    lines.push("---")
  })

  return lines.join("\n")
}

export function exportResultsToMarkdown(results: ExportResult[], documentNames: string[], userName?: string): void {
  const md = buildMarkdown(results, documentNames, userName)
  downloadBlob(md, `documind-analysis-${Date.now()}.md`, "text/markdown;charset=utf-8")
}

// Word doesn't get a real .docx here (that needs a heavyweight library); instead this uses
// the long-standing "HTML saved with a .doc extension" trick, which Word opens natively and
// renders with real headings/paragraphs — good enough for a text-based Q&A report.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function exportResultsToWord(results: ExportResult[], documentNames: string[], userName?: string): void {
  const body = results.map((r, i) => `
    <h2>Q${i + 1}. ${escapeHtml(r.question)}</h2>
    <p><b>${r.foundInDocument ? `Confidence: ${r.confidence}%` : "Status: Not found in document"}</b></p>
    <p>${escapeHtml(r.answer).replace(/\n/g, "<br/>")}</p>
    ${r.citation ? `<p><i>Citation: &quot;${escapeHtml(r.citation)}&quot;</i></p>` : ""}
    ${r.sources.length > 0 ? `<p><b>Sources:</b> ${escapeHtml(r.sources.join(", "))}</p>` : ""}
    <hr/>
  `).join("\n")

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>DocuMind AI Analysis Report</title></head>
    <body>
      <h1>DocuMind AI — Analysis Report</h1>
      ${userName ? `<p><b>Prepared for:</b> ${escapeHtml(userName)}</p>` : ""}
      <p><b>Documents:</b> ${escapeHtml(documentNames.join(", ") || "N/A")}</p>
      <p><b>Generated:</b> ${new Date().toLocaleString()}</p>
      <hr/>
      ${body}
    </body>
    </html>
  `

  downloadBlob(html, `documind-analysis-${Date.now()}.doc`, "application/msword")
}
