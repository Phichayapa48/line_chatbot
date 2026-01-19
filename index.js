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
const AI_API_URL = process.env.AI_API_URL; // https://xxx.onrender.com
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
  // 🔴 ตอบ LINE ทันที กัน timeout
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
        "📸 กรุณาส่ง *ภาพใบหน้าตรง* เพื่อประเมินค่า BMI นะคะ 😊"
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
    // 5️⃣ ตรวจ response
    // =======================
    if (aiRes.status !== 200) {
      await replyLine(
        replyToken,
        "❌ ระบบวิเคราะห์มีปัญหา กรุณาลองใหม่อีกครั้งนะคะ"
      );
      return;
    }

    const { bmi, message, model } = aiRes.data || {};

    if (model) {
      console.log("🧠 AI model:", model);
    }

    // =======================
    // 6️⃣ กรณีไม่พบใบหน้า / unseen
    // =======================
    if (typeof bmi !== "number") {
      await replyLine(
        replyToken,
        message ||
          "😢 ไม่พบใบหน้าที่ชัดเจนในภาพนี้\n" +
          "กรุณาถ่ายภาพใบหน้าตรง แสงสว่างเพียงพอ และไม่ใส่หน้ากากนะคะ"
      );
      return;
    }

    // =======================
    // 7️⃣ ตีความ BMI
    // =======================
    let status = "";
    if (bmi < 18.5) status = "น้ำหนักต่ำกว่าเกณฑ์";
    else if (bmi < 23) status = "น้ำหนักปกติ";
    else if (bmi < 25) status = "น้ำหนักเกิน";
    else status = "อ้วน";

    const replyText = `
🧮 ผลการประเมิน BMI (จากภาพใบหน้า)
━━━━━━━━━━━━━━
ค่า BMI โดยประมาณ: ${bmi.toFixed(1)}
สถานะ: ${status}

⚠️ เป็นการประเมินจาก AI
ไม่สามารถใช้แทนการตรวจวัดจริงได้
`.trim();

    await replyLine(replyToken, replyText);

  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);

    if (!replyToken) return;

    // ⏳ กรณี timeout
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
})
