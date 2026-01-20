import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import FormData from "form-data";

dotenv.config();

const app = express();
app.use(express.json());

// =======================
// CONFIG
// =======================
const AI_API_URL = process.env.AI_API_URL;
const LINE_REPLY_API = "https://api.line.me/v2/bot/message/reply";

if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  throw new Error("❌ LINE_CHANNEL_ACCESS_TOKEN not set");
}
if (!AI_API_URL) {
  throw new Error("❌ AI_API_URL not set");
}

// =======================
// HEALTH CHECK
// =======================
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "LINE BMI Bot" });
});

// =======================
// LINE WEBHOOK
// =======================
app.post("/webhook", async (req, res) => {
  // ตอบ LINE ทันที กัน timeout
  res.sendStatus(200);

  const event = req.body?.events?.[0];
  if (!event) return;

  const replyToken = event.replyToken;

  try {
    // =======================
    // 1️⃣ รับเฉพาะรูป
    // =======================
    if (event.message?.type !== "image") {
      await replyLine(
        replyToken,
        "📸 กรุณาส่ง *ภาพใบหน้าตรง* เพื่อประเมินสถานะ BMI นะคะ 😊"
      );
      return;
    }

    const imageId = event.message.id;

    // =======================
    // 2️⃣ โหลดรูปจาก LINE
    // =======================
    const imageRes = await axios.get(
      `https://api-data.line.me/v2/bot/message/${imageId}/content`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        responseType: "arraybuffer",
        timeout: 15000,
      }
    );

    // =======================
    // 3️⃣ เตรียม form-data
    // =======================
    const form = new FormData();
    form.append("file", imageRes.data, {
      filename: "image.jpg",
      contentType: "image/jpeg",
    });

    // =======================
    // 4️⃣ ส่งไป AI Backend
    // =======================
    const aiRes = await axios.post(
      `${AI_API_URL}/predict`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Accept: "application/json",
        },
        timeout: 30000,
      }
    );

    // =======================
    // 5️⃣ อ่าน response จาก backend
    // =======================
    const {
      ok,
      class: bmiClass,
      confidence,
      error,
      message,
    } = aiRes.data || {};

    // =======================
    // 6️⃣ backend reject
    // =======================
    if (!ok) {
      await replyLine(
        replyToken,
        message || "ไม่สามารถประเมินจากภาพนี้ได้ กรุณาลองใหม่อีกครั้งนะคะ"
      );
      return;
    }

    // =======================
    // 7️⃣ backend success
    // =======================
    if (!bmiClass || typeof confidence !== "number") {
      await replyLine(
        replyToken,
        "❌ ระบบวิเคราะห์มีปัญหา กรุณาลองใหม่อีกครั้งนะคะ"
      );
      return;
    }

    const statusMap = {
      under: "ต่ำกว่าเกณฑ์",
      normal: "สมส่วน",
      over: "สูงกว่าเกณฑ์",
    };

    const replyText = `
🧠 ผลการประเมินจาก AI
━━━━━━━━━━━━━━
สถานะร่างกาย: ${statusMap[bmiClass] || bmiClass}
ความมั่นใจ: ${(confidence * 100).toFixed(1)}%

⚠️ เป็นการประเมินจากภาพ
ไม่สามารถใช้แทนการตรวจวัดจริงได้
`.trim();

    await replyLine(replyToken, replyText);

  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);

    if (!replyToken) return;

    if (err.code === "ECONNABORTED") {
      await replyLine(
        replyToken,
        "⏳ ระบบประมวลผลใช้เวลานาน กรุณาลองใหม่อีกครั้งนะคะ"
      );
      return;
    }

    await replyLine(
      replyToken,
      "ขออภัย ระบบมีปัญหาชั่วคราว 😢"
    );
  }
});

// =======================
// Reply LINE
// =======================
async function replyLine(replyToken, text) {
  await axios.post(
    LINE_REPLY_API,
    {
      replyToken,
      messages: [{ type: "text", text }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );
}

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ LINE Bot running on port ${PORT}`);
});
