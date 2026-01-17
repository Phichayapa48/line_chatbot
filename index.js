import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import FormData from "form-data";

dotenv.config();

const app = express();
app.use(express.json());

/* ===============================
   BMI RESPONSE MAPPING
================================ */
const BMI_RESPONSES = {
  Class1: `📊 ผลการประเมินดัชนีมวลกาย (BMI)
ค่า BMI ของคุณอยู่ในช่วง 18.5 – 22.9
จัดอยู่ในเกณฑ์ น้ำหนักปกติ
✅ ร่างกายมีความสมดุล เหมาะสมต่อสุขภาพ
แนะนำให้รักษาพฤติกรรมการกินและการออกกำลังกายอย่างสม่ำเสมอ เพื่อคงสุขภาพที่ดีต่อไป`,

  Class2: `📊 ผลการประเมินดัชนีมวลกาย (BMI)
ค่า BMI ของคุณอยู่ในช่วง 23.0 – 24.9
จัดอยู่ในเกณฑ์ น้ำหนักเกิน (เริ่มมีความเสี่ยง)
⚠️ อาจเริ่มมีความเสี่ยงต่อปัญหาสุขภาพในอนาคต
แนะนำให้ควบคุมอาหาร และเพิ่มกิจกรรมทางกาย เช่น การออกกำลังกาย เพื่อป้องกันภาวะโรคอ้วน`,

  Class3: `📊 ผลการประเมินดัชนีมวลกาย (BMI)
ค่า BMI ของคุณอยู่ในช่วง 25.0 – 29.9
จัดอยู่ในเกณฑ์ อ้วนระดับที่ 1
🚨 มีความเสี่ยงต่อโรคไม่ติดต่อเรื้อรัง เช่น เบาหวาน ความดันโลหิตสูง
ควรปรับพฤติกรรมการรับประทานอาหาร และออกกำลังกายอย่างเหมาะสม หากเป็นไปได้ควรปรึกษาผู้เชี่ยวชาญด้านสุขภาพ`
};

/* ===============================
   LINE WEBHOOK
================================ */
app.post("/webhook", async (req, res) => {
  // ✅ ตอบ 200 ให้ LINE ก่อน
  res.sendStatus(200);

  try {
    const event = req.body.events?.[0];
    if (!event) return;

    // 👉 รับเฉพาะรูปภาพเท่านั้น
    if (event.type !== "message" || event.message.type !== "image") {
      return; // ❌ ไม่ตอบอะไรกลับ
    }

    const replyToken = event.replyToken;
    const imageId = event.message.id;

    /* 1️⃣ โหลดรูปจาก LINE */
    const imageRes = await axios.get(
      `https://api-data.line.me/v2/bot/message/${imageId}/content`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        responseType: "arraybuffer",
        timeout: 10000,
      }
    );

    /* 2️⃣ เตรียม multipart/form-data */
    const form = new FormData();
    form.append("file", imageRes.data, {
      filename: "image.jpg",
      contentType: "image/jpeg",
    });

    /* 3️⃣ ส่งไป AI Backend */
    const aiRes = await axios.post(
      "https://bmi-ai-backend.onrender.com/predict",
      form,
      {
        headers: {
          ...form.getHeaders(),
        },
        timeout: 20000,
      }
    );

    /*
      👉 คาดหวัง AI ส่งกลับมาแบบนี้:
      {
        "predicted_class": "Class1",
        "confidence": 0.92
      }
    */
    const { predicted_class, confidence } = aiRes.data;

    const bmiMessage =
      BMI_RESPONSES[predicted_class] ||
      "ไม่สามารถระบุผลการประเมิน BMI ได้";

    const confidencePercent =
      typeof confidence === "number"
        ? (confidence * 100).toFixed(1)
        : "ไม่ทราบ";

    /* 4️⃣ ตอบกลับ LINE */
    await replyLine(
      replyToken,
      `${bmiMessage}\n\n🔍 ความมั่นใจของโมเดล: ${confidencePercent}%`
    );
  } catch (err) {
    console.error(
      "Webhook processing error:",
      err.response?.data || err.message
    );

    // ตอบเฉพาะกรณี error
    if (req.body?.events?.[0]?.replyToken) {
      await replyLine(
        req.body.events[0].replyToken,
        "ไม่สามารถประมวลผลภาพได้ในขณะนี้"
      );
    }
  }
});

/* ===============================
   LINE REPLY FUNCTION
================================ */
async function replyLine(replyToken, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: [{ type: "text", text }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

/* ===============================
   START SERVER (Render)
================================ */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`✅ LINE Bot running on port ${PORT}`)
);
