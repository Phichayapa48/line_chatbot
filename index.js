import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import FormData from "form-data";

dotenv.config();

const app = express();
app.use(express.json());

// ======================================================
// CONFIG
// ======================================================
const AI_API_URL = process.env.AI_API_URL;
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const LINE_REPLY_API =
  "https://api.line.me/v2/bot/message/reply";

const LINE_PUSH_API =
  "https://api.line.me/v2/bot/message/push";


// ======================================================
// BMI RESULT IMAGES
// ใส่ลิงก์รูปของคุณตรงนี้
// ต้องเป็น HTTPS และเปิดจากภายนอกได้
// ======================================================
const BMI_IMAGES = {
  0: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi18.png",
  1: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi22.png",
  2: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/bmi2333.png",
  3: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/level1.png",
  4: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/level2.png",
};


// ======================================================
// CHECK ENV
// ======================================================
if (!LINE_ACCESS_TOKEN) {
  throw new Error(
    "❌ LINE_CHANNEL_ACCESS_TOKEN not set"
  );
}

if (!AI_API_URL) {
  throw new Error(
    "❌ AI_API_URL not set"
  );
}


// ======================================================
// HEALTH CHECK
// ======================================================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "LINE BMI Bot"
  });
});


// ======================================================
// LINE WEBHOOK
// ======================================================
app.post("/webhook", async (req, res) => {

  // ตอบ LINE server ทันที
  // กัน webhook timeout
  res.sendStatus(200);

  const events = req.body?.events || [];

  if (events.length === 0) {
    return;
  }

  for (const event of events) {

    try {

      await handleEvent(event);

    } catch (err) {

      console.error(
        "❌ EVENT ERROR:",
        err.response?.data ||
        err.message
      );

    }
  }
});


// ======================================================
// HANDLE EVENT
// ======================================================
async function handleEvent(event) {

  const replyToken = event.replyToken;
  const userId = event.source?.userId;

  console.log("");
  console.log("======================================");
  console.log("📩 NEW LINE EVENT");
  console.log(
    "MESSAGE TYPE:",
    event.message?.type
  );
  console.log(
    "USER ID AVAILABLE:",
    Boolean(userId)
  );


  // ====================================================
  // รับเฉพาะรูป
  // ====================================================
  if (
    !event.message ||
    event.message.type !== "image"
  ) {

    if (replyToken) {

      await replyLine(
        replyToken,
        [
          "📸 กรุณาส่งภาพที่เห็นใบหน้าตรงและชัดเจน",
          "",
          "ระบบจะประเมินรูปร่างจากภาพด้วย AI 😊"
        ].join("\n")
      );

    }

    return;
  }


  // ====================================================
  // ต้องมี userId สำหรับ pushMessage
  // ====================================================
  if (!userId) {

    console.error(
      "❌ USER ID NOT FOUND"
    );

    if (replyToken) {

      await replyLine(
        replyToken,
        "ขออภัยค่ะ ระบบไม่สามารถระบุผู้ใช้งานได้"
      );

    }

    return;
  }


  // ====================================================
  // 1. ตอบกำลังประมวลผลก่อน
  // ====================================================
  if (replyToken) {

    await replyLine(
      replyToken,
      [
        "⏳ ระบบกำลังประมวลผล",
        "กรุณารอสักครู่....."
      ].join("\n")
    );

  }


  try {

    const imageId = event.message.id;


    // ==================================================
    // 2. โหลดรูปจาก LINE
    // ==================================================
    console.log(
      "⬇️ DOWNLOADING IMAGE FROM LINE..."
    );


    const imageRes = await axios.get(
      `https://api-data.line.me/v2/bot/message/${imageId}/content`,
      {
        headers: {
          Authorization:
            `Bearer ${LINE_ACCESS_TOKEN}`,
        },

        responseType:
          "arraybuffer",

        timeout:
          30000,
      }
    );


    console.log(
      "✅ LINE IMAGE DOWNLOADED"
    );

    console.log(
      "📦 IMAGE BYTES:",
      imageRes.data?.length
    );


    // ==================================================
    // 3. สร้าง FormData
    // ==================================================
    const form = new FormData();


    form.append(
      "file",
      Buffer.from(imageRes.data),
      {
        filename:
          "image.jpg",

        contentType:
          "image/jpeg",
      }
    );


    // ==================================================
    // 4. ส่งรูปไป BMI AI Backend
    // ==================================================
    console.log(
      "🧠 SENDING IMAGE TO AI:"
    );

    console.log(
      `${AI_API_URL}/predict`
    );


    const aiRes = await axios.post(
      `${AI_API_URL}/predict`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Accept:
            "application/json",
        },

        // Render Free อาจ cold start
        timeout:
          120000,
      }
    );


    console.log(
      "✅ AI RESPONSE:"
    );

    console.log(
      aiRes.data
    );


    // ==================================================
    // 5. อ่าน response จาก Backend ปัจจุบัน
    //
    // Backend ส่ง:
    //
    // {
    //   class_id,
    //   bmi_label,
    //   confidence,
    //   face_count
    // }
    // ==================================================
    const {
      class_id,
      bmi_label,
      confidence,
      face_count
    } = aiRes.data || {};


    // ==================================================
    // 6. ตรวจ response
    // ==================================================
    if (
      class_id === undefined ||
      class_id === null ||
      !bmi_label ||
      confidence === undefined ||
      confidence === null
    ) {

      console.error(
        "❌ INVALID AI RESPONSE:",
        aiRes.data
      );


      await pushLine(
        userId,
        [
          "❌ ระบบได้รับผลลัพธ์จาก AI ไม่ครบถ้วน",
          "กรุณาลองส่งรูปใหม่อีกครั้งค่ะ"
        ].join("\n")
      );

      return;
    }


    // ==================================================
    // 7. แปลง confidence เป็น %
    //
    // Backend ส่ง 0-1
    // เช่น 0.8234 -> 82.34%
    // ==================================================
    const confidencePercent =
      (
        Number(confidence) * 100
      ).toFixed(2);


    // ==================================================
    // 8. สร้างข้อความผลลัพธ์
    // ==================================================
    const replyText = [
      "✅ ผลการประเมินจากระบบ AI",
      "",
      `📊 ${bmi_label}`,
      "",
      `🎯 ความมั่นใจ: ${confidencePercent}%`,
      `👤 จำนวนใบหน้าที่ตรวจพบ: ${face_count}`,
      "",
      "ℹ️ ผลลัพธ์เป็นการประเมินจากภาพด้วยโมเดล AI",
      "ไม่ได้ใช้แทนการวินิจฉัยทางการแพทย์"
    ].join("\n");


    // ==================================================
    // 9. ส่งข้อความผลลัพธ์
    // ==================================================
    await pushLine(
      userId,
      replyText
    );


    console.log(
      "✅ RESULT TEXT PUSHED"
    );


    // ==================================================
    // 10. เลือกรูปตาม BMI class
    // ==================================================
    const imageUrl =
      BMI_IMAGES[class_id];


    // ==================================================
    // 11. ส่งรูป
    // ==================================================
    if (
      imageUrl &&
      imageUrl.startsWith("https://")
    ) {

      console.log(
        "🖼️ SENDING RESULT IMAGE"
      );


      try {

        await pushImage(
          userId,
          imageUrl
        );


        console.log(
          "✅ RESULT IMAGE PUSHED"
        );

      } catch (imageError) {

        // รูปเสียไม่ควรทำให้ผล BMI หาย
        console.error(
          "⚠️ IMAGE PUSH FAILED:",
          imageError.response?.data ||
          imageError.message
        );

      }

    } else {

      console.log(
        "⚠️ RESULT IMAGE URL NOT SET FOR CLASS:",
        class_id
      );

    }


    console.log(
      "======================================"
    );


  } catch (err) {

    console.error(
      "❌ PROCESSING ERROR:"
    );

    console.error(
      err.response?.data ||
      err.message
    );


    // ==================================================
    // Backend ส่ง 400
    // เช่น ไม่พบหน้า / หลายหน้า / confidence ต่ำ
    // ==================================================
    if (
      err.response?.status === 400
    ) {

      const detail =
        err.response?.data?.detail;


      await pushLine(
        userId,
        detail ||
        [
          "📸 ระบบยังไม่สามารถประเมินภาพนี้ได้",
          "กรุณาถ่ายใหม่โดยให้เห็นใบหน้าชัดเจน 1 คนค่ะ"
        ].join("\n")
      );

      return;
    }


    // ==================================================
    // Timeout
    // ==================================================
    if (
      err.code === "ECONNABORTED"
    ) {

      await pushLine(
        userId,
        [
          "⏳ ระบบใช้เวลาประมวลผลนานกว่าปกติ",
          "กรุณาลองส่งรูปใหม่อีกครั้งค่ะ"
        ].join("\n")
      );

      return;
    }


    // ==================================================
    // Error อื่น
    // ==================================================
    await pushLine(
      userId,
      [
        "❌ ขออภัยค่ะ ระบบมีปัญหาชั่วคราว",
        "กรุณาลองใหม่อีกครั้งค่ะ"
      ].join("\n")
    );
  }
}


