#  Pepper Robot Companion — Desktop Interface

A Django-based desktop interface for controlling and conversing with a **Pepper humanoid robot** over MQTT. Supports text chat, voice input, and direct movement/expression commands — all from a single browser-based UI.

---
## Project Structure
---

```
Backend/
│
├── api/
│   ├── __pycache__/
│   ├── migrations/
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── models.py
│   ├── tests.py
│   ├── urls.py
│   └── views.py
│
├── app/
│   ├── __pycache__/
│   ├── migrations/
│   ├── static/
│   │   └── app/
│   │       ├── css/
│   │       │   └── style.css
│   │       ├── js/
│   │       │   └── script.js
│   │       └── favicon.ico
│   │
│   ├── templates/
│   │   └── app/
│   │       └── index.html
│   │
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── models.py
│   ├── tests.py
│   ├── urls.py
│   └── views.py
│
├── project/
│   ├── __pycache__/
│   ├── __init__.py
│   ├── asgi.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
│
├── db.sqlite3
└── manage.py

```

---
## How It Works
 
The browser loads a single HTML page served by the `app` app. All robot interaction is handled by the `api` app via fetch calls from `script.js`. The Django backend communicates with the physical Pepper robot through an **MQTT broker** (default: `localhost:1883`) on the topic `Pepper/control`.

```
Browser  ──fetch──▶  Django API  ──MQTT──▶  Pepper Robot
                         │
                    NLP / STT / TTS

```
---
## API Endpoints
 
All endpoints live under `/api/`. Every `POST` request requires the Django CSRF token passed as the `X-CSRFToken` header (automatically handled by `script.js`).

---
### `GET /api/status/`
 
Fetches the current robot state. Called automatically on page load and by the Refresh / Check MQTT buttons.
 
**Response**
```json
{
  "ip": "192.168.1.10",
  "face": "idle",
  "command": "stand",
  "mqtt_connected": true
}
```
 
---

 
### `POST /api/quick/`
 
Sends a direct movement + face command to the robot. Triggered by sidebar action buttons and command pills.
 
**Request body**
```json
{
  "movement": "wave",
  "face": "happy"
}
```
 
**Response**
```json
{ "ok": true }
```
 
The view publishes `"wave,happy"` to the `Pepper8697803647/control8697803647` MQTT topic.
 
---


 
## Available Movement Commands
 
```
stand, rest, forward, backward, left, right,
wave, dance, swim, point, pushup, bow, cute,
freaky, worm, shake, shrug, dead, crab, fight,
punch, kick, dizzy, fall, glitch
```
 
## Available Face Expressions
 
```
idle, idle_blink, walk, rest, dance, wave,
happy, talk_happy, sad, talk_sad, angry, talk_angry,
surprised, talk_surprised, sleepy, talk_sleepy,
love, talk_love, excited, talk_excited,
confused, talk_confused, thinking, talk_thinking,
dead, point, shrug
```
 
---

## Setup
 
### Requirements
 
```
Django
paho-mqtt
SpeechRecognition (or equivalent STT library)
pyttsx3
```
 
### Run
 
```bash
python manage.py runserver
```
 
Make sure the MQTT broker is running on `localhost:1883` before starting the server. The robot status panel will show `offline` if the broker is unreachable.
 
### Django settings
 
```python
INSTALLED_APPS = [
    ...
    'app',
    'api',
]
 
STATIC_URL = '/static/'
```
 
Ensure `django.middleware.csrf.CsrfViewMiddleware` is in `MIDDLEWARE` — it is required for all POST endpoints.
 
---