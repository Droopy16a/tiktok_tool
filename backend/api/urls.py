from django.urls import path
from .views import health, tts, asr, upload_tiktok, register_tiktok, auto_register_tiktok

urlpatterns = [
    path("health/", health),
    path("tts", tts),
    path("asr", asr),
    path("upload-tiktok", upload_tiktok),
    path("register-tiktok", register_tiktok),
    path("auto-register-tiktok", auto_register_tiktok)
]
