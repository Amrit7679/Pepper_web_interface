from django.urls import path
from django.http import JsonResponse
from . import views

## api endpoint is 'api/data/'

urlpatterns = [
    path('status/', views.status, name='status'),
    path('command/', views.command, name='command'),
    path('quick/', views.quick, name='quick'),
    path('chat/', views.chat, name='chat'),
    path('settings/', views.settings, name='settings'),
    path('voice/', views.voice, name='voice'),
]