// ======================================================
// REPLY LINE
//
// ใช้ replyToken
// ใช้ตอบครั้งแรก เช่น "กำลังประมวลผล"
// ======================================================
async function replyLine(
  replyToken,
  text
) {

  await axios.post(
    LINE_REPLY_API,

    {
      replyToken,

      messages: [
        {
          type:
            "text",

          text:
            text
        }
      ]
    },

    {
      headers: {

        Authorization:
          `Bearer ${LINE_ACCESS_TOKEN}`,

        "Content-Type":
          "application/json"
      },

      timeout:
        10000
    }
  );
}


// ======================================================
// PUSH TEXT
//
// ใช้ userId
// ใช้ส่งผล AI หลังประมวลผลเสร็จ
// ======================================================
async function pushLine(
  userId,
  text
) {

  await axios.post(
    LINE_PUSH_API,

    {
      to:
        userId,

      messages: [
        {
          type:
            "text",

          text:
            text
        }
      ]
    },

    {
      headers: {

        Authorization:
          `Bearer ${LINE_ACCESS_TOKEN}`,

        "Content-Type":
          "application/json"
      },

      timeout:
        10000
    }
  );
}


// ======================================================
// PUSH IMAGE
// ======================================================
async function pushImage(
  userId,
  imageUrl
) {

  await axios.post(
    LINE_PUSH_API,

    {
      to:
        userId,

      messages: [
        {
          type:
            "image",

          originalContentUrl:
            imageUrl,

          previewImageUrl:
            imageUrl
        }
      ]
    },

    {
      headers: {

        Authorization:
          `Bearer ${LINE_ACCESS_TOKEN}`,

        "Content-Type":
          "application/json"
      },

      timeout:
        10000
    }
  );
}


// ======================================================
// START SERVER
// ======================================================
const PORT =
  process.env.PORT ||
  10000;


app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `✅ LINE Bot running on port ${PORT}`
    );

  }
);
