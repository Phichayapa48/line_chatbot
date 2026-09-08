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


// URL Render ของ LINE Bot
const PUBLIC_BOT_URL =
  "https://line-chatbot-43pa.onrender.com";


// ตัด / ท้าย AI API
const AI_API_BASE =
  AI_API_URL
    ? AI_API_URL.replace(/\/+$/, "")
    : "";


// ======================================================
// PROCESSING MESSAGE
//
// false = ไม่ส่ง "กำลังประมวลผล" จากโค้ด
// เพราะ LINE OA ของคุณมีข้อความนี้อยู่แล้ว
//
// ทำให้ไม่ขึ้น 2 รอบ
//
// ถ้าวันหลังปิด Auto-response ของ LINE OA
// ให้เปลี่ยน false -> true
// ======================================================
const SEND_PROCESSING_FROM_CODE = false;


// ======================================================
// SUPABASE IMAGE SOURCE
//
// รูปจริงยังเก็บอยู่ใน Supabase
// ======================================================
const SUPABASE_BMI_IMAGES = {

  0: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi18.png",

  1: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/Bmi22.png",

  2: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/bmi2333.png",

  3: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/level1.png",

  4: "https://mgaszucqsxgowdbfebpt.supabase.co/storage/v1/object/public/Model/level2.png",
};


// ======================================================
// IMAGE URL ที่ LINE จะเห็น
//
// LINE จะไม่ได้โหลด Supabase โดยตรง
// แต่โหลดผ่าน Render Bot
// ======================================================
const BMI_IMAGES = {

  0: `${PUBLIC_BOT_URL}/bmi-image/0.png`,

  1: `${PUBLIC_BOT_URL}/bmi-image/1.png`,

  2: `${PUBLIC_BOT_URL}/bmi-image/2.png`,

  3: `${PUBLIC_BOT_URL}/bmi-image/3.png`,

  4: `${PUBLIC_BOT_URL}/bmi-image/4.png`,
};


// ======================================================
// YOUTUBE WORKOUT
// ======================================================
const BMI_YOUTUBE = {

  // ----------------------------------------------------
  // BMI < 18.5
  // เน้นสร้างความแข็งแรงแบบ Beginner
  // ----------------------------------------------------
  0: {
    title:
      "💪 Beginner Bodyweight Workout 20 นาที",

    url:
      "https://www.youtube.com/watch?v=_W9B2ffnO5c",
  },


  // ----------------------------------------------------
  // BMI 18.5 - 22.9
  // Low Impact Full Body
  // ----------------------------------------------------
  1: {
    title:
      "🏃 Low Impact Full Body Workout 20 นาที",

    url:
      "https://www.youtube.com/watch?v=Rizij3icAOU",
  },


  // ----------------------------------------------------
  // BMI 23.0 - 24.9
  // No Jumping / Low Impact
  // ----------------------------------------------------
  2: {
    title:
      "🚶 Low Impact Cardio สำหรับ Beginner 15 นาที",

    url:
      "https://www.youtube.com/watch?v=MyCBKQtgYoA",
  },


  // ----------------------------------------------------
  // BMI 25.0 - 29.9
  // Low Impact Home Workout
  // ----------------------------------------------------
  3: {
    title:
      "🚶 Low Impact Workout 20 นาที",

    url:
      "https://www.youtube.com/watch?v=Xi33JHnAd9I",
  },


  // ----------------------------------------------------
  // BMI >= 30
  // Chair / Gentle Exercise
  // ----------------------------------------------------
  4: {
    title:
      "🪑 Chair Strength Workout 15 นาที",

    url:
      "https://www.youtube.com/watch?v=wAh_wA16AFY",
  },
};


// ======================================================
// ENV CHECK
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
      "3.0.0",

  });

});


