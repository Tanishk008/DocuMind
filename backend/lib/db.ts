// Postgres (Supabase) data-access layer — replaces the previous Mongoose models.
// Every exported function maps 1:1 to what a server.ts route needs; keeping raw SQL out of
// server.ts keeps the routes readable and the query shape centralized in one place.
import pool from "./pg"

export interface UserRow {
  id: string
  email: string
  password: string
  name: string
  role: "admin" | "user"
  phone: string
  address: string
  total_queries: number
  current_step: number
  storage_used: number
  created_at: Date
  updated_at: Date
}

export interface DocumentRow {
  id: string
  doc_id: string
  user_email: string
  name: string
  size: number
  type: string
  url: string
  content: string
  summary: string
  document_type: string
  tags: string[]
  uploaded_at: Date
  nodes: any[]
  edges: any[]
}

export interface QuestionRow {
  id: string
  q_id: string
  user_email: string
  text: string
  answer: string
  citation: string
  confidence: number
  sources: string[]
  document_name: string
  found_in_document: boolean
  timestamp: Date
}

export interface ShareLinkRow {
  id: string
  share_id: string
  user_email: string
  document_names: string[]
  answers: any[]
  created_at: Date
  expires_at: Date
}

export interface ActivityLogRow {
  id: string
  user_email: string
  action: string
  details: string
  timestamp: Date
}

const genId = () => Math.random().toString(36).substring(2, 11)

// ─── USERS ──────────────────────────────────────────────────────────────────
export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query("select * from users where email = $1", [email.toLowerCase()])
  return rows[0] || null
}

export async function createUser(params: { email: string; password: string; name: string }): Promise<UserRow> {
  const { rows } = await pool.query(
    `insert into users (email, password, name) values ($1, $2, $3) returning *`,
    [params.email.toLowerCase(), params.password, params.name]
  )
  return rows[0]
}

// Generic partial update — accepts a subset of camelCase fields and maps them to columns.
export async function updateUser(email: string, fields: Record<string, any>): Promise<UserRow | null> {
  const columnMap: Record<string, string> = {
    name: "name",
    phone: "phone",
    address: "address",
    role: "role",
    currentStep: "current_step",
    totalQueries: "total_queries",
    storageUsed: "storage_used",
  }
  const sets: string[] = []
  const values: any[] = []
  let i = 1
  for (const [key, value] of Object.entries(fields)) {
    const col = columnMap[key]
    if (!col || value === undefined) continue
    sets.push(`${col} = $${i}`)
    values.push(value)
    i++
  }
  if (sets.length === 0) return getUserByEmail(email)

  values.push(email.toLowerCase())
  const { rows } = await pool.query(
    `update users set ${sets.join(", ")} where email = $${i} returning *`,
    values
  )
  return rows[0] || null
}

export async function updatePassword(email: string, hashedPassword: string): Promise<void> {
  await pool.query("update users set password = $1 where email = $2", [hashedPassword, email.toLowerCase()])
}

export async function incrementUserQueries(email: string, increment: number): Promise<void> {
  await pool.query(`update users set total_queries = total_queries + $1 where email = $2`, [increment, email.toLowerCase()])
}

export async function countUsers(): Promise<number> {
  const { rows } = await pool.query("select count(*)::int as count from users")
  return rows[0].count
}

export async function getUserGrowthSince(sinceDate: Date): Promise<{ date: string; count: number }[]> {
  const { rows } = await pool.query(
    `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date, count(*)::int as count
     from users where created_at >= $1 group by date order by date asc`,
    [sinceDate]
  )
  return rows
}

export async function getTopUsersByQueries(limit: number): Promise<{ email: string; name: string; queries: number }[]> {
  const { rows } = await pool.query(
    `select email, name, total_queries as queries from users where total_queries > 0 order by total_queries desc limit $1`,
    [limit]
  )
  return rows
}

export async function getTotalStorageUsed(): Promise<number> {
  const { rows } = await pool.query("select coalesce(sum(storage_used), 0)::bigint as total from users")
  return Number(rows[0].total)
}

export async function getTotalQueriesSum(): Promise<number> {
  const { rows } = await pool.query("select coalesce(sum(total_queries), 0)::bigint as total from users")
  return Number(rows[0].total)
}

// ─── UNIFIED USER (auth profile + documents + questions) ──────────────────
export async function getUnifiedUser(email: string) {
  const user = await getUserByEmail(email)
  if (!user) return null

  const docs = await getUserDocuments(email)
  const questions = await getUserQuestions(email)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone,
    address: user.address,
    totalQueries: user.total_queries,
    currentStep: user.current_step || 1,
    documents: docs.map(documentRowToClient),
    questions: questions.map(questionRowToClient),
  }
}

