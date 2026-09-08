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


// ตัด / ด้านท้าย AI URL
const AI_API_BASE =
  AI_API_URL
    ? AI_API_URL.replace(/\/+$/, "")
    : "";


// ======================================================
// PROCESSING MESSAGE CONFIG
//
// false = ไม่ส่งจากโค้ด
// เพราะ LINE OA ของคุณมี Auto-response อยู่แล้ว
//
// ถ้าวันหลังปิด Auto-response ใน LINE OA
// ให้เปลี่ยนเป็น true
// ======================================================
const SEND_PROCESSING_FROM_CODE = false;


// ======================================================
// BMI RESULT IMAGES
// Supabase Public URL
// ======================================================
const BMI_IMAGES = {

  // BMI < 18.5
  0: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi18.png",

  // BMI 18.5 - 22.9
  1: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi22.png",

  // BMI 23.0 - 24.9
  2: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/bmi2333.png",

  // BMI 25.0 - 29.9
  3: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/level1.png",

  // BMI >= 30
  4: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/level2.png",
};


// ======================================================
// YOUTUBE WORKOUT แนะนำตาม BMI
// ======================================================
const BMI_YOUTUBE = {

  // ----------------------------------------------------
  // 0 = น้ำหนักน้อยกว่าเกณฑ์
  // เน้น Beginner Strength / Full Body
  // ----------------------------------------------------
  0: {
    title:
      "💪 Beginner Full Body Strength 20 นาที",

    url:
      "https://www.youtube.com/watch?v=WrXeb6EZrK0"
  },


  // ----------------------------------------------------
  // 1 = สมส่วน
  // Full Body + Cardio แบบ Beginner
  // ----------------------------------------------------
  1: {
    title:
      "🏃 Beginner Full Body Workout 20 นาที",

    url:
      "https://www.youtube.com/watch?v=qxIk6KZrO1o"
  },


  // ----------------------------------------------------
  // 2 = น้ำหนักเกิน / ท้วม
  // Low Impact โดยเฉพาะ Beginner
  // ----------------------------------------------------
  2: {
    title:
      "🚶 Low Impact Workout สำหรับ Beginner",

    url:
      "https://www.youtube.com/watch?v=oVbJ-LBWgr0"
  },


  // ----------------------------------------------------
  // 3 = อ้วนระดับ 1
  // Walking / Low Impact / No Jumping
  // ----------------------------------------------------
  3: {
    title:
      "🚶 Low Impact Walking Workout 20 นาที",

    url:
      "https://www.youtube.com/watch?v=wOUjeYfk_8o"
  },


  // ----------------------------------------------------
  // 4 = อ้วนระดับ 2
  // Gentle / Chair / Low Impact
  // ----------------------------------------------------
  4: {
    title:
      "🪑 Gentle Chair Exercise 15 นาที",

    url:
      "https://www.youtube.com/watch?v=9BStbeZdx28"
  },
};


// ======================================================
// CHECK ENVIRONMENT
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

    status:
      "ok",

    service:
      "LINE BMI Bot",

    version:
      "2.0.0"

  });

});


// ======================================================
// LINE WEBHOOK
// ======================================================
app.post(
  "/webhook",
  async (req, res) => {

    // ตอบ LINE server ทันที
    // ป้องกัน webhook timeout
    res.sendStatus(200);


    const events =
      req.body?.events || [];


    if (
      events.length === 0
    ) {

      return;

    }


    for (
      const event
      of events
    ) {

      try {

        await handleEvent(
          event
        );

      }

      catch (error) {

        console.error(
          "❌ EVENT ERROR:",
          error.response?.data ||
          error.message
        );

      }

    }

  }
);


