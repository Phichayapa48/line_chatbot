import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import FormData from "form-data";

dotenv.config();

const app = express();

app.use(
  express.json({
    limit: "2mb",
  })
);


// ======================================================
// CONFIG
// ======================================================
const AI_API_URL = process.env.AI_API_URL;
const LINE_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN;

const LINE_REPLY_API =
  "https://api.line.me/v2/bot/message/reply";

const LINE_PUSH_API =
  "https://api.line.me/v2/bot/message/push";


// ตัด / ตัวท้ายออก
const AI_API_BASE =
  AI_API_URL
    ? AI_API_URL.replace(/\/+$/, "")
    : "";


// ======================================================
// BMI RESULT IMAGES
// Public URL จาก Supabase
// ======================================================
const BMI_IMAGES = {

  // น้ำหนักน้อยกว่าเกณฑ์
  0: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi18.png",

  // สมส่วน
  1: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi22.png",

  // น้ำหนักเกิน / ท้วม
  2: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/bmi2333.png",

  // อ้วนระดับ 1
  3: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/level1.png",

  // อ้วนระดับ 2
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


if (!AI_API_BASE) {
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
    service: "LINE BMI Bot",
  });

});


// ======================================================
// LINE WEBHOOK
// ======================================================
app.post("/webhook", async (req, res) => {

  // ตอบ LINE ทันที
  // ป้องกัน webhook timeout
  res.sendStatus(200);


  const events =
    req.body?.events || [];


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
// HANDLE EVENT
// ======================================================
async function handleEvent(event) {

  const replyToken =
    event.replyToken;

  const userId =
    event.source?.userId;


  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "📩 NEW LINE EVENT"
  );

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
          "ระบบจะประเมินรูปร่างจากภาพด้วย AI 😊",
        ].join("\n")
      );

    }

    return;
  }


  // ====================================================
  // ต้องมี userId
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

    try {

      await replyLine(
        replyToken,
        [
          "⏳ ระบบกำลังประมวลผล",
          "กรุณารอสักครู่.....",
        ].join("\n")
      );

    } catch (replyError) {

      console.error(
        "⚠️ PROCESSING MESSAGE FAILED:",
        replyError.response?.data ||
        replyError.message
      );

    }

  }


  try {

    const imageId =
      event.message.id;


    // ==================================================
    // 2. ดาวน์โหลดรูปจาก LINE
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
          "image/jpeg",
      }

    );


    // ==================================================
    // 4. ส่งรูปไป AI Backend
    // ==================================================
    const predictUrl =
      `${AI_API_BASE}/predict`;


    console.log(
      "🧠 SENDING IMAGE TO AI:"
    );

    console.log(
      predictUrl
    );


    const aiRes =
      await axios.post(

        predictUrl,

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
    // 5. อ่าน Response จาก Backend
    // ==================================================
    const {
      class_id,
      bmi_label,
      confidence,
      face_count,
    } = aiRes.data || {};


    // ==================================================
    // 6. Validate AI Response
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
          "กรุณาลองส่งรูปใหม่อีกครั้งค่ะ",
        ].join("\n")
      );

      return;
    }


    // ==================================================
    // 7. Confidence
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
    // 8. ข้อความผลลัพธ์
    // ==================================================
    const resultText = [

      "✅ ผลการประเมินโดย AI",

      "",

      `สถานะ BMI: ${bmi_label}`,

      `ความมั่นใจ: ${confidencePercent}%`,

      "",

      "ℹ️ ผลลัพธ์เป็นการประเมินจากภาพด้วยระบบ AI",

    ].join("\n");


    // ==================================================
    // 9. ส่งข้อความผล
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


    if (!resultImageUrl) {

      console.log(
        "⚠️ NO RESULT IMAGE FOR CLASS:",
        class_id
      );

      return;
    }


    // ==================================================
    // 11. ตรวจ URL รูปก่อนส่ง
    // ==================================================
    const imageCheck =
      await checkImageUrl(
        resultImageUrl
      );


    if (!imageCheck.ok) {

      console.error(
        "❌ RESULT IMAGE URL INVALID"
      );

      return;
    }


    console.log(
      "✅ IMAGE URL ACCESSIBLE"
    );

    console.log(
      "🖼️ CONTENT TYPE:",
      imageCheck.contentType
    );

    console.log(
      "📦 IMAGE SIZE:",
      imageCheck.size,
      "bytes"
    );

    console.log(
      "📦 IMAGE SIZE MB:",
      (
        imageCheck.size /
        1024 /
        1024
      ).toFixed(2)
    );


    // ==================================================
    // ต้องเป็น image
    // ==================================================
    if (
      !imageCheck.contentType ||
      !imageCheck.contentType.startsWith(
        "image/"
      )
    ) {

      console.error(
        "❌ URL IS NOT AN IMAGE:",
        imageCheck.contentType
      );

      return;
    }


    // ==================================================
    // LINE preview URL ไม่ควรเกิน 1 MB
    // ตอนนี้เราใช้รูปเดียวกันทั้ง preview/original
    // ==================================================
    const ONE_MB =
      1024 * 1024;


    if (
      imageCheck.size >
      ONE_MB
    ) {

      console.error(
        "❌ IMAGE TOO LARGE FOR LINE PREVIEW"
      );

      console.error(
        "Current size:",
        (
          imageCheck.size /
          1024 /
          1024
        ).toFixed(2),
        "MB"
      );

      console.error(
        "Please reduce image below 1 MB"
      );

      return;
    }


    // ==================================================
    // 12. ส่งรูป
    // ==================================================
    try {

      await pushImage(
        userId,
        resultImageUrl
      );


      console.log(
        "✅ RESULT IMAGE PUSHED SUCCESSFULLY"
      );

    } catch (imageError) {

      console.error(
        "❌ IMAGE PUSH ERROR:"
      );

      console.error(
        imageError.response?.status
      );

      console.error(
        imageError.response?.data ||
        imageError.message
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
          "กรุณาถ่ายใหม่โดยให้เห็นใบหน้าชัดเจน 1 คนค่ะ",
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
          "กรุณาลองส่งรูปใหม่อีกครั้งค่ะ",
        ].join("\n")
      );

      return;
    }


    // ==================================================
    // Error อื่น
    // ==================================================
    try {

      await pushText(
        userId,
        [
          "❌ ขออภัยค่ะ ระบบมีปัญหาชั่วคราว",
          "กรุณาลองใหม่อีกครั้งค่ะ",
        ].join("\n")
      );

    } catch (pushError) {

      console.error(
        "❌ ERROR MESSAGE PUSH FAILED:",
        pushError.response?.data ||
        pushError.message
      );

    }

  }

}