// ======================================================
// BMI IMAGE PROXY
//
// สำคัญมาก
//
// LINE เปิด:
//
// https://line-chatbot-43pa.onrender.com/bmi-image/2.png
//
// Bot จะไปดึง:
//
// Supabase/bmi2333.png
//
// แล้วส่ง image/png กลับให้ LINE
// ======================================================
app.get(
  "/bmi-image/:file",
  async (req, res) => {

    try {

      // เช่น
      // 2.png -> 2
      const fileName =
        String(
          req.params.file || ""
        );


      const classId =
        Number(
          fileName.replace(
            /\.png$/i,
            ""
          )
        );


      // ตรวจ class
      if (
        !Number.isInteger(classId) ||
        classId < 0 ||
        classId > 4
      ) {

        return res
          .status(404)
          .send(
            "Image not found"
          );

      }


      const sourceUrl =
        SUPABASE_BMI_IMAGES[
          classId
        ];


      if (!sourceUrl) {

        return res
          .status(404)
          .send(
            "Image not found"
          );

      }


      console.log(
        "🖼️ IMAGE PROXY REQUEST:"
      );

      console.log(
        "CLASS:",
        classId
      );

      console.log(
        "SOURCE:",
        sourceUrl
      );


      // ==================================================
      // ดาวน์โหลดจาก Supabase
      // ==================================================
      const response =
        await axios.get(

          sourceUrl,

          {
            responseType:
              "arraybuffer",

            timeout:
              20000,

            maxRedirects:
              5,

            headers: {

              Accept:
                "image/png,image/jpeg,image/*",

              "User-Agent":
                "Face2BMI-LINE-Bot/1.0",

            },
          }

        );


      const imageBuffer =
        Buffer.from(
          response.data
        );


      const contentType =
        response.headers[
          "content-type"
        ] ||
        "image/png";


      console.log(
        "✅ SUPABASE IMAGE LOADED"
      );

      console.log(
        "CONTENT TYPE:",
        contentType
      );

      console.log(
        "SIZE:",
        imageBuffer.length,
        "bytes"
      );


      // ==================================================
      // Headers สำหรับ LINE
      // ==================================================
      res.setHeader(
        "Content-Type",
        contentType
      );


      res.setHeader(
        "Content-Length",
        String(
          imageBuffer.length
        )
      );


      res.setHeader(
        "Cache-Control",
        "public, max-age=3600"
      );


      res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
      );


      return res
        .status(200)
        .send(
          imageBuffer
        );


    } catch (error) {

      console.error(
        "❌ IMAGE PROXY ERROR:"
      );


      console.error(
        error.response?.status ||
        error.message
      );


      return res
        .status(500)
        .send(
          "Cannot load image"
        );

    }

  }
);


