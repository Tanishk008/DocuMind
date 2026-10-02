// PDF Export Utility — Uses jsPDF to generate a branded Q&A analysis report
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConstructor = any

export interface ExportResult {
  question: string
  answer: string
  citation?: string
  confidence: number
  sources: string[]
  foundInDocument: boolean
}

function wrapText(text: string, maxWidth: number, charWidth: number): string[] {
  const words = text.split(" ")
  const lines: string[] = []
  let current = ""
  const maxChars = Math.floor(maxWidth / charWidth)

  for (const word of words) {
    if ((current + word).length > maxChars) {
      if (current) lines.push(current.trim())
      current = word + " "
    } else {
      current += word + " "
    }
  }
  if (current.trim()) lines.push(current.trim())
  return lines
}

export async function exportResultsToPdf(
  results: ExportResult[],
  documentNames: string[],
  userName?: string
): Promise<void> {
  // Dynamic import to avoid SSR issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jsPDFModule = await import("jspdf")
  const jsPDF: AnyConstructor = jsPDFModule.default || jsPDFModule.jsPDF || jsPDFModule

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = margin

  const checkPage = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  // ─── Header ───
  // Background header bar
  doc.setFillColor(37, 99, 235) // blue-600
  doc.rect(0, 0, pageWidth, 28, "F")

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text("DocuMind AI", margin, 12)

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text("Intelligent Document Analysis Report", margin, 20)

  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  doc.text(dateStr, pageWidth - margin, 12, { align: "right" })
  if (userName) doc.text(`Prepared for: ${userName}`, pageWidth - margin, 20, { align: "right" })

  y = 38

  // ─── Document Names ───
  doc.setFillColor(243, 244, 246) // gray-100
  doc.rect(margin, y, contentWidth, 16, "F")
  doc.setTextColor(55, 65, 81) // gray-700
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("📄 Source Documents:", margin + 4, y + 6)
  doc.setFont("helvetica", "normal")
  doc.text(documentNames.join(" • ") || "Uploaded Files", margin + 4, y + 13)
  y += 24

  // ─── Summary row ───
  const found = results.filter(r => r.foundInDocument).length
  const avgConf = results.length ? Math.round(results.reduce((a, r) => a + r.confidence, 0) / results.length) : 0

  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.setFont("helvetica", "normal")
  doc.text(`${results.length} Question(s) Analyzed  •  ${found} Answer(s) Found  •  Avg. Confidence: ${avgConf}%`, margin, y)
  y += 10

  // ─── Divider ───
  doc.setDrawColor(226, 232, 240)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // ─── Results ───
  results.forEach((result, index) => {
    checkPage(30)

    // Question header
    const statusColor = result.foundInDocument ? [22, 163, 74] : [239, 68, 68] // green or red
    doc.setFillColor(...(statusColor as [number, number, number]))
    doc.rect(margin, y, 4, 10, "F")

    doc.setTextColor(15, 23, 42)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text(`Q${index + 1}: ${result.question}`, margin + 8, y + 7)
    y += 14

    // Confidence badge
    doc.setFillColor(219, 234, 254) // blue-100
    doc.roundedRect(margin + 8, y, 42, 7, 2, 2, "F")
    doc.setTextColor(29, 78, 216) // blue-700
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.text(result.foundInDocument ? `✓ Found  ${result.confidence}% confidence` : "✗ Not found in document", margin + 11, y + 5)
    y += 12

    // Answer text
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")

    const answerLines = wrapText(result.answer.replace(/[\u2500-\u257F]/g, "-"), contentWidth - 10, 2.1)
    for (const line of answerLines) {
      checkPage(6)
      doc.text(line, margin + 8, y)
      y += 5.5
    }
    y += 3

    // Citation block
    if (result.citation && result.foundInDocument) {
      checkPage(18)
      doc.setFillColor(254, 252, 232) // yellow-50
      doc.roundedRect(margin + 8, y, contentWidth - 8, 14, 2, 2, "F")
      doc.setDrawColor(234, 179, 8) // yellow-500
      doc.roundedRect(margin + 8, y, contentWidth - 8, 14, 2, 2, "S")
      doc.setTextColor(133, 77, 14)
      doc.setFontSize(8)
      doc.setFont("helvetica", "bold")
      doc.text("📌 Citation:", margin + 12, y + 5)
      doc.setFont("helvetica", "italic")
      const citLines = wrapText(`"${result.citation}"`, contentWidth - 20, 2.1)
      if (citLines[0]) doc.text(citLines[0], margin + 12, y + 11)
      y += 18
    }

    // Sources
    if (result.sources.length > 0) {
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(100, 116, 139)
      doc.text(`Sources: ${result.sources.join(", ")}`, margin + 8, y)
      y += 6
    }

    // Divider between results
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, y + 2, pageWidth - margin, y + 2)
    y += 10
  })

  // ─── Footer on all pages ───
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFillColor(248, 250, 252)
    doc.rect(0, pageHeight - 10, pageWidth, 10, "F")
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    doc.text("DocuMind AI — Confidential Analysis Report", margin, pageHeight - 4)
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 4, { align: "right" })
  }

  doc.save(`DocuMind_Analysis_${new Date().toISOString().split("T")[0]}.pdf`)
}
