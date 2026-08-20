import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0"

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  const expectedSecret = Deno.env.get("SERVER_REPORT_SECRET")
  if (!expectedSecret) {
    console.error("server-report is not configured with SERVER_REPORT_SECRET")
    return jsonResponse({ error: "Internal server error" }, 500)
  }

  if (req.method !== "POST") {
    console.warn("server-report rejected non-POST request")
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  if (req.headers.get("x-report-secret") !== expectedSecret) {
    console.warn("server-report rejected unauthorized request")
    return jsonResponse({ error: "Unauthorized" }, 401)
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const resendApiKey = Deno.env.get("RESEND_API_KEY")

    if (!supabaseUrl || !supabaseServiceKey || !resendApiKey) {
      console.error("Missing Supabase or Resend configuration")
      return jsonResponse({ error: "Internal server error" }, 500)
    }

    const client = createClient(supabaseUrl, supabaseServiceKey)

    // Check frequency
    const { data: freqData, error: freqError } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "recurring_report_frequency")
      .maybeSingle()

    if (freqError) throw freqError
    const frequency = freqData?.value ?? "off"
    
    if (frequency === "off") {
      return jsonResponse({ message: "Report frequency is off" }, 200)
    }

    // Check last sent
    const { data: lastSentData, error: lastSentError } = await client
      .from("app_settings")
      .select("value")
      .eq("key", "recurring_report_last_sent_at")
      .maybeSingle()
      
    if (lastSentError) throw lastSentError
    const lastSentAtStr = lastSentData?.value
    const lastSentAt = lastSentAtStr ? new Date(lastSentAtStr) : null

    const now = new Date()
    
    // Determine if it's time to run
    let shouldRun = false
    if (!lastSentAt) {
      shouldRun = true
    } else {
      const hoursDiff = (now.getTime() - lastSentAt.getTime()) / (1000 * 60 * 60)
      if (frequency === "hourly" && hoursDiff >= 1) shouldRun = true
      if (frequency === "daily" && hoursDiff >= 24) shouldRun = true
      if (frequency === "weekly" && hoursDiff >= 24 * 7) shouldRun = true
    }

    if (!shouldRun) {
      return jsonResponse({ message: "Not time to run yet" }, 200)
    }

    // Gather stats
    const since = lastSentAt ? lastSentAt.toISOString() : new Date(0).toISOString()

    const [{ count: totalUsers }, { count: totalChannels }, { count: newUsers }, { count: newChannels }, { data: storageTotalData }] = await Promise.all([
      client.from('profiles').select('id', { count: 'exact', head: true }),
      client.from('channels').select('id', { count: 'exact', head: true }),
      client.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since),
      client.from('channels').select('id', { count: 'exact', head: true }).gte('created_at', since),
      client.rpc('admin_get_image_storage_total')
    ])

    const storageTotalBytes = Number(storageTotalData ?? 0)
    const storageTotalMB = (storageTotalBytes / (1024 * 1024)).toFixed(2)

    // Get admins to send to
    const { data: admins } = await client.from('profiles').select('id').eq('server_admin', true)
    if (!admins || admins.length === 0) {
      return jsonResponse({ message: "No admins to send to" }, 200)
    }

    // Fetch emails from auth.users using service role
    const adminIds = admins.map(a => a.id)
    const { data: usersData, error: usersError } = await client.auth.admin.listUsers()
    if (usersError) throw usersError

    const adminEmails = usersData.users
      .filter(u => adminIds.includes(u.id) && u.email)
      .map(u => u.email as string)

    if (adminEmails.length === 0) {
      return jsonResponse({ message: "Admins have no emails" }, 200)
    }

    // Prepare email
    const subject = `TTRPGPbP Server Report (${frequency})`
    const html = `
      <h2>Server Report</h2>
      <p>Here is your recurring server report.</p>
      <ul>
        <li><strong>Total Users:</strong> ${totalUsers ?? 0}</li>
        <li><strong>Total Channels:</strong> ${totalChannels ?? 0}</li>
        <li><strong>New Users (since last report):</strong> ${newUsers ?? 0}</li>
        <li><strong>New Channels (since last report):</strong> ${newChannels ?? 0}</li>
        <li><strong>Image Storage Total:</strong> ${storageTotalMB} MB</li>
      </ul>
    `

    // Send email via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "TTRPGPbP Admin <reports@rolebypost.com>",
        to: adminEmails,
        subject,
        html
      })
    })

    if (!resendRes.ok) {
      const errText = await resendRes.text()
      console.error("Resend error:", errText)
      throw new Error(`Failed to send email: ${errText}`)
    }

    // Update last_sent_at
    await client
      .from('app_settings')
      .upsert({ key: 'recurring_report_last_sent_at', value: `"${now.toISOString()}"` }, { onConflict: 'key' })

    return jsonResponse({ success: true, message: "Report sent" }, 200)
  } catch (err) {
    console.error("server-report error:", err)
    return jsonResponse({ error: "Internal server error" }, 500)
  }
})
