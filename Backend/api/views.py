from django.shortcuts import render
from django.http import JsonResponse
import json
# Create your views here.
def status(request):
    return JsonResponse({'ip': '1231432', 'face': 'sad', 'command': 'rest', 'mqtt_connected':  True})

def command(request):
    data = json.loads(request.body)
    print(data)
    return JsonResponse(data)

def quick(request):
    data = json.loads(request.body)
    print(data)
    return JsonResponse(data)

def chat(request):
    data = json.loads(request.body)
    print(data)
    return JsonResponse({'response':'hello', 'face': 'happy', 'command': 'rest'})


def settings(request):
    data = json.loads(request.body)
    print(data)
    return JsonResponse(data)

def voice(request):
    if request.method == 'POST':
        # 1. Get the audio file from request.FILES
        audio_file = request.FILES.get('audio') # matches formData.append('audio', ...)
        
        # 2. Get the string data from request.POST
        tts_value = request.POST.get('tts')     # matches formData.append('tts', ...)

        if not audio_file:
            return JsonResponse({'error': 'No audio provided'}, status=400)

        # 3. Process the audio (Example: save or transcribe)
        # To read the raw bytes: audio_bytes = audio_file.read()
        
        # 4. Return the format your JS expects
        return JsonResponse({
            'transcript': "Hello, I heard you!",
            'response': "This is the robot speaking.",
            'command': "WAVE_HANDS",
            'face': "HAPPY"
        })

    return JsonResponse({'error': 'Method not allowed'}, status=405)