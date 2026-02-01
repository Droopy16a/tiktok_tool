from django.urls import path
from .views import health, tts, asr

urlpatterns = [
    path("health/", health),
    path("tts", tts),
    path("asr", asr),
]
