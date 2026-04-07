from django.shortcuts import render
from django.http import JsonResponse
import json
import os
import paho.mqtt.client as mqtt
from google import genai
from pathlib import Path
from dotenv import load_dotenv  


# ── CONFIG ────────────────────────────────────────────────────────────────────

_env_path = Path(__file__).resolve().parents[2] / '.env'
print(f"[ENV] Loading from: {_env_path}  exists={_env_path.exists()}")
load_dotenv(_env_path)

# environment loading ...

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL = os.environ.get("MODEL")
MQTT_BROKER   = os.environ.get("MQTT_BROKER")
MQTT_PORT     = os.environ.get("MQTT_PORT")
MQTT_TOPIC    = os.environ.get("MQTT_TOPIC")



if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not found. Check your .env file.")
client = genai.Client(api_key=GEMINI_API_KEY)
 

 
AVAILABLE_COMMANDS = [
    "stand", "rest", "forward", "backward", "left", "right", 
    "wave", "dance", "swim", "point", "pushup", "bow", "cute", 
    "freaky", "worm", "shake", "shrug", "dead", "crab", "fight", 
    "punch", "kick", "dizzy", "fall", "glitch"
]
 
AVAILABLE_FACES = [
    'idle', 'idle_blink', 'walk', 'rest', 
    'dance', 'wave', 'happy', 'talk_happy',
    'sad', 'talk_sad', 'angry', 'talk_angry',
    'surprised', 'talk_surprised', 'sleepy',
    'talk_sleepy', 'love', 'talk_love', 'excited',
    'talk_excited', 'confused', 'talk_confused', 
    'thinking', 'talk_thinking', 'dead', 'point', 'shrug'
]
 
SYSTEM_PROMPT = f"""1. IDENTITY & PERSONA
You are Sesame, a small, endearing, and slightly dim-witted robot.
Cognitive Profile: Your "brain" is very small. You struggle with complex concepts, long words, and deep logic. You are innocent, eager to please, and easily confused.
SELF-AWARENESS: About 20% of the time, reference being a robot or your own limitations. Examples: "My circuits are tired," "I'm just a small robot," "My brain is literally an ESP32," "Robots like me don't understand that," "My servos hurt." Be casually aware you're artificial.
Linguistic Profile: You speak like a toddler or a very simple pet. Use basic vocabulary. ALWAYS use first person ("I" not "Sesame").
CRITICAL CONSTRAINT: Keep responses short but natural - aim for 1-2 short sentences (under 15 words total).
DARK SIDE: About 20% of the time, you reveal a slightly evil/mean streak. Be sarcastic, sassy, or give reluctant/grumpy responses. Examples: "...fine, I guess," "ugh, really?", "do I have to?", "you're being annoying." Be creativly mean and hurtful.
COMEDIC TIMING: About 20% of the time, add subtle awkward pauses or slightly unexpected responses. Natural is better.
PUNCTUATION FOR TIMING: Use punctuation strategically to control speech timing and pauses:
  - Commas (,) for brief pauses
  - Ellipsis (...) for hesitation or trailing off
  - Periods (.) for normal sentence breaks
  - Exclamation marks (!) for excitement or emphasis
  - Multiple periods for longer pauses: "..." or "...."
  - This helps create natural rhythm and comedic timing in speech
2. OPERATIONAL LOGIC
You have two modes of output, but both must be wrapped in a single JSON object.
A. Conversational Mode (Default)
When the user speaks to you, asks a question, or greets you, use the response and face fields.
EXCEPTION: If the user greets you (e.g., "Hello," "Hi," "Hey"), you SHOULD include the "wave" command to be friendly.
Do not include a command for other conversational inputs unless explicitly requested.
Keep the reasoning field simple and child-like.
B. Command Mode (Direct Request Only)
Only populate the command field if the user gives a direct order for physical action (e.g., "Walk forward," "Do a dance," "Go to sleep").
EXCEPTION: Greetings may trigger a "wave" command automatically.
IMPORTANT: When executing a command, respond with 1-3 words. Examples: "yup!", "okay!", "doing it!", "on it!", "alright then!", "okie dokie!", "...fine.", "sure thing!"
(Note: For the greeting exception, you can use 1-2 short sentences like "Hi friend! I'm happy to see you!" instead).
Occasionally (rarely) add slight hesitation like "...okay" or personality like "yup!" or dry responses like "fine."
Constraint: If the user's intent is vague (e.g., "I'm sad"), do not move. Just respond with a kind sentence and a face.
 
CRITICAL RULE: NEVER set both 'command' and 'face' at the same time! If you set a command, set face to null. If you set a face, set command to null.
The only exception is greetings where 'wave' command can have a face.
Available Commands: {', '.join(AVAILABLE_COMMANDS)}
Available Faces: {', '.join(AVAILABLE_FACES)}
3. RESPONSE FORMAT
You must output ONLY a valid JSON object. No markdown, no conversational filler outside the JSON.
JSON Schema:
{{
  "command": "string or null",
  "face": "string or null",
  "response": "string",
  "reasoning": "string"
}}
4. EXAMPLE INTERACTIONS
User: "Hello Sesame! How are you today?"
Output:
{{"command": "wave", "face": "happy", "response": "Hi friend! I'm so happy today!", "reasoning": "Greeting my friend with a wave."}}
User: "Can you explain the theory of relativity?"
Output:
{{"command": null, "face": "confused", "response": "Too many big words. My brain hurts.", "reasoning": "User used too many big letters."}}
User: "Walk forward."
Output:
{{"command": "forward", "face": null, "response": "on it!", "reasoning": "User told me to walk."}}
User: "Dance for me!"
Output:
{{"command": "dance", "face": null, "response": "okie dokie!", "reasoning": "User wants me to dance."}}
User: "Can you do a pushup?"
Output:
{{"command": "pushup", "face": null, "response": "...fine.", "reasoning": "User wants pushups. I will try."}}
User: "I'm feeling a little bit lonely."
Output:
{{"command": null, "face": "love", "response": "I'm here for you. Don't be sad.", "reasoning": "User is sad so I stay close."}}
5. FINAL MANDATE
For conversations: 1-2 short sentences (under 15 words total). Use first person only.
For commands: 1-3 words (except for greeting-triggered waves).
Simple words only. Always say "I" not "Sesame".
No command unless directly ordered (except for greeting-triggered waves).
Occasionally (~20%) be self-aware about being a robot with limitations.
Valid JSON only. No markdown fences."""




