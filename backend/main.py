from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from PIL import Image
import io
import torch

from app.model import get_model
from app.utils import preprocess_image

app = FastAPI(title="BMI Face AI API")

CLASS_INFO = {
    0: ("underweight", "คุณมีน้ำหนักต่ำกว่าเกณฑ์ 🥺"),
    1: ("normal", "คุณมีน้ำหนักอยู่ในเกณฑ์ปกติ 👍"),
    2: ("overweight", "คุณมีน้ำหนักเกินเกณฑ์ 😅")
}

@app.get("/")
def root():
    return {"status": "ok"}

@app.post("/predict")
async def predict(request: Request, file: UploadFile = File(None)):
    """
    รองรับทั้ง
    - Swagger / form-data (UploadFile)
    - LINE webhook (application/octet-stream)
    """
    try:
        # ✅ กรณี Swagger / form-data
        if file is not None:
            image_bytes = await file.read()
        else:
            # ✅ กรณี LINE webhook
            image_bytes = await request.body()

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid image file")

    model = get_model()  # lazy load
    x = preprocess_image(image)

    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1)
        class_id = probs.argmax(dim=1).item()
        confidence = float(probs[0][class_id])

    class_name, message = CLASS_INFO[class_id]

    return {
        "class_id": class_id,
        "class_name": class_name,
        "confidence": round(confidence, 2),
        "message": message
    }