// ======================================================
// LINE WEBHOOK
// ======================================================
app.post(
  "/webhook",
  async (req, res) => {

    // ตอบ LINE Server ก่อน
    // กัน webhook timeout
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

      } catch (error) {

        console.error(
          "❌ EVENT ERROR:"
        );


        console.error(
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
  // รับเฉพาะรูป
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
          "ระบบจะประเมินรูปร่างจากภาพด้วย AI 😊",
        ].join("\n")

      );

    }


    return;

  }


  // ====================================================
  // ต้องมี USER ID
  // ====================================================
  if (!userId) {

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
  // PROCESSING
  //
  // false = ไม่ส่งจาก code
  //
  // ป้องกันข้อความขึ้น 2 รอบ
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
          "กรุณารอสักครู่.....",
        ].join("\n")

      );

    } catch (error) {

      console.error(
        "⚠️ PROCESSING REPLY ERROR:",
        error.response?.data ||
        error.message
      );

    }

  }


  try {

    const imageId =
      event.message.id;


    // ==================================================
    // 1. DOWNLOAD IMAGE FROM LINE
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
          "image/jpeg",

      }

    );


    // ==================================================
    // 3. SEND TO AI
    // ==================================================
    const predictUrl =
      `${AI_API_BASE}/predict`;


    console.log(
      "🧠 SENDING TO AI:"
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
    // 4. AI RESULT
    // ==================================================
    const {

      class_id,

      bmi_label,

      confidence,

      face_count,

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
        "❌ INVALID AI RESPONSE"
      );


      await pushText(

        userId,

        [
          "❌ ระบบได้รับผลลัพธ์จาก AI ไม่ครบถ้วน",
          "กรุณาลองใหม่อีกครั้งค่ะ",
        ].join("\n")

      );


      return;

    }


    // ==================================================
    // VALIDATE CLASS
    // ==================================================
    if (
      class_id < 0 ||
      class_id > 4
    ) {

      console.error(
        "❌ INVALID CLASS:",
        class_id
      );


      await pushText(

        userId,

        "❌ ระบบได้รับประเภท BMI ที่ไม่ถูกต้อง"

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


    const confidencePercent =
      (

        confidenceNumber <= 1

          ? confidenceNumber * 100

          : confidenceNumber

      ).toFixed(2);


    // ==================================================
    // 6. YOUTUBE
    // ==================================================
    const workout =
      BMI_YOUTUBE[
        class_id
      ];


    // ==================================================
    // 7. RESULT TEXT
    // ==================================================
    const resultLines = [

      "✅ ผลการประเมินโดย AI",

      "",

      `สถานะ BMI: ${bmi_label}`,

      `ความมั่นใจ: ${confidencePercent}%`,

    ];


    if (
      workout
    ) {

      resultLines.push(

        "",

        "🏃 คลิปออกกำลังกายแนะนำ:",

        workout.title,

        workout.url

      );

    }


    resultLines.push(

      "",

      "ℹ️ ผลลัพธ์เป็นการประเมินจากภาพด้วยระบบ AI",

      "คำแนะนำการออกกำลังกายเป็นข้อมูลทั่วไป ควรเลือกความหนักให้เหมาะสมกับร่างกาย"

    );


    const resultText =
      resultLines.join(
        "\n"
      );


    // ==================================================
    // 8. PUSH TEXT
    // ==================================================
    await pushText(

      userId,

      resultText

    );


    console.log(
      "✅ RESULT TEXT PUSHED"
    );


    // ==================================================
    // 9. IMAGE
    //
    // ตรงนี้เป็น URL Proxy ของ Render
    // แต่รูปต้นทางมาจาก Supabase
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
      "🖼️ LINE IMAGE URL:",
      resultImageUrl
    );


    console.log(
      "🖼️ SUPABASE SOURCE:",
      SUPABASE_BMI_IMAGES[
        class_id
      ]
    );


    if (
      !resultImageUrl
    ) {

      console.error(
        "❌ IMAGE URL NOT FOUND"
      );


      return;

    }


    // ==================================================
    // 10. CHECK PROXY IMAGE
    // ==================================================
    const imageCheck =
      await checkImageUrl(
        resultImageUrl
      );


    if (
      !imageCheck.ok
    ) {

      console.error(
        "❌ IMAGE CHECK FAILED"
      );


      return;

    }


    console.log(
      "✅ IMAGE CHECK OK"
    );


    console.log(
      "CONTENT TYPE:",
      imageCheck.contentType
    );


    console.log(
      "SIZE:",
      imageCheck.size,
      "bytes"
    );


    console.log(
      "SIZE MB:",
      (
        imageCheck.size /
        1024 /
        1024
      ).toFixed(2)
    );


    // ==================================================
    // 11. PUSH IMAGE
    // ==================================================
    try {

      await pushImage(

        userId,

        resultImageUrl

      );


      console.log(
        "✅ RESULT IMAGE PUSHED"
      );

    } catch (error) {

      console.error(
        "❌ IMAGE PUSH ERROR:"
      );


      console.error(
        error.response?.data ||
        error.message
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
    // BACKEND 400
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
    // TIMEOUT
    // ==================================================
    if (
      error.code ===
      "ECONNABORTED"
    ) {

      await pushText(

        userId,

        [
          "⏳ ระบบใช้เวลาประมวลผลนานกว่าปกติ",
          "กรุณาลองส่งรูปใหม่อีกครั้งค่ะ",
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
          "กรุณาลองใหม่อีกครั้งค่ะ",
        ].join("\n")

      );

    } catch (pushError) {

      console.error(
        "❌ ERROR PUSH FAILED:",
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
            20000,

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
      "IMAGE STATUS:",
      response.status
    );


    console.log(
      "IMAGE TYPE:",
      contentType
    );


    console.log(
      "IMAGE SIZE:",
      size
    );


    return {

      ok:
        response.status === 200 &&
        contentType.startsWith(
          "image/"
        ),

      status:
        response.status,

      contentType:
        contentType,

      size:
        size,

    };

  } catch (error) {

    console.error(
      "❌ IMAGE CHECK ERROR:",
      error.response?.status ||
      error.message
    );


    return {

      ok:
        false,

      status:
        error.response?.status ||
        null,

      contentType:
        "",

      size:
        0,

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
    "📤 PUSH IMAGE:"
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