// ======================================================
// CHECK IMAGE URL
// ======================================================
async function checkImageUrl(
  imageUrl
) {

  try {

    console.log(
      "🔎 CHECKING IMAGE URL..."
    );


    const response =
      await axios.get(
        imageUrl,
        {
          responseType:
            "arraybuffer",

          timeout:
            15000,

          maxRedirects:
            5,
        }
      );


    const contentType =
      response.headers[
        "content-type"
      ] || "";


    const size =
      response.data?.length || 0;


    console.log(
      "🔎 IMAGE CHECK STATUS:",
      response.status
    );

    console.log(
      "🔎 IMAGE CONTENT-TYPE:",
      contentType
    );

    console.log(
      "🔎 IMAGE CONTENT-LENGTH:",
      size
    );


    return {
      ok:
        response.status === 200,

      status:
        response.status,

      size:
        size,

      contentType:
        contentType,
    };


  } catch (error) {

    console.error(
      "❌ IMAGE URL CHECK FAILED:"
    );

    console.error(
      error.response?.status ||
      error.message
    );


    if (
      error.response?.data
    ) {

      try {

        console.error(
          Buffer.from(
            error.response.data
          ).toString(
            "utf8"
          )
        );

      } catch {
        // ignore
      }

    }


    return {
      ok:
        false,

      status:
        error.response?.status ||
        null,

      size:
        0,

      contentType:
        "",
    };

  }

}


// ======================================================
// REPLY LINE
// ใช้ replyToken ครั้งแรก
// ======================================================
async function replyLine(
  replyToken,
  text
) {

  await axios.post(

    LINE_REPLY_API,

    {
      replyToken:
        replyToken,

      messages: [
        {
          type:
            "text",

          text:
            text,
        },
      ],
    },

    {
      headers: {

        Authorization:
          `Bearer ${LINE_ACCESS_TOKEN}`,

        "Content-Type":
          "application/json",

      },

      timeout:
        10000,
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
      to:
        userId,

      messages: [
        {
          type:
            "text",

          text:
            text,
        },
      ],
    },

    {
      headers: {

        Authorization:
          `Bearer ${LINE_ACCESS_TOKEN}`,

        "Content-Type":
          "application/json",

      },

      timeout:
        10000,
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
    "📤 PUSHING IMAGE TO LINE:"
  );

  console.log(
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
            imageUrl,
        },
      ],
    },

    {
      headers: {

        Authorization:
          `Bearer ${LINE_ACCESS_TOKEN}`,

        "Content-Type":
          "application/json",

      },

      timeout:
        15000,
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
