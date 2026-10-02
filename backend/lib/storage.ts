// Supabase Storage uploads for figures extracted out of uploaded PDFs and DOCX files.
//
// These used to be written to `../frontend/public/extracted_images`, which only worked when
// both apps shared one filesystem. With the backend on Render (ephemeral disk) and the
// frontend on Vercel, that path is unreachable, so the images go to object storage instead
// and are referenced by absolute public URLs.
import { createHash } from "crypto"

const BUCKET = "extracted-images"

function getConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, ""), key }
}

export function isStorageConfigured(): boolean {
  return getConfig() !== null
}

// Namespaces objects per owner so two users uploading a file with the same name can't
// overwrite or read each other's figures. Hashed so the public URL never leaks the email.
export function ownerPrefix(email?: string): string {
  if (!email) return "anonymous"
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16)
}

const encodePath = (objectPath: string) =>
  objectPath.split("/").map(encodeURIComponent).join("/")

// Returns the public URL of the uploaded image, or null if storage isn't configured or the
// upload failed. Callers treat null as "no image available" and carry on, matching how the
// old filesystem version degraded when a write failed.
export async function uploadExtractedImage(params: {
  objectPath: string
  data: Buffer
  contentType: string
}): Promise<string | null> {
  const cfg = getConfig()
  if (!cfg) {
    console.error("[Storage] SUPABASE_URL / SUPABASE_SECRET_KEY not set — skipping image upload")
    return null
  }

  const encoded = encodePath(params.objectPath)

  try {
    const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${encoded}`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        "Content-Type": params.contentType,
        "x-upsert": "true",
      },
      body: new Uint8Array(params.data),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[Storage] Upload failed for ${params.objectPath}: ${res.status} ${body.slice(0, 200)}`)
      return null
    }

    return `${cfg.url}/storage/v1/object/public/${BUCKET}/${encoded}`
  } catch (err: any) {
    console.error(`[Storage] Upload error for ${params.objectPath}:`, err?.message)
    return null
  }
}
