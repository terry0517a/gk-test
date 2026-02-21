import nodemailer from 'nodemailer'

const user = process.env.GMAIL_USER
const pass = process.env.GMAIL_APP_PASSWORD

const transporter =
  user && pass
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      })
    : null

export async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) {
    console.log('[Email] 模擬發送（尚未設定 GMAIL_USER / GMAIL_APP_PASSWORD）')
    console.log(`[Email] 收件人: ${to}`)
    console.log(`[Email] 主旨: ${subject}`)
    console.log(`[Email] 內容: ${html}`)
    return { success: true, simulated: true }
  }

  const info = await transporter.sendMail({
    from: `GK 收藏家 <${user}>`,
    to,
    subject,
    html,
  })

  console.log('[Email] 已發送:', info.messageId)
  return { success: true, simulated: false, messageId: info.messageId }
}
