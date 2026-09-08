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
// Public URL จาก Supabase
// ======================================================
const BMI_IMAGES = {
  0: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi18.png",

  1: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi22.png",

  2: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/bmi2333.png",

  3: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/level1.png",

  4: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/level2.png",
};


// ======================================================
// CHECK ENVIRONMENT
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
  // ป้องกัน webhook timeout
  res.sendStatus(200);

  const events = req.body?.events || [];

  if (events.length === 0) {
    return;
  }

  for (const event of events) {

    try {

      await handleEvent(event);

    } catch (error) {

      console.error(
        "❌ EVENT ERROR:",
        error.response?.data ||
        error.message
      );

    }

  }

});


// ======================================================
// HANDLE LINE EVENT
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
  // รับเฉพาะรูปภาพ
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
  // ตรวจ userId
  // ====================================================
  if (!userId) {

    console.error(
      "❌ USER ID NOT FOUND"
    );

    if (replyToken) {

      await replyLine(
        replyToken,
        "❌ ระบบไม่สามารถระบุผู้ใช้งานได้"
      );

    }

    return;
  }


  // ====================================================
  // 1. แจ้งกำลังประมวลผล
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

    const imageId =
      event.message.id;


    // ==================================================
    // 2. Download รูปจาก LINE
    // ==================================================
    console.log(
      "⬇️ DOWNLOADING IMAGE FROM LINE..."
    );


    const imageRes =
      await axios.get(

        `https://api-data.line.me/v2/bot/message/${imageId}/content`,

        {
          headers: {

            Authorization:
              `Bearer ${LINE_ACCESS_TOKEN}`

          },

          responseType:
            "arraybuffer",

          timeout:
            30000
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
    const form =
      new FormData();


    form.append(

      "file",

      Buffer.from(
        imageRes.data
      ),

      {
        filename:
          "image.jpg",

        contentType:
          "image/jpeg"
      }

    );


    // ==================================================
    // 4. ส่งรูปไป AI Backend
    // ==================================================
    console.log(
      "🧠 SENDING IMAGE TO AI:"
    );

    console.log(
      `${AI_API_URL}/predict`
    );


    const aiRes =
      await axios.post(

        `${AI_API_URL}/predict`,

        form,

        {
          headers: {

            ...form.getHeaders(),

            Accept:
              "application/json"

          },

          // Render Free อาจใช้เวลาตื่น
          timeout:
            120000
        }
      );


    console.log(
      "✅ AI RESPONSE:"
    );

    console.log(
      aiRes.data
    );


    // ==================================================
    // 5. อ่านผลจาก Backend
    //
    // Backend ปัจจุบัน:
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
    // 6. Validate response
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


      await pushText(
        userId,
        [
          "❌ ระบบได้รับผลลัพธ์จาก AI ไม่ครบถ้วน",
          "กรุณาลองส่งรูปใหม่อีกครั้งค่ะ"
        ].join("\n")
      );

      return;
    }


    // ==================================================
    // 7. Confidence
    //
    // backend = 0.664
    // LINE = 66.40%
    // ==================================================
    const confidenceNumber =
      Number(confidence);


    const confidencePercent =
      (
        confidenceNumber <= 1
          ? confidenceNumber * 100
          : confidenceNumber
      ).toFixed(2);


    // ==================================================
    // 8. สร้างข้อความผลลัพธ์
    // ==================================================
    const resultText = [
      "✅ ผลการประเมินโดย AI",
      "",
      `สถานะ BMI: ${bmi_label}`,
      `ความมั่นใจ: ${confidencePercent}%`,
      "",
      "ℹ️ ผลลัพธ์เป็นการประเมินจากภาพด้วยระบบ AI"
    ].join("\n");


    // ==================================================
    // 9. ส่งข้อความผลลัพธ์
    // ==================================================
    await pushText(
      userId,
      resultText
    );


    console.log(
      "✅ RESULT TEXT PUSHED"
    );


    // ==================================================
    // 10. เลือกรูปตาม class_id
    //
    // 0 = น้ำหนักน้อย
    // 1 = สมส่วน
    // 2 = น้ำหนักเกิน
    // 3 = อ้วนระดับ 1
    // 4 = อ้วนระดับ 2
    // ==================================================
    const resultImageUrl =
      BMI_IMAGES[class_id];


    console.log(
      "🖼️ CLASS ID:",
      class_id
    );

    console.log(
      "🖼️ IMAGE URL:",
      resultImageUrl
    );


    // ==================================================
    // 11. ส่งรูป
    // ==================================================
    if (
      resultImageUrl &&
      resultImageUrl.startsWith("https://")
    ) {

      try {

        await pushImage(
          userId,
          resultImageUrl
        );


        console.log(
          "✅ RESULT IMAGE PUSHED"
        );

      } catch (imageError) {

        console.error(
          "❌ IMAGE PUSH ERROR:"
        );

        console.error(
          imageError.response?.data ||
          imageError.message
        );

      }

    } else {

      console.log(
        "⚠️ NO RESULT IMAGE FOR CLASS:",
        class_id
      );

    }


    console.log(
      "======================================"
    );


  } catch (error) {

    console.error(
      "❌ PROCESSING ERROR:"
    );

    console.error(
      error.response?.data ||
      error.message
    );


    // ==================================================
    // Backend 400
    // ==================================================
    if (
      error.response?.status === 400
    ) {

      const detail =
        error.response?.data?.detail;


      await pushText(
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
      error.code ===
      "ECONNABORTED"
    ) {

      await pushText(
        userId,
        [
          "⏳ ระบบประมวลผลนานกว่าปกติ",
          "กรุณาลองส่งรูปใหม่อีกครั้งค่ะ"
        ].join("\n")
      );

      return;
    }


    // ==================================================
    // Error อื่น
    // ==================================================
    await pushText(
      userId,
      [
        "❌ ขออภัยค่ะ ระบบมีปัญหาชั่วคราว",
        "กรุณาลองใหม่อีกครั้งค่ะ"
      ].join("\n")
    );

  }

}


// ======================================================
// REPLY MESSAGE
//
// ใช้สำหรับข้อความแรก
// "กำลังประมวลผล"
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
          type: "text",
          text: text
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
// ======================================================
async function pushText(
  userId,
  text
) {

  await axios.post(

    LINE_PUSH_API,

    {
      to: userId,

      messages: [
        {
          type: "text",
          text: text
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

  console.log(
    "📤 PUSH IMAGE:",
    imageUrl
  );


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
        15000
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