function documentRowToClient(d: DocumentRow) {
  return {
    id: d.doc_id,
    name: d.name,
    size: d.size,
    type: d.type,
    url: d.url,
    content: d.content || "",
    summary: d.summary || "",
    documentType: d.document_type || "General",
    tags: d.tags || [],
    uploadedAt: d.uploaded_at,
    nodes: d.nodes || [],
    edges: d.edges || [],
  }
}

function questionRowToClient(q: QuestionRow) {
  return {
    id: q.q_id,
    text: q.text,
    answer: q.answer,
    confidence: q.confidence,
    sources: q.sources || [],
    timestamp: q.timestamp,
  }
}

// ─── DOCUMENTS ──────────────────────────────────────────────────────────────
export async function getUserDocuments(email: string): Promise<DocumentRow[]> {
  const { rows } = await pool.query("select * from user_documents where user_email = $1 order by uploaded_at asc", [email.toLowerCase()])
  return rows
}

export async function getDocumentByName(email: string, name: string): Promise<DocumentRow | null> {
  const { rows } = await pool.query("select * from user_documents where user_email = $1 and name = $2", [email.toLowerCase(), name])
  return rows[0] || null
}

export async function getDocumentByDocId(email: string, docId: string): Promise<DocumentRow | null> {
  const { rows } = await pool.query("select * from user_documents where user_email = $1 and doc_id = $2", [email.toLowerCase(), docId])
  return rows[0] || null
}

// Replaces the full document set for a user (matches the previous Mongo "deleteMany + insertMany"
// semantics), while preserving base64 content / graph data / summary / tags for documents that
// already existed and weren't given new values in this payload.
export async function replaceUserDocuments(email: string, docs: any[]): Promise<DocumentRow[]> {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const lowerEmail = email.toLowerCase()

    const { rows: existingRows } = await client.query("select * from user_documents where user_email = $1", [lowerEmail])
    const existingByName = new Map<string, DocumentRow>(existingRows.map((d: DocumentRow) => [d.name, d]))

    await client.query("delete from user_documents where user_email = $1", [lowerEmail])

    const saved: DocumentRow[] = []
    for (const d of docs) {
      const existing = existingByName.get(d.name)
      const content = d.content || existing?.content || ""
      const nodes = d.nodes && d.nodes.length > 0 ? d.nodes : (existing?.nodes || [])
      const edges = d.edges && d.edges.length > 0 ? d.edges : (existing?.edges || [])
      const summary = d.summary || existing?.summary || ""
      const tags = d.tags && d.tags.length > 0 ? d.tags : (existing?.tags || [])
      const documentType = d.documentType || existing?.document_type || "General"
      const docId = d.id || existing?.doc_id || genId()

      const { rows } = await client.query(
        `insert into user_documents
          (doc_id, user_email, name, size, type, url, content, summary, document_type, tags, uploaded_at, nodes, edges)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
        [
          docId, lowerEmail, d.name || "Unnamed", d.size || 0, d.type || "application/octet-stream",
          d.url || "", content, summary, documentType, tags,
          d.uploadedAt ? new Date(d.uploadedAt) : new Date(),
          JSON.stringify(nodes), JSON.stringify(edges),
        ]
      )
      saved.push(rows[0])
    }

    await client.query("commit")
    return saved
  } catch (e) {
    await client.query("rollback")
    throw e
  } finally {
    client.release()
  }
}

// Upserts a single document's graph/content — used by /api/analyze when a document is
// freshly processed (as opposed to already existing with a saved graph).
export async function upsertDocumentGraph(params: {
  email: string
  name: string
  docId?: string
  size: number
  type: string
  content: string
  nodes: any[]
  edges: any[]
}): Promise<DocumentRow> {
  const lowerEmail = params.email.toLowerCase()
  const { rows } = await pool.query(
    `insert into user_documents (doc_id, user_email, name, size, type, url, content, nodes, edges)
     values ($1,$2,$3,$4,$5,'',$6,$7,$8)
     on conflict (user_email, name) do update set
       size = excluded.size,
       type = excluded.type,
       content = case when user_documents.content = '' then excluded.content else user_documents.content end,
       nodes = excluded.nodes,
       edges = excluded.edges
     returning *`,
    [params.docId || genId(), lowerEmail, params.name, params.size, params.type, params.content, JSON.stringify(params.nodes), JSON.stringify(params.edges)]
  )
  return rows[0]
}

export async function backfillDocumentContent(email: string, name: string, content: string): Promise<void> {
  await pool.query(
    `update user_documents set content = $1 where user_email = $2 and name = $3 and content = ''`,
    [content, email.toLowerCase(), name]
  )
}

export async function updateDocumentSummary(email: string, docId: string, summary: string, documentType: string): Promise<void> {
  await pool.query(
    `update user_documents set summary = $1, document_type = $2 where user_email = $3 and doc_id = $4`,
    [summary, documentType, email.toLowerCase(), docId]
  )
}

export async function updateDocumentTags(email: string, docId: string, tags: string[]): Promise<void> {
  await pool.query(`update user_documents set tags = $1 where user_email = $2 and doc_id = $3`, [tags, email.toLowerCase(), docId])
}

export async function countDocuments(): Promise<number> {
  const { rows } = await pool.query("select count(*)::int as count from user_documents")
  return rows[0].count
}

export async function getDocTypeDistribution(): Promise<{ type: string; count: number }[]> {
  const { rows } = await pool.query(
    `select coalesce(document_type, 'General') as type, count(*)::int as count
     from user_documents group by document_type order by count desc`
  )
  return rows
}

// ─── QUESTIONS ──────────────────────────────────────────────────────────────
export async function getUserQuestions(email: string): Promise<QuestionRow[]> {
  const { rows } = await pool.query("select * from user_questions where user_email = $1 order by \"timestamp\" asc", [email.toLowerCase()])
  return rows
}

export async function replaceUserQuestions(email: string, questions: any[]): Promise<QuestionRow[]> {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const lowerEmail = email.toLowerCase()
    await client.query("delete from user_questions where user_email = $1", [lowerEmail])

    const saved: QuestionRow[] = []
    for (const q of questions) {
      const { rows } = await client.query(
        `insert into user_questions (q_id, user_email, text, answer, citation, confidence, sources, found_in_document, "timestamp")
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning *`,
        [
          q.id || genId(), lowerEmail, q.text || "", q.answer || "", q.citation || "",
          q.confidence || 95, q.sources || [], q.foundInDocument !== false,
          q.timestamp ? new Date(q.timestamp) : new Date(),
        ]
      )
      saved.push(rows[0])
    }
    await client.query("commit")
    return saved
  } catch (e) {
    await client.query("rollback")
    throw e
  } finally {
    client.release()
  }
}

// Appends Q&A history logs (used by /api/analyze after answering a batch of questions) —
// additive, unlike replaceUserQuestions which is a full-sync replace from the query page.
export async function appendQuestionLogs(email: string, logs: Array<{
  text: string; answer: string; citation?: string; confidence: number; sources: string[]; documentName: string; foundInDocument: boolean
}>): Promise<void> {
  if (logs.length === 0) return
  const lowerEmail = email.toLowerCase()
  const client = await pool.connect()
  try {
    await client.query("begin")
    for (const log of logs) {
      await client.query(
        `insert into user_questions (q_id, user_email, text, answer, citation, confidence, sources, document_name, found_in_document)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [genId(), lowerEmail, log.text, log.answer, log.citation || "", log.confidence, log.sources, log.documentName, log.foundInDocument]
      )
    }
    await client.query("commit")
  } catch (e) {
    await client.query("rollback")
    throw e
  } finally {
    client.release()
  }
}