// ======================================================
// HANDLE EVENT
// ======================================================
async function handleEvent(
  event
) {

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
  // รับเฉพาะรูปภาพ
  // ====================================================
  if (
    !event.message ||
    event.message.type !== "image"
  ) {

    if (
      replyToken
    ) {

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
  // ต้องมี userId สำหรับ push message
  // ====================================================
  if (
    !userId
  ) {

    console.error(
      "❌ USER ID NOT FOUND"
    );


    if (
      replyToken
    ) {

      await replyLine(

        replyToken,

        "❌ ระบบไม่สามารถระบุผู้ใช้งานได้"

      );

    }


    return;

  }


  // ====================================================
  // PROCESSING MESSAGE
  //
  // ปัจจุบันตั้ง false
  // เพราะ LINE OA มี Auto-response อยู่แล้ว
  //
  // จึงไม่ขึ้นซ้ำ 2 รอบ
  // ====================================================
  if (
    SEND_PROCESSING_FROM_CODE &&
    replyToken
  ) {

    try {

      await replyLine(

        replyToken,

        [
          "⏳ ระบบกำลังประมวลผล",
          "กรุณารอสักครู่....."
        ].join("\n")

      );

    }

    catch (
      processingError
    ) {

      console.error(
        "⚠️ PROCESSING MESSAGE ERROR:",
        processingError.response?.data ||
        processingError.message
      );

    }

  }


  try {

    const imageId =
      event.message.id;


    // ==================================================
    // 1. DOWNLOAD รูปจาก LINE
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
    // 2. FORMDATA
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
    // 3. SEND IMAGE TO AI
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
              "application/json"

          },

          // Render Free อาจ cold start
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
    // 4. อ่านข้อมูลจาก AI Backend
    // ==================================================
    const {

      class_id,

      bmi_label,

      confidence,

      face_count

    } =
      aiRes.data || {};


    // ==================================================
    // VALIDATE RESPONSE
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
    // CLASS VALIDATE
    // ==================================================
    if (
      class_id < 0 ||
      class_id > 4
    ) {

      console.error(
        "❌ UNKNOWN BMI CLASS:",
        class_id
      );


      await pushText(

        userId,

        "❌ ระบบได้รับประเภท BMI ที่ไม่ถูกต้อง กรุณาลองใหม่อีกครั้งค่ะ"

      );


      return;

    }


    // ==================================================
    // 5. CONFIDENCE
    // ==================================================
    const confidenceNumber =
      Number(
        confidence
      );


    const confidencePercent = (

      confidenceNumber <= 1

        ? confidenceNumber * 100

        : confidenceNumber

    ).toFixed(2);


    // ==================================================
    // 6. YOUTUBE ตาม BMI
    // ==================================================
    const workout =
      BMI_YOUTUBE[
        class_id
      ];


    // ==================================================
    // 7. สร้างข้อความผลลัพธ์
    // ==================================================
    const resultLines = [

      "✅ ผลการประเมินโดย AI",

      "",

      `สถานะ BMI: ${bmi_label}`,

      `ความมั่นใจ: ${confidencePercent}%`,

    ];


    // เพิ่มคลิปออกกำลังกาย
    if (
      workout
    ) {

      resultLines.push(
        "",
        "🏃 คลิปออกกำลังกายแนะนำ",
        workout.title,
        workout.url
      );

    }


    resultLines.push(

      "",

      "ℹ️ ผลลัพธ์เป็นการประเมินจากภาพด้วยระบบ AI",

      "คลิปเป็นคำแนะนำการออกกำลังกายทั่วไป ควรเลือกความหนักให้เหมาะกับร่างกาย"

    );


    const resultText =
      resultLines.join(
        "\n"
      );


    // ==================================================
    // 8. PUSH RESULT TEXT
    // ==================================================
    await pushText(

      userId,

      resultText

    );


    console.log(
      "✅ RESULT TEXT PUSHED"
    );


    // ==================================================
    // 9. RESULT IMAGE
    // ==================================================
    const resultImageUrl =
      BMI_IMAGES[
        class_id
      ];


    console.log(
      "🖼️ CLASS ID:",
      class_id
    );


    console.log(
      "🖼️ IMAGE URL:",
      resultImageUrl
    );


    if (
      !resultImageUrl
    ) {

      console.log(
        "⚠️ NO IMAGE FOR CLASS:",
        class_id
      );


      return;

    }


    // ==================================================
    // 10. CHECK IMAGE URL
    // ==================================================
    const imageCheck =
      await checkImageUrl(
        resultImageUrl
      );


    if (
      !imageCheck.ok
    ) {

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
        "❌ RESULT URL IS NOT IMAGE:",
        imageCheck.contentType
      );


      return;

    }


    // ==================================================
    // 11. PUSH RESULT IMAGE
    // ==================================================
    try {

      await pushImage(

        userId,

        resultImageUrl

      );


      console.log(
        "✅ RESULT IMAGE PUSHED SUCCESSFULLY"
      );

    }

    catch (
      imageError
    ) {

      console.error(
        "❌ IMAGE PUSH ERROR:"
      );


      console.error(
        imageError.response?.data ||
        imageError.message
      );

    }


    console.log(
      "======================================"
    );

  }


  catch (error) {

    console.error(
      "❌ PROCESSING ERROR:"
    );


    console.error(
      error.response?.data ||
      error.message
    );


    // ==================================================
    // AI Backend 400
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
    // TIMEOUT
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
    // OTHER ERROR
    // ==================================================
    try {

      await pushText(

        userId,

        [
          "❌ ขออภัยค่ะ ระบบมีปัญหาชั่วคราว",
          "กรุณาลองใหม่อีกครั้งค่ะ"
        ].join("\n")

      );

    }

    catch (
      pushError
    ) {

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
            5

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
        contentType

    };

  }


  catch (error) {

    console.error(
      "❌ IMAGE URL CHECK FAILED:"
    );


    console.error(
      error.response?.status ||
      error.message
    );


    return {

      ok:
        false,

      status:
        error.response?.status ||
        null,

      size:
        0,

      contentType:
        ""

    };

  }

}


// ======================================================
// REPLY LINE
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