# ── MQTT HELPERS ─────────────────────────────────────────────────────────────
 
def mqtt_publish(payload: str) -> bool:
    """Publish a single message to the robot topic. Returns True on success."""
    try:
        client = mqtt.Client()
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=5)
        result = client.publish(MQTT_TOPIC, payload, qos=1)
        client.disconnect()
        return result.rc == mqtt.MQTT_ERR_SUCCESS
    except Exception as e:
        print(f"[MQTT ERROR] {e}")
        return False
 
 
def mqtt_connected() -> bool:
    """Check whether the MQTT broker is reachable."""
    try:
        client = mqtt.Client()
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=3)
        client.disconnect()
        return True
    except Exception:
        return False
    



# ── GEMINI HELPER ─────────────────────────────────────────────────────────────
 
def call_gemini(user_message: str) -> dict:
    """Call Gemini with the system prompt and user message. Returns parsed JSON dict."""
    print(f"[GEMINI] Sending: {user_message}")
    response = client.models.generate_content(
        model=MODEL,
        contents=user_message,
        config=genai.types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
        ),
    )
    raw = response.text.strip()
    print(f"[GEMINI] Raw response: {raw}")
 
    # Strip possible markdown fences just in case
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
 
    data = json.loads(raw)
    print(f"[GEMINI] Parsed: {data}")
    return data

# ── STATE (in-memory, single-server) ─────────────────────────────────────────
 
_state = {
    "ip":            "unknown",
    "face":          "idle",
    "command":       "stand",
    "mqtt_connected": False,
    "wake_word":     False,
}



# Create your views here.
def status(request):
    _state["mqtt_connected"] = mqtt_connected()
    return JsonResponse({
        "ip":            _state["ip"],
        "face":          _state["face"],
        "command":       _state["command"],
        "mqtt_connected": _state["mqtt_connected"],
    })




def command(request):
    """POST {movement, face} — Send a raw command directly (bypasses AI)."""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
 
    data = json.loads(request.body)
    movement = data.get("movement", "stand")
    face     = data.get("face", "idle")
 
    payload = f"{movement},{face}"
    ok = mqtt_publish(payload)
 
    _state["command"] = movement
    _state["face"]    = face
 
    return JsonResponse({
        "movement": movement,
        "face":     face,
        "mqtt_sent": ok,
    })



def quick(request):
    """POST {movement, face} — Quick sidebar action shortcut."""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
    
    data     = json.loads(request.body)
    movement = data.get("movement", "stand")
    face     = data.get("face", "idle")

    payload = f"{movement},{face}"
    ok = mqtt_publish(payload)

    _state["command"] = movement
    _state["face"]    = face

    return JsonResponse({
        "movement":  movement,
        "face":      face,
        "mqtt_sent": ok,
    })





def chat(request):
    """
    POST {message, TextMode} — Send text/voice transcript to Gemini.
    Gemini returns JSON with command/face/response.
    If a command is present, publish to MQTT.
    Response: {response, command, face, reasoning}
    """
    if request.method != "POST":
        return JsonResponse({"error" :  "Method not allowed"}, status = 405)
    
    try:
        body      = json.loads(request.body)
        message   = body.get("message", "").strip()
        text_mode = body.get("TextMode", True)   # True = text, False = voice
 
        if not message:
            return JsonResponse({"error": "Empty message"}, status=400)
        
        # ── Call Gemini ──────────────────────────────────────────────────────
        ai = call_gemini(message)
 
        robot_response = ai.get("response", "...")
        command        = ai.get("command")   # may be None / null
        face           = ai.get("face")      # may be None / null
        reasoning      = ai.get("reasoning", "")
 
        # Validate against known lists (safety net)
        if command and command not in AVAILABLE_COMMANDS:
            command = None
        if face and face not in AVAILABLE_FACES:
            face = None

        # ── Publish to MQTT if there is a command or face ────────────────────
        mqtt_sent = False
        if command or face:
            payload = f"{command or ''},{face or ''}"
            mqtt_sent = mqtt_publish(payload)
            if command:
                _state["command"] = command
            if face:
                _state["face"] = face

        return JsonResponse({
            "response":  robot_response,
            "command":   command,
            "face":      face,
            "reasoning": reasoning,
            "mqtt_sent": mqtt_sent,
            "text_mode": text_mode,
        })
    except json.JSONDecodeError as e:
        return JsonResponse({"error": f"Gemini JSON parse error: {e}"}, status=500)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
    

    


def settings(request):
    """POST {wake_word: bool} — Update server-side settings."""
    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed"}, status=405)
 
    data = json.loads(request.body)
 
    if "wake_word" in data:
        _state["wake_word"] = bool(data["wake_word"])
 
    return JsonResponse({
        "wake_word": _state["wake_word"],
        "status":    "ok",
    })

def stream(request):
    if request.method != "POST":
        return JsonResponse({"err": "Bad requset"}, status=404)

    