// ─── SHARE LINKS ────────────────────────────────────────────────────────────
export async function createShareLink(params: { shareId: string; userEmail: string; documentNames: string[]; answers: any[] }): Promise<ShareLinkRow> {
  const { rows } = await pool.query(
    `insert into share_links (share_id, user_email, document_names, answers) values ($1,$2,$3,$4) returning *`,
    [params.shareId, params.userEmail.toLowerCase(), params.documentNames, JSON.stringify(params.answers)]
  )
  return rows[0]
}

export async function getShareLink(shareId: string): Promise<ShareLinkRow | null> {
  const { rows } = await pool.query("select * from share_links where share_id = $1", [shareId])
  return rows[0] || null
}

export async function deleteShareLink(shareId: string): Promise<void> {
  await pool.query("delete from share_links where share_id = $1", [shareId])
}

// ─── ACTIVITY LOGS ──────────────────────────────────────────────────────────
export async function createActivityLog(params: { userEmail: string; action: string; details?: string }): Promise<void> {
  await pool.query(
    `insert into activity_logs (user_email, action, details) values ($1,$2,$3)`,
    [params.userEmail.toLowerCase(), params.action, params.details || ""]
  )
}

export async function getActivityLogs(params: { email?: string; limit: number }): Promise<ActivityLogRow[]> {
  if (params.email) {
    const { rows } = await pool.query(
      `select * from activity_logs where user_email = $1 order by "timestamp" desc limit $2`,
      [params.email.toLowerCase(), params.limit]
    )
    return rows
  }
  const { rows } = await pool.query(`select * from activity_logs order by "timestamp" desc limit $1`, [params.limit])
  return rows
}
